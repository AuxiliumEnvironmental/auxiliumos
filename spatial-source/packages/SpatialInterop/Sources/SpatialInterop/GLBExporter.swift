import Foundation
import SpatialCore

/// A separate, self-contained GLB 2.0 derivative of canonical geometry. No textures,
/// images, external URIs, furniture, custom SLAM, or raw capture objects are embedded.
public enum GLBExporter {
    public static func export(document: SpatialDocument, floorID: String) throws -> Data {
        let scene = try ExportPreparation.prepare(document: document, floorID: floorID).scene
        guard !scene.faces.isEmpty || !scene.edges.isEmpty else { throw SpatialExportError.emptyScene }
        var builder = Builder(document: document, floorID: floorID)
        let faceGroups = Dictionary(grouping: scene.faces) { Key(id: $0.objectID, role: $0.role) }
        for key in faceGroups.keys.sorted() {
            try builder.addFaces(faceGroups[key]!, key: key)
        }
        let edgeGroups = Dictionary(grouping: scene.edges) { Key(id: $0.objectID, role: $0.role) }
        for key in edgeGroups.keys.sorted() {
            try builder.addEdges(edgeGroups[key]!, key: key)
        }
        return try builder.finish()
    }
    private struct Key: Hashable, Comparable {
        let id: String, role: String
        static func < (a: Self, b: Self) -> Bool { a.role == b.role ? a.id < b.id : a.role < b.role }
    }
    private struct Builder {
        let document: SpatialDocument
        let floorID: String
        var binary = Data()
        var accessors: [[String: Any]] = []
        var views: [[String: Any]] = []
        var meshes: [[String: Any]] = []
        var nodes: [[String: Any]] = []

