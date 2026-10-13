import XCTest
@testable import SpatialCore

final class AuthoringCompletionTests: XCTestCase {
    private func area(_ id: String = "zone") -> SemanticArea {
        .init(id: id, label: "Work area", polygon: [.init(x: 0.5, z: 0.5), .init(x: 2, z: 0.5), .init(x: 2, z: 2), .init(x: 0.5, z: 2)])
    }
    func testLegacyEncodingOmitsAreasAndRoundTrips() throws {
        let original = Fixtures.twoRooms(), bytes = try Fixtures.twoRooms().encoded()
        XCTAssertFalse(String(decoding: bytes, as: UTF8.self).contains("\"areas\""))
        XCTAssertEqual(try JSONDecoder().decode(SpatialDocument.self, from: bytes), original)
    }
    func testAreaUpgradesExplicitlyAndUndoRestoresOldSchema() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        let walls = editor.document.floors[0].walls
        try editor.apply(.setArea(floorID: "floor-1", area: area()), expectedRevision: 1)
        XCTAssertEqual(editor.document.schemaVersion, "1.1.0")
        XCTAssertEqual(editor.document.floors[0].walls, walls)
        let scene = try SceneBuilder.build(document: editor.document, floorID: "floor-1")
        XCTAssertEqual(scene.schemaVersion, "1.1.0")
        XCTAssertEqual(scene.edges.filter { $0.objectID == "zone" && $0.role == "area" }.count, 4)
        XCTAssertFalse(scene.faces.contains { $0.objectID == "zone" })
        XCTAssertTrue(try SVGExporter.render(document: editor.document, floorID: "floor-1").contains("Area: Work area"))
        try editor.undo(expectedRevision: 2)
        XCTAssertEqual(editor.document.schemaVersion, "1.0.0")
        XCTAssertTrue(editor.document.floors[0].areas.isEmpty)
        try editor.redo(expectedRevision: 3)
        XCTAssertEqual(editor.document.floors[0].areas.count, 1)
    }
    func testAreaCannotBeSmuggledUnderLegacySchema() {
        var document = Fixtures.twoRooms(); document.floors[0].areas = [area()]
        XCTAssertTrue(Validator.validate(document).contains { $0.code == "schema_version" })
    }
    func testCrossedAreaRejectedWithoutRevisionOrHistoryChange() throws {
        var editor = try EditorSession(Fixtures.twoRooms()), bad = area()
        bad.polygon.swapAt(1, 2)
        XCTAssertThrowsError(try editor.apply(.setArea(floorID: "floor-1", area: bad), expectedRevision: 1))
        XCTAssertEqual(editor.document, Fixtures.twoRooms()); XCTAssertFalse(editor.canUndo)
    }
    func testAreaCannotReuseRenderedObjectIdentity() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        XCTAssertThrowsError(try editor.apply(.setArea(floorID: "floor-1", area: area("w0")), expectedRevision: 1))
    }
    func testAreaLineageAndRemoval() throws {
        var editor = try EditorSession(Fixtures.twoRooms()), value = area()
        value.provenance.sourceIDs = ["source-one"]
        try editor.apply(.setArea(floorID: "floor-1", area: value), expectedRevision: 1)
        var update = area(); update.label = "Changed"
        try editor.apply(.setArea(floorID: "floor-1", area: update), expectedRevision: 2)
        XCTAssertEqual(editor.document.floors[0].areas[0].provenance.sourceIDs, ["source-one"])
        XCTAssertTrue(editor.lastReceipt!.mappings.contains { $0.objectKind == "area" && $0.resultingIDs == ["zone"] })
        try editor.apply(.deleteArea(floorID: "floor-1", areaID: "zone"), expectedRevision: 3)
        XCTAssertEqual(editor.lastReceipt?.mappings.first { $0.sourceID == "zone" }?.resultingIDs, [])
    }
    func testMergeRoomsRemovesExplicitPartitionAndMapsIdentities() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.mergeRooms(floorID: "floor-1", firstRoomID: "room-a", secondRoomID: "room-b"), expectedRevision: 1)
        XCTAssertEqual(editor.document.floors[0].rooms.count, 1)
        XCTAssertFalse(editor.document.floors[0].walls.contains { $0.id == "w6" })
        XCTAssertFalse(editor.document.floors[0].openings.contains { $0.id == "door-a" })
        XCTAssertEqual(editor.lastReceipt?.mappings.first { $0.sourceID == "room-b" }?.resultingIDs, ["room-a"])
        try editor.undo(expectedRevision: 2)
        XCTAssertEqual(editor.document.floors, Fixtures.twoRooms().floors)
    }
    func testSplitMergedRoomWithExplicitDividerAndUndo() throws {
        let original = Fixtures.twoRooms()
        var editor = try EditorSession(original)
        try editor.apply(.mergeRooms(floorID: "floor-1", firstRoomID: "room-a", secondRoomID: "room-b"), expectedRevision: 1)
        try editor.apply([
            .addWall(floorID: "floor-1", wall: original.floors[0].walls.last!, newNodes: []),
            .splitRoom(floorID: "floor-1", roomID: "room-a", dividerWallID: "w6", newRoomID: "room-new", newLabel: "Office")
        ], expectedRevision: 2)
        XCTAssertEqual(editor.document.floors[0].rooms.count, 2)
        XCTAssertEqual(editor.lastReceipt?.mappings.first { $0.sourceID == "room-a" }?.resultingIDs, ["room-a", "room-new"])
        XCTAssertTrue(Validator.validate(editor.document).isEmpty)
    }
    func testImpossibleRoomSplitRollsBackCompoundAddedWall() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        let bad = Wall(id: "outside", nodeIDs: ["n0", "n2"], height: 2.6, heightBasis: .assumed, provenance: .init(origin: .edited))
        XCTAssertThrowsError(try editor.apply([.addWall(floorID: "floor-1", wall: bad, newNodes: []),
            .splitRoom(floorID: "floor-1", roomID: "room-a", dividerWallID: "outside", newRoomID: "bad", newLabel: "Bad")], expectedRevision: 1))
        XCTAssertEqual(editor.document, Fixtures.twoRooms())
    }
    func testMalformedIntermediateFloorThrowsInsteadOfTrapping() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        var floor = Fixtures.twoRooms().floors[0]; floor.id = "invalid-floor"
        floor.rooms = [Room(id: "outer", label: "Outer", boundary: (0...5).map { .init(wallID: "w\($0)") })]
        floor.walls.append(floor.walls[0])
        XCTAssertThrowsError(try editor.apply([.addFloor(floor: floor),
            .splitRoom(floorID: floor.id, roomID: "outer", dividerWallID: "w6", newRoomID: "part", newLabel: "Part")], expectedRevision: 1))
        XCTAssertEqual(editor.document, Fixtures.twoRooms())
    }
    func testFloorMetadataAndDeletionSafety() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        XCTAssertThrowsError(try editor.apply(.deleteFloor(floorID: "floor-1"), expectedRevision: 1))
        try editor.apply(.updateFloor(floorID: "floor-1", label: "Upper floor", elevation: 3), expectedRevision: 1)
        XCTAssertEqual(editor.document.floors[0].label, "Upper floor")
        XCTAssertEqual(editor.lastReceipt?.mappings.filter { $0.objectKind == "wall" }.count, editor.document.floors[0].walls.count)
        XCTAssertEqual(editor.lastReceipt?.mappings.first { $0.objectKind == "floor" }?.resultingIDs, ["floor-1"])
        XCTAssertTrue(editor.lastReceipt!.mappings.allSatisfy(\.requiresOverlayReview))
        let saved = editor.document
        XCTAssertThrowsError(try editor.apply(.updateFloor(floorID: "floor-1", label: "Too high", elevation: 10000), expectedRevision: 2))
        XCTAssertEqual(editor.document, saved)
        try editor.undo(expectedRevision: 2)
        XCTAssertEqual(editor.lastReceipt?.mappings.filter { $0.objectKind == "room" }.count, 2)
    }
}
