import XCTest
import Foundation
import SpatialCore
@testable import SpatialInterop

final class ImportTests: XCTestCase {
    private var root: URL {
        (0..<5).reduce(URL(fileURLWithPath: #filePath)) { result, _ in result.deletingLastPathComponent() }
    }
    private func fixture() throws -> Data { try Data(contentsOf: root.appendingPathComponent("fixtures/synthetic_exchange.zip")) }
    private func files() throws -> [String: Data] { try ZIPReader(data: fixture(), budget: ImportBudget()).read() }
    private func json(_ data: Data) throws -> [String: Any] { try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]) }
    private func bytes(_ object: Any) throws -> Data { try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes]) }
    private func rehash(_ input: [String: Data]) throws -> [String: Data] {
        var files = input
        var manifest = try json(files["manifest.json"]!)
        manifest["files"] = ["geometry.json", "scene.json", "floorplan.svg"].map { path in
            ["path": path, "sha256": ByteDigest.sha256(files[path]!), "bytes": files[path]!.count] as [String: Any]
        }
        files["manifest.json"] = try bytes(manifest)
        return files
    }
    private func changing(_ path: String, _ change: (inout [String: Any]) -> Void) throws -> [String: Data] {
        var result = try files(), object = try json(result[path]!)
        change(&object); result[path] = try bytes(object)
        return path == "manifest.json" ? result : try rehash(result)
    }
    private func rejects(_ code: SpatialImportError? = nil, _ operation: () throws -> Void, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertThrowsError(try operation(), file: file, line: line) { error in
            if let code { XCTAssertEqual(error as? SpatialImportError, code, file: file, line: line) }
        }
    }

    func testSHA256KnownVectorsAndFixtureIdentity() throws {
        XCTAssertEqual(ByteDigest.sha256(Data()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        XCTAssertEqual(ByteDigest.sha256(Data("abc".utf8)), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(ByteDigest.sha256(Data(String(repeating: "a", count: 1_000_000).utf8)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0")
        XCTAssertEqual(ByteDigest.sha256(try files()["geometry.json"]!), "d3f86053231eb5a96750a1dfdbf78d9c658ed08e0682b21d57403a139560ceec")
    }
    func testContractResourcesRemainExactCopies() throws {
        for name in ["geometry", "scene", "manifest"] {
            let original = try Data(contentsOf: root.appendingPathComponent("contracts/\(name).schema.json"))
            let copied = try Data(contentsOf: root.appendingPathComponent("packages/SpatialInterop/Sources/SpatialInterop/Resources/\(name).schema.json"))
            XCTAssertEqual(original, copied)
        }
    }
    func testBaselineDeflateImportRetainsBytesAndRegeneratesViews() throws {
        let raw = try fixture(), result = try ExchangeImporter.importArchive(raw)
        XCTAssertEqual(result.document, Fixtures.twoRooms())
        XCTAssertEqual(result.originalArchive, raw)
        XCTAssertEqual(result.originalFiles, try files())
        XCTAssertEqual(result.archiveSHA256, ByteDigest.sha256(raw))
        XCTAssertEqual(result.manifestSHA256, ByteDigest.sha256(result.originalFiles["manifest.json"]!))
        XCTAssertEqual(try result.scene(), try SceneBuilder.build(document: result.document, floorID: "floor-1"))
        XCTAssertEqual(try result.floorplanSVG(), try SVGExporter.render(document: result.document, floorID: "floor-1"))
    }
    func testStoredArchiveAlsoAccepted() throws {
        let archive = storedZIP(try files())
        XCTAssertEqual(try ExchangeImporter.importArchive(archive).document, Fixtures.twoRooms())
    }
    func testStandaloneStrictGeometry() throws {
        let data = try files()["geometry.json"]!
        XCTAssertEqual(try GeometryJSONReader.decode(data), Fixtures.twoRooms())
    }
    func testDuplicateKeysIncludingEscapedAliasRejected() throws {
        let data = try files()["geometry.json"]!
        let text = String(decoding: data, as: UTF8.self)
        for prefix in [#"{"revision":1,"# , #"{"revi\u0073ion":1,"#] {
            let duplicate = Data((prefix + text.dropFirst()).utf8)
            rejects(.duplicateJSONKey) { _ = try GeometryJSONReader.decode(duplicate) }
        }
        var inputs = try files()
        inputs["manifest.json"] = Data("{\"files\":[],\"files\":[]}".utf8)
        rejects(.duplicateJSONKey) { _ = try ExchangeImporter.importFiles(inputs) }
    }
    func testUnknownFieldsNestedAndSchemaVersionsRejected() throws {
        for path in ["geometry.json", "scene.json", "manifest.json"] {
            let input = try changing(path) { $0["unexpected"] = true }
            rejects(.schemaMismatch) { _ = try ExchangeImporter.importFiles(input) }
        }
        let unknown = try changing("geometry.json") { $0["schemaVersion"] = "9.0.0" }
        rejects(.schemaMismatch) { _ = try ExchangeImporter.importFiles(unknown) }
        let nested = try changing("geometry.json") { object in
            var floors = object["floors"] as! [[String: Any]]
            floors[0]["privateOverride"] = true; object["floors"] = floors
        }
        rejects(.schemaMismatch) { _ = try ExchangeImporter.importFiles(nested) }
    }
    func testMalformedNumbersUTF8AndSurrogatesRejected() throws {
        for text in ["NaN", "Infinity", "1e999", "01", "+1", "1.", "1e", "[1,]", "{}{}", "\"\\uD800\"", "\"\\q\""] {
            rejects { var parser = try StrictJSON(Data(text.utf8), budget: ImportBudget()); _ = try parser.parse() }
        }
        rejects(.malformedJSON) { _ = try GeometryJSONReader.decode(Data([0x7b,0xff,0x7d])) }
    }
    func testDeepJSONAndLargeStringRejectedBeforeDecode() throws {
        let deep = Data((String(repeating: "[", count: 33) + "0" + String(repeating: "]", count: 33)).utf8)
        rejects(.boundsExceeded) { var p = try StrictJSON(deep, budget: ImportBudget()); _ = try p.parse() }
        let oversized = Data(("\"" + String(repeating: "a", count: 100_001) + "\"").utf8)
        rejects(.boundsExceeded) { var p = try StrictJSON(oversized, budget: ImportBudget()); _ = try p.parse() }
    }
    func testGeometrySemanticCorruptionAndCoordinateBoundsRejected() throws {
        var missing = Fixtures.twoRooms(); missing.floors[0].walls[0].nodeIDs[0] = "absent"
        rejects(.invalidGeometry) { _ = try GeometryJSONReader.decode(missing.encoded()) }
        var outside = Fixtures.twoRooms(); outside.floors[0].nodes[0].point.x = 10001
        rejects(.schemaMismatch) { _ = try GeometryJSONReader.decode(outside.encoded()) }
        var invalidParent = Fixtures.twoRooms(); invalidParent.parentRevision = 1
        rejects(.invalidGeometry) { _ = try GeometryJSONReader.decode(invalidParent.encoded()) }
        var duplicate = Fixtures.twoRooms(); duplicate.floors[0].nodes.append(duplicate.floors[0].nodes[0])
        rejects(.invalidGeometry) { _ = try GeometryJSONReader.decode(duplicate.encoded()) }
    }
    func testAggregateGeometryWorkRejectedBeforeCoreChecks() throws {
        var document = Fixtures.twoRooms()
        let wall = document.floors[0].walls[0]
        document.floors[0].walls = (0..<50_000).map { i in
            var copy = wall; copy.id = "wall-\(i)"; return copy
        }
        document.floors[0].nodes = (0..<2000).map { .init(id: "node-\($0)", point: .init(x: Double($0), z: 0)) }
        // Nodes are deliberately missing from walls. Work admission must reject BEFORE
        // expensive semantic loops, even though a later check would also find missing nodes.
        rejects(.processingBudgetExceeded) { try GeometryAdmission.validate(document) }
        var ring = Fixtures.twoRooms()
        ring.floors[0].walls[0].nodeIDs = Array(repeating: "n0", count: 1000)
        rejects(.boundsExceeded) { try GeometryAdmission.validate(ring) }
    }
    func testDerivedSceneBoundsCannotBeHiddenByForgedInBoundsScene() throws {
        var document = Fixtures.twoRooms(); document.floors[0].elevation = 9999
        rejects(.invalidGeometry) { _ = try GeometryJSONReader.decode(document.encoded()) }
        var input = try files(); input["geometry.json"] = try document.encoded()
        input = try rehash(input) // Original scene stays in bounds, with valid new hashes.
        rejects(.invalidGeometry) { _ = try ExchangeImporter.importFiles(input) }
    }
    func testSizeCapsRejectBeforeParsingOrDecompression() throws {
        rejects(.boundsExceeded) { _ = try GeometryJSONReader.decode(Data(count: SpatialImportLimits.memberBytes + 1)) }
        var archive = try fixture()
        let central = centralOffsets(archive)[0]
        set32(&archive, central + 24, SpatialImportLimits.memberBytes + 1)
        rejects(.boundsExceeded) { _ = try ExchangeImporter.importArchive(archive) }
    }
    func testManifestHashBytesAndIdentityMismatchRejected() throws {
        var wrongBytes = try files(); wrongBytes["geometry.json"]!.append(32)
        rejects(.identityMismatch) { _ = try ExchangeImporter.importFiles(wrongBytes) }
        let revision = try changing("manifest.json") { $0["revision"] = 2 }
        rejects(.identityMismatch) { _ = try ExchangeImporter.importFiles(revision) }
        let document = try changing("scene.json") { $0["documentID"] = "other" }
        rejects(.identityMismatch) { _ = try ExchangeImporter.importFiles(document) }
        let duplicate = try changing("manifest.json") { object in
            var entries = object["files"] as! [[String: Any]]; entries[1] = entries[0]; object["files"] = entries
        }
        rejects(.identityMismatch) { _ = try ExchangeImporter.importFiles(duplicate) }
    }
    func testSceneIndicesMissingObjectsAndWrongOpeningRoleRejected() throws {
        let badIndex = try changing("scene.json") { object in
            var faces = object["faces"] as! [[String: Any]]; faces[0]["triangles"] = [[0,1,999]]; object["faces"] = faces
        }
        rejects(.invalidScene) { _ = try ExchangeImporter.importFiles(badIndex) }
        let missing = try changing("scene.json") { object in
            var edges = object["edges"] as! [[String: Any]]; edges[0]["objectID"] = "missing"; object["edges"] = edges
        }
        rejects(.invalidScene) { _ = try ExchangeImporter.importFiles(missing) }
        let role = try changing("scene.json") { object in
            var edges = object["edges"] as! [[String: Any]]
            if let i = edges.firstIndex(where: { $0["role"] as? String == "door" }) { edges[i]["role"] = "window" }
            object["edges"] = edges
        }
        rejects(.invalidScene) { _ = try ExchangeImporter.importFiles(role) }
    }
    func testSceneOversizedArrayAndNegativeIndicesRejectedBySchema() throws {
        let oversized = try changing("scene.json") { $0["faces"] = Array(repeating: [:] as [String: Any], count: 200_001) }
        rejects(.schemaMismatch) { _ = try ExchangeImporter.importFiles(oversized) }
        let negative = try changing("scene.json") { object in
            var faces = object["faces"] as! [[String: Any]]; faces[0]["triangles"] = [[0,1,-1]]; object["faces"] = faces
        }
        rejects(.schemaMismatch) { _ = try ExchangeImporter.importFiles(negative) }
    }
    func testIncomingRenderCoordinatesAreNeverUsedForRendering() throws {
        let altered = try changing("scene.json") { object in
            var faces = object["faces"] as! [[String: Any]], vertices = faces[0]["vertices"] as! [[String: Any]]
            vertices[0]["x"] = 9999; faces[0]["vertices"] = vertices; object["faces"] = faces
        }
        let result = try ExchangeImporter.importFiles(altered)
        XCTAssertEqual(try result.scene(), try SceneBuilder.build(document: Fixtures.twoRooms(), floorID: "floor-1"))
        XCTAssertEqual(result.originalFiles["scene.json"], altered["scene.json"])
    }
    func testSVGActiveExternalAndNonfiniteContentRejected() throws {
        let attacks = [
            "<script>alert(1)</script>", "<image href=\"https://example.invalid/a\"/>",
            "<rect width=\"1\" height=\"1\" onload=\"x\"/>",
            "<rect fill=\"url(https://example.invalid/a)\"/>",
            "<line x1=\"1e999\"/>", "<polygon points=\"1,2,3,4,5,1e999\"/>",
            "<text font-family=\"external-font\">x</text>", "<foreignObject/>",
            "<rect xmlns=\"http://other.invalid\"/>", "<?xml-stylesheet href='https://example.invalid/x'?>"
        ]
        for attack in attacks {
            let svg = Data(("<svg xmlns=\"http://www.w3.org/2000/svg\">" + attack + "</svg>").utf8)
            rejects(.invalidSVG) { try SafeSVG.validate(svg, budget: ImportBudget()) }
        }
        rejects(.invalidSVG) {
            try SafeSVG.validate(Data("<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><svg xmlns='http://www.w3.org/2000/svg'><text>&x;</text></svg>".utf8), budget: ImportBudget())
        }
    }
    func testMaliciousSVGRejectedEvenWithCorrectManifestHash() throws {
        var altered = try files()
        altered["floorplan.svg"] = Data("<svg xmlns='http://www.w3.org/2000/svg' onload='x'/>".utf8)
        altered = try rehash(altered)
        rejects(.invalidSVG) { _ = try ExchangeImporter.importFiles(altered) }
    }
    func testZIPPathsDuplicateNamesAndSymlinkRejected() throws {
        let original = try fixture()
        for name in ["../evilxx.svg", "/loorplan.svg", "floorplan/../", "Floorplan.svg"] {
            var archive = original
            let c = centralOffsets(archive)[0], n = u16(archive, c+28)
            var replacement = Array(name.utf8)
            replacement = Array((replacement + Array(repeating: 0x20, count: n)).prefix(n))
            archive.replaceSubrange((c+46)..<(c+46+n), with: replacement)
            rejects(.unsafeArchive) { _ = try ExchangeImporter.importArchive(archive) }
        }
        var duplicate = original
        let positions = centralOffsets(duplicate)
        let firstName = duplicate[(positions[0]+46)..<(positions[0]+46+u16(duplicate, positions[0]+28))]
        let second = positions[1]
        XCTAssertEqual(firstName.count, u16(duplicate, second+28))
        duplicate.replaceSubrange((second+46)..<(second+46+firstName.count), with: firstName)
        rejects(.unsafeArchive) { _ = try ExchangeImporter.importArchive(duplicate) }
        var symlink = original
        set32(&symlink, positions[0]+38, 0xa1ff << 16)
        rejects(.unsafeArchive) { _ = try ExchangeImporter.importArchive(symlink) }
    }
    func testZIPEncryptionDescriptorsUnknownFlagsAndMethodsRejected() throws {
        let original = try fixture()
        for flag in [1, 8, 16, 64, 0x8001] {
            var archive = original; let c = centralOffsets(archive)[0]
            set16(&archive, c+8, flag)
            rejects(.unsupportedArchive) { _ = try ExchangeImporter.importArchive(archive) }
        }
        var method = original; set16(&method, centralOffsets(method)[0]+10, 99)
        rejects(.unsupportedArchive) { _ = try ExchangeImporter.importArchive(method) }
    }
    func testZIPBombCRCAndLocalCentralMismatchRejected() throws {
        let original = try fixture(), first = centralOffsets(original)[0]
        var bomb = original; set32(&bomb, first+24, 1_000_000)
        rejects(.boundsExceeded) { _ = try ExchangeImporter.importArchive(bomb) }
        for offset in [6, 8, 10, 12, 14, 18, 22, 26, 28, 30] {
            var altered = original; altered[offset] ^= 1
            rejects(.corruptArchive) { _ = try ExchangeImporter.importArchive(altered) }
        }
        var corrupt = original; corrupt[50] ^= 1
        rejects(.corruptArchive) { _ = try ExchangeImporter.importArchive(corrupt) }
        var alias = original; set32(&alias, centralOffsets(alias)[1]+42, 0)
        rejects(.corruptArchive) { _ = try ExchangeImporter.importArchive(alias) }
    }
    func testAllArchiveTruncationsAndPayloadBitMutationsRejected() throws {
        let original = try fixture()
        for count in 0..<original.count {
            rejects { _ = try ExchangeImporter.importArchive(original.prefix(count)) }
        }
        let payloadStart = 30 + u16(original, 26)
        let compressedCount = u32(original, 18)
        // Deterministic corruption corpus, not a claim of coverage-guided fuzzing.
        for offset in stride(from: payloadStart, to: payloadStart + compressedCount, by: 7) {
            var damaged = original; damaged[offset] ^= 0xff
            rejects { _ = try ExchangeImporter.importArchive(damaged) }
        }
    }
    func testMultifloorExchangeRequiresNewProfile() throws {
        var altered = try files(), document = Fixtures.twoRooms()
        var second = document.floors[0]; second.id = "floor-2"; document.floors.append(second)
        altered["geometry.json"] = try document.encoded(); altered = try rehash(altered)
        rejects(.schemaMismatch) { _ = try ExchangeImporter.importFiles(altered) }
        XCTAssertEqual(try GeometryJSONReader.decode(document.encoded()).floors.count, 2)
    }

    private func u16(_ data: Data, _ p: Int) -> Int { Int(data[p]) | Int(data[p+1]) << 8 }
    private func u32(_ data: Data, _ p: Int) -> Int { u16(data,p) | u16(data,p+2) << 16 }
    private func set16(_ data: inout Data, _ p: Int, _ n: Int) {
        data[p] = UInt8(truncatingIfNeeded: n); data[p+1] = UInt8(truncatingIfNeeded: n >> 8)
    }
    private func set32(_ data: inout Data, _ p: Int, _ n: Int) { set16(&data,p,n); set16(&data,p+2,n >> 16) }
    private func centralOffsets(_ data: Data) -> [Int] {
        var p = u32(data,data.count-6), result: [Int] = []
        for _ in 0..<4 { result.append(p); p += 46 + u16(data,p+28) + u16(data,p+30) + u16(data,p+32) }
        return result
    }
    private func storedZIP(_ files: [String: Data]) -> Data {
        var archive = Data(), directory = Data()
        func append16(_ data: inout Data, _ n: Int) { data.append(UInt8(truncatingIfNeeded: n)); data.append(UInt8(truncatingIfNeeded: n >> 8)) }
        func append32(_ data: inout Data, _ n: Int) { append16(&data,n); append16(&data,n >> 16) }
        func crc32(_ data: Data) -> UInt32 {
            var crc: UInt32 = 0xffff_ffff
            for byte in data {
                crc ^= UInt32(byte)
                for _ in 0..<8 { crc = crc & 1 == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1 }
            }
            return crc ^ 0xffff_ffff
        }
        for name in files.keys.sorted() {
            let data = files[name]!, offset = archive.count, crc = Int(crc32(data)), nameBytes = Data(name.utf8)
            append32(&archive,0x04034b50)
            for value in [20,0,0,0,0] { append16(&archive,value) }
            for value in [crc,data.count,data.count] { append32(&archive,value) }
            append16(&archive,nameBytes.count); append16(&archive,0); archive.append(nameBytes); archive.append(data)
            append32(&directory,0x02014b50)
            for value in [0x314,20,0,0,0,0] { append16(&directory,value) }
            for value in [crc,data.count,data.count] { append32(&directory,value) }
            for value in [nameBytes.count,0,0,0,0] { append16(&directory,value) }
            append32(&directory,0x81a4 << 16); append32(&directory,offset); directory.append(nameBytes)
        }
        let start = archive.count; archive.append(directory)
        append32(&archive,0x06054b50)
        for value in [0,0,4,4] { append16(&archive,value) }
        append32(&archive,directory.count); append32(&archive,start); append16(&archive,0)
        return archive
    }
}
