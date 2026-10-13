import Foundation

// Portable, SDK-independent authoring data. Coordinates are internal meters,
// not a promise of surveyed dimensions. Schema 1.0.0 is a developer contract.
public struct Point2: Codable, Equatable, Sendable {
    public var x: Double
    public var z: Double
    public init(x: Double, z: Double) { self.x = x; self.z = z }
    public var finite: Bool { x.isFinite && z.isFinite }
    public func distance(to p: Self) -> Double { hypot(x - p.x, z - p.z) }
}
public struct Point3: Codable, Equatable, Sendable {
    public var x: Double
    public var y: Double
    public var z: Double
    public init(x: Double, y: Double, z: Double) { self.x = x; self.y = y; self.z = z }
}
public enum Origin: String, Codable, Sendable { case captured, edited, inferred, synthetic }
public enum ReviewState: String, Codable, Sendable { case needsReview, reviewed }
public enum Confidence: String, Codable, Sendable { case low, medium, high, unknown }
public enum HeightBasis: String, Codable, Sendable { case captured, assumed, edited, synthetic }
public enum OpeningKind: String, Codable, Sendable { case door, window, passage }

public struct Node: Codable, Equatable, Sendable {
    public var id: String
    public var point: Point2
    public init(id: String, point: Point2) { self.id = id; self.point = point }
}
public struct Provenance: Codable, Equatable, Sendable {
    public var origin: Origin
    public var sourceIDs: [String]
    // Classification confidence is not positional accuracy or completeness.
    public var classificationConfidence: Confidence
    public init(origin: Origin, sourceIDs: [String] = [], classificationConfidence: Confidence = .unknown) {
        self.origin = origin; self.sourceIDs = sourceIDs; self.classificationConfidence = classificationConfidence
    }
}
public struct Wall: Codable, Equatable, Sendable {
    public var id: String
    // Ordered polyline nodes. Curves may be reviewed tessellations; analytic raw
    // capture is retained separately. Never silently square or simplify a curve.
    public var nodeIDs: [String]
    public var baseY: Double
    public var height: Double
    public var heightBasis: HeightBasis
    public var provenance: Provenance
    public init(id: String, nodeIDs: [String], baseY: Double = 0, height: Double,
                heightBasis: HeightBasis, provenance: Provenance) {
        self.id = id; self.nodeIDs = nodeIDs; self.baseY = baseY; self.height = height
        self.heightBasis = heightBasis; self.provenance = provenance
    }
}
public struct Opening: Codable, Equatable, Sendable {
    public var id: String
    public var wallID: String
    public var kind: OpeningKind
    // Offset follows the host wall's path, not an unrelated global axis.
    public var offset: Double
    public var width: Double
    public var bottom: Double
    public var height: Double
    public var provenance: Provenance
    public init(id: String, wallID: String, kind: OpeningKind, offset: Double,
                width: Double, bottom: Double, height: Double, provenance: Provenance) {
        self.id = id; self.wallID = wallID; self.kind = kind; self.offset = offset
        self.width = width; self.bottom = bottom; self.height = height; self.provenance = provenance
    }
}
public struct WallReference: Codable, Equatable, Sendable {
    public var wallID: String
    public var reversed: Bool
    public init(wallID: String, reversed: Bool = false) { self.wallID = wallID; self.reversed = reversed }
}
public struct Room: Codable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var boundary: [WallReference]
    public init(id: String, label: String, boundary: [WallReference]) {
        self.id = id; self.label = label; self.boundary = boundary
    }
}
/// A labeled, nonphysical area. Its boundary never creates a wall or a walkable
/// connection. Polygons may overlap rooms; they do not claim measured quantities.
public struct SemanticArea: Codable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var polygon: [Point2]
    public var provenance: Provenance
    public init(id: String, label: String, polygon: [Point2], provenance: Provenance = .init(origin: .edited)) {
        self.id = id; self.label = label; self.polygon = polygon; self.provenance = provenance
    }
}
public struct Floor: Codable, Equatable, Sendable {
    public var id: String
    public var label: String
    public var elevation: Double
    public var nodes: [Node]
    public var walls: [Wall]
    public var openings: [Opening]
    public var rooms: [Room]
    public var areas: [SemanticArea]
    public init(id: String, label: String, elevation: Double = 0, nodes: [Node],
                walls: [Wall], openings: [Opening], rooms: [Room], areas: [SemanticArea] = []) {
        self.id = id; self.label = label; self.elevation = elevation; self.nodes = nodes
        self.walls = walls; self.openings = openings; self.rooms = rooms; self.areas = areas
    }
    private enum CodingKeys: String, CodingKey { case id, label, elevation, nodes, walls, openings, rooms, areas }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id); label = try c.decode(String.self, forKey: .label)
        elevation = try c.decode(Double.self, forKey: .elevation)
        nodes = try c.decode([Node].self, forKey: .nodes); walls = try c.decode([Wall].self, forKey: .walls)
        openings = try c.decode([Opening].self, forKey: .openings); rooms = try c.decode([Room].self, forKey: .rooms)
        areas = try c.decodeIfPresent([SemanticArea].self, forKey: .areas) ?? []
    }
    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id); try c.encode(label, forKey: .label); try c.encode(elevation, forKey: .elevation)
        try c.encode(nodes, forKey: .nodes); try c.encode(walls, forKey: .walls); try c.encode(openings, forKey: .openings)
        try c.encode(rooms, forKey: .rooms)
        // Original 1.0 documents preserve their original transport shape.
        if !areas.isEmpty { try c.encode(areas, forKey: .areas) }
    }
}
public struct SpatialDocument: Codable, Equatable, Sendable {
    public var schemaVersion: String
    public var documentID: String
    public var revision: Int
    public var parentRevision: Int?
    public var title: String
    public var coordinateSystem: String
    public var measurementStatus: String
    public var reviewState: ReviewState
    public var floors: [Floor]
    public init(documentID: String, title: String, floors: [Floor], revision: Int = 1,
                parentRevision: Int? = nil, reviewState: ReviewState = .needsReview) {
        self.schemaVersion = "1.0.0"; self.documentID = documentID; self.revision = revision
        self.parentRevision = parentRevision; self.title = title
        self.coordinateSystem = "meters_y_up_right_handed"
        self.measurementStatus = "unverified"; self.reviewState = reviewState; self.floors = floors
    }
    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return try encoder.encode(self)
    }
}
public struct ValidationIssue: Codable, Equatable, Sendable {
    public var code: String
    public var path: String
    public var message: String
    public init(_ code: String, _ path: String, _ message: String) {
        self.code = code; self.path = path; self.message = message
    }
}
public enum SpatialError: Error, CustomStringConvertible {
    case invalid([ValidationIssue])
    case missing(String)
    case staleRevision(expected: Int, actual: Int)
    case nothingToUndo
    case nothingToRedo
    case tooLarge
    case triangulationFailed
    public var description: String {
        switch self {
        case .invalid(let issues): return issues.map { "\($0.path): \($0.code) - \($0.message)" }.joined(separator: "\n")
        case .missing(let id): return "Missing object: \(id)"
        case .staleRevision(let expected, let actual): return "Stale revision: expected \(expected), actual \(actual)"
        case .nothingToUndo: return "Nothing to undo"
        case .nothingToRedo: return "Nothing to redo"
        case .tooLarge: return "Input exceeds the configured safety envelope"
        case .triangulationFailed: return "Floor polygon cannot be triangulated safely"
        }
    }
}
