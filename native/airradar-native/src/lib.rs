//! Optional synchronous N-API accelerator. JavaScript owns the aircraft state.
//! Keep the FFI boundary at whole BEAST chunks, never at individual bytes.
use napi::bindgen_prelude::Buffer;
use napi_derive::napi;

const ESCAPE: u8 = 0x1a;
const DEFAULT_MAX_BUFFER: usize = 64 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
struct Frame {
    frame_type: u8,
    timestamp: [u8; 6],
    signal: u8,
    payload: Vec<u8>,
}

#[derive(Default)]
struct Parser {
    pending: Vec<u8>,
    max_buffered_bytes: usize,
}

impl Parser {
    fn new(max_buffered_bytes: usize) -> Self {
        Self { pending: Vec::new(), max_buffered_bytes }
    }

    fn push_packed(&mut self, chunk: &[u8]) -> Vec<u8> {
        self.push_packed_impl(chunk, false)
    }

    fn push_packed_with_crc(&mut self, chunk: &[u8]) -> Vec<u8> {
        self.push_packed_impl(chunk, true)
    }

    fn push_packed_impl(&mut self, chunk: &[u8], with_crc: bool) -> Vec<u8> {
        self.pending.extend_from_slice(chunk);
        // One native call for the entire socket chunk, not per decoded frame.
        // CRC mode appends four big-endian bytes to each complete frame:
        // type (1) + timestamp (6) + signal (1) + payload (2/7/14) + CRC (4).
        let mut output = Vec::new();
        let mut cursor = 0_usize;
        let len = self.pending.len();

        while cursor < len {
            let Some(offset) = self.pending[cursor..].iter().position(|&v| v == ESCAPE) else {
                cursor = len;
                break;
            };
            let start = cursor + offset;
            if start + 1 >= len {
                cursor = start;
                break;
            }
            let frame_type = self.pending[start + 1];
            let decoded_len = match frame_type {
                0x31 => 9,
                0x32 => 14,
                0x33 => 21,
                _ => {
                    cursor = start + 1;
                    continue;
                }
            };
            let mut decoded = [0_u8; 21];
            let mut count = 0_usize;
            let mut source = start + 2;
            let mut invalid = false;
            while source < len && count < decoded_len {
                let byte = self.pending[source];
                source += 1;
                if byte == ESCAPE {
                    if source >= len {
                        break; // Escaped value may be fragmented across pushes.
                    }
                    if self.pending[source] != ESCAPE {
                        invalid = true;
                        break;
                    }
                    source += 1;
                }
                decoded[count] = byte;
                count += 1;
            }
            if invalid {
                // Match the TS parser's one-byte resynchronization rule.
                cursor = start + 1;
                continue;
            }
            if count < decoded_len {
                cursor = start;
                break;
            }
            output.push(frame_type);
            output.extend_from_slice(&decoded[..decoded_len]);
            if with_crc {
                // CRC is computed from the exact de-escaped Mode-S payload.
                // A 2-byte Beast 0x31 payload is never accepted by the
                // aircraft decoder; its sidecar intentionally encodes zero.
                let checksum = crc24(&decoded[7..decoded_len]);
                output.extend_from_slice(&checksum.to_be_bytes());
            }
            cursor = source;
        }

        // One drain per socket chunk; avoids Buffer.concat on every frame.
        if cursor == len {
            self.pending.clear();
        } else if cursor > 0 {
            self.pending.drain(..cursor);
        }
        if self.pending.len() > self.max_buffered_bytes {
            let drop = self.pending.len() - self.max_buffered_bytes;
            self.pending.drain(..drop);
        }
        // A single abnormal chunk must not reserve megabytes indefinitely.
        // Shrink only after an oversized allocation; routine socket chunks
        // reuse their existing capacity without per-frame allocator churn.
        if self.pending.capacity()
            > self.max_buffered_bytes.saturating_mul(2).max(64 * 1024)
        {
            self.pending
                .shrink_to(self.max_buffered_bytes.max(self.pending.len()).max(4096));
        }
        output
    }

