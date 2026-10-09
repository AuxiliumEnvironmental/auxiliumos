import Foundation
import SpatialCore
import SpatialInterop

/// Local-only transactional repository. No networking, identity grants, or release operation.
/// Separate instances/processes coordinate through SQLite BEGIN IMMEDIATE and revision checks.
public actor SpatialStore {
    private let archive: ArtifactArchive
    private let database: SQLiteConnection
    private let limits: StoreLimits
    private let fault: @Sendable (CommitBoundary) throws -> Void
    private let access: LocalAccessGate
    private var protectedDataAvailable: Bool

    public init(root: URL, protectedDataAvailable: Bool = true, limits: StoreLimits = .init(),
                accessConfiguration: StoreAccessConfiguration = .localDeviceOnly,
                accessClock: @escaping @Sendable () -> Date = { Date() },
                faultInjector: @escaping @Sendable (CommitBoundary) throws -> Void = { _ in }) throws {
        guard protectedDataAvailable else { throw StoreError.protectedDataUnavailable }
        self.protectedDataAvailable = protectedDataAvailable
        self.limits = limits
        self.fault = faultInjector
        archive = try ArtifactArchive(root: root)
        database = try SQLiteConnection(url: archive.databaseURL)
        access = try LocalAccessGate(database: database, configuration: accessConfiguration, clock: accessClock)
        try archive.protectDatabaseFiles()
    }

    /// The iOS shell supplies UIApplication protected-data notifications and locks its UI.
    /// This gate never substitutes for NSFileProtectionComplete on disk.
    public func setProtectedDataAvailable(_ available: Bool) { protectedDataAvailable = available }

    /// Managed sign-out/revocation locks every store instance through the durable binding.
    /// It does not erase unsynced captures or imply a remote wipe.
    public func suspendManagedAccess() throws {
        guard protectedDataAvailable else { throw StoreError.protectedDataUnavailable }
        try archive.protectDatabaseFiles(); try access.suspend()
    }
    public func resumeManagedAccess() throws {
        guard protectedDataAvailable else { throw StoreError.protectedDataUnavailable }
        try archive.protectDatabaseFiles(); try access.resume()
    }

    public func listDrafts() throws -> [DraftSummary] {
        try requireAvailable()
        return try database.rows("SELECT document_id,title,current_revision,undo_history,redo_history,updated_at FROM drafts ORDER BY updated_at DESC,document_id").map {
            let state = try draftState($0)
            return DraftSummary(documentID: $0.text(0), title: $0.text(1), revision: state.revision,
                                updatedAt: Date(timeIntervalSince1970: $0.real(5)),
                                canUndo: !state.undo.isEmpty, canRedo: !state.redo.isEmpty)
        }
    }

    public func open(documentID: String) throws -> SpatialDocument {
        try requireAvailable(); try requireID(documentID)
        return try readRevision(documentID: documentID, revision: current(documentID).revision)
    }

    public func create(_ document: SpatialDocument) throws -> SaveReceipt {
        try requireAvailable(.edit); try Validator.requireValid(document)
        guard document.revision == 1, document.parentRevision == nil else { throw StoreError.invalidRevision }
        guard try draftRow(document.documentID) == nil else { throw StoreError.alreadyExists }
        return try commit(document, expectedRevision: nil, undo: [], redo: [], command: "create")
    }

    public func save(_ document: SpatialDocument, expectedRevision: Int, command: String = "edit", receipt: EditReceipt? = nil) throws -> SaveReceipt {
        try requireAvailable(.edit); try Validator.requireValid(document)
        let state = try checkedCurrent(document.documentID, expected: expectedRevision)
        guard document.revision == expectedRevision + 1, document.parentRevision == expectedRevision,
              document.reviewState == .needsReview else { throw StoreError.invalidRevision }
        guard !command.isEmpty, command.utf8.count <= 128,
              command.unicodeScalars.allSatisfy({ $0.value >= 32 && $0.value < 127 }) else { throw StoreError.invalidIdentifier }
        let undo = Array((state.undo + [state.revision]).suffix(limits.undoDepth))
        let source = try readRevision(documentID: document.documentID, revision: expectedRevision)
        let lineage = receipt ?? EditReceipt.restoring(from: source, to: document)
        return try commit(document, expectedRevision: expectedRevision, undo: undo, redo: [], command: command, receipt: lineage)
    }

    public func undo(documentID: String, expectedRevision: Int) throws -> SpatialDocument {
        try requireAvailable(.edit); try requireID(documentID)
        let state = try checkedCurrent(documentID, expected: expectedRevision)
        guard let previous = state.undo.last else { throw StoreError.nothingToUndo }
        var next = try readRevision(documentID: documentID, revision: previous)
        try advance(&next, from: expectedRevision)
        let source = try readRevision(documentID: documentID, revision: expectedRevision)
        _ = try commit(next, expectedRevision: expectedRevision, undo: Array(state.undo.dropLast()),
                       redo: Array((state.redo + [state.revision]).suffix(limits.undoDepth)), command: "undo",
                       receipt: .restoring(from: source, to: next))
        return next
    }

    public func redo(documentID: String, expectedRevision: Int) throws -> SpatialDocument {
        try requireAvailable(.edit); try requireID(documentID)
        let state = try checkedCurrent(documentID, expected: expectedRevision)
        guard let target = state.redo.last else { throw StoreError.nothingToRedo }
        var next = try readRevision(documentID: documentID, revision: target)
        try advance(&next, from: expectedRevision)
        let source = try readRevision(documentID: documentID, revision: expectedRevision)
        _ = try commit(next, expectedRevision: expectedRevision,
                       undo: Array((state.undo + [state.revision]).suffix(limits.undoDepth)),
                       redo: Array(state.redo.dropLast()), command: "redo", receipt: .restoring(from: source, to: next))
        return next
    }

    public func archiveCapture(_ data: Data, sourceID: String, kind: CaptureArtifactKind) throws -> CaptureArchiveReceipt {
        try requireAvailable(.edit); try requireID(sourceID)
        guard !data.isEmpty, data.count <= limits.captureBytes else { throw StoreError.sizeLimit }
        let digest = ArtifactDigest.sha256(data)
        if let existing = try captureArtifact(sourceID, kind) {
            guard existing.digest == digest, existing.byteCount == data.count else { throw StoreError.captureIdentityConflict }
            _ = try archive.read(existing, limit: limits.captureBytes)
            return captureReceipt(sourceID, kind, existing)
        }
        let artifact = try archive.stage(data, kind: kind.rawValue, limit: limits.captureBytes, captureSourceID: sourceID, fault: fault)
        let saved = try database.transaction {
            // Another writer may have archived this source between staging and the lock.
            if let existing = try captureArtifact(sourceID, kind) {
                guard existing.digest == digest, existing.byteCount == data.count else { throw StoreError.captureIdentityConflict }
                _ = try archive.read(existing, limit: limits.captureBytes)
                return existing
            }
            try insert(artifact)
            try database.execute("INSERT INTO captures(source_id,kind,artifact_id) VALUES(?,?,?)",
                                 [.text(sourceID), .text(kind.rawValue), .text(artifact.id)])
            try fault(.beforeDatabaseCommit)
            return artifact
        }
        try fault(.databaseCommitted)
        try archive.finishCaptureIntent(artifact.id)
        return captureReceipt(sourceID, kind, saved)
    }

    public func listCaptureArtifacts() throws -> [CaptureArchiveReceipt] {
        try requireAvailable()
        return try database.rows("SELECT a.id,a.filename,a.digest,a.byte_count,a.kind,c.source_id,c.kind FROM captures c JOIN artifacts a ON c.artifact_id=a.id ORDER BY c.source_id,c.kind").map { row in
            guard let kind = CaptureArtifactKind(rawValue: row.text(6)), Validator.validID(row.text(5)) else { throw StoreError.corruptArtifact }
            return captureReceipt(row.text(5), kind, try StoredArtifact(row: row))
        }
    }

    public func readCapture(sourceID: String, kind: CaptureArtifactKind) throws -> Data {
        try requireAvailable(); try requireID(sourceID)
        guard let artifact = try captureArtifact(sourceID, kind) else { throw StoreError.notFound }
        return try archive.read(artifact, limit: limits.captureBytes)
    }

    public func recoverableCaptures() throws -> [RecoverableCapture] {
        try requireAvailable()
        let referenced = Set(try database.rows("SELECT filename FROM artifacts").map { $0.text(0) })
        return try archive.recoverableCaptures(limit: limits.captureBytes, referenced: referenced)
    }

    /// Explicitly register verified retained capture bytes. This neither normalizes
    /// them nor marks a draft saved. A source conflict leaves all bytes untouched.
    public func recoverCapture(artifactID: String) throws -> CaptureArchiveReceipt {
        try requireAvailable(.edit)
        guard UUID(uuidString: artifactID) != nil else { throw StoreError.invalidIdentifier }
        if let row = try database.rows("SELECT a.id,a.filename,a.digest,a.byte_count,a.kind,c.source_id,c.kind FROM captures c JOIN artifacts a ON c.artifact_id=a.id WHERE a.id=?", [.text(artifactID)]).first {
            guard let kind = CaptureArtifactKind(rawValue: row.text(6)) else { throw StoreError.corruptArtifact }
            let artifact = try StoredArtifact(row: row)
            _ = try archive.read(artifact, limit: limits.captureBytes)
            try archive.finishCaptureIntent(artifactID)
            return captureReceipt(row.text(5), kind, artifact)
        }
        let (candidate, artifact) = try archive.recoverCapture(artifactID, limit: limits.captureBytes)
        let saved = try database.transaction {
            if let existing = try captureArtifact(candidate.sourceID, candidate.kind) {
                guard existing.digest == candidate.sha256, existing.byteCount == candidate.byteCount else { throw StoreError.captureIdentityConflict }
                _ = try archive.read(existing, limit: limits.captureBytes)
                return existing
            }
            try insert(artifact)
            try database.execute("INSERT INTO captures(source_id,kind,artifact_id) VALUES(?,?,?)",
                                 [.text(candidate.sourceID), .text(candidate.kind.rawValue), .text(artifact.id)])
            try fault(.beforeDatabaseCommit)
            return artifact
        }
        try fault(.databaseCommitted)
        // Same-identity/same-bytes reconciliation is complete even if another
        // artifact won the transaction. Retain duplicate bytes, clear its intent.
        try archive.finishCaptureIntent(artifact.id)
        return captureReceipt(candidate.sourceID, candidate.kind, saved)
    }

    /// Freeze a caller-selected SAVED revision locally. Viewing does not invoke this method.
    /// Freezing does not authorize export, queue delivery, authenticate a user, or release a report.
    public func freeze(documentID: String, revision: Int) throws -> FrozenRevision {
        try requireAvailable(.export); try requireID(documentID)
        guard revision > 0 else { throw StoreError.invalidRevision }
        let artifact = try revisionArtifact(documentID, revision)
        _ = try readRevision(documentID: documentID, revision: revision)
        let frozen = try database.transaction {
            // Cleanup may have retired an old revision between the initial read and
            // acquiring this write lock. Never create a frozen reference to retired bytes.
            _ = try revisionArtifact(documentID, revision)
            if let existing = try frozenRow(documentID, revision) { return existing }
            let id = UUID().uuidString.lowercased(), date = Date().timeIntervalSince1970
            try database.execute("INSERT INTO frozen_revisions(id,document_id,revision,frozen_at) VALUES(?,?,?,?)",
                                 [.text(id), .text(documentID), .integer(revision), .real(date)])
            try fault(.beforeDatabaseCommit)
            return SQLRow(values: [.text(id), .real(date)])
        }
        try fault(.databaseCommitted)
        return .init(snapshotID: frozen.text(0), documentID: documentID, revision: revision,
                     sha256: artifact.digest, byteCount: artifact.byteCount,
                     frozenAt: Date(timeIntervalSince1970: frozen.real(1)))
    }

    public func readFrozen(snapshotID: String) throws -> Data {
        try requireAvailable(.export); try requireID(snapshotID)
        guard let row = try database.rows("SELECT document_id,revision FROM frozen_revisions WHERE id=?", [.text(snapshotID)]).first else { throw StoreError.notFound }
        let artifact = try revisionArtifact(row.text(0), row.int(1))
        let bytes = try archive.read(artifact, limit: limits.geometryBytes)
        let document = try SpatialDocumentReader.decode(bytes, maximumBytes: limits.geometryBytes)
        guard document.documentID == row.text(0), document.revision == row.int(1) else { throw StoreError.corruptArtifact }
        return bytes
    }

    public func editReceipt(documentID: String, revision: Int) throws -> EditReceipt? {
        try requireAvailable(); try requireID(documentID)
        guard revision > 0 else { throw StoreError.invalidRevision }
        guard let row = try database.rows("SELECT receipt FROM edit_receipts WHERE document_id=? AND revision=?", [.text(documentID), .integer(revision)]).first else { return nil }
        let receipt = try JSONDecoder().decode(EditReceipt.self, from: row.blob(0))
        guard receipt.resultingRevision == revision else { throw StoreError.corruptArtifact }
        return receipt
    }

    /// Staged/orphaned content is retained. It is never silently attached or called saved.
    public func recoveryArtifacts() throws -> [RecoveryArtifact] {
        try requireAvailable()
        let filenames = Set(try database.rows("SELECT filename FROM artifacts").map { $0.text(0) })
        return try archive.recovery(referenced: filenames)
    }

    public func recoverableDrafts() throws -> [RecoverableDraft] {
        try requireAvailable()
        let filenames = Set(try database.rows("SELECT filename FROM artifacts").map { $0.text(0) })
        return try archive.recoverableGeometry(referenced: filenames, limit: limits.geometryBytes)
    }
    /// Explicitly recovers an unacknowledged edit as a NEW review-required local document.
    /// Existing work and original source bytes remain immutable and independently recoverable.
    public func recoverDraftCopy(artifactID: String, newDocumentID: String) throws -> SpatialDocument {
        try requireAvailable(.edit); try requireID(newDocumentID)
        guard UUID(uuidString: artifactID) != nil else { throw StoreError.invalidIdentifier }
        if let row = try database.rows("SELECT new_document_id FROM recovered_drafts WHERE original_artifact_id=?", [.text(artifactID)]).first {
            guard row.text(0) == newDocumentID else { throw StoreError.alreadyExists }
            return try readRevision(documentID: newDocumentID, revision: current(newDocumentID).revision)
        }
        guard try database.rows("SELECT id FROM artifacts WHERE id=?", [.text(artifactID)]).isEmpty else { throw StoreError.alreadyExists }
        guard try draftRow(newDocumentID) == nil else { throw StoreError.alreadyExists }
        let (candidate, source, original) = try archive.recoverGeometry(artifactID, limit: limits.geometryBytes)
        var document = source
        document.documentID = newDocumentID; document.revision = 1; document.parentRevision = nil; document.reviewState = .needsReview
        try Validator.requireValid(document)
        _ = try commit(document, expectedRevision: nil, undo: [], redo: [], command: "recover-copy",
                       recovery: .init(candidate: candidate, artifact: original))
        return document
    }
    public func recoveredDraftSource(documentID: String) throws -> RecoveredDraftSource? {
        try requireAvailable(); try requireID(documentID)
        guard let row = try database.rows("SELECT a.id,a.filename,a.digest,a.byte_count,a.kind,r.source_document_id,r.source_revision FROM recovered_drafts r JOIN artifacts a ON r.original_artifact_id=a.id WHERE r.new_document_id=?", [.text(documentID)]).first else { return nil }
        let artifact = try StoredArtifact(row: row)
        guard artifact.kind == "recoveredGeometry", Validator.validID(row.text(5)), row.int(6) > 0 else { throw StoreError.corruptArtifact }
        let bytes = try archive.read(artifact, limit: limits.geometryBytes)
        let source = try SpatialDocumentReader.decode(bytes, maximumBytes: limits.geometryBytes)
        guard source.documentID == row.text(5), source.revision == row.int(6) else { throw StoreError.corruptArtifact }
        return .init(artifactID: artifact.id, originalDocumentID: row.text(5), originalRevision: row.int(6),
            sha256: artifact.digest, byteCount: artifact.byteCount, recoveredDocumentID: documentID)
    }
    /// Nondestructive retention inventory. There is intentionally no automatic eviction of
    /// raw captures, immutable history, uncertain deliveries, or recovery candidates.
    public func storageInventory() throws -> StorageInventory {
        try requireAvailable()
        let totals = try database.rows("SELECT a.kind,SUM(a.byte_count) FROM artifacts a WHERE NOT EXISTS(SELECT 1 FROM history_retirements h WHERE h.artifact_id=a.id AND h.state='removed') GROUP BY a.kind")
        let sizes = Dictionary(uniqueKeysWithValues: totals.map { ($0.text(0), $0.int(1)) })
        let captures = CaptureArtifactKind.allCasesForRetention.reduce(0) { $0 + (sizes[$1.rawValue] ?? 0) }
        func count(_ query: String) throws -> Int { try database.rows(query).first?.int(0) ?? 0 }
        let pending = try listPublications().filter { ![.delivered, .cancelledLocally].contains($0.state) }.count
        return .init(draftCount: try count("SELECT count(*) FROM drafts"), revisionCount: try count("SELECT count(*) FROM revisions"),
            frozenSnapshotCount: try count("SELECT count(*) FROM frozen_revisions"), pendingPublicationCount: pending,
            captureBytes: captures, geometryBytes: sizes["geometry"] ?? 0, publicationBytes: sizes["publicationExchange"] ?? 0,
            recoveredSourceBytes: sizes["recoveredGeometry"] ?? 0, retainedOrphanCount: try recoveryArtifacts().count,
            undoHistoryLimit: limits.undoDepth, reclaimableCacheBytes: 0,
            retiredHistoryCount: try count("SELECT count(*) FROM history_retirements"),
            pendingHistoryCleanupBytes: try count("SELECT COALESCE(SUM(a.byte_count),0) FROM history_retirements h JOIN artifacts a ON h.artifact_id=a.id WHERE h.state='pending'"))
    }

    private struct DraftState { let revision: Int; let undo: [Int]; let redo: [Int] }
    private func draftState(_ row: SQLRow) throws -> DraftState {
        let undo = try JSONDecoder().decode([Int].self, from: row.blob(3))
        let redo = try JSONDecoder().decode([Int].self, from: row.blob(4))
        let revision = row.int(2)
        guard revision > 0, revision <= 9_007_199_254_740_991,
              undo.count <= 100, redo.count <= 100,
              (undo + redo).allSatisfy({ $0 > 0 && $0 < revision }) else { throw StoreError.corruptArtifact }
        return DraftState(revision: revision, undo: undo, redo: redo)
    }
    private func draftRow(_ documentID: String) throws -> SQLRow? {
        try database.rows("SELECT document_id,title,current_revision,undo_history,redo_history,updated_at FROM drafts WHERE document_id=?", [.text(documentID)]).first
    }
    private func current(_ documentID: String) throws -> DraftState {
        guard let row = try draftRow(documentID) else { throw StoreError.notFound }
        return try draftState(row)
    }
    private func checkedCurrent(_ documentID: String, expected: Int) throws -> DraftState {
        try requireID(documentID)
        let state = try current(documentID)
        guard state.revision == expected else { throw StoreError.staleRevision(expected: expected, actual: state.revision) }
        return state
    }
    private func advance(_ document: inout SpatialDocument, from revision: Int) throws {
        guard revision < 9_007_199_254_740_991 else { throw StoreError.invalidRevision }
        document.revision = revision + 1; document.parentRevision = revision; document.reviewState = .needsReview
        try Validator.requireValid(document)
    }
    private struct DraftRecoveryInput { let candidate: RecoverableDraft; let artifact: StoredArtifact }
    private func commit(_ document: SpatialDocument, expectedRevision: Int?, undo: [Int], redo: [Int], command: String, receipt: EditReceipt? = nil,
                        recovery: DraftRecoveryInput? = nil) throws -> SaveReceipt {
        let receiptBytes: Data?
        if let receipt {
            guard receipt.sourceRevision == expectedRevision, receipt.resultingRevision == document.revision,
                  receipt.mappings.count <= 100000 else { throw StoreError.invalidRevision }
            for mapping in receipt.mappings {
                guard Validator.validID(mapping.floorID), Validator.validID(mapping.sourceID),
                      ["node","wall","opening","room","floor","area"].contains(mapping.objectKind),
                      mapping.resultingIDs.count <= 100000, mapping.resultingIDs.allSatisfy(Validator.validID),
                      mapping.requiresOverlayReview else { throw StoreError.invalidIdentifier }
            }
            let bytes = try JSONEncoder().encode(receipt)
            guard bytes.count <= 1024 * 1024 else { throw StoreError.sizeLimit }
            receiptBytes = bytes
        } else { receiptBytes = nil }
        let data = try document.encoded()
        // Apply the same bounded reader to writes and reads; no invalid local artifact is acknowledged.
        _ = try SpatialDocumentReader.decode(data, maximumBytes: limits.geometryBytes)
        let artifact = try archive.stage(data, kind: "geometry", limit: limits.geometryBytes, fault: fault)
        let date = Date()
        try database.transaction {
            if let expectedRevision { _ = try checkedCurrent(document.documentID, expected: expectedRevision) }
            else if try draftRow(document.documentID) != nil { throw StoreError.alreadyExists }
            try insert(artifact)
            try database.execute("INSERT INTO revisions(document_id,revision,artifact_id,command,created_at) VALUES(?,?,?,?,?)",
                                 [.text(document.documentID), .integer(document.revision), .text(artifact.id), .text(command), .real(date.timeIntervalSince1970)])
            if let receiptBytes {
                try database.execute("INSERT INTO edit_receipts(document_id,revision,receipt) VALUES(?,?,?)",
                                     [.text(document.documentID), .integer(document.revision), .blob(receiptBytes)])
            }
            let history: [SQLValue] = [.text(document.title), .integer(document.revision),
                                       .blob(try JSONEncoder().encode(undo)), .blob(try JSONEncoder().encode(redo)),
                                       .real(date.timeIntervalSince1970), .text(document.documentID)]
            if expectedRevision == nil {
                try database.execute("INSERT INTO drafts(title,current_revision,undo_history,redo_history,updated_at,document_id) VALUES(?,?,?,?,?,?)", history)
            } else {
                try database.execute("UPDATE drafts SET title=?,current_revision=?,undo_history=?,redo_history=?,updated_at=? WHERE document_id=?", history)
            }
            if let recovery {
                try insert(recovery.artifact)
                try database.execute("INSERT INTO recovered_drafts(original_artifact_id,new_document_id,source_document_id,source_revision) VALUES(?,?,?,?)",
                    [.text(recovery.artifact.id), .text(document.documentID), .text(recovery.candidate.originalDocumentID), .integer(recovery.candidate.originalRevision)])
            }
            try fault(.beforeDatabaseCommit)
        }
        try fault(.databaseCommitted)
        return .init(documentID: document.documentID, revision: document.revision, sha256: artifact.digest,
                     byteCount: artifact.byteCount, savedAt: date)
    }
    private func readRevision(documentID: String, revision: Int) throws -> SpatialDocument {
        let artifact = try revisionArtifact(documentID, revision)
        let bytes = try archive.read(artifact, limit: limits.geometryBytes)
        let document = try SpatialDocumentReader.decode(bytes, maximumBytes: limits.geometryBytes)
        guard document.documentID == documentID, document.revision == revision else { throw StoreError.corruptArtifact }
        return document
    }
    private func revisionArtifact(_ documentID: String, _ revision: Int) throws -> StoredArtifact {
        guard try database.rows("SELECT artifact_id FROM history_retirements WHERE document_id=? AND revision=?", [.text(documentID), .integer(revision)]).isEmpty else { throw StoreError.revisionRetired }
        guard let row = try database.rows("SELECT a.id,a.filename,a.digest,a.byte_count,a.kind FROM revisions r JOIN artifacts a ON r.artifact_id=a.id WHERE r.document_id=? AND r.revision=?", [.text(documentID), .integer(revision)]).first else { throw StoreError.notFound }
        let artifact = try StoredArtifact(row: row)
        guard artifact.kind == "geometry" else { throw StoreError.corruptArtifact }
        return artifact
    }
    private func captureArtifact(_ source: String, _ kind: CaptureArtifactKind) throws -> StoredArtifact? {
        guard let row = try database.rows("SELECT a.id,a.filename,a.digest,a.byte_count,a.kind FROM captures c JOIN artifacts a ON c.artifact_id=a.id WHERE c.source_id=? AND c.kind=?", [.text(source), .text(kind.rawValue)]).first else { return nil }
        let artifact = try StoredArtifact(row: row)
        guard artifact.kind == kind.rawValue else { throw StoreError.corruptArtifact }
        return artifact
    }
    private func frozenRow(_ documentID: String, _ revision: Int) throws -> SQLRow? {
        try database.rows("SELECT id,frozen_at FROM frozen_revisions WHERE document_id=? AND revision=?", [.text(documentID), .integer(revision)]).first
    }
    private func captureReceipt(_ source: String, _ kind: CaptureArtifactKind, _ artifact: StoredArtifact) -> CaptureArchiveReceipt {
        .init(sourceID: source, kind: kind, sha256: artifact.digest, byteCount: artifact.byteCount)
    }
    private func insert(_ artifact: StoredArtifact) throws {
        try database.execute("INSERT INTO artifacts(id,filename,digest,byte_count,kind) VALUES(?,?,?,?,?)", artifact.bindings)
    }
    private func requireAvailable(_ operation: LocalStoreOperation = .read) throws {
        guard protectedDataAvailable else { throw StoreError.protectedDataUnavailable }
        try archive.protectDatabaseFiles()
        try access.require(operation)
    }
    private func requireID(_ value: String) throws {
        guard Validator.validID(value) else { throw StoreError.invalidIdentifier }
    }
}

