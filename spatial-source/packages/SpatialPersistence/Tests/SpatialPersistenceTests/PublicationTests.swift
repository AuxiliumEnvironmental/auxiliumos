import Foundation
import XCTest
import SpatialCore
import SpatialInterop
@testable import SpatialPersistence

final class PublicationTests: XCTestCase {
    private let instant = Date(timeIntervalSince1970: 2_000_000_000)
    private enum Injected: Error { case interruption }
    private func temporary() -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("spatial-outbox-" + UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }; return root
    }
    private func destination(_ system: PublicationDestination.System = .auxiliumos, _ context: String = "project-a") throws -> PublicationDestination {
        try PublicationDestination(system: system, contextID: context)
    }
    private func seed(_ store: SpatialStore, id: String = "request-a", destination: PublicationDestination? = nil) async throws -> PublicationSummary {
        let document = Fixtures.twoRooms()
        _ = try await store.create(document)
        let frozen = try await store.freeze(documentID: document.documentID, revision: document.revision)
        return try await store.enqueuePublication(snapshotID: frozen.snapshotID, destination: destination ?? self.destination(),
            expectedPublishedRevision: nil, clientRequestID: id)
    }
    private func coordinator(_ store: SpatialStore, _ receiver: SyntheticPublicationReceiver) -> PublicationCoordinator {
        let time = instant
        return PublicationCoordinator(store: store, transport: receiver, now: { time })
    }
    private func grant(_ receiver: SyntheticPublicationReceiver, _ summary: PublicationSummary) async {
        await receiver.grant(documentID: summary.request.sourceDocumentID, destination: summary.request.destination)
    }

    func testDisabledPublisherLeavesExactPendingIntentAndNeverClaimsSync() async throws {
        let store = try SpatialStore(root: temporary()), summary = try await seed(store)
        let result = try await PublicationCoordinator(store: store).deliver(requestID: summary.request.clientRequestID)
        XCTAssertEqual(result, .notConnected)
        let actual = try await store.publication(requestID: summary.request.clientRequestID)
        XCTAssertEqual(actual.state, .queued); XCTAssertEqual(actual.attempts, 0)
        XCTAssertFalse(actual.receiverConfirmed); XCTAssertNil(actual.receipt)
    }
    func testQueuedBytesAndDestinationRemainExactAcrossEditAndReopen() async throws {
        let root = temporary(), store = try SpatialStore(root: root), summary = try await seed(store)
        let original = try await store.publicationArchive(requestID: "request-a")
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Later private correction"), expectedRevision: 1)
        _ = try await store.save(editor.document, expectedRevision: 1)
        let reopened = try SpatialStore(root: root)
        let same = try await reopened.publicationArchive(requestID: "request-a")
        let latest = try await reopened.open(documentID: editor.document.documentID)
        XCTAssertEqual(same, original); XCTAssertEqual(latest.revision, 2)
        let imported = try ExchangeImporter.importArchive(same)
        XCTAssertEqual(imported.document.revision, 1)
        XCTAssertEqual(imported.manifestSHA256, summary.request.manifestSHA256)
        XCTAssertEqual(ArtifactDigest.sha256(same), summary.request.archiveSHA256)
    }
    func testIdempotentQueueRejectsChangedDestinationExpectedRevisionAndSource() async throws {
        let store = try SpatialStore(root: temporary()), summary = try await seed(store)
        let same = try await store.enqueuePublication(snapshotID: summary.snapshotID, destination: summary.request.destination,
            expectedPublishedRevision: nil, clientRequestID: "request-a")
        XCTAssertEqual(same, summary)
        for target in [try destination(.moldo), try destination(.auxiliumos, "project-b")] {
            do { _ = try await store.enqueuePublication(snapshotID: summary.snapshotID, destination: target, expectedPublishedRevision: nil, clientRequestID: "request-a"); XCTFail("Retargeted existing intent") }
            catch { XCTAssertEqual(error as? PublicationError, .identityConflict) }
        }
        do { _ = try await store.enqueuePublication(snapshotID: summary.snapshotID, destination: summary.request.destination, expectedPublishedRevision: 1, clientRequestID: "request-a"); XCTFail("Changed version expectation") }
        catch { XCTAssertEqual(error as? PublicationError, .identityConflict) }
    }
    func testOutboxCommitFaultsNeverAcknowledgePartialPayload() async throws {
        for boundary in [CommitBoundary.stagedFileSynced, .immutableFilePromoted, .beforeDatabaseCommit, .databaseCommitted] {
            let root = temporary(), store = try SpatialStore(root: root), initial = Fixtures.twoRooms()
            _ = try await store.create(initial)
            let frozen = try await store.freeze(documentID: initial.documentID, revision: 1)
            let broken = try SpatialStore(root: root, faultInjector: { if $0 == boundary { throw Injected.interruption } })
            do { _ = try await broken.enqueuePublication(snapshotID: frozen.snapshotID, destination: destination(), expectedPublishedRevision: nil, clientRequestID: "request-a"); XCTFail("Expected interrupted queue") }
            catch { XCTAssertTrue(error is Injected) }
            let reopened = try SpatialStore(root: root), entries = try await reopened.listPublications()
            XCTAssertEqual(entries.count, boundary == .databaseCommitted ? 1 : 0)
            if !entries.isEmpty {
                let bytes = try await reopened.publicationArchive(requestID: "request-a")
                XCTAssertEqual(ArtifactDigest.sha256(bytes), entries[0].request.archiveSHA256)
            }
            let saved = try await reopened.open(documentID: initial.documentID)
            XCTAssertEqual(saved, initial)
        }
    }
    func testAuthenticatedExactReceiptIsDurableButNotReleased() async throws {
        let root = temporary(), store = try SpatialStore(root: root), summary = try await seed(store)
        let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, summary)
        let result = try await coordinator(store, receiver).deliver(requestID: "request-a")
        guard case .delivered(let receipt) = result else { return XCTFail("No exact receipt") }
        let reopened = try SpatialStore(root: root), actual = try await reopened.publication(requestID: "request-a")
        XCTAssertTrue(actual.receiverConfirmed); XCTAssertEqual(actual.receipt, receipt)
        XCTAssertEqual(receipt.disposition, "internal-draft"); XCTAssertEqual(receipt.request, summary.request)
        let again = try await coordinator(reopened, receiver).deliver(requestID: "request-a")
        XCTAssertEqual(again, .alreadyFinished)
        let stats = await receiver.stats(); XCTAssertEqual(stats.accepted, 1); XCTAssertEqual(stats.uploads, 1)
    }
    func testLostAcknowledgementReconcilesAfterRestartWithoutDuplicateUpload() async throws {
        let root = temporary(), store = try SpatialStore(root: root), summary = try await seed(store)
        let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, summary); await receiver.loseNextAcknowledgement()
        let result = try await coordinator(store, receiver).deliver(requestID: "request-a")
        XCTAssertEqual(result, .blocked(.transientFailure))
        let reopened = try SpatialStore(root: root)
        _ = try await reopened.retryPublication(requestID: "request-a")
        let retry = try await coordinator(reopened, receiver).deliver(requestID: "request-a")
        guard case .delivered = retry else { return XCTFail("Reconciliation failed") }
        let stats = await receiver.stats(); XCTAssertEqual(stats.accepted, 1); XCTAssertEqual(stats.uploads, 1); XCTAssertEqual(stats.reconciled, 2)
    }
    func testPendingIsNotAcceptedAndPollingDoesNotUploadAgainWhilePending() async throws {
        let store = try SpatialStore(root: temporary()), summary = try await seed(store)
        let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, summary); await receiver.setPending(true)
        let first = try await coordinator(store, receiver).deliver(requestID: "request-a")
        let second = try await coordinator(store, receiver).deliver(requestID: "request-a")
        XCTAssertEqual(first, .awaitingReceipt); XCTAssertEqual(second, .awaitingReceipt)
        let pending = try await store.publication(requestID: "request-a")
        XCTAssertEqual(pending.state, .awaitingReceipt); XCTAssertFalse(pending.receiverConfirmed)
        let stats = await receiver.stats(); XCTAssertEqual(stats.uploads, 1); XCTAssertEqual(stats.accepted, 0)
        await receiver.setPending(false)
        let final = try await coordinator(store, receiver).deliver(requestID: "request-a")
        guard case .delivered = final else { return XCTFail("Pending draft never resumed") }
    }
    func testForgedReceiptWithExactHashesIsNotAuthenticated() async throws {
        let store = try SpatialStore(root: temporary()), summary = try await seed(store)
        let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, summary); await receiver.forgeNextAcknowledgement()
        let result = try await coordinator(store, receiver).deliver(requestID: "request-a")
        XCTAssertEqual(result, .blocked(.invalidReceipt))
        let denied = try await store.publication(requestID: "request-a")
        XCTAssertFalse(denied.receiverConfirmed); XCTAssertNil(denied.receipt)
        _ = try await store.retryPublication(requestID: "request-a")
        let reconciled = try await coordinator(store, receiver).deliver(requestID: "request-a")
        guard case .delivered = reconciled else { return XCTFail("Exact authenticated record should reconcile") }
    }
    func testAuthenticationExpiryAndRevocationAreRecheckedAtFinalize() async throws {
        for revoked in [false, true] {
            let store = try SpatialStore(root: temporary()), summary = try await seed(store)
            let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, summary)
            if revoked { await receiver.revokeDuringNextUpload() } else { await receiver.expireDuringNextUpload() }
            let result = try await coordinator(store, receiver).deliver(requestID: "request-a")
            XCTAssertEqual(result, .blocked(revoked ? .authorityDenied : .authenticationRequired))
            let state = try await store.publication(requestID: "request-a")
            XCTAssertEqual(state.state, revoked ? .denied : .needsAuthentication)
            XCTAssertFalse(state.receiverConfirmed)
            let stats = await receiver.stats(); XCTAssertEqual(stats.accepted, 0)
            let bytes = try await store.publicationArchive(requestID: "request-a")
            XCTAssertEqual(ArtifactDigest.sha256(bytes), summary.request.archiveSHA256)
        }
    }
    func testMoldoIdentityDoesNotGrantOSOrOtherProjectOrSourceAccess() async throws {
        let store = try SpatialStore(root: temporary()), summary = try await seed(store)
        let receiver = SyntheticPublicationReceiver(now: instant)
        try await receiver.grant(documentID: summary.request.sourceDocumentID, destination: destination(.moldo))
        try await receiver.grant(documentID: summary.request.sourceDocumentID, destination: destination(.auxiliumos, "project-b"))
        await receiver.grant(documentID: "different-source", destination: summary.request.destination)
        let result = try await coordinator(store, receiver).deliver(requestID: "request-a")
        XCTAssertEqual(result, .blocked(.authorityDenied))
        let stats = await receiver.stats(); XCTAssertEqual(stats.uploads, 0)
    }
    func testOutOfOrderRequestCannotReplaceNewerAcceptedSource() async throws {
        let store = try SpatialStore(root: temporary()), old = try await seed(store)
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Newer"), expectedRevision: 1)
        _ = try await store.save(editor.document, expectedRevision: 1)
        let frozen = try await store.freeze(documentID: editor.document.documentID, revision: 2)
        let newer = try await store.enqueuePublication(snapshotID: frozen.snapshotID, destination: old.request.destination, expectedPublishedRevision: nil, clientRequestID: "request-b")
        let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, newer)
        let accepted = try await coordinator(store, receiver).deliver(requestID: "request-b")
        guard case .delivered = accepted else { return XCTFail("New revision not accepted") }
        let stale = try await coordinator(store, receiver).deliver(requestID: "request-a")
        XCTAssertEqual(stale, .blocked(.revisionConflict))
        do { _ = try await store.retryPublication(requestID: "request-a"); XCTFail("Conflict silently retried") }
        catch { XCTAssertEqual(error as? PublicationError, .invalidTransition) }
        let explicitOld = try await store.enqueuePublication(snapshotID: old.snapshotID, destination: old.request.destination, expectedPublishedRevision: 1, clientRequestID: "request-c")
        let stillStale = try await coordinator(store, receiver).deliver(requestID: explicitOld.request.clientRequestID)
        XCTAssertEqual(stillStale, .blocked(.revisionConflict))
        let stats = await receiver.stats(); XCTAssertEqual(stats.accepted, 1)
    }
    func testConcurrentCoordinatorsHaveOneDurableAttemptLease() async throws {
        let root = temporary(), a = try SpatialStore(root: root), summary = try await seed(a)
        let b = try SpatialStore(root: root), receiver = SyntheticPublicationReceiver(now: instant)
        await grant(receiver, summary)
        let ca = coordinator(a, receiver), cb = coordinator(b, receiver)
        async let first = ca.deliver(requestID: "request-a")
        async let second = cb.deliver(requestID: "request-a")
        let results = try await [first, second]
        XCTAssertEqual(results.filter { if case .delivered = $0 { return true }; return false }.count, 1)
        let stats = await receiver.stats(); XCTAssertEqual(stats.accepted, 1); XCTAssertEqual(stats.uploads, 1)
    }
    func testExpiredLeaseIsReclaimedAndOldAttemptCannotAcknowledgeIt() async throws {
        let store = try SpatialStore(root: temporary()); _ = try await seed(store)
        let oldValue = try await store.beginPublication(requestID: "request-a", now: instant, leaseSeconds: 1)
        let old = try XCTUnwrap(oldValue)
        do { _ = try await store.beginPublication(requestID: "request-a", now: instant, leaseSeconds: 1); XCTFail("Duplicate active attempt") }
        catch { XCTAssertEqual(error as? PublicationError, .busy) }
        let later = instant.addingTimeInterval(2)
        let nextValue = try await store.beginPublication(requestID: "request-a", now: later, leaseSeconds: 60)
        let next = try XCTUnwrap(nextValue)
        XCTAssertNotEqual(old.id, next.id); XCTAssertEqual(old.archive, next.archive)
        do { _ = try await store.endPublication(old, now: later); XCTFail("Stale worker changed state") }
        catch { XCTAssertEqual(error as? PublicationError, .cancelled) }
        _ = try await store.endPublication(next, now: later)
        let state = try await store.publication(requestID: "request-a")
        XCTAssertEqual(state.state, .awaitingReceipt); XCTAssertEqual(state.attempts, 2)
    }
    func testProtectedDataBlocksQueueReadAndDeliveryWithoutLosingWork() async throws {
        let store = try SpatialStore(root: temporary()), summary = try await seed(store)
        let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, summary)
        await store.setProtectedDataAvailable(false)
        do { _ = try await store.publicationArchive(requestID: "request-a"); XCTFail("Read while locked") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        do { _ = try await coordinator(store, receiver).deliver(requestID: "request-a"); XCTFail("Delivery while locked") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        await store.setProtectedDataAvailable(true)
        let state = try await store.publication(requestID: "request-a")
        XCTAssertEqual(state.state, .queued)
    }
    func testCancellationRetainsBytesAndCannotPretendRemoteRecall() async throws {
        let store = try SpatialStore(root: temporary()), summary = try await seed(store)
        let cancelled = try await store.cancelPublication(requestID: "request-a", now: instant)
        XCTAssertEqual(cancelled.state, .cancelledLocally); XCTAssertFalse(cancelled.receiverConfirmed)
        let bytes = try await store.publicationArchive(requestID: "request-a")
        XCTAssertEqual(ArtifactDigest.sha256(bytes), summary.request.archiveSHA256)
        let receiver = SyntheticPublicationReceiver(now: instant); await grant(receiver, summary)
        let result = try await coordinator(store, receiver).deliver(requestID: "request-a")
        XCTAssertEqual(result, .alreadyFinished)
        let stats = await receiver.stats(); XCTAssertEqual(stats.uploads, 0)
    }
    func testMigrationTwoRetainsDraftAndFrozenRevision() async throws {
        let root = temporary(), store = try SpatialStore(root: root), document = Fixtures.twoRooms()
        _ = try await store.create(document)
        let frozen = try await store.freeze(documentID: document.documentID, revision: 1)
        let database = try SQLiteConnection(url: root.appendingPathComponent("spatial.sqlite3"))
        try database.execute("DROP TABLE publication_outbox; PRAGMA user_version=2;")
        let reopened = try SpatialStore(root: root)
        let bytes = try await reopened.readFrozen(snapshotID: frozen.snapshotID)
        XCTAssertEqual(ArtifactDigest.sha256(bytes), frozen.sha256)
        let queued = try await reopened.enqueuePublication(snapshotID: frozen.snapshotID, destination: destination(), expectedPublishedRevision: nil, clientRequestID: "migrated")
        XCTAssertEqual(queued.state, .queued)
    }
}
