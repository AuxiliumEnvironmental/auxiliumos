import Foundation
import XCTest
import SpatialCore
@testable import SpatialInterop
#if canImport(CoreGraphics) && canImport(ImageIO)
import CoreGraphics
import ImageIO
#endif

final class DrawingExportTests: XCTestCase {
    func testPlanIsDeterministicAndDoesNotMutateFrozenGeometry() throws {
        var document = Fixtures.twoRooms(); document.revision = 42; document.parentRevision = 41
        let original = document, plan = try DrawingExporter.plan(document: document, floorID: "floor-1")
        XCTAssertEqual(plan, try DrawingExporter.plan(document: document, floorID: "floor-1"))
        XCTAssertEqual(document, original); XCTAssertEqual(plan.revision, 42)
        XCTAssertEqual(plan.documentID, document.documentID); XCTAssertEqual(plan.floorID, "floor-1")
        document.revision = 43; document.parentRevision = 42; document.floors[0].rooms[0].label = "Later edit"
        XCTAssertEqual(plan.revision, 42)
        XCTAssertFalse(plan.pages.flatMap(\.texts).contains { $0.text.contains("Later edit") })
    }
    func testProjectionKeepsAsymmetricModelAxesAndFitsDrawingBounds() throws {
        var document = Fixtures.twoRooms()
        for i in document.floors[0].nodes.indices {
            document.floors[0].nodes[i].point.x += 37; document.floors[0].nodes[i].point.z -= 21
        }
        let plan = try DrawingExporter.plan(document: document, floorID: "floor-1"), p = plan.projection
        let a = p.project(.init(x: 37, z: -21)), b = p.project(.init(x: 45, z: -17))
        XCTAssertGreaterThan(b.x, a.x); XCTAssertGreaterThan(b.y, a.y)
        XCTAssertEqual((b.x - a.x) / (b.y - a.y), 2, accuracy: 0.000001)
        for node in document.floors[0].nodes {
            let point = p.project(node.point)
            XCTAssertTrue((40...752).contains(point.x)); XCTAssertTrue((118...482).contains(point.y))
        }
    }
    func testDoorAndPassageAreRealGapsAndWindowHasNoncolorDoubleLine() throws {
        let document = Fixtures.twoRooms(), plan = try DrawingExporter.plan(document: document, floorID: "floor-1")
        let doorA = plan.projection.project(.init(x: 4, z: 1)), doorB = plan.projection.project(.init(x: 4, z: 1.9))
        for line in plan.pages[0].shapes where line.objectID == "w6" && line.role == "wall" {
            let mid = (line.points[0].y + line.points[1].y) / 2
            XCTAssertFalse(mid > doorA.y && mid < doorB.y)
        }
        XCTAssertEqual(plan.pages[0].shapes.filter { $0.objectID == "door-a" && $0.role == "door" }.count, 2)
        XCTAssertEqual(plan.pages[0].shapes.filter { $0.objectID == "entry" && $0.role == "passage" }.count, 2)
        let windows = plan.pages[0].shapes.filter { $0.objectID == "window-a" && $0.role == "window" }
        XCTAssertEqual(windows.count, 2); XCTAssertNotEqual(windows[0].points, windows[1].points)
    }
    func testIncompleteBoundaryRemainsVisibleAndNoFloorIsInvented() throws {
        var document = Fixtures.twoRooms(); document.floors[0].rooms = []; document.floors[0].walls.removeAll { $0.id == "w5" }
        let plan = try DrawingExporter.plan(document: document, floorID: "floor-1")
        XCTAssertEqual(plan.incompleteBoundaryNodeIDs, ["n0", "n5"])
        XCTAssertEqual(plan.unassignedWallIDs.count, 6)
        XCTAssertEqual(plan.pages[0].shapes.filter { $0.role == "incomplete-boundary" && $0.dashed }.count, 2)
        XCTAssertFalse(plan.pages[0].shapes.contains { $0.role == "room" })
        XCTAssertTrue(plan.pages[0].texts.contains { $0.text.contains("Incomplete layout") })
    }
    func testSemanticAreasHaveCanonicalIDsAndNonphysicalStyle() throws {
        var document = Fixtures.twoRooms(); document.schemaVersion = "1.1.0"
        document.floors[0].areas = [.init(id: "area-1", label: "Drying chamber", polygon: [
            .init(x: -3, z: -1), .init(x: 2, z: -1), .init(x: 2, z: 2), .init(x: -3, z: 2)], provenance: .init(origin: .edited))]
        let plan = try DrawingExporter.plan(document: document, floorID: "floor-1")
        let area = try XCTUnwrap(plan.pages[0].shapes.first { $0.role == "semantic-area" })
        XCTAssertEqual(area.objectID, "area-1"); XCTAssertTrue(area.dashed); XCTAssertNil(area.fill)
        XCTAssertEqual(area.points, document.floors[0].areas[0].polygon.map(plan.projection.project))
        XCTAssertTrue(plan.pages.flatMap(\.texts).contains { $0.objectID == "area-1" && $0.text == "Drying chamber" })
        XCTAssertTrue(area.points.allSatisfy { $0.x >= 40 && $0.y >= 118 })
    }
    func testFullUnicodeLabelsAndLongLabelsContinueWithoutTruncation() throws {
        var document = Fixtures.twoRooms()
        document.title = "Examen 房屋 • Café"
        document.floors[0].rooms[0].label = String(repeating: "測", count: 256)
        document.floors[0].rooms[1].label = (0..<60).map { "line\($0)" }.joined(separator: "\n")
        // The schema admits 256 scalars, so use a bounded many-newline label.
        document.floors[0].rooms[1].label = String(repeating: "A\n", count: 100)
        let plan = try DrawingExporter.plan(document: document, floorID: "floor-1")
        let labels = plan.pages.dropFirst().flatMap(\.texts).filter { $0.objectID == "room-a" && $0.text.contains("測") }
        XCTAssertEqual(labels.map(\.text).joined().replacingOccurrences(of: "\n", with: ""), document.floors[0].rooms[0].label)
        XCTAssertTrue(plan.pages.count > 3)
        XCTAssertTrue(plan.pages.flatMap(\.texts).allSatisfy { $0.origin.y >= 0 && $0.origin.y + $0.height <= 612 })
        XCTAssertTrue(plan.pages.flatMap(\.texts).contains { $0.text == document.title })
    }
    func testSVGPreservesIdentityEscapesUserLabelsAndContainsNoExternalResources() throws {
        var document = Fixtures.twoRooms(); document.floors[0].rooms[0].label = "<script>alert('x')</script> & \"Room\""
        let pages = try DrawingExporter.svgPages(document: document, floorID: "floor-1")
        let text = pages.map { String(decoding: $0, as: UTF8.self) }.joined()
        XCTAssertTrue(text.contains("data-object-id=\"door-a\"")); XCTAssertTrue(text.contains("revision 1"))
        XCTAssertFalse(text.contains("<script>")); XCTAssertTrue(text.contains("&lt;script&gt;"))
        XCTAssertFalse(text.contains("href=")); XCTAssertFalse(text.contains("foreignObject"))
        XCTAssertFalse(text.contains("sq ft")); XCTAssertFalse(text.contains("north arrow"))
    }
    func testEmptyFloorHasExplicitDrawingWithoutInventingGeometry() throws {
        let document = SpatialDocument(documentID: "empty", title: "Empty", floors: [.init(id: "empty-floor", label: "Empty", nodes: [], walls: [], openings: [], rooms: [])])
        let plan = try DrawingExporter.plan(document: document, floorID: "empty-floor")
        XCTAssertTrue(plan.pages[0].shapes.isEmpty)
        XCTAssertTrue(plan.pages[0].texts.contains { $0.text.contains("No captured or drawn walls") })
        XCTAssertFalse(try DrawingExporter.svgPages(plan: plan).isEmpty)
    }
    func testInvalidGeometryAndUnavailableFloorFailBeforeRendering() throws {
        var document = Fixtures.twoRooms(); document.floors[0].walls[0].nodeIDs[0] = "missing"
        XCTAssertThrowsError(try DrawingExporter.plan(document: document, floorID: "floor-1"))
        XCTAssertThrowsError(try DrawingExporter.plan(document: Fixtures.twoRooms(), floorID: "not-a-floor"))
        XCTAssertThrowsError(try DrawingExporter.export(document: Fixtures.twoRooms(), floorID: "floor-1", pixelsPerPoint: 10))
    }
    func testOneHundredRoomsKeepEveryLabelAndBoundedDirectoryPages() throws {
        var floor = Floor(id: "stress-floor", label: "Synthetic stress floor", nodes: [], walls: [], openings: [], rooms: [])
        for room in 0..<100 {
            let x = Double(room % 10) * 6, z = Double(room / 10) * 6
            let nodes = [Point2(x: x, z: z), .init(x: x + 4, z: z), .init(x: x + 4, z: z + 4), .init(x: x, z: z + 4)]
            floor.nodes += nodes.enumerated().map { Node(id: "n\(room)-\($0.offset)", point: $0.element) }
            for side in 0..<4 {
                floor.walls.append(.init(id: "w\(room)-\(side)", nodeIDs: ["n\(room)-\(side)", "n\(room)-\((side + 1) % 4)"],
                                         height: 2.6, heightBasis: .synthetic, provenance: .init(origin: .synthetic)))
            }
            floor.rooms.append(.init(id: "r\(room)", label: "Synthetic room \(room)", boundary: (0..<4).map { .init(wallID: "w\(room)-\($0)") }))
        }
        let document = SpatialDocument(documentID: "stress", title: "Synthetic stress fixture", floors: [floor])
        let plan = try DrawingExporter.plan(document: document, floorID: floor.id)
        XCTAssertEqual(plan.pages[0].shapes.filter { $0.role == "room" }.count, 100)
        for room in floor.rooms {
            XCTAssertTrue(plan.pages.dropFirst().flatMap(\.texts).contains { $0.objectID == room.id && $0.text == room.label })
        }
        XCTAssertLessThan(plan.pages.count, 20)
        XCTAssertTrue(plan.pages.flatMap(\.texts).allSatisfy { $0.origin.y + $0.height <= 612 })
    }
    func testPlatformRendererIsTruthfulAndAppleDecodesActualOutputs() throws {
        #if canImport(CoreGraphics) && canImport(ImageIO)
        var document = Fixtures.twoRooms(); document.floors[0].rooms[0].label = "Café 房屋"
        let output = try DrawingExporter.export(document: document, floorID: "floor-1")
        let provider = try XCTUnwrap(CGDataProvider(data: output.pdf as CFData)), pdf = try XCTUnwrap(CGPDFDocument(provider))
        XCTAssertEqual(pdf.numberOfPages, output.pngPages.count)
        for bytes in output.pngPages {
            let source = try XCTUnwrap(CGImageSourceCreateWithData(bytes as CFData, nil)), image = try XCTUnwrap(CGImageSourceCreateImageAtIndex(source, 0, nil))
            XCTAssertEqual(image.width, 1584); XCTAssertEqual(image.height, 1224)
        }
        #else
        XCTAssertThrowsError(try DrawingExporter.export(document: Fixtures.twoRooms(), floorID: "floor-1")) {
            XCTAssertEqual($0 as? DrawingExportError, .nativeRendererUnavailable)
        }
        XCTAssertThrowsError(try DrawingExporter.exportPDF(document: Fixtures.twoRooms(), floorID: "floor-1")) {
            XCTAssertEqual($0 as? DrawingExportError, .nativeRendererUnavailable)
        }
        XCTAssertThrowsError(try DrawingExporter.exportPNGArchive(document: Fixtures.twoRooms(), floorID: "floor-1")) {
            XCTAssertEqual($0 as? DrawingExportError, .nativeRendererUnavailable)
        }
        #endif
    }
    func testEmitDrawingFixturesWhenRequested() throws {
        guard let path = ProcessInfo.processInfo.environment["SPATIAL_DRAWING_FIXTURE_DIR"] else { return }
        let root = URL(fileURLWithPath: path, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let document = Fixtures.twoRooms(), svg = try DrawingExporter.svgPages(document: document, floorID: "floor-1")
        for (index, bytes) in svg.enumerated() { try bytes.write(to: root.appendingPathComponent("floorplan-\(index).svg"), options: .atomic) }
        #if canImport(CoreGraphics) && canImport(ImageIO)
        let native = try DrawingExporter.export(document: document, floorID: "floor-1")
        try native.pdf.write(to: root.appendingPathComponent("native-floorplan.pdf"), options: .atomic)
        for (index, bytes) in native.pngPages.enumerated() { try bytes.write(to: root.appendingPathComponent("native-floorplan-\(index).png"), options: .atomic) }
        try LocalDocumentExporter.export(document: document).archiveData.write(to: root.appendingPathComponent("native-local-document.zip"), options: .atomic)
        #endif
    }
}
