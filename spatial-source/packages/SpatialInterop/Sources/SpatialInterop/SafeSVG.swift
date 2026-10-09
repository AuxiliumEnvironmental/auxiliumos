import Foundation
#if canImport(FoundationXML)
import FoundationXML
#endif

/// Syntax acceptance only. Imported SVG is never a render source; regenerate it from
/// the validated document. No WebView or browser is involved in this boundary.
final class SafeSVG: NSObject, XMLParserDelegate {
    private let budget: ImportBudget
    private var failure: SpatialImportError?
    private var stack: [String] = []
    private var elements = 0
    private var textBytes = 0
    private var roots = 0
    private static let attrs: [String: Set<String>] = [
        "svg": ["viewBox", "role"], "title": [], "desc": [],
        "rect": ["x", "y", "width", "height", "fill"],
        "polygon": ["points", "fill"],
        "line": ["x1", "x2", "y1", "y2", "stroke", "stroke-width", "stroke-linecap"],
        "text": ["x", "y", "text-anchor", "font-family", "font-size", "fill"]]
    private static let numeric: Set<String> = ["x", "y", "x1", "x2", "y1", "y2", "width", "height", "font-size", "stroke-width", "points", "viewBox"]
    private init(budget: ImportBudget) { self.budget = budget }
    static func validate(_ data: Data, budget: ImportBudget) throws {
        guard !data.isEmpty, data.count <= SpatialImportLimits.memberBytes else { throw SpatialImportError.boundsExceeded }
        guard let text = String(data: data, encoding: .utf8) else { throw SpatialImportError.invalidSVG }
        let lower = text.lowercased()
        guard !lower.contains("<!doctype"), !lower.contains("<!entity") else { throw SpatialImportError.invalidSVG }
        let validator = SafeSVG(budget: budget)
        let parser = XMLParser(data: data)
        parser.delegate = validator
        parser.shouldProcessNamespaces = true
        parser.shouldResolveExternalEntities = false
        let success = parser.parse()
        if let failure = validator.failure { throw failure }
        guard success, validator.roots == 1, validator.stack.isEmpty else { throw SpatialImportError.invalidSVG }
        try budget.check()
    }
    private func fail(_ parser: XMLParser, _ error: SpatialImportError = .invalidSVG) {
        if failure == nil { failure = error }
        parser.abortParsing()
    }
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes: [String: String]) {
        guard failure == nil else { return }
        elements += 1
        guard elements <= SpatialImportLimits.xmlElements else { fail(parser, .boundsExceeded); return }
        if elements % 1024 == 0 {
            do { try budget.check() } catch { fail(parser, .processingBudgetExceeded); return }
        }
        guard namespaceURI == "http://www.w3.org/2000/svg", let allowed = Self.attrs[elementName],
              Set(attributes.keys).isSubset(of: allowed), stack.count < 2,
              stack.isEmpty ? elementName == "svg" : stack == ["svg"] && elementName != "svg" else {
            fail(parser); return
        }
        if stack.isEmpty { roots += 1 }
        for (key, value) in attributes {
            guard value.utf8.count <= SpatialImportLimits.stringBytes, !value.lowercased().contains("url(") else { fail(parser); return }
            if key == "fill" || key == "stroke" {
                guard ["white", "none"].contains(value) || value.range(of: "^#[0-9a-fA-F]{6}$", options: .regularExpression) != nil else { fail(parser); return }
            }
            if Self.numeric.contains(key), !validNumbers(value, attribute: key) { fail(parser); return }
            if key == "font-family", value != "system-ui,sans-serif" { fail(parser); return }
            if key == "role", value != "img" { fail(parser); return }
            if key == "stroke-linecap", !["round", "butt", "square"].contains(value) { fail(parser); return }
            if key == "text-anchor", !["start", "middle", "end"].contains(value) { fail(parser); return }
        }
        stack.append(elementName); textBytes = 0
    }
    private func validNumbers(_ value: String, attribute: String) -> Bool {
        guard !value.isEmpty, value.utf8.allSatisfy({ (48...57).contains($0) || [45,43,46,44,32,101,69].contains($0) }) else { return false }
        let tokens = value.split(whereSeparator: { $0 == "," || $0 == " " })
        let expected = attribute == "viewBox" ? 4 : 1
        if attribute == "points" {
            guard tokens.count >= 6, tokens.count <= 2000, tokens.count % 2 == 0 else { return false }
        } else if tokens.count != expected { return false }
        let values = tokens.compactMap { Double($0) }
        guard values.count == tokens.count, values.allSatisfy({ $0.isFinite && abs($0) <= 1_000_000 }) else { return false }
        if attribute == "viewBox", values[2] <= 0 || values[3] <= 0 { return false }
        if ["width", "height", "font-size", "stroke-width"].contains(attribute), values[0] < 0 { return false }
        return true
    }
    func parser(_ parser: XMLParser, didEndElement elementName: String, namespaceURI: String?, qualifiedName qName: String?) {
        guard failure == nil else { return }
        guard stack.last == elementName else { fail(parser); return }
        stack.removeLast(); textBytes = 0
    }
    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard failure == nil else { return }
        textBytes += string.utf8.count
        guard textBytes <= SpatialImportLimits.stringBytes else { fail(parser, .boundsExceeded); return }
        if !["title", "desc", "text"].contains(stack.last ?? ""), !string.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { fail(parser) }
    }
    func parser(_ parser: XMLParser, foundCDATA CDATABlock: Data) { fail(parser) }
    func parser(_ parser: XMLParser, foundProcessingInstructionWithTarget target: String, data: String?) { fail(parser) }
    func parser(_ parser: XMLParser, foundInternalEntityDeclarationWithName name: String, value: String?) { fail(parser) }
    func parser(_ parser: XMLParser, foundExternalEntityDeclarationWithName name: String, publicID: String?, systemID: String?) { fail(parser) }
    func parser(_ parser: XMLParser, resolveExternalEntityName name: String, systemID: String?) -> Data? { fail(parser); return nil }
}
