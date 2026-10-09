import Foundation
import CSpatialCompression

/// Bounded stored-ZIP dialect for the separately versioned local-document profile.
/// It does not alter the original four-file ZIP reader or extract to disk.
enum ProfileArchive {
    static let maxMembers = 4096
    static func validPath(_ name: String) -> Bool {
        if name == "geometry.json" || name == "manifest.json" { return true }
        let parts = name.split(separator: "/", omittingEmptySubsequences: false)
        guard parts.count == 3, parts[0] == "floors", parts[1].count == 4,
              parts[1].utf8.allSatisfy({ (48...57).contains($0) }), let floor = Int(parts[1]), floor < 100 else { return false }
        if ["scene.json", "model.glb", "floorplan.pdf"].contains(String(parts[2])) { return true }
        let file = String(parts[2])
        guard file.hasPrefix("floorplan-"), file.hasSuffix(".svg") || file.hasSuffix(".png"), file.utf8.count == 18 else { return false }
        let digits = file.dropFirst(10).prefix(4)
        return digits.utf8.allSatisfy({ (48...57).contains($0) }) && (Int(digits).map { $0 < 500 } ?? false)
    }
    static func write(_ files: [String: Data]) throws -> Data {
        guard (3...maxMembers).contains(files.count), files.keys.allSatisfy(validPath),
              files["manifest.json"] != nil, files["geometry.json"] != nil else { throw SpatialExportError.unsupportedProfile }
        return try writeKnownFiles(files)
    }
    /// Internal use only after the owning versioned profile admits every fixed path.
    static func writeKnownFiles(_ files: [String: Data]) throws -> Data {
        guard (2...maxMembers).contains(files.count), files.keys.allSatisfy({
            !$0.isEmpty && $0.utf8.count <= 64 && !$0.contains("..") && !$0.hasPrefix("/") &&
            $0.utf8.allSatisfy { (48...57).contains($0) || (97...122).contains($0) || [45,46,47].contains($0) }
        }) else { throw SpatialExportError.unsupportedProfile }
        let total = files.reduce(22) { $0 + $1.value.count + 76 + $1.key.utf8.count * 2 }
        guard total <= SpatialImportLimits.totalBytes,
              files.values.allSatisfy({ !$0.isEmpty && $0.count <= SpatialImportLimits.memberBytes }) else { throw SpatialExportError.exceedsSafetyBounds }
        var output = Data(), directory = Data(); output.reserveCapacity(total)
        for name in files.keys.sorted() {
            let bytes = files[name]!, nameBytes = Data(name.utf8), offset = output.count
            let crc = bytes.withUnsafeBytes { spatial_crc32($0.bindMemory(to: UInt8.self).baseAddress, bytes.count) }
            output.appendLE(0x04034b50 as UInt32)
            for value: UInt16 in [20, 0, 0, 0, 0x21] { output.appendLE(value) }
            output.appendLE(crc); output.appendLE(UInt32(bytes.count)); output.appendLE(UInt32(bytes.count))
            output.appendLE(UInt16(nameBytes.count)); output.appendLE(0 as UInt16); output.append(nameBytes); output.append(bytes)
            directory.appendLE(0x02014b50 as UInt32)
            for value: UInt16 in [0x0314, 20, 0, 0, 0, 0x21] { directory.appendLE(value) }
            directory.appendLE(crc); directory.appendLE(UInt32(bytes.count)); directory.appendLE(UInt32(bytes.count))
            for value: UInt16 in [UInt16(nameBytes.count), 0, 0, 0, 0] { directory.appendLE(value) }
            directory.appendLE(0x81a4_0000 as UInt32); directory.appendLE(UInt32(offset)); directory.append(nameBytes)
        }
        let start = output.count
        output.append(directory); output.appendLE(0x06054b50 as UInt32)
        for value: UInt16 in [0, 0, UInt16(files.count), UInt16(files.count)] { output.appendLE(value) }
        output.appendLE(UInt32(directory.count)); output.appendLE(UInt32(start)); output.appendLE(0 as UInt16)
        return output
    }

