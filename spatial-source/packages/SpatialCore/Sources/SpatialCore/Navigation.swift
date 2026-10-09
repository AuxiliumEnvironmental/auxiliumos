import Foundation

/// Display-only navigation settings. These values are not clearance, egress,
/// accessibility, surveyed-size, or physical-person fit assertions.
public struct WalkSettings: Equatable, Sendable {
    public var radius: Double
    public var eyeHeight: Double
    public var headClearance: Double
    public var maximumMove: Double
    public init(radius: Double = 0.18, eyeHeight: Double = 1.6,
                headClearance: Double = 0.15, maximumMove: Double = 32) {
        self.radius = radius; self.eyeHeight = eyeHeight
        self.headClearance = headClearance; self.maximumMove = maximumMove
    }
}

public struct WalkPosition: Equatable, Sendable {
    public let documentID: String
    public let revision: Int
    public let floorID: String
    public let roomID: String
    public let point: Point2
    public let eyeY: Double
}

public struct WalkPortal: Equatable, Sendable {
    public let openingID: String
    public let wallID: String
    public let roomIDs: [String]
    public let a: Point2
    public let b: Point2
}

public struct WalkRestriction: Equatable, Sendable {
    public let openingID: String
    public let reason: String
}

public enum WalkStop: String, Equatable, Sendable {
    case wall, unknownBoundary, ambiguousRooms, invalidTarget, requestTooLong
}

public struct WalkMove: Equatable, Sendable {
    public let position: WalkPosition
    public let requested: Point2
    public let reachedTarget: Bool
    public let stop: WalkStop?
    public let blockingObjectID: String?
    public let crossedPortalIDs: [String]
}

public enum WalkError: Error, Equatable, CustomStringConvertible {
    case invalidSettings, capacity, noWalkableRoom(String), unsafePlacement, stalePosition
    public var description: String {
        switch self {
        case .invalidSettings: return "Invalid display navigation settings."
        case .capacity: return "This layout exceeds the bounded navigation work limit."
        case .noWalkableRoom(let room): return "No safe modeled starting position was found in room \(room)."
        case .unsafePlacement: return "Choose a clear position inside one modeled room."
        case .stalePosition: return "The floor or geometry revision changed. Choose a new starting room."
        }
    }
}

/// An immutable, revision-bound collision view of the canonical floor. It never
/// infers connections from visual proximity, creates a hull, or edits geometry.
/// A portal needs a floor-level door/passage on ONE straight wall segment shared
/// by exactly two explicitly bounded rooms, with verified opposite interior sides.
/// Windows, outside doors, unreviewed inferred openings and ambiguous topology block.
public struct WalkNavigation: Sendable {
    public let documentID: String
    public let revision: Int
    public let floorID: String
    public let elevation: Double
    public let settings: WalkSettings
    public let portals: [WalkPortal]
    public let restrictions: [WalkRestriction]
    public let roomIDs: [String]
    private struct RoomRegion: Sendable {
        let id: String; let polygon: [Point2]
        let minX: Double; let maxX: Double; let minZ: Double; let maxZ: Double
        init(id: String, polygon: [Point2]) {
            self.id = id; self.polygon = polygon
            minX = polygon.map(\.x).min() ?? 0; maxX = polygon.map(\.x).max() ?? 0
            minZ = polygon.map(\.z).min() ?? 0; maxZ = polygon.map(\.z).max() ?? 0
        }
        func contains(_ point: Point2) -> Bool {
            // Exact broad-phase rejection only. The canonical polygon remains
            // authoritative; this box never supplies walkable area or closure.
            point.x > minX && point.x < maxX && point.z > minZ && point.z < maxZ &&
                WalkNavigation.strictlyContains(point, polygon)
        }
    }
    private struct Barrier: Sendable { let id: String; let a: Point2; let b: Point2 }
    private let regions: [RoomRegion]
    private let barriers: [Barrier]

