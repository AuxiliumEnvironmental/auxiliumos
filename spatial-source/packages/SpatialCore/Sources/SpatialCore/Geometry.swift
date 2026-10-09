import Foundation

public enum Geometry {
    public static let epsilon = 0.000001
    public static func cross(_ a: Point2, _ b: Point2, _ c: Point2) -> Double {
        (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)
    }
    public static func signedArea(_ points: [Point2]) -> Double {
        guard points.count >= 3 else { return 0 }
        return points.indices.reduce(0.0) { r, i in
            let q = points[(i + 1) % points.count]
            return r + points[i].x * q.z - q.x * points[i].z
        } / 2
    }
    public static func onSegment(_ p: Point2, _ a: Point2, _ b: Point2) -> Bool {
        abs(cross(a, b, p)) <= epsilon &&
        p.x >= min(a.x, b.x) - epsilon && p.x <= max(a.x, b.x) + epsilon &&
        p.z >= min(a.z, b.z) - epsilon && p.z <= max(a.z, b.z) + epsilon
    }
    public static func intersects(_ a: Point2, _ b: Point2, _ c: Point2, _ d: Point2) -> Bool {
        let abC = cross(a,b,c), abD = cross(a,b,d), cdA = cross(c,d,a), cdB = cross(c,d,b)
        if ((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
           ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon)) { return true }
        return onSegment(c,a,b) || onSegment(d,a,b) || onSegment(a,c,d) || onSegment(b,c,d)
    }
    /// An open wall path must not cross, double back, or touch itself. A node
    /// graph can share an endpoint across distinct walls, but one polyline may
    /// not use geometry as an implicit unrepresented junction.
    public static func isSimplePath(_ p: [Point2]) -> Bool {
        guard p.count >= 2, p.allSatisfy({ $0.finite }) else { return false }
        for i in 0..<(p.count - 1) {
            if p[i].distance(to: p[i + 1]) <= epsilon { return false }
            if i > 0 && abs(cross(p[i - 1], p[i], p[i + 1])) <= epsilon {
                let dot = (p[i - 1].x - p[i].x)*(p[i + 1].x - p[i].x) +
                          (p[i - 1].z - p[i].z)*(p[i + 1].z - p[i].z)
                if dot > epsilon { return false }
            }
            if i + 2 < p.count - 1 {
                for j in (i + 2)..<(p.count - 1) {
                    if intersects(p[i], p[i + 1], p[j], p[j + 1]) { return false }
                }
            }
        }
        return true
    }
    public static func isSimplePolygon(_ p: [Point2]) -> Bool {
        guard p.count >= 3, p.allSatisfy({ $0.finite }), abs(signedArea(p)) > epsilon else { return false }
        for i in p.indices {
            let i2 = (i + 1) % p.count
            if p[i].distance(to: p[i2]) < epsilon { return false }
            let prev = p[(i + p.count - 1) % p.count]
            if abs(cross(prev,p[i],p[i2])) <= epsilon {
                let dot = (prev.x-p[i].x)*(p[i2].x-p[i].x)+(prev.z-p[i].z)*(p[i2].z-p[i].z)
                if dot > epsilon { return false } // adjacent edges backtrack
            }
            for j in p.indices where j > i {
                let j2 = (j + 1) % p.count
                if i2 == j || j2 == i { continue }
                if intersects(p[i],p[i2],p[j],p[j2]) { return false }
            }
        }
        return true
    }
    public static func path(wall: Wall, floor: Floor) throws -> [Point2] {
        try FloorGeometryIndex(floor).path(wall: wall)
    }
    public static func pathLength(_ p: [Point2]) -> Double {
        guard p.count >= 2 else { return 0 }
        return (1..<p.count).reduce(0) { $0 + p[$1-1].distance(to: p[$1]) }
    }
    public static func point(at offset: Double, on path: [Point2]) throws -> Point2 {
        guard path.count >= 2, offset.isFinite else { throw SpatialError.missing("valid path") }
        let total = pathLength(path)
        guard offset >= -epsilon, offset <= total + epsilon else { throw SpatialError.missing("path offset") }
        var remaining = max(0, min(total, offset))
        for i in 1..<path.count {
            let a = path[i-1], b = path[i], length = a.distance(to: b)
            guard length > epsilon else { continue }
            if remaining <= length + epsilon {
                let t = max(0, min(1, remaining / length))
                return Point2(x: a.x+(b.x-a.x)*t, z: a.z+(b.z-a.z)*t)
            }
            remaining -= length
        }
        return path.last!
    }
    public static func boundary(room: Room, floor: Floor) throws -> [Point2] {
        try FloorGeometryIndex(floor).boundary(room: room)
    }
    // Ear clipping for bounded simple polygons. No holes or inferred closure.
    // Returns indices into the original input. Rejects invalid geometry.
    public static func triangulate(_ points: [Point2]) throws -> [[Int]] {
        guard points.count <= 1000 else { throw SpatialError.tooLarge }
        guard isSimplePolygon(points) else { throw SpatialError.triangulationFailed }
        var ring = signedArea(points) > 0 ? Array(points.indices) : Array(points.indices.reversed())
        var triangles: [[Int]] = []
        // Remove collinear middle vertices only from the render index ring.
        var changed = true
        while changed && ring.count > 3 {
            changed = false
            for i in ring.indices {
                let a = ring[(i+ring.count-1)%ring.count], b = ring[i], c = ring[(i+1)%ring.count]
                if abs(cross(points[a],points[b],points[c])) <= epsilon {
                    ring.remove(at: i); changed = true; break
                }
            }
        }
        while ring.count > 3 {
            var found = false
            for i in ring.indices {
                let a = ring[(i+ring.count-1)%ring.count], b = ring[i], c = ring[(i+1)%ring.count]
                if cross(points[a],points[b],points[c]) <= epsilon { continue }
                let occupied = ring.contains { j in
                    if j == a || j == b || j == c { return false }
                    return cross(points[a],points[b],points[j]) >= -epsilon &&
                           cross(points[b],points[c],points[j]) >= -epsilon &&
                           cross(points[c],points[a],points[j]) >= -epsilon
                }
                if occupied { continue }
                triangles.append([a,b,c]); ring.remove(at: i); found = true; break
            }
            guard found else { throw SpatialError.triangulationFailed }
        }
        triangles.append(ring)
        return triangles
    }
    public static func contains(_ point: Point2, polygon: [Point2]) -> Bool {
        guard polygon.count >= 3 else { return false }
        var inside = false
        for i in polygon.indices {
            let a = polygon[i], b = polygon[(i+1)%polygon.count]
            if onSegment(point,a,b) { return true }
            if (a.z > point.z) != (b.z > point.z) {
                let x = (b.x-a.x)*(point.z-a.z)/(b.z-a.z)+a.x
                if point.x < x { inside.toggle() }
            }
        }
        return inside
    }
}
