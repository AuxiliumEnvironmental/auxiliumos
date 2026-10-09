import Foundation
import SpatialCore

/// A bounded geometry JSON reader. It is not a ZIP/SVG importer.
/// Duplicate keys include equivalent escaped keys, which Foundation alone accepts.
public enum SpatialDocumentReader {
    public static func decode(_ data: Data, maximumBytes: Int = 16 * 1024 * 1024) throws -> SpatialDocument {
        guard !data.isEmpty, maximumBytes > 0, data.count <= maximumBytes, data.count <= 64 * 1024 * 1024 else { throw StoreError.sizeLimit }
        var scanner = JSONSafetyScanner(data)
        try scanner.validate()
        do {
            let object = try JSONSerialization.jsonObject(with: data)
            try checkShape(object)
            let document = try JSONDecoder().decode(SpatialDocument.self, from: data)
            try Validator.requireValid(document)
            return document
        } catch let error as SpatialError { throw error }
        catch { throw StoreError.invalidJSON }
    }

    private static func object(_ value: Any, keys: Set<String>) throws -> [String: Any] {
        guard let result = value as? [String: Any], Set(result.keys).isSubset(of: keys) else { throw StoreError.invalidJSON }
        return result
    }
    private static func array(_ value: Any?, maximum: Int) throws -> [Any] {
        guard let result = value as? [Any], result.count <= maximum else { throw StoreError.invalidJSON }
        return result
    }
    private static func provenance(_ value: Any?) throws {
        guard let value else { throw StoreError.invalidJSON }
        let p = try object(value, keys: ["origin", "sourceIDs", "classificationConfidence"])
        _ = try array(p["sourceIDs"], maximum: 1000)
    }
    private static func checkShape(_ value: Any) throws {
        let root = try object(value, keys: ["schemaVersion","documentID","revision","parentRevision","title","coordinateSystem","measurementStatus","reviewState","floors"])
        guard let version = root["schemaVersion"] as? String, ["1.0.0", "1.1.0"].contains(version) else { throw StoreError.invalidJSON }
        for value in try array(root["floors"], maximum: 100) {
            var floorKeys: Set<String> = ["id","label","elevation","nodes","walls","openings","rooms"]
            if version == "1.1.0" { floorKeys.insert("areas") }
            let floor = try object(value, keys: floorKeys)
            for value in try array(floor["nodes"], maximum: 100000) {
                let node = try object(value, keys: ["id","point"])
                guard let point = node["point"] else { throw StoreError.invalidJSON }
                _ = try object(point, keys: ["x","z"])
            }
            for value in try array(floor["walls"], maximum: 50000) {
                let wall = try object(value, keys: ["id","nodeIDs","baseY","height","heightBasis","provenance"])
                _ = try array(wall["nodeIDs"], maximum: 1000)
                try provenance(wall["provenance"])
            }
            for value in try array(floor["openings"], maximum: 10000) {
                let opening = try object(value, keys: ["id","wallID","kind","offset","width","bottom","height","provenance"])
                try provenance(opening["provenance"])
            }
            for value in try array(floor["rooms"], maximum: 10000) {
                let room = try object(value, keys: ["id","label","boundary"])
                for value in try array(room["boundary"], maximum: 1000) {
                    _ = try object(value, keys: ["wallID","reversed"])
                }
            }
            if let values = floor["areas"] {
                for value in try array(values, maximum: 1000) {
                    let area = try object(value, keys: ["id","label","polygon","provenance"])
                    let points = try array(area["polygon"], maximum: 1000)
                    guard points.count >= 3 else { throw StoreError.invalidJSON }
                    for point in points { _ = try object(point, keys: ["x","z"]) }
                    try provenance(area["provenance"])
                }
            }
        }
    }
}

struct JSONSafetyScanner {
    private let bytes: [UInt8]
    private var index = 0
    private var values = 0
    init(_ data: Data) { bytes = Array(data) }
    mutating func validate() throws {
        try value(depth: 0)
        whitespace()
        guard index == bytes.count else { throw StoreError.invalidJSON }
    }
    private mutating func whitespace() {
        while index < bytes.count && [9,10,13,32].contains(bytes[index]) { index += 1 }
    }
    private mutating func take(_ byte: UInt8) -> Bool {
        whitespace()
        guard index < bytes.count, bytes[index] == byte else { return false }
        index += 1
        return true
    }
    private mutating func value(depth: Int) throws {
        guard depth <= 32, values < 1_000_000 else { throw StoreError.invalidJSON }
        values += 1; whitespace()
        guard index < bytes.count else { throw StoreError.invalidJSON }
        switch bytes[index] {
        case 123: // object
            index += 1
            var keys = Set<String>()
            if take(125) { return }
            while true {
                whitespace()
                let key = try string()
                guard keys.insert(key).inserted, keys.count <= 1000, take(58) else { throw StoreError.invalidJSON }
                try value(depth: depth+1)
                if take(125) { return }
                guard take(44) else { throw StoreError.invalidJSON }
            }
        case 91: // array
            index += 1
            if take(93) { return }
            var count = 0
            while true {
                count += 1
                guard count <= 100000 else { throw StoreError.invalidJSON }
                try value(depth: depth+1)
                if take(93) { return }
                guard take(44) else { throw StoreError.invalidJSON }
            }
        case 34: _ = try string()
        case 116: try literal("true")
        case 102: try literal("false")
        case 110: try literal("null")
        default:
            let start = index
            while index < bytes.count && ![9,10,13,32,44,93,125].contains(bytes[index]) { index += 1 }
            guard index > start, index-start <= 128,
                  let text = String(bytes: bytes[start..<index], encoding: .utf8),
                  let number = Double(text), number.isFinite else { throw StoreError.invalidJSON }
            // JSONDecoder subsequently rejects non-JSON numeric spelling, e.g. +1 or 01.
        }
    }
    private mutating func literal(_ text: String) throws {
        let expected = Array(text.utf8)
        guard index + expected.count <= bytes.count, Array(bytes[index..<(index+expected.count)]) == expected else { throw StoreError.invalidJSON }
        index += expected.count
    }
    private mutating func string() throws -> String {
        guard index < bytes.count, bytes[index] == 34 else { throw StoreError.invalidJSON }
        let start = index
        index += 1
        while index < bytes.count {
            guard index-start <= 16384, bytes[index] >= 32 else { throw StoreError.invalidJSON }
            if bytes[index] == 34 {
                index += 1
                guard let value = try? JSONDecoder().decode(String.self, from: Data(bytes[start..<index])) else { throw StoreError.invalidJSON }
                return value
            }
            if bytes[index] == 92 {
                index += 1
                guard index < bytes.count else { throw StoreError.invalidJSON }
            }
            index += 1
        }
        throw StoreError.invalidJSON
    }
}
