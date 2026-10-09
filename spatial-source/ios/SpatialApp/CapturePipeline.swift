import Foundation
import RoomPlan
import CaptureKit
import SpatialCore
import SpatialPersistence

struct CaptureContext: Codable {
    let sourceID: String
    let frameID: String
    let title: String
    let capturedAt: Date
    let sdkVersion: String
    let warning: String?
    let cancelled: Bool
    // Optional so archives from the original independent-room build recover.
    let connection: ConnectedRoomContext?
    init(sourceID: String, frameID: String, title: String, capturedAt: Date, sdkVersion: String,
         warning: String?, cancelled: Bool, connection: ConnectedRoomContext? = nil) {
        self.sourceID = sourceID; self.frameID = frameID; self.title = title; self.capturedAt = capturedAt
        self.sdkVersion = sdkVersion; self.warning = warning; self.cancelled = cancelled; self.connection = connection
    }
}

private struct CaptureCompletion: Codable {
    let sourceID: String
    let documentID: String
    let revision: Int
    let sha256: String
    let reportSourceID: String?
}
private struct StructureSourceContext: Codable {
    let sourceIDs: [String]
    let frameID: String
    let normalizerVersion: String
}
struct CaptureResumeState {
    let document: SpatialDocument
    let rooms: [ConnectedRoomContext]
    let mapSourceID: String
}

