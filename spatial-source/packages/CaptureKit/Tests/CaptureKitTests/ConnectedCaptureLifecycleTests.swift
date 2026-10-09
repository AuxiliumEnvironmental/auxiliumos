import XCTest
@testable import CaptureKit

final class ConnectedCaptureLifecycleTests: XCTestCase {
    private func ready() throws -> (ConnectedCaptureLifecycle, String) {
        var walk = ConnectedCaptureLifecycle(); let session = UUID().uuidString
        XCTAssertTrue(walk.attachSession(session)); XCTAssertFalse(walk.canStartRoom)
        walk.observeTracking(.normal, sessionID: session); return (walk, session)
    }
    private func first(_ walk: inout ConnectedCaptureLifecycle) throws -> ConnectedRoomContext {
        let room = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertTrue(walk.roomSaved(sourceID: room.sourceID, documentID: room.outputDocumentID, revision: 1))
        return room
    }
    func testContinuousRoomsShareFrameButNotRawIdentity() throws {
        var (walk, session) = try ready(); let one = try first(&walk)
        let two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertEqual(two.previousSourceIDs, [one.sourceID]); XCTAssertEqual(two.frameID, one.frameID)
        XCTAssertEqual(two.sessionID, session); XCTAssertEqual(two.outputDocumentID, one.outputDocumentID)
        XCTAssertEqual(two.expectedRevision, 1); XCTAssertNotEqual(two.sourceID, one.sourceID)
        try CaptureCompatibility.validate([one, two])
    }
    func testDuplicateStartAndSaveCannotAdvanceRoomCount() throws {
        var (walk, _) = try ready(); let room = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertNil(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertFalse(walk.roomSaved(sourceID: UUID().uuidString, documentID: room.sourceID, revision: 1))
        XCTAssertTrue(walk.roomSaved(sourceID: room.sourceID, documentID: room.sourceID, revision: 1))
        XCTAssertFalse(walk.roomSaved(sourceID: room.sourceID, documentID: room.sourceID, revision: 1))
        XCTAssertNil(walk.beginRoom(sourceID: room.sourceID)); XCTAssertEqual(walk.retained.count, 1)
    }
    func testInterruptedActiveRoomBecomesIndependentAndRetainedRoomSurvives() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        let two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        walk.interrupt(invalidateActive: true)
        let changed = try XCTUnwrap(walk.active)
        XCTAssertEqual(changed.alignment, .separate); XCTAssertTrue(changed.previousSourceIDs.isEmpty)
        XCTAssertEqual(changed.outputDocumentID, two.sourceID); XCTAssertNotEqual(changed.frameID, one.frameID)
        XCTAssertTrue(walk.roomSaved(sourceID: two.sourceID, documentID: two.sourceID, revision: 1))
        XCTAssertEqual(walk.retained.count, 2); XCTAssertEqual(walk.compatibleSourceIDs, [one.sourceID])
        XCTAssertFalse(walk.canStartRoom)
    }
    func testInterruptionAfterSourceReturnDoesNotInvalidateEarlierSensorResult() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        let two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        walk.interrupt(invalidateActive: false)
        XCTAssertEqual(walk.active, two)
        XCTAssertTrue(walk.roomSaved(sourceID: two.sourceID, documentID: one.sourceID, revision: 2))
        XCTAssertEqual(walk.compatibleSourceIDs, [one.sourceID, two.sourceID]); XCTAssertFalse(walk.canStartRoom)
    }
    func testNormalTrackingAfterInterruptionAloneDoesNotProveRelocalization() throws {
        var (walk, session) = try ready(); _ = try first(&walk)
        walk.interrupt(invalidateActive: false); walk.observeTracking(.normal, sessionID: session)
        XCTAssertEqual(walk.continuity, .broken); XCTAssertFalse(walk.canStartRoom); XCTAssertFalse(walk.canRelocalize)
    }
    func testKnownSavedMapAndRelocalizingToNormalRequired() throws {
        var (walk, session) = try ready(); let one = try first(&walk)
        XCTAssertTrue(walk.worldMapSaved(sourceID: one.sourceID, sessionID: session))
        walk.interrupt(invalidateActive: false); let restoredSession = UUID().uuidString
        XCTAssertFalse(walk.beginRelocalization(mapSourceID: UUID().uuidString, newSessionID: restoredSession))
        XCTAssertTrue(walk.beginRelocalization(mapSourceID: one.sourceID, newSessionID: restoredSession))
        walk.observeTracking(.normal, sessionID: restoredSession); XCTAssertFalse(walk.canStartRoom)
        walk.observeTracking(.relocalizing, sessionID: restoredSession); XCTAssertFalse(walk.canStartRoom)
        walk.observeTracking(.normal, sessionID: session); XCTAssertFalse(walk.canStartRoom)
        walk.observeTracking(.normal, sessionID: restoredSession); XCTAssertTrue(walk.canStartRoom)
        let two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertEqual(two.alignment, .relocalized); XCTAssertEqual(two.relocalizedMapSourceID, one.sourceID)
        try CaptureCompatibility.validate([one, two])
    }
    func testRelocalizationTimeoutAndSeparateFallbackKeepCompletedRooms() throws {
        var (walk, session) = try ready(); let one = try first(&walk)
        XCTAssertTrue(walk.worldMapSaved(sourceID: one.sourceID, sessionID: session)); walk.interrupt(invalidateActive: false)
        XCTAssertTrue(walk.beginRelocalization(mapSourceID: one.sourceID, newSessionID: UUID().uuidString))
        walk.relocalizationFailed(); XCTAssertEqual(walk.continuity, .broken)
        let newSession = UUID().uuidString; XCTAssertTrue(walk.startSeparateSegment(sessionID: newSession))
        XCTAssertEqual(walk.retained.count, 1); XCTAssertTrue(walk.compatibleSourceIDs.isEmpty)
        walk.observeTracking(.normal, sessionID: newSession)
        let other = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertNotEqual(other.frameID, one.frameID); XCTAssertNotEqual(other.journeyID, one.journeyID)
        XCTAssertEqual(other.expectedRevision, 0); XCTAssertEqual(other.alignment, .first)
    }
    func testFailedOrCancelledRoomIsNotCountedAsSaved() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        let room = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertFalse(walk.abandonRoom(sourceID: UUID().uuidString)); XCTAssertTrue(walk.abandonRoom(sourceID: room.sourceID))
        XCTAssertEqual(walk.retained.count, 1); XCTAssertEqual(walk.compatibleSourceIDs, [one.sourceID])
        XCTAssertFalse(walk.roomSaved(sourceID: room.sourceID, documentID: room.sourceID, revision: 1))
    }
    func testStaleSessionEventsCannotChangeContinuity() throws {
        var (walk, _) = try ready(); _ = try first(&walk)
        walk.observeTracking(.unavailable, sessionID: UUID().uuidString)
        XCTAssertTrue(walk.canStartRoom); XCTAssertEqual(walk.continuity, .continuous)
    }
    func testClosedJourneyCannotRestartOrAcceptTracking() throws {
        var (walk, session) = try ready(); _ = try first(&walk); walk.close()
        walk.observeTracking(.normal, sessionID: session)
        XCTAssertFalse(walk.canStartRoom); XCTAssertFalse(walk.startSeparateSegment(sessionID: UUID().uuidString))
        XCTAssertFalse(walk.attachSession(UUID().uuidString))
    }
    func testCompatibilityRejectsDifferentFramesSessionsAndOrder() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        let two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        var altered = two; altered.frameID = UUID().uuidString
        XCTAssertThrowsError(try CaptureCompatibility.validate([one, altered]))
        altered = two; altered.sessionID = UUID().uuidString
        XCTAssertThrowsError(try CaptureCompatibility.validate([one, altered]))
        altered = two; altered.previousSourceIDs = []
        XCTAssertThrowsError(try CaptureCompatibility.validate([one, altered]))
        XCTAssertThrowsError(try CaptureCompatibility.validate([two, one]))
    }
    func testCompatibilityRejectsDuplicateSourceAndFakeMap() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        var two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        two.sourceID = one.sourceID; XCTAssertThrowsError(try CaptureCompatibility.validate([one, two]))
        two.sourceID = UUID().uuidString; two.alignment = .relocalized; two.relocalizedMapSourceID = UUID().uuidString
        XCTAssertThrowsError(try CaptureCompatibility.validate([one, two]))
    }
    func testCompatibilityRejectsChangedDraftRevisionAndMalformedIdentity() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        var two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        two.expectedRevision = 9; XCTAssertThrowsError(try CaptureCompatibility.validate([one, two]))
        two.expectedRevision = 1; two.sourceID = "not-an-identity"
        XCTAssertThrowsError(try CaptureCompatibility.validate([one, two]))
    }
    func testRoomSaveCannotJoinWrongDocumentOrRevision() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        let two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        XCTAssertFalse(walk.roomSaved(sourceID: two.sourceID, documentID: one.sourceID, revision: 99))
        XCTAssertFalse(walk.roomSaved(sourceID: two.sourceID, documentID: UUID().uuidString, revision: 2))
        XCTAssertEqual(walk.retained.count, 1)
    }
    func testRelaunchRestoresRoomsButNeverLiveAlignment() throws {
        var (walk, _) = try ready(); let one = try first(&walk)
        let restored = try ConnectedCaptureLifecycle(restoring: [one], savedRevision: 1, mapSourceID: one.sourceID)
        XCTAssertEqual(restored.retained.count, 1); XCTAssertEqual(restored.continuity, .broken)
        XCTAssertFalse(restored.canStartRoom); XCTAssertTrue(restored.canRelocalize); XCTAssertNil(restored.sessionID)
        XCTAssertThrowsError(try ConnectedCaptureLifecycle(restoring: [one], savedRevision: 2, mapSourceID: one.sourceID))
        XCTAssertThrowsError(try ConnectedCaptureLifecycle(restoring: [one], savedRevision: 1, mapSourceID: UUID().uuidString))
    }
    func testTrackingLossDuringArchiveDoesNotRewriteReturnedCaptureContext() throws {
        var (walk, session) = try ready(); _ = try first(&walk)
        let two = try XCTUnwrap(walk.beginRoom(sourceID: UUID().uuidString))
        walk.observeTracking(.unavailable, sessionID: session, invalidateActive: false)
        XCTAssertEqual(walk.active, two); XCTAssertEqual(walk.continuity, .broken)
    }
    func testMixedAndSlopedFloorLevelsAreNeverFlattened() throws {
        XCTAssertEqual(try CaptureFloorPlaneAdmission.elevation([1.2, 1.2, 1.2], exactTolerance: 0.000001), 1.2)
        XCTAssertThrowsError(try CaptureFloorPlaneAdmission.elevation([0, 0.15, 0], exactTolerance: 0.000001))
        XCTAssertThrowsError(try CaptureFloorPlaneAdmission.elevation([0, 0.01, 0.02], exactTolerance: 0.000001))
    }
    func testFloorAdmissionRejectsInvalidSamplesAndTolerance() throws {
        XCTAssertThrowsError(try CaptureFloorPlaneAdmission.elevation([], exactTolerance: 0.000001))
        XCTAssertThrowsError(try CaptureFloorPlaneAdmission.elevation([.nan], exactTolerance: 0.000001))
        XCTAssertThrowsError(try CaptureFloorPlaneAdmission.elevation([0, .infinity], exactTolerance: 0.000001))
        XCTAssertThrowsError(try CaptureFloorPlaneAdmission.elevation([0], exactTolerance: -1))
        XCTAssertThrowsError(try CaptureFloorPlaneAdmission.elevation([0], exactTolerance: .infinity))
    }
}
