import Foundation
import CSpatialCompression
#if canImport(FoundationXML)
import FoundationXML
#endif

/// Admission checks, not permission to execute/render received derivatives.
/// Imported models/drawings are always regenerated from admitted canonical geometry.
enum DrawingArtifactValidation {
    static func validate(_ bytes: Data, mime: String, budget: ImportBudget) throws {
        switch mime {
        case "image/svg+xml": try DrawingSVGAdmission.validate(bytes, budget: budget)
        case "image/png": try png(bytes)
        case "application/pdf":
            guard bytes.starts(with: Data("%PDF-1.".utf8)),
                  String(decoding: bytes.suffix(1024), as: UTF8.self).trimmingCharacters(in: .whitespacesAndNewlines).hasSuffix("%%EOF") else {
                throw SpatialImportError.schemaMismatch
            }
            // CoreGraphics emits static classic-object PDFs. This conservative name
            // admission rejects action/attachment/encryption/object-stream machinery.
            // It is NOT a complete arbitrary-PDF parser; these bytes remain opaque.
            let source = Array(bytes), forbidden: Set<String> = ["JavaScript", "JS", "Launch", "OpenAction", "AA", "URI", "EmbeddedFile",
                "RichMedia", "XFA", "AcroForm", "GoToR", "GoToE", "SubmitForm", "ImportData", "ObjStm", "XRef", "Encrypt", "Filespec"]
            var cursor = 0
            func hex(_ value: UInt8) -> UInt8? {
                if (48...57).contains(value) { return value - 48 }
                if (65...70).contains(value) { return value - 55 }
                if (97...102).contains(value) { return value - 87 }
                return nil
            }
            while cursor < source.count {
                if source[cursor] != 47 { cursor += 1; continue }
                cursor += 1; var name: [UInt8] = []
                while cursor < source.count, ![0,9,10,12,13,32,40,41,60,62,91,93,123,125,47,37].contains(source[cursor]) {
                    if source[cursor] == 35, cursor + 2 < source.count, let a = hex(source[cursor + 1]), let b = hex(source[cursor + 2]) {
                        name.append(a * 16 + b); cursor += 3
                    } else { name.append(source[cursor]); cursor += 1 }
                    if name.count > 256 { break }
                }
                if forbidden.contains(String(decoding: name, as: UTF8.self)) { throw SpatialImportError.schemaMismatch }
            }
        case "model/gltf-binary":
            guard bytes.count >= 28, Array(bytes.prefix(8)) == [103, 108, 84, 70, 2, 0, 0, 0] else { throw SpatialImportError.invalidScene }
            let length = (0..<4).reduce(0) { $0 | Int(bytes[8 + $1]) << ($1 * 8) }
            guard length == bytes.count else { throw SpatialImportError.invalidScene }
        default: break
        }
        try budget.check()
    }
    private static func png(_ input: Data) throws {
        let bytes = Data(input)
        guard bytes.count >= 57, Array(bytes.prefix(8)) == [137,80,78,71,13,10,26,10] else { throw SpatialImportError.schemaMismatch }
        func u32(_ p: Int) -> Int { (0..<4).reduce(0) { ($0 << 8) | Int(bytes[p + $1]) } }
        var p = 8, chunks = 0, imageData = false, ended = false
        while p < bytes.count {
            guard p <= bytes.count - 12 else { throw SpatialImportError.schemaMismatch }
            let length = u32(p)
            guard length <= bytes.count - p - 12 else { throw SpatialImportError.schemaMismatch }
            let kind = String(decoding: bytes[(p + 4)..<(p + 8)], as: UTF8.self)
            let crcBytes = bytes.subdata(in: (p + 4)..<(p + 8 + length))
            let crc = crcBytes.withUnsafeBytes { spatial_crc32($0.bindMemory(to: UInt8.self).baseAddress, crcBytes.count) }
            guard Int(crc) == u32(p + 8 + length), !ended else { throw SpatialImportError.schemaMismatch }
            if chunks == 0 {
                guard kind == "IHDR", length == 13 else { throw SpatialImportError.schemaMismatch }
                let width = u32(p + 8), height = u32(p + 12)
                guard width > 0, height > 0, width <= 8192, height <= 8192, width * height <= 16_000_000,
                      bytes[p + 16] == 8, [0,2,4,6].contains(bytes[p + 17]), bytes[p + 18] == 0,
                      bytes[p + 19] == 0, bytes[p + 20] == 0 else { throw SpatialImportError.boundsExceeded }
            } else if kind == "IHDR" { throw SpatialImportError.schemaMismatch }
            else if kind == "IDAT" { imageData = true }
            else if kind == "IEND" {
                guard length == 0, imageData else { throw SpatialImportError.schemaMismatch }; ended = true
            } else if !["cHRM", "gAMA", "iCCP", "sBIT", "sRGB", "bKGD", "pHYs", "tEXt", "zTXt", "iTXt", "tIME", "eXIf"].contains(kind) {
                throw SpatialImportError.schemaMismatch
            }
            p += length + 12; chunks += 1
            guard chunks <= 100_000 else { throw SpatialImportError.boundsExceeded }
        }
        guard ended, p == bytes.count else { throw SpatialImportError.schemaMismatch }
    }
}

