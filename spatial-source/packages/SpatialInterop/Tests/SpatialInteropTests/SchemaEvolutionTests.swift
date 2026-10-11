import XCTest
import SpatialCore
@testable import SpatialInterop

final class SchemaEvolutionTests: XCTestCase {
    private func document() throws -> SpatialDocument {
        var editor = try EditorSession(Fixtures.twoRooms())
        try editor.apply(.setArea(floorID: "floor-1", area: .init(id: "semantic-zone", label: "Drying zone α", polygon: [.init(x: 1, z: 1), .init(x: 2, z: 1), .init(x: 2, z: 2)])), expectedRevision: 1)
        return editor.document
    }
    func testSemanticGeometryAndSceneRoundTripInStrictExchange() throws {
        let source = try document(), bytes = try source.encoded()
        XCTAssertEqual(try GeometryJSONReader.decode(bytes), source)
        let exported = try ExchangeExporter.export(document: source, floorID: "floor-1")
        let imported = try ExchangeImporter.importArchive(exported.archiveData)
        XCTAssertEqual(imported.document, source)
        XCTAssertEqual(try imported.scene().schemaVersion, "1.1.0")
        XCTAssertEqual(try imported.scene().edges.filter { $0.role == "area" }.count, 3)
        XCTAssertNoThrow(try GLBExporter.export(document: source, floorID: "floor-1"))
    }
    func testLegacyDoesNotAcceptAreasOrUnknownNewKeys() throws {
        var value = try JSONSerialization.jsonObject(with: document().encoded()) as! [String: Any]
        value["schemaVersion"] = "1.0.0"
        XCTAssertThrowsError(try GeometryJSONReader.decode(JSONSerialization.data(withJSONObject: value)))
        value["schemaVersion"] = "1.1.0"; value["claimsVerifiedArea"] = true
        XCTAssertThrowsError(try GeometryJSONReader.decode(JSONSerialization.data(withJSONObject: value)))
    }
    func testUnknownFutureVersionAndMalformedAreaRejected() throws {
        var value = try JSONSerialization.jsonObject(with: document().encoded()) as! [String: Any]
        value["schemaVersion"] = "9.0.0"
        XCTAssertThrowsError(try GeometryJSONReader.decode(JSONSerialization.data(withJSONObject: value)))
        value["schemaVersion"] = "1.1.0"
        var floors = value["floors"] as! [[String: Any]], areas = floors[0]["areas"] as! [[String: Any]]
        areas[0]["physicalWall"] = true; floors[0]["areas"] = areas; value["floors"] = floors
        XCTAssertThrowsError(try GeometryJSONReader.decode(JSONSerialization.data(withJSONObject: value)))
    }
    func testOldVersionAndSceneRemainReadable() throws {
        let source = Fixtures.twoRooms()
        XCTAssertEqual(try GeometryJSONReader.decode(source.encoded()).schemaVersion, "1.0.0")
        XCTAssertEqual(try SceneBuilder.build(document: source, floorID: "floor-1").schemaVersion, "1.0.0")
    }
}