        mutating func addFaces(_ faces: [SceneFace], key: Key) throws {
            let count = faces.reduce(0) { $0 + $1.triangles.count * 3 }
            guard count > 0, binary.count + count * 28 <= SpatialImportLimits.totalBytes else { throw SpatialExportError.exceedsSafetyBounds }
            var positions: [Float] = [], normals: [Float] = [], indices: [UInt32] = []
            positions.reserveCapacity(count * 3); normals.reserveCapacity(count * 3); indices.reserveCapacity(count)
            for face in faces {
                for triangle in face.triangles {
                    guard triangle.count == 3, triangle.allSatisfy({ $0 >= 0 && $0 < face.vertices.count }) else { throw SpatialExportError.invalidGeometry }
                    let points = triangle.map { face.vertices[$0] }
                    let vectors = points.map { SIMD3<Float>(Float($0.x), Float($0.y), Float($0.z)) }
                    let a = vectors[1] - vectors[0], b = vectors[2] - vectors[0]
                    let cross = SIMD3<Float>(a.y*b.z-a.z*b.y, a.z*b.x-a.x*b.z, a.x*b.y-a.y*b.x)
                    let length = sqrt(cross.x*cross.x + cross.y*cross.y + cross.z*cross.z)
                    guard length.isFinite, length > 0 else { throw SpatialExportError.precisionLoss }
                    let normal = cross / length
                    for vector in vectors {
                        guard [vector.x, vector.y, vector.z].allSatisfy(\.isFinite) else { throw SpatialExportError.invalidGeometry }
                        indices.append(UInt32(indices.count)); positions += [vector.x, vector.y, vector.z]
                        normals += [normal.x, normal.y, normal.z]
                    }
                }
            }
            let position = try floatAccessor(positions, bounds: true)
            let normal = try floatAccessor(normals, bounds: false)
            let index = try indexAccessor(indices)
            addPrimitive(["attributes": ["POSITION": position, "NORMAL": normal], "indices": index,
                          "mode": 4, "material": key.role == "floor" ? 1 : 0], key: key, representation: "faces")
        }
        mutating func addEdges(_ edges: [SceneEdge], key: Key) throws {
            guard binary.count + edges.count * 24 <= SpatialImportLimits.totalBytes else { throw SpatialExportError.exceedsSafetyBounds }
            var values: [Float] = []; values.reserveCapacity(edges.count * 6)
            for edge in edges {
                let a = [Float(edge.a.x), Float(edge.a.y), Float(edge.a.z)]
                let b = [Float(edge.b.x), Float(edge.b.y), Float(edge.b.z)]
                guard a != b else { throw SpatialExportError.precisionLoss }
                values += a; values += b
            }
            let position = try floatAccessor(values, bounds: true)
            addPrimitive(["attributes": ["POSITION": position], "mode": 1, "material": key.role == "window" ? 3 : 2],
                         key: key, representation: "semantic-edges")
        }
        mutating func addPrimitive(_ primitive: [String: Any], key: Key, representation: String) {
            let extras: [String: Any] = ["objectID": key.id, "role": key.role, "representation": representation]
            let index = meshes.count
            meshes.append(["primitives": [primitive], "extras": extras])
            nodes.append(["mesh": index, "extras": extras])
        }
        mutating func floatAccessor(_ values: [Float], bounds: Bool) throws -> Int {
            guard !values.isEmpty, values.count % 3 == 0, values.allSatisfy(\.isFinite),
                  binary.count + values.count * 4 <= SpatialImportLimits.totalBytes else { throw SpatialExportError.exceedsSafetyBounds }
            let offset = binary.count
            for value in values { binary.appendLE(value.bitPattern) }
            let view = views.count
            views.append(["buffer": 0, "byteOffset": offset, "byteLength": values.count * 4, "target": 34962])
            var accessor: [String: Any] = ["bufferView": view, "byteOffset": 0, "componentType": 5126,
                                          "count": values.count / 3, "type": "VEC3"]
            if bounds {
                var lower = [Double](repeating: .infinity, count: 3), upper = [Double](repeating: -.infinity, count: 3)
                for (i, value) in values.enumerated() { lower[i%3] = min(lower[i%3], Double(value)); upper[i%3] = max(upper[i%3], Double(value)) }
                accessor["min"] = lower; accessor["max"] = upper
            }
            accessors.append(accessor); return accessors.count - 1
        }
        mutating func indexAccessor(_ values: [UInt32]) throws -> Int {
            guard !values.isEmpty, binary.count + values.count * 4 <= SpatialImportLimits.totalBytes else { throw SpatialExportError.exceedsSafetyBounds }
            let offset = binary.count
            for value in values { binary.appendLE(value) }
            let view = views.count
            views.append(["buffer": 0, "byteOffset": offset, "byteLength": values.count * 4, "target": 34963])
            accessors.append(["bufferView": view, "byteOffset": 0, "componentType": 5125, "count": values.count,
                              "type": "SCALAR", "min": [0], "max": [values.count-1]])
            return accessors.count - 1
        }
        mutating func finish() throws -> Data {
            func material(_ color: [Double], translucent: Bool = false) -> [String: Any] {
                ["doubleSided": true, "alphaMode": translucent ? "BLEND" : "OPAQUE",
                 "pbrMetallicRoughness": ["baseColorFactor": color, "metallicFactor": 0, "roughnessFactor": 1]]
            }
            let extras: [String: Any] = ["documentID": document.documentID, "revision": document.revision,
                "floorID": floorID, "geometrySchemaVersion": document.schemaVersion,
                "coordinateSystem": document.coordinateSystem, "measurementStatus": "unverified"]
            let object: [String: Any] = [
                "asset": ["version": "2.0", "generator": "Auxilium Spatial GLB 1.0.0", "extras": extras],
                "scene": 0, "scenes": [["nodes": Array(nodes.indices), "extras": extras]],
                "nodes": nodes, "meshes": meshes, "accessors": accessors, "bufferViews": views,
                "buffers": [["byteLength": binary.count]],
                "materials": [material([0.66,0.81,0.91,0.24], translucent: true), material([0.82,0.90,0.96,0.18], translucent: true),
                              material([0.025,0.045,0.075,1]), material([0.14,0.48,0.75,1])]
            ]
            var json = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys, .withoutEscapingSlashes])
            while json.count % 4 != 0 { json.append(0x20) }
            while binary.count % 4 != 0 { binary.append(0) }
            let total = 12 + 8 + json.count + 8 + binary.count
            guard total <= SpatialImportLimits.totalBytes else { throw SpatialExportError.exceedsSafetyBounds }
            var glb = Data(); glb.reserveCapacity(total)
            glb.appendLE(0x46546c67 as UInt32); glb.appendLE(2 as UInt32); glb.appendLE(UInt32(total))
            glb.appendLE(UInt32(json.count)); glb.appendLE(0x4e4f534a as UInt32); glb.append(json)
            glb.appendLE(UInt32(binary.count)); glb.appendLE(0x004e4942 as UInt32); glb.append(binary)
            return glb
        }
    }
}
