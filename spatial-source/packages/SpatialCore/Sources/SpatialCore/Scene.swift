import Foundation

public struct SceneFace: Codable, Equatable, Sendable {
    public var objectID: String
    public var role: String
    public var vertices: [Point3]
    public var triangles: [[Int]]
}
public struct SceneEdge: Codable, Equatable, Sendable {
    public var objectID: String
    public var role: String
    public var a: Point3
    public var b: Point3
}
public struct GraphicScene: Codable, Equatable, Sendable {
    public var schemaVersion: String = "1.0.0"
    public var documentID: String
    public var revision: Int
    public var floorID: String
    public var faces: [SceneFace]
    public var edges: [SceneEdge]
}

public enum SceneBuilder {
    public static func build(document: SpatialDocument, floorID: String) throws -> GraphicScene {
        try Validator.requireValid(document)
        guard let floor = document.floors.first(where: { $0.id == floorID }) else { throw SpatialError.missing(floorID) }
        let index = FloorGeometryIndex(floor)
        let openingsByWall = Dictionary(grouping: floor.openings, by: \.wallID)
        var scene = GraphicScene(documentID: document.documentID,revision: document.revision,floorID: floorID,faces: [],edges: [])
        for wall in floor.walls {
            let path = try index.path(wall: wall)
            var breaks = [0.0]
            for i in 1..<path.count { breaks.append(breaks.last!+path[i-1].distance(to:path[i])) }
            let total = breaks.last!
            let openings = openingsByWall[wall.id, default: []]
            breaks += openings.flatMap { [$0.offset,$0.offset+$0.width] }
            breaks = Array(Set(breaks)).sorted()
            let base = floor.elevation+wall.baseY
            func point(_ s: Double, _ y: Double) throws -> Point3 {
                let p = try Geometry.point(at:s,on:path)
                return Point3(x:p.x,y:base+y,z:p.z)
            }
            func edge(_ a: Double, _ ay: Double, _ b: Double, _ by: Double, _ id: String, _ role: String) throws {
                if abs(a-b)+abs(ay-by) <= Geometry.epsilon { return }
                scene.edges.append(SceneEdge(objectID:id,role:role,a:try point(a,ay),b:try point(b,by)))
            }
            func remainingY(_ holes: [Opening]) -> [(Double,Double)] {
                let sorted = holes.sorted { $0.bottom < $1.bottom }
                var cursor = 0.0, spans: [(Double,Double)] = []
                for h in sorted {
                    if h.bottom > cursor+Geometry.epsilon { spans.append((cursor,h.bottom)) }
                    cursor = max(cursor,h.bottom+h.height)
                }
                if cursor < wall.height-Geometry.epsilon { spans.append((cursor,wall.height)) }
                return spans
            }
            for i in 1..<breaks.count {
                let lo = breaks[i-1], hi = breaks[i], mid = (lo+hi)/2
                if hi-lo <= Geometry.epsilon { continue }
                let holes = openings.filter { mid > $0.offset && mid < $0.offset+$0.width }
                for (bottom,top) in remainingY(holes) {
                    scene.faces.append(SceneFace(objectID:wall.id,role:"wall",vertices:[
                        try point(lo,bottom),try point(hi,bottom),try point(hi,top),try point(lo,top)
                    ],triangles:[[0,1,2],[0,2,3]]))
                }
                // Semantic edges, not triangle edges or rectangular tessellation seams.
                if !holes.contains(where: { $0.bottom <= Geometry.epsilon }) { try edge(lo,0,hi,0,wall.id,"wall") }
                if !holes.contains(where: { $0.bottom+$0.height >= wall.height-Geometry.epsilon }) { try edge(lo,wall.height,hi,wall.height,wall.id,"wall") }
            }
            for end in [0.0,total] {
                let holes = openings.filter { end >= $0.offset-Geometry.epsilon && end <= $0.offset+$0.width+Geometry.epsilon }
                for (bottom,top) in remainingY(holes) { try edge(end,bottom,end,top,wall.id,"wall") }
            }
            for opening in openings {
                let lo = opening.offset, hi = lo+opening.width
                let role = opening.kind.rawValue
                // Side edges and split horizontal boundaries follow polyline bends.
                try edge(lo,opening.bottom,lo,opening.bottom+opening.height,opening.id,role)
                try edge(hi,opening.bottom,hi,opening.bottom+opening.height,opening.id,role)
                let spans = [lo]+breaks.filter { $0 > lo && $0 < hi }+[hi]
                for i in 1..<spans.count {
                    try edge(spans[i-1],opening.bottom,spans[i],opening.bottom,opening.id,role)
                    try edge(spans[i-1],opening.bottom+opening.height,spans[i],opening.bottom+opening.height,opening.id,role)
                }
            }
        }
        for room in floor.rooms {
            let ring = try index.boundary(room: room)
            let triangles = try Geometry.triangulate(ring).map { Array($0.reversed()) } // +Y floor normals
            scene.faces.append(SceneFace(objectID:room.id,role:"floor",
                vertices:ring.map { Point3(x:$0.x,y:floor.elevation,z:$0.z) },triangles:triangles))
        }
        if !floor.areas.isEmpty {
            scene.schemaVersion = "1.1.0"
            for area in floor.areas {
                for i in area.polygon.indices {
                    let a = area.polygon[i], b = area.polygon[(i + 1) % area.polygon.count]
                    scene.edges.append(.init(objectID: area.id, role: "area",
                        a: .init(x: a.x, y: floor.elevation, z: a.z), b: .init(x: b.x, y: floor.elevation, z: b.z)))
                }
            }
        }
        return scene
    }
}
