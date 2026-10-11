import Foundation

/// Portable admission control, not a RoomPlan or device test. A generation is
/// permanently attached to a delegate instance, never read from a newer attempt.
public struct CaptureLifecycle: Equatable, Sendable {
    public enum Phase: String, Codable, Sendable {
        case idle, preflight, capturing, finishing, archiving, processing, saving
        case draftReady, cancelled, failed
    }
    public private(set) var generation: UUID?
    public private(set) var phase: Phase = .idle
    public private(set) var rawRetained = false
    public private(set) var cancelled = false
    public private(set) var awaitingLateReturn = false

    public init() {}
    @discardableResult public mutating func begin() -> UUID? {
        guard [.idle, .cancelled, .failed, .draftReady].contains(phase) else { return nil }
        let id = UUID(); generation = id; phase = .preflight
        rawRetained = false; cancelled = false; awaitingLateReturn = false
        return id
    }
    @discardableResult public mutating func started(_ id: UUID) -> Bool {
        guard generation == id, phase == .preflight else { return false }
        phase = .capturing; return true
    }
    /// Restoring an already-saved draft is not a new sensor capture or raw-save
    /// acknowledgement. It only makes navigation/continuation controls ready.
    @discardableResult public mutating func restoredDraft(_ id: UUID) -> Bool {
        guard generation == id, phase == .preflight else { return false }
        phase = .draftReady; return true
    }
    @discardableResult public mutating func finish(_ id: UUID, cancel: Bool = false) -> Bool {
        guard generation == id, phase == .capturing else { return false }
        cancelled = cancel; phase = .finishing; return true
    }
    @discardableResult public mutating func received(_ id: UUID) -> Bool {
        guard generation == id, [.capturing, .finishing].contains(phase) || (phase == .failed && awaitingLateReturn) else { return false }
        awaitingLateReturn = false; phase = .archiving; return true
    }
    @discardableResult public mutating func archived(_ id: UUID) -> Bool {
        guard generation == id, phase == .archiving else { return false }
        rawRetained = true; phase = cancelled ? .cancelled : .processing; return true
    }
    @discardableResult public mutating func processed(_ id: UUID) -> Bool {
        guard generation == id, phase == .processing else { return false }
        phase = .saving; return true
    }
    @discardableResult public mutating func saved(_ id: UUID) -> Bool {
        guard generation == id, phase == .saving else { return false }
        phase = .draftReady; return true
    }
    @discardableResult public mutating func finishTimedOut(_ id: UUID) -> Bool {
        guard generation == id, phase == .finishing else { return false }
        awaitingLateReturn = true; phase = .failed; return true
    }
    @discardableResult public mutating func failed(_ id: UUID) -> Bool {
        guard generation == id, ![.idle, .draftReady, .cancelled].contains(phase) else { return false }
        phase = .failed; return true
    }
    @discardableResult public mutating func retry(_ id: UUID) -> Bool {
        guard generation == id, phase == .failed else { return false }
        phase = rawRetained ? .processing : .archiving; return true
    }
    public func accepts(_ id: UUID) -> Bool { generation == id }
}