extension SpatialStore {
    /// Explicit local delivery intent. Viewing/freezing alone never queues private content.
    /// Export is created from the persisted selected snapshot, not the current mutable draft.
    public func enqueuePublication(snapshotID: String, destination: PublicationDestination,
                                   expectedPublishedRevision: Int?, clientRequestID: String) throws -> PublicationSummary {
        try requireAvailable(.delivery); try requireID(snapshotID); try requireID(clientRequestID)
        let bytes = try readFrozen(snapshotID: snapshotID)
        let document = try SpatialDocumentReader.decode(bytes, maximumBytes: limits.geometryBytes)
        guard let floor = document.floors.first else { throw PublicationError.invalidSnapshot }
        let exchange = try ExchangeExporter.export(document: document, floorID: floor.id)
        let validated = try ExchangeImporter.importArchive(exchange.archiveData)
        guard validated.document == document, validated.manifestSHA256 == exchange.manifestDigest else { throw PublicationError.invalidBundle }
        let request = PublicationRequest(clientRequestID: clientRequestID, sourceDocumentID: document.documentID,
            sourceRevision: document.revision, localSnapshotSHA256: ArtifactDigest.sha256(bytes),
            manifestSHA256: exchange.manifestDigest, archiveSHA256: ArtifactDigest.sha256(exchange.archiveData),
            archiveByteCount: exchange.archiveData.count, destination: destination,
            expectedPublishedRevision: expectedPublishedRevision)
        try request.validate()
        if let existing = try outboxRecord(clientRequestID) {
            guard existing.summary.request == request, existing.summary.snapshotID == snapshotID else { throw PublicationError.identityConflict }
            _ = try publicationArchive(requestID: clientRequestID)
            return existing.summary
        }
        let artifact = try archive.stage(exchange.archiveData, kind: "publicationExchange", limit: SpatialImportLimits.totalBytes, fault: fault)
        let record = OutboxRecord(summary: PublicationSummary(request: request, snapshotID: snapshotID,
            state: .queued, attempts: 0, queuedAt: Date(), lastFailure: nil, receipt: nil),
            attemptID: "", leaseUntil: Date(timeIntervalSince1970: 0))
        let result = try database.transaction {
            if let existing = try outboxRecord(clientRequestID) {
                guard existing.summary.request == request, existing.summary.snapshotID == snapshotID else { throw PublicationError.identityConflict }
                return existing.summary
            }
            try insert(artifact)
            try database.execute("INSERT INTO publication_outbox(request_id,snapshot_id,artifact_id,record) VALUES(?,?,?,?)",
                                 [.text(clientRequestID), .text(snapshotID), .text(artifact.id), .blob(try encodeOutbox(record))])
            try fault(.beforeDatabaseCommit)
            return record.summary
        }
        try fault(.databaseCommitted)
        return result
    }

