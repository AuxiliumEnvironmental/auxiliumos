import Foundation

/// A durable admission record, not a measurement or a substitute for ARKit
/// tracking. The native adapter supplies observed session and map events.
public struct ConnectedRoomContext: Codable, Equatable, Sendable {
    public enum Alignment: String, Codable, Sendable { case first, continuous, relocalized, separate }
    public var journeyID: String
    public var frameID: String
    public var sessionID: String
    public var sourceID: String
    public var outputDocumentID: String
    public var previousSourceIDs: [String]
    public var expectedRevision: Int
    public var alignment: Alignment
    public var relocalizedMapSourceID: String?
    public init(journeyID: String, frameID: String, sessionID: String, sourceID: String,
                outputDocumentID: String, previousSourceIDs: [String], expectedRevision: Int,
                alignment: Alignment, relocalizedMapSourceID: String? = nil) {
        self.journeyID = journeyID; self.frameID = frameID; self.sessionID = sessionID
        self.sourceID = sourceID; self.outputDocumentID = outputDocumentID
        self.previousSourceIDs = previousSourceIDs; self.expectedRevision = expectedRevision
        self.alignment = alignment; self.relocalizedMapSourceID = relocalizedMapSourceID
    }
}

public enum CaptureConnectionError: Error, Equatable { case incompatibleSpace, invalidRecord, duplicateSource, capacity }

/// Exact plane admission only. The caller supplies its existing geometry
/// equivalence tolerance; this does not infer or round distinct floor levels.
public enum CaptureFloorPlaneAdmission {
    public static func elevation(_ samples: [Double], exactTolerance: Double) throws -> Double {
        guard !samples.isEmpty, samples.allSatisfy(\.isFinite), exactTolerance.isFinite, exactTolerance >= 0,
              let minimum = samples.min(), let maximum = samples.max() else { throw CaptureConnectionError.invalidRecord }
        guard maximum - minimum <= exactTolerance else { throw CaptureConnectionError.incompatibleSpace }
        return minimum
    }
}

/// Fail closed before StructureBuilder. Names, addresses and similar geometry
/// never supply coordinate compatibility. The archive loader additionally checks
/// each immutable room context against the ID used to retrieve it.
public enum CaptureCompatibility {
    public static let maximumRooms = 100 // Safety bound, not a sensor-size claim.
    public static func validate(_ rooms: [ConnectedRoomContext]) throws {
        guard !rooms.isEmpty, rooms.count <= maximumRooms else { throw CaptureConnectionError.capacity }
        let first = rooms[0]
        var sources: [String] = []
        for (index, room) in rooms.enumerated() {
            guard [room.journeyID, room.frameID, room.sessionID, room.sourceID, room.outputDocumentID].allSatisfy({ UUID(uuidString: $0) != nil }),
                  room.expectedRevision >= 0 else { throw CaptureConnectionError.invalidRecord }
            guard !sources.contains(room.sourceID) else { throw CaptureConnectionError.duplicateSource }
            guard room.journeyID == first.journeyID, room.frameID == first.frameID,
                  room.outputDocumentID == first.outputDocumentID,
                  room.previousSourceIDs == sources else { throw CaptureConnectionError.incompatibleSpace }
            if index == 0 {
                guard room.alignment == .first, room.expectedRevision == 0,
                      room.outputDocumentID == room.sourceID, room.relocalizedMapSourceID == nil else {
                    throw CaptureConnectionError.incompatibleSpace
                }
            } else {
                guard room.expectedRevision == index else { throw CaptureConnectionError.incompatibleSpace }
                switch room.alignment {
                case .continuous:
                    guard room.sessionID == rooms[index - 1].sessionID,
                          room.relocalizedMapSourceID == nil else { throw CaptureConnectionError.incompatibleSpace }
                case .relocalized:
                    guard let map = room.relocalizedMapSourceID, sources.contains(map) else { throw CaptureConnectionError.incompatibleSpace }
                case .first, .separate: throw CaptureConnectionError.incompatibleSpace
                }
            }
            sources.append(room.sourceID)
        }
    }
}

/// Portable policy for a guided walkthrough. No Apple sensor behavior is mocked
/// into acceptance: this only tests the admission decisions after real events.
public struct ConnectedCaptureLifecycle: Equatable, Sendable {
    public enum Tracking: Equatable, Sendable { case unavailable, limited, relocalizing, normal }
    public enum Continuity: String, Sendable { case starting, continuous, broken, relocalizing, closed }
    public struct RetainedRoom: Equatable, Sendable {
        public let sourceID: String
        public let documentID: String
        public let revision: Int
        public let joined: Bool
    }
    public private(set) var journeyID = UUID().uuidString
    public private(set) var frameID = UUID().uuidString
    public private(set) var sessionID: String?
    public private(set) var continuity: Continuity = .starting
    public private(set) var tracking: Tracking = .unavailable
    public private(set) var active: ConnectedRoomContext?
    public private(set) var retained: [RetainedRoom] = []
    public private(set) var compatibleSourceIDs: [String] = []
    public private(set) var lastRevision = 0
    public private(set) var mapSourceID: String?
    private var observedRelocalizing = false
    private var nextAlignment: ConnectedRoomContext.Alignment = .first
    private var loadedMapSourceID: String?
    public init() {}

