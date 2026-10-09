import Foundation

/// Per-operation immutable lookup, never another geometry authority or a cache
/// spanning document revisions. This is NOT a validator or an import boundary;
/// use Validator.requireValid(document) before presenting untrusted geometry.
/// Validation still owns duplicate-ID rejection.
/// Keeping first occurrences here matches Geometry's historical diagnostic path
/// so malformed graphs throw/report instead of trapping during validation.
public struct FloorGeometryIndex: Sendable {
    let nodes: [String: Point2]
    let walls: [String: Wall]
    public init(_ floor: Floor) {
        nodes = Dictionary(floor.nodes.map { ($0.id, $0.point) }, uniquingKeysWith: { first, _ in first })
        walls = Dictionary(floor.walls.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
    }
    public func path(wall: Wall) throws -> [Point2] {
        try wall.nodeIDs.map { id in
            guard let point = nodes[id] else { throw SpatialError.missing(id) }
            return point
        }
    }
    public func boundary(room: Room) throws -> [Point2] {
        var sequence: [String] = []
        for ref in room.boundary {
            guard let wall = walls[ref.wallID] else { throw SpatialError.missing(ref.wallID) }
            let ids = ref.reversed ? Array(wall.nodeIDs.reversed()) : wall.nodeIDs
            guard ids.count >= 2 else { throw SpatialError.missing("wall path") }
            if let previous = sequence.last {
                guard previous == ids.first else { throw SpatialError.missing("connected boundary") }
                sequence.append(contentsOf: ids.dropFirst())
            } else { sequence.append(contentsOf: ids) }
        }
        guard sequence.count >= 4, sequence.first == sequence.last else { throw SpatialError.missing("closed boundary") }
        sequence.removeLast()
        return try sequence.map { id in
            guard let point = nodes[id] else { throw SpatialError.missing(id) }
            return point
        }
    }
}
