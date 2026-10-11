import Foundation
import SpatialCore

/// An explicit business context, never a role inferred from another application.
public struct PublicationDestination: Codable, Equatable, Hashable, Sendable {
    public enum System: String, Codable, Sendable { case auxiliumos, moldo }
    public let system: System
    public let contextID: String
    public init(system: System, contextID: String) throws {
        guard Validator.validID(contextID) else { throw PublicationError.invalidIdentity }
        self.system = system; self.contextID = contextID
    }
}

/// Byte identity and destination intent only. None of these fields grants authority.
public struct PublicationRequest: Codable, Equatable, Sendable {
    public let clientRequestID: String
    public let sourceDocumentID: String
    public let sourceRevision: Int
    /// Client-local frozen-file audit digest. This is not the compact geometry.json hash,
    /// not a field in the proposed ReservationRequest, and not a receiver byte attestation.
    public let localSnapshotSHA256: String
    public let manifestSHA256: String
    public let archiveSHA256: String
    public let archiveByteCount: Int
    public let destination: PublicationDestination
    public let expectedPublishedRevision: Int?

    func validate() throws {
        guard Validator.validID(clientRequestID), Validator.validID(sourceDocumentID),
              Validator.validID(destination.contextID), sourceRevision > 0, sourceRevision <= 9_007_199_254_740_991,
              expectedPublishedRevision.map({ $0 > 0 && $0 <= 9_007_199_254_740_991 }) ?? true,
              archiveByteCount > 0, archiveByteCount <= 64 * 1024 * 1024,
              [localSnapshotSHA256, manifestSHA256, archiveSHA256].allSatisfy(Self.isDigest) else {
            throw PublicationError.invalidIdentity
        }
    }
    static func isDigest(_ value: String) -> Bool {
        value.utf8.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
    }
}

public enum PublicationState: String, Codable, Sendable {
    case queued, delivering, awaitingReceipt, needsAuthentication, denied, conflict, retryableFailure
    case delivered, cancelledLocally
}

/// Bounded error codes are safe to show without exposing destinations, labels or credentials.
public enum PublicationError: String, Error, Codable, LocalizedError, Sendable {
    case notConnected, invalidIdentity, identityConflict, invalidSnapshot, invalidBundle, corruptOutbox
    case busy, leaseExpired, cancelled, authenticationRequired, authorityDenied, revisionConflict
    case invalidReceipt, transientFailure, invalidTransition, attemptLimit
    public var errorDescription: String? {
        switch self {
        case .notConnected: return "Not connected. The exact saved version remains on this device."
        case .authenticationRequired: return "Sign in again before retrying delivery."
        case .authorityDenied: return "Delivery is not authorized for this destination. Your local work is retained."
        case .revisionConflict: return "The destination changed. Resolve the version conflict before creating a new request."
        case .busy: return "This request already has an active delivery attempt."
        case .invalidReceipt: return "The receiver acknowledgement could not be verified. Delivery is not confirmed."
        default: return "Publication could not complete (\(rawValue)). Local source is retained."
        }
    }
}

/// Receipt payload is untrusted until the configured transport independently authenticates it.
/// This describes an INTERNAL DRAFT acceptance, never client release.
public struct PublicationReceipt: Codable, Equatable, Sendable {
    public let receiptID: String
    public let publicationID: String
    public let request: PublicationRequest
    public let acceptedRevision: Int
    public let acceptedAt: Date
    public let disposition: String
    public let proof: String
    public init(receiptID: String, publicationID: String, request: PublicationRequest,
                acceptedRevision: Int, acceptedAt: Date, disposition: String = "internal-draft", proof: String) {
        self.receiptID = receiptID; self.publicationID = publicationID; self.request = request
        self.acceptedRevision = acceptedRevision; self.acceptedAt = acceptedAt
        self.disposition = disposition; self.proof = proof
    }
    func validate(for request: PublicationRequest) throws {
        try self.request.validate()
        guard self.request == request, Validator.validID(receiptID), Validator.validID(publicationID),
              acceptedRevision > 0, acceptedRevision <= 9_007_199_254_740_991,
              acceptedAt.timeIntervalSince1970.isFinite, disposition == "internal-draft",
              Validator.validID(proof) else { throw PublicationError.invalidReceipt }
    }
}

