import Foundation
import XCTest
import SpatialCore
@testable import SpatialPersistence

/// No real identities or credentials. The production package supplies no implementation
/// of ManagedStoreAuthority; this deterministic authority exists only in the test target.
private final class SyntheticLocalAuthority: ManagedStoreAuthority, @unchecked Sendable {
    let authorityID = "synthetic-issuer"
    private let lock = NSLock()
    private var value: LocalAccessLease
    private var deny = false
    private var blocker: (DispatchSemaphore, DispatchSemaphore)?
    init(_ value: LocalAccessLease) { self.value = value }
    func set(_ value: LocalAccessLease) { lock.lock(); self.value = value; lock.unlock() }
    func revoke() { lock.lock(); deny = true; lock.unlock() }
    func blockNext(entered: DispatchSemaphore, resume: DispatchSemaphore) { lock.lock(); blocker = (entered, resume); lock.unlock() }
    func verifiedLease(for scope: ManagedStoreScope, operation: LocalStoreOperation) throws -> LocalAccessLease {
        lock.lock(); let value = self.value, denied = deny, blocker = self.blocker; self.blocker = nil; lock.unlock()
        if let blocker { blocker.0.signal(); _ = blocker.1.wait(timeout: .now() + 5) }
        if denied { throw StoreError.localAccessDenied }; return value
    }
}
private final class SyntheticAccessClock: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Date
    init(_ value: Date) { self.value = value }
    func now() -> Date { lock.lock(); defer { lock.unlock() }; return value }
    func set(_ value: Date) { lock.lock(); self.value = value; lock.unlock() }
}

