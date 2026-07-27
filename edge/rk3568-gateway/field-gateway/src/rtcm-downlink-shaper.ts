import {
  classifyRtcmMessageType,
  inspectRtcm3Frame,
  RTCM3_MAX_FRAME_BYTES,
  type RtcmFrameInfo
} from "./gnss-transport-v3";

const RTCM3_PREAMBLE = 0xd3;
const RTCM3_MIN_FRAME_BYTES = 8;

export const UM220_IV_NK_RTCM_TYPES = new Set([1005, 1033, 1074, 1094, 1114, 1124]);
export const UM220_IV_NK_ESSENTIAL_RTCM_TYPES = new Set([1005, 1033, 1074, 1094, 1124]);

export type RtcmStreamDecoderStats = {
  chunks: number;
  bytes: number;
  validFrames: number;
  crcOrFrameErrors: number;
  discardedBytes: number;
  bufferResets: number;
};

export class Rtcm3StreamDecoder {
  private buffer = Buffer.alloc(0);
  private readonly counters: RtcmStreamDecoderStats = {
    chunks: 0,
    bytes: 0,
    validFrames: 0,
    crcOrFrameErrors: 0,
    discardedBytes: 0,
    bufferResets: 0
  };

  constructor(private readonly maxBufferedBytes = RTCM3_MAX_FRAME_BYTES * 2) {
    if (!Number.isSafeInteger(maxBufferedBytes) || maxBufferedBytes < RTCM3_MAX_FRAME_BYTES) {
      throw new Error("RTCM stream max buffer is below one maximum frame");
    }
  }

  stats(): RtcmStreamDecoderStats & { bufferedBytes: number } {
    return { ...this.counters, bufferedBytes: this.buffer.length };
  }

  push(chunk: Buffer): Buffer[] {
    if (chunk.length === 0) return [];
    this.counters.chunks += 1;
    this.counters.bytes += chunk.length;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const frames: Buffer[] = [];

    while (this.buffer.length > 0) {
      const preambleIndex = this.buffer.indexOf(RTCM3_PREAMBLE);
      if (preambleIndex < 0) {
        this.counters.discardedBytes += this.buffer.length;
        this.buffer = Buffer.alloc(0);
        break;
      }
      if (preambleIndex > 0) {
        this.counters.discardedBytes += preambleIndex;
        this.buffer = this.buffer.subarray(preambleIndex);
      }
      if (this.buffer.length < 3) break;

      const headerByte1 = this.buffer.readUInt8(1);
      if ((headerByte1 & 0xfc) !== 0) {
        this.counters.discardedBytes += 1;
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const payloadBytes = ((headerByte1 & 0x03) << 8) | this.buffer.readUInt8(2);
      const frameBytes = payloadBytes + 6;
      if (frameBytes < RTCM3_MIN_FRAME_BYTES || frameBytes > RTCM3_MAX_FRAME_BYTES) {
        this.counters.discardedBytes += 1;
        this.buffer = this.buffer.subarray(1);
        continue;
      }
      if (this.buffer.length < frameBytes) break;

      const frame = Buffer.from(this.buffer.subarray(0, frameBytes));
      this.buffer = this.buffer.subarray(frameBytes);
      try {
        inspectRtcm3Frame(frame);
        frames.push(frame);
        this.counters.validFrames += 1;
      } catch {
        this.counters.crcOrFrameErrors += 1;
      }
    }

    if (this.buffer.length > this.maxBufferedBytes) {
      this.counters.discardedBytes += this.buffer.length;
      this.counters.bufferResets += 1;
      this.buffer = Buffer.alloc(0);
    }
    return frames;
  }
}

export type Um220RtcmShaperStats = {
  acceptedFrames: number;
  invalidFrames: number;
  unsupportedFrames: number;
  supersededFrames: number;
  expiredFrames: number;
  emittedFrames: number;
  emittedBytes: number;
};

export type ShapedRtcmFrame = {
  frame: Buffer;
  info: RtcmFrameInfo;
  receivedUnixMs: number;
  queueAgeMs: number;
};

type PendingFrame = Omit<ShapedRtcmFrame, "queueAgeMs">;

export type Um220RtcmShaperConfig = {
  observationIntervalMs?: number;
  observationTtlMs?: number;
  referenceTtlMs?: number;
  supportedTypes?: ReadonlySet<number>;
};

export class Um220RtcmShaper {
  private readonly pendingByType = new Map<number, PendingFrame>();
  private readonly lastEmittedByType = new Map<number, number>();
  private readonly observationIntervalMs: number;
  private readonly observationTtlMs: number;
  private readonly referenceTtlMs: number;
  private readonly supportedTypes: ReadonlySet<number>;
  private readonly counters: Um220RtcmShaperStats = {
    acceptedFrames: 0,
    invalidFrames: 0,
    unsupportedFrames: 0,
    supersededFrames: 0,
    expiredFrames: 0,
    emittedFrames: 0,
    emittedBytes: 0
  };