/// Archives are immutable and independently recoverable if processing fails.
/// One room is durably retained before starting the next; RoomBuilder and
/// StructureBuilder are serialized and never run once per AR frame.
actor CapturePipeline {
    enum PipelineError: LocalizedError {
        case busy, incompatibleSpace, changedDraft
        var errorDescription: String? {
            switch self {
            case .busy: return "Another room is still being processed."
            case .incompatibleSpace: return "The retained scans do not prove a shared coordinate space. Recover this room separately."
            case .changedDraft: return "The saved layout changed after this room started. Its edits were preserved. Recover this room separately."
            }
        }
    }
    private let store: SpatialStore
    private var processing = false
    init(store: SpatialStore) { self.store = store }

    private func encode<T: Encodable>(_ value: T) throws -> Data {
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        return try encoder.encode(value)
    }
    func archive(raw: CapturedRoomData, sourceID: String, context: CaptureContext?) async throws {
        if let context { _ = try await store.archiveCapture(encode(context), sourceID: sourceID, kind: .captureMetadata) }
        _ = try await store.archiveCapture(encode(raw), sourceID: sourceID, kind: .roomPlanRaw)
    }
    func archiveWorldMap(_ data: Data, sourceID: String) async throws {
        _ = try await store.archiveCapture(data, sourceID: sourceID, kind: .worldMap)
    }
    func worldMap(sourceID: String) async throws -> Data { try await store.readCapture(sourceID: sourceID, kind: .worldMap) }

    /// Resuming an edited draft would rebuild over corrections. Refuse it; the
    /// operator can capture an independent segment instead. Saved source and
    /// existing edits are never changed by this read-only check.
    func resumeState(documentID: String) async throws -> CaptureResumeState {
        let document = try await store.open(documentID: documentID)
        let records = try await store.listCaptureArtifacts()
        var latest: CaptureCompletion?
        for record in records where record.kind == .captureMetadata && record.sourceID.hasPrefix("saved-") {
            let marker = try JSONDecoder().decode(CaptureCompletion.self,
                from: await store.readCapture(sourceID: record.sourceID, kind: .captureMetadata))
            if marker.documentID == documentID && marker.revision == document.revision { latest = marker }
        }
        guard let latest, ArtifactDigest.sha256(try document.encoded()) == latest.sha256,
              let context = try await readContext(sourceID: latest.sourceID), let connection = context.connection,
              connection.outputDocumentID == documentID, connection.alignment != .separate else { throw PipelineError.changedDraft }
        var rooms: [ConnectedRoomContext] = []
        for id in connection.previousSourceIDs + [connection.sourceID] {
            guard let context = try await readContext(sourceID: id), let room = context.connection,
                  !context.cancelled, context.warning == nil else { throw PipelineError.incompatibleSpace }
            rooms.append(room)
        }
        try CaptureCompatibility.validate(rooms)
        let maps = Set(records.filter { $0.kind == .worldMap }.map(\.sourceID))
        guard let mapSource = rooms.reversed().first(where: { maps.contains($0.sourceID) })?.sourceID else { throw PipelineError.incompatibleSpace }
        _ = try await worldMap(sourceID: mapSource) // Hash-validated local bytes must exist.
        return .init(document: document, rooms: rooms, mapSourceID: mapSource)
    }

    /// Used by the workspace: combined room sources are not mistaken for failed
    /// independent drafts. A completion marker proves a durable save, not scan
    /// quality, current connection, publication or physical-device acceptance.
    func unrecoveredSourceIDs() async throws -> [String] {
        let records = try await store.listCaptureArtifacts()
        let summaries = try await store.listDrafts()
        let drafts = Set(summaries.map(\.documentID))
        var result: [String] = []
        for source in Set(records.filter { $0.kind == .roomPlanRaw }.map(\.sourceID)).sorted() {
            if drafts.contains(source) { continue }
            if try await completion(sourceID: source) == nil { result.append(source) }
        }
        return result
    }

    /// Immutable capture observations up to the requested saved revision. These
    /// are historical observations, not proof that a later edit still has an
    /// unresolved defect. No capture report is rewritten after a correction.
    func reviewReports(documentID: String, revision: Int) async throws -> [NormalizationReport] {
        let records = try await store.listCaptureArtifacts()
        var sources: [(Int, String)] = []
        if records.contains(where: { $0.sourceID == documentID && $0.kind == .normalizationReport }) {
            sources.append((1, documentID))
        }
        for record in records where record.kind == .captureMetadata && record.sourceID.hasPrefix("saved-") {
            let marker = try JSONDecoder().decode(CaptureCompletion.self,
                from: await store.readCapture(sourceID: record.sourceID, kind: .captureMetadata))
            guard record.sourceID == "saved-" + marker.sourceID, marker.revision > 0 else { throw StoreError.corruptArtifact }
            if marker.documentID == documentID && marker.revision <= revision {
                sources.append((marker.revision, marker.reportSourceID ?? marker.sourceID))
            }
        }
        var seen = Set<String>(), reports: [NormalizationReport] = []
        for (_, source) in sources.sorted(by: { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }) where seen.insert(source).inserted {
            reports.append(try JSONDecoder().decode(NormalizationReport.self,
                from: await store.readCapture(sourceID: source, kind: .normalizationReport)))
        }
        return reports
    }

    func process(sourceID: String, title: String, separately: Bool = false) async throws -> SpatialDocument {
        guard !processing else { throw PipelineError.busy }
        processing = true; defer { processing = false }
        if let saved = try await completion(sourceID: sourceID) { return saved }
        let context = try await readContext(sourceID: sourceID)
        let connection = separately ? nil : context?.connection
        // Old versions used the capture ID directly as the independent draft ID.
        if connection == nil || connection?.alignment == .separate {
            do { return try await store.open(documentID: sourceID) } catch StoreError.notFound {}
        }
        let room = try await processedRoom(sourceID: sourceID)
        let isConnected = connection != nil && connection?.alignment != .separate
        var normalized: NormalizationResult
        let expectedRevision: Int
        if let connection, isConnected {
            let ids = connection.previousSourceIDs + [sourceID]
            var contexts: [ConnectedRoomContext] = [], rooms: [CapturedRoom] = []
            for id in ids {
                guard let archived = try await readContext(sourceID: id), let identity = archived.connection,
                      !archived.cancelled, archived.warning == nil,
                      archived.sourceID == identity.sourceID, archived.frameID == identity.frameID else { throw PipelineError.incompatibleSpace }
                contexts.append(identity)
                if id == sourceID { rooms.append(room) }
                else { rooms.append(try await processedRoom(sourceID: id)) }
            }
            do { try CaptureCompatibility.validate(contexts) } catch { throw PipelineError.incompatibleSpace }
            expectedRevision = connection.expectedRevision
            if expectedRevision == 0 {
                normalized = try SurfaceNormalizer.normalize(AppleSurfaceAdapter.capture(room: room,
                    documentID: connection.outputDocumentID, title: context?.title ?? title,
                    frameID: connection.frameID, sourceArchiveID: sourceID, sdkVersion: context?.sdkVersion ?? "unknown-sdk"))
            } else {
                let structureSourceID = "structure-" + sourceID
                let structure: CapturedStructure
                do {
                    structure = try JSONDecoder().decode(CapturedStructure.self,
                        from: await store.readCapture(sourceID: structureSourceID, kind: .roomPlanProcessed))
                } catch StoreError.notFound {
                    structure = try await StructureBuilder(options: []).capturedStructure(from: rooms)
                    _ = try await store.archiveCapture(encode(StructureSourceContext(sourceIDs: ids,
                        frameID: connection.frameID, normalizerVersion: SurfaceNormalizer.version)),
                        sourceID: structureSourceID, kind: .captureMetadata)
                    _ = try await store.archiveCapture(encode(structure), sourceID: structureSourceID, kind: .roomPlanProcessed)
                }
                var labels: [UUID: String] = [:]
                for (index, capturedRoom) in rooms.enumerated() { labels[capturedRoom.identifier] = "Room \(index + 1)" }
                normalized = try SurfaceNormalizer.normalize(AppleSurfaceAdapter.capture(structure: structure,
                    documentID: connection.outputDocumentID, title: context?.title ?? title,
                    frameID: connection.frameID, sourceArchiveID: structureSourceID,
                    sdkVersion: context?.sdkVersion ?? "unknown-sdk", labels: labels))
            }
        } else {
            expectedRevision = 0
            normalized = try SurfaceNormalizer.normalize(AppleSurfaceAdapter.capture(room: room,
                documentID: sourceID, title: context?.title ?? title,
                frameID: context?.frameID ?? sourceID, sourceArchiveID: sourceID,
                sdkVersion: context?.sdkVersion ?? "unknown-original-sdk"))
        }
        if let warning = context?.warning {
            normalized.report.issues.append(.init(code: "capture_interrupted", floorID: "floor-1", objectIDs: [], message: warning))
        }
        if context?.cancelled == true {
            normalized.report.issues.append(.init(code: "cancelled_capture", floorID: "floor-1", objectIDs: [], message: "The original capture was cancelled. Check this recovered room for incomplete areas."))
        }
        if context == nil || separately || context?.connection?.alignment == .separate {
            normalized.report.issues.append(.init(code: "capture_context_unconnected", floorID: "floor-1", objectIDs: [], message: "This is an independent retained segment. Its position is not connected to other scans."))
        }
        normalized.document.revision = expectedRevision + 1
        normalized.document.parentRevision = expectedRevision == 0 ? nil : expectedRevision
        if expectedRevision > 0 {
            normalized.report.issues.append(.init(code: "capture_identity_review", floorID: "floor-1",
                objectIDs: normalized.document.floors.flatMap { $0.walls.map(\.id) },
                message: "Connected-room processing may replace captured surface IDs. Prior identities and removals are recorded in revision history; review any relinking. No annotations were moved automatically."))
        }
        // A separate recovery has its own report identity; it cannot overwrite a
        // report already staged for the attempted connected result.
        let reportSource = separately ? "separate-" + sourceID : sourceID
        _ = try await store.archiveCapture(encode(normalized.report), sourceID: reportSource, kind: .normalizationReport)
        let digest = ArtifactDigest.sha256(try normalized.document.encoded())
        // Idempotence after a kill between the draft commit and completion marker.
        var editReceipt: EditReceipt?
        do {
            let current = try await store.open(documentID: normalized.document.documentID)
            if current == normalized.document {
                try await markCompleted(sourceID: sourceID, document: current, digest: digest, reportSourceID: reportSource); return current
            }
            guard expectedRevision > 0, current.revision == expectedRevision else { throw PipelineError.changedDraft }
            editReceipt = .restoring(from: current, to: normalized.document)
        } catch StoreError.notFound {
            guard expectedRevision == 0 else { throw PipelineError.changedDraft }
        }
        if expectedRevision == 0 { _ = try await store.create(normalized.document) }
        else { _ = try await store.save(normalized.document, expectedRevision: expectedRevision, command: "capture-connected-room", receipt: editReceipt) }
        try await markCompleted(sourceID: sourceID, document: normalized.document, digest: digest, reportSourceID: reportSource)
        return normalized.document
    }
    private func readContext(sourceID: String) async throws -> CaptureContext? {
        do {
            let context = try JSONDecoder().decode(CaptureContext.self,
                from: await store.readCapture(sourceID: sourceID, kind: .captureMetadata))
            guard context.sourceID == sourceID, UUID(uuidString: context.frameID) != nil,
                  context.connection == nil || context.connection?.sourceID == sourceID else { throw StoreError.corruptArtifact }
            return context
        } catch StoreError.notFound { return nil }
    }
    private func processedRoom(sourceID: String) async throws -> CapturedRoom {
        do {
            return try JSONDecoder().decode(CapturedRoom.self, from: await store.readCapture(sourceID: sourceID, kind: .roomPlanProcessed))
        } catch StoreError.notFound {
            let raw = try JSONDecoder().decode(CapturedRoomData.self, from: await store.readCapture(sourceID: sourceID, kind: .roomPlanRaw))
            let room = try await RoomBuilder(options: []).capturedRoom(from: raw)
            _ = try await store.archiveCapture(encode(room), sourceID: sourceID, kind: .roomPlanProcessed)
            return room
        }
    }
    private func markCompleted(sourceID: String, document: SpatialDocument, digest: String, reportSourceID: String) async throws {
        _ = try await store.archiveCapture(encode(CaptureCompletion(sourceID: sourceID, documentID: document.documentID,
            revision: document.revision, sha256: digest, reportSourceID: reportSourceID)), sourceID: "saved-" + sourceID, kind: .captureMetadata)
    }
    private func completion(sourceID: String) async throws -> SpatialDocument? {
        do {
            let receipt = try JSONDecoder().decode(CaptureCompletion.self,
                from: await store.readCapture(sourceID: "saved-" + sourceID, kind: .captureMetadata))
            guard receipt.sourceID == sourceID, receipt.revision > 0 else { throw StoreError.corruptArtifact }
            let current = try await store.open(documentID: receipt.documentID)
            guard current.revision >= receipt.revision else { throw StoreError.corruptArtifact }
            if current.revision == receipt.revision {
                guard ArtifactDigest.sha256(try current.encoded()) == receipt.sha256 else { throw StoreError.corruptArtifact }
            }
            return current // Preserve later corrections instead of re-normalizing over them.
        } catch StoreError.notFound { return nil }
    }
}
