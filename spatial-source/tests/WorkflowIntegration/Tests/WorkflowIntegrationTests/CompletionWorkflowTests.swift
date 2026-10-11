import Foundation
import XCTest
import CaptureKit
import SpatialCore
import SpatialPersistence
import SpatialInterop

/// Actual public package paths with synthetic geometry. These tests do not
/// manufacture RoomPlan records, run an Apple UI, or establish sensor acceptance.
final class CompletionWorkflowTests: XCTestCase {
    private func temporary() -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("SpatialCompletion-" + UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return root
    }
    private func area(label: String = "Drying chamber") -> SemanticArea {
        .init(id: "area-a", label: label,
            polygon: [.init(x: 0.5, z: 0.5), .init(x: 2, z: 0.5), .init(x: 2, z: 2), .init(x: 0.5, z: 2)],
            provenance: .init(origin: .edited, sourceIDs: ["manual-outline"]))
    }
    private func save(_ editor: EditorSession, to store: SpatialStore, expected: Int) async throws {
        let saved = try await store.save(editor.document, expectedRevision: expected,
            command: "integrated-correction", receipt: editor.lastReceipt)
        XCTAssertEqual(saved.revision, editor.document.revision)
        XCTAssertEqual(saved.sha256, ArtifactDigest.sha256(try editor.document.encoded()))
    }

    func testAreaCorrectionFloorElevationDurableUndoRedoAndSharedPresentationIdentity() async throws {
        let root = temporary(), store = try SpatialStore(root: root), original = Fixtures.twoRooms()
        _ = try await store.create(original)
        var editor = try EditorSession(original)
        try editor.apply(.setArea(floorID: "floor-1", area: area()), expectedRevision: 1)
        try await save(editor, to: store, expected: 1)
        let added = editor.document
        let receipt2 = try await store.editReceipt(documentID: original.documentID, revision: 2)
        let creationReceipt = try XCTUnwrap(receipt2)
        XCTAssertEqual(creationReceipt.sourceRevision, 1); XCTAssertEqual(creationReceipt.resultingRevision, 2)
        // Creation has no old identity to relink. The saved graph carries the new
        // object; a receipt must not invent an annotation source in revision 1.
        XCTAssertFalse(creationReceipt.mappings.contains { $0.objectKind == "area" && $0.sourceID == "area-a" })
        let savedAreaDocument = try await store.open(documentID: original.documentID)
        XCTAssertEqual(savedAreaDocument.floors[0].areas, [area()])

        var corrected = area(label: "Corrected chamber"); corrected.polygon[1].x = 2.4; corrected.polygon[2].x = 2.4
        try editor.apply([.setArea(floorID: "floor-1", area: corrected),
                          .updateFloor(floorID: "floor-1", label: "Upper level", elevation: 3)], expectedRevision: 2)
        try await save(editor, to: store, expected: 2)
        let expected = editor.document, reopened = try SpatialStore(root: root)
        let durable = try await reopened.open(documentID: original.documentID)
        XCTAssertEqual(durable, expected); XCTAssertEqual(durable.schemaVersion, "1.1.0")
        let receiptValue = try await reopened.editReceipt(documentID: original.documentID, revision: 3)
        let receipt = try XCTUnwrap(receiptValue)
        XCTAssertTrue(receipt.mappings.contains { $0.objectKind == "area" && $0.sourceID == "area-a" })
        XCTAssertTrue(receipt.mappings.contains { $0.objectKind == "floor" && $0.sourceID == "floor-1" })
        XCTAssertTrue(receipt.mappings.allSatisfy(\.requiresOverlayReview))

        let undone = try await reopened.undo(documentID: original.documentID, expectedRevision: 3)
        XCTAssertEqual(undone.floors, added.floors); XCTAssertEqual(undone.revision, 4)
        let again = try SpatialStore(root: root)
        let redone = try await again.redo(documentID: original.documentID, expectedRevision: 4)
        XCTAssertEqual(redone.floors, expected.floors); XCTAssertEqual(redone.revision, 5)
        let scene = try SceneBuilder.build(document: redone, floorID: "floor-1")
        let drawing = try DrawingExporter.plan(document: redone, floorID: "floor-1")
        XCTAssertEqual(scene.revision, redone.revision); XCTAssertEqual(drawing.revision, scene.revision)
        let areaEdges = scene.edges.filter { $0.objectID == "area-a" }
        XCTAssertEqual(areaEdges.count, 4); XCTAssertTrue(areaEdges.allSatisfy { $0.role == "area" && $0.a.y == 3 && $0.b.y == 3 })
        XCTAssertTrue(drawing.pages.flatMap(\.shapes).contains { $0.objectID == "area-a" && $0.role == "semantic-area" })
        XCTAssertTrue(scene.faces.filter { $0.role == "floor" }.flatMap(\.vertices).allSatisfy { $0.y == 3 })
        let hit = try XCTUnwrap(SceneRayPicker.nearest(scene: scene, origin: .init(x: -1, y: 4, z: 2), direction: .init(x: 1, y: 0, z: 0)))
        XCTAssertEqual(hit.objectID, "w5")
        XCTAssertTrue(drawing.pages.flatMap(\.shapes).contains { $0.objectID == hit.objectID })
        let walk = try WalkNavigation(document: redone, floorID: "floor-1")
        let position = try walk.place(inRoom: "room-a", at: .init(x: 1, z: 1.45))
        let moved = try walk.move(from: position, toward: .init(x: 6, z: 1.45))
        XCTAssertTrue(moved.reachedTarget); XCTAssertEqual(moved.position.roomID, "room-b")
        XCTAssertEqual(moved.crossedPortalIDs, ["door-a"]); XCTAssertEqual(moved.position.eyeY, 4.6, accuracy: 0.000001)
        XCTAssertEqual(try SceneBuilder.build(document: redone, floorID: "floor-1"), scene)
    }

