import XCTest
@testable import CaptureKit

final class CaptureAdmissionTests: XCTestCase {
    private func admission(supported: Bool = true, camera: Bool = true, active: Bool = true,
                           protected: Bool = true, thermal: Bool = true, storage: Int64? = CaptureStartAdmission.storageReserveBytes) -> CaptureStartAdmission.Rejection? {
        CaptureStartAdmission.rejection(supportedDevice: supported, cameraAuthorized: camera,
            applicationActive: active, protectedDataAvailable: protected, thermalSafe: thermal,
            availableStorageBytes: storage)
    }
    func testEveryRestartPolicyRejectsUnsupportedAndDeniedCamera() {
        // The same admission function is required by first, next, separate and
        // relocalization starts. A failed prior attempt never grants permission.
        for _ in ["first", "next", "separate", "relocalization"] {
            XCTAssertEqual(admission(supported: false), .unsupportedDevice)
            XCTAssertEqual(admission(camera: false), .cameraNotAuthorized)
        }
    }
    func testPermissionRevocationAndBackgroundRequireNewAdmission() {
        XCTAssertNil(admission())
        XCTAssertEqual(admission(camera: false), .cameraNotAuthorized)
        XCTAssertEqual(admission(active: false), .inactiveApplication)
        XCTAssertEqual(admission(protected: false), .protectedDataUnavailable)
        XCTAssertNil(admission())
    }
    func testResourceFailuresCannotBeBypassedByASeparateSession() {
        XCTAssertEqual(admission(thermal: false), .thermalLimit)
        XCTAssertEqual(admission(storage: nil), .insufficientStorage)
        XCTAssertEqual(admission(storage: -1), .insufficientStorage)
        XCTAssertEqual(admission(storage: CaptureStartAdmission.storageReserveBytes - 1), .insufficientStorage)
        XCTAssertNil(admission(storage: CaptureStartAdmission.storageReserveBytes))
    }
}
