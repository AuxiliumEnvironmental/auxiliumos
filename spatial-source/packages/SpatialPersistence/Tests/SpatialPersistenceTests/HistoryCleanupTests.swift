import Foundation
import XCTest
import SpatialCore
@testable import SpatialPersistence
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

final class HistoryCleanupTests: XCTestCase {
    private enum Injected: Error { case interrupted }
    private let documentID = "synthetic-two-rooms"
    private func temporary() -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("spatial-history-cleanup-" + UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }; return root
    }
    private func seed(_ root: URL, revisions: Int = 120) async throws -> SpatialStore {
        let store = try SpatialStore(root: root, limits: .init(undoDepth: 2))
        _ = try await store.create(Fixtures.twoRooms())
        var editor = try EditorSession(Fixtures.twoRooms())
        for number in 2...revisions {
            try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Synthetic revision \(number)"), expectedRevision: number - 1)
            _ = try await store.save(editor.document, expectedRevision: number - 1, receipt: editor.lastReceipt)
        }
        return store
    }
    func testConfirmedCleanupBoundsUnpinnedHistoryButPreservesEveryRequiredSourceAndReceipt() async throws {
        let root = temporary(), store = try await seed(root)
        _ = try await store.archiveCapture(Data("private synthetic raw".utf8), sourceID: "raw-source", kind: .roomPlanRaw)
        let pinned = try await store.freeze(documentID: documentID, revision: 3)
        let frozenBytes = try await store.readFrozen(snapshotID: pinned.snapshotID)
        let queued = try await store.enqueuePublication(snapshotID: pinned.snapshotID,
            destination: .init(system: .auxiliumos, contextID: "test-project"), expectedPublishedRevision: nil, clientRequestID: "pending")
        let publicationBytes = try await store.publicationArchive(requestID: queued.request.clientRequestID)
        let before = try await store.storageInventory(), preview = try await store.previewHistoryCleanup()
        XCTAssertFalse(preview.snapshots.isEmpty)
        XCTAssertFalse(preview.snapshots.contains { [1,3,118,119,120].contains($0.revision) })
        XCTAssertEqual(preview.snapshots.count, 15)
        let result = try await store.applyHistoryCleanup(preview)
        XCTAssertTrue(result.completed); XCTAssertEqual(result.removedSnapshots, 15)
        XCTAssertEqual(result.bytesRemoved, preview.bytesToRemove)
        let after = try await store.storageInventory()
        XCTAssertEqual(after.geometryBytes, before.geometryBytes - result.bytesRemoved)
        XCTAssertEqual(after.captureBytes, before.captureBytes); XCTAssertEqual(after.publicationBytes, before.publicationBytes)
        XCTAssertEqual(after.revisionCount, before.revisionCount, "Revision/lineage ledger is not deleted")
        let exactFrozen = try await store.readFrozen(snapshotID: pinned.snapshotID), exactPublication = try await store.publicationArchive(requestID: "pending")
        XCTAssertEqual(exactFrozen, frozenBytes); XCTAssertEqual(exactPublication, publicationBytes)
        let receipt = try await store.editReceipt(documentID: documentID, revision: 2)
        XCTAssertEqual(receipt?.sourceRevision, 1); XCTAssertEqual(receipt?.resultingRevision, 2)
        let current = try await store.open(documentID: documentID); XCTAssertEqual(current.revision, 120)
        let undo = try await store.undo(documentID: documentID, expectedRevision: 120)
        XCTAssertEqual(undo.floors[0].rooms[0].label, "Synthetic revision 119")
        let redo = try await store.redo(documentID: documentID, expectedRevision: 121)
        XCTAssertEqual(redo.floors[0].rooms[0].label, "Synthetic revision 120")
        let repeatResult = try await store.applyHistoryCleanup(preview)
        XCTAssertEqual(repeatResult, result)
        for snapshot in preview.snapshots {
            XCTAssertFalse(FileManager.default.fileExists(atPath: root.appendingPathComponent("artifacts/\(snapshot.artifactID).artifact").path))
            do { _ = try await store.freeze(documentID: snapshot.documentID, revision: snapshot.revision); XCTFail("Retired content was frozen") }
            catch { XCTAssertEqual(error as? StoreError, .revisionRetired) }
        }
    }
    func testPreviewBecomesStaleAfterFreezeOrCorrectionAndDoesNotRemoveAnything() async throws {
        let root = temporary(), a = try await seed(root), b = try SpatialStore(root: root)
        let preview = try await a.previewHistoryCleanup(), candidate = try XCTUnwrap(preview.snapshots.first)
        let pinned = try await b.freeze(documentID: documentID, revision: candidate.revision)
        do { _ = try await a.applyHistoryCleanup(preview); XCTFail("Pin race not detected") }
        catch { XCTAssertEqual(error as? HistoryCleanupError, .stalePreview) }
        let retained = try await a.readFrozen(snapshotID: pinned.snapshotID)
        XCTAssertEqual(ArtifactDigest.sha256(retained), candidate.sha256)
        let next = try await a.previewHistoryCleanup()
        var editor = try EditorSession(try await b.open(documentID: documentID))
        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "New correction"), expectedRevision: 120)
        _ = try await b.save(editor.document, expectedRevision: 120, receipt: editor.lastReceipt)
        do { _ = try await a.applyHistoryCleanup(next); XCTFail("Changed source not detected") }
        catch { XCTAssertEqual(error as? HistoryCleanupError, .stalePreview) }
        let inventory = try await a.storageInventory(); XCTAssertEqual(inventory.retiredHistoryCount, 0)
    }
    func testCommittedRetirementBlocksLateFreezeBeforeAnyFileDeletion() async throws {
        let root = temporary(), store = try await seed(root), preview = try await store.previewHistoryCleanup()
        let interrupted = try SpatialStore(root: root, faultInjector: { if $0 == .historyMetadataCommitted { throw Injected.interrupted } })
        do { _ = try await interrupted.applyHistoryCleanup(preview); XCTFail("Expected interruption") } catch { XCTAssertTrue(error is Injected) }
        let candidate = try XCTUnwrap(preview.snapshots.first)
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent("artifacts/\(candidate.artifactID).artifact").path))
        do { _ = try await store.freeze(documentID: documentID, revision: candidate.revision); XCTFail("Late freeze pinned retired content") }
        catch { XCTAssertEqual(error as? StoreError, .revisionRetired) }
        let pending = try await store.pendingHistoryCleanups()
        XCTAssertEqual(pending.first?.pendingSnapshots, preview.snapshots.count)
        let final = try await store.resumeHistoryCleanup(operationID: preview.operationID)
        XCTAssertTrue(final.completed)
    }
    func testEveryCleanupBoundaryCanResumeWithoutMissingRequiredReference() async throws {
        for boundary in [CommitBoundary.historyBeforeMetadataCommit, .historyMetadataCommitted, .historyFileRemoved, .historyRemovalRecorded] {
            let root = temporary(), store = try await seed(root), preview = try await store.previewHistoryCleanup()
            let broken = try SpatialStore(root: root, faultInjector: { if $0 == boundary { throw Injected.interrupted } })
            do { _ = try await broken.applyHistoryCleanup(preview); XCTFail("No injected fault") } catch { XCTAssertTrue(error is Injected) }
            let reopened = try SpatialStore(root: root), source = try await reopened.open(documentID: documentID)
            XCTAssertEqual(source.revision, 120)
            let inventory = try await reopened.storageInventory()
            XCTAssertEqual(inventory.retiredHistoryCount, boundary == .historyBeforeMetadataCommit ? 0 : preview.snapshots.count)
            let resumed = try await reopened.applyHistoryCleanup(preview)
            XCTAssertTrue(resumed.completed); XCTAssertEqual(resumed.bytesRemoved, preview.bytesToRemove)
            let remaining = try await reopened.previewHistoryCleanup()
            XCTAssertTrue(remaining.snapshots.isEmpty)
        }
    }
    func testRawRecoveryOrphansAndRecoveredSourcesAreNeverSwept() async throws {
        let root = temporary(), store = try await seed(root)
        let broken = try SpatialStore(root: root, faultInjector: { if $0 == .stagedFileSynced { throw Injected.interrupted } })
        do { _ = try await broken.archiveCapture(Data("raw orphan".utf8), sourceID: "raw-orphan", kind: .roomPlanRaw) } catch {}
        var editor = try EditorSession(try await store.open(documentID: documentID))
        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Unacknowledged"), expectedRevision: 120)
        do { _ = try await broken.save(editor.document, expectedRevision: 120); XCTFail("No fault") } catch {}
        let candidates = try await store.recoverableDrafts(), candidate = try XCTUnwrap(candidates.first)
        _ = try await store.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "recovered-document")
        let sourceBefore = try await store.recoveredDraftSource(documentID: "recovered-document")
        let rawBefore = try await store.recoverableCaptures()
        let preview = try await store.previewHistoryCleanup(), result = try await store.applyHistoryCleanup(preview)
        XCTAssertTrue(result.completed)
        let sourceAfter = try await store.recoveredDraftSource(documentID: "recovered-document"), rawAfter = try await store.recoverableCaptures()
        XCTAssertEqual(sourceBefore, sourceAfter); XCTAssertEqual(rawBefore, rawAfter)
        XCTAssertFalse(preview.snapshots.contains { $0.artifactID == candidate.artifactID })
    }
    func testByteMismatchSymlinkAndFIFOAreRejectedBeforeRetirement() async throws {
        let root = temporary(), store = try await seed(root), preview = try await store.previewHistoryCleanup()
        let snapshot = try XCTUnwrap(preview.snapshots.first)
        let artifact = root.appendingPathComponent("artifacts/\(snapshot.artifactID).artifact")
        let original = try Data(contentsOf: artifact)
        let outside = root.appendingPathComponent("retained-outside.json")
        try original.write(to: outside)
        for attack in ["mismatch", "symlink", "fifo"] {
            try FileManager.default.removeItem(at: artifact)
            if attack == "mismatch" { try Data(repeating: 32, count: original.count).write(to: artifact) }
            else if attack == "symlink" { try FileManager.default.createSymbolicLink(at: artifact, withDestinationURL: outside) }
            else { XCTAssertEqual(artifact.path.withCString { mkfifo($0, 0o600) }, 0) }
            do { _ = try await store.applyHistoryCleanup(preview); XCTFail("Unsafe target accepted") } catch {}
            let inventory = try await store.storageInventory(); XCTAssertEqual(inventory.retiredHistoryCount, 0)
            let externalBytes = try Data(contentsOf: outside); XCTAssertEqual(externalBytes, original)
        }
        try FileManager.default.removeItem(at: artifact); try original.write(to: artifact)
        let final = try await store.applyHistoryCleanup(preview); XCTAssertTrue(final.completed)
    }
    func testProtectionAndWrongStorePreviewFailClosed() async throws {
        let root = temporary(), store = try await seed(root), preview = try await store.previewHistoryCleanup()
        await store.setProtectedDataAvailable(false)
        do { _ = try await store.applyHistoryCleanup(preview); XCTFail("Locked cleanup accepted") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        await store.setProtectedDataAvailable(true)
        let other = try await seed(temporary())
        do { _ = try await other.applyHistoryCleanup(preview); XCTFail("Other root confirmation accepted") }
        catch { XCTAssertEqual(error as? HistoryCleanupError, .stalePreview) }
        let inventory = try await store.storageInventory(); XCTAssertEqual(inventory.retiredHistoryCount, 0)
    }
    func testCleanupBatchIsBoundedAndDoesNotTouchOtherDocuments() async throws {
        let root = temporary(), store = try await seed(root, revisions: 220)
        var other = Fixtures.twoRooms(); other.documentID = "untouched-document"
        _ = try await store.create(other)
        let preview = try await store.previewHistoryCleanup(documentID: documentID)
        XCTAssertEqual(preview.snapshots.count, 100)
        XCTAssertLessThanOrEqual(preview.bytesToRemove, preview.maximumBatchBytes)
        _ = try await store.applyHistoryCleanup(preview)
        let next = try await store.previewHistoryCleanup(documentID: documentID)
        XCTAssertEqual(next.snapshots.count, 16)
        _ = try await store.applyHistoryCleanup(next)
        let remaining = try await store.previewHistoryCleanup(documentID: documentID)
        XCTAssertTrue(remaining.snapshots.isEmpty)
        let intact = try await store.open(documentID: other.documentID); XCTAssertEqual(intact, other)
    }
    func testCorruptMetadataCountsThrowInsteadOfOverflowingOrRemovingFiles() async throws {
        let root = temporary(), store = try await seed(root), preview = try await store.previewHistoryCleanup()
        XCTAssertGreaterThan(preview.snapshots.count, 1)
        let second = preview.snapshots[1]
        let database = try SQLiteConnection(url: root.appendingPathComponent("spatial.sqlite3"))
        try database.execute("UPDATE artifacts SET byte_count=? WHERE id=?", [.integer(Int.max), .text(second.artifactID)])
        do { _ = try await store.previewHistoryCleanup(); XCTFail("Unbounded metadata count admitted") }
        catch { XCTAssertEqual(error as? HistoryCleanupError, .unsafeCandidate) }
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent("artifacts/\(second.artifactID).artifact").path))
        try database.execute("UPDATE artifacts SET byte_count=? WHERE id=?", [.integer(second.byteCount), .text(second.artifactID)])
        let interrupted = try SpatialStore(root: root, faultInjector: { if $0 == .historyMetadataCommitted { throw Injected.interrupted } })
        do { _ = try await interrupted.applyHistoryCleanup(preview); XCTFail("No injected interruption") } catch { XCTAssertTrue(error is Injected) }
        try database.execute("UPDATE artifacts SET byte_count=? WHERE id=?", [.integer(Int.max), .text(second.artifactID)])
        do { _ = try await store.pendingHistoryCleanups(); XCTFail("Corrupt pending sum admitted") }
        catch { XCTAssertEqual(error as? HistoryCleanupError, .invalidPreview) }
        do { _ = try await store.resumeHistoryCleanup(operationID: preview.operationID); XCTFail("Corrupt cleanup resumed") }
        catch { XCTAssertEqual(error as? HistoryCleanupError, .invalidPreview) }
        try database.execute("UPDATE artifacts SET byte_count=? WHERE id=?", [.integer(second.byteCount), .text(second.artifactID)])
        try database.execute("UPDATE history_cleanup_operations SET snapshot_count=? WHERE id=?", [.integer(Int.max), .text(preview.operationID)])
        do { _ = try await store.pendingHistoryCleanups(); XCTFail("Corrupt journal count admitted") }
        catch { XCTAssertEqual(error as? HistoryCleanupError, .invalidPreview) }
    }
}
