import XCTest
@testable import SpatialCore

final class WorldBoundsTests: XCTestCase {
    func testCombinedWorldElevationCannotExceedTransportOrRendererBounds() throws {
        var document = Fixtures.twoRooms()
        document.floors[0].elevation = 9999
        XCTAssertTrue(Validator.validate(document).contains { $0.code == "world_height_bounds" })
        XCTAssertThrowsError(try SceneBuilder.build(document: document, floorID: "floor-1"))
        XCTAssertThrowsError(try EditorSession(document))
        document.floors[0].elevation = -9999
        document.floors[0].walls[0].baseY = -2
        XCTAssertTrue(Validator.validate(document).contains { $0.code == "world_height_bounds" })
    }

    func testExactPositiveAndNegativeWorldLimitsRemainUsable() throws {
        var document = Fixtures.twoRooms()
        document.floors[0].elevation = 10000 - 2.6
        XCTAssertTrue(Validator.validate(document).isEmpty)
        let scene = try SceneBuilder.build(document: document, floorID: "floor-1")
        XCTAssertTrue(scene.faces.flatMap(\.vertices).allSatisfy { abs($0.y) <= 10000 })
        document.floors[0].elevation = -10000
        XCTAssertTrue(Validator.validate(document).isEmpty)
    }
}
