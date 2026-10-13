import Foundation

enum ExportBridgePolicy {
    static let maximumBytes = 32 * 1024 * 1024
    static let extensions = ["application/json": "json", "application/zip": "zip", "image/svg+xml": "svg",
                             "model/gltf-binary": "glb", "application/pdf": "pdf", "image/png": "png"]
    enum Invalid: Error { case request }
    static func decode(filename: String, mimeType: String, base64: String) throws -> Data {
        guard let suffix = extensions[mimeType],
              filename.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$", options: .regularExpression) != nil,
              !filename.contains(".."), filename.hasSuffix("." + suffix),
              base64.utf8.count <= ((maximumBytes + 2) / 3) * 4,
              let bytes = Data(base64Encoded: base64), !bytes.isEmpty, bytes.count <= maximumBytes else { throw Invalid.request }
        switch suffix {
        case "json":
            guard (try? JSONSerialization.jsonObject(with: bytes)) != nil else { throw Invalid.request }
        case "zip":
            guard bytes.starts(with: [0x50, 0x4b, 0x03, 0x04]) else { throw Invalid.request }
        case "png":
            guard bytes.starts(with: [137, 80, 78, 71, 13, 10, 26, 10]) else { throw Invalid.request }
        case "pdf":
            guard bytes.starts(with: Data("%PDF-".utf8)) else { throw Invalid.request }
        case "glb":
            guard bytes.starts(with: [0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0]) else { throw Invalid.request }
        case "svg":
            guard let text = String(data: bytes, encoding: .utf8), text.contains("<svg"),
                  text.range(of: "<!DOCTYPE|<!ENTITY", options: [.regularExpression, .caseInsensitive]) == nil else { throw Invalid.request }
            let parser = XMLParser(data: bytes), validator = SVGExportValidator()
            parser.shouldResolveExternalEntities = false; parser.delegate = validator
            guard parser.parse(), validator.valid, validator.rootSeen else { throw Invalid.request }
        default: throw Invalid.request
        }
        return bytes
    }
}

/// The app exports line art, not an arbitrary active SVG document. XML parsing
/// catches encoded attribute names/values that substring checks can miss.
private final class SVGExportValidator: NSObject, XMLParserDelegate {
    var valid = true
    var rootSeen = false
    private let elements: Set<String> = ["svg", "g", "path", "line", "rect", "polygon", "polyline", "text", "tspan", "circle", "ellipse", "title", "desc"]
    func parser(_ parser: XMLParser, didStartElement elementName: String, namespaceURI: String?, qualifiedName qName: String?, attributes: [String: String]) {
        if !rootSeen { rootSeen = elementName == "svg"; if !rootSeen { valid = false } }
        guard elements.contains(elementName) else { valid = false; parser.abortParsing(); return }
        for (name, value) in attributes {
            let key = name.lowercased(), lower = value.lowercased()
            // CSS is not an export requirement. Reject style outright rather
            // than trying to interpret CSS escapes. Presentation attributes can
            // also contain CSS URL values, so their escape syntax is forbidden.
            if key == "style" || value.contains("\\") || key.hasPrefix("on") || key.contains("href") || key == "src" || lower.contains("javascript:") ||
                lower.range(of: "url\\s*\\(", options: .regularExpression) != nil ||
                (key.hasPrefix("xmlns") && value != "http://www.w3.org/2000/svg") {
                valid = false; parser.abortParsing(); return
            }
        }
    }
    func parser(_ parser: XMLParser, foundProcessingInstructionWithTarget target: String, data: String?) {
        // A linked xml-stylesheet could otherwise load CSS outside any element.
        valid = false; parser.abortParsing()
    }
}
