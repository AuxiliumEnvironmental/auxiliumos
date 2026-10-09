#include <stddef.h>
#include <stdint.h>

// Raw DEFLATE only. Output buffer is bounded before calling. No disk writes.
int spatial_inflate_exact(const uint8_t *input, size_t input_count,
                          uint8_t *output, size_t output_count);
uint32_t spatial_crc32(const uint8_t *input, size_t count);
