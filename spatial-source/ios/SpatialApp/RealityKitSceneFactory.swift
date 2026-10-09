// Native renderer implementation. Requires Apple SDK compilation and physical
// device visual/performance acceptance; portable mesh tests do not provide it.
import Foundation
import UIKit
import RealityKit
import simd
import SpatialCore

@MainActor
public enum RealityKitSceneFactory {
    public static func material(role: String, darkMode: Bool) -> UnlitMaterial {
        let color: UIColor
        switch role {
        case "floor": color = darkMode ? .init(red: 0.07, green: 0.13, blue: 0.19, alpha: 1) : .init(red: 0.94, green: 0.97, blue: 1, alpha: 1)
        case "wall": color = darkMode ? .init(red: 0.17, green: 0.22, blue: 0.28, alpha: 1) : .white
        case "ceiling": color = darkMode ? .init(white: 0.13, alpha: 1) : .init(white: 0.92, alpha: 1)
        case "windowEdge": color = darkMode ? .init(red: 0.45, green: 0.75, blue: 1, alpha: 1) : .systemBlue
        case "areaEdge": color = darkMode ? .systemOrange : .init(red: 0.60, green: 0.29, blue: 0.02, alpha: 1)
        default: color = darkMode ? .init(red: 0.81, green: 0.90, blue: 0.98, alpha: 1) : .init(red: 0.09, green: 0.16, blue: 0.24, alpha: 1)
        }
        var material = UnlitMaterial(color: color)
        if #available(iOS 18.0, *) { material.faceCulling = .none }
        return material
    }
    public static func make(_ scene: GraphicScene, lineWidth: Float = 0.012, ceilings: [SceneFace] = []) throws -> Entity {
        guard lineWidth.isFinite, (0.001...0.1).contains(lineWidth), scene.faces.count + ceilings.count <= 100_000,
              scene.edges.count <= 200_000 else { throw SpatialError.tooLarge }
        // Resource admission happens before allocating RealityKit resources. This
        // is a safety ceiling, not a claim that these counts meet frame budgets.
        var vertices = (scene.faces + ceilings).reduce(0) { $0 + $1.vertices.count }
        guard vertices <= 2_000_000, scene.faces.count + ceilings.count + scene.edges.count <= 100_000 else { throw SpatialError.tooLarge }
        for edge in scene.edges {
            guard [edge.a.x, edge.a.y, edge.a.z, edge.b.x, edge.b.y, edge.b.z].allSatisfy({ $0.isFinite && abs($0) <= 10_000 }) else { throw SpatialError.tooLarge }
            let dx = edge.b.x - edge.a.x, dy = edge.b.y - edge.a.y, dz = edge.b.z - edge.a.z
            let length = sqrt(dx * dx + dy * dy + dz * dz)
            guard length.isFinite else { throw SpatialError.tooLarge }
            vertices += edge.role == "area" ? 8 * min(200, max(1, Int(min(200, ceil(length / 0.24))))) : 24
            guard vertices <= 2_000_000 else { throw SpatialError.tooLarge }
        }
        let root = Entity()
        root.name = "spatial-revision-\(scene.revision)"
        func vector(_ p: Point3) -> SIMD3<Float> { .init(Float(p.x),Float(p.y),Float(p.z)) }
        for face in scene.faces + ceilings {
            guard face.vertices.count <= 1_000, face.triangles.count <= 2_000,
                  face.vertices.allSatisfy({ [$0.x, $0.y, $0.z].allSatisfy { $0.isFinite && abs($0) <= 10_000 } }),
                  face.triangles.allSatisfy({ $0.count == 3 && $0.allSatisfy({ $0 >= 0 && $0 < face.vertices.count }) }) else {
                throw SpatialError.invalid([.init("mesh", "scene", "Invalid render geometry")])
            }
            var descriptor = MeshDescriptor(name:face.objectID)
            descriptor.positions = .init(face.vertices.map(vector))
            var triangles = face.triangles.flatMap { $0.map(UInt32.init) }
            if #available(iOS 18.0, *) {
                // Material culling below makes these canonical faces two-sided.
            } else {
                // iOS 17 has no UnlitMaterial.faceCulling. Reverse each triangle
                // for the back side without adding planes, filling cutouts or
                // changing the canonical graph. Default back-face culling keeps
                // only one winding visible from either viewing direction.
                triangles += face.triangles.flatMap { [UInt32($0[0]), UInt32($0[2]), UInt32($0[1])] }
            }
            descriptor.primitives = .triangles(triangles)
            let mesh = try MeshResource.generate(from:[descriptor])
            let material = Self.material(role: face.role, darkMode: false)
            let entity = ModelEntity(mesh:mesh,materials:[material])
            entity.name = "\(face.role):\(face.objectID)"
            entity.isEnabled = face.role != "ceiling"
            // Picking and walking use canonical geometry. Avoid convex physics
            // approximations, especially for concave floor faces.
            root.addChild(entity)
        }
        // Baseline edge geometry. Replace individual boxes with measured batching
        // when profiling requires it. Do not expose triangle-edge wireframes.
        for edge in scene.edges {
            let a=vector(edge.a), b=vector(edge.b), delta=b-a, length=simd_length(delta)
            guard length > 0.00001 else { continue }
            let color: UIColor = edge.role == "window" ? .systemBlue : (edge.role == "area" ? .systemOrange : UIColor(red:0.09,green:0.16,blue:0.24,alpha:1))
            let mesh: MeshResource
            if edge.role == "area" {
                // Dashed semantic outlines cannot be mistaken for solid physical
                // walls. Batch all dashes of an edge into ONE mesh/entity.
                let count = max(1, Int(min(200, ceil(length / 0.24))))
                let stride = length / Float(count), half = lineWidth / 2
                var positions: [SIMD3<Float>] = [], indices: [UInt32] = []
                let box: [UInt32] = [0,2,1,1,2,3,4,5,6,5,7,6,0,1,4,1,5,4,2,6,3,3,6,7,0,4,2,2,4,6,1,3,5,3,7,5]
                for index in 0..<count {
                    let start = Float(index) * stride - length / 2, end = min(length / 2, start + stride * 0.6)
                    let offset = UInt32(positions.count)
                    positions += [.init(-half,start,-half), .init(half,start,-half), .init(-half,end,-half), .init(half,end,-half),
                                  .init(-half,start,half), .init(half,start,half), .init(-half,end,half), .init(half,end,half)]
                    indices += box.map { offset + $0 }
                }
                var descriptor = MeshDescriptor(name: edge.objectID + "-semantic-dashes")
                descriptor.positions = .init(positions); descriptor.primitives = .triangles(indices)
                mesh = try MeshResource.generate(from: [descriptor])
            } else { mesh = MeshResource.generateBox(size: SIMD3<Float>(lineWidth, length, lineWidth)) }
            let entity = ModelEntity(mesh: mesh, materials: [UnlitMaterial(color: color)])
            entity.position = (a + b) / 2
            entity.orientation = simd_quatf(from: SIMD3<Float>(0, 1, 0), to: delta / length)
            entity.name = "edge:\(edge.objectID)"; root.addChild(entity)
        }
        return root
    }

    /// IDs may contain colons. Split only the role delimiter, never the object ID.
    public static func identity(of entity: Entity) -> (role: String, objectID: String)? {
        guard let index = entity.name.firstIndex(of: ":") else { return nil }
        return (String(entity.name[..<index]), String(entity.name[entity.name.index(after: index)...]))
    }
}
