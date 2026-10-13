import Foundation
import SpatialCore
import SpatialPersistence
#if canImport(Darwin)
import Darwin
#else
import Glibc
#endif

#if os(Linux) && compiler(>=6.0)
/// Serialized process-death harness scheduling only. Some container runtimes intermittently
/// SIGILL in libdispatch worker monitoring before a probe can reach its selected boundary.
/// Swift's public task-executor preference runs this test driver on one ordinary dedicated
/// thread. No runtime library, sandbox permission, or SpatialStore actor implementation changes.
/// Concurrent-store XCTest cases continue to use the normal executor independently.
private final class DeathProbeExecutor: TaskExecutor, @unchecked Sendable {
    private let condition = NSCondition()
    private var jobs: [UnownedJob] = []
    init() {
        let thread = Thread { [self] in
            while true {
                condition.lock()
                while jobs.isEmpty { condition.wait() }
                let job = jobs.removeFirst()
                condition.unlock()
                job.runSynchronously(on: asUnownedTaskExecutor())
            }
        }
        thread.name = "synthetic-process-death-driver"
        thread.start()
    }
    func enqueue(_ job: consuming ExecutorJob) {
        condition.lock(); jobs.append(UnownedJob(job)); condition.signal(); condition.unlock()
    }
}
private final class DeathProbeCompletion: @unchecked Sendable {
    private let condition = NSCondition()
    private var complete = false
    func finish() { condition.lock(); complete = true; condition.signal(); condition.unlock() }
    func wait() { condition.lock(); while !complete { condition.wait() }; condition.unlock() }
}
#endif

