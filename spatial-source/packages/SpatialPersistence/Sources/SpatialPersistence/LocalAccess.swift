import Foundation
import SpatialCore

public enum LocalStoreOperation: String, Codable, Hashable, Sendable { case read, edit, export, delivery }

/// Immutable managed-store identity. A context in one business never confers rights in another.
/// This configuration is not an authenticated identity; the injected authority verifies each lease.
public struct ManagedStoreScope: Codable, Equatable, Sendable {
    public let authorityID: String
    public let accountID: String
    public let tenantID: String
    public let workspaceID: String
    public let maximumOfflineLeaseSeconds: TimeInterval
    public init(authorityID: String, accountID: String, tenantID: String, workspaceID: String,
                maximumOfflineLeaseSeconds: TimeInterval) throws {
        guard [authorityID, accountID, tenantID, workspaceID].allSatisfy(Validator.validID),
              maximumOfflineLeaseSeconds.isFinite, (1...86400).contains(maximumOfflineLeaseSeconds) else {
            throw StoreError.invalidAccessPolicy
        }
        self.authorityID = authorityID; self.accountID = accountID; self.tenantID = tenantID
        self.workspaceID = workspaceID; self.maximumOfflineLeaseSeconds = maximumOfflineLeaseSeconds
    }
}

/// Returned only by a trusted issuer adapter AFTER authentication/verification. Plain struct
/// construction is not verification. No production issuer is supplied or automatically trusted.
public struct LocalAccessLease: Sendable {
    public let scope: ManagedStoreScope
    public let issuedAt: Date
    public let expiresAt: Date
    public let operations: Set<LocalStoreOperation>
    public init(scope: ManagedStoreScope, issuedAt: Date, expiresAt: Date, operations: Set<LocalStoreOperation>) {
        self.scope = scope; self.issuedAt = issuedAt; self.expiresAt = expiresAt; self.operations = operations
    }
}

/// A future company adapter must authenticate account, membership and source permissions
/// before returning an operation-scoped lease. Store does not accept caller-issued grant blobs.
/// A disconnected device cannot learn remote revocation until its adapter receives it or the
/// existing short-lived lease expires. Live authentication remains disabled/unimplemented.
public protocol ManagedStoreAuthority: Sendable {
    var authorityID: String { get }
    func verifiedLease(for scope: ManagedStoreScope, operation: LocalStoreOperation) throws -> LocalAccessLease
}

public struct StoreAccessConfiguration: Sendable {
    let scope: ManagedStoreScope?
    let authority: (any ManagedStoreAuthority)?
    public static let localDeviceOnly = StoreAccessConfiguration(scope: nil, authority: nil)
    /// A managed store may be opened locked with nil authority for later recovery coordination.
    /// No content reads, editing, export, or delivery are admitted without an issuer.
    public static func managed(scope: ManagedStoreScope, authority: (any ManagedStoreAuthority)? = nil) -> Self {
        .init(scope: scope, authority: authority)
    }
}

struct StoredAccessBinding: Codable {
    let version: Int
    let mode: String
    let scope: ManagedStoreScope?
    var suspendedAt: Date?
    var lastObservedAt: Date
}

