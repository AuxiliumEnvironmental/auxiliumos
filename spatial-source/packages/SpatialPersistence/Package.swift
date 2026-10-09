// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SpatialPersistence",
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "SpatialPersistence", targets: ["SpatialPersistence"]),
               .executable(name: "spatialstorecheck", targets: ["spatialstorecheck"])],
    dependencies: [.package(path: "../SpatialCore"), .package(path: "../SpatialInterop")],
    targets: [
        .systemLibrary(name: "CSQLite", pkgConfig: "sqlite3", providers: [.apt(["libsqlite3-dev"]), .brew(["sqlite3"])]),
        .target(name: "SpatialPersistence", dependencies: ["CSQLite", "SpatialCore", "SpatialInterop"]),
        .executableTarget(name: "spatialstorecheck", dependencies: ["SpatialPersistence", "SpatialCore"]),
        .testTarget(name: "SpatialPersistenceTests", dependencies: ["SpatialPersistence", "SpatialCore"])
    ]
)
