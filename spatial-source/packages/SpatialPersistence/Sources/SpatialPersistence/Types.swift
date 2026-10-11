import Foundation
import SpatialCore

/// Failure text intentionally excludes private paths, labels, SQL, and raw captures.
public enum StoreError: Error, Equatable, CustomStringConvertible {
    case protectedDataUnavailable, invalidIdentifier, invalidRevision, alreadyExists, notFound
    case corruptArtifact, unsafeFile, sizeLimit, invalidJSON, unsupportedStoreVersion
    case database(Int32), fileIO(Int32), insufficientSpace, captureIdentityConflict
    case staleRevision(expected: Int, actual: Int), nothingToUndo, nothingToRedo
    case invalidAccessPolicy, accessScopeMismatch, localAccessDenied, localAccessSuspended, localClockRollback
    case revisionRetired
    public var description: String {
        switch self {
        case .protectedDataUnavailable: return "Unlock the device to save or open this work."
        case .invalidIdentifier: return "Invalid bounded object identifier."
        case .invalidRevision: return "The revision does not follow the saved source revision."
        case .alreadyExists: return "This draft already exists."
        case .notFound: return "The requested local record was not found."
        case .corruptArtifact: return "Stored content failed its identity or integrity check."
        case .unsafeFile: return "An unsafe local file was rejected."
        case .sizeLimit: return "Content exceeds the configured local safety limit."
        case .invalidJSON: return "The geometry file is invalid, ambiguous, or too complex."
        case .unsupportedStoreVersion: return "This store requires an explicitly supported migration."
        case .database(let code): return "Local database operation failed (\(code))."
        case .fileIO(let code): return "Local file operation failed (\(code))."
        case .insufficientSpace: return "The device does not have enough available storage."
        case .captureIdentityConflict: return "Different capture bytes already use this source identity."
        case .staleRevision: return "The saved draft changed. Reopen it before applying this edit."
        case .nothingToUndo: return "There is no saved edit to undo."
        case .nothingToRedo: return "There is no saved edit to redo."
        case .invalidAccessPolicy: return "This local access policy is invalid or requires explicit migration."
        case .accessScopeMismatch: return "This store belongs to a different local access context."
        case .localAccessDenied: return "Current permission is required to access this managed local work."
        case .localAccessSuspended: return "Managed access is suspended. Unsynced work remains on this device."
        case .localClockRollback: return "The device time changed. Verify access before reopening managed work."
        case .revisionRetired: return "This old unpinned snapshot was removed by confirmed history cleanup. Its revision identity and edit lineage remain."
        }
    }
}

public struct StoreLimits: Sendable {
    public let geometryBytes: Int
    public let captureBytes: Int
    public let undoDepth: Int
    public init(geometryBytes: Int = 16 * 1024 * 1024, captureBytes: Int = 128 * 1024 * 1024,
                undoDepth: Int = 100) {
        self.geometryBytes = min(max(1, geometryBytes), 64 * 1024 * 1024)
        self.captureBytes = min(max(1, captureBytes), 256 * 1024 * 1024)
        self.undoDepth = min(max(1, undoDepth), 100)
    }
}

public enum CommitBoundary: String, Sendable {
    case captureIntentSynced, stagedFileSynced, immutableFilePromoted, beforeDatabaseCommit, databaseCommitted
    case historyBeforeMetadataCommit, historyMetadataCommitted, historyFileRemoved, historyRemovalRecorded
}

public struct DraftSummary: Sendable, Equatable {
    public let documentID: String
    public let title: String
    public let revision: Int
    public let updatedAt: Date
    public let canUndo: Bool
    public let canRedo: Bool
}

/// A local durable-save acknowledgement. It makes no receiver or release claim.
public struct SaveReceipt: Sendable, Equatable {
    public let documentID: String
    public let revision: Int
    public let sha256: String
    public let byteCount: Int
    public let savedAt: Date
}

public enum CaptureArtifactKind: String, Codable, Sendable {
    case roomPlanRaw, roomPlanProcessed, worldMap, normalizationReport, captureMetadata
    static let allCasesForRetention: [Self] = [.roomPlanRaw, .roomPlanProcessed, .worldMap, .normalizationReport, .captureMetadata]
}

public struct CaptureArchiveReceipt: Sendable, Equatable {
    public let sourceID: String
    public let kind: CaptureArtifactKind
    public let sha256: String
    public let byteCount: Int
}

/// A local immutable snapshot only. This is neither authority to export nor a release.
public struct FrozenRevision: Sendable, Equatable {
    public let snapshotID: String
    public let documentID: String
    public let revision: Int
    public let sha256: String
    public let byteCount: Int
    public let frozenAt: Date
}

public struct RecoveryArtifact: Sendable, Equatable {
    public enum State: String, Sendable {
        case stagedUncommitted, immutableUnreferenced, captureIntentWithoutPayload, invalidCaptureIntent, unrecognizedFile, unsafeFile
    }
    /// Internal artifact identity, never a user-supplied file path.
    public let artifactName: String
    public let state: State
}

/// A verified, uncommitted raw capture candidate. It does not imply a saved draft.
public struct RecoverableCapture: Sendable, Equatable {
    public let artifactID: String
    public let sourceID: String
    public let kind: CaptureArtifactKind
    public let sha256: String
    public let byteCount: Int
}

/// An unacknowledged but strictly readable document candidate. SHA identifies its current
/// retained bytes; it does not establish a previously acknowledged save or approval.
public struct RecoverableDraft: Sendable, Equatable {
    public let artifactID: String
    public let originalDocumentID: String
    public let originalRevision: Int
    public let sha256: String
    public let byteCount: Int
}
public struct RecoveredDraftSource: Sendable, Equatable {
    public let artifactID: String
    public let originalDocumentID: String
    public let originalRevision: Int
    public let sha256: String
    public let byteCount: Int
    public let recoveredDocumentID: String
}
public struct StorageInventory: Sendable, Equatable {
    public let draftCount: Int
    public let revisionCount: Int
    public let frozenSnapshotCount: Int
    public let pendingPublicationCount: Int
    public let captureBytes: Int
    public let geometryBytes: Int
    public let publicationBytes: Int
    public let recoveredSourceBytes: Int
    public let retainedOrphanCount: Int
    public let undoHistoryLimit: Int
    /// No persistent derivative cache is implemented. All inventoried bytes are protected
    /// source/history/publication material, not automatically safe to evict.
    public let reclaimableCacheBytes: Int
    public let retiredHistoryCount: Int
    public let pendingHistoryCleanupBytes: Int
}
