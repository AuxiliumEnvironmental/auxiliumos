import XCTest
import Foundation
import SpatialCore
@testable import SpatialInterop

final class ExportTests: XCTestCase {
    func testFourFileExportIsDeterministicAndRoundtripsExactRevision() throws {
        var document = Fixtures.twoRooms(); document.revision = 7; document.parentRevision = 6
        let first = try ExchangeExporter.export(document: document, floorID: "floor-1")
        let second = try ExchangeExporter.export(document: document, floorID: "floor-1")
        XCTAssertEqual(first.archiveData, second.archiveData)
        XCTAssertEqual(first.files, second.files)
        XCTAssertEqual(first.manifestDigest, second.manifestDigest)
        XCTAssertEqual(Set(first.files.keys), ["manifest.json", "geometry.json", "scene.json", "floorplan.svg"])
        let imported = try ExchangeImporter.importArchive(first.archiveData)
        XCTAssertEqual(imported.document, document)
        XCTAssertEqual(imported.originalFiles, first.files)
        XCTAssertEqual(imported.manifestSHA256, first.manifestDigest)
        XCTAssertEqual(first.documentID, document.documentID)
        XCTAssertEqual(first.revision, 7); XCTAssertEqual(first.floorID, "floor-1")
    }
    func testFrozenExportRemainsUnchangedAfterDraftEdits() throws {
        var document = Fixtures.twoRooms()
        let frozen = try ExchangeExporter.export(document: document, floorID: "floor-1")
        let oldBytes = frozen.archiveData
        document.revision += 1; document.parentRevision = 1; document.floors[0].rooms[0].label = "Updated label"
        let edited = try ExchangeExporter.export(document: document, floorID: "floor-1")
        XCTAssertEqual(frozen.archiveData, oldBytes)
        XCTAssertNotEqual(edited.archiveData, frozen.archiveData)
        XCTAssertNotEqual(edited.manifestDigest, frozen.manifestDigest)
        XCTAssertEqual(try ExchangeImporter.importArchive(frozen.archiveData).document.floors[0].rooms[0].label, "Assessment area")
    }
    func testInvalidOversizedAndWrongFloorExportsRejected() throws {
        var invalid = Fixtures.twoRooms(); invalid.floors[0].walls[0].nodeIDs[0] = "missing"
        XCTAssertThrowsError(try ExchangeExporter.export(document: invalid, floorID: "floor-1"))
        XCTAssertThrowsError(try ExchangeExporter.export(document: Fixtures.twoRooms(), floorID: "floor-2"))
        var extra = Fixtures.twoRooms(); var floor = extra.floors[0]; floor.id = "floor-2"; extra.floors.append(floor)
        XCTAssertThrowsError(try ExchangeExporter.export(document: extra, floorID: "floor-1"))
        var oversized = Fixtures.twoRooms(); oversized.floors[0].walls[0].nodeIDs = Array(repeating: "n0", count: 1001)
        XCTAssertThrowsError(try GLBExporter.export(document: oversized, floorID: "floor-1"))
        var long = Fixtures.twoRooms(); long.title = String(repeating: "a", count: 1025)
        XCTAssertThrowsError(try ExchangeExporter.export(document: long, floorID: "floor-1"))
    }
    func testDerivedSceneCoordinateLimitAndMaliciousLabels() throws {
        var tooHigh = Fixtures.twoRooms(); tooHigh.floors[0].elevation = 9999
        XCTAssertThrowsError(try ExchangeExporter.export(document: tooHigh, floorID: "floor-1"))
        XCTAssertThrowsError(try GLBExporter.export(document: tooHigh, floorID: "floor-1"))
        var label = Fixtures.twoRooms()
        label.floors[0].rooms[0].label = "</text><script>unsafe()</script>&<image href='https://example.invalid'>"
        let export = try ExchangeExporter.export(document: label, floorID: "floor-1")
        let result = try ExchangeImporter.importArchive(export.archiveData)
        XCTAssertEqual(result.document.floors[0].rooms[0].label, label.floors[0].rooms[0].label)
        XCTAssertFalse(String(decoding: export.files["floorplan.svg"]!, as: UTF8.self).contains("<script>"))
    }
    func testGLBHeaderAlignmentBufferAndAccessorIntegrity() throws {
        let bytes = try GLBExporter.export(document: Fixtures.twoRooms(), floorID: "floor-1")
        let glb = try DecodedGLB(bytes)
        XCTAssertEqual(bytes, try GLBExporter.export(document: Fixtures.twoRooms(), floorID: "floor-1"))
        let asset = glb.json["asset"] as! [String: Any]
        XCTAssertEqual(asset["version"] as? String, "2.0")
        let extras = asset["extras"] as! [String: Any]
        XCTAssertEqual(extras["documentID"] as? String, "synthetic-two-rooms")
        XCTAssertEqual(extras["revision"] as? Int, 1)
        XCTAssertEqual(extras["floorID"] as? String, "floor-1")
        XCTAssertEqual(extras["coordinateSystem"] as? String, "meters_y_up_right_handed")
        XCTAssertEqual(extras["measurementStatus"] as? String, "unverified")
        for view in glb.views {
            let offset = view["byteOffset"] as! Int, length = view["byteLength"] as! Int
            XCTAssertEqual(offset % 4, 0)
            XCTAssertGreaterThan(length, 0)
            XCTAssertLessThanOrEqual(offset + length, glb.binary.count)
        }
        for mesh in glb.meshes {
            for primitive in mesh["primitives"] as! [[String: Any]] {
                let attrs = primitive["attributes"] as! [String: Int]
                let position = glb.accessors[attrs["POSITION"]!]
                XCTAssertEqual(position["type"] as? String, "VEC3")
                XCTAssertNotNil(position["min"]); XCTAssertNotNil(position["max"])
                if let index = primitive["indices"] as? Int {
                    XCTAssertEqual((primitive["mode"] as? Int), 4)
                    let count = position["count"] as! Int
                    let indices = try glb.indices(index)
                    XCTAssertEqual(indices.count % 3, 0)
                    XCTAssertTrue(indices.allSatisfy { $0 < count })
                    XCTAssertEqual(glb.accessors[attrs["NORMAL"]!]["count"] as? Int, count)
                } else { XCTAssertEqual(primitive["mode"] as? Int, 1) }
            }
        }
    }
    func testGLBUsesExactCanonicalFaceTrianglesIncludingDoorAndWindowCutouts() throws {
        let document = Fixtures.twoRooms(), canonical = try SceneBuilder.build(document: document, floorID: "floor-1")
        let glb = try DecodedGLB(GLBExporter.export(document: document, floorID: "floor-1"))
        var triangleCount = 0
        for mesh in glb.meshes {
            let extras = mesh["extras"] as! [String: String]
            guard extras["representation"] == "faces" else { continue }
            let primitive = (mesh["primitives"] as! [[String: Any]])[0]
            let attrs = primitive["attributes"] as! [String: Int]
            let vertices = try glb.vectors(attrs["POSITION"]!)
            let expected = canonical.faces.filter { $0.objectID == extras["objectID"] && $0.role == extras["role"] }
                .flatMap { face in face.triangles.flatMap { $0.map { face.vertices[$0] } } }
            XCTAssertEqual(vertices.count, expected.count)
            for (actual, original) in zip(vertices, expected) {
                XCTAssertEqual(actual, [Float(original.x), Float(original.y), Float(original.z)])
            }
            triangleCount += vertices.count / 3
            if extras["objectID"] == "w6" {
                // The shared wall's door occupies z 1...1.9, y 0...2.05, x == 4.
                for i in stride(from: 0, to: vertices.count, by: 3) {
                    let y = (vertices[i][1] + vertices[i+1][1] + vertices[i+2][1]) / 3
                    let z = (vertices[i][2] + vertices[i+1][2] + vertices[i+2][2]) / 3
                    XCTAssertFalse(y > 0 && y < 2.05 && z > 1 && z < 1.9)
                }
            }
        }
        XCTAssertEqual(triangleCount, canonical.faces.reduce(0) { $0 + $1.triangles.count })
    }
    func testGLBSemanticLinesHaveNoTriangleDiagonalsAndFloorNormalsFaceUp() throws {
        let document = Fixtures.twoRooms(), canonical = try SceneBuilder.build(document: document, floorID: "floor-1")
        let glb = try DecodedGLB(GLBExporter.export(document: document, floorID: "floor-1"))
        var lineCount = 0, floorNormalCount = 0
        for mesh in glb.meshes {
            let extras = mesh["extras"] as! [String: String], primitive = (mesh["primitives"] as! [[String: Any]])[0]
            let attrs = primitive["attributes"] as! [String: Int]
            if extras["representation"] == "semantic-edges" {
                let actual = try glb.vectors(attrs["POSITION"]!)
                let expected = canonical.edges.filter { $0.objectID == extras["objectID"] && $0.role == extras["role"] }
                    .flatMap { [$0.a, $0.b] }
                XCTAssertEqual(actual.count, expected.count)
                for (a, b) in zip(actual, expected) { XCTAssertEqual(a, [Float(b.x), Float(b.y), Float(b.z)]) }
                lineCount += actual.count / 2
            }
            if extras["role"] == "floor" {
                for normal in try glb.vectors(attrs["NORMAL"]!) {
                    XCTAssertEqual(normal[0], 0, accuracy: 0.000001)
                    XCTAssertEqual(normal[1], 1, accuracy: 0.000001)
                    XCTAssertEqual(normal[2], 0, accuracy: 0.000001)
                    floorNormalCount += 1
                }
            }
        }
        XCTAssertEqual(lineCount, canonical.edges.count)
        XCTAssertGreaterThan(floorNormalCount, 0)
    }
    func testGLBSelfContainedWithoutTexturesAndDoubleSidedArchitecturalMaterials() throws {
        let glb = try DecodedGLB(GLBExporter.export(document: Fixtures.twoRooms(), floorID: "floor-1"))
        for key in ["images", "textures", "samplers", "animations", "skins", "cameras"] { XCTAssertNil(glb.json[key]) }
        for buffer in glb.json["buffers"] as! [[String: Any]] { XCTAssertNil(buffer["uri"]) }
        let materials = glb.json["materials"] as! [[String: Any]]
        XCTAssertTrue(materials.allSatisfy { $0["doubleSided"] as? Bool == true })
        XCTAssertTrue(materials.prefix(2).allSatisfy { $0["alphaMode"] as? String == "BLEND" })
    }
    func testGLBRejectsEmptySceneAndFloatCollapsedEdges() throws {
        let empty = SpatialDocument(documentID: "empty", title: "Empty", floors: [Floor(id: "f", label: "Empty", nodes: [], walls: [], openings: [], rooms: [])])
        XCTAssertThrowsError(try GLBExporter.export(document: empty, floorID: "f")) { XCTAssertEqual($0 as? SpatialExportError, .emptyScene) }
        let nodes = [Node(id: "a", point: .init(x: 9999, z: 0)), Node(id: "b", point: .init(x: 9999.000002, z: 0))]
        let wall = Wall(id: "w", nodeIDs: ["a", "b"], height: 2, heightBasis: .synthetic, provenance: .init(origin: .synthetic))
        let tiny = SpatialDocument(documentID: "tiny", title: "Tiny", floors: [Floor(id: "f", label: "Tiny", nodes: nodes, walls: [wall], openings: [], rooms: [])])
        XCTAssertThrowsError(try GLBExporter.export(document: tiny, floorID: "f")) { XCTAssertEqual($0 as? SpatialExportError, .precisionLoss) }
    }
    func testEmitSyntheticCrossRuntimeFixturesWhenRequested() throws {
        guard let path = ProcessInfo.processInfo.environment["SPATIAL_EXPORT_FIXTURE_DIR"] else { return }
        let directory = URL(fileURLWithPath: path, isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let document = Fixtures.twoRooms(), exported = try ExchangeExporter.export(document: document, floorID: "floor-1")
        try exported.archiveData.write(to: directory.appendingPathComponent("native_exchange.zip"), options: .atomic)
        try GLBExporter.export(document: document, floorID: "floor-1").write(to: directory.appendingPathComponent("native_model.glb"), options: .atomic)
    }
}

private struct DecodedGLB {
    let json: [String: Any]
    let binary: Data
    var views: [[String: Any]] { json["bufferViews"] as! [[String: Any]] }
    var accessors: [[String: Any]] { json["accessors"] as! [[String: Any]] }
    var meshes: [[String: Any]] { json["meshes"] as! [[String: Any]] }
    init(_ data: Data) throws {
        func u32(_ p: Int) -> Int { (0..<4).reduce(0) { $0 | Int(data[p+$1]) << ($1*8) } }
        XCTAssertGreaterThan(data.count, 28)
        XCTAssertEqual(u32(0), 0x46546c67); XCTAssertEqual(u32(4), 2); XCTAssertEqual(u32(8), data.count)
        let jsonLength = u32(12)
        XCTAssertEqual(jsonLength % 4, 0); XCTAssertEqual(u32(16), 0x4e4f534a)
        json = try XCTUnwrap(JSONSerialization.jsonObject(with: data.subdata(in: 20..<(20+jsonLength))) as? [String: Any])
        let binaryHeader = 20 + jsonLength, binaryLength = u32(binaryHeader)
        XCTAssertEqual(binaryLength % 4, 0); XCTAssertEqual(u32(binaryHeader+4), 0x004e4942)
        XCTAssertEqual(binaryHeader + 8 + binaryLength, data.count)
        binary = data.subdata(in: (binaryHeader+8)..<data.count)
        let declared = ((json["buffers"] as! [[String: Any]])[0]["byteLength"] as! Int)
        XCTAssertTrue((declared...(declared+3)).contains(binaryLength))
    }
    private func u32(_ p: Int) -> UInt32 { (0..<4).reduce(0) { $0 | UInt32(binary[p+$1]) << ($1*8) } }
    func vectors(_ index: Int) throws -> [[Float]] {
        let accessor = accessors[index], view = views[accessor["bufferView"] as! Int]
        XCTAssertEqual(accessor["componentType"] as? Int, 5126)
        let offset = (view["byteOffset"] as! Int) + (accessor["byteOffset"] as? Int ?? 0), count = accessor["count"] as! Int
        return (0..<count).map { i in (0..<3).map { Float(bitPattern: u32(offset + i*12 + $0*4)) } }
    }
    func indices(_ index: Int) throws -> [Int] {
        let accessor = accessors[index], view = views[accessor["bufferView"] as! Int]
        XCTAssertEqual(accessor["componentType"] as? Int, 5125)
        let offset = (view["byteOffset"] as! Int) + (accessor["byteOffset"] as? Int ?? 0), count = accessor["count"] as! Int
        return (0..<count).map { Int(u32(offset+$0*4)) }
    }
}
