import Foundation

public enum SVGExporter {
    public static func escape(_ text: String) -> String {
        text.replacingOccurrences(of:"&",with:"&amp;").replacingOccurrences(of:"<",with:"&lt;")
            .replacingOccurrences(of:">",with:"&gt;").replacingOccurrences(of:"\"",with:"&quot;")
            .replacingOccurrences(of:"'",with:"&apos;")
    }
    public static func render(document: SpatialDocument, floorID: String) throws -> String {
        try Validator.requireValid(document)
        guard let floor = document.floors.first(where: { $0.id == floorID }), !floor.nodes.isEmpty || !floor.areas.isEmpty else {
            throw SpatialError.missing(floorID)
        }
        let all = floor.nodes.map(\.point) + floor.areas.flatMap(\.polygon)
        let index = FloorGeometryIndex(floor)
        let openingsByWall = Dictionary(grouping: floor.openings, by: \.wallID)
        let minX = all.map(\.x).min()!, maxX = all.map(\.x).max()!
        let minZ = all.map(\.z).min()!, maxZ = all.map(\.z).max()!
        let size = max(maxX-minX,maxZ-minZ,1), margin = size*0.07, stroke = size*0.003
        func n(_ x: Double) -> String { String(format:"%.6f",locale:Locale(identifier:"en_US_POSIX"),x) }
        var result = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"\(n(minX-margin)) \(n(minZ-margin)) \(n(maxX-minX+2*margin)) \(n(maxZ-minZ+2*margin))\" role=\"img\">\n"
        result += "<title>\(escape(document.title)) - \(escape(floor.label))</title>\n"
        result += "<desc>Diagrammatic layout. Measurements unverified. Revision \(document.revision).</desc>\n"
        result += "<rect x=\"\(n(minX-margin))\" y=\"\(n(minZ-margin))\" width=\"\(n(maxX-minX+2*margin))\" height=\"\(n(maxZ-minZ+2*margin))\" fill=\"white\"/>\n"
        for room in floor.rooms {
            let polygon = try index.boundary(room: room)
            result += "<polygon points=\"\(polygon.map { n($0.x)+","+n($0.z) }.joined(separator:" "))\" fill=\"#EDF5FC\"/>\n"
        }
        func line(_ a: Point2, _ b: Point2, _ color: String, _ width: Double) -> String {
            "<line x1=\"\(n(a.x))\" y1=\"\(n(a.z))\" x2=\"\(n(b.x))\" y2=\"\(n(b.z))\" stroke=\"\(color)\" stroke-width=\"\(n(width))\" stroke-linecap=\"round\"/>\n"
        }
        for wall in floor.walls {
            let path = try index.path(wall: wall)
            var breaks = [0.0]
            for i in 1..<path.count { breaks.append(breaks.last!+path[i-1].distance(to:path[i])) }
            let openings = openingsByWall[wall.id, default: []]
            breaks += openings.flatMap { [$0.offset,$0.offset+$0.width] }
            breaks = Array(Set(breaks)).sorted()
            for i in 1..<breaks.count {
                let lo=breaks[i-1], hi=breaks[i], mid=(lo+hi)/2
                let hole = openings.first { mid > $0.offset && mid < $0.offset+$0.width }
                let a=try Geometry.point(at:lo,on:path), b=try Geometry.point(at:hi,on:path)
                if let hole = hole {
                    if hole.kind == .window { result += line(a,b,"#2563A6",stroke*0.65) }
                } else { result += line(a,b,"#17283D",stroke) }
            }
        }
        for room in floor.rooms {
            let p = try index.boundary(room: room)
            let triangles = try Geometry.triangulate(p)
            // Label inside the largest triangle, not outside a concave room.
            let t = triangles.max { abs(Geometry.cross(p[$0[0]],p[$0[1]],p[$0[2]])) < abs(Geometry.cross(p[$1[0]],p[$1[1]],p[$1[2]])) }!
            let x=(p[t[0]].x+p[t[1]].x+p[t[2]].x)/3, z=(p[t[0]].z+p[t[1]].z+p[t[2]].z)/3
            result += "<text x=\"\(n(x))\" y=\"\(n(z))\" text-anchor=\"middle\" font-family=\"system-ui,sans-serif\" font-size=\"\(n(size*0.024))\" fill=\"#17283D\">\(escape(room.label))</text>\n"
        }
        for area in floor.areas {
            // Short separated segments make a nonphysical boundary distinct
            // without expanding the tightly constrained SVG vocabulary.
            for i in area.polygon.indices {
                let a = area.polygon[i], b = area.polygon[(i+1) % area.polygon.count]
                let steps = max(1, min(1000, Int(ceil(a.distance(to: b) / (size * 0.012)))))
                for step in 0..<steps where step % 2 == 0 {
                    let lo = Double(step)/Double(steps), hi = Double(step+1)/Double(steps)
                    result += line(.init(x:a.x+(b.x-a.x)*lo,z:a.z+(b.z-a.z)*lo),.init(x:a.x+(b.x-a.x)*hi,z:a.z+(b.z-a.z)*hi),"#2563A6",stroke*0.7)
                }
            }
            let p = area.polygon, triangles = try Geometry.triangulate(p)
            if let t = triangles.max(by: { abs(Geometry.cross(p[$0[0]],p[$0[1]],p[$0[2]])) < abs(Geometry.cross(p[$1[0]],p[$1[1]],p[$1[2]])) }) {
                let x=(p[t[0]].x+p[t[1]].x+p[t[2]].x)/3, z=(p[t[0]].z+p[t[1]].z+p[t[2]].z)/3
                result += "<text x=\"\(n(x))\" y=\"\(n(z))\" text-anchor=\"middle\" font-family=\"system-ui,sans-serif\" font-size=\"\(n(size*0.024))\" fill=\"#2563A6\">Area: \(escape(area.label))</text>\n"
            }
        }
        return result+"</svg>\n"
    }
}