    public func listPublications() throws -> [PublicationSummary] {
        try requireAvailable()
        return try database.rows("SELECT record FROM publication_outbox ORDER BY request_id").map {
            try decodeOutbox($0.blob(0)).summary
        }
    }
    public func publication(requestID: String) throws -> PublicationSummary {
        try requireAvailable(); try requireID(requestID)
        guard let record = try outboxRecord(requestID) else { throw StoreError.notFound }
        return record.summary
    }
    /// Returns the same immutable bytes after edits, retries, and reopening. No export credentials.
    public func publicationArchive(requestID: String) throws -> Data {
        try requireAvailable(.export); try requireID(requestID)
        guard let record = try outboxRecord(requestID),
              let row = try database.rows("SELECT a.id,a.filename,a.digest,a.byte_count,a.kind FROM publication_outbox p JOIN artifacts a ON p.artifact_id=a.id WHERE p.request_id=?", [.text(requestID)]).first else { throw StoreError.notFound }
        let artifact = try StoredArtifact(row: row), request = record.summary.request
        guard artifact.kind == "publicationExchange", artifact.digest == request.archiveSHA256,
              artifact.byteCount == request.archiveByteCount else { throw PublicationError.corruptOutbox }
        let bytes = try archive.read(artifact, limit: SpatialImportLimits.totalBytes)
        let exchange = try ExchangeImporter.importArchive(bytes)
        let frozen = try readFrozen(snapshotID: record.summary.snapshotID)
        guard exchange.document.documentID == request.sourceDocumentID, exchange.document.revision == request.sourceRevision,
              exchange.manifestSHA256 == request.manifestSHA256,
              ArtifactDigest.sha256(frozen) == request.localSnapshotSHA256,
              exchange.document == (try SpatialDocumentReader.decode(frozen, maximumBytes: limits.geometryBytes)) else {
            throw PublicationError.corruptOutbox
        }
        return bytes
    }
    /// Explicit retry cannot retarget or silently update the chosen revision. Conflicts require
    /// a new intent with a caller-resolved expected destination revision.
    public func retryPublication(requestID: String) throws -> PublicationSummary {
        try requireAvailable(.delivery); try requireID(requestID)
        return try database.transaction {
            guard var record = try outboxRecord(requestID) else { throw StoreError.notFound }
            guard [.needsAuthentication, .denied, .retryableFailure].contains(record.summary.state) else { throw PublicationError.invalidTransition }
            record.summary.state = .queued; record.summary.lastFailure = nil
            record.attemptID = ""; record.leaseUntil = Date(timeIntervalSince1970: 0)
            try writeOutbox(record); return record.summary
        }
    }
    /// Stops LOCAL retries only. It cannot recall an uncertain or already accepted remote draft.
    /// An active lease cannot be cancelled under an operation that may still finalize.
    public func cancelPublication(requestID: String, now: Date = Date()) throws -> PublicationSummary {
        try requireAvailable(.delivery); try requireID(requestID); try publicationTime(now)
        return try database.transaction {
            guard var record = try outboxRecord(requestID) else { throw StoreError.notFound }
            guard record.summary.state != .delivered, record.summary.state != .cancelledLocally else { throw PublicationError.invalidTransition }
            guard record.attemptID.isEmpty || record.leaseUntil <= now else { throw PublicationError.busy }
            record.summary.state = .cancelledLocally; record.summary.lastFailure = nil
            record.attemptID = ""; record.leaseUntil = Date(timeIntervalSince1970: 0)
            try writeOutbox(record); return record.summary
        }
    }

