#include "CSpatialCompression.h"
#include <limits.h>
#include <string.h>
#include <zlib.h>

int spatial_inflate_exact(const uint8_t *input, size_t input_count,
                          uint8_t *output, size_t output_count) {
    if (input_count > UINT_MAX || output_count > UINT_MAX || output_count == 0) return 0;
    z_stream stream;
    memset(&stream, 0, sizeof(stream));
    stream.next_in = (Bytef *)input;
    stream.avail_in = (uInt)input_count;
    stream.next_out = output;
    stream.avail_out = (uInt)output_count;
    if (inflateInit2(&stream, -MAX_WBITS) != Z_OK) return 0;
    int result = inflate(&stream, Z_FINISH);
    int exact = result == Z_STREAM_END && stream.total_in == input_count
                && stream.total_out == output_count;
    inflateEnd(&stream);
    return exact;
}

uint32_t spatial_crc32(const uint8_t *input, size_t count) {
    if (count > UINT_MAX) return 0;
    return (uint32_t)crc32(0, input, (uInt)count);
}
