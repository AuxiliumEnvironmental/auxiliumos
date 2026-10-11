import Foundation
import SpatialCore

public enum GeometryJSONReader {
    /// Synchronous, bounded import. Call from a worker task, never a UI render callback.
    /// An accepted document retains its input review state as metadata, not release authority.
    public static func decode(_ data: Data) throws -> SpatialDocument {
        try decode(data, budget: ImportBudget())
    }
    static func decode(_ data: Data, budget: ImportBudget) throws -> SpatialDocument {
        var parser = try StrictJSON(data, budget: budget)
        let value = try parser.parse()
        guard let version = value.object?["schemaVersion"]?.string, ["1.0.0", "1.1.0"].contains(version) else { throw SpatialImportError.schemaMismatch }
        try ContractValidator(name: version == "1.0.0" ? "geometry" : "geometry-v1.1", budget: budget).validate(value)
        let document: SpatialDocument
        do { document = try JSONDecoder().decode(SpatialDocument.self, from: data) }
        catch { throw SpatialImportError.schemaMismatch }
        try GeometryAdmission.validate(document)
        guard Validator.validate(document).isEmpty else { throw SpatialImportError.invalidGeometry }
        try budget.check()
        return document
    }
}

/// Bounds the existing core's expensive loops before semantic validation or regeneration.
/// Schema per-array maxima alone would allow millions of polygon intersection checks.
enum GeometryAdmission {
    static func validate(_ document: SpatialDocument) throws {
        var work: Int64 = 0
        func charge(_ n: Int64) throws {
            work += n
            if work > SpatialImportLimits.geometryWork { throw SpatialImportError.processingBudgetExceeded }
        }
        for floor in document.floors {
            for area in floor.areas {
                guard area.polygon.count <= 1000 else { throw SpatialImportError.boundsExceeded }
                let count = Int64(area.polygon.count)
                try charge(count * count * count)
            }
            let nodes = Int64(floor.nodes.count), walls = Int64(floor.walls.count), openings = Int64(floor.openings.count)
            try charge(nodes + walls + openings + walls * (nodes + openings))
            let wallMap = Dictionary(floor.walls.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            for group in Dictionary(grouping: floor.openings, by: \.wallID).values {
                let count = Int64(group.count)
                try charge(count * count)
            }
            for room in floor.rooms {
                var vertices: Int64 = 0
                for ref in room.boundary { vertices += Int64(max(0, (wallMap[ref.wallID]?.nodeIDs.count ?? 1) - 1)) }
                // Core's polygon cap is 1000. Reject before constructing million-node rings.
                guard vertices <= 1000 else { throw SpatialImportError.boundsExceeded }
                try charge(nodes + walls + vertices * vertices * vertices)
            }
            for wall in floor.walls {
                let count = Int64(wall.nodeIDs.count)
                let hosted = Int64(floor.openings.filter { $0.wallID == wall.id }.count)
                try charge((count + hosted * 2) * (count + hosted) * 8)
            }
        }
    }
}