/// Owned exclusively by the SpatialStore actor. SQLite binding survives reconnects and denies
/// opening managed work under local defaults. No read gate depends on mutable UI visibility.
final class LocalAccessGate: @unchecked Sendable {
    private let database: SQLiteConnection
    private let configuration: StoreAccessConfiguration
    private let clock: @Sendable () -> Date
    private let initialWall: Date
    private let initialUptime: TimeInterval
    init(database: SQLiteConnection, configuration: StoreAccessConfiguration, clock: @escaping @Sendable () -> Date) throws {
        self.database = database; self.configuration = configuration; self.clock = clock
        initialWall = clock(); initialUptime = ProcessInfo.processInfo.systemUptime
        guard initialWall.timeIntervalSince1970.isFinite else { throw StoreError.invalidAccessPolicy }
        try database.transaction {
            if let existing = try read() {
                guard existing.scope == configuration.scope else { throw StoreError.accessScopeMismatch }
            } else {
                // Existing pre-policy stores are local. Never silently convert irreplaceable
                // local work into company-managed records as a side effect of opening it.
                let count = try database.rows("SELECT (SELECT count(*) FROM artifacts)+(SELECT count(*) FROM drafts)").first?.int(0) ?? 1
                guard count == 0 else { throw StoreError.accessScopeMismatch }
                let binding = StoredAccessBinding(version: 1, mode: configuration.scope == nil ? "localDeviceOnly" : "managed",
                    scope: configuration.scope, suspendedAt: nil, lastObservedAt: initialWall)
                try database.execute("INSERT INTO store_access_policy(singleton,record) VALUES(1,?)", [.blob(try JSONEncoder().encode(binding))])
            }
        }
    }
    func require(_ operation: LocalStoreOperation) throws {
        try database.transaction {
            guard var binding = try read(), binding.scope == configuration.scope else { throw StoreError.accessScopeMismatch }
            guard let scope = binding.scope else { return }
            guard binding.suspendedAt == nil else { throw StoreError.localAccessSuspended }
            let date = try currentTime(binding)
            try validateLease(scope: scope, operation: operation, now: date)
            if date > binding.lastObservedAt {
                binding.lastObservedAt = date
                try write(binding)
            }
        }
    }
    func suspend() throws {
        try database.transaction {
            guard var binding = try read(), binding.scope != nil, binding.scope == configuration.scope else { throw StoreError.invalidAccessPolicy }
            // Suspension is always permitted, including after expiry/revocation. Retain all
            // captures, revisions, frozen exports and uncertain outbox entries unchanged.
            binding.suspendedAt = max(clock(), binding.lastObservedAt)
            binding.lastObservedAt = binding.suspendedAt!
            try write(binding)
        }
    }
    func resume() throws {
        try database.transaction {
            guard var binding = try read(), let scope = binding.scope, scope == configuration.scope,
                  let suspended = binding.suspendedAt else { throw StoreError.invalidAccessPolicy }
            let date = try currentTime(binding)
            let lease = try validateLease(scope: scope, operation: .read, now: date)
            guard lease.issuedAt > suspended else { throw StoreError.localAccessSuspended }
            binding.suspendedAt = nil; binding.lastObservedAt = date
            try write(binding)
        }
    }
    @discardableResult
    private func validateLease(scope: ManagedStoreScope, operation: LocalStoreOperation, now: Date) throws -> LocalAccessLease {
        guard let authority = configuration.authority, authority.authorityID == scope.authorityID else { throw StoreError.localAccessDenied }
        let lease: LocalAccessLease
        do { lease = try authority.verifiedLease(for: scope, operation: operation) }
        catch { throw StoreError.localAccessDenied }
        let issued = lease.issuedAt.timeIntervalSince1970, expires = lease.expiresAt.timeIntervalSince1970
        guard lease.scope == scope, issued.isFinite, expires.isFinite, expires > issued,
              expires - issued <= scope.maximumOfflineLeaseSeconds,
              lease.issuedAt <= now, lease.expiresAt > now, lease.operations.contains(operation) else { throw StoreError.localAccessDenied }
        return lease
    }
    private func currentTime(_ binding: StoredAccessBinding) throws -> Date {
        let wall = clock()
        guard wall.timeIntervalSince1970.isFinite,
              wall >= binding.lastObservedAt.addingTimeInterval(-5) else { throw StoreError.localClockRollback }
        // Monotonic elapsed time prevents holding a still-running process's wall clock still.
        // Offline OS clock and app-sandbox integrity remain trust assumptions across reboot.
        return max(wall, initialWall.addingTimeInterval(max(0, ProcessInfo.processInfo.systemUptime - initialUptime)))
    }
    private func read() throws -> StoredAccessBinding? {
        guard let row = try database.rows("SELECT record FROM store_access_policy WHERE singleton=1").first else { return nil }
        let bytes = row.blob(0)
        guard !bytes.isEmpty, bytes.count <= 4096 else { throw StoreError.invalidAccessPolicy }
        var scanner = JSONSafetyScanner(bytes); try scanner.validate()
        let value = try JSONDecoder().decode(StoredAccessBinding.self, from: bytes)
        guard value.version == 1, value.mode == (value.scope == nil ? "localDeviceOnly" : "managed"),
              value.lastObservedAt.timeIntervalSince1970.isFinite,
              value.suspendedAt.map({ $0.timeIntervalSince1970.isFinite }) ?? true else { throw StoreError.invalidAccessPolicy }
        if let scope = value.scope {
            _ = try ManagedStoreScope(authorityID: scope.authorityID, accountID: scope.accountID,
                tenantID: scope.tenantID, workspaceID: scope.workspaceID, maximumOfflineLeaseSeconds: scope.maximumOfflineLeaseSeconds)
        }
        return value
    }
    private func write(_ binding: StoredAccessBinding) throws {
        try database.execute("UPDATE store_access_policy SET record=? WHERE singleton=1", [.blob(try JSONEncoder().encode(binding))])
    }
}
