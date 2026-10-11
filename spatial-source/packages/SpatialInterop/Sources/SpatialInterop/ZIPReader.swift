import Foundation
import CSpatialCompression

/// Deliberately constrained classic ZIP reader. No extraction, path resolution, archive
/// tools, ZIP64, encryption, descriptors, comments, extra fields, or executable members.
struct ZIPReader {
    static let allowed: Set<String> = ["manifest.json", "geometry.json", "scene.json", "floorplan.svg"]
    private let data: Data
    private let budget: ImportBudget
    init(data: Data, budget: ImportBudget) throws {
        guard data.count >= 22, data.count <= SpatialImportLimits.totalBytes else { throw SpatialImportError.boundsExceeded }
        self.data = Data(data); self.budget = budget
    }
    private func u16(_ offset: Int) throws -> Int {
        guard offset >= 0, offset <= data.count - 2 else { throw SpatialImportError.corruptArchive }
        return Int(data[data.startIndex+offset]) | Int(data[data.startIndex+offset+1]) << 8
    }
    private func u32(_ offset: Int) throws -> Int {
        try u16(offset) | u16(offset+2) << 16
    }
    private func bytes(_ range: Range<Int>) throws -> Data {
        guard range.lowerBound >= 0, range.upperBound <= data.count else { throw SpatialImportError.corruptArchive }
        return data.subdata(in: (data.startIndex + range.lowerBound)..<(data.startIndex + range.upperBound))
    }
    func read() throws -> [String: Data] {
        let end = data.count - 22
        guard try u32(end) == 0x06054b50,
              try u16(end+4) == 0, try u16(end+6) == 0,
              try u16(end+8) == 4, try u16(end+10) == 4, try u16(end+20) == 0 else {
            throw SpatialImportError.unsupportedArchive
        }
        let centralSize = try u32(end+12), centralStart = try u32(end+16)
        guard centralStart + centralSize == end else { throw SpatialImportError.corruptArchive }
        var cursor = centralStart
        var entries: [Entry] = []
        var names: Set<String> = []
        var total = 0
        for _ in 0..<4 {
            try budget.check()
            guard try u32(cursor) == 0x02014b50 else { throw SpatialImportError.corruptArchive }
            let needed = try u16(cursor+6), flags = try u16(cursor+8), method = try u16(cursor+10)
            let crc = try u32(cursor+16), compressed = try u32(cursor+20), expanded = try u32(cursor+24)
            let nameCount = try u16(cursor+28), extra = try u16(cursor+30), comment = try u16(cursor+32)
            let disk = try u16(cursor+34), attributes = try u32(cursor+38), local = try u32(cursor+42)
            guard needed <= 20, flags == 0 || flags == 0x0800, method == 0 || method == 8,
                  extra == 0, comment == 0, disk == 0 else { throw SpatialImportError.unsupportedArchive }
            let mode = (attributes >> 16) & 0xf000
            guard mode == 0 || mode == 0x8000, attributes & 0x10 == 0 else { throw SpatialImportError.unsafeArchive }
            let nameData = try bytes((cursor+46)..<(cursor+46+nameCount))
            guard let name = String(data: nameData, encoding: .utf8), Self.allowed.contains(name), names.insert(name).inserted else {
                throw SpatialImportError.unsafeArchive
            }
            guard expanded > 0, expanded <= SpatialImportLimits.memberBytes, compressed > 0,
                  compressed <= SpatialImportLimits.totalBytes,
                  expanded <= compressed * SpatialImportLimits.compressionRatio else { throw SpatialImportError.boundsExceeded }
            if method == 0, compressed != expanded { throw SpatialImportError.corruptArchive }
            total += expanded
            guard total <= SpatialImportLimits.totalBytes else { throw SpatialImportError.boundsExceeded }
            entries.append(Entry(name: name, nameBytes: nameData, needed: needed, flags: flags, method: method,
                                 crc: crc, compressed: compressed, expanded: expanded, local: local,
                                 modifiedTime: try u16(cursor+12), modifiedDate: try u16(cursor+14)))
            cursor += 46 + nameCount
        }
        guard cursor == end, names == Self.allowed else { throw SpatialImportError.corruptArchive }
        var files: [String: Data] = [:]
        var nextLocal = 0
        for entry in entries.sorted(by: { $0.local < $1.local }) {
            // Reject overlays, aliasing, gaps, preambles, or central entries pointing into payload.
            let p = entry.local
            guard p == nextLocal, try u32(p) == 0x04034b50,
                  try u16(p+4) == entry.needed, try u16(p+6) == entry.flags, try u16(p+8) == entry.method,
                  try u16(p+10) == entry.modifiedTime, try u16(p+12) == entry.modifiedDate,
                  try u32(p+14) == entry.crc, try u32(p+18) == entry.compressed, try u32(p+22) == entry.expanded,
                  try u16(p+26) == entry.nameBytes.count, try u16(p+28) == 0 else { throw SpatialImportError.corruptArchive }
            let nameEnd = p + 30 + entry.nameBytes.count
            guard try bytes((p+30)..<nameEnd) == entry.nameBytes else { throw SpatialImportError.corruptArchive }
            nextLocal = nameEnd + entry.compressed
            guard nextLocal <= centralStart else { throw SpatialImportError.corruptArchive }
            let input = try bytes(nameEnd..<nextLocal)
            let output: Data
            if entry.method == 0 { output = input }
            else {
                var inflated = Data(count: entry.expanded)
                let exact = inflated.withUnsafeMutableBytes { outBuffer in
                    input.withUnsafeBytes { inBuffer in
                        spatial_inflate_exact(inBuffer.bindMemory(to: UInt8.self).baseAddress, input.count,
                                              outBuffer.bindMemory(to: UInt8.self).baseAddress, entry.expanded)
                    }
                }
                guard exact == 1 else { throw SpatialImportError.corruptArchive }
                output = inflated
            }
            let crc = output.withUnsafeBytes { spatial_crc32($0.bindMemory(to: UInt8.self).baseAddress, output.count) }
            guard Int(crc) == entry.crc else { throw SpatialImportError.corruptArchive }
            files[entry.name] = output
            try budget.check()
        }
        guard nextLocal == centralStart else { throw SpatialImportError.corruptArchive }
        return files
    }
    private struct Entry {
        let name: String, nameBytes: Data
        let needed: Int, flags: Int, method: Int, crc: Int, compressed: Int, expanded: Int, local: Int
        let modifiedTime: Int, modifiedDate: Int
    }
}
