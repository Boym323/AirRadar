export type BeastFrameType = 0x31 | 0x32 | 0x33;

export interface BeastFrame {
  type: BeastFrameType;
  timestamp: Buffer;
  signal: number;
  payload: Buffer;
}

const ESCAPE = 0x1a;
const FRAME_LENGTHS: Record<BeastFrameType, number> = { 0x31: 9, 0x32: 16, 0x33: 23 };

/** Incremental, bounded Beast binary protocol parser. */
export class BeastParser {
  private buffer = Buffer.alloc(0);
  readonly maxBufferedBytes: number;

  constructor(maxBufferedBytes = 64 * 1024) {
    this.maxBufferedBytes = maxBufferedBytes;
  }

  push(chunk: Uint8Array): BeastFrame[] {
    if (chunk.byteLength) this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
    const frames: BeastFrame[] = [];
    while (this.buffer.length) {
      const start = this.buffer.indexOf(ESCAPE);
      if (start < 0) {
        this.buffer = Buffer.alloc(0);
        break;
      }
      if (start > 0) this.buffer = this.buffer.subarray(start);
      if (this.buffer.length < 2) break;
      const type = this.buffer[1] as BeastFrameType;
      const decoded = FRAME_LENGTHS[type];
      if (!decoded) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      let source = 2;
      let rawBytes = 0;
      const output: number[] = [];
      while (source < this.buffer.length && output.length < decoded - 2) {
        const value = this.buffer[source++];
        if (value === ESCAPE) {
          if (source >= this.buffer.length) break;
          const next = this.buffer[source++];
          if (next === ESCAPE) output.push(ESCAPE);
          else { output.length = 0; rawBytes = -1; break; }
        } else output.push(value);
        rawBytes += 1;
      }
      if (rawBytes < 0) { this.buffer = this.buffer.subarray(1); continue; }
      if (output.length < decoded - 2) break;
      const frameBytes = source;
      const metadata = Buffer.from(output);
      frames.push({ type, timestamp: metadata.subarray(0, 6), signal: metadata[6], payload: metadata.subarray(7) });
      this.buffer = this.buffer.subarray(frameBytes);
    }
    if (this.buffer.length > this.maxBufferedBytes) this.buffer = this.buffer.subarray(this.buffer.length - this.maxBufferedBytes);
    return frames;
  }

  get bufferedBytes(): number { return this.buffer.length; }
}
