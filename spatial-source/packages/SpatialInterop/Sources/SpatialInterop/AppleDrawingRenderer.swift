import Foundation
#if canImport(CoreGraphics) && canImport(CoreText) && canImport(ImageIO)
import CoreGraphics
import CoreText
import ImageIO
#endif

/// The real app uses Apple system text shaping, vector PDF output, and ImageIO PNG.
/// Linux intentionally has no substitute bitmap font or fixture renderer.
enum AppleDrawingRenderer {
    struct Result { let pdf: Data; let png: [Data] }
    static func render(plan: DrawingPlan, pixelsPerPoint: Int, includePDF: Bool = true, includePNG: Bool = true) throws -> Result {
        #if canImport(CoreGraphics) && canImport(CoreText) && canImport(ImageIO)
        guard !plan.pages.isEmpty, plan.pages.count <= 500, (1...3).contains(pixelsPerPoint) else {
            throw DrawingExportError.exceedsSafetyBounds
        }
        let output = NSMutableData()
        guard let consumer = CGDataConsumer(data: output as CFMutableData) else { throw DrawingExportError.renderingFailed }
        var media = CGRect(x: 0, y: 0, width: plan.pages[0].width, height: plan.pages[0].height)
        let identity = "Document \(plan.documentID); floor \(plan.floorID); revision \(plan.revision). Measurements unverified."
        let info: [String: Any] = [kCGPDFContextTitle as String: "Auxilium Spatial drawing",
            kCGPDFContextSubject as String: identity, kCGPDFContextCreator as String: "Auxilium Spatial"]
        let pdf = includePDF ? CGContext(consumer: consumer, mediaBox: &media, info as CFDictionary) : nil
        if includePDF && pdf == nil { throw DrawingExportError.renderingFailed }
        var images: [Data] = [], total = 0
        do {
            for (index, page) in plan.pages.enumerated() {
                if let pdf {
                    pdf.beginPDFPage(nil)
                    pdf.saveGState(); pdf.translateBy(x: 0, y: page.height); pdf.scaleBy(x: 1, y: -1)
                    try draw(page, in: pdf)
                    pdf.restoreGState(); pdf.endPDFPage()
                }
                if !includePNG { continue }
                let width = Int(page.width) * pixelsPerPoint, height = Int(page.height) * pixelsPerPoint
                guard width <= 8192, height <= 8192, width * height <= 16_000_000,
                      let bitmap = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8,
                        bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else {
                    throw DrawingExportError.exceedsSafetyBounds
                }
                bitmap.scaleBy(x: CGFloat(pixelsPerPoint), y: CGFloat(pixelsPerPoint))
                bitmap.translateBy(x: 0, y: page.height); bitmap.scaleBy(x: 1, y: -1)
                try draw(page, in: bitmap)
                guard let image = bitmap.makeImage() else { throw DrawingExportError.renderingFailed }
                let bytes = NSMutableData()
                guard let destination = CGImageDestinationCreateWithData(bytes as CFMutableData, "public.png" as CFString, 1, nil) else {
                    throw DrawingExportError.renderingFailed
                }
                let metadata: [String: Any] = [kCGImagePropertyPNGDictionary as String: [
                    kCGImagePropertyPNGDescription as String: identity + " Page \(index + 1) of \(plan.pages.count)."]]
                CGImageDestinationAddImage(destination, image, metadata as CFDictionary)
                guard CGImageDestinationFinalize(destination), bytes.length > 0, bytes.length <= SpatialImportLimits.memberBytes else {
                    throw DrawingExportError.renderingFailed
                }
                images.append(bytes as Data); total += bytes.length
                guard total <= SpatialImportLimits.totalBytes else { throw DrawingExportError.exceedsSafetyBounds }
            }
            pdf?.closePDF()
        } catch {
            pdf?.closePDF()
            throw error
        }
        guard (!includePDF || output.length > 0), output.length <= SpatialImportLimits.memberBytes,
              total + output.length <= SpatialImportLimits.totalBytes else { throw DrawingExportError.exceedsSafetyBounds }
        return Result(pdf: output as Data, png: images)
        #else
        throw DrawingExportError.nativeRendererUnavailable
        #endif
    }

    #if canImport(CoreGraphics) && canImport(CoreText) && canImport(ImageIO)
    private static func color(_ value: DrawingColor) -> CGColor {
        CGColor(red: value.red, green: value.green, blue: value.blue, alpha: 1)
    }
    private static func draw(_ page: DrawingPage, in context: CGContext) throws {
        context.setFillColor(CGColor(gray: 1, alpha: 1)); context.fill(CGRect(x: 0, y: 0, width: page.width, height: page.height))
        context.setLineCap(.round); context.setLineJoin(.round)
        for shape in page.shapes {
            context.beginPath(); context.setLineWidth(shape.lineWidth)
            context.setLineDash(phase: 0, lengths: shape.dashed ? [3, 3] : [])
            if let fill = shape.fill { context.setFillColor(color(fill)) }
            if let stroke = shape.stroke { context.setStrokeColor(color(stroke)) }
            switch shape.kind {
            case .circle:
                let p = shape.points[0]
                context.addEllipse(in: CGRect(x: p.x - shape.radius, y: p.y - shape.radius,
                                              width: 2 * shape.radius, height: 2 * shape.radius))
            case .line, .polygon:
                context.move(to: CGPoint(x: shape.points[0].x, y: shape.points[0].y))
                for p in shape.points.dropFirst() { context.addLine(to: CGPoint(x: p.x, y: p.y)) }
                if shape.kind == .polygon { context.closePath() }
            }
            if shape.fill != nil && shape.stroke != nil { context.drawPath(using: .fillStroke) }
            else if shape.fill != nil { context.fillPath() }
            else if shape.stroke != nil { context.strokePath() }
        }
        context.setLineDash(phase: 0, lengths: [])
        for label in page.texts {
            let path = CGPath(rect: CGRect(x: 0, y: 0, width: label.width, height: label.height), transform: nil)
            var frame: CTFrame?
            // Never silently truncate text. System shaping handles accents, CJK, emoji,
            // bidirectional text and fallback fonts; native acceptance is separate.
            for step in 0...6 {
                let size = max(8, label.fontSize - Double(step) * 0.5)
                var font = CTFontCreateUIFontForLanguage(.system, size, nil) ?? CTFontCreateWithName("Helvetica" as CFString, size, nil)
                if label.bold, let bold = CTFontCreateCopyWithSymbolicTraits(font, size, nil, .traitBold, .traitBold) { font = bold }
                let attributed = NSAttributedString(string: label.text, attributes: [
                    NSAttributedString.Key(kCTFontAttributeName as String): font,
                    NSAttributedString.Key(kCTForegroundColorAttributeName as String): color(label.color)])
                let setter = CTFramesetterCreateWithAttributedString(attributed as CFAttributedString)
                let candidate = CTFramesetterCreateFrame(setter, CFRange(location: 0, length: 0), path, nil)
                let visible = CTFrameGetVisibleStringRange(candidate)
                if visible.length == label.text.utf16.count { frame = candidate; break }
            }
            guard let frame else { throw DrawingExportError.textDoesNotFit }
            context.saveGState()
            context.translateBy(x: label.origin.x, y: label.origin.y + label.height)
            context.scaleBy(x: 1, y: -1); context.textMatrix = .identity
            CTFrameDraw(frame, context)
            context.restoreGState()
        }
    }
    #endif
}
