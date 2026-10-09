import XCTest
@testable import SpatialCore

final class NavigationTests: XCTestCase {
    private func navigation(_ document: SpatialDocument = Fixtures.twoRooms()) throws -> WalkNavigation {
        try WalkNavigation(document: document, floorID: "floor-1")
    }
    func testOnlySharedFloorLevelDoorIsPortal() throws {
        let nav = try navigation()
        XCTAssertEqual(nav.portals.map(\.openingID), ["door-a"])
        XCTAssertEqual(Set(nav.restrictions.map(\.openingID)), ["window-a", "entry"])
    }
    func testWalkThroughDoorPreservesRevisionAndChangesRoom() throws {
        let doc = Fixtures.twoRooms(), nav = try navigation(doc)
        let start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 1.45))
        let result = try nav.move(from: start, toward: .init(x: 6, z: 1.45))
        XCTAssertTrue(result.reachedTarget); XCTAssertNil(result.stop)
        XCTAssertEqual(result.position.roomID, "room-b"); XCTAssertEqual(result.crossedPortalIDs, ["door-a"])
        XCTAssertEqual(result.position.revision, doc.revision)
        XCTAssertEqual(result.position.documentID, doc.documentID)
        XCTAssertEqual(doc, Fixtures.twoRooms())
    }
    func testDoorPortalWorksInBothDirections() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-b", at: .init(x: 6, z: 1.45))
        let result = try nav.move(from: start, toward: .init(x: 2, z: 1.45))
        XCTAssertTrue(result.reachedTarget); XCTAssertEqual(result.position.roomID, "room-a")
    }
    func testPassageCanConnectRooms() throws {
        var doc = Fixtures.twoRooms(); doc.floors[0].openings[0].kind = .passage
        XCTAssertEqual(try navigation(doc).portals.map(\.openingID), ["door-a"])
    }
    func testWindowWithDoorDimensionsStillBlocks() throws {
        var doc = Fixtures.twoRooms(); doc.floors[0].openings[0].kind = .window
        let nav = try navigation(doc), start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 1.45))
        let result = try nav.move(from: start, toward: .init(x: 6, z: 1.45))
        XCTAssertEqual(result.stop, .wall); XCTAssertEqual(result.blockingObjectID, "w6")
        XCTAssertLessThan(result.position.point.x, 4 - nav.settings.radius)
    }
    func testLongMoveCannotTunnelThroughThinWall() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a", at: .init(x: 1, z: 3))
        let result = try nav.move(from: start, toward: .init(x: 7, z: 3))
        XCTAssertFalse(result.reachedTarget); XCTAssertEqual(result.stop, .wall)
        XCTAssertEqual(result.position.point.x, 3.82 - 0.00001, accuracy: 0.000001)
        XCTAssertEqual(result.position.roomID, "room-a")
    }
    func testExteriorPassageCannotLeaveKnownSpace() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-b", at: .init(x: 6, z: 1))
        let result = try nav.move(from: start, toward: .init(x: 6, z: -2))
        XCTAssertEqual(result.stop, .wall); XCTAssertGreaterThan(result.position.point.z, nav.settings.radius)
    }
    func testRadiusCannotClipDoorJamb() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 1.05))
        let result = try nav.move(from: start, toward: .init(x: 6, z: 1.05))
        XCTAssertEqual(result.stop, .wall); XCTAssertLessThan(result.position.point.x, 4)
    }
    func testDiagonalCannotClipSolidCorner() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 2))
        let result = try nav.move(from: start, toward: .init(x: -2, z: -2))
        XCTAssertEqual(result.stop, .wall)
        XCTAssertGreaterThanOrEqual(result.position.point.x, nav.settings.radius)
        XCTAssertGreaterThanOrEqual(result.position.point.z, nav.settings.radius)
    }
    func testNarrowAndRaisedAndLowOpeningsAreNotPortals() throws {
        for variant in 0..<3 {
            var doc = Fixtures.twoRooms()
            if variant == 0 { doc.floors[0].openings[0].width = 0.3 }
            if variant == 1 { doc.floors[0].openings[0].bottom = 0.1 }
            if variant == 2 { doc.floors[0].openings[0].height = 1.5 }
            XCTAssertTrue(try navigation(doc).portals.isEmpty)
        }
    }
    func testInferredOpeningRequiresCorrection() throws {
        var doc = Fixtures.twoRooms(); doc.floors[0].openings[0].provenance.origin = .inferred
        XCTAssertTrue(try navigation(doc).portals.isEmpty)
        doc.floors[0].openings[0].provenance.origin = .edited
        XCTAssertEqual(try navigation(doc).portals.count, 1)
    }
    func testStartPositionsAndExplicitRoomJumpStayInsideNamedRoom() throws {
        let nav = try navigation()
        for roomID in ["room-a", "room-b"] {
            let position = try nav.place(inRoom: roomID)
            XCTAssertEqual(position.roomID, roomID)
            XCTAssertEqual(position.eyeY, 1.6)
            XCTAssertEqual(try nav.place(at: position.point), position)
        }
        XCTAssertThrowsError(try nav.place(inRoom: "room-a", at: .init(x: 6, z: 2)))
        XCTAssertThrowsError(try nav.place(at: .init(x: 0.01, z: 2)))
        XCTAssertThrowsError(try nav.place(at: .init(x: 40, z: 2)))
    }
    func testUnknownRoomAndInvalidSettingsFailExplicitly() throws {
        XCTAssertThrowsError(try navigation().place(inRoom: "missing"))
        XCTAssertThrowsError(try WalkNavigation(document: Fixtures.twoRooms(), floorID: "floor-1", settings: .init(radius: .nan)))
        XCTAssertThrowsError(try WalkNavigation(document: Fixtures.twoRooms(), floorID: "floor-1", settings: .init(maximumMove: .infinity)))
    }
    func testStaleRevisionAndOtherFloorDoNotReuseWalkPosition() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a")
        var doc = Fixtures.twoRooms(); doc.revision += 1; doc.parentRevision = 1
        XCTAssertThrowsError(try navigation(doc).move(from: start, toward: .init(x: 2, z: 2))) { XCTAssertEqual($0 as? WalkError, .stalePosition) }
        doc = Fixtures.twoRooms(); doc.floors[0].id = "upper"; doc.floors[0].elevation = 4
        let upper = try WalkNavigation(document: doc, floorID: "upper")
        XCTAssertEqual(try upper.place(inRoom: "room-a").eyeY, 5.6)
        XCTAssertThrowsError(try upper.move(from: start, toward: .init(x: 2, z: 2)))
    }
    func testNonfiniteAndUnboundedTargetsKeepOriginalPosition() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a")
        let bad = try nav.move(from: start, toward: .init(x: .nan, z: 0))
        XCTAssertEqual(bad.position, start); XCTAssertEqual(bad.stop, .invalidTarget)
        let far = try nav.move(from: start, toward: .init(x: 300, z: 0))
        XCTAssertEqual(far.position, start); XCTAssertEqual(far.stop, .requestTooLong)
    }
    func testBlockedMovementCanReverseAndRepeatedMovementCannotCrossWall() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 3))
        var position = start
        for _ in 0..<20 { position = try nav.move(from: position, toward: .init(x: 7, z: 3)).position }
        XCTAssertLessThan(position.point.x, 3.82)
        let reverse = try nav.move(from: position, toward: start.point)
        XCTAssertTrue(reverse.reachedTarget); XCTAssertEqual(reverse.position, start)
    }
    func testPortalBoundaryCanBeAValidIntermediatePosition() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 1.45))
        let doorway = try nav.move(from: start, toward: .init(x: 4, z: 1.45))
        XCTAssertTrue(doorway.reachedTarget)
        let next = try nav.move(from: doorway.position, toward: .init(x: 5, z: 1.45))
        XCTAssertTrue(next.reachedTarget); XCTAssertEqual(next.position.roomID, "room-b")
    }
    func testCoincidentUnsharedWallsNeverBecomePortal() throws {
        var doc = Fixtures.twoRooms(), floor = doc.floors[0]
        var duplicate = floor.walls.last!; duplicate.id = "unshared"
        floor.walls.append(duplicate)
        floor.rooms[1].boundary[3].wallID = duplicate.id
        doc.floors[0] = floor
        let nav = try navigation(doc)
        XCTAssertTrue(nav.portals.isEmpty)
        let start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 1.45))
        XCTAssertEqual(try nav.move(from: start, toward: .init(x: 6, z: 1.45)).stop, .wall)
    }
    func testNoRoomsMeansNoWalkableSpace() throws {
        var doc = Fixtures.twoRooms(); doc.floors[0].rooms = []
        let nav = try navigation(doc)
        XCTAssertTrue(nav.roomIDs.isEmpty); XCTAssertTrue(nav.portals.isEmpty)
        XCTAssertThrowsError(try nav.place(at: .init(x: 2, z: 2)))
    }
    func testDeterministicManyAnglesNeverLeavesKnownFloor() throws {
        let nav = try navigation(), start = try nav.place(inRoom: "room-a", at: .init(x: 2, z: 2))
        for index in 0..<360 {
            let angle = Double(index) * .pi / 180
            let result = try nav.move(from: start, toward: .init(x: 2 + 10 * cos(angle), z: 2 + 10 * sin(angle)))
            XCTAssertGreaterThanOrEqual(result.position.point.x, nav.settings.radius - 1e-6)
            XCTAssertLessThanOrEqual(result.position.point.x, 8 - nav.settings.radius + 1e-6)
            XCTAssertGreaterThanOrEqual(result.position.point.z, nav.settings.radius - 1e-6)
            XCTAssertLessThanOrEqual(result.position.point.z, 4 - nav.settings.radius + 1e-6)
        }
    }
}
