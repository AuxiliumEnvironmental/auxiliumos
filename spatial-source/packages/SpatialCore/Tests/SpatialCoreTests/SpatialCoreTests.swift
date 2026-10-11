import XCTest
@testable import SpatialCore

final class SpatialCoreTests: XCTestCase {
    func testFixtureValid() throws { try Validator.requireValid(Fixtures.twoRooms()) }
    func testJSONRoundTrip() throws {
        let d=Fixtures.twoRooms(); XCTAssertEqual(d,try JSONDecoder().decode(SpatialDocument.self,from:d.encoded()))
    }
    func testRejectWrongSchema() { var d=Fixtures.twoRooms(); d.schemaVersion="2.0.0"; XCTAssertFalse(Validator.validate(d).isEmpty) }
    func testRejectMeasurementCertification() { var d=Fixtures.twoRooms(); d.measurementStatus="surveyed"; XCTAssertFalse(Validator.validate(d).isEmpty) }
    func testRejectWrongCoordinates() { var d=Fixtures.twoRooms(); d.coordinateSystem="pixels"; XCTAssertFalse(Validator.validate(d).isEmpty) }
    func testRejectDuplicateNode() { var d=Fixtures.twoRooms(); d.floors[0].nodes.append(d.floors[0].nodes[0]); XCTAssertTrue(Validator.validate(d).contains { $0.code == "duplicate_id" }) }
    func testRejectNaN() { var d=Fixtures.twoRooms(); d.floors[0].nodes[0].point.x = .nan; XCTAssertTrue(Validator.validate(d).contains { $0.code == "number" }) }
    func testRejectInfinity() { var d=Fixtures.twoRooms(); d.floors[0].walls[0].height = .infinity; XCTAssertFalse(Validator.validate(d).isEmpty) }
    func testRejectMissingNode() { var d=Fixtures.twoRooms(); d.floors[0].nodes.removeFirst(); XCTAssertTrue(Validator.validate(d).contains { $0.code == "missing_node" }) }
    func testRejectDegenerateWall() { var d=Fixtures.twoRooms(); d.floors[0].walls[0].nodeIDs=["n0","n0"]; XCTAssertTrue(Validator.validate(d).contains { $0.code == "degenerate_wall" }) }
    func testRejectMissingOpeningHost() { var d=Fixtures.twoRooms(); d.floors[0].openings[0].wallID="absent"; XCTAssertTrue(Validator.validate(d).contains { $0.code == "missing_wall" }) }
    func testRejectOpeningOutsideWall() { var d=Fixtures.twoRooms(); d.floors[0].openings[0].offset=100; XCTAssertTrue(Validator.validate(d).contains { $0.code == "opening_bounds" }) }
    func testRejectOpeningAboveWall() { var d=Fixtures.twoRooms(); d.floors[0].openings[0].height=10; XCTAssertFalse(Validator.validate(d).isEmpty) }
    func testRejectOverlappingOpenings() { var d=Fixtures.twoRooms(); var o=d.floors[0].openings[0]; o.id="other"; d.floors[0].openings.append(o); XCTAssertTrue(Validator.validate(d).contains { $0.code == "opening_overlap" }) }
    func testTouchingOpeningsAllowed() throws {
        var d=Fixtures.twoRooms(); var o=d.floors[0].openings[0]; o.id="other"; o.offset += o.width
        d.floors[0].openings.append(o); try Validator.requireValid(d)
    }
    func testInvalidParentRevision() { var d=Fixtures.twoRooms(); d.parentRevision=2; XCTAssertFalse(Validator.validate(d).isEmpty) }
    func testRejectOpenRoomBoundary() { var d=Fixtures.twoRooms(); d.floors[0].rooms[0].boundary.removeLast(); XCTAssertTrue(Validator.validate(d).contains { $0.code == "open_boundary" }) }
    func testRejectDuplicatedBoundary() { var d=Fixtures.twoRooms(); d.floors[0].rooms[0].boundary.append(.init(wallID:"w0")); XCTAssertFalse(Validator.validate(d).isEmpty) }
    func testRoomBoundariesShareNodeIdentity() throws {
        let d=Fixtures.twoRooms(), f=d.floors[0]
        XCTAssertEqual(try Geometry.boundary(room:f.rooms[0],floor:f).count,4)
        XCTAssertEqual(try Geometry.boundary(room:f.rooms[1],floor:f).count,4)
    }
    func testConcaveTriangulationArea() throws {
        let p=[Point2(x:0,z:0),.init(x:4,z:0),.init(x:4,z:1),.init(x:1,z:1),.init(x:1,z:4),.init(x:0,z:4)]
        let t=try Geometry.triangulate(p)
        XCTAssertEqual(t.count,4)
        let area=t.reduce(0.0) { $0+abs(Geometry.cross(p[$1[0]],p[$1[1]],p[$1[2]]))/2 }
        XCTAssertEqual(area,7,accuracy:1e-8)
        for x in t { XCTAssertTrue(Geometry.contains(.init(x:(p[x[0]].x+p[x[1]].x+p[x[2]].x)/3,z:(p[x[0]].z+p[x[1]].z+p[x[2]].z)/3),polygon:p)) }
    }
    func testClockwiseTriangulation() throws {
        let p=[Point2(x:0,z:0),.init(x:0,z:2),.init(x:2,z:2),.init(x:2,z:0)]
        XCTAssertEqual(try Geometry.triangulate(p).count,2)
    }
    func testCollinearPolygonTriangulation() throws {
        let p=[Point2(x:0,z:0),.init(x:1,z:0),.init(x:2,z:0),.init(x:2,z:2),.init(x:0,z:2)]
        XCTAssertEqual(try Geometry.triangulate(p).count,2)
    }
    func testSelfIntersectingPolygonRejected() {
        let p=[Point2(x:0,z:0),.init(x:2,z:2),.init(x:0,z:2),.init(x:2,z:0)]
        XCTAssertThrowsError(try Geometry.triangulate(p))
    }
    func testAdjacentBacktrackRejected() {
        let p=[Point2(x:0,z:0),.init(x:2,z:0),.init(x:1,z:0),.init(x:1,z:2),.init(x:0,z:2)]
        XCTAssertFalse(Geometry.isSimplePolygon(p))
    }
    func testPolylineInterpolation() throws {
        let p=[Point2(x:0,z:0),.init(x:2,z:0),.init(x:2,z:2)]
        XCTAssertEqual(try Geometry.point(at:3,on:p),Point2(x:2,z:1))
        XCTAssertThrowsError(try Geometry.point(at:9,on:p))
    }
    func testSceneHasFloorsAndWindows() throws {
        let s=try SceneBuilder.build(document:Fixtures.twoRooms(),floorID:"floor-1")
        XCTAssertEqual(s.faces.filter { $0.role == "floor" }.count,2)
        XCTAssertTrue(s.edges.contains { $0.role == "window" })
        XCTAssertTrue(s.edges.contains { $0.role == "door" })
    }
    func testDoorReallyCutsWallMesh() throws {
        let s=try SceneBuilder.build(document:Fixtures.twoRooms(),floorID:"floor-1")
        for face in s.faces where face.objectID == "w6" {
            let minZ=face.vertices.map(\.z).min()!,maxZ=face.vertices.map(\.z).max()!
            let minY=face.vertices.map(\.y).min()!,maxY=face.vertices.map(\.y).max()!
            XCTAssertFalse(minZ < 1.45 && maxZ > 1.45 && minY < 1 && maxY > 1)
        }
    }
    func testSceneDeterminism() throws {
        let d=Fixtures.twoRooms()
        XCTAssertEqual(try SceneBuilder.build(document:d,floorID:"floor-1"),try SceneBuilder.build(document:d,floorID:"floor-1"))
    }
    func testSeparateFloorElevation() throws {
        var d=Fixtures.twoRooms(); var f=d.floors[0]; f.id="floor-2"; f.elevation=4; d.floors.append(f)
        let s=try SceneBuilder.build(document:d,floorID:"floor-2")
        XCTAssertTrue(s.faces.flatMap(\.vertices).allSatisfy { $0.y >= 4 })
    }
    func testSVGHasNoDimensionLabelsOrExternalAssets() throws {
        let s=try SVGExporter.render(document:Fixtures.twoRooms(),floorID:"floor-1")
        XCTAssertFalse(s.contains("<script")); XCTAssertFalse(s.contains("<image")); XCTAssertFalse(s.contains(" ft"))
        XCTAssertTrue(s.contains("Measurements unverified"))
    }
    func testSVGTextEscapesMarkup() throws {
        var d=Fixtures.twoRooms(); d.floors[0].rooms[0].label="<script>alert('x')</script>"
        let s=try SVGExporter.render(document:d,floorID:"floor-1")
        XCTAssertFalse(s.contains("<script>")); XCTAssertTrue(s.contains("&lt;script&gt;"))
    }
    func testMoveUndoRedoUsesNewRevisions() throws {
        let d=Fixtures.twoRooms(); var e=try EditorSession(d)
        try e.apply(.renameRoom(floorID:"floor-1",roomID:"room-a",label:"Lab"),expectedRevision:1)
        XCTAssertEqual(e.document.revision,2)
        try e.undo(expectedRevision:2); XCTAssertEqual(e.document.floors,d.floors); XCTAssertEqual(e.document.revision,3)
        try e.redo(expectedRevision:3); XCTAssertEqual(e.document.floors[0].rooms[0].label,"Lab"); XCTAssertEqual(e.document.revision,4)
    }
    func testInvalidEditRollsBack() throws {
        let d=Fixtures.twoRooms(); var e=try EditorSession(d)
        XCTAssertThrowsError(try e.apply(.moveOpening(floorID:"floor-1",openingID:"door-a",offset:9),expectedRevision:1))
        XCTAssertEqual(e.document,d); XCTAssertFalse(e.canUndo)
    }
    func testStaleEditRejected() throws {
        var e=try EditorSession(Fixtures.twoRooms())
        XCTAssertThrowsError(try e.apply(.renameRoom(floorID:"floor-1",roomID:"room-a",label:"Lab"),expectedRevision:0))
    }
    func testNewEditClearsRedo() throws {
        var e=try EditorSession(Fixtures.twoRooms())
        try e.apply(.renameRoom(floorID:"floor-1",roomID:"room-a",label:"Lab"),expectedRevision:1)
        try e.undo(expectedRevision:2)
        try e.apply(.renameRoom(floorID:"floor-1",roomID:"room-a",label:"Storage"),expectedRevision:3)
        XCTAssertFalse(e.canRedo)
    }
    func testRepeatedRoundTripEdits() throws {
        var e=try EditorSession(Fixtures.twoRooms())
        for i in 0..<200 {
            let old=e.document
            try e.apply(.renameRoom(floorID:"floor-1",roomID:"room-a",label:"Room \(i)"),expectedRevision:old.revision)
            try e.undo(expectedRevision:e.document.revision)
            XCTAssertEqual(e.document.floors,old.floors)
        }
    }
    func testEmptyHistoryErrors() throws {
        var e=try EditorSession(Fixtures.twoRooms())
        XCTAssertThrowsError(try e.undo(expectedRevision:1)); XCTAssertThrowsError(try e.redo(expectedRevision:1))
    }
    func testUploadNotDeliveredUntilVerifiedReceipt() throws {
        var m=try DeliveryMachine(requestID:"publish-1",sourceRevision:3,manifestDigest:String(repeating:"a",count:64),destination:"os-project-1")
        try m.apply(.start); try m.apply(.reservationAccepted); try m.apply(.uploadFinished)
        XCTAssertEqual(m.state,.awaitingReceipt)
        try m.apply(.verifiedReceipt(revision:3,digest:String(repeating:"a",count:64),destination:"os-project-1"))
        XCTAssertEqual(m.state,.delivered)
    }
    func testWrongReceiptNotAccepted() throws {
        var m=try DeliveryMachine(requestID:"publish-1",sourceRevision:3,manifestDigest:String(repeating:"a",count:64),destination:"os-project-1")
        try m.apply(.start); try m.apply(.reservationAccepted); try m.apply(.uploadFinished)
        XCTAssertThrowsError(try m.apply(.verifiedReceipt(revision:4,digest:String(repeating:"a",count:64),destination:"os-project-1")))
        XCTAssertEqual(m.state,.awaitingReceipt)
    }
    func testDuplicateReceiptIsIdempotent() throws {
        var m=try DeliveryMachine(requestID:"publish-1",sourceRevision:3,manifestDigest:String(repeating:"a",count:64),destination:"os-project-1")
        try m.apply(.start); try m.apply(.reservationAccepted); try m.apply(.uploadFinished)
        let r=DeliveryEvent.verifiedReceipt(revision:3,digest:String(repeating:"a",count:64),destination:"os-project-1")
        try m.apply(r); let old=m; try m.apply(r); XCTAssertEqual(m,old)
    }
    func testRetryPreservesRequestIdentity() throws {
        var m=try DeliveryMachine(requestID:"publish-1",sourceRevision:3,manifestDigest:String(repeating:"a",count:64),destination:"os-project-1")
        try m.apply(.start); try m.apply(.transientFailure); try m.apply(.retry)
        XCTAssertEqual(m.requestID,"publish-1"); XCTAssertEqual(m.state,.queued)
    }
    func testConflictCannotBlindRetry() throws {
        var m=try DeliveryMachine(requestID:"publish-1",sourceRevision:3,manifestDigest:String(repeating:"a",count:64),destination:"os-project-1")
        try m.apply(.start); try m.apply(.revisionConflict); XCTAssertThrowsError(try m.apply(.retry))
    }
    func testInvalidDeliveryTransition() throws {
        var m=try DeliveryMachine(requestID:"publish-1",sourceRevision:3,manifestDigest:String(repeating:"a",count:64),destination:"os-project-1")
        XCTAssertThrowsError(try m.apply(.uploadFinished))
    }
    func testInvalidDeliveryDigest() { XCTAssertThrowsError(try DeliveryMachine(requestID:"x",sourceRevision:1,manifestDigest:"not-a-digest",destination:"os")) }
}
