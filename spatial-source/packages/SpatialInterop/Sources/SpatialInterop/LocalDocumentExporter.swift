import Foundation
import SpatialCore

/// A separate, local-only profile. This is not the publication/exchange 1.0 profile.
public struct LocalDocumentManifest: Codable, Equatable, Sendable {
    public let profileVersion: String
    public let documentID: String
    public let revision: Int
    public let measurementStatus: String
    public let coordinateSystem: String
    public let floors: [FloorEntry]
    public let files: [FileEntry]
    public struct FloorEntry: Codable, Equatable, Sendable {
        public let floorID: String, label: String
        public let elevation: Double
        public let index: Int, pageCount: Int
        public let representationStatus: String
    }
    public struct FileEntry: Codable, Equatable, Sendable {
        public let path: String, mimeType: String, sha256: String
        public let bytes: Int
        public let floorID: String?
        public let pageIndex: Int?
    }
}
public struct ExportedLocalDocument: Sendable {
    public let documentID: String
    public let revision: Int
    public let files: [String: Data]
    public let archiveData: Data
    public let manifestDigest: String
}
public struct ImportedLocalDocument: Sendable {
    public let document: SpatialDocument
    public let manifest: LocalDocumentManifest
    public let originalArchive: Data
    public let manifestDigest: String
    /// Received presentation artifacts are never used as trusted render sources.
    /// Recreate drawings and models from `document` before display or a fresh export.
}

public enum LocalDocumentExporter {
    public static let profileVersion = "auxilium-spatial-local-document/1.0.0"
    public static func export(document: SpatialDocument, pixelsPerPoint: Int = 2) throws -> ExportedLocalDocument {
        try build(document: document) { floorID in
            try DrawingExporter.export(document: document, floorID: floorID, pixelsPerPoint: pixelsPerPoint)
        }
    }

    // The internal seam permits manifest/adversarial tests without pretending that
    // a Linux fixture renderer is the real CoreGraphics backend.
    static func build(document: SpatialDocument, drawing: (String) throws -> ExportedDrawing) throws -> ExportedLocalDocument {
        guard (1...100).contains(document.floors.count) else { throw SpatialExportError.invalidGeometry }
        var files: [String: Data] = [:], entries: [LocalDocumentManifest.FileEntry] = [], floors: [LocalDocumentManifest.FloorEntry] = []
        var total = 0
        func add(_ path: String, _ data: Data, mime: String, floorID: String? = nil, page: Int? = nil) throws {
            guard files[path] == nil, !data.isEmpty, data.count <= SpatialImportLimits.memberBytes else { throw SpatialExportError.exceedsSafetyBounds }
            total += data.count
            guard total <= SpatialImportLimits.totalBytes, files.count < ProfileArchive.maxMembers - 1 else { throw SpatialExportError.exceedsSafetyBounds }
            files[path] = data
            entries.append(.init(path: path, mimeType: mime, sha256: ByteDigest.sha256(data), bytes: data.count, floorID: floorID, pageIndex: page))
        }
        for (index, floor) in document.floors.enumerated() {
            let prepared = try ExportPreparation.prepare(document: document, floorID: floor.id)
            if index == 0 { try add("geometry.json", prepared.geometry, mime: "application/json") }
            let output = try drawing(floor.id)
            guard output.documentID == document.documentID, output.floorID == floor.id, output.revision == document.revision,
                  !output.svgPages.isEmpty, output.svgPages.count <= 500, output.svgPages.count == output.pngPages.count else {
                throw SpatialImportError.identityMismatch
            }
            let prefix = String(format: "floors/%04d/", index)
            try add(prefix + "scene.json", prepared.sceneBytes, mime: "application/json", floorID: floor.id)
            try add(prefix + "floorplan.pdf", output.pdf, mime: "application/pdf", floorID: floor.id)
            for page in output.svgPages.indices {
                let name = String(format: "floorplan-%04d", page)
                try add(prefix + name + ".svg", output.svgPages[page], mime: "image/svg+xml", floorID: floor.id, page: page)
                try add(prefix + name + ".png", output.pngPages[page], mime: "image/png", floorID: floor.id, page: page)
            }
            let empty = prepared.scene.faces.isEmpty && prepared.scene.edges.isEmpty
            if !empty { try add(prefix + "model.glb", GLBExporter.export(document: document, floorID: floor.id), mime: "model/gltf-binary", floorID: floor.id) }
            floors.append(.init(floorID: floor.id, label: floor.label, elevation: floor.elevation, index: index,
                                pageCount: output.svgPages.count, representationStatus: empty ? "empty" : "geometry"))
        }
        let manifest = LocalDocumentManifest(profileVersion: profileVersion, documentID: document.documentID,
            revision: document.revision, measurementStatus: "unverified", coordinateSystem: document.coordinateSystem,
            floors: floors, files: entries.sorted { $0.path < $1.path })
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let bytes = try encoder.encode(manifest); files["manifest.json"] = bytes
        let archive = try ProfileArchive.write(files)
        return .init(documentID: document.documentID, revision: document.revision, files: files, archiveData: archive,
                     manifestDigest: ByteDigest.sha256(bytes))
    }
}

