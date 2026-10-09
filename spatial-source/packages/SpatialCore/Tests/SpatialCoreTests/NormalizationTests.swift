import XCTest
@testable import SpatialCore

final class NormalizationTests: XCTestCase {
    func testCompleteColumnMajorTransformUsesAllAxes() throws {
        let transform = SurfaceTransform(columnMajor: [0,0,1,0, 0,1,0,0, -1,0,0,0, 10,2,-3,1])
        XCTAssertEqual(try transform.transformed(.init(x: 4, y: 5, z: 7)), .init(x: 3, y: 7, z: 1))
    }

    func testRejectsNonAffineNonfiniteAndIncorrectLengthTransforms() {
        for values in [[Double.nan] + Array(repeating: 0, count: 15), Array(repeating: 0, count: 15),
                       [1,0,0,0.1, 0,1,0,0, 0,0,1,0, 0,0,0,1]] {
            XCTAssertThrowsError(try SurfaceTransform(columnMajor: values).transformed(.init(x: 0, y: 0, z: 0)))
        }
    }

    func testAsymmetricRotatedRoomRetainsCoordinatesWindingAndElevation() throws {
        let angle = 37.0 * Double.pi / 180
        let raw: [Point2] = [.init(x: 0,z: 0), .init(x: 5,z: 0), .init(x: 5,z: 2), .init(x: 2,z: 4), .init(x: 0,z: 3)]
        let points = raw.map { Point2(x: 12 + $0.x * cos(angle) - $0.z * sin(angle), z: -3 + $0.x * sin(angle) + $0.z * cos(angle)) }
        var input = capture(surfaces: points.indices.map { i in surface("w\(i)", from: points[i], to: points[(i + 1) % points.count], bottom: 6, height: 2.7) },
                            rooms: [.init(id: "room", label: "Angled room", wallIDs: ["w3", "w1", "w4", "w0", "w2"])])
        input.floorElevation = 6
        let result = try SurfaceNormalizer.normalize(input), floor = result.document.floors[0]
        XCTAssertEqual(floor.rooms.count, 1); XCTAssertEqual(floor.nodes.count, 5)
        for point in points { XCTAssertTrue(floor.nodes.contains { $0.point.distance(to: point) < 1e-8 }) }
        let boundary = try Geometry.boundary(room: floor.rooms[0], floor: floor)
        XCTAssertEqual(Geometry.signedArea(boundary), Geometry.signedArea(raw), accuracy: 1e-8)
        XCTAssertTrue(floor.walls.allSatisfy { abs($0.baseY) < 1e-8 && $0.heightBasis == .captured })
        let scene = try SceneBuilder.build(document: result.document, floorID: "f")
        XCTAssertEqual(scene.faces.filter { $0.role == "floor" }.count, 1)
        XCTAssertTrue(scene.faces.flatMap(\.vertices).allSatisfy { $0.y >= 6 - 1e-8 })
        XCTAssertFalse(result.report.issues.contains { $0.code == "incomplete_room_boundary" })
    }

    func testUnorderedWallBoundaryBuilderRejectsIncompleteOrDisconnectedLoops() throws {
        let floor = Fixtures.twoRooms().floors[0]
        let boundary = try RoomBoundaryBuilder.closedBoundary(wallIDs: ["w5", "w6", "w0", "w4"], floor: floor)
        XCTAssertEqual(Set(boundary.map(\.wallID)), Set(["w0", "w4", "w5", "w6"]))
        XCTAssertThrowsError(try RoomBoundaryBuilder.closedBoundary(wallIDs: ["w0", "w6", "w5"], floor: floor))
        XCTAssertThrowsError(try RoomBoundaryBuilder.closedBoundary(wallIDs: ["w0", "w0", "w5"], floor: floor))
        XCTAssertThrowsError(try RoomBoundaryBuilder.closedBoundary(wallIDs: ["w0", "w1", "absent"], floor: floor))
    }

