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

    fn push(&mut self, chunk: &[u8]) -> Vec<Frame> {
        self.pending.extend_from_slice(chunk);
        let mut frames = Vec::new();
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
            let mut timestamp = [0_u8; 6];
            timestamp.copy_from_slice(&decoded[..6]);
            frames.push(Frame {
                frame_type,
                timestamp,
                signal: decoded[6],
                payload: decoded[7..decoded_len].to_vec(),
            });
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
        frames
    }
}

/// Mode-S CRC remainder; data is 7 or 14 bytes (fits in u128).
/// No BigInt allocation and no callbacks per message.
fn crc24(data: &[u8]) -> u32 {
    if data.len() != 7 && data.len() != 14 {
        return 0;
    }
    let mut bits = 0_u128;
    for &byte in data {
        bits = (bits << 8) | u128::from(byte);
    }
    for bit in (24..data.len() * 8).rev() {
        if bits & (1_u128 << bit) != 0 {
            bits ^= 0xfff409_u128 << (bit - 24);
        }
    }
    (bits & 0xff_ffff) as u32
}

#[napi(object)]
pub struct NativeParsedFrame {
    pub frame_type: u32,
    pub timestamp: Buffer,
    pub signal: u32,
    pub payload: Buffer,
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
    pub fn push(&mut self, chunk: Buffer) -> Vec<NativeParsedFrame> {
        self.parser
            .push(&chunk)
            .into_iter()
            .map(|frame| NativeParsedFrame {
                frame_type: u32::from(frame.frame_type),
                timestamp: Buffer::from(frame.timestamp.to_vec()),
                signal: u32::from(frame.signal),
                payload: Buffer::from(frame.payload),
            })
            .collect()
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
        assert_eq!(parser.push(&encode(0x33, &[1; 14])).len(), 1);
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
