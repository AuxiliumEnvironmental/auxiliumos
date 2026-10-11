import Foundation

public struct CutawayResult: Equatable, Sendable {
    public let hiddenWallIDs: Set<String>
    public let hiddenCeilingRoomIDs: Set<String>
    public let explanation: String
    public init(hiddenWallIDs: Set<String>, hiddenCeilingRoomIDs: Set<String>, explanation: String) {
        self.hiddenWallIDs = hiddenWallIDs; self.hiddenCeilingRoomIDs = hiddenCeilingRoomIDs; self.explanation = explanation
    }
}

/// View-dependent presentation only. The canonical graph, scene meshes and
/// exports remain untouched. Rays test ACTUAL triangles, so a ray through a door
/// or window void does not incorrectly identify a solid occluder there.
public enum CutawayVisibility {
    public static func evaluate(scene: GraphicScene, camera: Point3, focus: Point3,
                                probeRadius: Double = 0.45,
                                ceilings: [SceneFace] = []) -> CutawayResult {
        guard finite(camera), finite(focus), probeRadius.isFinite, (0...5).contains(probeRadius) else {
            return .init(hiddenWallIDs: [], hiddenCeilingRoomIDs: [], explanation: "Cutaway unavailable for this viewpoint.")
        }
        let probes = [focus,
                      Point3(x: focus.x + probeRadius, y: focus.y, z: focus.z),
                      Point3(x: focus.x - probeRadius, y: focus.y, z: focus.z),
                      Point3(x: focus.x, y: focus.y, z: focus.z + probeRadius),
                      Point3(x: focus.x, y: focus.y, z: focus.z - probeRadius)]
        var walls: Set<String> = [], rooms: Set<String> = []
        for face in scene.faces + ceilings where face.role == "wall" || face.role == "ceiling" {
            // Face admission remains bounded even if a caller bypasses SceneBuilder.
            guard face.vertices.count <= 1_000, face.triangles.count <= 2_000,
                  face.vertices.allSatisfy(finite) else { continue }
            let occludes = face.triangles.contains { triangle in
                guard triangle.count == 3, triangle.allSatisfy({ $0 >= 0 && $0 < face.vertices.count }) else { return false }
                return probes.contains { probe in
                    hits(from: camera, to: probe, a: face.vertices[triangle[0]], b: face.vertices[triangle[1]], c: face.vertices[triangle[2]])
                }
            }
            if occludes { if face.role == "wall" { walls.insert(face.objectID) } else { rooms.insert(face.objectID) } }
        }
        let count = walls.count
        let message = count == 0 && rooms.isEmpty ? "Cutaway: no surfaces obstruct this viewpoint." :
            "Cutaway hides \(count) near wall\(count == 1 ? "" : "s") and \(rooms.count) display ceiling\(rooms.count == 1 ? "" : "s"). Wall and opening outlines remain."
        return .init(hiddenWallIDs: walls, hiddenCeilingRoomIDs: rooms, explanation: message)
    }
    private static func finite(_ p: Point3) -> Bool { p.x.isFinite && p.y.isFinite && p.z.isFinite }
    private static func minus(_ a: Point3, _ b: Point3) -> Point3 { .init(x: a.x - b.x, y: a.y - b.y, z: a.z - b.z) }
    private static func cross(_ a: Point3, _ b: Point3) -> Point3 {
        .init(x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x)
    }
    private static func dot(_ a: Point3, _ b: Point3) -> Double { a.x * b.x + a.y * b.y + a.z * b.z }
    private static func hits(from origin: Point3, to target: Point3, a: Point3, b: Point3, c: Point3) -> Bool {
        guard let t = segmentHit(from: origin, to: target, a: a, b: b, c: c) else { return false }
        return t > 0.000001 && t < 0.999999
    }
    fileprivate static func segmentHit(from origin: Point3, to target: Point3, a: Point3, b: Point3, c: Point3) -> Double? {
        let direction = minus(target, origin), e1 = minus(b, a), e2 = minus(c, a), h = cross(direction, e2), determinant = dot(e1, h)
        guard abs(determinant) > 1e-10 else { return nil }
        let inv = 1 / determinant, s = minus(origin, a), u = dot(s, h) * inv
        guard u >= -1e-9 && u <= 1 + 1e-9 else { return nil }
        let q = cross(s, e1), v = dot(direction, q) * inv
        guard v >= -1e-9 && u + v <= 1 + 1e-9 else { return nil }
        let t = dot(e2, q) * inv
        return t > 0 && t <= 1 ? t : nil
    }
}

