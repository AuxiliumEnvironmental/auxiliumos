import Foundation
import XCTest
import SpatialCore
@testable import SpatialPersistence
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

final class DraftRecoveryTests: XCTestCase {
    private enum Injected: Error { case interrupted }
    private func temporary() -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("spatial-draft-recovery-" + UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }; return root
    }
    private func orphan(_ root: URL, boundary: CommitBoundary = .beforeDatabaseCommit) async throws -> RecoverableDraft {
        let good = try SpatialStore(root: root), initial = Fixtures.twoRooms()
        _ = try await good.create(initial)
        var editor = try EditorSession(initial)
        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Interrupted correction"), expectedRevision: 1)
        let broken = try SpatialStore(root: root, faultInjector: { if $0 == boundary { throw Injected.interrupted } })
        do { _ = try await broken.save(editor.document, expectedRevision: 1); XCTFail("No injected interruption") }
        catch { XCTAssertTrue(error is Injected) }
        let candidates = try await good.recoverableDrafts()
        return try XCTUnwrap(candidates.first)
    }
    func testExplicitRecoveryCreatesReviewRequiredCopyAndPreservesOriginalBytes() async throws {
        for boundary in [CommitBoundary.stagedFileSynced, .immutableFilePromoted, .beforeDatabaseCommit] {
            let root = temporary(), candidate = try await orphan(root, boundary: boundary), store = try SpatialStore(root: root)
            XCTAssertEqual(candidate.originalRevision, 2)
            let recovered = try await store.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "recovered-copy")
            XCTAssertEqual(recovered.documentID, "recovered-copy"); XCTAssertEqual(recovered.revision, 1)
            XCTAssertNil(recovered.parentRevision); XCTAssertEqual(recovered.reviewState, .needsReview)
            XCTAssertEqual(recovered.floors[0].rooms[0].label, "Interrupted correction")
            let reopened = try SpatialStore(root: root), original = try await reopened.open(documentID: candidate.originalDocumentID)
            XCTAssertEqual(original, Fixtures.twoRooms())
            let lineage = try await reopened.recoveredDraftSource(documentID: "recovered-copy")
            XCTAssertEqual(lineage?.originalDocumentID, candidate.originalDocumentID)
            XCTAssertEqual(lineage?.originalRevision, 2); XCTAssertEqual(lineage?.sha256, candidate.sha256)
            XCTAssertEqual(lineage?.byteCount, candidate.byteCount)
            let remaining = try await reopened.recoverableDrafts(); XCTAssertTrue(remaining.isEmpty)
            let again = try await reopened.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "recovered-copy")
            XCTAssertEqual(again, recovered)
            do { _ = try await reopened.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "other-copy"); XCTFail("Duplicate recovery retargeted") }
            catch { XCTAssertEqual(error as? StoreError, .alreadyExists) }
        }
    }
    func testRecoveryCopyAndOriginalReferenceCommitAtomicallyAcrossFaults() async throws {
        for boundary in [CommitBoundary.stagedFileSynced, .immutableFilePromoted, .beforeDatabaseCommit, .databaseCommitted] {
            let root = temporary(), candidate = try await orphan(root)
            let broken = try SpatialStore(root: root, faultInjector: { if $0 == boundary { throw Injected.interrupted } })
            do { _ = try await broken.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "recovered-copy"); XCTFail("No fault") }
            catch { XCTAssertTrue(error is Injected) }
            let reopened = try SpatialStore(root: root), drafts = try await reopened.listDrafts()
            XCTAssertEqual(drafts.count, boundary == .databaseCommitted ? 2 : 1)
            let recovered = try await reopened.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "recovered-copy")
            XCTAssertEqual(recovered.revision, 1)
            let source = try await reopened.recoveredDraftSource(documentID: recovered.documentID)
            XCTAssertEqual(source?.sha256, candidate.sha256)
        }
    }
    func testRawIntentIsNeverMistakenForUnacknowledgedDraft() async throws {
        let root = temporary(), broken = try SpatialStore(root: root, faultInjector: { if $0 == .stagedFileSynced { throw Injected.interrupted } })
        // This synthetic payload happens to be geometry-shaped; its retained capture intent
        // still routes it exclusively through raw-capture recovery, never draft recovery.
        do { _ = try await broken.archiveCapture(Fixtures.twoRooms().encoded(), sourceID: "raw-source", kind: .roomPlanRaw) } catch {}
        let reopened = try SpatialStore(root: root), drafts = try await reopened.recoverableDrafts(), captures = try await reopened.recoverableCaptures()
        XCTAssertTrue(drafts.isEmpty); XCTAssertEqual(captures.count, 1)
        do { _ = try await reopened.recoverDraftCopy(artifactID: captures[0].artifactID, newDocumentID: "incorrect-copy"); XCTFail("Raw capture attached as draft") }
        catch { XCTAssertEqual(error as? StoreError, .invalidIdentifier) }
    }
    func testInvalidCandidateAndExistingDraftCannotBeOverwritten() async throws {
        let root = temporary(), candidate = try await orphan(root), store = try SpatialStore(root: root)
        do { _ = try await store.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: candidate.originalDocumentID); XCTFail("Existing draft overwritten") }
        catch { XCTAssertEqual(error as? StoreError, .alreadyExists) }
        let url = root.appendingPathComponent("artifacts").appendingPathComponent(candidate.artifactID + ".artifact")
        try Data("invalid bytes".utf8).write(to: url)
        let candidates = try await store.recoverableDrafts(); XCTAssertTrue(candidates.isEmpty)
        do { _ = try await store.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "invalid-copy"); XCTFail("Invalid candidate admitted") } catch {}
        let actual = try await store.open(documentID: candidate.originalDocumentID)
        XCTAssertEqual(actual, Fixtures.twoRooms())
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
    }
    func testInventoryPreservesIrreplaceableSourcesHistoryAndPendingBytes() async throws {
        let root = temporary(), candidate = try await orphan(root), store = try SpatialStore(root: root, limits: .init(undoDepth: 7))
        _ = try await store.archiveCapture(Data("synthetic raw".utf8), sourceID: "raw-source", kind: .roomPlanRaw)
        let frozen = try await store.freeze(documentID: Fixtures.twoRooms().documentID, revision: 1)
        let queued = try await store.enqueuePublication(snapshotID: frozen.snapshotID, destination: .init(system: .moldo, contextID: "synthetic-project"), expectedPublishedRevision: nil, clientRequestID: "pending")
        _ = try await store.recoverDraftCopy(artifactID: candidate.artifactID, newDocumentID: "recovered-copy")
        let before = try await store.storageInventory(), after = try await store.storageInventory()
        XCTAssertEqual(before, after); XCTAssertEqual(before.draftCount, 2); XCTAssertEqual(before.pendingPublicationCount, 1)
        XCTAssertEqual(before.publicationBytes, queued.request.archiveByteCount)
        XCTAssertEqual(before.recoveredSourceBytes, candidate.byteCount); XCTAssertEqual(before.captureBytes, 13)
        XCTAssertEqual(before.undoHistoryLimit, 7); XCTAssertEqual(before.reclaimableCacheBytes, 0)
    }
    func testFIFOArchiveEntryIsRejectedWithoutBlocking() async throws {
        let root = temporary(), store = try SpatialStore(root: root), initial = Fixtures.twoRooms()
        _ = try await store.create(initial)
        let files = try FileManager.default.contentsOfDirectory(at: root.appendingPathComponent("artifacts"), includingPropertiesForKeys: nil)
        let artifact = try XCTUnwrap(files.first)
        try FileManager.default.removeItem(at: artifact)
        XCTAssertEqual(artifact.path.withCString { mkfifo($0, 0o600) }, 0)
        let start = ProcessInfo.processInfo.systemUptime
        do { _ = try await store.open(documentID: initial.documentID); XCTFail("FIFO read admitted") }
        catch { XCTAssertEqual(error as? StoreError, .corruptArtifact) }
        XCTAssertLessThan(ProcessInfo.processInfo.systemUptime - start, 1)
    }
    func testSemanticAreaSchemaOnePointOnePersistsAndCannotBeDowngradedSilently() async throws {
        var document = Fixtures.twoRooms()
        document.schemaVersion = "1.1.0"
        document.floors[0].areas = [.init(id: "area-a", label: "Selected zone", polygon: [.init(x: 0.5, z: 0.5), .init(x: 1.5, z: 0.5), .init(x: 1.5, z: 1.5)], provenance: .init(origin: .edited, sourceIDs: []))]
        let store = try SpatialStore(root: temporary())
        _ = try await store.create(document)
        let actual = try await store.open(documentID: document.documentID)
        XCTAssertEqual(actual, document)
        document.schemaVersion = "1.0.0"
        XCTAssertThrowsError(try SpatialDocumentReader.decode(document.encoded()))
    }
    func testSemanticAreaCorrectionReceiptsPersistThroughRealSaveUndoRedoAndFloorMove() async throws {
        let root = temporary(), store = try SpatialStore(root: root), initial = Fixtures.twoRooms()
        _ = try await store.create(initial)
        var area = SemanticArea(id: "area-a", label: "Initial zone", polygon: [.init(x: 0.5, z: 0.5), .init(x: 1.5, z: 0.5), .init(x: 1.5, z: 1.5)], provenance: .init(origin: .edited))
        var editor = try EditorSession(initial)
        try editor.apply(.setArea(floorID: "floor-1", area: area), expectedRevision: 1)
        _ = try await store.save(editor.document, expectedRevision: 1, receipt: editor.lastReceipt)
        let added = try await store.editReceipt(documentID: initial.documentID, revision: 2)
        // Lineage maps pre-existing source IDs. A newly created area has no old overlay
        // anchor to remap, but its exact creation receipt and geometry must be durable.
        XCTAssertEqual(added, editor.lastReceipt)
        let addedDocument = try await store.open(documentID: initial.documentID)
        XCTAssertEqual(addedDocument.floors[0].areas.first?.id, area.id)
        area.label = "Corrected zone"
        try editor.apply(.setArea(floorID: "floor-1", area: area), expectedRevision: 2)
        _ = try await store.save(editor.document, expectedRevision: 2, receipt: editor.lastReceipt)
        let updated = try await store.editReceipt(documentID: initial.documentID, revision: 3)
        XCTAssertTrue(updated?.mappings.contains { $0.objectKind == "area" && $0.sourceID == area.id && $0.resultingIDs == [area.id] } == true)
        try editor.apply(.updateFloor(floorID: "floor-1", label: "Upper level", elevation: 3), expectedRevision: 3)
        _ = try await store.save(editor.document, expectedRevision: 3, receipt: editor.lastReceipt)
        let reopened = try SpatialStore(root: root)
        let moved = try await reopened.editReceipt(documentID: initial.documentID, revision: 4)
        XCTAssertTrue(moved?.mappings.contains { $0.objectKind == "area" && $0.sourceID == area.id } == true)
        try editor.apply(.deleteArea(floorID: "floor-1", areaID: area.id), expectedRevision: 4)
        _ = try await reopened.save(editor.document, expectedRevision: 4, receipt: editor.lastReceipt)
        let removed = try await reopened.editReceipt(documentID: initial.documentID, revision: 5)
        XCTAssertTrue(removed?.mappings.contains { $0.objectKind == "area" && $0.resultingIDs.isEmpty } == true)
        let undo = try await reopened.undo(documentID: initial.documentID, expectedRevision: 5)
        XCTAssertEqual(undo.floors[0].areas.first?.label, "Corrected zone")
        let again = try SpatialStore(root: root)
        let undoReceipt = try await again.editReceipt(documentID: initial.documentID, revision: 6)
        XCTAssertEqual(undoReceipt, EditReceipt.restoring(from: editor.document, to: undo))
        let redo = try await again.redo(documentID: initial.documentID, expectedRevision: 6)
        XCTAssertTrue(redo.floors[0].areas.isEmpty)
        let redoReceipt = try await again.editReceipt(documentID: initial.documentID, revision: 7)
        XCTAssertTrue(redoReceipt?.mappings.contains { $0.objectKind == "area" && $0.resultingIDs.isEmpty } == true)
    }
}