    func beginPublication(requestID: String, now: Date, leaseSeconds: TimeInterval) throws -> PublicationAttempt? {
        try requireAvailable(.delivery); try requireID(requestID); try publicationTime(now)
        guard leaseSeconds.isFinite, (1...300).contains(leaseSeconds) else { throw PublicationError.invalidIdentity }
        // Validate actual immutable files before a DB state acknowledges an attempt.
        let bytes = try publicationArchive(requestID: requestID)
        return try database.transaction {
            guard var record = try outboxRecord(requestID) else { throw StoreError.notFound }
            if [.delivered, .cancelledLocally].contains(record.summary.state) { return nil }
            guard [.queued, .delivering, .awaitingReceipt].contains(record.summary.state) else { throw record.summary.lastFailure ?? PublicationError.invalidTransition }
            guard record.attemptID.isEmpty || record.leaseUntil <= now else { throw PublicationError.busy }
            guard record.summary.attempts < 100_000 else { throw PublicationError.attemptLimit }
            record.attemptID = UUID().uuidString.lowercased(); record.leaseUntil = now.addingTimeInterval(leaseSeconds)
            record.summary.attempts += 1; record.summary.state = .delivering; record.summary.lastFailure = nil
            try writeOutbox(record)
            return PublicationAttempt(id: record.attemptID, request: record.summary.request, archive: bytes)
        }
    }
    func renewPublication(_ attempt: PublicationAttempt, now: Date, leaseSeconds: TimeInterval) throws {
        try requireAvailable(.delivery); try publicationTime(now)
        guard leaseSeconds.isFinite, (1...300).contains(leaseSeconds) else { throw PublicationError.invalidIdentity }
        try database.transaction {
            var record = try activePublication(attempt, now: now)
            record.leaseUntil = now.addingTimeInterval(leaseSeconds); try writeOutbox(record)
        }
    }
    func endPublication(_ attempt: PublicationAttempt, now: Date, receipt: PublicationReceipt? = nil,
                        failure: PublicationError? = nil) throws -> PublicationSummary {
        try requireAvailable(.delivery); try publicationTime(now)
        return try database.transaction {
            var record = try activePublication(attempt, now: now)
            if let receipt {
                try receipt.validate(for: record.summary.request)
                record.summary.state = .delivered; record.summary.receipt = receipt; record.summary.lastFailure = nil
            } else if let failure {
                record.summary.lastFailure = failure
                switch failure {
                case .authenticationRequired: record.summary.state = .needsAuthentication
                case .authorityDenied, .invalidReceipt: record.summary.state = .denied
                case .revisionConflict, .identityConflict: record.summary.state = .conflict
                default: record.summary.state = .retryableFailure
                }
            } else { record.summary.state = .awaitingReceipt; record.summary.lastFailure = nil }
            record.attemptID = ""; record.leaseUntil = Date(timeIntervalSince1970: 0)
            try writeOutbox(record); return record.summary
        }
    }
    private func activePublication(_ attempt: PublicationAttempt, now: Date) throws -> OutboxRecord {
        guard let record = try outboxRecord(attempt.request.clientRequestID) else { throw StoreError.notFound }
        guard record.summary.request == attempt.request, record.attemptID == attempt.id,
              record.summary.state == .delivering else { throw PublicationError.cancelled }
        guard record.leaseUntil > now else { throw PublicationError.leaseExpired }
        return record
    }
    private func publicationTime(_ date: Date) throws {
        guard date.timeIntervalSince1970.isFinite else { throw PublicationError.invalidIdentity }
    }
    private func outboxRecord(_ requestID: String) throws -> OutboxRecord? {
        guard let row = try database.rows("SELECT record,snapshot_id FROM publication_outbox WHERE request_id=?", [.text(requestID)]).first else { return nil }
        let record = try decodeOutbox(row.blob(0))
        guard record.summary.request.clientRequestID == requestID, record.summary.snapshotID == row.text(1) else { throw PublicationError.corruptOutbox }
        return record
    }
    private func decodeOutbox(_ bytes: Data) throws -> OutboxRecord {
        guard !bytes.isEmpty, bytes.count <= 32768 else { throw PublicationError.corruptOutbox }
        var scanner = JSONSafetyScanner(bytes); try scanner.validate()
        let record: OutboxRecord
        do { record = try JSONDecoder().decode(OutboxRecord.self, from: bytes) }
        catch { throw PublicationError.corruptOutbox }
        try record.validate(); return record
    }
    private func encodeOutbox(_ record: OutboxRecord) throws -> Data {
        try record.validate()
        let bytes = try JSONEncoder().encode(record)
        guard bytes.count <= 32768 else { throw PublicationError.corruptOutbox }
        return bytes
    }
    private func writeOutbox(_ record: OutboxRecord) throws {
        try database.execute("UPDATE publication_outbox SET record=? WHERE request_id=?",
                             [.blob(try encodeOutbox(record)), .text(record.summary.request.clientRequestID)])
        try fault(.beforeDatabaseCommit)
    }
}