    func testNonuniformAndCurvedSurfacesAreRetainedWithoutInventedRectangles() throws {
        var nonuniform = surface("slope", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        nonuniform.localCorners[2].y = 2.1
        var curved = surface("curve", from: .init(x: 5,z: 0), to: .init(x: 9,z: 0)); curved.isCurved = true
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [nonuniform, curved]))
        XCTAssertTrue(result.document.floors[0].walls.isEmpty)
        XCTAssertEqual(result.report.surfaces.count, 2)
        XCTAssertEqual(result.report.surfaces.first(where: { $0.input.id == "slope" })?.input.localCorners, nonuniform.localCorners)
        XCTAssertTrue(result.report.issues.contains { $0.code == "nonuniform_surface" && $0.objectIDs == ["slope"] })
        XCTAssertTrue(result.report.issues.contains { $0.code == "unsupported_surface" && $0.objectIDs == ["curve"] })
    }

    func testTiltedWallIsFlaggedInsteadOfFlattened() throws {
        var tilted = surface("tilted", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        tilted.transform.columnMajor[6] = 0.1
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [tilted]))
        XCTAssertTrue(result.document.floors[0].walls.isEmpty)
        XCTAssertEqual(result.report.surfaces[0].worldCorners[2].z, 0.26, accuracy: 1e-8)
        XCTAssertTrue(result.report.issues.contains { $0.code == "nonuniform_surface" })
    }

    func testBowtieSurfaceCornerOrderIsNotRepairedSilently() throws {
        var bowtie = surface("bowtie", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        bowtie.localCorners.swapAt(1, 2)
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [bowtie]))
        XCTAssertTrue(result.document.floors[0].walls.isEmpty)
        XCTAssertTrue(result.report.issues.contains { $0.code == "nonuniform_surface" })
    }

    func testExactDuplicateWallsPreserveAllSourceIDsWithoutDuplicateGeometry() throws {
        let a = surface("a", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        let b = surface("b", from: .init(x: 4,z: 0), to: .init(x: 0,z: 0))
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [b, a]))
        XCTAssertEqual(result.document.floors[0].walls.count, 1)
        XCTAssertEqual(result.document.floors[0].walls[0].provenance.sourceIDs, ["a", "b"])
        XCTAssertEqual(result.report.surfaces.count, 2)
        XCTAssertTrue(result.report.mappings.contains { $0.sourceID == "b" && $0.resultingIDs == ["a"] })
    }

    func testExactSharedBoundaryProducesConnectedAdjacentRoomsWithOppositeDirections() throws {
        let points: [Point2] = [.init(x: 0,z: 0), .init(x: 4,z: 0), .init(x: 8,z: 0), .init(x: 8,z: 4), .init(x: 4,z: 4), .init(x: 0,z: 4)]
        let links = [(0,1),(1,2),(2,3),(3,4),(4,5),(5,0),(1,4)]
        var walls = links.enumerated().map { surface("w\($0.offset)", from: points[$0.element.0], to: points[$0.element.1]) }
        walls.append(surface("duplicate-shared", from: points[4], to: points[1]))
        let rooms = [CapturedRoomBoundary(id: "r1", label: "First", wallIDs: ["w0","w6","w4","w5"]),
                     .init(id: "r2", label: "Second", wallIDs: ["w1","w2","w3","duplicate-shared"])]
        let result = try SurfaceNormalizer.normalize(capture(surfaces: walls, rooms: rooms)), floor = result.document.floors[0]
        XCTAssertEqual(floor.rooms.count, 2); XCTAssertEqual(floor.walls.count, 7); XCTAssertEqual(floor.nodes.count, 6)
        let shared = floor.walls.first { $0.provenance.sourceIDs.contains("w6") }!
        let refs = floor.rooms.flatMap(\.boundary).filter { $0.wallID == shared.id }
        XCTAssertEqual(refs.count, 2); XCTAssertNotEqual(refs[0].reversed, refs[1].reversed)
    }

    func testNearbyEndpointsRequireExplicitConnectionAndDoNotCreateRoomFill() throws {
        let surfaces = [surface("a", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0)),
                        surface("b", from: .init(x: 4.02,z: 0), to: .init(x: 4,z: 3)),
                        surface("c", from: .init(x: 4,z: 3), to: .init(x: 0,z: 3)),
                        surface("d", from: .init(x: 0,z: 3), to: .init(x: 0,z: 0))]
        let result = try SurfaceNormalizer.normalize(capture(surfaces: surfaces, rooms: [.init(id: "r", label: "Incomplete", wallIDs: ["a","b","c","d"])]))
        XCTAssertEqual(result.document.floors[0].nodes.count, 5)
        XCTAssertTrue(result.document.floors[0].rooms.isEmpty)
        XCTAssertTrue(result.report.issues.contains { $0.code == "proposed_endpoint_merge" })
        XCTAssertTrue(result.report.issues.contains { $0.code == "incomplete_room_boundary" })
        XCTAssertTrue(try SceneBuilder.build(document: result.document, floorID: "f").faces.allSatisfy { $0.role != "floor" })
    }

    func testParentHostedOpeningUsesRotatedPathOffsetAndCreatesCutout() throws {
        let a = Point2(x: 10,z: 5), b = Point2(x: 10,z: 10)
        let wall = surface("wall", from: a, to: b)
        let opening = surface("window", from: .init(x: 10,z: 6), to: .init(x: 10,z: 8), bottom: 0.8, height: 1.2, kind: .window, parent: "wall")
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [opening, wall]))
        let actual = try XCTUnwrap(result.document.floors[0].openings.first)
        XCTAssertEqual(actual.offset, 1, accuracy: 1e-9); XCTAssertEqual(actual.width, 2, accuracy: 1e-9)
        XCTAssertEqual(actual.bottom, 0.8, accuracy: 1e-9)
        let scene = try SceneBuilder.build(document: result.document, floorID: "f")
        for face in scene.faces where face.objectID == "wall" {
            let zs = face.vertices.map(\.z), ys = face.vertices.map(\.y)
            XCTAssertFalse(zs.min()! < 7 && zs.max()! > 7 && ys.min()! < 1.4 && ys.max()! > 1.4)
        }
    }

    func testOpeningDoesNotAttachAcrossNearbyParallelCorridorWall() throws {
        let wall = surface("wall", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        let opening = surface("opening", from: .init(x: 1,z: 0.02), to: .init(x: 2,z: 0.02), height: 2, kind: .door)
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [wall, opening]))
        XCTAssertTrue(result.document.floors[0].openings.isEmpty)
        XCTAssertTrue(result.report.issues.contains { $0.code == "unresolved_opening_host" })
    }

    func testMissingExplicitParentNeverFallsBackToNearbyWall() throws {
        let wall = surface("wall", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        let opening = surface("opening", from: .init(x: 1,z: 0), to: .init(x: 2,z: 0), height: 2, kind: .door, parent: "absent")
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [wall, opening]))
        XCTAssertTrue(result.document.floors[0].openings.isEmpty)
        XCTAssertTrue(result.report.issues.contains { $0.code == "missing_opening_parent" })
    }

    func testAmbiguousOpeningHostsRemainUnresolved() throws {
        let low = surface("low", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        let tall = surface("tall", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0), height: 3)
        let opening = surface("opening", from: .init(x: 1,z: 0), to: .init(x: 2,z: 0), height: 2, kind: .door)
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [low, tall, opening]))
        XCTAssertTrue(result.document.floors[0].openings.isEmpty)
        XCTAssertTrue(result.report.issues.contains { $0.code == "ambiguous_opening_host" })
    }

    func testSourceOpeningOverlapIsRetainedAsIssueAndNotRenderedTwice() throws {
        let wall = surface("wall", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        let one = surface("one", from: .init(x: 1,z: 0), to: .init(x: 2,z: 0), height: 2, kind: .door, parent: "wall")
        let two = surface("two", from: .init(x: 1.5,z: 0), to: .init(x: 2.5,z: 0), height: 2, kind: .door, parent: "wall")
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [wall, one, two]))
        XCTAssertEqual(result.document.floors[0].openings.count, 1)
        XCTAssertEqual(result.report.surfaces.count, 3)
        XCTAssertTrue(result.report.issues.contains { $0.code == "overlapping_source_opening" })
    }

    func testDuplicateSourceOpeningGetsOneStableGeometryIdentity() throws {
        let wall = surface("wall", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        let one = surface("one", from: .init(x: 1,z: 0), to: .init(x: 2,z: 0), height: 2, kind: .door, parent: "wall")
        var two = one; two.id = "two"
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [wall, one, two]))
        XCTAssertEqual(result.document.floors[0].openings.count, 1)
        XCTAssertEqual(result.document.floors[0].openings[0].provenance.sourceIDs, ["one", "two"])
        XCTAssertTrue(result.report.mappings.contains { $0.objectKind == "opening" && $0.sourceID == "two" })
    }

    func testAboveWallOpeningDoesNotSilentlyClamp() throws {
        let wall = surface("wall", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        let opening = surface("window", from: .init(x: 1,z: 0), to: .init(x: 2,z: 0), bottom: 2, height: 1, kind: .window, parent: "wall")
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [wall, opening]))
        XCTAssertTrue(result.document.floors[0].openings.isEmpty)
        XCTAssertEqual(result.report.surfaces.first(where: { $0.input.id == "window" })?.worldCorners.map(\.y).max(), 3)
    }

    func testReportRoundTripAndDeterministicReprocessingPreserveFullSource() throws {
        let input = capture(surfaces: [surface("a", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))])
        let first = try SurfaceNormalizer.normalize(input), second = try SurfaceNormalizer.normalize(input)
        XCTAssertEqual(first, second)
        XCTAssertEqual(first, try JSONDecoder().decode(NormalizationResult.self, from: JSONEncoder().encode(first)))
        XCTAssertEqual(first.report.frameID, "frame-1"); XCTAssertEqual(first.report.sourceArchiveID, "raw-1")
        XCTAssertEqual(first.document.measurementStatus, "unverified"); XCTAssertEqual(first.document.reviewState, .needsReview)
    }

    func testDuplicateInvalidAndUnboundedSourceInputsAreRejected() {
        let source = surface("a", from: .init(x: 0,z: 0), to: .init(x: 4,z: 0))
        XCTAssertThrowsError(try SurfaceNormalizer.normalize(capture(surfaces: [source, source])))
        var invalid = source; invalid.id = "../escape"
        XCTAssertThrowsError(try SurfaceNormalizer.normalize(capture(surfaces: [invalid])))
        invalid = source; invalid.localCorners[0].x = .infinity
        XCTAssertThrowsError(try SurfaceNormalizer.normalize(capture(surfaces: [invalid])))
        invalid = source; invalid.transform.columnMajor[12] = 10001
        XCTAssertThrowsError(try SurfaceNormalizer.normalize(capture(surfaces: [invalid])))
    }

    func testCapturedFloorPolygonNeverInventsRoomWithoutObservedBoundary() throws {
        let source = CapturedSurface(id: "floor-source", kind: .floor, transform: .identity,
                                     localCorners: [.init(x: 0,y: 0,z: 0), .init(x: 4,y: 0,z: 0), .init(x: 4,y: 0,z: 3), .init(x: 0,y: 0,z: 3)])
        let result = try SurfaceNormalizer.normalize(capture(surfaces: [source]))
        XCTAssertTrue(result.document.floors[0].rooms.isEmpty)
        XCTAssertEqual(result.report.surfaces[0].worldCorners, source.localCorners)
        XCTAssertTrue(result.report.issues.contains { $0.code == "no_supported_walls" })
    }

    func testCheckedInRotatedGoldenSourceMatchesIndependentExpectedFootprint() throws {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let inputURL = root.appendingPathComponent("fixtures/geometry/rotated_asymmetric.capture.json")
        let expectedURL = root.appendingPathComponent("fixtures/geometry/rotated_asymmetric.expected.json")
        struct Expected: Decodable { var worldFootprint: [Point2]; var signedAreaForAlgorithmCheckOnly: Double; var wallCount: Int; var roomCount: Int }
        let input = try JSONDecoder().decode(SurfaceCapture.self, from: Data(contentsOf: inputURL))
        let expected = try JSONDecoder().decode(Expected.self, from: Data(contentsOf: expectedURL))
        let result = try SurfaceNormalizer.normalize(input), floor = result.document.floors[0]
        XCTAssertEqual(floor.walls.count, expected.wallCount); XCTAssertEqual(floor.rooms.count, expected.roomCount)
        for point in expected.worldFootprint { XCTAssertTrue(floor.nodes.contains { $0.point.distance(to: point) < 1e-8 }) }
        let boundary = try Geometry.boundary(room: floor.rooms[0], floor: floor)
        XCTAssertEqual(Geometry.signedArea(boundary), expected.signedAreaForAlgorithmCheckOnly, accuracy: 1e-8)
    }

    func testDenseEndpointReviewWorkIsBoundedAndExplicit() throws {
        let sources = (0..<300).map { i in
            surface("dense-\(i)", from: .init(x: Double(i) * 0.000006, z: 0), to: .init(x: Double(i) * 0.000006 + 0.000002, z: 0))
        }
        let result = try SurfaceNormalizer.normalize(capture(surfaces: sources))
        XCTAssertEqual(result.document.floors[0].walls.count, 300)
        XCTAssertEqual(result.report.issues.filter { $0.code == "proposed_endpoint_merge" }.count, 10000)
        XCTAssertEqual(result.report.issues.filter { $0.code == "dense_endpoint_review" }.count, 1)
    }

    private func capture(surfaces: [CapturedSurface], rooms: [CapturedRoomBoundary] = []) -> SurfaceCapture {
        .init(documentID: "synthetic-capture", title: "Synthetic capture", floorID: "f", floorLabel: "Level 1",
              frameID: "frame-1", sourceArchiveID: "raw-1", sdkVersion: "synthetic-fixture-1", surfaces: surfaces, rooms: rooms)
    }

    private func surface(_ id: String, from a: Point2, to b: Point2, bottom: Double = 0, height: Double = 2.6,
                         kind: CapturedSurfaceKind = .wall, parent: String? = nil) -> CapturedSurface {
        let length = a.distance(to: b), x = (b.x - a.x) / length, z = (b.z - a.z) / length
        return .init(id: id, kind: kind,
                     transform: .init(columnMajor: [x,0,z,0, 0,1,0,0, -z,0,x,0, a.x,bottom,a.z,1]),
                     localCorners: [.init(x: 0,y: 0,z: 0), .init(x: length,y: 0,z: 0), .init(x: length,y: height,z: 0), .init(x: 0,y: height,z: 0)],
                     parentWallID: parent, classificationConfidence: .medium)
    }
}