final class LocalAccessTests: XCTestCase {
    private let instant = Date(timeIntervalSince1970: 2_000_000_000)
    private func temporary() -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("spatial-managed-" + UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }; return root
    }
    private func scope(account: String = "synthetic-account", tenant: String = "business-a") throws -> ManagedStoreScope {
        try ManagedStoreScope(authorityID: "synthetic-issuer", accountID: account, tenantID: tenant,
            workspaceID: "workspace-a", maximumOfflineLeaseSeconds: 3600)
    }
    private func lease(_ scope: ManagedStoreScope, operations: Set<LocalStoreOperation> = [.read,.edit,.export,.delivery],
                       issuedAt: Date? = nil, expiresAt: Date? = nil) -> LocalAccessLease {
        LocalAccessLease(scope: scope, issuedAt: issuedAt ?? instant.addingTimeInterval(-1),
            expiresAt: expiresAt ?? instant.addingTimeInterval(120), operations: operations)
    }
    func testManagedStoreFailsClosedWithoutTrustedAuthorityAndCannotReopenAsLocal() async throws {
        let root = temporary(), scope = try scope(), time = instant
        let locked = try SpatialStore(root: root, accessConfiguration: .managed(scope: scope), accessClock: { time })
        do { _ = try await locked.create(Fixtures.twoRooms()); XCTFail("No issuer admitted") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessDenied) }
        XCTAssertThrowsError(try SpatialStore(root: root)) { XCTAssertEqual($0 as? StoreError, .accessScopeMismatch) }
        let authority = SyntheticLocalAuthority(lease(scope))
        let unlocked = try SpatialStore(root: root, accessConfiguration: .managed(scope: scope, authority: authority), accessClock: { time })
        _ = try await unlocked.create(Fixtures.twoRooms())
        let document = try await unlocked.open(documentID: Fixtures.twoRooms().documentID)
        XCTAssertEqual(document.revision, 1)
    }
    func testReadPermissionDoesNotGrantExportEditOrDelivery() async throws {
        let root = temporary(), scope = try scope(), time = instant, initial = Fixtures.twoRooms()
        let authority = SyntheticLocalAuthority(lease(scope))
        let store = try SpatialStore(root: root, accessConfiguration: .managed(scope: scope, authority: authority), accessClock: { time })
        _ = try await store.create(initial)
        let frozen = try await store.freeze(documentID: initial.documentID, revision: 1)
        authority.set(lease(scope, operations: [.read]))
        let document = try await store.open(documentID: initial.documentID)
        XCTAssertEqual(document, initial)
        do { _ = try await store.readFrozen(snapshotID: frozen.snapshotID); XCTFail("View granted export") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessDenied) }
        do { _ = try await store.undo(documentID: initial.documentID, expectedRevision: 1); XCTFail("View granted edit") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessDenied) }
        do { _ = try await store.enqueuePublication(snapshotID: frozen.snapshotID, destination: .init(system: .moldo, contextID: "synthetic-project"), expectedPublishedRevision: nil, clientRequestID: "blocked"); XCTFail("View granted delivery") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessDenied) }
    }
    func testLeasesRejectWrongScopeExpiryFutureIssueExcessDurationAndRevocation() async throws {
        let scope = try scope(), time = instant, authority = SyntheticLocalAuthority(lease(try self.scope()))
        let store = try SpatialStore(root: temporary(), accessConfiguration: .managed(scope: scope, authority: authority), accessClock: { time })
        _ = try await store.create(Fixtures.twoRooms())
        let invalid = [lease(try self.scope(account: "other-account")), lease(try self.scope(tenant: "other-business")),
            lease(scope, expiresAt: instant.addingTimeInterval(-0.5)),
            lease(scope, issuedAt: instant.addingTimeInterval(30), expiresAt: instant.addingTimeInterval(90)),
            lease(scope, issuedAt: instant.addingTimeInterval(-1), expiresAt: instant.addingTimeInterval(7200))]
        for candidate in invalid {
            authority.set(candidate)
            do { _ = try await store.listDrafts(); XCTFail("Invalid lease admitted") }
            catch { XCTAssertEqual(error as? StoreError, .localAccessDenied) }
        }
        authority.set(lease(scope)); authority.revoke()
        do { _ = try await store.listDrafts(); XCTFail("Revoked source admitted") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessDenied) }
    }
    func testSignOutIsDurableAcrossInstancesAndRetainsUnsyncedWork() async throws {
        let root = temporary(), scope = try scope(), clock = SyntheticAccessClock(instant), authority = SyntheticLocalAuthority(lease(try self.scope()))
        let config = StoreAccessConfiguration.managed(scope: scope, authority: authority)
        let a = try SpatialStore(root: root, accessConfiguration: config, accessClock: { clock.now() })
        _ = try await a.create(Fixtures.twoRooms())
        _ = try await a.archiveCapture(Data("synthetic raw pending".utf8), sourceID: "source-a", kind: .roomPlanRaw)
        let frozen = try await a.freeze(documentID: Fixtures.twoRooms().documentID, revision: 1)
        _ = try await a.enqueuePublication(snapshotID: frozen.snapshotID, destination: .init(system: .auxiliumos, contextID: "synthetic-project"), expectedPublishedRevision: nil, clientRequestID: "pending")
        let b = try SpatialStore(root: root, accessConfiguration: config, accessClock: { clock.now() })
        try await a.suspendManagedAccess()
        do { _ = try await b.open(documentID: Fixtures.twoRooms().documentID); XCTFail("Other instance survived signout") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessSuspended) }
        let reopened = try SpatialStore(root: root, accessConfiguration: config, accessClock: { clock.now() })
        do { try await reopened.resumeManagedAccess(); XCTFail("Old lease cleared suspension") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessSuspended) }
        clock.set(instant.addingTimeInterval(10))
        authority.set(lease(scope, issuedAt: instant.addingTimeInterval(5), expiresAt: instant.addingTimeInterval(120)))
        try await reopened.resumeManagedAccess()
        let bytes = try await reopened.readCapture(sourceID: "source-a", kind: .roomPlanRaw)
        let entries = try await reopened.listPublications()
        XCTAssertEqual(bytes, Data("synthetic raw pending".utf8)); XCTAssertEqual(entries.count, 1)
        XCTAssertEqual(entries[0].state, .queued)
    }
    func testClockRollbackDeniedAcrossReopenAndExpiredLeaseDoesNotErase() async throws {
        let root = temporary(), scope = try scope(), clock = SyntheticAccessClock(instant), authority = SyntheticLocalAuthority(lease(try self.scope()))
        let config = StoreAccessConfiguration.managed(scope: scope, authority: authority)
        let store = try SpatialStore(root: root, accessConfiguration: config, accessClock: { clock.now() })
        _ = try await store.create(Fixtures.twoRooms())
        clock.set(instant.addingTimeInterval(121))
        do { _ = try await store.listDrafts(); XCTFail("Expired lease admitted") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessDenied) }
        clock.set(instant.addingTimeInterval(-60))
        let reopened = try SpatialStore(root: root, accessConfiguration: config, accessClock: { clock.now() })
        do { _ = try await reopened.listDrafts(); XCTFail("Rollback admitted") }
        catch { XCTAssertEqual(error as? StoreError, .localClockRollback) }
    }
    func testWrongBindingAndImplicitLocalToManagedMigrationAreRejected() async throws {
        let root = temporary(), scope = try scope(), time = instant, authority = SyntheticLocalAuthority(lease(try self.scope()))
        let store = try SpatialStore(root: root, accessConfiguration: .managed(scope: scope, authority: authority), accessClock: { time })
        _ = try await store.create(Fixtures.twoRooms())
        let other = try self.scope(account: "other-account")
        XCTAssertThrowsError(try SpatialStore(root: root, accessConfiguration: .managed(scope: other, authority: authority))) { XCTAssertEqual($0 as? StoreError, .accessScopeMismatch) }
        let localRoot = temporary(), local = try SpatialStore(root: localRoot)
        _ = try await local.create(Fixtures.twoRooms())
        XCTAssertThrowsError(try SpatialStore(root: localRoot, accessConfiguration: .managed(scope: scope, authority: authority))) { XCTAssertEqual($0 as? StoreError, .accessScopeMismatch) }
        let database = try SQLiteConnection(url: root.appendingPathComponent("spatial.sqlite3"))
        try database.execute("DELETE FROM store_access_policy")
        XCTAssertThrowsError(try SpatialStore(root: root)) { XCTAssertEqual($0 as? StoreError, .accessScopeMismatch) }
    }
    func testConcurrentAdmissionCannotOverwriteDurableSuspension() async throws {
        let root = temporary(), scope = try scope(), time = instant, authority = SyntheticLocalAuthority(lease(try self.scope()))
        let config = StoreAccessConfiguration.managed(scope: scope, authority: authority)
        let a = try SpatialStore(root: root, accessConfiguration: config, accessClock: { time })
        _ = try await a.create(Fixtures.twoRooms())
        let b = try SpatialStore(root: root, accessConfiguration: config, accessClock: { time })
        let entered = DispatchSemaphore(value: 0), resume = DispatchSemaphore(value: 0), suspensionFinished = DispatchSemaphore(value: 0)
        authority.blockNext(entered: entered, resume: resume)
        let reading = Task.detached { try await a.listDrafts() }
        XCTAssertEqual(entered.wait(timeout: .now() + 3), .success)
        let suspending = Task.detached { try await b.suspendManagedAccess(); suspensionFinished.signal() }
        // Suspension must wait for the already admitted transaction. It must never be
        // overwritten by A's older lastObservedAt bookkeeping after B commits.
        XCTAssertEqual(suspensionFinished.wait(timeout: .now() + 0.1), .timedOut)
        resume.signal(); _ = try await reading.value; try await suspending.value
        do { _ = try await a.listDrafts(); XCTFail("Stale admission erased suspension") }
        catch { XCTAssertEqual(error as? StoreError, .localAccessSuspended) }
    }
}