    func testFrozenSemanticRevisionExportsAndDisabledOutboxRemainExactAfterCorrection() async throws {
        let root = temporary(), store = try SpatialStore(root: root), original = Fixtures.twoRooms()
        _ = try await store.create(original)
        var editor = try EditorSession(original)
        try editor.apply(.setArea(floorID: "floor-1", area: area(label: "Frozen label")), expectedRevision: 1)
        try await save(editor, to: store, expected: 1)
        let chosen = editor.document
        let frozen = try await store.freeze(documentID: chosen.documentID, revision: 2)
        let bytes = try await store.readFrozen(snapshotID: frozen.snapshotID)
        let exchange = try ExchangeExporter.export(document: chosen, floorID: "floor-1")
        let model = try GLBExporter.export(document: chosen, floorID: "floor-1")
        let drawing = try DrawingExporter.svgPages(document: chosen, floorID: "floor-1")
        let destination = try PublicationDestination(system: .auxiliumos, contextID: "synthetic-project")
        let queued = try await store.enqueuePublication(snapshotID: frozen.snapshotID, destination: destination,
            expectedPublishedRevision: nil, clientRequestID: "chosen-v2")
        XCTAssertEqual(queued.request.sourceRevision, 2); XCTAssertEqual(queued.state, .queued)

        try editor.apply([.setArea(floorID: "floor-1", area: area(label: "Later private label")),
            .updateFloor(floorID: "floor-1", label: "Later floor", elevation: 2)], expectedRevision: 2)
        try await save(editor, to: store, expected: 2)
        let reopened = try SpatialStore(root: root)
        let retained = try await reopened.readFrozen(snapshotID: frozen.snapshotID)
        XCTAssertEqual(retained, bytes)
        let old = try GeometryJSONReader.decode(retained)
        XCTAssertEqual(old, chosen)
        XCTAssertEqual(try ExchangeExporter.export(document: old, floorID: "floor-1").archiveData, exchange.archiveData)
        XCTAssertEqual(try GLBExporter.export(document: old, floorID: "floor-1"), model)
        XCTAssertEqual(try DrawingExporter.svgPages(document: old, floorID: "floor-1"), drawing)
        let queuedBytes = try await reopened.publicationArchive(requestID: "chosen-v2")
        XCTAssertEqual(queuedBytes, exchange.archiveData)
        XCTAssertEqual(try ExchangeImporter.importArchive(queuedBytes).document, chosen)
        let disconnected = CountingDisconnectedTransport()
        let result = try await PublicationCoordinator(store: reopened, transport: disconnected).deliver(requestID: "chosen-v2")
        XCTAssertEqual(result, .notConnected)
        let calls = await disconnected.invocationCount(); XCTAssertEqual(calls, 0)
        let unchanged = try await reopened.publication(requestID: "chosen-v2")
        XCTAssertEqual(unchanged, queued); XCTAssertEqual(unchanged.attempts, 0); XCTAssertFalse(unchanged.receiverConfirmed)
        let latest = try await reopened.open(documentID: original.documentID)
        XCTAssertEqual(latest.revision, 3); XCTAssertNotEqual(latest.floors, old.floors)
    }