    public init(document: SpatialDocument, floorID: String, settings: WalkSettings = .init()) throws {
        guard settings.radius.isFinite, (0.05...0.5).contains(settings.radius),
              settings.eyeHeight.isFinite, (0.5...2.5).contains(settings.eyeHeight),
              settings.headClearance.isFinite, (0...0.5).contains(settings.headClearance),
              settings.maximumMove.isFinite, (0.1...100).contains(settings.maximumMove) else { throw WalkError.invalidSettings }
        try Validator.requireValid(document)
        guard let floor = document.floors.first(where: { $0.id == floorID }) else { throw SpatialError.missing(floorID) }
        // Work safety limits, not reduced acceptance/performance targets. The
        // 10x proposed stress profile fits; unusually large paths fail explicitly.
        guard floor.rooms.count <= 1_000, floor.walls.count <= 10_000,
              floor.walls.reduce(0, { $0 + $1.nodeIDs.count - 1 }) <= 20_000,
              floor.rooms.reduce(0, { $0 + $1.boundary.count }) <= 20_000 else { throw WalkError.capacity }
        self.documentID = document.documentID; self.revision = document.revision
        self.floorID = floorID; self.elevation = floor.elevation; self.settings = settings
        let index = FloorGeometryIndex(floor)
        let regions = try floor.rooms.map { RoomRegion(id: $0.id, polygon: try index.boundary(room: $0)) }
        self.regions = regions; self.roomIDs = regions.map(\.id)
        let roomByID = Dictionary(uniqueKeysWithValues: regions.map { ($0.id, $0) })
        var refs: [String: [String]] = [:]
        for room in floor.rooms { for ref in room.boundary { refs[ref.wallID, default: []].append(room.id) } }
        let openingsByWall = Dictionary(grouping: floor.openings, by: \.wallID)
        var portals: [WalkPortal] = [], barriers: [Barrier] = [], restrictions: [WalkRestriction] = []
        for wall in floor.walls {
            let path = try index.path(wall: wall)
            var offsets = [0.0]
            for i in 1..<path.count { offsets.append(offsets.last! + path[i - 1].distance(to: path[i])) }
            var accepted: [(opening: Opening, segment: Int)] = []
            for opening in openingsByWall[wall.id, default: []] {
                var reason: String?
                let adjacent = refs[wall.id, default: []]
                let segment = (0..<(path.count - 1)).first {
                    opening.offset >= offsets[$0] - Geometry.epsilon &&
                    opening.offset + opening.width <= offsets[$0 + 1] + Geometry.epsilon
                }
                if opening.kind == .window { reason = "Windows are not walk portals." }
                else if adjacent.count != 2 { reason = "The opening does not connect two explicitly modeled rooms." }
                else if opening.provenance.origin == .inferred { reason = "Inferred openings require explicit correction before navigation." }
                else if abs(wall.baseY + opening.bottom) > Geometry.epsilon ||
                            wall.baseY + opening.bottom + opening.height < settings.eyeHeight + settings.headClearance {
                    reason = "The display body does not fit a floor-level opening."
                } else if opening.width <= settings.radius * 2 + Geometry.epsilon {
                    reason = "The opening is too narrow for the display collision radius."
                } else if segment == nil { reason = "An opening across a wall bend needs explicit review." }
                if reason == nil, let segment, let first = roomByID[adjacent[0]], let second = roomByID[adjacent[1]] {
                    let a = try Geometry.point(at: opening.offset, on: path)
                    let b = try Geometry.point(at: opening.offset + opening.width, on: path)
                    let length = a.distance(to: b)
                    let normal = Point2(x: -(b.z - a.z) / length, z: (b.x - a.x) / length)
                    // Probe near both jambs and center, farther than the collision
                    // radius. A shared ID alone does not justify a geometric join.
                    let inward = settings.radius + 0.001
                    let samples = [settings.radius / length, 0.5, 1 - settings.radius / length]
                    var side: Bool?
                    let compatible = samples.allSatisfy { t in
                        let mid = Self.interpolate(a, b, t)
                        let left = Point2(x: mid.x + normal.x * inward, z: mid.z + normal.z * inward)
                        let right = Point2(x: mid.x - normal.x * inward, z: mid.z - normal.z * inward)
                        let firstLeft = first.contains(left) && second.contains(right)
                        let firstRight = first.contains(right) && second.contains(left)
                        guard firstLeft != firstRight,
                              regions.filter({ $0.contains(left) }).count == 1,
                              regions.filter({ $0.contains(right) }).count == 1 else { return false }
                        if let side { return side == firstLeft }; side = firstLeft; return true
                    }
                    if compatible {
                        accepted.append((opening, segment))
                        portals.append(.init(openingID: opening.id, wallID: wall.id, roomIDs: adjacent.sorted(), a: a, b: b))
                    } else { reason = "The rooms do not have unambiguous opposite interiors at this opening." }
                }
                if let reason { restrictions.append(.init(openingID: opening.id, reason: reason)) }
            }
            for i in 0..<(path.count - 1) {
                var cursor = offsets[i]
                for item in accepted.filter({ $0.segment == i }).sorted(by: { $0.opening.offset < $1.opening.offset }) {
                    if item.opening.offset > cursor + Geometry.epsilon {
                        barriers.append(.init(id: wall.id, a: try Geometry.point(at: cursor, on: path),
                                              b: try Geometry.point(at: item.opening.offset, on: path)))
                    }
                    cursor = max(cursor, item.opening.offset + item.opening.width)
                }
                if cursor < offsets[i + 1] - Geometry.epsilon {
                    barriers.append(.init(id: wall.id, a: try Geometry.point(at: cursor, on: path), b: path[i + 1]))
                }
            }
        }
        self.portals = portals.sorted { $0.openingID < $1.openingID }
        self.restrictions = restrictions.sorted { $0.openingID < $1.openingID }
        self.barriers = barriers
    }

