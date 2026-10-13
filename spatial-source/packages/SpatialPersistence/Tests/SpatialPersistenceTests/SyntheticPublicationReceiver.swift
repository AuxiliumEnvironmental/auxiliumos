import Foundation
import SpatialCore
import SpatialInterop
@testable import SpatialPersistence

/// TEST ONLY. Ordinary synthetic principal, explicit source/destination grants and an
/// in-memory private receiver. No HTTP, real account, production adapter, or reusable key.
actor SyntheticPublicationReceiver: ScopedPublicationTransport {
    nonisolated let isConnected = true
    struct Scope: Hashable { let documentID: String; let destination: PublicationDestination }
    struct Session { let request: PublicationRequest; let expiresAt: Date }
    struct Record { let reservation: PublicationReservation; var bytes: Data?; var receipt: PublicationReceipt? }
    private var scopes: Set<Scope> = []
    private var sessions: [String: Session] = [:]
    private var records: [String: Record] = [:]
    private var revisions: [Scope: (destination: Int, source: Int)] = [:]
    private var active = true
    private var pending = false
    private var lostAcknowledgement = false
    private var forgedAcknowledgement = false
    private var revokeAfterUpload = false
    private var expireAfterUpload = false
    private var clock: Date
    private(set) var uploads = 0
    private(set) var acceptances = 0
    private(set) var reconciliations = 0
    init(now: Date = Date()) { clock = now }
    func grant(documentID: String, destination: PublicationDestination) { scopes.insert(.init(documentID: documentID, destination: destination)) }
    func revoke(documentID: String, destination: PublicationDestination) { scopes.remove(.init(documentID: documentID, destination: destination)) }
    func setAuthenticated(_ value: Bool) { active = value }
    func setPending(_ value: Bool) { pending = value }
    func loseNextAcknowledgement() { lostAcknowledgement = true }
    func forgeNextAcknowledgement() { forgedAcknowledgement = true }
    func revokeDuringNextUpload() { revokeAfterUpload = true }
    func expireDuringNextUpload() { expireAfterUpload = true }
    func setClock(_ value: Date) { clock = value }
    func stats() -> (uploads: Int, accepted: Int, reconciled: Int) { (uploads, acceptances, reconciliations) }

    func authorize(_ request: PublicationRequest) throws -> PublicationAuthorization {
        try request.validate(); try authority(request)
        let handle = UUID().uuidString
        let expiration = clock.addingTimeInterval(600)
        sessions[handle] = Session(request: request, expiresAt: expiration)
        return PublicationAuthorization(handle: handle, requestID: request.clientRequestID,
            destination: request.destination, expiresAt: expiration)
    }
    func status(_ request: PublicationRequest, authorization: PublicationAuthorization) throws -> PublicationRemoteStatus {
        try check(request, authorization); reconciliations += 1
        guard let record = records[request.clientRequestID] else { return .absent }
        guard record.reservation.request == request else { throw PublicationError.identityConflict }
        if let receipt = record.receipt { return .accepted(receipt) }
        if record.bytes != nil && pending { return .pending(record.reservation) }
        return .reserved(record.reservation)
    }
    func reserve(_ request: PublicationRequest, authorization: PublicationAuthorization) throws -> PublicationReservation {
        try check(request, authorization)
        if let record = records[request.clientRequestID] {
            guard record.reservation.request == request else { throw PublicationError.identityConflict }
            return record.reservation
        }
        try version(request)
        let reservation = PublicationReservation(publicationID: UUID().uuidString.lowercased(), request: request)
        records[request.clientRequestID] = Record(reservation: reservation, bytes: nil, receipt: nil)
        return reservation
    }
    func upload(_ bytes: Data, reservation: PublicationReservation, authorization: PublicationAuthorization) throws {
        let request = reservation.request
        try check(request, authorization)
        guard var record = records[request.clientRequestID], record.reservation == reservation else { throw PublicationError.identityConflict }
        guard bytes.count == request.archiveByteCount, ArtifactDigest.sha256(bytes) == request.archiveSHA256 else { throw PublicationError.invalidBundle }
        let imported = try ExchangeImporter.importArchive(bytes)
        guard imported.document.documentID == request.sourceDocumentID, imported.document.revision == request.sourceRevision,
              imported.manifestSHA256 == request.manifestSHA256 else { throw PublicationError.invalidBundle }
        if let existing = record.bytes { guard existing == bytes else { throw PublicationError.identityConflict } }
        if record.receipt == nil { record.bytes = bytes; records[request.clientRequestID] = record }
        uploads += 1
        if revokeAfterUpload { revokeAfterUpload = false; revoke(documentID: request.sourceDocumentID, destination: request.destination) }
        if expireAfterUpload { expireAfterUpload = false; active = false; sessions.removeAll() }
    }
    func finalize(_ reservation: PublicationReservation, authorization: PublicationAuthorization) throws -> PublicationRemoteStatus {
        let request = reservation.request
        try check(request, authorization)
        guard var record = records[request.clientRequestID], record.reservation == reservation,
              let bytes = record.bytes else { throw PublicationError.invalidBundle }
        if let receipt = record.receipt { return .accepted(receipt) }
        // Re-validate actual stored bytes and current authority at finalization, never a client hash alone.
        let imported = try ExchangeImporter.importArchive(bytes)
        guard bytes.count == request.archiveByteCount, ArtifactDigest.sha256(bytes) == request.archiveSHA256,
              imported.manifestSHA256 == request.manifestSHA256,
              imported.document.documentID == request.sourceDocumentID, imported.document.revision == request.sourceRevision else { throw PublicationError.invalidBundle }
        try version(request)
        if pending { return .pending(reservation) }
        let scope = Scope(documentID: request.sourceDocumentID, destination: request.destination)
        let revision = (revisions[scope]?.destination ?? 0) + 1
        let receipt = PublicationReceipt(receiptID: UUID().uuidString.lowercased(), publicationID: reservation.publicationID,
            request: request, acceptedRevision: revision, acceptedAt: clock, proof: UUID().uuidString.lowercased())
        record.receipt = receipt; records[request.clientRequestID] = record
        revisions[scope] = (revision, request.sourceRevision); acceptances += 1
        if lostAcknowledgement { lostAcknowledgement = false; throw PublicationError.transientFailure }
        if forgedAcknowledgement {
            forgedAcknowledgement = false
            return .accepted(PublicationReceipt(receiptID: receipt.receiptID, publicationID: receipt.publicationID,
                request: receipt.request, acceptedRevision: receipt.acceptedRevision, acceptedAt: receipt.acceptedAt,
                proof: "forged-proof"))
        }
        return .accepted(receipt)
    }
    func authenticate(_ receipt: PublicationReceipt, authorization: PublicationAuthorization) throws -> Bool {
        try check(receipt.request, authorization)
        // Authentication compares receiver-maintained acceptance, including unpredictable proof.
        // A digest, unsigned client copy, or matching source identity alone cannot pass.
        return records[receipt.request.clientRequestID]?.receipt == receipt
    }
    private func authority(_ request: PublicationRequest) throws {
        guard active else { throw PublicationError.authenticationRequired }
        guard scopes.contains(.init(documentID: request.sourceDocumentID, destination: request.destination)) else { throw PublicationError.authorityDenied }
    }
    private func check(_ request: PublicationRequest, _ authorization: PublicationAuthorization) throws {
        try authority(request)
        guard let session = sessions[authorization.handle], session.request == request,
              session.expiresAt > clock, session.expiresAt == authorization.expiresAt,
              authorization.requestID == request.clientRequestID, authorization.destination == request.destination else { throw PublicationError.authenticationRequired }
    }
    private func version(_ request: PublicationRequest) throws {
        let current = revisions[Scope(documentID: request.sourceDocumentID, destination: request.destination)]
        guard request.expectedPublishedRevision == current?.destination,
              current.map({ request.sourceRevision > $0.source }) ?? true else { throw PublicationError.revisionConflict }
    }
}