public struct PublicationSummary: Codable, Equatable, Sendable {
    public let request: PublicationRequest
    public let snapshotID: String
    public internal(set) var state: PublicationState
    public internal(set) var attempts: Int
    public let queuedAt: Date
    public internal(set) var lastFailure: PublicationError?
    public internal(set) var receipt: PublicationReceipt?
    /// True only after receiver authentication and exact request comparison, not upload completion.
    public var receiverConfirmed: Bool { state == .delivered && receipt != nil }
}

struct OutboxRecord: Codable {
    var summary: PublicationSummary
    var attemptID: String
    var leaseUntil: Date
    func validate() throws {
        try summary.request.validate()
        guard Validator.validID(summary.snapshotID), summary.attempts >= 0, summary.attempts <= 100_000,
              summary.queuedAt.timeIntervalSince1970.isFinite, leaseUntil.timeIntervalSince1970.isFinite,
              attemptID.isEmpty || Validator.validID(attemptID),
              (summary.state == .delivered) == (summary.receipt != nil) else { throw PublicationError.corruptOutbox }
        if let receipt = summary.receipt { try receipt.validate(for: summary.request) }
    }
}

struct PublicationAttempt: Sendable {
    let id: String
    let request: PublicationRequest
    let archive: Data
}

/// Ephemeral adapter-owned session handle. Never serialized to the database or a launch URL.
public struct PublicationAuthorization: Sendable {
    public let handle: String
    public let requestID: String
    public let destination: PublicationDestination
    public let expiresAt: Date
    public init(handle: String, requestID: String, destination: PublicationDestination, expiresAt: Date) {
        self.handle = handle; self.requestID = requestID; self.destination = destination; self.expiresAt = expiresAt
    }
}

public struct PublicationReservation: Equatable, Sendable {
    public let publicationID: String
    public let request: PublicationRequest
    public init(publicationID: String, request: PublicationRequest) {
        self.publicationID = publicationID; self.request = request
    }
}
public enum PublicationRemoteStatus: Sendable {
    case absent, reserved(PublicationReservation), pending(PublicationReservation), accepted(PublicationReceipt)
}
public enum PublicationAttemptResult: Equatable, Sendable {
    case notConnected, busy, awaitingReceipt, blocked(PublicationError), delivered(PublicationReceipt), alreadyFinished
}

/// TRUST BOUNDARY. A future network adapter must authenticate server responses and recheck
/// current source-read and destination rights. Implementing this protocol does not authorize a
/// live connector. No HTTP adapter, credential, service key, URL, or background upload is provided.
public protocol ScopedPublicationTransport: Sendable {
    var isConnected: Bool { get }
    func authorize(_ request: PublicationRequest) async throws -> PublicationAuthorization
    func status(_ request: PublicationRequest, authorization: PublicationAuthorization) async throws -> PublicationRemoteStatus
    func reserve(_ request: PublicationRequest, authorization: PublicationAuthorization) async throws -> PublicationReservation
    func upload(_ bytes: Data, reservation: PublicationReservation, authorization: PublicationAuthorization) async throws
    func finalize(_ reservation: PublicationReservation, authorization: PublicationAuthorization) async throws -> PublicationRemoteStatus
    /// Must verify authenticated receiver state, not merely hashes or fields supplied by the client.
    func authenticate(_ receipt: PublicationReceipt, authorization: PublicationAuthorization) async throws -> Bool
}

public struct DisabledPublicationTransport: ScopedPublicationTransport {
    public init() {}
    public let isConnected = false
    public func authorize(_ request: PublicationRequest) async throws -> PublicationAuthorization { throw PublicationError.notConnected }
    public func status(_ request: PublicationRequest, authorization: PublicationAuthorization) async throws -> PublicationRemoteStatus { throw PublicationError.notConnected }
    public func reserve(_ request: PublicationRequest, authorization: PublicationAuthorization) async throws -> PublicationReservation { throw PublicationError.notConnected }
    public func upload(_ bytes: Data, reservation: PublicationReservation, authorization: PublicationAuthorization) async throws { throw PublicationError.notConnected }
    public func finalize(_ reservation: PublicationReservation, authorization: PublicationAuthorization) async throws -> PublicationRemoteStatus { throw PublicationError.notConnected }
    public func authenticate(_ receipt: PublicationReceipt, authorization: PublicationAuthorization) async throws -> Bool { throw PublicationError.notConnected }
}
