import Foundation
import XCTest
import SpatialCore
@testable import SpatialPersistence

final class SpatialPersistenceTests: XCTestCase {
    private enum Injected: Error { case failure }
    private func temporary() throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("spatial-test-" + UUID().uuidString)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return root
    }
    private func edited(_ document: SpatialDocument, label: String = "Corrected room") throws -> SpatialDocument {
        var editor = try EditorSession(document)
        try editor.apply(.renameRoom(floorID: "floor-1", roomID: "room-a", label: label), expectedRevision: document.revision)
        return editor.document
    }

    func testFloorElevationLineagePersistsThroughSaveUndoRedoAndReopen() async throws {
        let root = try temporary(), initial = Fixtures.twoRooms(), store = try SpatialStore(root: root)
        _ = try await store.create(initial)
        var editor = try EditorSession(initial)
        try editor.apply(.updateFloor(floorID: "floor-1", label: "Upper floor", elevation: 3), expectedRevision: 1)
        _ = try await store.save(editor.document, expectedRevision: 1, receipt: editor.lastReceipt)
        let reopened = try SpatialStore(root: root)
        let receipt = try await reopened.editReceipt(documentID: initial.documentID, revision: 2)
        XCTAssertEqual(receipt, editor.lastReceipt)
        for kind in ["floor", "wall", "opening", "room"] {
            XCTAssertTrue(receipt?.mappings.contains { $0.objectKind == kind && !$0.resultingIDs.isEmpty } == true)
        }
        _ = try await reopened.undo(documentID: initial.documentID, expectedRevision: 2)
        let again = try SpatialStore(root: root)
        let undo = try await again.editReceipt(documentID: initial.documentID, revision: 3)
        XCTAssertTrue(undo?.mappings.contains { $0.objectKind == "floor" } == true)
        let redo = try await again.redo(documentID: initial.documentID, expectedRevision: 3)
        XCTAssertEqual(redo.floors[0].elevation, 3)
        let final = try SpatialStore(root: root)
        let redoReceipt = try await final.editReceipt(documentID: initial.documentID, revision: 4)
        XCTAssertTrue(redoReceipt?.mappings.contains { $0.objectKind == "floor" } == true)
    }

    func testSHA256KnownVectors() {
        XCTAssertEqual(ArtifactDigest.sha256(Data()), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
        XCTAssertEqual(ArtifactDigest.sha256(Data("abc".utf8)), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
        XCTAssertEqual(ArtifactDigest.sha256(Data(repeating: 97, count: 1_000_000)), "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0")
    }

    func testSaveReopenAndImmutableFreeze() async throws {
        let root = try temporary(), initial = Fixtures.twoRooms()
        let store = try SpatialStore(root: root)
        let receipt = try await store.create(initial)
        XCTAssertEqual(receipt.sha256, ArtifactDigest.sha256(try initial.encoded()))
        let frozen = try await store.freeze(documentID: initial.documentID, revision: 1)
        let frozenBytes = try await store.readFrozen(snapshotID: frozen.snapshotID)
        _ = try await store.save(edited(initial), expectedRevision: 1)
        let reopened = try SpatialStore(root: root)
        let actual = try await reopened.open(documentID: initial.documentID)
        XCTAssertEqual(actual.revision, 2)
        XCTAssertEqual(actual.floors[0].rooms[0].label, "Corrected room")
        let historical = try await reopened.readFrozen(snapshotID: frozen.snapshotID)
        XCTAssertEqual(historical, frozenBytes)
        let freezeAgain = try await reopened.freeze(documentID: initial.documentID, revision: 1)
        XCTAssertEqual(freezeAgain, frozen)
        let recoveries = try await reopened.recoveryArtifacts()
        XCTAssertEqual(recoveries, [])
    }

    func testUndoRedoPersistAcrossReopenAndBranchInvalidatesRedo() async throws {
        let root = try temporary(), initial = Fixtures.twoRooms()
        let store = try SpatialStore(root: root)
        _ = try await store.create(initial)
        _ = try await store.save(edited(initial), expectedRevision: 1)
        let reopened = try SpatialStore(root: root)
        let undo = try await reopened.undo(documentID: initial.documentID, expectedRevision: 2)
        XCTAssertEqual(undo.revision, 3)
        XCTAssertEqual(undo.floors, initial.floors)
        let reopenedAgain = try SpatialStore(root: root)
        let redo = try await reopenedAgain.redo(documentID: initial.documentID, expectedRevision: 3)
        XCTAssertEqual(redo.revision, 4)
        XCTAssertEqual(redo.floors[0].rooms[0].label, "Corrected room")
        let undoAgain = try await reopenedAgain.undo(documentID: initial.documentID, expectedRevision: 4)
        _ = try await reopenedAgain.save(edited(undoAgain, label: "New branch"), expectedRevision: 5)
        do {
            _ = try await reopenedAgain.redo(documentID: initial.documentID, expectedRevision: 6)
            XCTFail("A new edit must invalidate redo")
        } catch { XCTAssertEqual(error as? StoreError, .nothingToRedo) }
    }

    func testTopologyReceiptSavedAtomicallyAndRetainedOnUndoAfterReopen() async throws {
        let root = try temporary(), initial = Fixtures.twoRooms()
        let store = try SpatialStore(root: root)
        _ = try await store.create(initial)
        var session = try EditorSession(initial)
        try session.apply(.splitWall(floorID: "floor-1", wallID: "w0", offset: 2,
                                    newWallID: "split-wall", newNodeID: "split-node"), expectedRevision: 1)
        let receipt = try XCTUnwrap(session.lastReceipt)
        _ = try await store.save(session.document, expectedRevision: 1, receipt: receipt)
        let reopened = try SpatialStore(root: root)
        let saved = try await reopened.editReceipt(documentID: initial.documentID, revision: 2)
        XCTAssertEqual(saved, receipt)
        _ = try await reopened.undo(documentID: initial.documentID, expectedRevision: 2)
        let undoReceipt = try await reopened.editReceipt(documentID: initial.documentID, revision: 3)
        XCTAssertEqual(undoReceipt?.sourceRevision, 2)
        XCTAssertTrue(undoReceipt?.mappings.contains(where: { $0.sourceID == "split-wall" && $0.resultingIDs.isEmpty }) == true)
        var forged = receipt
        forged.sourceRevision = 100
        var candidate = session.document
        candidate.revision = 4; candidate.parentRevision = 3
        do { _ = try await reopened.save(candidate, expectedRevision: 3, receipt: forged); XCTFail("Forged revision receipt accepted") }
        catch { XCTAssertEqual(error as? StoreError, .invalidRevision) }
        let actual = try await reopened.open(documentID: initial.documentID)
        XCTAssertEqual(actual.revision, 3)
    }

    func testSchemaOneMigrationRetainsDraftAndUnknownStoreVersionFails() async throws {
        let root = try temporary(), initial = Fixtures.twoRooms()
        let store = try SpatialStore(root: root)
        _ = try await store.create(initial)
        let database = try SQLiteConnection(url: root.appendingPathComponent("spatial.sqlite3"))
        try database.execute("DROP TABLE edit_receipts; PRAGMA user_version=1;")
        let migrated = try SpatialStore(root: root)
        let actual = try await migrated.open(documentID: initial.documentID)
        XCTAssertEqual(actual, initial)
        _ = try await migrated.save(edited(initial), expectedRevision: 1)
        let receipt = try await migrated.editReceipt(documentID: initial.documentID, revision: 2)
        XCTAssertEqual(receipt?.resultingRevision, 2)
        try database.execute("PRAGMA user_version=99")
        XCTAssertThrowsError(try SpatialStore(root: root)) { XCTAssertEqual($0 as? StoreError, .unsupportedStoreVersion) }
    }

    func testStaleAndRejectedEditsNeverChangeSavedSource() async throws {
        let store = try SpatialStore(root: temporary()), initial = Fixtures.twoRooms()
        _ = try await store.create(initial)
        let next = try edited(initial)
        _ = try await store.save(next, expectedRevision: 1)
        do { _ = try await store.save(next, expectedRevision: 1); XCTFail("Stale save accepted") }
        catch { XCTAssertEqual(error as? StoreError, .staleRevision(expected: 1, actual: 2)) }
        var invalid = next
        invalid.revision = 3; invalid.parentRevision = 2
        invalid.floors[0].openings[0].width = 1000
        do { _ = try await store.save(invalid, expectedRevision: 2); XCTFail("Invalid geometry accepted") }
        catch { XCTAssertTrue(error is SpatialError) }
        let actual = try await store.open(documentID: initial.documentID)
        XCTAssertEqual(actual, next)
    }

    func testTwoStoresCannotOverwriteSameRevision() async throws {
        let root = try temporary(), initial = Fixtures.twoRooms()
        let a = try SpatialStore(root: root)
        _ = try await a.create(initial)
        let b = try SpatialStore(root: root)
        let first = try edited(initial, label: "First"), second = try edited(initial, label: "Second")
        let results = await withTaskGroup(of: Bool.self, returning: [Bool].self) { group in
            group.addTask { do { _ = try await a.save(first, expectedRevision: 1); return true } catch { return false } }
            group.addTask { do { _ = try await b.save(second, expectedRevision: 1); return true } catch { return false } }
            var result: [Bool] = []
            for await value in group { result.append(value) }
            return result
        }
        XCTAssertEqual(results.filter { $0 }.count, 1)
        let actual = try await a.open(documentID: initial.documentID)
        XCTAssertEqual(actual.revision, 2)
        XCTAssertTrue(["First", "Second"].contains(actual.floors[0].rooms[0].label))
    }

    func testEveryCommitBoundaryRecoversWithoutAcknowledgingPartialDraft() async throws {
        for boundary in [CommitBoundary.stagedFileSynced, .immutableFilePromoted, .beforeDatabaseCommit, .databaseCommitted] {
            let root = try temporary(), initial = Fixtures.twoRooms()
            let good = try SpatialStore(root: root)
            _ = try await good.create(initial)
            let broken = try SpatialStore(root: root, faultInjector: { if $0 == boundary { throw Injected.failure } })
            do { _ = try await broken.save(edited(initial), expectedRevision: 1); XCTFail("Expected fault") }
            catch { XCTAssertTrue(error is Injected) }
            let reopened = try SpatialStore(root: root)
            let actual = try await reopened.open(documentID: initial.documentID)
            let recovery = try await reopened.recoveryArtifacts()
            XCTAssertEqual(actual.revision, boundary == .databaseCommitted ? 2 : 1)
            XCTAssertEqual(recovery.count, boundary == .databaseCommitted ? 0 : 1)
            if boundary == .stagedFileSynced { XCTAssertEqual(recovery.first?.state, .stagedUncommitted) }
        }
    }

    func testRawCaptureSurvivesWithoutNormalizedDraftAndCannotBeOverwritten() async throws {
        let root = try temporary(), raw = Data("synthetic opaque raw capture".utf8)
        let store = try SpatialStore(root: root)
        let first = try await store.archiveCapture(raw, sourceID: "source-a", kind: .roomPlanRaw)
        let repeatReceipt = try await store.archiveCapture(raw, sourceID: "source-a", kind: .roomPlanRaw)
        XCTAssertEqual(first, repeatReceipt)
        do { _ = try await store.archiveCapture(Data("different".utf8), sourceID: "source-a", kind: .roomPlanRaw); XCTFail("Overwrite accepted") }
        catch { XCTAssertEqual(error as? StoreError, .captureIdentityConflict) }
        let reopened = try SpatialStore(root: root)
        let captures = try await reopened.listCaptureArtifacts()
        let bytes = try await reopened.readCapture(sourceID: "source-a", kind: .roomPlanRaw)
        let drafts = try await reopened.listDrafts()
        XCTAssertEqual(captures, [first]); XCTAssertEqual(bytes, raw); XCTAssertTrue(drafts.isEmpty)
    }

    func testRawRecoveryPreservesIdentityAndDoesNotCreateDraft() async throws {
        for boundary in [CommitBoundary.stagedFileSynced, .immutableFilePromoted, .beforeDatabaseCommit] {
            let root = try temporary(), raw = Data("retained-synthetic-raw".utf8)
            let broken = try SpatialStore(root: root, faultInjector: { if $0 == boundary { throw Injected.failure } })
            do { _ = try await broken.archiveCapture(raw, sourceID: "retained-source", kind: .roomPlanRaw); XCTFail("Expected failure") }
            catch { XCTAssertTrue(error is Injected) }
            let reopened = try SpatialStore(root: root)
            let candidates = try await reopened.recoverableCaptures()
            let candidate = try XCTUnwrap(candidates.first)
            XCTAssertEqual(candidates.count, 1)
            XCTAssertEqual(candidate.sourceID, "retained-source")
            XCTAssertEqual(candidate.kind, .roomPlanRaw)
            XCTAssertEqual(candidate.sha256, ArtifactDigest.sha256(raw))
            let receipt = try await reopened.recoverCapture(artifactID: candidate.artifactID)
            let repeatReceipt = try await reopened.recoverCapture(artifactID: candidate.artifactID)
            XCTAssertEqual(receipt, repeatReceipt)
            let restored = try await reopened.readCapture(sourceID: "retained-source", kind: .roomPlanRaw)
            XCTAssertEqual(restored, raw)
            let drafts = try await reopened.listDrafts()
            let remaining = try await reopened.recoverableCaptures()
            XCTAssertTrue(drafts.isEmpty); XCTAssertTrue(remaining.isEmpty)
        }
    }

    func testRecoveryReconcilesIdenticalAlreadyRegisteredSourceOnce() async throws {
        let root = try temporary(), raw = Data("same-retained-source".utf8)
        let broken = try SpatialStore(root: root, faultInjector: { if $0 == .immutableFilePromoted { throw Injected.failure } })
        do { _ = try await broken.archiveCapture(raw, sourceID: "same-source", kind: .roomPlanRaw) } catch {}
        let reopened = try SpatialStore(root: root)
        let candidates = try await reopened.recoverableCaptures()
        let candidate = try XCTUnwrap(candidates.first)
        let registered = try await reopened.archiveCapture(raw, sourceID: "same-source", kind: .roomPlanRaw)
        let recovered = try await reopened.recoverCapture(artifactID: candidate.artifactID)
        XCTAssertEqual(registered, recovered)
        let remaining = try await reopened.recoverableCaptures()
        XCTAssertTrue(remaining.isEmpty)
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.appendingPathComponent("artifacts").appendingPathComponent(candidate.artifactID + ".artifact").path))
    }

    func testIntentWithoutPayloadNeverInventsRecovery() async throws {
        let root = try temporary()
        let broken = try SpatialStore(root: root, faultInjector: { if $0 == .captureIntentSynced { throw Injected.failure } })
        do { _ = try await broken.archiveCapture(Data([1,2]), sourceID: "source", kind: .roomPlanRaw); XCTFail("Expected failure") }
        catch { XCTAssertTrue(error is Injected) }
        let reopened = try SpatialStore(root: root)
        let candidates = try await reopened.recoverableCaptures()
        let retained = try await reopened.recoveryArtifacts()
        XCTAssertTrue(candidates.isEmpty)
        XCTAssertEqual(retained.first?.state, .captureIntentWithoutPayload)
    }

    func testCorruptRecoveryIntentAndConflictingSourceFailWithoutDeletingBytes() async throws {
        for attack in ["digest", "conflict", "duplicate", "traversal"] {
            let root = try temporary(), raw = Data("retained-synthetic-raw".utf8)
            let broken = try SpatialStore(root: root, faultInjector: { if $0 == .stagedFileSynced { throw Injected.failure } })
            do { _ = try await broken.archiveCapture(raw, sourceID: "retained-source", kind: .roomPlanRaw) } catch {}
            let reopened = try SpatialStore(root: root)
            let candidates = try await reopened.recoverableCaptures()
            let id = try XCTUnwrap(candidates.first?.artifactID)
            let intentURL = root.appendingPathComponent("staging").appendingPathComponent(id + ".intent")
            if attack == "conflict" {
                _ = try await reopened.archiveCapture(Data("different".utf8), sourceID: "retained-source", kind: .roomPlanRaw)
            } else {
                var object = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: intentURL)) as? [String: Any])
                if attack == "digest" { object["sha256"] = String(repeating: "0", count: 64) }
                if attack == "traversal" { object["artifactID"] = "../escape" }
                var bytes = try JSONSerialization.data(withJSONObject: object, options: [.sortedKeys])
                if attack == "duplicate" { bytes = Data(("{\"version\":1," + String(decoding: bytes, as: UTF8.self).dropFirst()).utf8) }
                try bytes.write(to: intentURL)
            }
            do { _ = try await reopened.recoverCapture(artifactID: id); XCTFail("Unsafe recovery accepted") }
            catch { if attack == "conflict" { XCTAssertEqual(error as? StoreError, .captureIdentityConflict) } }
            XCTAssertTrue(FileManager.default.fileExists(atPath: intentURL.path))
            let files = try FileManager.default.contentsOfDirectory(at: root.appendingPathComponent("staging"), includingPropertiesForKeys: nil)
                + FileManager.default.contentsOfDirectory(at: root.appendingPathComponent("artifacts"), includingPropertiesForKeys: nil)
            XCTAssertTrue(files.contains(where: { $0.lastPathComponent == id + ".stage" || $0.lastPathComponent == id + ".artifact" }))
        }
    }

    func testLockGateDeniesReadsWritesAndRetainsDraftForUnlock() async throws {
        let store = try SpatialStore(root: temporary()), initial = Fixtures.twoRooms()
        _ = try await store.create(initial)
        await store.setProtectedDataAvailable(false)
        do { _ = try await store.open(documentID: initial.documentID); XCTFail("Locked read accepted") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        do { _ = try await store.save(edited(initial), expectedRevision: 1); XCTFail("Locked write accepted") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        do { _ = try await store.listCaptureArtifacts(); XCTFail("Locked listing accepted") }
        catch { XCTAssertEqual(error as? StoreError, .protectedDataUnavailable) }
        await store.setProtectedDataAvailable(true)
        let restored = try await store.open(documentID: initial.documentID)
        XCTAssertEqual(restored, initial)
    }

    func testArtifactCorruptionAndSymlinkFailClosed() async throws {
        for corruption in ["length", "same-length", "symlink"] {
            let root = try temporary(), initial = Fixtures.twoRooms()
            let store = try SpatialStore(root: root)
            _ = try await store.create(initial)
            let files = try FileManager.default.contentsOfDirectory(at: root.appendingPathComponent("artifacts"), includingPropertiesForKeys: nil)
            let artifact = try XCTUnwrap(files.first)
            if corruption == "symlink" {
                let outside = root.appendingPathComponent("outside.json")
                try initial.encoded().write(to: outside)
                try FileManager.default.removeItem(at: artifact)
                try FileManager.default.createSymbolicLink(at: artifact, withDestinationURL: outside)
            } else if corruption == "same-length" {
                var bytes = try Data(contentsOf: artifact)
                bytes[0] ^= 1
                try bytes.write(to: artifact)
            } else { try Data("corrupt".utf8).write(to: artifact) }
            do { _ = try await store.open(documentID: initial.documentID); XCTFail("Untrusted file accepted") }
            catch { XCTAssertEqual(error as? StoreError, .corruptArtifact) }
        }
    }

    func testUnsafeSourceIDAndSizeLimitsRejectedBeforeArchive() async throws {
        let store = try SpatialStore(root: temporary(), limits: .init(captureBytes: 4))
        do { _ = try await store.archiveCapture(Data([1]), sourceID: "../outside", kind: .roomPlanRaw); XCTFail("Traversal accepted") }
        catch { XCTAssertEqual(error as? StoreError, .invalidIdentifier) }
        do { _ = try await store.archiveCapture(Data(repeating: 1, count: 5), sourceID: "source", kind: .roomPlanRaw); XCTFail("Limit ignored") }
        catch { XCTAssertEqual(error as? StoreError, .sizeLimit) }
        let recoveries = try await store.recoveryArtifacts()
        XCTAssertTrue(recoveries.isEmpty)
    }

    func testReaderRejectsDuplicateEscapedKeysUnknownFieldsAndNonfiniteValues() throws {
        let valid = try Fixtures.twoRooms().encoded()
        let text = String(decoding: valid, as: UTF8.self)
        let attacks = [
            text.replacingOccurrences(of: "\"schemaVersion\" : \"1.0.0\"", with: "\"schemaVersion\" : \"1.0.0\", \"schema\\u0056ersion\": \"1.0.0\""),
            "{\"script\":\"https://external.example\"," + text.dropFirst(),
            text.replacingOccurrences(of: "\"revision\" : 1", with: "\"revision\" : 1e999"),
            text.replacingOccurrences(of: "\"schemaVersion\" : \"1.0.0\"", with: "\"schemaVersion\" : \"2.0.0\"")
        ]
        for attack in attacks { XCTAssertNotEqual(attack, text); XCTAssertThrowsError(try SpatialDocumentReader.decode(Data(attack.utf8))) }
        XCTAssertEqual(try SpatialDocumentReader.decode(valid), Fixtures.twoRooms())
    }

    func testReaderRejectsDeepAndOversizedInputsBeforeDecode() throws {
        let nested = String(repeating: "[", count: 40) + "0" + String(repeating: "]", count: 40)
        XCTAssertThrowsError(try SpatialDocumentReader.decode(Data(nested.utf8)))
        XCTAssertThrowsError(try SpatialDocumentReader.decode(Data(repeating: 32, count: 9), maximumBytes: 8))
        XCTAssertThrowsError(try SpatialDocumentReader.decode(Data("{\"a\":1,\"a\":2}".utf8)))
        XCTAssertThrowsError(try SpatialDocumentReader.decode(Data([0x7b,0x22,0xff,0x22,0x3a,0x31,0x7d])))
    }
}
