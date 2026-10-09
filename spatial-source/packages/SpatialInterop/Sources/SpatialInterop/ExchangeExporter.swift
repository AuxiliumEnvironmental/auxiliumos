import Foundation
import SpatialCore
import CSpatialCompression

public enum SpatialExportError: String, Error, LocalizedError, Sendable {
    case invalidGeometry, exceedsSafetyBounds, unsupportedProfile, emptyScene, precisionLoss
    public var errorDescription: String? { "The spatial export could not be created (\(rawValue))." }
}

/// Frozen value snapshot. No timestamp, device identity, raw capture, destination, ticket,
/// or credential enters the four-file transport profile. Hashes do not grant authority.
public struct ExportedExchange: Sendable {
    public let documentID: String
    public let revision: Int
    public let floorID: String
    public let files: [String: Data]
    public let archiveData: Data
    public let manifestDigest: String
}

public enum ExchangeExporter {
    public static func export(document: SpatialDocument, floorID: String) throws -> ExportedExchange {
        guard document.floors.count == 1, document.floors.first?.id == floorID else {
            throw SpatialExportError.unsupportedProfile
        }
        let prepared = try ExportPreparation.prepare(document: document, floorID: floorID)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        var files = [
            "geometry.json": prepared.geometry,
            "scene.json": prepared.sceneBytes,
            "floorplan.svg": Data(try SVGExporter.render(document: document, floorID: floorID).utf8)
        ]
        guard files.values.allSatisfy({ !$0.isEmpty && $0.count <= SpatialImportLimits.memberBytes }) else {
            throw SpatialExportError.exceedsSafetyBounds
        }
        let entries = files.keys.sorted().map { name in
            Manifest.Entry(path: name, sha256: ByteDigest.sha256(files[name]!), bytes: files[name]!.count)
        }
        let manifest = Manifest(documentID: document.documentID, revision: document.revision, files: entries)
        let manifestBytes = try encoder.encode(manifest)
        files["manifest.json"] = manifestBytes
        let archive = try StoredZIPWriter.write(files)
        return ExportedExchange(documentID: document.documentID, revision: document.revision,
            floorID: floorID, files: files, archiveData: archive, manifestDigest: ByteDigest.sha256(manifestBytes))
    }
    private struct Manifest: Encodable {
        let formatVersion = "1.0.0"
        let documentID: String
        let revision: Int
        let measurementStatus = "unverified"
        let contentClass = "spatial-draft"
        let files: [Entry]
        struct Entry: Encodable { let path: String; let sha256: String; let bytes: Int }
    }
}

