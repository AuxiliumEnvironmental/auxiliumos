import XCTest
@testable import SpatialCore

final class CutawayTests: XCTestCase {
    func testViewDependentCutawayHidesOnlyObstructingWalls() throws {
        let doc = Fixtures.twoRooms(), scene = try SceneBuilder.build(document: doc, floorID: "floor-1")
        let left = CutawayVisibility.evaluate(scene: scene, camera: .init(x: -3, y: 1.5, z: 2), focus: .init(x: 2, y: 1, z: 2), probeRadius: 0)
        XCTAssertEqual(left.hiddenWallIDs, ["w5"])
        let right = CutawayVisibility.evaluate(scene: scene, camera: .init(x: 11, y: 1.5, z: 2), focus: .init(x: 6, y: 1, z: 2), probeRadius: 0)
        XCTAssertEqual(right.hiddenWallIDs, ["w2"])
        XCTAssertEqual(scene, try SceneBuilder.build(document: doc, floorID: "floor-1"))
        XCTAssertEqual(doc, Fixtures.twoRooms())
    }
    func testRayThroughRealDoorVoidDoesNotHideHost() throws {
        let scene = try SceneBuilder.build(document: Fixtures.twoRooms(), floorID: "floor-1")
        let result = CutawayVisibility.evaluate(scene: scene, camera: .init(x: 2, y: 1, z: 1.45), focus: .init(x: 6, y: 1, z: 1.45), probeRadius: 0)
        XCTAssertTrue(result.hiddenWallIDs.isEmpty)
        let solid = CutawayVisibility.evaluate(scene: scene, camera: .init(x: 2, y: 1, z: 3), focus: .init(x: 6, y: 1, z: 3), probeRadius: 0)
        XCTAssertEqual(solid.hiddenWallIDs, ["w6"])
    }
    func testRayThroughWindowVoidDoesNotHideHost() throws {
        let scene = try SceneBuilder.build(document: Fixtures.twoRooms(), floorID: "floor-1")
        let result = CutawayVisibility.evaluate(scene: scene, camera: .init(x: 2.2, y: 1.3, z: 6), focus: .init(x: 2.2, y: 1.3, z: 2), probeRadius: 0)
        XCTAssertFalse(result.hiddenWallIDs.contains("w4"))
    }
    func testTopViewAndBadInputHideNothing() throws {
        let scene = try SceneBuilder.build(document: Fixtures.twoRooms(), floorID: "floor-1")
        XCTAssertTrue(CutawayVisibility.evaluate(scene: scene, camera: .init(x: 2, y: 10, z: 2), focus: .init(x: 2, y: 0, z: 2)).hiddenWallIDs.isEmpty)
        XCTAssertTrue(CutawayVisibility.evaluate(scene: scene, camera: .init(x: .nan, y: 10, z: 2), focus: .init(x: 2, y: 0, z: 2)).hiddenWallIDs.isEmpty)
    }
    func testDisplayCeilingsDeriveSameRoomPolygonWithoutEditingGraph() throws {
        let doc = Fixtures.twoRooms(), ceilings = try DisplayCeilings.build(document: doc, floorID: "floor-1")
        XCTAssertEqual(ceilings.count, 2); XCTAssertEqual(Set(ceilings.map(\.objectID)), ["room-a", "room-b"])
        XCTAssertTrue(ceilings.allSatisfy { $0.role == "ceiling" && $0.vertices.allSatisfy { $0.y == 2.6 } })
        let scene = try SceneBuilder.build(document: doc, floorID: "floor-1")
        let result = CutawayVisibility.evaluate(scene: scene, camera: .init(x: 2, y: 10, z: 2), focus: .init(x: 2, y: 0, z: 2), ceilings: ceilings)
        XCTAssertEqual(result.hiddenCeilingRoomIDs, ["room-a"])
        XCTAssertEqual(doc, Fixtures.twoRooms())
    }
    func testUnequalHeightsDoNotInventFlatCeiling() throws {
        var doc = Fixtures.twoRooms(); doc.floors[0].walls[0].height = 3
        XCTAssertEqual(try DisplayCeilings.build(document: doc, floorID: "floor-1").map(\.objectID), ["room-b"])
    }
    func testInvalidTriangleDoesNotCrashPresentation() {
        let scene = GraphicScene(documentID: "x", revision: 1, floorID: "f", faces: [.init(objectID: "bad", role: "wall", vertices: [.init(x: 0, y: 0, z: 0)], triangles: [[-1, 0, 400]])], edges: [])
        XCTAssertTrue(CutawayVisibility.evaluate(scene: scene, camera: .init(x: 3, y: 2, z: 1), focus: .init(x: 1, y: 1, z: 1)).hiddenWallIDs.isEmpty)
    }
    func testPickingThroughDoorHoleReachesFarWallNotConvexHost() throws {
        let scene = try SceneBuilder.build(document: Fixtures.twoRooms(), floorID: "floor-1")
        let hit = SceneRayPicker.nearest(scene: scene, origin: .init(x: 2, y: 1, z: 1.45), direction: .init(x: 1, y: 0, z: 0))
        XCTAssertEqual(hit?.objectID, "w2"); XCTAssertEqual(hit?.distance ?? 0, 6, accuracy: 1e-8)
        let solid = SceneRayPicker.nearest(scene: scene, origin: .init(x: 2, y: 1, z: 3), direction: .init(x: 1, y: 0, z: 0))
        XCTAssertEqual(solid?.objectID, "w6")
    }
    func testPickingIgnoresHiddenFacesAndRetainsColonIDs() throws {
        var scene = try SceneBuilder.build(document: Fixtures.twoRooms(), floorID: "floor-1")
        for i in scene.faces.indices where scene.faces[i].objectID == "w2" { scene.faces[i].objectID = "capture:wall:far" }
        let hit = SceneRayPicker.nearest(scene: scene, origin: .init(x: 2, y: 1, z: 3), direction: .init(x: 1, y: 0, z: 0), hiddenWalls: ["w6"])
        XCTAssertEqual(hit?.objectID, "capture:wall:far")
    }
    func testPickingConcaveFloorDoesNotFillMissingCorner() throws {
        let ring: [Point2] = [.init(x: 0, z: 0), .init(x: 4, z: 0), .init(x: 4, z: 1), .init(x: 1, z: 1), .init(x: 1, z: 4), .init(x: 0, z: 4)]
        let face = SceneFace(objectID: "L", role: "floor", vertices: ring.map { .init(x: $0.x, y: 0, z: $0.z) }, triangles: try Geometry.triangulate(ring))
        let scene = GraphicScene(documentID: "d", revision: 1, floorID: "f", faces: [face], edges: [])
        XCTAssertNil(SceneRayPicker.nearest(scene: scene, origin: .init(x: 2, y: 5, z: 2), direction: .init(x: 0, y: -1, z: 0)))
        XCTAssertEqual(SceneRayPicker.nearest(scene: scene, origin: .init(x: 0.5, y: 5, z: 2), direction: .init(x: 0, y: -1, z: 0))?.objectID, "L")
    }
    func testPickingRejectsInvalidRay() throws {
        let scene = try SceneBuilder.build(document: Fixtures.twoRooms(), floorID: "floor-1")
        XCTAssertNil(SceneRayPicker.nearest(scene: scene, origin: .init(x: 2, y: 1, z: 2), direction: .init(x: .nan, y: 0, z: 0)))
        XCTAssertNil(SceneRayPicker.nearest(scene: scene, origin: .init(x: 2, y: 1, z: 2), direction: .init(x: 0, y: 0, z: 0)))
    }
}
