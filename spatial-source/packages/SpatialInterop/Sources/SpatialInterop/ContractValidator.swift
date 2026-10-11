import Foundation

/// Implements only the keywords present in the pinned local contracts. Contract resources
/// are copies of contracts/*.schema.json, checked for byte equality by repository tests.
struct ContractValidator {
    private let root: JSONValue
    private let budget: ImportBudget
    init(name: String, budget: ImportBudget) throws {
        guard let url = Bundle.module.url(forResource: name, withExtension: "schema.json") else {
            throw SpatialImportError.schemaMismatch
        }
        var parser = try StrictJSON(Data(contentsOf: url), budget: budget)
        root = try parser.parse(); self.budget = budget
    }
    func validate(_ value: JSONValue) throws { try validate(value, schema: root) }
    private func validate(_ value: JSONValue, schema: JSONValue) throws {
        try budget.check()
        guard let rules = schema.object else { throw SpatialImportError.schemaMismatch }
        if let ref = rules["$ref"]?.string {
            guard ref.hasPrefix("#/$defs/"), let target = root.object?["$defs"]?.object?[String(ref.dropFirst(8))] else {
                throw SpatialImportError.schemaMismatch
            }
            try validate(value, schema: target); return
        }
        if let expected = rules["const"], value != expected { throw SpatialImportError.schemaMismatch }
        if let options = rules["enum"]?.array, !options.contains(value) { throw SpatialImportError.schemaMismatch }
        if let type = rules["type"] {
            let types = type.array?.compactMap(\.string) ?? [type.string].compactMap { $0 }
            guard types.contains(where: { matches(value, type: $0) }) else { throw SpatialImportError.schemaMismatch }
        }
        switch value {
        case .object(let object):
            let properties = rules["properties"]?.object ?? [:]
            let required = rules["required"]?.array?.compactMap(\.string) ?? []
            guard required.allSatisfy({ object[$0] != nil }) else { throw SpatialImportError.schemaMismatch }
            if rules["additionalProperties"] == .boolean(false), !Set(object.keys).isSubset(of: Set(properties.keys)) {
                throw SpatialImportError.schemaMismatch
            }
            for (key, child) in object {
                if let childSchema = properties[key] { try validate(child, schema: childSchema) }
            }
        case .array(let array):
            try count(array.count, min: rules["minItems"], max: rules["maxItems"])
            if let itemSchema = rules["items"] {
                for child in array { try validate(child, schema: itemSchema) }
            }
        case .string(let string):
            // JSON Schema lengths count Unicode code points rather than grapheme clusters.
            try count(string.unicodeScalars.count, min: rules["minLength"], max: rules["maxLength"])
            if let pattern = rules["pattern"]?.string,
               string.range(of: pattern, options: .regularExpression) == nil { throw SpatialImportError.schemaMismatch }
        case .number(let number):
            if let min = rules["minimum"]?.number, number < min { throw SpatialImportError.schemaMismatch }
            if let max = rules["maximum"]?.number, number > max { throw SpatialImportError.schemaMismatch }
            if let min = rules["exclusiveMinimum"]?.number, number <= min { throw SpatialImportError.schemaMismatch }
        default: break
        }
    }
    private func count(_ value: Int, min: JSONValue?, max: JSONValue?) throws {
        if let lower = min?.number, Double(value) < lower { throw SpatialImportError.schemaMismatch }
        if let upper = max?.number, Double(value) > upper { throw SpatialImportError.schemaMismatch }
    }
    private func matches(_ value: JSONValue, type: String) -> Bool {
        switch (value, type) {
        case (.object, "object"), (.array, "array"), (.string, "string"), (.boolean, "boolean"), (.null, "null"):
            return true
        case (.number, "number"): return true
        case (.number(let n), "integer"): return n.rounded() == n && abs(n) <= 9_007_199_254_740_991
        default: return false
        }
    }
}
