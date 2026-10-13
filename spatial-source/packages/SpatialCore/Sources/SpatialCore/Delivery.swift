import Foundation

public enum DeliveryState: String, Codable, Sendable {
    case queued, reserving, uploading, awaitingReceipt, delivered, needsAuthentication, conflict, retryableFailure, cancelled
}
public enum DeliveryEvent: Sendable {
    case start, reservationAccepted, uploadFinished
    case verifiedReceipt(revision: Int, digest: String, destination: String)
    case authenticationRequired, revisionConflict, transientFailure, retry, cancel
}
public enum DeliveryError: Error { case invalidTransition, invalidReceipt, invalidIdentity }

// This is only the deterministic client-side state machine. A receipt must be
// authenticated and validated by the transport BEFORE verifiedReceipt is sent.
// Network operations, credential storage, durable queues, and server validation
// are explicitly not implemented here.
public struct DeliveryMachine: Codable, Equatable, Sendable {
    public let requestID: String
    public let sourceRevision: Int
    public let manifestDigest: String
    public let destination: String
    public private(set) var state: DeliveryState
    public init(requestID: String, sourceRevision: Int, manifestDigest: String, destination: String) throws {
        guard Validator.validID(requestID), sourceRevision > 0, Validator.validID(destination),
              manifestDigest.utf8.count == 64, manifestDigest.utf8.allSatisfy({ (48...57).contains($0) || (97...102).contains($0) }) else {
            throw DeliveryError.invalidIdentity
        }
        self.requestID=requestID; self.sourceRevision=sourceRevision; self.manifestDigest=manifestDigest
        self.destination=destination; self.state = .queued
    }
    public mutating func apply(_ event: DeliveryEvent) throws {
        switch event {
        case .start:
            guard state == .queued else { throw DeliveryError.invalidTransition }; state = .reserving
        case .reservationAccepted:
            guard state == .reserving else { throw DeliveryError.invalidTransition }; state = .uploading
        case .uploadFinished:
            guard state == .uploading else { throw DeliveryError.invalidTransition }; state = .awaitingReceipt
        case .verifiedReceipt(let rev,let digest,let target):
            guard state == .awaitingReceipt || state == .delivered else { throw DeliveryError.invalidTransition }
            guard rev == sourceRevision, digest == manifestDigest, target == destination else { throw DeliveryError.invalidReceipt }
            state = .delivered // repeated exact receipt is harmless
        case .authenticationRequired:
            guard [.reserving,.uploading,.awaitingReceipt].contains(state) else { throw DeliveryError.invalidTransition }
            state = .needsAuthentication
        case .revisionConflict:
            guard [.reserving,.awaitingReceipt].contains(state) else { throw DeliveryError.invalidTransition }; state = .conflict
        case .transientFailure:
            guard [.reserving,.uploading,.awaitingReceipt].contains(state) else { throw DeliveryError.invalidTransition }; state = .retryableFailure
        case .retry:
            guard state == .retryableFailure || state == .needsAuthentication else { throw DeliveryError.invalidTransition }
            state = .queued // same request identity; server must reconcile any prior acceptance
        case .cancel:
            guard state != .delivered && state != .cancelled else { throw DeliveryError.invalidTransition }; state = .cancelled
        }
    }
}