public enum LocalDocumentImporter {
    public static func importArchive(_ data: Data) throws -> ImportedLocalDocument {
        let budget = ImportBudget(), files = try ProfileArchive.read(data, budget: ImportBudget())
        guard let manifestBytes = files["manifest.json"], let geometry = files["geometry.json"] else { throw SpatialImportError.schemaMismatch }
        var parser = try StrictJSON(manifestBytes, budget: budget)
        let tree = try parser.parse()
        try ContractValidator(name: "local-document-manifest", budget: budget).validate(tree)
        let manifest: LocalDocumentManifest
        do { manifest = try JSONDecoder().decode(LocalDocumentManifest.self, from: manifestBytes) }
        catch { throw SpatialImportError.schemaMismatch }
        guard manifest.profileVersion == LocalDocumentExporter.profileVersion,
              manifest.measurementStatus == "unverified", manifest.coordinateSystem == "meters_y_up_right_handed",
              (1...100).contains(manifest.floors.count), manifest.files.count < ProfileArchive.maxMembers,
              Set(manifest.files.map(\.path)).count == manifest.files.count,
              Set(manifest.files.map(\.path)) == Set(files.keys).subtracting(["manifest.json"]) else { throw SpatialImportError.schemaMismatch }
        for entry in manifest.files {
            guard let file = files[entry.path], entry.bytes == file.count, entry.sha256 == ByteDigest.sha256(file) else {
                throw SpatialImportError.identityMismatch
            }
            try budget.check()
        }
        let document = try GeometryJSONReader.decode(geometry, budget: budget)
        guard manifest.documentID == document.documentID, manifest.revision == document.revision,
              manifest.floors.count == document.floors.count else { throw SpatialImportError.identityMismatch }
        var expected: [String: (String, String?, Int?)] = ["geometry.json": ("application/json", nil, nil)]
        for (index, floor) in document.floors.enumerated() {
            let item = manifest.floors[index]
            guard item.floorID == floor.id, item.label == floor.label, item.elevation == floor.elevation, item.index == index,
                  (1...500).contains(item.pageCount), ["empty", "geometry"].contains(item.representationStatus) else {
                throw SpatialImportError.identityMismatch
            }
            let prefix = String(format: "floors/%04d/", index)
            expected[prefix + "scene.json"] = ("application/json", floor.id, nil)
            expected[prefix + "floorplan.pdf"] = ("application/pdf", floor.id, nil)
            for page in 0..<item.pageCount {
                let name = prefix + String(format: "floorplan-%04d", page)
                expected[name + ".svg"] = ("image/svg+xml", floor.id, page)
                expected[name + ".png"] = ("image/png", floor.id, page)
            }
            let canonical = try SceneBuilder.build(document: document, floorID: floor.id)
            let empty = canonical.faces.isEmpty && canonical.edges.isEmpty
            guard item.representationStatus == (empty ? "empty" : "geometry") else { throw SpatialImportError.identityMismatch }
            if !empty { expected[prefix + "model.glb"] = ("model/gltf-binary", floor.id, nil) }
            guard let sceneBytes = files[prefix + "scene.json"] else { throw SpatialImportError.schemaMismatch }
            var sceneParser = try StrictJSON(sceneBytes, budget: budget)
            let sceneTree = try sceneParser.parse()
            guard let sceneVersion = sceneTree.object?["schemaVersion"]?.string, ["1.0.0", "1.1.0"].contains(sceneVersion) else {
                throw SpatialImportError.schemaMismatch
            }
            try ContractValidator(name: sceneVersion == "1.0.0" ? "scene" : "scene-v1.1", budget: budget).validate(sceneTree)
            let scene = try JSONDecoder().decode(GraphicScene.self, from: sceneBytes)
            guard scene.documentID == document.documentID, scene.floorID == floor.id, scene.revision == document.revision else {
                throw SpatialImportError.identityMismatch
            }
            // This local profile is emitted by the canonical SceneBuilder, not an
            // arbitrary interchange renderer. Reject forged or malformed derivatives.
            guard scene == canonical else { throw SpatialImportError.invalidScene }
        }
        guard Set(expected.keys) == Set(manifest.files.map(\.path)) else { throw SpatialImportError.schemaMismatch }
        for entry in manifest.files {
            guard let match = expected[entry.path], entry.mimeType == match.0, entry.floorID == match.1, entry.pageIndex == match.2 else {
                throw SpatialImportError.identityMismatch
            }
            try DrawingArtifactValidation.validate(files[entry.path]!, mime: entry.mimeType, budget: budget)
        }
        try budget.check()
        // Hashes prove exact received bytes, never permission or benign derivative content.
        // Do not hand PDF/SVG/PNG/GLB from this archive to a viewer. Regenerate from geometry.
        return .init(document: document, manifest: manifest, originalArchive: data, manifestDigest: ByteDigest.sha256(manifestBytes))
    }

}