  constructor(config: Um220RtcmShaperConfig = {}) {
    this.observationIntervalMs = config.observationIntervalMs ?? 1000;
    this.observationTtlMs = config.observationTtlMs ?? 3000;
    this.referenceTtlMs = config.referenceTtlMs ?? 600_000;
    this.supportedTypes = config.supportedTypes ?? UM220_IV_NK_ESSENTIAL_RTCM_TYPES;
    for (const value of [this.observationIntervalMs, this.observationTtlMs, this.referenceTtlMs]) {
      if (!Number.isSafeInteger(value) || value <= 0) {
        throw new Error("RTCM shaper intervals and TTLs must be positive safe integers");
      }
    }
  }

  stats(): Um220RtcmShaperStats & { pendingTypes: number } {
    return { ...this.counters, pendingTypes: this.pendingByType.size };
  }

  offer(frame: Buffer, receivedUnixMs: number): "accepted" | "unsupported" | "invalid" {
    if (!Number.isSafeInteger(receivedUnixMs) || receivedUnixMs < 0) {
      this.counters.invalidFrames += 1;
      return "invalid";
    }

    let info: RtcmFrameInfo;
    try {
      info = inspectRtcm3Frame(frame);
    } catch {
      this.counters.invalidFrames += 1;
      return "invalid";
    }
    if (!this.supportedTypes.has(info.messageType)) {
      this.counters.unsupportedFrames += 1;
      return "unsupported";
    }

    if (this.pendingByType.has(info.messageType)) {
      this.counters.supersededFrames += 1;
    }
    this.pendingByType.set(info.messageType, {
      frame: Buffer.from(frame),
      info,
      receivedUnixMs
    });
    this.counters.acceptedFrames += 1;
    return "accepted";
  }

  takeNext(nowUnixMs: number): ShapedRtcmFrame | null {
    if (!Number.isSafeInteger(nowUnixMs) || nowUnixMs < 0) {
      throw new Error("RTCM shaper clock must be a non-negative safe integer");
    }
    this.expire(nowUnixMs);

    const eligible = Array.from(this.pendingByType.values()).filter((pending) => {
      if (classifyRtcmMessageType(pending.info.messageType) !== 1) return true;
      const lastEmitted = this.lastEmittedByType.get(pending.info.messageType);
      return lastEmitted === undefined || nowUnixMs - lastEmitted >= this.observationIntervalMs;
    });
    eligible.sort((left, right) => {
      const leftClass = classifyRtcmMessageType(left.info.messageType);
      const rightClass = classifyRtcmMessageType(right.info.messageType);
      if (leftClass !== rightClass) return rightClass === 2 ? 1 : -1;
      if (left.receivedUnixMs !== right.receivedUnixMs) {
        return left.receivedUnixMs - right.receivedUnixMs;
      }
      return left.info.messageType - right.info.messageType;
    });

    const selected = eligible[0];
    if (!selected) return null;
    this.pendingByType.delete(selected.info.messageType);
    this.lastEmittedByType.set(selected.info.messageType, nowUnixMs);
    this.counters.emittedFrames += 1;
    this.counters.emittedBytes += selected.frame.length;
    return {
      ...selected,
      frame: Buffer.from(selected.frame),
      queueAgeMs: nowUnixMs - selected.receivedUnixMs
    };
  }

  private expire(nowUnixMs: number): void {
    for (const [messageType, pending] of this.pendingByType) {
      const messageClass = classifyRtcmMessageType(messageType);
      const ttlMs = messageClass === 2 ? this.referenceTtlMs : this.observationTtlMs;
      if (nowUnixMs - pending.receivedUnixMs > ttlMs) {
        this.pendingByType.delete(messageType);
        this.counters.expiredFrames += 1;
      }
    }
  }
}
