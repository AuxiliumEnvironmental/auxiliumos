// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpatialInterop",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "SpatialInterop", targets: ["SpatialInterop"])],
    dependencies: [.package(path: "../SpatialCore")],
    targets: [
        .target(name: "CSpatialCompression", linkerSettings: [.linkedLibrary("z")]),
        .target(name: "SpatialInterop", dependencies: ["SpatialCore", "CSpatialCompression"],
                resources: [.process("Resources")]),
        .testTarget(name: "SpatialInteropTests", dependencies: ["SpatialInterop", "SpatialCore"])
    ]
)