    func testOpeningRehostRoomMergeSplitAndReopenKeepGraphAndNavigationConsistent() async throws {
        let root = temporary(), store = try SpatialStore(root: root), original = Fixtures.twoRooms()
        _ = try await store.create(original)
        var editor = try EditorSession(original)
        var door = try XCTUnwrap(original.floors[0].openings.first { $0.id == "door-a" })
        door.wallID = "w5"; door.offset = 1
        try editor.apply(.updateOpening(floorID: "floor-1", opening: door), expectedRevision: 1)
        try await save(editor, to: store, expected: 1)
        let rehosted = try await SpatialStore(root: root).open(documentID: original.documentID)
        XCTAssertEqual(rehosted.floors[0].openings.first { $0.id == "door-a" }?.wallID, "w5")
        let outsideDoor = try WalkNavigation(document: rehosted, floorID: "floor-1")
        XCTAssertFalse(outsideDoor.portals.contains { $0.openingID == "door-a" })
        let scene = try SceneBuilder.build(document: rehosted, floorID: "floor-1")
        XCTAssertNil(SceneRayPicker.nearest(scene: scene, origin: .init(x: 1, y: 1, z: 2.55), direction: .init(x: -1, y: 0, z: 0), maximumDistance: 2))
        XCTAssertEqual(SceneRayPicker.nearest(scene: scene, origin: .init(x: 3, y: 1, z: 1.45), direction: .init(x: 1, y: 0, z: 0), maximumDistance: 2)?.objectID, "w6")

        try editor.apply(.mergeRooms(floorID: "floor-1", firstRoomID: "room-a", secondRoomID: "room-b"), expectedRevision: 2)
        try await save(editor, to: store, expected: 2)
        let merged = editor.document
        XCTAssertEqual(merged.floors[0].rooms.count, 1)
        XCTAssertTrue(merged.floors[0].openings.contains { $0.id == "door-a" && $0.wallID == "w5" })
        let divider = try XCTUnwrap(original.floors[0].walls.first { $0.id == "w6" })
        try editor.apply([.addWall(floorID: "floor-1", wall: divider, newNodes: []),
            .splitRoom(floorID: "floor-1", roomID: "room-a", dividerWallID: "w6", newRoomID: "room-new", newLabel: "New office")], expectedRevision: 3)
        try await save(editor, to: store, expected: 3)
        let split = editor.document
        door.wallID = "w6"
        try editor.apply(.updateOpening(floorID: "floor-1", opening: door), expectedRevision: 4)
        try await save(editor, to: store, expected: 4)
        let reopen = try SpatialStore(root: root), corrected = try await reopen.open(documentID: original.documentID)
        XCTAssertEqual(corrected.floors[0].rooms.count, 2)
        let restoredPortal = try XCTUnwrap(WalkNavigation(document: corrected, floorID: "floor-1").portals.first { $0.openingID == "door-a" })
        XCTAssertEqual(restoredPortal.wallID, "w6"); XCTAssertEqual(Set(restoredPortal.roomIDs), ["room-a", "room-new"])
        let receiptValue = try await reopen.editReceipt(documentID: original.documentID, revision: 4)
        let receipt = try XCTUnwrap(receiptValue)
        XCTAssertEqual(receipt.mappings.first { $0.sourceID == "room-a" }?.resultingIDs, ["room-a", "room-new"])
        let undoHost = try await reopen.undo(documentID: original.documentID, expectedRevision: 5)
        XCTAssertEqual(undoHost.floors, split.floors)
        let undoSplit = try await reopen.undo(documentID: original.documentID, expectedRevision: 6)
        XCTAssertEqual(undoSplit.floors, merged.floors)
        let redo = try await SpatialStore(root: root).redo(documentID: original.documentID, expectedRevision: 7)
        XCTAssertEqual(redo.floors, split.floors)
        let exchange = try ExchangeExporter.export(document: redo, floorID: "floor-1")
        XCTAssertEqual(try ExchangeImporter.importArchive(exchange.archiveData).document, redo)
    }