    #[cfg(test)]
    fn push(&mut self, chunk: &[u8]) -> Vec<Frame> {
        let packed = self.push_packed(chunk);
        let mut frames = Vec::new();
        let mut index = 0;
        while index < packed.len() {
            let frame_type = packed[index];
            let payload_len = match frame_type { 0x31 => 2, 0x32 => 7, _ => 14 };
            let mut timestamp = [0_u8; 6];
            timestamp.copy_from_slice(&packed[index + 1..index + 7]);
            frames.push(Frame {
                frame_type,
                timestamp,
                signal: packed[index + 7],
                payload: packed[index + 8..index + 8 + payload_len].to_vec(),
            });
            index += 8 + payload_len;
        }
        frames
    }
}

// The CRC polynomial is x^24 + 0xfff409. Build the lookup table at compile
// time; do not allocate or initialize it on the hot path.
const fn build_crc24_table() -> [u32; 256] {
    let mut table = [0_u32; 256];
    let mut index = 0;
    while index < 256 {
        let mut remainder = (index as u32) << 16;
        let mut bit = 0;
        while bit < 8 {
            remainder = if remainder & 0x800000 != 0 {
                (remainder << 1) ^ 0xfff409
            } else {
                remainder << 1
            };
            remainder &= 0xffffff;
            bit += 1;
        }
        table[index] = remainder;
        index += 1;
    }
    table
}

const CRC24_TABLE: [u32; 256] = build_crc24_table();

/// Exact 24-bit Mode-S polynomial remainder (NOT only a CRC-valid boolean).
/// The first n-3 bytes are divided with a bytewise lookup and the trailing
/// 24-bit parity field is XORed unchanged. This preserves the ICAO address
/// syndrome for DF4/5/20/21, where the exact CRC remainder is required.
fn crc24(data: &[u8]) -> u32 {
    if data.len() != 7 && data.len() != 14 {
        return 0;
    }
    let end = data.len() - 3;
    let mut crc = 0_u32;
    for &byte in &data[..end] {
        let index = ((crc >> 16) as u8 ^ byte) as usize;
        crc = ((crc << 8) & 0xffffff) ^ CRC24_TABLE[index];
    }
    let parity = (u32::from(data[end]) << 16)
        | (u32::from(data[end + 1]) << 8)
        | u32::from(data[end + 2]);
    crc ^ parity
}


// V1 Rust migration R-01: geometry hot path for a single prepared ATC ring.
// Flat little-endian f64 [lon, lat] pairs avoid per-vertex N-API crossings.
// Return 0=outside, 1=inside, 2=boundary, -1=invalid (TS fallback).
// Mirrors lib/atc-context/geometry.ts ringContains, including 1e-9 tolerance.
fn ring_contains_f64(packed: &[u8], x: f64, y: f64) -> i32 {
    if !x.is_finite() || !y.is_finite() || packed.len() % 16 != 0 {
        return -1;
    }
    let n = packed.len() / 16;
    if n == 0 {
        return 0;
    }
    // Validate before returning a match: malformed input cannot be accepted
    // solely because an earlier edge happened to contain the query point.
    for vertex in packed.chunks_exact(16) {
        let lon = f64::from_le_bytes(vertex[0..8].try_into().unwrap());
        let lat = f64::from_le_bytes(vertex[8..16].try_into().unwrap());
        if !lon.is_finite() || !lat.is_finite() {
            return -1;
        }
    }
    let point = |i: usize| -> (f64, f64) {
        let offset = i * 16;
        (
            f64::from_le_bytes(packed[offset..offset + 8].try_into().unwrap()),
            f64::from_le_bytes(packed[offset + 8..offset + 16].try_into().unwrap()),
        )
    };
    let mut inside = false;
    let mut previous = n - 1;
    let epsilon = 1e-9_f64;
    for i in 0..n {
        let (ax, ay) = point(previous);
        let (bx, by) = point(i);
        let min_y = ay.min(by);
        let max_y = ay.max(by);
        if y >= min_y - epsilon && y <= max_y + epsilon {
            let cross = (y - ay) * (bx - ax) - (x - ax) * (by - ay);
            if cross.abs() < epsilon {
                let min_x = ax.min(bx);
                let max_x = ax.max(bx);
                if x >= min_x - epsilon && x <= max_x + epsilon {
                    return 2;
                }
            }
        }
        if (by > y) != (ay > y) && x < ((ax - bx) * (y - by)) / (ay - by) + bx {
            inside = !inside;
        }
        previous = i;
    }
    if inside { 1 } else { 0 }
}