extension SpatialStore {
    /// Read-only proposal. No file or revision is retired until this exact preview is
    /// explicitly confirmed through applyHistoryCleanup. A changed source invalidates it.
    public func previewHistoryCleanup(documentID: String? = nil) throws -> HistoryCleanupPreview {
        try requireAvailable(.edit)
        if let documentID { try requireID(documentID) }
        return try database.transaction {
            try historyCleanupPlan(documentID: documentID).preview(operationID: UUID().uuidString.lowercased())
        }
    }

    /// Irreversible removal of only the displayed, old, unpinned geometry snapshots.
    /// Revisions/lineage remain as tombstones. Calling requires explicit user confirmation;
    /// routine save/open never invokes it. No raw/published/recovery/orphan data is swept.
    public func applyHistoryCleanup(_ preview: HistoryCleanupPreview) throws -> HistoryCleanupResult {
        try requireAvailable(.edit)
        guard UUID(uuidString: preview.operationID) != nil else { throw HistoryCleanupError.invalidPreview }
        if let documentID = preview.documentID { try requireID(documentID) }
        try database.transaction {
            if let existing = try database.rows("SELECT preview_digest FROM history_cleanup_operations WHERE id=?", [.text(preview.operationID)]).first {
                guard existing.text(0) == historyPreviewDigest(preview) else { throw HistoryCleanupError.invalidPreview }
                return
            }
            let fresh = try historyCleanupPlan(documentID: preview.documentID).preview(operationID: preview.operationID)
            guard fresh == preview else { throw HistoryCleanupError.stalePreview }
            try database.execute("INSERT INTO history_cleanup_operations(id,preview_digest,snapshot_count,byte_count,created_at) VALUES(?,?,?,?,?)",
                [.text(preview.operationID), .text(historyPreviewDigest(preview)), .integer(preview.snapshots.count),
                 .integer(preview.bytesToRemove), .real(Date().timeIntervalSince1970)])
            for snapshot in preview.snapshots {
                let artifact = try historyArtifact(snapshot.artifactID)
                try assertHistoryRemovable(snapshot, artifact: artifact)
                // Validate exact bytes BEFORE the atomic retirement. Missing/corrupt files
                // cannot be laundered into a successful cleanup acknowledgement.
                _ = try archive.read(artifact, limit: limits.geometryBytes)
                try database.execute("INSERT INTO history_retirements(artifact_id,document_id,revision,operation_id,state) VALUES(?,?,?,?,'pending')",
                    [.text(snapshot.artifactID), .text(snapshot.documentID), .integer(snapshot.revision), .text(preview.operationID)])
            }
            try fault(.historyBeforeMetadataCommit)
        }
        try fault(.historyMetadataCommitted)
        return try resumeHistoryCleanup(operationID: preview.operationID)
    }

