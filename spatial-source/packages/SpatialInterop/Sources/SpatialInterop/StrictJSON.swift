import Foundation

indirect enum JSONValue: Equatable {
    case object([String: JSONValue]), array([JSONValue]), string(String)
    case number(Double), boolean(Bool), null
    var object: [String: JSONValue]? { if case .object(let v) = self { return v }; return nil }
    var array: [JSONValue]? { if case .array(let v) = self { return v }; return nil }
    var string: String? { if case .string(let v) = self { return v }; return nil }
    var number: Double? { if case .number(let v) = self { return v }; return nil }
}

/// Decode independently before Codable. JSONDecoder alone silently discards duplicate keys
/// and unknown fields. This parser fails on both lexical abuse and unbounded structures.
struct StrictJSON {
    private let bytes: [UInt8]
    private let budget: ImportBudget
    private var index = 0
    private var values = 0
    private let decoder = JSONDecoder()
    init(_ data: Data, budget: ImportBudget) throws {
        guard !data.isEmpty, data.count <= SpatialImportLimits.memberBytes else {
            throw SpatialImportError.boundsExceeded
        }
        guard String(data: data, encoding: .utf8) != nil else { throw SpatialImportError.malformedJSON }
        bytes = Array(data); self.budget = budget
    }
    mutating func parse() throws -> JSONValue {
        let value = try parseValue(depth: 0)
        whitespace()
        guard index == bytes.count else { throw SpatialImportError.malformedJSON }
        try budget.check()
        return value
    }
    private mutating func whitespace() {
        while index < bytes.count, [9, 10, 13, 32].contains(bytes[index]) { index += 1 }
    }
    private mutating func consume(_ byte: UInt8) -> Bool {
        guard index < bytes.count, bytes[index] == byte else { return false }
        index += 1; return true
    }
    private mutating func parseValue(depth: Int) throws -> JSONValue {
        values += 1
        guard depth <= SpatialImportLimits.jsonDepth, values <= SpatialImportLimits.jsonValues else {
            throw SpatialImportError.boundsExceeded
        }
        if values % 1024 == 0 { try budget.check() }
        whitespace()
        guard index < bytes.count else { throw SpatialImportError.malformedJSON }
        switch bytes[index] {
        case 123:
            index += 1; whitespace()
            var result: [String: JSONValue] = [:]
            if consume(125) { return .object(result) }
            while true {
                whitespace()
                let key = try parseString()
                guard result[key] == nil else { throw SpatialImportError.duplicateJSONKey }
                whitespace()
                guard consume(58) else { throw SpatialImportError.malformedJSON }
                result[key] = try parseValue(depth: depth + 1)
                whitespace()
                if consume(125) { return .object(result) }
                guard consume(44) else { throw SpatialImportError.malformedJSON }
            }
        case 91:
            index += 1; whitespace()
            var result: [JSONValue] = []
            if consume(93) { return .array(result) }
            while true {
                result.append(try parseValue(depth: depth + 1))
                whitespace()
                if consume(93) { return .array(result) }
                guard consume(44) else { throw SpatialImportError.malformedJSON }
            }
        case 34: return .string(try parseString())
        case 116: try literal("true"); return .boolean(true)
        case 102: try literal("false"); return .boolean(false)
        case 110: try literal("null"); return .null
        default: return .number(try parseNumber())
        }
    }
    private mutating func literal(_ value: String) throws {
        for byte in value.utf8 {
            guard consume(byte) else { throw SpatialImportError.malformedJSON }
        }
    }
    private mutating func parseString() throws -> String {
        let start = index
        guard consume(34) else { throw SpatialImportError.malformedJSON }
        while index < bytes.count {
            let byte = bytes[index]; index += 1
            guard index - start <= SpatialImportLimits.stringBytes else { throw SpatialImportError.boundsExceeded }
            if byte == 34 {
                do { return try decoder.decode(String.self, from: Data(bytes[start..<index])) }
                catch { throw SpatialImportError.malformedJSON }
            }
            guard byte >= 32 else { throw SpatialImportError.malformedJSON }
            if byte == 92 {
                guard index < bytes.count else { throw SpatialImportError.malformedJSON }
                index += 1 // Decoder validates escape grammar and surrogate pairs.
            }
        }
        throw SpatialImportError.malformedJSON
    }
    private mutating func parseNumber() throws -> Double {
        let start = index
        _ = consume(45)
        guard index < bytes.count else { throw SpatialImportError.malformedJSON }
        if consume(48) {
            if index < bytes.count, (48...57).contains(bytes[index]) { throw SpatialImportError.malformedJSON }
        } else {
            guard index < bytes.count, (49...57).contains(bytes[index]) else { throw SpatialImportError.malformedJSON }
            while index < bytes.count, (48...57).contains(bytes[index]) { index += 1 }
        }
        if consume(46) {
            let digitStart = index
            while index < bytes.count, (48...57).contains(bytes[index]) { index += 1 }
            guard index > digitStart else { throw SpatialImportError.malformedJSON }
        }
        if index < bytes.count, bytes[index] == 101 || bytes[index] == 69 {
            index += 1
            if index < bytes.count, bytes[index] == 43 || bytes[index] == 45 { index += 1 }
            let digitStart = index
            while index < bytes.count, (48...57).contains(bytes[index]) { index += 1 }
            guard index > digitStart else { throw SpatialImportError.malformedJSON }
        }
        guard index - start <= 128,
              let value = Double(String(decoding: bytes[start..<index], as: UTF8.self)), value.isFinite else {
            throw SpatialImportError.malformedJSON
        }
        return value
    }
}
