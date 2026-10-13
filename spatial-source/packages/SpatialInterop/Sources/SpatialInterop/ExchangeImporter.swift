import Foundation
import SpatialCore

public struct ImportedExchange: Sendable {
    public let document: SpatialDocument
    public let floorID: String
    /// Exact received bytes. Preserve these separately from regenerated derivatives.
    public let originalFiles: [String: Data]
    public let originalArchive: Data?
    /// Byte identity only. Neither a hash nor client reviewState authorizes publication.
    public let manifestSHA256: String
    public let archiveSHA256: String?
    public func scene() throws -> GraphicScene { try SceneBuilder.build(document: document, floorID: floorID) }
    public func floorplanSVG() throws -> String { try SVGExporter.render(document: document, floorID: floorID) }
}

public enum ExchangeImporter {
    public static func importArchive(_ archive: Data) throws -> ImportedExchange {
        let budget = ImportBudget()
        let files = try ZIPReader(data: archive, budget: budget).read()
        return try validate(files: files, originalArchive: archive, budget: budget)
    }
    /// Useful for trusted file-picker adapters that already read bounded bytes. Still applies
    /// exactly the same schemas, hashes, SVG, indices, and identity checks as ZIP import.
    public static func importFiles(_ files: [String: Data]) throws -> ImportedExchange {
        try validate(files: files, originalArchive: nil, budget: ImportBudget())
    }
    private static func validate(files: [String: Data], originalArchive: Data?, budget: ImportBudget) throws -> ImportedExchange {
        guard Set(files.keys) == ZIPReader.allowed else { throw SpatialImportError.unsafeArchive }
        guard files.values.allSatisfy({ !$0.isEmpty && $0.count <= SpatialImportLimits.memberBytes }),
              files.values.reduce(0, { $0 + $1.count }) <= SpatialImportLimits.totalBytes else { throw SpatialImportError.boundsExceeded }
        let manifestBytes = files["manifest.json"]!
        var manifestParser = try StrictJSON(manifestBytes, budget: budget)
        let manifestValue = try manifestParser.parse()
        try ContractValidator(name: "manifest", budget: budget).validate(manifestValue)
        let manifest: Manifest
        do { manifest = try JSONDecoder().decode(Manifest.self, from: manifestBytes) }
        catch { throw SpatialImportError.schemaMismatch }
        guard manifest.files.count == 3, Set(manifest.files.map(\.path)) == ZIPReader.allowed.subtracting(["manifest.json"]) else {
            throw SpatialImportError.identityMismatch
        }
        for entry in manifest.files {
            guard let bytes = files[entry.path], bytes.count == entry.bytes,
                  ByteDigest.sha256(bytes) == entry.sha256 else { throw SpatialImportError.identityMismatch }
            try budget.check()
        }
        let document = try GeometryJSONReader.decode(files["geometry.json"]!, budget: budget)
        // This four-file profile has one floorplan and one floor scene. Multi-floor export
        // needs the separately versioned per-floor manifest required by docs/06_INTEGRATION.
        guard document.floors.count == 1 else { throw SpatialImportError.schemaMismatch }
        var sceneParser = try StrictJSON(files["scene.json"]!, budget: budget)
        let sceneValue = try sceneParser.parse()
        guard let sceneVersion = sceneValue.object?["schemaVersion"]?.string, ["1.0.0", "1.1.0"].contains(sceneVersion) else { throw SpatialImportError.schemaMismatch }
        try ContractValidator(name: sceneVersion == "1.0.0" ? "scene" : "scene-v1.1", budget: budget).validate(sceneValue)
        let scene: GraphicScene
        do { scene = try JSONDecoder().decode(GraphicScene.self, from: files["scene.json"]!) }
        catch { throw SpatialImportError.schemaMismatch }
        guard manifest.documentID == document.documentID, manifest.revision == document.revision,
              scene.documentID == document.documentID, scene.revision == document.revision else { throw SpatialImportError.identityMismatch }
        guard let floor = document.floors.first(where: { $0.id == scene.floorID }) else { throw SpatialImportError.invalidScene }
        let rooms = Set(floor.rooms.map(\.id)), walls = Set(floor.walls.map(\.id))
        let areas = Set(floor.areas.map(\.id))
        let openings = Dictionary(floor.openings.map { ($0.id, $0.kind.rawValue) }, uniquingKeysWith: { a, _ in a })
        for face in scene.faces {
            guard (face.role == "floor" ? rooms : walls).contains(face.objectID),
                  face.triangles.allSatisfy({ triangle in triangle.allSatisfy { $0 >= 0 && $0 < face.vertices.count } }) else {
                throw SpatialImportError.invalidScene
            }
        }
        for edge in scene.edges {
            let valid = edge.role == "wall" ? walls.contains(edge.objectID) :
                (edge.role == "area" ? areas.contains(edge.objectID) : openings[edge.objectID] == edge.role)
            guard valid else {
                throw SpatialImportError.invalidScene
            }
        }
        try SafeSVG.validate(files["floorplan.svg"]!, budget: budget)
        try budget.check()
        // Incoming render coordinates are deliberately discarded. No mesh equality claim is
        // made about derivatives supplied by a third party, even with matching manifest hashes.
        let result = ImportedExchange(document: document, floorID: scene.floorID, originalFiles: files,
            originalArchive: originalArchive, manifestSHA256: ByteDigest.sha256(manifestBytes),
            archiveSHA256: originalArchive.map(ByteDigest.sha256))
        try budget.check()
        return result
    }
    private struct Manifest: Decodable {
        let documentID: String, revision: Int, files: [Entry]
        struct Entry: Decodable { let path: String, sha256: String, bytes: Int }
    }
}