    /// Only previously confirmed, durable operations appear here. Resuming cannot select
    /// additional revisions or widen the confirmed deletion scope.
    public func pendingHistoryCleanups() throws -> [HistoryCleanupResult] {
        try requireAvailable()
        return try database.rows("SELECT DISTINCT operation_id FROM history_retirements WHERE state='pending' ORDER BY operation_id").map {
            try historyCleanupResult($0.text(0))
        }
    }

    public func resumeHistoryCleanup(operationID: String) throws -> HistoryCleanupResult {
        try requireAvailable(.edit)
        guard UUID(uuidString: operationID) != nil else { throw HistoryCleanupError.invalidPreview }
        _ = try historyCleanupResult(operationID)
        let ids = try database.rows("SELECT artifact_id FROM history_retirements WHERE operation_id=? AND state='pending' ORDER BY document_id,revision", [.text(operationID)]).map { $0.text(0) }
        guard ids.count <= 100 else { throw HistoryCleanupError.invalidPreview }
        for id in ids {
            try requireAvailable(.edit)
            try database.transaction {
                guard let row = try database.rows("SELECT document_id,revision,state FROM history_retirements WHERE artifact_id=? AND operation_id=?", [.text(id), .text(operationID)]).first else { throw HistoryCleanupError.invalidPreview }
                if row.text(2) == "removed" { return }
                guard row.text(2) == "pending" else { throw HistoryCleanupError.invalidPreview }
                let artifact = try historyArtifact(id)
                let snapshot = HistorySnapshotIdentity(documentID: row.text(0), revision: row.int(1), artifactID: id,
                    sha256: artifact.digest, byteCount: artifact.byteCount)
                // Defend even against malformed local metadata or another store instance.
                // The write lock spans file unlink and acknowledgement, so no new reference
                // can be created in the gap. Freeze also rejects committed tombstones.
                try assertHistoryRemovable(snapshot, artifact: artifact)
                try archive.removeRetiredGeometry(artifact, limit: limits.geometryBytes)
                try fault(.historyFileRemoved)
                try database.execute("UPDATE history_retirements SET state='removed' WHERE artifact_id=? AND operation_id=?", [.text(id), .text(operationID)])
            }
            try fault(.historyRemovalRecorded)
        }
        return try historyCleanupResult(operationID)
    }