public struct SceneRayHit: Equatable, Sendable {
    public let objectID: String
    public let role: String
    public let distance: Double
    public let point: Point3
}

/// Picks the actual canonical triangles, not a convex collision approximation.
/// This preserves open door/window voids and concave floor outlines for selection.
public enum SceneRayPicker {
    public static func nearest(scene: GraphicScene, origin: Point3, direction: Point3, maximumDistance: Double = 2_000,
                               hiddenWalls: Set<String> = [], ceilings: [SceneFace] = [], hiddenCeilings: Set<String> = []) -> SceneRayHit? {
        guard [origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, maximumDistance].allSatisfy(\.isFinite),
              maximumDistance > 0, maximumDistance <= 30_000, scene.faces.count + ceilings.count <= 100_000 else { return nil }
        let length = sqrt(direction.x * direction.x + direction.y * direction.y + direction.z * direction.z)
        guard length.isFinite, length > 1e-12 else { return nil }
        let end = Point3(x: origin.x + direction.x / length * maximumDistance,
                         y: origin.y + direction.y / length * maximumDistance,
                         z: origin.z + direction.z / length * maximumDistance)
        var best: SceneRayHit?
        for face in scene.faces + ceilings {
            if face.role == "wall" && hiddenWalls.contains(face.objectID) { continue }
            if face.role == "ceiling" && hiddenCeilings.contains(face.objectID) { continue }
            guard face.vertices.count <= 1_000, face.triangles.count <= 2_000 else { continue }
            for triangle in face.triangles {
                guard triangle.count == 3, triangle.allSatisfy({ $0 >= 0 && $0 < face.vertices.count }),
                      let t = CutawayVisibility.segmentHit(from: origin, to: end, a: face.vertices[triangle[0]], b: face.vertices[triangle[1]], c: face.vertices[triangle[2]]) else { continue }
                let distance = t * maximumDistance
                if best == nil || distance < best!.distance {
                    best = .init(objectID: face.objectID, role: face.role, distance: distance,
                                 point: .init(x: origin.x + (end.x - origin.x) * t,
                                              y: origin.y + (end.y - origin.y) * t,
                                              z: origin.z + (end.z - origin.z) * t))
                }
            }
        }
        return best
    }
}

/// Optional display ceilings derive only from consistently level adjoining wall
/// tops. They are labeled assumed display surfaces, not captured/verified planes.
/// Rooms with different top heights are explicitly omitted, never flattened.
public enum DisplayCeilings {
    public static func build(document: SpatialDocument, floorID: String) throws -> [SceneFace] {
        try Validator.requireValid(document)
        guard let floor = document.floors.first(where: { $0.id == floorID }) else { throw SpatialError.missing(floorID) }
        let index = FloorGeometryIndex(floor)
        let walls = Dictionary(uniqueKeysWithValues: floor.walls.map { ($0.id, $0) })
        return try floor.rooms.compactMap { room in
            let tops = room.boundary.compactMap { walls[$0.wallID] }.map { floor.elevation + $0.baseY + $0.height }
            guard let first = tops.first, tops.allSatisfy({ abs($0 - first) <= Geometry.epsilon }) else { return nil }
            let ring = try index.boundary(room: room)
            return SceneFace(objectID: room.id, role: "ceiling", vertices: ring.map { .init(x: $0.x, y: first, z: $0.z) },
                             triangles: try Geometry.triangulate(ring))
        }
    }
}
