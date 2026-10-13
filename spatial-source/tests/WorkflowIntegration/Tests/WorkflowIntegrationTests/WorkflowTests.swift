import XCTest
import Foundation
import SpatialCore
import SpatialPersistence
import SpatialInterop
import CaptureKit

/// These exercise synthetic portable contracts. No Apple capture is simulated
/// or counted as a hardware test, and no receiver is connected.
final class WorkflowTests: XCTestCase {
    private func temporaryStore() throws -> (URL, SpatialStore) {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("SpatialWorkflow-" + UUID().uuidString)
        return (url, try SpatialStore(root: url))
    }

    func testCorrectFreezeReopenExportImportRetainsExactOldRevision() async throws {
        let (url, store) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: url) }
        let initial = Fixtures.twoRooms()
        _ = try await store.create(initial)
        var editor = try EditorSession(initial)
        try editor.apply([
            .renameRoom(floorID: "floor-1", roomID: "room-a", label: "Corrected room"),
            .moveOpening(floorID: "floor-1", openingID: "door-a", offset: 1.2),
            .splitWall(floorID: "floor-1", wallID: "w1", offset: 1, newWallID: "w1-right", newNodeID: "split-node")
        ], expectedRevision: 1)
        let corrected = editor.document
        let saved = try await store.save(corrected, expectedRevision: 1, command: "field-correction", receipt: editor.lastReceipt)
        XCTAssertEqual(saved.revision, 2)
        let frozen = try await store.freeze(documentID: corrected.documentID, revision: 2)
        let frozenBytes = try await store.readFrozen(snapshotID: frozen.snapshotID)
        XCTAssertEqual(try GeometryJSONReader.decode(frozenBytes), corrected)

        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Later edit"), expectedRevision: 2)
        _ = try await store.save(editor.document, expectedRevision: 2, receipt: editor.lastReceipt)
        let reopenedStore = try SpatialStore(root: url)
        let reopened = try await reopenedStore.open(documentID: corrected.documentID)
        XCTAssertEqual(reopened.revision, 3)
        let retained = try await reopenedStore.readFrozen(snapshotID: frozen.snapshotID)
        XCTAssertEqual(retained, frozenBytes)

        let exported = try ExchangeExporter.export(document: GeometryJSONReader.decode(retained), floorID: "floor-1")
        let imported = try ExchangeImporter.importArchive(exported.archiveData)
        XCTAssertEqual(imported.document, corrected)
        XCTAssertEqual(imported.document.revision, frozen.revision)
        XCTAssertEqual(imported.manifestSHA256, exported.manifestDigest)
        XCTAssertEqual(try imported.scene(), try SceneBuilder.build(document: corrected, floorID: "floor-1"))
        XCTAssertEqual(try imported.floorplanSVG(), try SVGExporter.render(document: corrected, floorID: "floor-1"))
        let storedReceipt = try await reopenedStore.editReceipt(documentID: corrected.documentID, revision: 2)
        XCTAssertEqual(storedReceipt?.resultingRevision, 2)
    }

    func testRejectedCorrectionCannotAlterDurableDraftOrUndoHistory() async throws {
        let (url, store) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: url) }
        let initial = Fixtures.twoRooms()
        _ = try await store.create(initial)
        var editor = try EditorSession(initial)
        let overlapping = Opening(id: "overlap", wallID: "w6", kind: .door, offset: 1.3,
                                  width: 0.8, bottom: 0, height: 2, provenance: .init(origin: .edited))
        XCTAssertThrowsError(try editor.apply([
            .renameRoom(floorID: "floor-1", roomID: "room-a", label: "Must roll back"),
            .addOpening(floorID: "floor-1", opening: overlapping)
        ], expectedRevision: 1))
        XCTAssertEqual(editor.document, initial)
        XCTAssertFalse(editor.canUndo)
        let reopened = try await store.open(documentID: initial.documentID)
        XCTAssertEqual(reopened, initial)
        let summaries = try await store.listDrafts()
        XCTAssertFalse(try XCTUnwrap(summaries.first).canUndo)
    }

    func testSyntheticNormalizationIsSavedBeforeLifecycleAcknowledgement() async throws {
        let (url, store) = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: url) }
        let points = [Point2(x: 0, z: 0), Point2(x: 5, z: 0), Point2(x: 5, z: 3), Point2(x: 0, z: 3)]
        let surfaces = points.indices.map { index -> CapturedSurface in
            let a = points[index], b = points[(index + 1) % points.count]
            return CapturedSurface(id: "surface-\(index)", kind: .wall, transform: .identity,
                localCorners: [.init(x: a.x, y: 0, z: a.z), .init(x: b.x, y: 0, z: b.z),
                               .init(x: b.x, y: 2.7, z: b.z), .init(x: a.x, y: 2.7, z: a.z)])
        }
        let source = SurfaceCapture(documentID: "synthetic-workflow", title: "Synthetic workflow only",
            floorID: "floor-1", floorLabel: "Floor 1", frameID: "synthetic-frame", sourceArchiveID: "source-1",
            sdkVersion: "synthetic-contract-fixture", surfaces: surfaces,
            rooms: [.init(id: "room-1", label: "Room 1", wallIDs: surfaces.map(\.id))])
        var lifecycle = CaptureLifecycle()
        let generation = try XCTUnwrap(lifecycle.begin())
        XCTAssertTrue(lifecycle.started(generation))
        XCTAssertTrue(lifecycle.finish(generation))
        XCTAssertTrue(lifecycle.received(generation))
        let normalized = try SurfaceNormalizer.normalize(source)
        // Store this synthetic interpretation as a normalization report. It is
        // deliberately not labeled a RoomPlan raw capture.
        let sourceBytes = try JSONEncoder().encode(normalized.report)
        _ = try await store.archiveCapture(sourceBytes, sourceID: "source-1", kind: .normalizationReport)
        XCTAssertTrue(lifecycle.archived(generation))
        XCTAssertTrue(lifecycle.processed(generation))
        XCTAssertEqual(lifecycle.phase, .saving)
        _ = try await store.create(normalized.document)
        XCTAssertTrue(lifecycle.saved(generation))
        XCTAssertEqual(lifecycle.phase, .draftReady)
        let reopen = try SpatialStore(root: url)
        let document = try await reopen.open(documentID: normalized.document.documentID)
        XCTAssertEqual(document, normalized.document)
        XCTAssertEqual(document.floors.first?.rooms.count, 1)
        let retained = try await reopen.readCapture(sourceID: "source-1", kind: .normalizationReport)
        XCTAssertEqual(retained, sourceBytes)
        let exchange = try ExchangeExporter.export(document: document, floorID: "floor-1")
        XCTAssertEqual(try ExchangeImporter.importArchive(exchange.archiveData).document, document)
    }
}