    func testStaleCompoundCorrectionAndInvalidAreaCannotCorruptSavedVersionOrFrozenIntent() async throws {
        let root = temporary(), first = try SpatialStore(root: root), second = try SpatialStore(root: root), original = Fixtures.twoRooms()
        _ = try await first.create(original)
        let frozen = try await first.freeze(documentID: original.documentID, revision: 1)
        let oldBytes = try await first.readFrozen(snapshotID: frozen.snapshotID)
        var winner = try EditorSession(original), stale = try EditorSession(original)
        try winner.apply(.setArea(floorID: "floor-1", area: area()), expectedRevision: 1)
        try await save(winner, to: first, expected: 1)
        try stale.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Stale overwrite"), expectedRevision: 1)
        do {
            _ = try await second.save(stale.document, expectedRevision: 1, receipt: stale.lastReceipt)
            XCTFail("Stale writer replaced the saved semantic correction")
        } catch { XCTAssertEqual(error as? StoreError, .staleRevision(expected: 1, actual: 2)) }
        var invalid = area(); invalid.polygon.swapAt(1, 2)
        XCTAssertThrowsError(try winner.apply([.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Should roll back"),
            .setArea(floorID: "floor-1", area: invalid)], expectedRevision: 2))
        let durable = try await second.open(documentID: original.documentID)
        XCTAssertEqual(durable, winner.document); XCTAssertEqual(durable.revision, 2)
        let frozenAfterConflict = try await second.readFrozen(snapshotID: frozen.snapshotID)
        XCTAssertEqual(frozenAfterConflict, oldBytes)
        let undo = try await second.undo(documentID: original.documentID, expectedRevision: 2)
        XCTAssertEqual(undo.floors, original.floors)
    }

    func testInterruptedConnectedPolicyCreatesSeparatePersistedLayoutWithoutGuessedJoin() async throws {
        let root = temporary(), store = try SpatialStore(root: root), sessionID = UUID().uuidString
        var walk = ConnectedCaptureLifecycle()
        XCTAssertTrue(walk.attachSession(sessionID)); walk.observeTracking(.normal, sessionID: sessionID)
        let first = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        var firstDocument = Fixtures.twoRooms(); firstDocument.documentID = first.outputDocumentID
        _ = try await store.create(firstDocument)
        XCTAssertTrue(walk.roomSaved(sourceID: first.sourceID, documentID: firstDocument.documentID, revision: 1))
        let second = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        walk.interrupt(invalidateActive: true)
        let separate = try XCTUnwrap(walk.active)
        XCTAssertEqual(separate.sourceID, second.sourceID); XCTAssertEqual(separate.alignment, .separate)
        XCTAssertThrowsError(try CaptureCompatibility.validate([first, separate]))
        var separateDocument = Fixtures.twoRooms(); separateDocument.documentID = separate.outputDocumentID
        separateDocument.title = "Synthetic separate segment, not a sensor result"
        _ = try await store.archiveCapture(JSONEncoder().encode(separate), sourceID: separate.sourceID, kind: .captureMetadata)
        _ = try await store.create(separateDocument)
        XCTAssertTrue(walk.roomSaved(sourceID: separate.sourceID, documentID: separateDocument.documentID, revision: 1))
        XCTAssertEqual(walk.compatibleSourceIDs, [first.sourceID]); XCTAssertFalse(walk.canStartRoom)
        let reopened = try SpatialStore(root: root), summaries = try await reopened.listDrafts()
        XCTAssertEqual(Set(summaries.map(\.documentID)), [firstDocument.documentID, separateDocument.documentID])
        let retainedFirst = try await reopened.open(documentID: firstDocument.documentID)
        let retainedSeparate = try await reopened.open(documentID: separateDocument.documentID)
        XCTAssertEqual(retainedFirst, firstDocument)
        XCTAssertEqual(retainedSeparate, separateDocument)
        let artifacts = try await reopened.listCaptureArtifacts()
        XCTAssertFalse(artifacts.contains { $0.kind == .roomPlanRaw || $0.kind == .roomPlanProcessed })
        XCTAssertEqual(try ExchangeImporter.importArchive(ExchangeExporter.export(document: separateDocument, floorID: "floor-1").archiveData).document, separateDocument)
    }