    /// Explicit room jumps are placements, not motion or proof of a portal.
    /// The caller must name their destination visibly and make them user-driven.
    public func place(at point: Point2) throws -> WalkPosition {
        guard point.finite, let room = uniqueRoom(at: point) else { throw WalkError.unsafePlacement }
        return try place(inRoom: room, at: point)
    }

    public func place(inRoom roomID: String, at point: Point2? = nil) throws -> WalkPosition {
        guard let region = regions.first(where: { $0.id == roomID }) else { throw WalkError.noWalkableRoom(roomID) }
        if let point {
            guard point.finite, uniqueRoom(at: point) == roomID, clearance(at: point) >= settings.radius + 0.000001 else { throw WalkError.unsafePlacement }
            return position(point, room: roomID)
        }
        let p = region.polygon, triangles = try Geometry.triangulate(p)
        var candidates: [Point2] = []
        let area = Geometry.signedArea(p)
        var cx = 0.0, cz = 0.0
        for i in p.indices {
            let a = p[i], b = p[(i + 1) % p.count], cross = a.x * b.z - b.x * a.z
            cx += (a.x + b.x) * cross; cz += (a.z + b.z) * cross
        }
        candidates.append(.init(x: cx / (6 * area), z: cz / (6 * area)))
        for t in triangles {
            let a = p[t[0]], b = p[t[1]], c = p[t[2]]
            let la = b.distance(to: c), lb = a.distance(to: c), lc = a.distance(to: b), sum = la + lb + lc
            candidates.append(.init(x: (la * a.x + lb * b.x + lc * c.x) / sum, z: (la * a.z + lb * b.z + lc * c.z) / sum))
            candidates.append(.init(x: (a.x + b.x + c.x) / 3, z: (a.z + b.z + c.z) / 3))
        }
        let safe = candidates.filter { uniqueRoom(at: $0) == roomID }.map { ($0, clearance(at: $0)) }
            .filter { $0.1 >= settings.radius + 0.000001 }.max { $0.1 < $1.1 }
        guard let safe else { throw WalkError.noWalkableRoom(roomID) }
        return position(safe.0, room: roomID)
    }

