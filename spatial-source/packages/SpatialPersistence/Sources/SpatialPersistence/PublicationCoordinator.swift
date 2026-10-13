import Foundation

/// Exact-version coordinator. The default is deliberately disconnected. Synthetic tests may
/// inject a receiver, but this package has no network implementation or implicit destination.
/// Each await is followed by lease/protection validation; a stale attempt cannot acknowledge
/// a newer attempt, replace immutable bytes, or claim a merely pending response succeeded.
public actor PublicationCoordinator {
    private let store: SpatialStore
    private let transport: any ScopedPublicationTransport
    private let now: @Sendable () -> Date
    private let leaseSeconds: TimeInterval
    public init(store: SpatialStore, transport: any ScopedPublicationTransport = DisabledPublicationTransport(),
                now: @escaping @Sendable () -> Date = { Date() }, leaseSeconds: TimeInterval = 60) {
        self.store = store; self.transport = transport; self.now = now
        self.leaseSeconds = min(max(leaseSeconds.isFinite ? leaseSeconds : 60, 1), 300)
    }
    public var isConnected: Bool { transport.isConnected }

    public func deliver(requestID: String) async throws -> PublicationAttemptResult {
        guard transport.isConnected else { return .notConnected }
        let attempt: PublicationAttempt
        do {
            guard let value = try await store.beginPublication(requestID: requestID, now: now(), leaseSeconds: leaseSeconds) else { return .alreadyFinished }
            attempt = value
        } catch PublicationError.busy { return .busy }
        catch let error as PublicationError { return .blocked(error) }
        do {
            let authorization = try await transport.authorize(attempt.request)
            try await ready(attempt, authorization)
            // First operation of EVERY attempt is an authorized status reconciliation.
            // It covers timeout/relaunch after receiver acceptance before the local receipt commit.
            let remote = try await transport.status(attempt.request, authorization: authorization)
            try await ready(attempt, authorization)
            switch remote {
            case .accepted(let receipt): return try await accept(receipt, attempt, authorization)
            case .pending(let reservation):
                try validate(reservation, attempt)
                _ = try await store.endPublication(attempt, now: now())
                return .awaitingReceipt
            case .absent, .reserved: break
            }
            let reservation: PublicationReservation
            if case .reserved(let existing) = remote { reservation = existing }
            else { reservation = try await transport.reserve(attempt.request, authorization: authorization) }
            try validate(reservation, attempt); try await ready(attempt, authorization)
            try await transport.upload(attempt.archive, reservation: reservation, authorization: authorization)
            try await ready(attempt, authorization)
            let result = try await transport.finalize(reservation, authorization: authorization)
            try await ready(attempt, authorization)
            switch result {
            case .accepted(let receipt): return try await accept(receipt, attempt, authorization)
            case .pending(let pending):
                try validate(pending, attempt)
                _ = try await store.endPublication(attempt, now: now())
                return .awaitingReceipt
            case .reserved, .absent: throw PublicationError.transientFailure
            }
        } catch {
            let failure = (error as? PublicationError) ?? .transientFailure
            // A protection error or lost lease must not be converted to a false persisted state.
            // The next admitted attempt reconciles with the receiver using the original request.
            _ = try await store.endPublication(attempt, now: now(), failure: failure)
            return .blocked(failure)
        }
    }
    private func ready(_ attempt: PublicationAttempt, _ authorization: PublicationAuthorization) async throws {
        guard authorization.requestID == attempt.request.clientRequestID,
              authorization.destination == attempt.request.destination,
              authorization.expiresAt.timeIntervalSince1970.isFinite,
              authorization.expiresAt > now(), !authorization.handle.isEmpty,
              authorization.handle.utf8.count <= 512 else { throw PublicationError.authenticationRequired }
        try await store.renewPublication(attempt, now: now(), leaseSeconds: leaseSeconds)
        try Task.checkCancellation()
    }
    private func validate(_ reservation: PublicationReservation, _ attempt: PublicationAttempt) throws {
        guard reservation.request == attempt.request,
              !reservation.publicationID.isEmpty, reservation.publicationID.utf8.count <= 96,
              reservation.publicationID.utf8.allSatisfy({ (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 || $0 == 95 }) else { throw PublicationError.identityConflict }
    }
    private func accept(_ receipt: PublicationReceipt, _ attempt: PublicationAttempt,
                        _ authorization: PublicationAuthorization) async throws -> PublicationAttemptResult {
        try receipt.validate(for: attempt.request)
        guard try await transport.authenticate(receipt, authorization: authorization) else { throw PublicationError.invalidReceipt }
        try await ready(attempt, authorization)
        _ = try await store.endPublication(attempt, now: now(), receipt: receipt)
        return .delivered(receipt)
    }
}
