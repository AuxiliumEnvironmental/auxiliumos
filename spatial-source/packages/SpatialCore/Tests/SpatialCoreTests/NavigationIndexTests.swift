import XCTest
@testable import SpatialCore

final class NavigationIndexTests: XCTestCase {
    func testIndexedAsymmetricWallAndOppositeBoundariesMatchExpectedOrder() throws {
        let floor = Fixtures.twoRooms().floors[0], index = FloorGeometryIndex(floor)
        XCTAssertEqual(try index.path(wall: floor.walls[6]), [.init(x: 4, z: 0), .init(x: 4, z: 4)])
        XCTAssertEqual(try index.boundary(room: floor.rooms[0]), [.init(x: 0, z: 0), .init(x: 4, z: 0), .init(x: 4, z: 4), .init(x: 0, z: 4)])
        XCTAssertEqual(try index.boundary(room: floor.rooms[1]), [.init(x: 4, z: 0), .init(x: 8, z: 0), .init(x: 8, z: 4), .init(x: 4, z: 4)])
    }
    func testImmutableIndexDoesNotLeakIntoNextRevision() throws {
        var floor = Fixtures.twoRooms().floors[0]
        let old = FloorGeometryIndex(floor)
        floor.nodes[0].point = .init(x: -1, z: 0)
        let changed = FloorGeometryIndex(floor)
        XCTAssertEqual(try old.path(wall: floor.walls[0]).first, .init(x: 0, z: 0))
        XCTAssertEqual(try changed.path(wall: floor.walls[0]).first, .init(x: -1, z: 0))
    }
    func testIndexKeepsFirstDuplicateForDiagnosticsAndValidatorRejectsIt() throws {
        var document = Fixtures.twoRooms()
        document.floors[0].nodes.append(.init(id: "n0", point: .init(x: 999, z: 999)))
        let index = FloorGeometryIndex(document.floors[0])
        XCTAssertEqual(try index.path(wall: document.floors[0].walls[0]).first, .init(x: 0, z: 0))
        XCTAssertTrue(Validator.validate(document).contains { $0.code == "duplicate_id" })
    }
    func testIndexRejectsMissingNodesAndOpenBoundary() {
        var floor = Fixtures.twoRooms().floors[0]
        floor.nodes.removeAll { $0.id == "n0" }
        XCTAssertThrowsError(try FloorGeometryIndex(floor).path(wall: floor.walls[0]))
        floor = Fixtures.twoRooms().floors[0]
        var room = floor.rooms[0]; room.boundary.removeLast()
        XCTAssertThrowsError(try FloorGeometryIndex(floor).boundary(room: room))
    }
    func testBoundingBroadPhaseDoesNotTreatConcaveVoidAsWalkable() throws {
        let points: [Point2] = [.init(x: 0, z: 0), .init(x: 4, z: 0), .init(x: 4, z: 1), .init(x: 1, z: 1), .init(x: 1, z: 4), .init(x: 0, z: 4)]
        let nodes = points.enumerated().map { Node(id: "n\($0.offset)", point: $0.element) }
        let walls = points.indices.map { Wall(id: "w\($0)", nodeIDs: ["n\($0)", "n\(($0 + 1) % points.count)"], height: 2.6, heightBasis: .synthetic, provenance: .init(origin: .synthetic)) }
        let room = Room(id: "concave", label: "Concave", boundary: walls.map { .init(wallID: $0.id) })
        let document = SpatialDocument(documentID: "concave", title: "Synthetic", floors: [.init(id: "f", label: "F", nodes: nodes, walls: walls, openings: [], rooms: [room])])
        let navigation = try WalkNavigation(document: document, floorID: "f")
        XCTAssertThrowsError(try navigation.place(at: .init(x: 2, z: 2)))
        let start = try navigation.place(at: .init(x: 0.5, z: 2))
        let move = try navigation.move(from: start, toward: .init(x: 2, z: 0.5))
        XCTAssertFalse(move.reachedTarget); XCTAssertEqual(move.stop, .wall)
    }
    func testBroadPhasePreservesOverlappingInteriorRejection() throws {
        var document = Fixtures.twoRooms()
        let floor = document.floors[0]
        // A separate, overlapping bounded room with its own IDs cannot authorize
        // placement in its overlap even though each individual polygon is valid.
        let ids = ["a", "b", "c", "d"]
        let points: [Point2] = [.init(x: 1, z: 1), .init(x: 3, z: 1), .init(x: 3, z: 3), .init(x: 1, z: 3)]
        document.floors[0].nodes += zip(ids, points).map { .init(id: $0, point: $1) }
        let walls = ids.indices.map { Wall(id: "overlap-\($0)", nodeIDs: [ids[$0], ids[($0 + 1) % ids.count]], height: 2.6, heightBasis: .synthetic, provenance: .init(origin: .synthetic)) }
        document.floors[0].walls += walls
        document.floors[0].rooms.append(.init(id: "overlap", label: "Overlap", boundary: walls.map { .init(wallID: $0.id) }))
        try Validator.requireValid(document)
        XCTAssertEqual(floor.rooms.count, 2)
        XCTAssertThrowsError(try WalkNavigation(document: document, floorID: "floor-1").place(at: .init(x: 2, z: 2)))
    }
}