    func testProtectedDataGateAndUntrustedIdentifiersLeaveFrozenSourceUnchanged() async throws {
        let store = try SpatialStore(root: temporary()), document = Fixtures.twoRooms()
        _ = try await store.create(document)
        let frozen = try await store.freeze(documentID: document.documentID, revision: 1)
        let bytes = try await store.readFrozen(snapshotID: frozen.snapshotID)
        XCTAssertThrowsError(try PublicationDestination(system: .moldo, contextID: "../different-workspace"))
        do { _ = try await store.archiveCapture(Data([1, 2, 3]), sourceID: "../../scan", kind: .captureMetadata); XCTFail("Unsafe source ID admitted") }
        catch { XCTAssertEqual(error as? StoreError, .invalidIdentifier) }
        await store.setProtectedDataAvailable(false)
        do { _ = try await store.readFrozen(snapshotID: frozen.snapshotID); XCTFail("Locked export admitted") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        do { _ = try await store.open(documentID: document.documentID); XCTFail("Locked read admitted") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        await store.setProtectedDataAvailable(true)
        let duplicate = Data("{\"schemaVersion\":\"1.1.0\",\"schemaVersion\":\"1.0.0\"}".utf8)
        XCTAssertThrowsError(try GeometryJSONReader.decode(duplicate))
        let badVersion = String(decoding: try document.encoded(), as: UTF8.self).replacingOccurrences(of: "1.0.0", with: "999.0.0")
        XCTAssertThrowsError(try GeometryJSONReader.decode(Data(badVersion.utf8)))
        XCTAssertThrowsError(try GeometryJSONReader.decode(Data((String(repeating: "[", count: 100) + String(repeating: "]", count: 100)).utf8)))
        let retainedFrozen = try await store.readFrozen(snapshotID: frozen.snapshotID)
        let retainedDocument = try await store.open(documentID: document.documentID)
        XCTAssertEqual(retainedFrozen, bytes)
        XCTAssertEqual(retainedDocument, document)
        let queued = try await store.listPublications(); XCTAssertTrue(queued.isEmpty)
        let captures = try await store.listCaptureArtifacts(); XCTAssertTrue(captures.isEmpty)
    }

    func testAddingFloorDoesNotSilentlyWidenPublicationProfileOrChangeOldExchange() async throws {
        let store = try SpatialStore(root: temporary()), original = Fixtures.twoRooms()
        _ = try await store.create(original)
        let frozen = try await store.freeze(documentID: original.documentID, revision: 1)
        let originalExchange = try ExchangeExporter.export(document: original, floorID: "floor-1")
        var editor = try EditorSession(original)
        let empty = Floor(id: "floor-2", label: "Upper floor needs capture", elevation: 3, nodes: [], walls: [], openings: [], rooms: [])
        try editor.apply(.addFloor(floor: empty), expectedRevision: 1)
        try await save(editor, to: store, expected: 1)
        let current = try await store.open(documentID: original.documentID)
        XCTAssertEqual(current.floors.count, 2)
        let emptyScene = try SceneBuilder.build(document: current, floorID: "floor-2")
        XCTAssertTrue(emptyScene.faces.isEmpty); XCTAssertTrue(emptyScene.edges.isEmpty)
        XCTAssertThrowsError(try ExchangeExporter.export(document: current, floorID: "floor-1")) { XCTAssertEqual($0 as? SpatialExportError, .unsupportedProfile) }
        let unsupported = try await store.freeze(documentID: current.documentID, revision: 2)
        do {
            _ = try await store.enqueuePublication(snapshotID: unsupported.snapshotID,
                destination: .init(system: .moldo, contextID: "synthetic-project"), expectedPublishedRevision: nil, clientRequestID: "multi-floor")
            XCTFail("Multi-floor draft silently used single-floor publication profile")
        } catch { XCTAssertEqual(error as? SpatialExportError, .unsupportedProfile) }
        let publications = try await store.listPublications(); XCTAssertTrue(publications.isEmpty)
        let prior = try GeometryJSONReader.decode(try await store.readFrozen(snapshotID: frozen.snapshotID))
        XCTAssertEqual(try ExchangeExporter.export(document: prior, floorID: "floor-1").archiveData, originalExchange.archiveData)
        #if !canImport(CoreGraphics)
        XCTAssertThrowsError(try LocalDocumentExporter.export(document: current)) {
            XCTAssertEqual($0 as? DrawingExportError, .nativeRendererUnavailable)
        }
        #endif
    }
}

/// Disconnected synthetic transport deliberately fails if any method is called.
/// There are no URLs, credentials, networking libraries or remote resources.
private actor CountingDisconnectedTransport: ScopedPublicationTransport {
    nonisolated let isConnected = false
    private var calls = 0
    func invocationCount() -> Int { calls }
    func authorize(_ request: PublicationRequest) async throws -> PublicationAuthorization { calls += 1; throw PublicationError.notConnected }
    func status(_ request: PublicationRequest, authorization: PublicationAuthorization) async throws -> PublicationRemoteStatus { calls += 1; throw PublicationError.notConnected }
    func reserve(_ request: PublicationRequest, authorization: PublicationAuthorization) async throws -> PublicationReservation { calls += 1; throw PublicationError.notConnected }
    func upload(_ bytes: Data, reservation: PublicationReservation, authorization: PublicationAuthorization) async throws { calls += 1; throw PublicationError.notConnected }
    func finalize(_ reservation: PublicationReservation, authorization: PublicationAuthorization) async throws -> PublicationRemoteStatus { calls += 1; throw PublicationError.notConnected }
    func authenticate(_ receipt: PublicationReceipt, authorization: PublicationAuthorization) async throws -> Bool { calls += 1; throw PublicationError.notConnected }
}
