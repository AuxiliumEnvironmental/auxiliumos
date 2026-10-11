import XCTest
@testable import CaptureKit

final class CaptureLifecycleTests: XCTestCase {
    func testDuplicateStartFinishAndCallbackCannotCreateAnotherSegment() throws {
        var lifecycle = CaptureLifecycle()
        let id = try XCTUnwrap(lifecycle.begin())
        XCTAssertNil(lifecycle.begin()); XCTAssertTrue(lifecycle.started(id))
        XCTAssertTrue(lifecycle.finish(id)); XCTAssertFalse(lifecycle.finish(id))
        XCTAssertTrue(lifecycle.received(id)); XCTAssertFalse(lifecycle.received(id))
        XCTAssertTrue(lifecycle.archived(id)); XCTAssertTrue(lifecycle.rawRetained)
        XCTAssertTrue(lifecycle.processed(id)); XCTAssertTrue(lifecycle.saved(id))
        XCTAssertFalse(lifecycle.received(id)); XCTAssertEqual(lifecycle.phase, .draftReady)
    }
    func testLateOldGenerationCannotReplaceNewAttempt() throws {
        var lifecycle = CaptureLifecycle()
        let first = try XCTUnwrap(lifecycle.begin())
        XCTAssertTrue(lifecycle.failed(first))
        let second = try XCTUnwrap(lifecycle.begin())
        XCTAssertNotEqual(first, second); XCTAssertFalse(lifecycle.started(first))
        XCTAssertFalse(lifecycle.received(first)); XCTAssertFalse(lifecycle.saved(first))
        XCTAssertTrue(lifecycle.started(second)); XCTAssertEqual(lifecycle.phase, .capturing)
    }
    func testCancellationRetainsRawWithoutPublishingDraft() throws {
        var lifecycle = CaptureLifecycle()
        let id = try XCTUnwrap(lifecycle.begin())
        XCTAssertTrue(lifecycle.started(id)); XCTAssertTrue(lifecycle.finish(id, cancel: true))
        XCTAssertTrue(lifecycle.received(id)); XCTAssertTrue(lifecycle.archived(id))
        XCTAssertEqual(lifecycle.phase, .cancelled); XCTAssertTrue(lifecycle.rawRetained)
        XCTAssertFalse(lifecycle.processed(id)); XCTAssertFalse(lifecycle.saved(id))
    }
    func testTimedOutFinishStillArchivesOneLateSameGenerationReturn() throws {
        var lifecycle = CaptureLifecycle()
        let id = try XCTUnwrap(lifecycle.begin())
        XCTAssertTrue(lifecycle.started(id)); XCTAssertTrue(lifecycle.finish(id))
        XCTAssertTrue(lifecycle.finishTimedOut(id)); XCTAssertEqual(lifecycle.phase, .failed)
        XCTAssertTrue(lifecycle.received(id)); XCTAssertFalse(lifecycle.received(id))
        XCTAssertTrue(lifecycle.archived(id)); XCTAssertTrue(lifecycle.rawRetained)
        XCTAssertTrue(lifecycle.failed(id)); XCTAssertFalse(lifecycle.received(id))
        XCTAssertTrue(lifecycle.retry(id)); XCTAssertEqual(lifecycle.phase, .processing)
    }
    func testFailureDoesNotInventArchiveReceipt() throws {
        var lifecycle = CaptureLifecycle()
        let id = try XCTUnwrap(lifecycle.begin())
        XCTAssertTrue(lifecycle.started(id)); XCTAssertTrue(lifecycle.received(id))
        XCTAssertTrue(lifecycle.failed(id)); XCTAssertFalse(lifecycle.rawRetained)
        XCTAssertEqual(lifecycle.phase, .failed)
    }
    func testRestoredDraftIsReadyWithoutClaimingANewRawCaptureSave() throws {
        var lifecycle = CaptureLifecycle(); let id = try XCTUnwrap(lifecycle.begin())
        XCTAssertFalse(lifecycle.restoredDraft(UUID())); XCTAssertTrue(lifecycle.restoredDraft(id))
        XCTAssertEqual(lifecycle.phase, .draftReady); XCTAssertFalse(lifecycle.rawRetained)
        XCTAssertFalse(lifecycle.received(id)); XCTAssertNotNil(lifecycle.begin())
    }
}