    /// Continuous circle-versus-segment sweep. It cannot tunnel through thin
    /// walls even when one tap requests a long move. Movement stops just before
    /// collision; it never slides, reroutes or teleports without a user action.
    public func move(from start: WalkPosition, toward target: Point2) throws -> WalkMove {
        guard start.documentID == documentID, start.revision == revision, start.floorID == floorID,
              start.eyeY == elevation + settings.eyeHeight else { throw WalkError.stalePosition }
        guard start.point.finite, room(at: start.point, preferred: start.roomID) == start.roomID,
              clearance(at: start.point) >= settings.radius - 0.0000001 else { throw WalkError.unsafePlacement }
        func unchanged(_ reason: WalkStop) -> WalkMove {
            .init(position: start, requested: target, reachedTarget: false, stop: reason, blockingObjectID: nil, crossedPortalIDs: [])
        }
        guard target.finite else { return unchanged(.invalidTarget) }
        let distance = start.point.distance(to: target)
        guard distance <= settings.maximumMove else { return unchanged(.requestTooLong) }
        guard distance > Geometry.epsilon else {
            return .init(position: start, requested: target, reachedTarget: true, stop: nil, blockingObjectID: nil, crossedPortalIDs: [])
        }
        var limit = 1.0, stop: WalkStop?, blocking: String?
        for barrier in barriers {
            if let t = Self.capsuleEntry(from: start.point, to: target, a: barrier.a, b: barrier.b, radius: settings.radius), t < limit {
                limit = t; stop = .wall; blocking = barrier.id
            }
        }
        // Exact boundary events partition the path. Midpoint classification of
        // each interval catches unknown or overlapping room interiors without a
        // step-size tolerance that could jump a tiny gap.
        var events = [0.0, 1.0]
        for region in regions {
            for i in region.polygon.indices {
                events += Self.intersectionTimes(start.point, target, region.polygon[i], region.polygon[(i + 1) % region.polygon.count])
            }
        }
        events = Array(Set(events)).sorted()
        for i in 1..<events.count where events[i] - events[i - 1] > 1e-12 {
            let t = events[i - 1]
            if t >= limit { break }
            let mid = Self.interpolate(start.point, target, (t + events[i]) / 2)
            let inside = regions.filter { $0.contains(mid) }
            if inside.count != 1 {
                // Travel along the interior of an accepted portal is permitted;
                // every other ambiguous/on-boundary interval is conservative.
                let alongPortal = inside.isEmpty && portals.contains { Geometry.onSegment(mid, $0.a, $0.b) }
                if !alongPortal { limit = t; stop = inside.count > 1 ? .ambiguousRooms : .unknownBoundary; blocking = nil; break }
            }
        }
        let reached = stop == nil
        let safeT = reached ? 1 : max(0, limit - 0.00001 / distance)
        let end = Self.interpolate(start.point, target, safeT)
        guard let endRoom = room(at: end, preferred: start.roomID) else { return unchanged(.unknownBoundary) }
        let crossed = portals.filter { portal in
            Self.intersectionTimes(start.point, end, portal.a, portal.b).contains { $0 >= 0 && $0 <= 1 }
        }.map(\.openingID)
        return .init(position: position(end, room: endRoom), requested: target, reachedTarget: reached,
                     stop: stop, blockingObjectID: blocking, crossedPortalIDs: crossed)
    }