private final class DrawingSVGAdmission: NSObject, XMLParserDelegate {
    private let budget: ImportBudget
    private var error: SpatialImportError?, stack: [String] = [], count = 0, roots = 0, textBytes = 0
    private static let attributes: [String: Set<String>] = [
        "svg": ["viewBox", "role"], "title": [], "desc": [],
        "rect": ["width", "height", "fill"],
        "line": ["x1", "x2", "y1", "y2", "data-object-id", "data-role", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap"],
        "polygon": ["points", "data-object-id", "data-role", "fill", "stroke", "stroke-width", "stroke-dasharray"],
        "circle": ["cx", "cy", "r", "data-object-id", "data-role", "fill", "stroke", "stroke-width", "stroke-dasharray"],
        "text": ["x", "y", "font-family", "font-size", "fill", "font-weight", "data-object-id"],
        "tspan": ["x", "dy"]]
    private init(_ budget: ImportBudget) { self.budget = budget }
    static func validate(_ bytes: Data, budget: ImportBudget) throws {
        guard let text = String(data: bytes, encoding: .utf8), !text.lowercased().contains("<!doctype"),
              !text.lowercased().contains("<!entity") else { throw SpatialImportError.invalidSVG }
        let delegate = DrawingSVGAdmission(budget), parser = XMLParser(data: bytes)
        parser.delegate = delegate; parser.shouldProcessNamespaces = true; parser.shouldResolveExternalEntities = false
        let success = parser.parse()
        if let error = delegate.error { throw error }
        guard success, delegate.roots == 1, delegate.stack.isEmpty else { throw SpatialImportError.invalidSVG }
    }
    private func fail(_ parser: XMLParser, _ problem: SpatialImportError = .invalidSVG) { error = problem; parser.abortParsing() }
    func parser(_ parser: XMLParser, didStartElement name: String, namespaceURI: String?, qualifiedName: String?, attributes: [String: String]) {
        count += 1
        guard count <= SpatialImportLimits.xmlElements else { fail(parser, .boundsExceeded); return }
        do { try budget.check() } catch { fail(parser, .processingBudgetExceeded); return }
        let nesting = stack.isEmpty ? name == "svg" : (stack == ["svg"] ? name != "svg" && name != "tspan" : stack == ["svg", "text"] && name == "tspan")
        guard nesting, namespaceURI == "http://www.w3.org/2000/svg", let allowed = Self.attributes[name], Set(attributes.keys).isSubset(of: allowed) else { fail(parser); return }
        if stack.isEmpty { roots += 1 }
        for (key, value) in attributes {
            guard value.utf8.count <= 20_000, !value.lowercased().contains("url(") else { fail(parser); return }
            switch key {
            case "fill", "stroke":
                if !["none", "white"].contains(value) && value.range(of: "^#[A-Fa-f0-9]{6}$", options: .regularExpression) == nil { fail(parser); return }
            case "data-object-id":
                if value.range(of: "^[A-Za-z0-9_-]{1,96}$", options: .regularExpression) == nil { fail(parser); return }
            case "data-role":
                if value.range(of: "^[a-z-]{1,32}$", options: .regularExpression) == nil { fail(parser); return }
            case "font-family": if value != "system-ui,sans-serif" { fail(parser); return }
            case "font-weight": if value != "600" { fail(parser); return }
            case "stroke-linecap": if value != "round" { fail(parser); return }
            case "role": if value != "img" { fail(parser); return }
            default:
                let tokens = value.split(whereSeparator: { $0 == " " || $0 == "," })
                let numbers = tokens.compactMap { Double($0) }
                guard !numbers.isEmpty, numbers.count == tokens.count, numbers.count <= 2000,
                      numbers.allSatisfy({ $0.isFinite && abs($0) <= 1_000_000 }) else { fail(parser); return }
                if key == "viewBox" && numbers.count != 4 { fail(parser); return }
                if key == "points" && (numbers.count < 6 || numbers.count % 2 != 0) { fail(parser); return }
                if !["viewBox", "points", "stroke-dasharray"].contains(key) && numbers.count != 1 { fail(parser); return }
            }
        }
        stack.append(name)
        textBytes = 0
    }
    func parser(_ parser: XMLParser, didEndElement name: String, namespaceURI: String?, qualifiedName: String?) {
        guard stack.last == name else { fail(parser); return }; stack.removeLast(); textBytes = 0
    }
    func parser(_ parser: XMLParser, foundCharacters text: String) {
        textBytes += text.utf8.count
        guard textBytes <= SpatialImportLimits.stringBytes,
              ["title", "desc", "tspan", "text"].contains(stack.last ?? "") || text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { fail(parser); return }
    }
    func parser(_ parser: XMLParser, foundCDATA: Data) { fail(parser) }
    func parser(_ parser: XMLParser, foundProcessingInstructionWithTarget: String, data: String?) { fail(parser) }
    func parser(_ parser: XMLParser, foundInternalEntityDeclarationWithName: String, value: String?) { fail(parser) }
    func parser(_ parser: XMLParser, foundExternalEntityDeclarationWithName: String, publicID: String?, systemID: String?) { fail(parser) }
    func parser(_ parser: XMLParser, resolveExternalEntityName: String, systemID: String?) -> Data? { fail(parser); return nil }
}
