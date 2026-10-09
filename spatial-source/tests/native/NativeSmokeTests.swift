import XCTest
import RealityKit
import SpatialCore
import SpatialPersistence
@testable import AuxiliumSpatial

/// These require Xcode. Simulator execution can validate composition, never LiDAR.
final class NativeSmokeTests: XCTestCase {
    @MainActor func testDrawingRetainsEveryNearbyEndpointInsteadOfArrayFirstSnapping() {
        // Native source test: requires UIKit/Xcode; not counted as Linux evidence.
        let view = PlanCanvasView(frame: .init(x: 0, y: 0, width: 400, height: 400))
        let floor = Floor(id: "nearby", label: "Nearby", nodes: [
            .init(id: "farther-first", point: .init(x: 0.04, z: 0)),
            .init(id: "nearer-second", point: .init(x: 0, z: 0)),
            .init(id: "extent", point: .init(x: 1, z: 1))
        ], walls: [], openings: [], rooms: [])
        view.configure(floor: floor, selection: nil, tool: .draw, resetID: 0, mutationEnabled: true)
        // 32-point framing margins with this one-unit extent.
        XCTAssertEqual(view.drawingCandidates(at: .init(x: 32, y: 32)).map(\.id), ["nearer-second", "farther-first"])
    }
    @MainActor func testCanonicalRevisionCreatesRealityKitFacesAndSemanticEdges() throws {
        let document = Fixtures.twoRooms()
        let scene = try SceneBuilder.build(document: document, floorID: document.floors[0].id)
        let root = try RealityKitSceneFactory.make(scene)
        XCTAssertEqual(root.children.count, scene.faces.count + scene.edges.count)
        XCTAssertTrue(root.children.contains(where: { $0.name.hasPrefix("floor:") }))
        XCTAssertFalse(root.children.contains(where: { $0.name.contains("furniture") }))
    }
    @MainActor func testViewModelEditSavesAndReopensExactRevision() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = try SpatialStore(root: root)
        let document = Fixtures.twoRooms()
        _ = try await store.create(document)
        let model = EditorModel(document: document, store: store)
        let floor = document.floors[0], room = floor.rooms[0]
        await model.apply(.renameRoom(floorID: floor.id, roomID: room.id, label: "Corrected room"))
        XCTAssertFalse(model.pendingSave)
        let reopened = try await store.open(documentID: document.documentID)
        XCTAssertEqual(reopened, model.document)
        XCTAssertEqual(reopened.revision, document.revision + 1)
        await model.undo()
        XCTAssertEqual(model.document.floors[0].rooms[0].label, room.label)
    }
}
