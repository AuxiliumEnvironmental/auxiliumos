import Foundation

public enum HistoryCleanupError: String, Error, LocalizedError, Sendable {
    case stalePreview, invalidPreview, protectedSnapshot, unsafeCandidate
    public var errorDescription: String? {
        switch self {
        case .stalePreview: return "The saved history changed. Review a fresh cleanup preview before confirming."
        case .invalidPreview: return "This cleanup confirmation does not match this store."
        case .protectedSnapshot: return "A protected snapshot cannot be removed."
        case .unsafeCandidate: return "A history file failed its identity check. It was not removed."
        }
    }
}

public struct HistorySnapshotIdentity: Codable, Equatable, Sendable {
    public let documentID: String
    public let revision: Int
    public let artifactID: String
    public let sha256: String
    public let byteCount: Int
}

/// Obtain from previewHistoryCleanup, display its counts, then pass the same value only
/// after explicit confirmation. This is not a general-purpose file deletion interface.
public struct HistoryCleanupPreview: Equatable, Sendable {
    public let operationID: String
    public let documentID: String?
    public let snapshots: [HistorySnapshotIdentity]
    public let bytesToRemove: Int
    public let additionalUnpinnedSnapshotsRetainedPerDocument: Int
    public let maximumBatchSnapshots: Int
    public let maximumBatchBytes: Int
    let stateSHA256: String
}

public struct HistoryCleanupResult: Equatable, Sendable {
    public let operationID: String
    public let retiredSnapshots: Int
    public let removedSnapshots: Int
    public let bytesRemoved: Int
    public let pendingSnapshots: Int
    public let pendingBytes: Int
    public var completed: Bool { pendingSnapshots == 0 }
}

struct HistoryCleanupState: Encodable {
    struct Draft: Encodable {
        let documentID: String
        let revision: Int
        let undo: [Int]
        let redo: [Int]
    }
    struct Revision: Encodable {
        let documentID: String
        let revision: Int
        let artifactID: String
        let sha256: String
        let byteCount: Int
    }
    struct Frozen: Encodable { let snapshotID: String; let documentID: String; let revision: Int }
    let drafts: [Draft]
    let revisions: [Revision]
    let frozen: [Frozen]
}

struct HistoryCleanupPlan {
    let documentID: String?
    let snapshots: [HistorySnapshotIdentity]
    let stateSHA256: String
    var bytesToRemove: Int { snapshots.reduce(0) { $0 + $1.byteCount } }
    func preview(operationID: String) -> HistoryCleanupPreview {
        .init(operationID: operationID, documentID: documentID, snapshots: snapshots,
            bytesToRemove: bytesToRemove, additionalUnpinnedSnapshotsRetainedPerDocument: 100,
            maximumBatchSnapshots: 100, maximumBatchBytes: 256 * 1024 * 1024, stateSHA256: stateSHA256)
    }
}