    private func historyCleanupPlan(documentID: String?) throws -> HistoryCleanupPlan {
        let scope = documentID ?? ""
        let drafts = try database.rows("SELECT document_id,title,current_revision,undo_history,redo_history,updated_at FROM drafts WHERE (?='' OR document_id=?) ORDER BY document_id", [.text(scope), .text(scope)])
        if documentID != nil && drafts.isEmpty { throw StoreError.notFound }
        var stateDrafts: [HistoryCleanupState.Draft] = []
        var protected: [String: Set<Int>] = [:]
        for row in drafts {
            let state = try draftState(row), id = row.text(0)
            stateDrafts.append(.init(documentID: id, revision: state.revision, undo: state.undo, redo: state.redo))
            protected[id] = Set([1, state.revision] + state.undo + state.redo)
        }
        let frozen = try database.rows("SELECT id,document_id,revision FROM frozen_revisions WHERE (?='' OR document_id=?) ORDER BY document_id,revision", [.text(scope), .text(scope)])
        let stateFrozen = frozen.map { HistoryCleanupState.Frozen(snapshotID: $0.text(0), documentID: $0.text(1), revision: $0.int(2)) }
        for row in frozen { protected[row.text(1), default: []].insert(row.int(2)) }
        let rows = try database.rows("SELECT r.document_id,r.revision,a.id,a.digest,a.byte_count,a.kind FROM revisions r JOIN artifacts a ON r.artifact_id=a.id WHERE (?='' OR r.document_id=?) AND NOT EXISTS(SELECT 1 FROM history_retirements h WHERE h.artifact_id=a.id) ORDER BY r.document_id,r.revision DESC", [.text(scope), .text(scope)])
        let revisions = rows.map { HistoryCleanupState.Revision(documentID: $0.text(0), revision: $0.int(1), artifactID: $0.text(2), sha256: $0.text(3), byteCount: $0.int(4)) }
        let state = HistoryCleanupState(drafts: stateDrafts, revisions: revisions, frozen: stateFrozen)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let fingerprint = ArtifactDigest.sha256(try encoder.encode(state))
        var unpinned: [String: Int] = [:], candidates: [HistorySnapshotIdentity] = []
        var inspectedBytes = 0
        for row in rows {
            let id = row.text(0), revision = row.int(1)
            guard protected[id] != nil, !protected[id, default: []].contains(revision) else { continue }
            unpinned[id, default: 0] += 1
            guard unpinned[id, default: 0] > 100 else { continue }
            let artifact = try historyArtifact(row.text(2))
            guard candidates.count < 100, inspectedBytes <= 256 * 1024 * 1024 - artifact.byteCount else { break }
            let snapshot = HistorySnapshotIdentity(documentID: id, revision: revision, artifactID: artifact.id,
                sha256: artifact.digest, byteCount: artifact.byteCount)
            try assertHistoryRemovable(snapshot, artifact: artifact)
            let bytes = try archive.read(artifact, limit: limits.geometryBytes)
            let document = try SpatialDocumentReader.decode(bytes, maximumBytes: limits.geometryBytes)
            guard document.documentID == id, document.revision == revision else { throw HistoryCleanupError.unsafeCandidate }
            inspectedBytes += bytes.count
            // Reviewed local content is retained conservatively even if never frozen.
            guard document.reviewState == .needsReview else { continue }
            candidates.append(snapshot)
        }
        return .init(documentID: documentID, snapshots: candidates, stateSHA256: fingerprint)
    }