enum ExportPreparation {
    struct Prepared { let geometry: Data; let scene: GraphicScene; let sceneBytes: Data }
    static func prepare(document: SpatialDocument, floorID: String) throws -> Prepared {
        try admit(document: document, floorID: floorID)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let geometry = try encoder.encode(document)
        let budget = ImportBudget()
        var parser = try StrictJSON(geometry, budget: budget)
        guard ["1.0.0", "1.1.0"].contains(document.schemaVersion) else { throw SpatialExportError.invalidGeometry }
        try ContractValidator(name: document.schemaVersion == "1.0.0" ? "geometry" : "geometry-v1.1", budget: budget).validate(parser.parse())
        guard Validator.validate(document).isEmpty else { throw SpatialExportError.invalidGeometry }
        let scene = try SceneBuilder.build(document: document, floorID: floorID)
        guard scene.faces.count <= 200_000, scene.edges.count <= 400_000 else { throw SpatialExportError.exceedsSafetyBounds }
        var sceneByteEstimate = 1024 + scene.edges.count * 512
        for face in scene.faces {
            sceneByteEstimate += 256 + face.vertices.count * 128 + face.triangles.count * 64
            guard sceneByteEstimate <= SpatialImportLimits.memberBytes else { throw SpatialExportError.exceedsSafetyBounds }
        }
        guard sceneByteEstimate <= SpatialImportLimits.memberBytes else { throw SpatialExportError.exceedsSafetyBounds }
        let sceneBytes = try encoder.encode(scene)
        var sceneParser = try StrictJSON(sceneBytes, budget: budget)
        try ContractValidator(name: scene.schemaVersion == "1.0.0" ? "scene" : "scene-v1.1", budget: budget).validate(sceneParser.parse())
        return Prepared(geometry: geometry, scene: scene, sceneBytes: sceneBytes)
    }
    private static func admit(document: SpatialDocument, floorID: String) throws {
        guard (1...100).contains(document.floors.count), document.floors.contains(where: { $0.id == floorID }) else {
            throw SpatialExportError.invalidGeometry
        }
        // Conservative compact-JSON admission estimate before serialization. Identifiers
        // and labels receive separate bounded validation; counts alone are insufficient.
        var estimate: Int64 = 4096
        func text(_ value: String, max: Int) throws {
            guard value.utf8.count <= max else { throw SpatialExportError.exceedsSafetyBounds }
        }
        func charge(_ value: Int64) throws {
            estimate += value
            if estimate > SpatialImportLimits.memberBytes { throw SpatialExportError.exceedsSafetyBounds }
        }
        try text(document.title, max: 1024)
        try text(document.documentID, max: 96)
        for floor in document.floors {
            guard floor.nodes.count <= 100_000, floor.walls.count <= 50_000,
                  floor.openings.count <= 10_000, floor.rooms.count <= 10_000 else { throw SpatialExportError.exceedsSafetyBounds }
            try text(floor.id, max: 96); try text(floor.label, max: 1024)
            guard floor.areas.count <= 1000 else { throw SpatialExportError.exceedsSafetyBounds }
            for area in floor.areas {
                guard area.polygon.count <= 1000, area.provenance.sourceIDs.count <= 1000 else { throw SpatialExportError.exceedsSafetyBounds }
                try text(area.id, max: 96); try text(area.label, max: 1024)
                for sourceID in area.provenance.sourceIDs { try text(sourceID, max: 96) }
                try charge(2048 + Int64(area.polygon.count) * 256 + Int64(area.provenance.sourceIDs.count) * 128)
            }
            try charge(4096 + Int64(floor.nodes.count) * 256)
            for node in floor.nodes { try text(node.id, max: 96) }
            for wall in floor.walls {
                guard wall.nodeIDs.count <= 1000, wall.provenance.sourceIDs.count <= 1000 else { throw SpatialExportError.exceedsSafetyBounds }
                try text(wall.id, max: 96)
                for id in wall.nodeIDs + wall.provenance.sourceIDs { try text(id, max: 96) }
                try charge(1024 + Int64(wall.nodeIDs.count + wall.provenance.sourceIDs.count) * 128)
            }
            for opening in floor.openings {
                guard opening.provenance.sourceIDs.count <= 1000 else { throw SpatialExportError.exceedsSafetyBounds }
                try text(opening.id, max: 96); try text(opening.wallID, max: 96)
                for id in opening.provenance.sourceIDs { try text(id, max: 96) }
                try charge(1024 + Int64(opening.provenance.sourceIDs.count) * 128)
            }
            for room in floor.rooms {
                guard room.boundary.count <= 1000 else { throw SpatialExportError.exceedsSafetyBounds }
                try text(room.id, max: 96); try text(room.label, max: 1024)
                for ref in room.boundary { try text(ref.wallID, max: 96) }
                try charge(4096 + Int64(room.boundary.count) * 160)
            }
            // Pessimistic scene generation upper bound before arrays/buffers are allocated.
            let openings = Dictionary(grouping: floor.openings, by: \.wallID)
            let wallMap = Dictionary(floor.walls.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            var maxTriangles: Int64 = 0, maxEdges: Int64 = 0
            for wall in floor.walls {
                let n = Int64(wall.nodeIDs.count), holes = Int64(openings[wall.id]?.count ?? 0)
                maxTriangles += max(0, n - 1 + 2 * holes) * (holes + 1) * 2
                maxEdges += (n + 2 * holes) * (4 * holes + 4)
            }
            for room in floor.rooms {
                let vertices = room.boundary.reduce(0) { $0 + max(0, (wallMap[$1.wallID]?.nodeIDs.count ?? 1) - 1) }
                maxTriangles += Int64(max(0, vertices - 2))
            }
            guard maxTriangles <= 500_000, maxEdges <= 400_000,
                  maxTriangles * 84 + maxEdges * 24 <= SpatialImportLimits.totalBytes else {
                throw SpatialExportError.exceedsSafetyBounds
            }
        }
        try GeometryAdmission.validate(document)
    }
}

enum StoredZIPWriter {
    static func write(_ files: [String: Data]) throws -> Data {
        guard Set(files.keys) == ZIPReader.allowed else { throw SpatialExportError.unsupportedProfile }
        let total = files.reduce(22) { $0 + $1.value.count + 76 + $1.key.utf8.count * 2 }
        guard total <= SpatialImportLimits.totalBytes,
              files.values.allSatisfy({ !$0.isEmpty && $0.count <= SpatialImportLimits.memberBytes }) else {
            throw SpatialExportError.exceedsSafetyBounds
        }
        var archive = Data(); archive.reserveCapacity(total)
        var directory = Data()
        for name in files.keys.sorted() {
            let bytes = files[name]!, nameBytes = Data(name.utf8), localOffset = archive.count
            let crc = bytes.withUnsafeBytes { spatial_crc32($0.bindMemory(to: UInt8.self).baseAddress, bytes.count) }
            archive.appendLE(0x04034b50 as UInt32)
            for value: UInt16 in [20,0,0,0,0x21] { archive.appendLE(value) }
            archive.appendLE(crc); archive.appendLE(UInt32(bytes.count)); archive.appendLE(UInt32(bytes.count))
            archive.appendLE(UInt16(nameBytes.count)); archive.appendLE(0 as UInt16)
            archive.append(nameBytes); archive.append(bytes)
            directory.appendLE(0x02014b50 as UInt32)
            for value: UInt16 in [0x0314,20,0,0,0,0x21] { directory.appendLE(value) }
            directory.appendLE(crc); directory.appendLE(UInt32(bytes.count)); directory.appendLE(UInt32(bytes.count))
            for value: UInt16 in [UInt16(nameBytes.count),0,0,0,0] { directory.appendLE(value) }
            directory.appendLE(0x81a4_0000 as UInt32); directory.appendLE(UInt32(localOffset)); directory.append(nameBytes)
        }
        let start = archive.count
        archive.append(directory); archive.appendLE(0x06054b50 as UInt32)
        for value: UInt16 in [0,0,4,4] { archive.appendLE(value) }
        archive.appendLE(UInt32(directory.count)); archive.appendLE(UInt32(start)); archive.appendLE(0 as UInt16)
        return archive
    }
}

extension Data {
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) {
        var little = value.littleEndian
        Swift.withUnsafeBytes(of: &little) { append(contentsOf: $0) }
    }
}