    private func position(_ point: Point2, room: String) -> WalkPosition {
        .init(documentID: documentID, revision: revision, floorID: floorID, roomID: room,
              point: point, eyeY: elevation + settings.eyeHeight)
    }
    private func uniqueRoom(at point: Point2) -> String? {
        let matches = regions.filter { $0.contains(point) }
        return matches.count == 1 ? matches[0].id : nil
    }
    private func room(at point: Point2, preferred: String) -> String? {
        if let unique = uniqueRoom(at: point) { return unique }
        if portals.contains(where: { $0.roomIDs.contains(preferred) && Geometry.onSegment(point, $0.a, $0.b) }) { return preferred }
        return nil
    }
    private func clearance(at point: Point2) -> Double {
        barriers.reduce(Double.infinity) { min($0, Self.distance(point, $1.a, $1.b)) }
    }
    private static func strictlyContains(_ point: Point2, _ polygon: [Point2]) -> Bool {
        Geometry.contains(point, polygon: polygon) && !polygon.indices.contains {
            Geometry.onSegment(point, polygon[$0], polygon[($0 + 1) % polygon.count])
        }
    }
    private static func interpolate(_ a: Point2, _ b: Point2, _ t: Double) -> Point2 {
        .init(x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t)
    }
    private static func distance(_ p: Point2, _ a: Point2, _ b: Point2) -> Double {
        let dx = b.x - a.x, dz = b.z - a.z, square = dx * dx + dz * dz
        let t = max(0, min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / square))
        return p.distance(to: interpolate(a, b, t))
    }
    private static func capsuleEntry(from: Point2, to: Point2, a: Point2, b: Point2, radius: Double) -> Double? {
        let vx = to.x - from.x, vz = to.z - from.z
        if max(from.x, to.x) < min(a.x, b.x) - radius || min(from.x, to.x) > max(a.x, b.x) + radius ||
            max(from.z, to.z) < min(a.z, b.z) - radius || min(from.z, to.z) > max(a.z, b.z) + radius { return nil }
        let length = a.distance(to: b), ux = (b.x - a.x) / length, uz = (b.z - a.z) / length
        let nx = -uz, nz = ux, initial = (from.x - a.x) * nx + (from.z - a.z) * nz, speed = vx * nx + vz * nz
        var times: [Double] = []
        if abs(speed) > 1e-12 {
            for sign in [-1.0, 1.0] where speed * sign < 0 {
                let t = (sign * radius - initial) / speed
                if t >= -1e-12 && t <= 1 {
                    let p = interpolate(from, to, max(0, t)), u = (p.x - a.x) * ux + (p.z - a.z) * uz
                    if u >= 0 && u <= length { times.append(max(0, t)) }
                }
            }
        }
        let speed2 = vx * vx + vz * vz
        for endpoint in [a, b] {
            let px = from.x - endpoint.x, pz = from.z - endpoint.z
            let q = px * vx + pz * vz, c = px * px + pz * pz - radius * radius, discriminant = q * q - speed2 * c
            if discriminant > 1e-14 {
                let t = (-q - sqrt(discriminant)) / speed2
                if t >= -1e-12 && t <= 1 { times.append(max(0, t)) }
            }
        }
        return times.min()
    }
    private static func intersectionTimes(_ a: Point2, _ b: Point2, _ c: Point2, _ d: Point2) -> [Double] {
        let rx = b.x - a.x, rz = b.z - a.z, sx = d.x - c.x, sz = d.z - c.z
        let denominator = rx * sz - rz * sx, qx = c.x - a.x, qz = c.z - a.z
        if abs(denominator) > 1e-12 {
            let t = (qx * sz - qz * sx) / denominator, u = (qx * rz - qz * rx) / denominator
            return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t] : []
        }
        guard abs(qx * rz - qz * rx) <= 1e-12 else { return [] }
        let square = rx * rx + rz * rz
        guard square > 0 else { return [] }
        return [((c.x - a.x) * rx + (c.z - a.z) * rz) / square,
                ((d.x - a.x) * rx + (d.z - a.z) * rz) / square].filter { $0 >= 0 && $0 <= 1 }
    }
}