    /// A relaunched process has no live alignment, even when all source records
    /// match. Only a verified map relocalization may admit the next room.
    public init(restoring contexts: [ConnectedRoomContext], savedRevision: Int, mapSourceID: String) throws {
        try CaptureCompatibility.validate(contexts)
        guard let last = contexts.last, savedRevision == contexts.count,
              contexts.contains(where: { $0.sourceID == mapSourceID }) else { throw CaptureConnectionError.incompatibleSpace }
        journeyID = last.journeyID; frameID = last.frameID; sessionID = nil
        continuity = .broken; tracking = .unavailable; lastRevision = savedRevision
        compatibleSourceIDs = contexts.map(\.sourceID); self.mapSourceID = mapSourceID
        retained = contexts.enumerated().map { index, room in
            RetainedRoom(sourceID: room.sourceID, documentID: room.outputDocumentID, revision: index + 1, joined: true)
        }
        nextAlignment = .continuous
    }

    public var canStartRoom: Bool {
        active == nil && [.starting, .continuous].contains(continuity) && tracking == .normal && compatibleSourceIDs.count < CaptureCompatibility.maximumRooms
    }
    public var canRelocalize: Bool { active == nil && continuity == .broken && mapSourceID != nil }

    @discardableResult public mutating func attachSession(_ id: String) -> Bool {
        guard UUID(uuidString: id) != nil, sessionID == nil, continuity == .starting else { return false }
        sessionID = id; return true
    }
    public mutating func observeTracking(_ state: Tracking, sessionID observedSession: String, invalidateActive: Bool = true) {
        guard sessionID == observedSession, continuity != .closed else { return }
        tracking = state
        if continuity == .relocalizing {
            if state == .relocalizing { observedRelocalizing = true }
            if state == .normal && observedRelocalizing {
                continuity = .continuous; nextAlignment = .relocalized
            }
        } else if state == .relocalizing || state == .unavailable {
            if continuity == .continuous || active != nil { interrupt(invalidateActive: invalidateActive) }
        }
    }
    public mutating func beginRoom(sourceID: String) -> ConnectedRoomContext? {
        guard canStartRoom, let sessionID, UUID(uuidString: sourceID) != nil,
              !retained.contains(where: { $0.sourceID == sourceID }) else { return nil }
        let value = ConnectedRoomContext(journeyID: journeyID, frameID: frameID, sessionID: sessionID,
            sourceID: sourceID, outputDocumentID: compatibleSourceIDs.first ?? sourceID,
            previousSourceIDs: compatibleSourceIDs, expectedRevision: lastRevision,
            alignment: compatibleSourceIDs.isEmpty ? .first : nextAlignment,
            relocalizedMapSourceID: nextAlignment == .relocalized ? loadedMapSourceID : nil)
        active = value; continuity = .continuous; return value
    }
    /// Invalidate the active segment only while it was still acquiring sensor
    /// data. An interruption during archive/normalization cannot erase the fact
    /// that its already-returned source was captured before the interruption.
    public mutating func interrupt(invalidateActive: Bool) {
        guard continuity != .closed else { return }
        continuity = .broken; tracking = .unavailable
        if invalidateActive, var value = active {
            value.frameID = value.sourceID; value.outputDocumentID = value.sourceID
            value.previousSourceIDs = []; value.expectedRevision = 0
            value.alignment = .separate; value.relocalizedMapSourceID = nil; active = value
        }
    }
    @discardableResult public mutating func roomSaved(sourceID: String, documentID: String, revision: Int) -> Bool {
        guard let value = active, value.sourceID == sourceID, revision > 0,
              !retained.contains(where: { $0.sourceID == sourceID }) else { return false }
        let joined = value.alignment != .separate && documentID == value.outputDocumentID && revision == value.expectedRevision + 1
        guard joined || documentID == sourceID else { return false }
        retained.append(.init(sourceID: sourceID, documentID: documentID, revision: revision, joined: joined))
        if joined {
            compatibleSourceIDs.append(sourceID); lastRevision = revision
            nextAlignment = .continuous; loadedMapSourceID = nil
        } else { continuity = .broken }
        active = nil; return true
    }
    /// A failed/cancelled room keeps its raw archive but does not become a room
    /// counted as saved, and never enters the compatible StructureBuilder list.
    @discardableResult public mutating func abandonRoom(sourceID: String) -> Bool {
        guard active?.sourceID == sourceID else { return false }
        active = nil; continuity = .broken; tracking = .unavailable; return true
    }
    @discardableResult public mutating func worldMapSaved(sourceID: String, sessionID observedSession: String) -> Bool {
        guard sessionID == observedSession, continuity == .continuous, tracking == .normal,
              active == nil, compatibleSourceIDs.last == sourceID else { return false }
        mapSourceID = sourceID; return true
    }
    @discardableResult public mutating func beginRelocalization(mapSourceID requestedMap: String, newSessionID: String) -> Bool {
        guard canRelocalize, requestedMap == mapSourceID, UUID(uuidString: newSessionID) != nil else { return false }
        sessionID = newSessionID; loadedMapSourceID = requestedMap
        observedRelocalizing = false; tracking = .unavailable; continuity = .relocalizing; return true
    }
    public mutating func relocalizationFailed() {
        guard continuity == .relocalizing else { return }
        continuity = .broken; tracking = .unavailable; loadedMapSourceID = nil; observedRelocalizing = false
    }
    @discardableResult public mutating func startSeparateSegment(sessionID newSessionID: String) -> Bool {
        guard active == nil, continuity != .closed, UUID(uuidString: newSessionID) != nil else { return false }
        journeyID = UUID().uuidString; frameID = UUID().uuidString; sessionID = newSessionID
        compatibleSourceIDs = []; lastRevision = 0; mapSourceID = nil; loadedMapSourceID = nil
        nextAlignment = .first; observedRelocalizing = false; tracking = .unavailable; continuity = .starting; return true
    }
    public mutating func close() { continuity = .closed; tracking = .unavailable }
}