    private func historyArtifact(_ id: String) throws -> StoredArtifact {
        guard UUID(uuidString: id) != nil,
              let row = try database.rows("SELECT id,filename,digest,byte_count,kind FROM artifacts WHERE id=?", [.text(id)]).first else { throw HistoryCleanupError.unsafeCandidate }
        let artifact = try StoredArtifact(row: row)
        guard artifact.kind == "geometry", artifact.byteCount > 0, artifact.byteCount <= limits.geometryBytes else { throw HistoryCleanupError.unsafeCandidate }
        return artifact
    }
    private func assertHistoryRemovable(_ snapshot: HistorySnapshotIdentity, artifact: StoredArtifact) throws {
        guard snapshot.artifactID == artifact.id, snapshot.sha256 == artifact.digest, snapshot.byteCount == artifact.byteCount,
              snapshot.revision > 1, Validator.validID(snapshot.documentID), artifact.kind == "geometry" else { throw HistoryCleanupError.unsafeCandidate }
        let state = try current(snapshot.documentID)
        guard snapshot.revision != state.revision, !(state.undo + state.redo).contains(snapshot.revision),
              try frozenRow(snapshot.documentID, snapshot.revision) == nil else { throw HistoryCleanupError.protectedSnapshot }
        let refs = try database.rows("SELECT document_id,revision FROM revisions WHERE artifact_id=?", [.text(artifact.id)])
        guard refs.count == 1, refs[0].text(0) == snapshot.documentID, refs[0].int(1) == snapshot.revision,
              try database.rows("SELECT source_id FROM captures WHERE artifact_id=?", [.text(artifact.id)]).isEmpty,
              try database.rows("SELECT request_id FROM publication_outbox WHERE artifact_id=?", [.text(artifact.id)]).isEmpty,
              try database.rows("SELECT new_document_id FROM recovered_drafts WHERE original_artifact_id=?", [.text(artifact.id)]).isEmpty else { throw HistoryCleanupError.protectedSnapshot }
    }
    private func historyPreviewDigest(_ preview: HistoryCleanupPreview) -> String {
        // This is an internal confirmation identity, not cross-language canonical JSON.
        let ids = preview.snapshots.map { "\($0.documentID):\($0.revision):\($0.artifactID):\($0.sha256):\($0.byteCount)" }.joined(separator: "|")
        return ArtifactDigest.sha256(Data("\(preview.operationID)|\(preview.documentID ?? "")|\(preview.stateSHA256)|\(preview.bytesToRemove)|\(ids)".utf8))
    }
    private func historyCleanupResult(_ operationID: String) throws -> HistoryCleanupResult {
        guard let operation = try database.rows("SELECT snapshot_count,byte_count FROM history_cleanup_operations WHERE id=?", [.text(operationID)]).first else { throw StoreError.notFound }
        guard (0...100).contains(operation.int(0)), (0...(256 * 1024 * 1024)).contains(operation.int(1)) else { throw HistoryCleanupError.invalidPreview }
        let rows = try database.rows("SELECT h.state,a.byte_count FROM history_retirements h JOIN artifacts a ON h.artifact_id=a.id WHERE h.operation_id=?", [.text(operationID)])
        guard rows.count == operation.int(0), rows.count <= 100,
              rows.allSatisfy({ ["pending", "removed"].contains($0.text(0)) && $0.int(1) > 0 && $0.int(1) <= limits.geometryBytes }) else { throw HistoryCleanupError.invalidPreview }
        var total = 0
        for row in rows {
            guard total <= 256 * 1024 * 1024 - row.int(1) else { throw HistoryCleanupError.invalidPreview }
            total += row.int(1)
        }
        guard total == operation.int(1) else { throw HistoryCleanupError.invalidPreview }
        let removed = rows.filter { $0.text(0) == "removed" }, pending = rows.filter { $0.text(0) == "pending" }
        return .init(operationID: operationID, retiredSnapshots: rows.count, removedSnapshots: removed.count,
            bytesRemoved: removed.reduce(0) { $0 + $1.int(1) }, pendingSnapshots: pending.count,
            pendingBytes: pending.reduce(0) { $0 + $1.int(1) })
    }
}