#[napi(js_name = "atcRingContains")]
pub fn atc_ring_contains(packed: Buffer, longitude: f64, latitude: f64) -> i32 {
    ring_contains_f64(&packed, longitude, latitude)
}

#[napi(js_name = "NativeBeastParser")]
pub struct NativeBeastParser {
    parser: Parser,
}

#[napi]
impl NativeBeastParser {
    #[napi(constructor)]
    pub fn new(max_buffered_bytes: Option<u32>) -> Self {
        Self {
            parser: Parser::new(max_buffered_bytes.map(|v| v as usize).unwrap_or(DEFAULT_MAX_BUFFER)),
        }
    }

    #[napi]
    pub fn push_packed(&mut self, chunk: Buffer) -> Buffer {
        Buffer::from(self.parser.push_packed(&chunk))
    }

    #[napi]
    pub fn push_packed_with_crc(&mut self, chunk: Buffer) -> Buffer {
        Buffer::from(self.parser.push_packed_with_crc(&chunk))
    }

    #[napi(getter)]
    pub fn buffered_bytes(&self) -> u32 {
        self.parser.pending.len().min(u32::MAX as usize) as u32
    }
}

#[napi(js_name = "modeSCrc")]
pub fn mode_s_crc(payload: Buffer) -> u32 {
    crc24(&payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(kind: u8, payload: &[u8]) -> Vec<u8> {
        let mut output = vec![ESCAPE, kind];
        for b in [0, 0, 0, 0, 0, 1, 190].into_iter().chain(payload.iter().copied()) {
            output.push(b);
            if b == ESCAPE {
                output.push(b);
            }
        }
        output
    }


    #[test]
    fn atc_rust_geometry_matches_boundary_inside_outside() {
        let mut polygon = Vec::new();
        for (x, y) in [(14.0_f64, 50.0_f64), (15.0, 50.0), (15.0, 51.0), (14.0, 51.0), (14.0, 50.0)] {
            polygon.extend_from_slice(&x.to_le_bytes());
            polygon.extend_from_slice(&y.to_le_bytes());
        }
        assert_eq!(ring_contains_f64(&polygon, 14.5, 50.5), 1);
        assert_eq!(ring_contains_f64(&polygon, 14.0, 50.5), 2);
        assert_eq!(ring_contains_f64(&polygon, 14.0, 50.0), 2);
        assert_eq!(ring_contains_f64(&polygon, 16.0, 50.5), 0);
        assert_eq!(ring_contains_f64(&polygon[..polygon.len() - 1], 14.5, 50.5), -1);
        assert_eq!(ring_contains_f64(&polygon, f64::NAN, 50.5), -1);
        let mut invalid = polygon;
        invalid[0..8].copy_from_slice(&f64::NAN.to_le_bytes());
        assert_eq!(ring_contains_f64(&invalid, 14.5, 50.5), -1);
    }

    #[test]
    fn fragmented_and_escaped_frames() {
        let mut parser = Parser::new(DEFAULT_MAX_BUFFER);
        let mut payload = [3_u8; 14];
        payload[0] = ESCAPE;
        let input = encode(0x33, &payload);
        let mut frames = Vec::new();
        for byte in input {
            frames.extend(parser.push(&[byte]));
        }
        assert_eq!(frames.len(), 1);
        assert_eq!(frames[0].payload, payload);
        assert_eq!(frames[0].signal, 190);
        assert!(parser.pending.is_empty());
    }

    #[test]
    fn all_lengths_and_malformed_resynchronization() {
        let mut parser = Parser::new(32);
        let mut data = vec![0, ESCAPE, 0xff, ESCAPE, 0x33, 0x01, ESCAPE, 0x02];
        data.extend(encode(0x31, &[0xa5, 0x40]));
        data.extend(encode(0x32, &[7; 7]));
        data.extend(encode(0x33, &[8; 14]));
        let frames = parser.push(&data);
        assert_eq!(frames.len(), 3);
        assert_eq!(frames[0].payload, [0xa5, 0x40]);
        assert_eq!(frames[1].payload, [7_u8; 7]);
        assert_eq!(frames[2].payload, [8_u8; 14]);
        assert!(parser.pending.is_empty());
    }

    #[test]
    fn large_noise_is_bounded() {
        let mut parser = Parser::new(32);
        assert!(parser.push(&vec![0x55; 1_000_000]).is_empty());
        assert!(parser.pending.len() <= 32);
        assert!(parser.pending.capacity() <= 128 * 1024);
        assert_eq!(parser.push(&encode(0x33, &[1; 14])).len(), 1);
    }

    #[test]
    fn incremental_packed_crc_preserves_frame_boundaries_and_parity() {
        let valid = hex_bytes("8d4840d6202cc371c32ce0576098");
        let mut damaged = valid.clone();
        *damaged.last_mut().unwrap() ^= 1;
        let mut parser = Parser::new(DEFAULT_MAX_BUFFER);
        let mut wire = encode(0x33, &valid);
        wire.extend_from_slice(&encode(0x33, &damaged));
        wire.extend_from_slice(&encode(0x31, &[0xa5, 0x40]));
        let mut packed = Vec::new();
        for part in wire.chunks(3) {
            packed.extend_from_slice(&parser.push_packed_with_crc(part));
        }
        let mut index = 0;
        for (kind, data) in [(0x33, valid.as_slice()), (0x33, damaged.as_slice()), (0x31, &[0xa5, 0x40][..])] {
            let payload_len = data.len();
            let width = 8 + payload_len + 4;
            assert_eq!(packed[index], kind);
            assert_eq!(&packed[index + 8..index + 8 + payload_len], data);
            let result = u32::from_be_bytes(
                packed[index + 8 + payload_len..index + width].try_into().unwrap()
            );
            assert_eq!(result, crc24(data));
            index += width;
        }
        assert_eq!(index, packed.len());
        assert_eq!(parser.pending.len(), 0);
    }

    /// Bitwise reference retained in tests to validate every syndrome bit,
    /// including address-parity replies, not just CRC=0 validity.
    fn crc24_reference(data: &[u8]) -> u32 {
        let mut bits = 0_u128;
        for &byte in data {
            bits = (bits << 8) | u128::from(byte);
        }
        for bit in (24..data.len() * 8).rev() {
            if bits & (1_u128 << bit) != 0 {
                bits ^= 0xfff409_u128 << (bit - 24);
            }
        }
        (bits & 0xffffff) as u32
    }

    #[test]
    fn crc_lookup_matches_reference_for_exact_syndromes() {
        let mut seed = 0x7f23a963_u32;
        for len in [7_usize, 14_usize] {
            for _ in 0..15_000 {
                let mut frame = vec![0_u8; len];
                for byte in &mut frame {
                    seed = seed.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
                    *byte = (seed >> 24) as u8;
                }
                assert_eq!(crc24(&frame), crc24_reference(&frame));
            }
        }
    }

    #[test]
    fn crc_known_valid_and_corrupted() {
        assert_eq!(crc24(&hex_bytes("8d4840d6202cc371c32ce0576098")), 0);
        assert_ne!(crc24(&hex_bytes("8d4840d6202cc371c32ce0576099")), 0);
        assert_eq!(crc24(&[0_u8; 7]), 0);
        assert_eq!(crc24(&[0_u8; 14]), 0);
    }

    fn hex_bytes(hex: &str) -> Vec<u8> {
        (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap()).collect()
    }
}
