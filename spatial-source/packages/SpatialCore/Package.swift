// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpatialCore",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [
        .library(name: "SpatialCore", targets: ["SpatialCore"]),
        .executable(name: "spatialcheck", targets: ["spatialcheck"])
    ],
    targets: [
        .target(name: "SpatialCore"),
        .executableTarget(name: "spatialcheck", dependencies: ["SpatialCore"]),
        .testTarget(name: "SpatialCoreTests", dependencies: ["SpatialCore"])
    ]
)
