import Foundation
import XCTest
import SpatialCore
@testable import SpatialInterop

/// The injected drawing payloads below exercise archive/identity admission only.
/// They are explicitly not rendered floorplan or native CoreGraphics evidence.
final class LocalDocumentExportTests: XCTestCase {
    private let onePixel = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=")!
    private func twoFloors() -> SpatialDocument {
        var document = Fixtures.twoRooms(), upper = document.floors[0]
        upper.id = "upper-floor"; upper.label = "Upper floor"; upper.elevation = 3
        for index in upper.nodes.indices { upper.nodes[index].point.x += 13; upper.nodes[index].point.z -= 8 }
        document.floors.append(upper); document.revision = 9; document.parentRevision = 8
        return document
    }
    private func manifestOnlyArchive(_ document: SpatialDocument) throws -> ExportedLocalDocument {
        try LocalDocumentExporter.build(document: document) { floorID in
            let svg = try DrawingExporter.svgPages(document: document, floorID: floorID)
            return ExportedDrawing(documentID: document.documentID, floorID: floorID, revision: document.revision,
                svgPages: svg, pdf: Data("%PDF-1.7\n% SYNTHETIC ADMISSION-ONLY PAYLOAD; NOT A RENDERED DRAWING\n%%EOF\n".utf8),
                pngPages: Array(repeating: onePixel, count: svg.count))
        }
    }
    private func replaceManifest(_ files: [String: Data], edit: (inout [String: Any]) -> Void) throws -> Data {
        var files = files
        var manifest = try JSONSerialization.jsonObject(with: files["manifest.json"]!) as! [String: Any]
        edit(&manifest)
        files["manifest.json"] = try JSONSerialization.data(withJSONObject: manifest, options: [.sortedKeys])
        return try ProfileArchive.write(files)
    }
    func testManifestOnlyMultiFloorArchivePreservesExactSnapshotAndExplicitFloorIdentity() throws {
        let document = twoFloors(), output = try manifestOnlyArchive(document)
        let imported = try LocalDocumentImporter.importArchive(output.archiveData)
        XCTAssertEqual(imported.document, document); XCTAssertEqual(imported.manifest.revision, 9)
        XCTAssertEqual(imported.manifest.floors.map(\.floorID), ["floor-1", "upper-floor"])
        XCTAssertEqual(imported.manifest.floors.map(\.elevation), [0, 3])
        XCTAssertEqual(imported.manifestDigest, output.manifestDigest)
        XCTAssertEqual(output.archiveData, try manifestOnlyArchive(document).archiveData)
        XCTAssertTrue(output.files.keys.contains("floors/0001/model.glb"))
        XCTAssertTrue(output.files.keys.allSatisfy { !$0.contains("upper-floor") })
        XCTAssertTrue(imported.manifest.files.filter { $0.path.hasPrefix("floors/0001/") }.allSatisfy { $0.floorID == "upper-floor" })
    }
    func testManifestOnlyAllEntriesAreByteVerifiedAndMutationIsRejected() throws {
        let output = try manifestOnlyArchive(twoFloors())
        let manifest = try JSONDecoder().decode(LocalDocumentManifest.self, from: output.files["manifest.json"]!)
        for entry in manifest.files {
            XCTAssertEqual(entry.bytes, output.files[entry.path]!.count)
            XCTAssertEqual(entry.sha256, ByteDigest.sha256(output.files[entry.path]!))
        }
        var files = output.files; files["floors/0001/floorplan-0000.svg"]!.append(32)
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(ProfileArchive.write(files))) {
            XCTAssertEqual($0 as? SpatialImportError, .identityMismatch)
        }
    }
    func testManifestOnlyUnknownKeysAndVersionsCannotWidenProfile() throws {
        let output = try manifestOnlyArchive(twoFloors())
        for edit: (inout [String: Any]) -> Void in [
            { $0["profileVersion"] = "auxilium-spatial-local-document/99.0.0" },
            { $0["rawCaptureURL"] = "https://example.invalid/private" },
            { $0["revision"] = 10 }
        ] {
            XCTAssertThrowsError(try LocalDocumentImporter.importArchive(replaceManifest(output.files, edit: edit)))
        }
        XCTAssertThrowsError(try ExchangeImporter.importArchive(output.archiveData))
    }
    func testManifestOnlyFloorReferencesMIMEAndPageCountsCannotDrift() throws {
        let output = try manifestOnlyArchive(twoFloors())
        let wrongFloor = try replaceManifest(output.files) { root in
            var entries = root["files"] as! [[String: Any]]
            let index = entries.firstIndex { $0["floorID"] != nil }!
            entries[index]["floorID"] = "other-floor"; root["files"] = entries
        }
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(wrongFloor))
        let wrongType = try replaceManifest(output.files) { root in
            var entries = root["files"] as! [[String: Any]]; entries[0]["mimeType"] = "text/html"; root["files"] = entries
        }
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(wrongType))
        let missingPages = try replaceManifest(output.files) { root in
            var floors = root["floors"] as! [[String: Any]]; floors[0]["pageCount"] = 1; root["floors"] = floors
        }
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(missingPages))
    }
    func testManifestOnlyEmptyFloorHasNoFakeGLB() throws {
        let document = SpatialDocument(documentID: "empty", title: "Empty", floors: [.init(id: "f", label: "Empty", nodes: [], walls: [], openings: [], rooms: [])])
        let output = try manifestOnlyArchive(document), imported = try LocalDocumentImporter.importArchive(output.archiveData)
        XCTAssertEqual(imported.manifest.floors[0].representationStatus, "empty")
        XCTAssertFalse(output.files.keys.contains { $0.hasSuffix(".glb") })
    }
    func testManifestOnlySemanticAreaRoundtripUsesVersionedGeometryWithoutChangingLegacyProfile() throws {
        var document = Fixtures.twoRooms(); document.schemaVersion = "1.1.0"
        document.floors[0].areas = [.init(id: "area", label: "Open-plan area", polygon: [
            .init(x: 1, z: 1), .init(x: 3, z: 1), .init(x: 3, z: 3), .init(x: 1, z: 3)], provenance: .init(origin: .edited))]
        let output = try manifestOnlyArchive(document)
        XCTAssertEqual(try LocalDocumentImporter.importArchive(output.archiveData).document, document)
        let exchange = try ExchangeExporter.export(document: document, floorID: "floor-1")
        XCTAssertEqual(try ExchangeImporter.importArchive(exchange.archiveData).document, document)
        XCTAssertEqual(Set(exchange.files.keys), ["manifest.json", "geometry.json", "scene.json", "floorplan.svg"])
    }
    func testManifestOnlyDuplicateJSONKeysRejected() throws {
        var files = try manifestOnlyArchive(twoFloors()).files
        let original = String(decoding: files["manifest.json"]!, as: UTF8.self)
        files["manifest.json"] = Data(original.replacingOccurrences(of: "\"revision\":9", with: "\"revision\":9,\"revision\":9").utf8)
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(ProfileArchive.write(files))) {
            XCTAssertEqual($0 as? SpatialImportError, .duplicateJSONKey)
        }
    }
    func testArchiveRejectsTraversalPreambleTrailingDataAndCRCMutation() throws {
        XCTAssertFalse(ProfileArchive.validPath("floors/0000/../../escape"))
        XCTAssertFalse(ProfileArchive.validPath("floors/0000/floorplan-9999.svg"))
        XCTAssertFalse(ProfileArchive.validPath("floors/0000//scene.json"))
        XCTAssertFalse(ProfileArchive.validPath("floors/1000/scene.json"))
        let archive = try manifestOnlyArchive(twoFloors()).archiveData
        var prefixed = Data([0]); prefixed.append(archive)
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(prefixed))
        var suffixed = archive; suffixed.append(0)
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(suffixed))
        var corrupt = archive; corrupt[100] ^= 1
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(corrupt))
    }
    func testArchiveRejectsSymlinkAndLocalCentralNameMismatch() throws {
        let archive = try manifestOnlyArchive(twoFloors()).archiveData
        let signature = Data([0x50, 0x4b, 0x01, 0x02]), central = try XCTUnwrap(archive.range(of: signature)).lowerBound
        var symlink = archive; symlink[central + 41] = 0xa1
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(symlink))
        var mismatched = archive; mismatched[30] = Character("x").asciiValue!
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(mismatched))
    }
    func testArchiveBuilderRejectsDrawingRevisionMismatch() throws {
        let document = Fixtures.twoRooms()
        XCTAssertThrowsError(try LocalDocumentExporter.build(document: document) { id in
            .init(documentID: document.documentID, floorID: id, revision: 99, svgPages: [Data([1])], pdf: Data([1]), pngPages: [Data([1])])
        }) { XCTAssertEqual($0 as? SpatialImportError, .identityMismatch) }
    }
    func testDerivedSVGScriptAndPNGCorruptionAreRejectedBeforeAnyViewer() throws {
        XCTAssertThrowsError(try DrawingArtifactValidation.validate(Data("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".utf8), mime: "image/svg+xml", budget: ImportBudget()))
        XCTAssertThrowsError(try DrawingArtifactValidation.validate(Data("<!DOCTYPE svg [<!ENTITY x 'xx'>]><svg xmlns=\"http://www.w3.org/2000/svg\">&x;</svg>".utf8), mime: "image/svg+xml", budget: ImportBudget()))
        var corrupt = onePixel; corrupt[45] ^= 1
        XCTAssertThrowsError(try DrawingArtifactValidation.validate(corrupt, mime: "image/png", budget: ImportBudget()))
        XCTAssertNoThrow(try DrawingArtifactValidation.validate(onePixel, mime: "image/png", budget: ImportBudget()))
    }
    func testPDFActiveExternalAndCompressedObjectMachineryRejected() throws {
        for name in ["JavaScript", "J#53", "URI", "OpenAction", "EmbeddedFile", "ObjStm", "XRef", "Encrypt"] {
            let data = Data("%PDF-1.7\n1 0 obj << /\(name) /Value >> endobj\n%%EOF\n".utf8)
            XCTAssertThrowsError(try DrawingArtifactValidation.validate(data, mime: "application/pdf", budget: ImportBudget()), name)
        }
    }
    func testRehashedActiveSVGRejectedThroughActualLocalImport() throws {
        var files = try manifestOnlyArchive(twoFloors()).files
        let path = "floors/0000/floorplan-0000.svg"
        files[path] = Data("<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>".utf8)
        let archive = try replaceManifest(files) { root in
            var entries = root["files"] as! [[String: Any]]
            let index = entries.firstIndex { $0["path"] as? String == path }!
            entries[index]["sha256"] = ByteDigest.sha256(files[path]!); entries[index]["bytes"] = files[path]!.count
            root["files"] = entries
        }
        XCTAssertThrowsError(try LocalDocumentImporter.importArchive(archive)) {
            XCTAssertEqual($0 as? SpatialImportError, .invalidSVG)
        }
    }
    func testVersionedManifestResourcesMatchLeadOwnedContracts() throws {
        let root = (0..<5).reduce(URL(fileURLWithPath: #filePath)) { result, _ in result.deletingLastPathComponent() }
        for name in ["local-document-manifest", "drawing-pages-manifest"] {
            let contract = try Data(contentsOf: root.appendingPathComponent("contracts/\(name).schema.json"))
            let resource = try Data(contentsOf: root.appendingPathComponent("packages/SpatialInterop/Sources/SpatialInterop/Resources/\(name).schema.json"))
            XCTAssertEqual(contract, resource)
        }
    }
    func testEmitManifestOnlyFixturesWhenRequested() throws {
        guard let path = ProcessInfo.processInfo.environment["SPATIAL_DRAWING_FIXTURE_DIR"] else { return }
        let root = URL(fileURLWithPath: path, isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try manifestOnlyArchive(twoFloors()).archiveData.write(to: root.appendingPathComponent("manifest-only-two-floors.zip"), options: .atomic)
        try DrawingExporter.exportSVGArchive(document: twoFloors(), floorID: "floor-1").write(to: root.appendingPathComponent("actual-svg-pages.zip"), options: .atomic)
    }
}
