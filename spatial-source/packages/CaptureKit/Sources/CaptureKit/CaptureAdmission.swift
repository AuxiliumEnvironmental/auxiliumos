import Foundation

/// One policy for every native sensor-start path. It evaluates observations
/// supplied immediately before use; it grants neither camera permission nor
/// company-workspace access and is not a hardware capability test itself.
public enum CaptureStartAdmission {
    public static let storageReserveBytes: Int64 = 512 * 1024 * 1024
    public enum Rejection: String, Equatable, Sendable {
        case unsupportedDevice, cameraNotAuthorized, inactiveApplication
        case protectedDataUnavailable, thermalLimit, insufficientStorage
    }
    public static func rejection(supportedDevice: Bool, cameraAuthorized: Bool,
                                 applicationActive: Bool, protectedDataAvailable: Bool,
                                 thermalSafe: Bool, availableStorageBytes: Int64?) -> Rejection? {
        guard supportedDevice else { return .unsupportedDevice }
        guard cameraAuthorized else { return .cameraNotAuthorized }
        guard applicationActive else { return .inactiveApplication }
        guard protectedDataAvailable else { return .protectedDataUnavailable }
        guard thermalSafe else { return .thermalLimit }
        guard let availableStorageBytes, availableStorageBytes >= storageReserveBytes else { return .insufficientStorage }
        return nil
    }
}