/// Synthetic process-death test helper. Never scans hardware or loads customer data.
@main struct StoreCheck {
    static func main() {
        #if os(Linux) && compiler(>=6.0)
        let executor = DeathProbeExecutor(), completed = DeathProbeCompletion()
        Task(executorPreference: executor) {
            do { try await run() }
            catch {
                try? FileHandle.standardError.write(contentsOf: Data("Synthetic store check failed: \(error)\n".utf8))
                exit(1)
            }
            completed.finish()
        }
        completed.wait()
        #else
        // A detached runner avoids async-main's Linux main-dispatch queue, whose
        // /proc thread accounting is unavailable in some container PID namespaces.
        // The production actor/store implementation is unchanged.
        let completed = DispatchSemaphore(value: 0)
        Task.detached {
            do { try await run() }
            catch {
                let message = "Synthetic store check failed: \(error)\n"
                try? FileHandle.standardError.write(contentsOf: Data(message.utf8))
                exit(1)
            }
            completed.signal()
        }
        completed.wait()
        #endif
    }
    private static func run() async throws {
        let arguments = CommandLine.arguments
        guard arguments.count >= 3 else { throw StoreError.invalidIdentifier }
        let action = arguments[1], root = URL(fileURLWithPath: arguments[2], isDirectory: true)
        let boundary = arguments.count > 3 ? arguments[3] : "none"
        let store = try SpatialStore(root: root, faultInjector: { point in
            if point.rawValue == boundary { _exit(86) } // bypass deinit, no rollback cleanup
        })
        let id = "synthetic-two-rooms"
        switch action {
        case "seed":
            _ = try await store.create(Fixtures.twoRooms())
            _ = try await store.archiveCapture(Data("synthetic-raw".utf8), sourceID: "synthetic-source", kind: .roomPlanRaw)
        case "edit":
            let source = try await store.open(documentID: id)
            var session = try EditorSession(source)
            try session.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "Persisted correction"), expectedRevision: source.revision)
            _ = try await store.save(session.document, expectedRevision: source.revision, receipt: session.lastReceipt)
        case "capture":
            // An opaque synthetic payload for portable recovery/reprocessing tests.
            // It is deliberately not claimed to be RoomPlan output.
            var source = Fixtures.twoRooms()
            source.documentID = "synthetic-recovered-capture"
            _ = try await store.archiveCapture(source.encoded(), sourceID: "interrupted-source", kind: .roomPlanRaw)
        case "recover":
            let candidates = try await store.recoverableCaptures()
            for candidate in candidates { _ = try await store.recoverCapture(artifactID: candidate.artifactID) }
            let raw = try await store.readCapture(sourceID: "interrupted-source", kind: .roomPlanRaw)
            let decoded = try SpatialDocumentReader.decode(raw)
            let drafts = try await store.listDrafts()
            print("{\"recovered\":\(candidates.count),\"draftCount\":\(drafts.count),\"verifiedPayload\":\(decoded.documentID == "synthetic-recovered-capture")}")
        case "reprocess":
            let raw = try await store.readCapture(sourceID: "interrupted-source", kind: .roomPlanRaw)
            let decoded = try SpatialDocumentReader.decode(raw)
            _ = try await store.archiveCapture(decoded.encoded(), sourceID: "interrupted-source", kind: .roomPlanProcessed)
            _ = try await store.create(decoded)
            print("{\"reprocessedRevision\":\(decoded.revision)}")
        case "inspect":
            let document = try await store.open(documentID: id)
            let orphans = try await store.recoveryArtifacts()
            let raw = try await store.readCapture(sourceID: "synthetic-source", kind: .roomPlanRaw)
            let receipt = try await store.editReceipt(documentID: id, revision: document.revision)
            let result: [String: Any] = ["revision": document.revision, "orphans": orphans.count,
                                         "label": document.floors[0].rooms[0].label,
                                         "rawPreserved": raw == Data("synthetic-raw".utf8),
                                         "receiptPreserved": receipt?.resultingRevision == document.revision]
            let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
            print(String(decoding: data, as: UTF8.self))
        case "queue-publication":
            // Freeze through an un-faulted connection, so every injected boundary below
            // belongs to the outbox payload/transaction rather than snapshot creation.
            let healthy = try SpatialStore(root: root)
            let frozen = try await healthy.freeze(documentID: id, revision: 1)
            _ = try await store.enqueuePublication(snapshotID: frozen.snapshotID,
                destination: PublicationDestination(system: .auxiliumos, contextID: "synthetic-project"),
                expectedPublishedRevision: nil, clientRequestID: "synthetic-delivery")
        case "inspect-publication":
            let entries = try await store.listPublications()
            var verified = false
            if let entry = entries.first {
                let bytes = try await store.publicationArchive(requestID: entry.request.clientRequestID)
                verified = ArtifactDigest.sha256(bytes) == entry.request.archiveSHA256 && entry.request.sourceRevision == 1
            }
            let orphans = try await store.recoveryArtifacts()
            let document = try await store.open(documentID: id)
            let result: [String: Any] = ["count": entries.count, "verifiedBytes": verified,
                "orphans": orphans.count, "sourceRevision": document.revision,
                "receiverConfirmed": entries.contains { $0.receiverConfirmed }]
            print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))
        case "recover-draft-copy":
            let recoveredSource = try await store.recoveredDraftSource(documentID: "synthetic-recovered-copy")
            let candidates = try await store.recoverableDrafts()
            guard let artifactID = recoveredSource?.artifactID ?? candidates.first(where: { $0.originalDocumentID == id && $0.originalRevision == 2 })?.artifactID else { throw StoreError.notFound }
            _ = try await store.recoverDraftCopy(artifactID: artifactID, newDocumentID: "synthetic-recovered-copy")
        case "inspect-draft-copy":
            let original = try await store.open(documentID: id)
            let drafts = try await store.listDrafts()
            let source = try await store.recoveredDraftSource(documentID: "synthetic-recovered-copy")
            var copyValid = false
            if source != nil {
                let copy = try await store.open(documentID: "synthetic-recovered-copy")
                copyValid = copy.revision == 1 && copy.reviewState == .needsReview &&
                    copy.floors[0].rooms[0].label == "Persisted correction" && source?.originalRevision == 2
            }
            let result: [String: Any] = ["drafts": drafts.count, "originalRevision": original.revision,
                "originalUnchanged": original == Fixtures.twoRooms(), "copyValid": copyValid,
                "sourceRetained": source != nil]
            print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))
        case "seed-history":
            let history = try SpatialStore(root: root, limits: .init(undoDepth: 2))
            _ = try await history.create(Fixtures.twoRooms())
            var editor = try EditorSession(Fixtures.twoRooms())
            for revision in 2...120 {
                try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: "History revision \(revision)"), expectedRevision: revision - 1)
                _ = try await history.save(editor.document, expectedRevision: revision - 1, receipt: editor.lastReceipt)
            }
            _ = try await history.archiveCapture(Data("synthetic-retained-raw".utf8), sourceID: "retained-raw", kind: .roomPlanRaw)
            let frozen = try await history.freeze(documentID: id, revision: 10)
            _ = try await history.enqueuePublication(snapshotID: frozen.snapshotID,
                destination: .init(system: .auxiliumos, contextID: "synthetic-project"), expectedPublishedRevision: nil, clientRequestID: "retained-publication")
        case "cleanup-history":
            let preview = try await store.previewHistoryCleanup()
            _ = try await store.applyHistoryCleanup(preview)
        case "resume-history":
            let pending = try await store.pendingHistoryCleanups()
            if pending.isEmpty {
                // This command is an explicit synthetic confirmation when the process died
                // before its intent committed. It never silently authorizes cleanup on open.
                let preview = try await store.previewHistoryCleanup()
                _ = try await store.applyHistoryCleanup(preview)
            } else {
                for operation in pending { _ = try await store.resumeHistoryCleanup(operationID: operation.operationID) }
            }
        case "inspect-history":
            let source = try await store.open(documentID: id)
            let inventory = try await store.storageInventory(), pending = try await store.pendingHistoryCleanups()
            let frozen = try await store.freeze(documentID: id, revision: 10)
            let frozenBytes = try await store.readFrozen(snapshotID: frozen.snapshotID)
            let publication = try await store.publicationArchive(requestID: "retained-publication")
            let queued = try await store.publication(requestID: "retained-publication")
            let raw = try await store.readCapture(sourceID: "retained-raw", kind: .roomPlanRaw)
            let receipt = try await store.editReceipt(documentID: id, revision: 2)
            let files = try FileManager.default.contentsOfDirectory(at: root.appendingPathComponent("artifacts"), includingPropertiesForKeys: nil)
            let result: [String: Any] = ["currentRevision": source.revision,
                "currentLabel": source.floors[0].rooms[0].label, "retired": inventory.retiredHistoryCount,
                "pending": pending.reduce(0) { $0 + $1.pendingSnapshots }, "artifactFiles": files.count,
                "frozenSHA256": ArtifactDigest.sha256(frozenBytes), "publicationSHA256": ArtifactDigest.sha256(publication),
                "exactPublication": ArtifactDigest.sha256(publication) == queued.request.archiveSHA256,
                "rawRetained": raw == Data("synthetic-retained-raw".utf8), "receiptRetained": receipt?.resultingRevision == 2]
            print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]), as: UTF8.self))
        default: throw StoreError.invalidIdentifier
        }
    }
}
