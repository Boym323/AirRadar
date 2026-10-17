import { getNativeBeastEngine, type NativeBeastParser } from "./native-acceleration";

export type BeastFrameType = 0x31 | 0x32 | 0x33;

export interface BeastFrame {
  type: BeastFrameType;
  timestamp: Buffer;
  signal: number;
  payload: Buffer;
}

// Private provenance for CRC computed while the Rust parser de-escaped the
// payload. Weak references prevent retaining old frames in memory.
const nativeFrameCrc = new WeakMap<BeastFrame, number>();

export function trustedModeSCrcForFrame(frame: BeastFrame): number | null {
  return nativeFrameCrc.get(frame) ?? null;
}

const ESCAPE = 0x1a;
// Total unescaped bytes after the leading escape byte: type + timestamp +
// signal + payload. Short Mode-S frames carry a two-byte payload.
const FRAME_LENGTHS: Record<BeastFrameType, number> = { 0x31: 11, 0x32: 16, 0x33: 23 };

/** Incremental, bounded Beast binary protocol parser. */
export class BeastParser {
  private buffer = Buffer.alloc(0);
  private bufferStart = 0;
  private bufferEnd = 0;
  private readonly native: NativeBeastParser | null;
  private readonly precomputeCrc: boolean;
  readonly maxBufferedBytes: number;

  constructor(maxBufferedBytes = 64 * 1024, options: { native?: boolean; precomputeCrc?: boolean } = {}) {
    this.maxBufferedBytes = maxBufferedBytes;
    const binding = options.native === false || process.env.AIRRADAR_NATIVE_BEAST_PARSER === "0"
      ? null : getNativeBeastEngine();
    this.native = binding ? new binding.NativeBeastParser(maxBufferedBytes) : null;
    // Preserve the independent existing AIRRADAR_NATIVE_BEAST_CRC=0 kill switch.
    // Inline CRC's end-to-end median was not faster than standalone N-API
    // CRC in the matched ingest benchmark. Keep the experiment opt-in.
    const inlineCrcRequested = options.precomputeCrc === true
      || (options.precomputeCrc !== false
        && process.env.AIRRADAR_NATIVE_BEAST_CRC_PRECOMPUTED === "1");
    this.precomputeCrc = this.native !== null && inlineCrcRequested
      && process.env.AIRRADAR_NATIVE_BEAST_CRC !== "0"
      && process.env.AIRRADAR_NATIVE_BEAST_CRC_PRECOMPUTED !== "0";
  }

  push(chunk: Uint8Array): BeastFrame[] {
    if (this.native) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
      const packed = this.precomputeCrc
        ? this.native.pushPackedWithCrc(bytes)
        : this.native.pushPacked(bytes);
      const frames: BeastFrame[] = [];
      for (let offset = 0; offset < packed.length;) {
        const type = packed[offset]! as BeastFrameType;
        const payloadLength = type === 0x31 ? 2 : type === 0x32 ? 7 : 14;
        const size = 8 + payloadLength + (this.precomputeCrc ? 4 : 0);
        if (offset + size > packed.length || (type !== 0x31 && type !== 0x32 && type !== 0x33)) {
          throw new Error("Native BEAST decoder returned an invalid frame");
        }
        const frame: BeastFrame = {
          type,
          timestamp: packed.subarray(offset + 1, offset + 7),
          signal: packed[offset + 7]!,
          payload: packed.subarray(offset + 8, offset + 8 + payloadLength),
        };
        if (this.precomputeCrc) {
          nativeFrameCrc.set(frame, packed.readUInt32BE(offset + 8 + payloadLength));
        }
        frames.push(frame);
        offset += size;
      }
      return frames;
    }
    if (chunk.byteLength) this.append(chunk);
    const frames: BeastFrame[] = [];
    while (this.bufferStart < this.bufferEnd) {
      const relativeStart = this.buffer.subarray(this.bufferStart, this.bufferEnd).indexOf(ESCAPE);
      const start = relativeStart < 0 ? -1 : this.bufferStart + relativeStart;
      if (start < 0) {
        this.bufferStart = this.bufferEnd;
        break;
      }
      this.bufferStart = start;
      if (this.bufferEnd - this.bufferStart < 2) break;
      const type = this.buffer[this.bufferStart + 1] as BeastFrameType;
      const decoded = FRAME_LENGTHS[type];
      if (!decoded) {
        this.bufferStart += 1;
        continue;
      }
      let source = this.bufferStart + 2;
      let rawBytes = 0;
      const output: number[] = [];
      while (source < this.bufferEnd && output.length < decoded - 2) {
        const value = this.buffer[source++];
        if (value === ESCAPE) {
          if (source >= this.bufferEnd) break;
          const next = this.buffer[source++];
          if (next === ESCAPE) output.push(ESCAPE);
          else { output.length = 0; rawBytes = -1; break; }
        } else output.push(value);
        rawBytes += 1;
      }
      if (rawBytes < 0) { this.bufferStart += 1; continue; }
      if (output.length < decoded - 2) break;
      const metadata = Buffer.from(output);
      frames.push({ type, timestamp: metadata.subarray(0, 6), signal: metadata[6], payload: metadata.subarray(7) });
      this.bufferStart = source;
    }
    this.compactOrBound();
    return frames;
  }

  private append(chunk: Uint8Array): void {
    const unread = this.bufferEnd - this.bufferStart;
    const required = unread + chunk.byteLength;
    if (required > this.buffer.length) {
      const capacity = Math.min(this.maxBufferedBytes + chunk.byteLength,
        Math.max(required, Math.max(256, this.buffer.length * 2)));
      const next = Buffer.allocUnsafe(capacity);
      if (unread) this.buffer.copy(next, 0, this.bufferStart);
      this.buffer = next;
      this.bufferStart = 0;
    } else if (this.bufferStart > 0 && this.bufferStart + required > this.buffer.length) {
      this.buffer.copy(this.buffer, 0, this.bufferStart, this.bufferEnd);
      this.bufferStart = 0;
    }
    const destination = this.bufferStart + unread;
    Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength).copy(this.buffer, destination);
    this.bufferEnd = destination + chunk.byteLength;
  }

  private compactOrBound(): void {
    const unread = this.bufferEnd - this.bufferStart;
    if (unread > this.maxBufferedBytes) {
      this.buffer = Buffer.from(this.buffer.subarray(this.bufferEnd - this.maxBufferedBytes, this.bufferEnd));
      this.bufferStart = 0;
      this.bufferEnd = this.buffer.length;
    } else if (unread === 0) {
      this.buffer = Buffer.alloc(0);
      this.bufferStart = 0;
      this.bufferEnd = 0;
    } else if (this.bufferStart > 0 && (this.bufferStart >= 4096 || this.bufferStart * 2 >= this.buffer.length)) {
      this.buffer.copy(this.buffer, 0, this.bufferStart, this.bufferEnd);
      this.buffer = this.buffer.subarray(0, unread);
      this.bufferStart = 0;
      this.bufferEnd = unread;
    }
  }

  get bufferedBytes(): number { return this.native?.bufferedBytes ?? this.bufferEnd - this.bufferStart; }
}
