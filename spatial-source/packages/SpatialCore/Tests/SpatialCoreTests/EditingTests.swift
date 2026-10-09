import XCTest
@testable import SpatialCore

final class EditingTests: XCTestCase {
    func testSharedCornerMoveUpdatesIncidentGeometryAndLineage() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.moveNode(floorID: "floor-1", nodeID: "n1", point: .init(x: 4.25, z: 0)), expectedRevision: 1)
        let floor = editor.document.floors[0]
        for id in ["w0", "w1", "w6"] {
            XCTAssertEqual(floor.walls.first(where: { $0.id == id })?.provenance.origin, .edited)
            XCTAssertTrue(editor.lastReceipt!.mappings.contains { $0.objectKind == "wall" && $0.sourceID == id })
        }
        XCTAssertEqual(floor.openings.first(where: { $0.id == "door-a" })?.offset, 1)
        XCTAssertTrue(editor.lastReceipt!.mappings.contains { $0.sourceID == "door-a" && $0.requiresOverlayReview })
        XCTAssertEqual(editor.lastReceipt!.mappings.filter { $0.objectKind == "room" }.count, 2)
        try Validator.requireValid(editor.document)
    }

    func testMoveWholeWallRetainsSharedCornerConnections() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.moveWall(floorID: "floor-1", wallID: "w6", translation: .init(x: 0.5, z: 0)), expectedRevision: 1)
        let floor = editor.document.floors[0]
        XCTAssertEqual(floor.nodes.first(where: { $0.id == "n1" })?.point, .init(x: 4.5, z: 0))
        XCTAssertEqual(floor.nodes.first(where: { $0.id == "n4" })?.point, .init(x: 4.5, z: 4))
        XCTAssertEqual(try Geometry.boundary(room: floor.rooms[0], floor: floor)[1], .init(x: 4.5, z: 0))
        XCTAssertEqual(floor.openings.first(where: { $0.id == "door-a" })?.offset, 1)
    }

    func testShorteningWallNeverClampsOpeningAndRejectedEditRetainsRedo() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Lab"), expectedRevision: 1)
        try editor.undo(expectedRevision: 2)
        let previous = editor.document, receipt = editor.lastReceipt
        XCTAssertThrowsError(try editor.apply(.moveNode(floorID: "floor-1", nodeID: "n4", point: .init(x: 4, z: 1)), expectedRevision: 3))
        XCTAssertEqual(editor.document, previous); XCTAssertEqual(editor.lastReceipt, receipt)
        XCTAssertTrue(editor.canRedo); XCTAssertFalse(editor.canUndo)
    }

    func testSplitSharedWallRehostsOpeningAndPreservesBothRoomDirections() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.splitWall(floorID: "floor-1", wallID: "w6", offset: 0.5, newWallID: "split-right", newNodeID: "split-corner"), expectedRevision: 1)
        let floor = editor.document.floors[0]
        let door = try XCTUnwrap(floor.openings.first(where: { $0.id == "door-a" }))
        XCTAssertEqual(door.wallID, "split-right"); XCTAssertEqual(door.offset, 0.5, accuracy: 1e-9)
        XCTAssertEqual(floor.rooms[0].boundary[1...2].map(\.wallID), ["w6", "split-right"])
        XCTAssertEqual(floor.rooms[1].boundary.suffix(2).map(\.wallID), ["split-right", "w6"])
        XCTAssertTrue(floor.rooms[1].boundary.suffix(2).allSatisfy(\.reversed))
        XCTAssertEqual(editor.lastReceipt?.mappings.first?.resultingIDs, ["w6", "split-right"])
        let scene = try SceneBuilder.build(document: editor.document, floorID: floor.id)
        XCTAssertTrue(scene.edges.contains { $0.objectID == "door-a" })
        try editor.undo(expectedRevision: 2)
        XCTAssertEqual(editor.document.floors, Fixtures.twoRooms().floors)
        try editor.redo(expectedRevision: 3)
        XCTAssertEqual(editor.document.floors, [floor])
    }

    func testSplitThroughOpeningRollsBackWholeTransaction() throws {
        let original = Fixtures.twoRooms(); var editor = try EditorSession(original)
        XCTAssertThrowsError(try editor.apply([
            .renameRoom(floorID: "floor-1", roomID: "room-a", label: "Temporary"),
            .splitWall(floorID: "floor-1", wallID: "w6", offset: 1.4, newWallID: "right", newNodeID: "cut")
        ], expectedRevision: 1)) { error in XCTAssertTrue(String(describing: error).contains("opening_straddles_split")) }
        XCTAssertEqual(editor.document, original); XCTAssertFalse(editor.canUndo); XCTAssertNil(editor.lastReceipt)
    }

    func testSplitThenJoinPreservesOpeningWorldPositionAndWallIdentity() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        let before = editor.document.floors[0]
        try editor.apply(.splitWall(floorID: "floor-1", wallID: "w6", offset: 0.5, newWallID: "right", newNodeID: "cut"), expectedRevision: 1)
        try editor.apply(.joinWalls(floorID: "floor-1", firstWallID: "w6", secondWallID: "right"), expectedRevision: 2)
        let floor = editor.document.floors[0]
        XCTAssertEqual(floor.walls.count, before.walls.count)
        XCTAssertEqual(floor.openings, before.openings)
        for room in floor.rooms {
            let old = try Geometry.boundary(room: before.rooms.first(where: { $0.id == room.id })!, floor: before)
            let new = try Geometry.boundary(room: room, floor: floor)
            XCTAssertEqual(abs(Geometry.signedArea(old)), abs(Geometry.signedArea(new)), accuracy: 1e-9)
        }
        XCTAssertTrue(editor.lastReceipt!.mappings.contains { $0.sourceID == "right" && $0.resultingIDs == ["w6"] })
    }

    func testSplitAtExistingPolylineCornerRetainsNodeID() throws {
        var editor = try EditorSession(freeWalls(secondReversed: false, secondFirst: false))
        try editor.apply(.joinWalls(floorID: "f", firstWallID: "a", secondWallID: "b"), expectedRevision: 1)
        try editor.apply(.splitWall(floorID: "f", wallID: "a", offset: 2, newWallID: "split", newNodeID: nil), expectedRevision: 2)
        XCTAssertEqual(editor.document.floors[0].nodes.count, 3)
        XCTAssertEqual(editor.document.floors[0].walls.first?.nodeIDs.last, "n1")
    }

    func testJoinAllEndpointOrientationsPreservesOpeningPositions() throws {
        for reversed in [false, true] {
            for secondFirst in [false, true] {
                let original = freeWalls(secondReversed: reversed, secondFirst: secondFirst)
                let oldPoints = try openingEndpoints(original.floors[0])
                var editor = try EditorSession(original)
                try editor.apply(.joinWalls(floorID: "f", firstWallID: "a", secondWallID: "b"), expectedRevision: 1)
                let newPoints = try openingEndpoints(editor.document.floors[0])
                for id in oldPoints.keys {
                    XCTAssertEqual(oldPoints[id]!.map(\.x).sorted(), newPoints[id]!.map(\.x).sorted())
                }
                XCTAssertEqual(editor.document.floors[0].walls.count, 1)
                XCTAssertTrue(editor.document.floors[0].openings.allSatisfy { $0.wallID == "a" })
            }
        }
    }

    func testJoiningWallsCannotConsumeOnlyPartOfRoomBoundary() throws {
        let original = Fixtures.twoRooms(); var editor = try EditorSession(original)
        XCTAssertThrowsError(try editor.apply(.joinWalls(floorID: "floor-1", firstWallID: "w0", secondWallID: "w1"), expectedRevision: 1))
        XCTAssertEqual(editor.document, original)
    }

    func testJoinRetainsConservativeHeightBasisAndClassificationConfidence() throws {
        var original = freeWalls(secondReversed: false, secondFirst: false)
        original.floors[0].walls[0].heightBasis = .captured
        original.floors[0].walls[0].provenance.classificationConfidence = .high
        original.floors[0].walls[1].heightBasis = .assumed
        original.floors[0].walls[1].provenance.classificationConfidence = .low
        var editor = try EditorSession(original)
        try editor.apply(.joinWalls(floorID: "f", firstWallID: "a", secondWallID: "b"), expectedRevision: 1)
        XCTAssertEqual(editor.document.floors[0].walls[0].heightBasis, .assumed)
        XCTAssertEqual(editor.document.floors[0].walls[0].provenance.classificationConfidence, .low)
    }

    func testJoinRejectsDifferentHeights() throws {
        var original = freeWalls(secondReversed: false, secondFirst: false)
        original.floors[0].walls[1].height = 3.5
        var editor = try EditorSession(original)
        XCTAssertThrowsError(try editor.apply(.joinWalls(floorID: "f", firstWallID: "a", secondWallID: "b"), expectedRevision: 1))
        XCTAssertEqual(editor.document, original)
    }

    func testExplicitBatchDeleteRemovesOnlyRequestedDependencies() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        XCTAssertThrowsError(try editor.apply(.deleteWall(floorID: "floor-1", wallID: "w6"), expectedRevision: 1))
        try editor.apply([
            .deleteRoom(floorID: "floor-1", roomID: "room-a"), .deleteRoom(floorID: "floor-1", roomID: "room-b"),
            .deleteOpening(floorID: "floor-1", openingID: "door-a"), .deleteWall(floorID: "floor-1", wallID: "w6")
        ], expectedRevision: 1)
        XCTAssertEqual(editor.document.revision, 2)
        XCTAssertEqual(editor.document.floors[0].walls.count, 6)
        XCTAssertEqual(editor.document.floors[0].openings.count, 2)
        XCTAssertTrue(GeometryDiagnostics.inspect(document: editor.document).contains { $0.code == "walls_without_room_boundary" })
        try editor.undo(expectedRevision: 2)
        XCTAssertEqual(editor.document.floors, Fixtures.twoRooms().floors)
    }

    func testOpeningInsertResizeKindChangeAndDeleteWithUndo() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        var opening = Opening(id: "new-opening", wallID: "w0", kind: .window, offset: 0.5, width: 1, bottom: 0.8, height: 1,
                              provenance: .init(origin: .captured, sourceIDs: ["source-opening"]))
        try editor.apply(.addOpening(floorID: "floor-1", opening: opening), expectedRevision: 1)
        opening.kind = .passage; opening.width = 1.2; opening.height = 2.2; opening.bottom = 0
        opening.provenance.sourceIDs = []
        try editor.apply(.updateOpening(floorID: "floor-1", opening: opening), expectedRevision: 2)
        XCTAssertEqual(editor.document.floors[0].openings.last?.provenance.sourceIDs, ["source-opening"])
        XCTAssertEqual(editor.document.floors[0].openings.last?.kind, .passage)
        try editor.apply(.deleteOpening(floorID: "floor-1", openingID: opening.id), expectedRevision: 3)
        try editor.undo(expectedRevision: 4)
        XCTAssertEqual(editor.document.floors[0].openings.last?.width, 1.2)
    }

    func testOpeningInvalidResizeDoesNotMutateHistory() throws {
        let original = Fixtures.twoRooms(); var editor = try EditorSession(original)
        var opening = original.floors[0].openings[0]; opening.width = 100
        XCTAssertThrowsError(try editor.apply(.updateOpening(floorID: "floor-1", opening: opening), expectedRevision: 1))
        XCTAssertEqual(editor.document, original); XCTAssertFalse(editor.canUndo)
    }

    func testDrawWallAndExplicitCornerDisconnectionThenMerge() throws {
        var original = freeWalls(secondReversed: false, secondFirst: false); original.floors[0].openings = []
        var editor = try EditorSession(original)
        try editor.apply(.disconnectNode(floorID: "f", wallID: "b", nodeID: "n1", newNodeID: "detached"), expectedRevision: 1)
        XCTAssertEqual(editor.document.floors[0].nodes.count, 4)
        XCTAssertTrue(GeometryDiagnostics.inspect(document: editor.document).contains { $0.objectIDs.contains("detached") })
        try editor.apply(.mergeNodes(floorID: "f", sourceNodeID: "detached", targetNodeID: "n1"), expectedRevision: 2)
        XCTAssertEqual(editor.document.floors[0].nodes, original.floors[0].nodes)
        let wall = Wall(id: "drawn", nodeIDs: ["n2", "n3"], height: 2.5, heightBasis: .assumed, provenance: .init(origin: .edited))
        try editor.apply(.addWall(floorID: "f", wall: wall, newNodes: [.init(id: "n3", point: .init(x: 4, z: 3))]), expectedRevision: 3)
        XCTAssertEqual(editor.document.floors[0].walls.count, 3)
    }

    func testMergingAdjacentCornersCannotCollapseWall() throws {
        var editor = try EditorSession(Fixtures.twoRooms()); let original = editor.document
        XCTAssertThrowsError(try editor.apply(.mergeNodes(floorID: "floor-1", sourceNodeID: "n0", targetNodeID: "n1"), expectedRevision: 1))
        XCTAssertEqual(editor.document, original)
    }

    func testDeletingLastFloorFailsButManagingAdditionalFloorWorks() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        XCTAssertThrowsError(try editor.apply(.deleteFloor(floorID: "floor-1"), expectedRevision: 1))
        try editor.apply(.addFloor(floor: .init(id: "upper", label: "Upper floor", elevation: 3, nodes: [], walls: [], openings: [], rooms: [])), expectedRevision: 1)
        try editor.apply(.deleteFloor(floorID: "floor-1"), expectedRevision: 2)
        XCTAssertEqual(editor.document.floors.map(\.id), ["upper"])
    }

    func testCommandsAndReceiptsRoundTripWithoutLosingLineage() throws {
        let command = EditCommand.splitWall(floorID: "floor-1", wallID: "w6", offset: 0.5, newWallID: "right", newNodeID: "cut")
        XCTAssertEqual(command, try JSONDecoder().decode(EditCommand.self, from: JSONEncoder().encode(command)))
        var editor = try EditorSession(Fixtures.twoRooms()); try editor.apply(command, expectedRevision: 1)
        XCTAssertEqual(editor.lastReceipt, try JSONDecoder().decode(EditReceipt.self, from: JSONEncoder().encode(editor.lastReceipt!)))
        let receipt = EditReceipt.restoring(from: editor.document, to: Fixtures.twoRooms())
        XCTAssertTrue(receipt.mappings.contains { $0.sourceID == "right" && $0.resultingIDs.isEmpty })
    }

    func testStandaloneBowtieWallAndAdjacentBacktrackingAreRejected() throws {
        for points: [Point2] in [
            [.init(x: 0,z: 0), .init(x: 3,z: 3), .init(x: 0,z: 3), .init(x: 3,z: 0)],
            [.init(x: 0,z: 0), .init(x: 3,z: 0), .init(x: 1,z: 0)]
        ] {
            let nodes = points.enumerated().map { Node(id: "p\($0.offset)", point: $0.element) }
            let wall = Wall(id: "bowtie", nodeIDs: nodes.map(\.id), height: 2.5, heightBasis: .synthetic, provenance: .init(origin: .synthetic))
            let document = SpatialDocument(documentID: "invalid-path", title: "Synthetic", floors: [.init(id: "f", label: "F", nodes: nodes, walls: [wall], openings: [], rooms: [])])
            XCTAssertTrue(Validator.validate(document).contains { $0.code == "self_intersecting_wall" })
        }
    }

    func testCrossKindRenderIdentityCollisionIsRejected() {
        var document = Fixtures.twoRooms(); document.floors[0].rooms[0].id = "w0"
        XCTAssertTrue(Validator.validate(document).contains { $0.code == "duplicate_id" && $0.path.contains("renderObjects") })
    }

    func testCompoundSplitJoinReceiptReferencesOnlyFinalGraphAndOriginalSources() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply([
            .splitWall(floorID: "floor-1", wallID: "w0", offset: 2, newWallID: "transient", newNodeID: "cut"),
            .joinWalls(floorID: "floor-1", firstWallID: "w0", secondWallID: "transient")
        ], expectedRevision: 1)
        let mappings = editor.lastReceipt!.mappings
        XCTAssertEqual(mappings.first(where: { $0.objectKind == "wall" && $0.sourceID == "w0" })?.resultingIDs, ["w0"])
        XCTAssertFalse(mappings.contains { $0.sourceID == "transient" || $0.resultingIDs.contains("transient") })
    }

    func testCompoundSplitTwiceComposesDescendantLineage() throws {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply([
            .splitWall(floorID: "floor-1", wallID: "w0", offset: 1, newWallID: "second", newNodeID: "cut1"),
            .splitWall(floorID: "floor-1", wallID: "second", offset: 1, newWallID: "third", newNodeID: "cut2")
        ], expectedRevision: 1)
        XCTAssertEqual(editor.lastReceipt!.mappings.first(where: { $0.objectKind == "wall" && $0.sourceID == "w0" })?.resultingIDs,
                       ["w0", "second", "third"])
        XCTAssertFalse(editor.lastReceipt!.mappings.contains { $0.sourceID == "second" })
    }

    func testTransportTextLimitCountsUnicodeScalarsInsteadOfGraphemes() throws {
        var document = Fixtures.twoRooms()
        document.title = String(repeating: "a\u{0301}", count: 256)
        XCTAssertTrue(Validator.validate(document).contains { $0.code == "invalid_text" && $0.path == "title" })
        document.title = String(repeating: "a\u{0301}", count: 128)
        try Validator.requireValid(document)
        document.floors[0].rooms[0].label = String(repeating: "a\u{0301}", count: 256)
        XCTAssertTrue(Validator.validate(document).contains { $0.code == "invalid_text" && $0.path.contains(".label") })
    }

    private func openingEndpoints(_ floor: Floor) throws -> [String: [Point2]] {
        var result: [String: [Point2]] = [:]
        for opening in floor.openings {
            let path = try Geometry.path(wall: floor.walls.first(where: { $0.id == opening.wallID })!, floor: floor)
            result[opening.id] = [try Geometry.point(at: opening.offset, on: path), try Geometry.point(at: opening.offset + opening.width, on: path)]
        }
        return result
    }

    private func freeWalls(secondReversed: Bool, secondFirst: Bool) -> SpatialDocument {
        let nodes = [Node(id: "n0", point: .init(x: 0,z: 0)), .init(id: "n1", point: .init(x: 2,z: 0)), .init(id: "n2", point: .init(x: 4,z: 0))]
        let a = secondFirst ? ["n1", "n2"] : ["n0", "n1"]
        var b = secondFirst ? ["n0", "n1"] : ["n1", "n2"]; if secondReversed { b.reverse() }
        let walls = [Wall(id: "a", nodeIDs: a, height: 3, heightBasis: .synthetic, provenance: .init(origin: .synthetic)),
                     Wall(id: "b", nodeIDs: b, height: 3, heightBasis: .synthetic, provenance: .init(origin: .synthetic))]
        let openings = [Opening(id: "oa", wallID: "a", kind: .door, offset: 0.25, width: 0.5, bottom: 0, height: 2, provenance: .init(origin: .synthetic)),
                        Opening(id: "ob", wallID: "b", kind: .window, offset: 0.25, width: 0.5, bottom: 1, height: 1, provenance: .init(origin: .synthetic))]
        return .init(documentID: "free-walls", title: "Synthetic free walls", floors: [.init(id: "f", label: "F", nodes: nodes, walls: walls, openings: openings, rooms: [])])
    }
}
