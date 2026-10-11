import Foundation
import SpatialCore

func run() throws {
    let args = Array(CommandLine.arguments.dropFirst())
    if args.count == 2 && args[0] == "fixture" {
        let folder = URL(fileURLWithPath:args[1],isDirectory:true)
        try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true)
        let doc = Fixtures.twoRooms()
        try doc.encoded().write(to:folder.appendingPathComponent("geometry.json"),options:.atomic)
        try SVGExporter.render(document:doc,floorID:"floor-1").write(to:folder.appendingPathComponent("floorplan.svg"),atomically:true,encoding:.utf8)
        let encoder=JSONEncoder(); encoder.outputFormatting=[.prettyPrinted,.sortedKeys]
        try encoder.encode(SceneBuilder.build(document:doc,floorID:"floor-1")).write(to:folder.appendingPathComponent("scene.json"),options:.atomic)
        print("Wrote synthetic geometry, SVG and graphic-scene fixtures; no scan, native UI or cloud validation is implied.")
        return
    }
    if args.count == 2 && args[0] == "validate" {
        let url=URL(fileURLWithPath:args[1])
        let attrs=try FileManager.default.attributesOfItem(atPath:url.path)
        guard (attrs[.size] as? NSNumber)?.intValue ?? Int.max <= 25*1024*1024 else { throw SpatialError.tooLarge }
        let doc=try JSONDecoder().decode(SpatialDocument.self,from:Data(contentsOf:url))
        try Validator.requireValid(doc)
        for floor in doc.floors { _ = try SceneBuilder.build(document:doc,floorID:floor.id) }
        print("Valid semantic geometry and scene generation for \(doc.floors.count) floor(s). Use tools/validate_package.py for strict external-file schema checks.")
        return
    }
    print("Usage: spatialcheck fixture OUTPUT_DIRECTORY | spatialcheck validate GEOMETRY_JSON")
    exit(2)
}
do { try run() } catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8)); exit(1)
}