    static func read(_ input: Data, budget: ImportBudget) throws -> [String: Data] {
        guard input.count >= 22, input.count <= SpatialImportLimits.totalBytes else { throw SpatialImportError.boundsExceeded }
        let data = Data(input)
        func u16(_ p: Int) throws -> Int {
            guard p >= 0, p <= data.count - 2 else { throw SpatialImportError.corruptArchive }
            return Int(data[p]) | Int(data[p + 1]) << 8
        }
        func u32(_ p: Int) throws -> Int { try u16(p) | u16(p + 2) << 16 }
        func bytes(_ range: Range<Int>) throws -> Data {
            guard range.lowerBound >= 0, range.upperBound <= data.count else { throw SpatialImportError.corruptArchive }
            return data.subdata(in: range)
        }
        let end = data.count - 22
        guard try u32(end) == 0x06054b50, try u16(end + 4) == 0, try u16(end + 6) == 0,
              try u16(end + 20) == 0 else { throw SpatialImportError.unsupportedArchive }
        let count = try u16(end + 8)
        guard (3...maxMembers).contains(count), try u16(end + 10) == count else { throw SpatialImportError.boundsExceeded }
        let directory = try u32(end + 16)
        guard directory + (try u32(end + 12)) == end else { throw SpatialImportError.corruptArchive }
        struct Entry { let name: String; let nameBytes: Data; let size: Int; let crc: Int; let offset: Int; let time: Int; let date: Int }
        var entries: [Entry] = [], names: Set<String> = [], cursor = directory, total = 0
        for _ in 0..<count {
            try budget.check()
            guard try u32(cursor) == 0x02014b50, try u16(cursor + 6) == 20,
                  try u16(cursor + 8) == 0, try u16(cursor + 10) == 0,
                  try u16(cursor + 30) == 0, try u16(cursor + 32) == 0, try u16(cursor + 34) == 0 else {
                throw SpatialImportError.unsupportedArchive
            }
            let attributes = try u32(cursor + 38), mode = (attributes >> 16) & 0xf000
            guard (mode == 0 || mode == 0x8000), attributes & 0x10 == 0 else { throw SpatialImportError.unsafeArchive }
            let size = try u32(cursor + 24), nameSize = try u16(cursor + 28)
            guard size > 0, size <= SpatialImportLimits.memberBytes, try u32(cursor + 20) == size,
                  (1...64).contains(nameSize) else { throw SpatialImportError.boundsExceeded }
            total += size
            guard total <= SpatialImportLimits.totalBytes else { throw SpatialImportError.boundsExceeded }
            let nameBytes = try bytes((cursor + 46)..<(cursor + 46 + nameSize))
            guard let name = String(data: nameBytes, encoding: .utf8), validPath(name), names.insert(name).inserted else {
                throw SpatialImportError.unsafeArchive
            }
            entries.append(.init(name: name, nameBytes: nameBytes, size: size, crc: try u32(cursor + 16),
                                 offset: try u32(cursor + 42), time: try u16(cursor + 12), date: try u16(cursor + 14)))
            cursor += 46 + nameSize
        }
        guard cursor == end, names.contains("manifest.json"), names.contains("geometry.json") else { throw SpatialImportError.corruptArchive }
        var next = 0, files: [String: Data] = [:]
        for entry in entries.sorted(by: { $0.offset < $1.offset }) {
            let p = entry.offset
            guard p == next, try u32(p) == 0x04034b50, try u16(p + 4) == 20,
                  try u16(p + 6) == 0, try u16(p + 8) == 0,
                  try u16(p + 10) == entry.time, try u16(p + 12) == entry.date,
                  try u32(p + 14) == entry.crc, try u32(p + 18) == entry.size, try u32(p + 22) == entry.size,
                  try u16(p + 26) == entry.nameBytes.count, try u16(p + 28) == 0 else { throw SpatialImportError.corruptArchive }
            let start = p + 30 + entry.nameBytes.count
            guard try bytes((p + 30)..<start) == entry.nameBytes else { throw SpatialImportError.corruptArchive }
            next = start + entry.size
            guard next <= directory else { throw SpatialImportError.corruptArchive }
            let file = try bytes(start..<next)
            let crc = file.withUnsafeBytes { spatial_crc32($0.bindMemory(to: UInt8.self).baseAddress, file.count) }
            guard Int(crc) == entry.crc else { throw SpatialImportError.corruptArchive }
            files[entry.name] = file
            try budget.check()
        }
        guard next == directory else { throw SpatialImportError.corruptArchive }
        return files
    }
}
