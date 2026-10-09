import Foundation

/// Bounded codes only. Do not include imported labels, paths, or private geometry in logs.
public enum SpatialImportError: String, Error, LocalizedError, Sendable {
    case boundsExceeded, malformedJSON, duplicateJSONKey, schemaMismatch
    case unsupportedArchive, unsafeArchive, corruptArchive, invalidSVG
    case identityMismatch, invalidGeometry, invalidScene, processingBudgetExceeded
    public var errorDescription: String? { "The spatial file was rejected (\(rawValue))." }
}

public enum SpatialImportLimits {
    public static let memberBytes = 32 * 1024 * 1024
    public static let totalBytes = 64 * 1024 * 1024
    public static let members = 4
    public static let compressionRatio = 200
    public static let jsonDepth = 32
    public static let jsonValues = 1_000_000
    public static let stringBytes = 100_000
    public static let xmlElements = 400_000
    public static let processingSeconds: Double = 15
    // Admission budget for the existing core's polynomial geometry algorithms.
    // This is a safety rejection limit, not a usable-capacity or latency claim.
    public static let geometryWork = 50_000_000
}

struct ImportBudget {
    private let start = ProcessInfo.processInfo.systemUptime
    func check() throws {
        if ProcessInfo.processInfo.systemUptime - start > SpatialImportLimits.processingSeconds {
            throw SpatialImportError.processingBudgetExceeded
        }
    }
}
