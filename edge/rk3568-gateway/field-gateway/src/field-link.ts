export type FieldLinkMode = "raw-json" | "cobs-crc-v1";

export type FieldLinkFrameType = "telemetry" | "command" | "ack" | "control";

export type FieldLinkInboundPayload = {
  rawPayload: string;
  frameType: FieldLinkFrameType | null;
  sequence: number | null;
  integrity: "not_applicable" | "crc32_ok";
  frameBytes: number;
};

export type FieldLinkDecodeError = {
  reason: string;
  frameBytes: number;
  rawSnippet: string;
};

export type FieldLinkAssemblerResult = {
  payloads: FieldLinkInboundPayload[];
  errors: FieldLinkDecodeError[];
};

export type FieldLinkAssembler = {
  push(chunk: Buffer): FieldLinkAssemblerResult;
};

const FIELD_LINK_VERSION = 1;

const FRAME_TYPE_TO_CODE: Record<FieldLinkFrameType, number> = {
  telemetry: 1,
  command: 2,
  ack: 3,
  control: 4
};

const CODE_TO_FRAME_TYPE = new Map<number, FieldLinkFrameType>(
  Object.entries(FRAME_TYPE_TO_CODE).map(([key, value]) => [value, key as FieldLinkFrameType])
);

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    const tableEntry = CRC32_TABLE[(crc ^ byte) & 0xff] ?? 0;
    crc = tableEntry ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function summarizeBytes(input: Buffer, limit = 64): string {
  const excerpt = input.subarray(0, limit);
  return Array.from(excerpt, (value) => value.toString(16).padStart(2, "0")).join(" ");
}

function cobsEncode(input: Buffer): Buffer {
  const out: number[] = [];
  let codeIndex = 0;
  let code = 1;
  out.push(0);

  for (const byte of input) {
    if (byte === 0) {
      out[codeIndex] = code;
      codeIndex = out.length;
      out.push(0);
      code = 1;
      continue;
    }

    out.push(byte);
    code += 1;
    if (code === 0xff) {
      out[codeIndex] = code;
      codeIndex = out.length;
      out.push(0);
      code = 1;
    }
  }

  out[codeIndex] = code;
  return Buffer.from(out);
}

function cobsDecode(input: Buffer): Buffer {
  const out: number[] = [];
  let index = 0;

  while (index < input.length) {
    const code = input.readUInt8(index);
    if (code === 0) {
      throw new Error("cobs zero marker inside encoded frame");
    }

    index += 1;
    for (let i = 1; i < code; i += 1) {
      if (index >= input.length) {
        throw new Error("cobs code exceeded input length");
      }
      out.push(input.readUInt8(index));
      index += 1;
    }

    if (code < 0xff && index < input.length) {
      out.push(0);
    }
  }

  return Buffer.from(out);
}

export function encodeFieldLinkFrame(params: {
  frameType: FieldLinkFrameType;
  sequence: number;
  payloadText: string;
}): Buffer {
  const payload = Buffer.from(params.payloadText, "utf8");
  const header = Buffer.alloc(12);
  header.writeUInt8(FIELD_LINK_VERSION, 0);
  header.writeUInt8(FRAME_TYPE_TO_CODE[params.frameType], 1);
  header.writeUInt8(0, 2);
  header.writeUInt8(0, 3);
  header.writeUInt32BE(params.sequence >>> 0, 4);
  header.writeUInt32BE(payload.length >>> 0, 8);

  const packetWithoutCrc = Buffer.concat([header, payload]);
  const packet = Buffer.alloc(packetWithoutCrc.length + 4);
  packetWithoutCrc.copy(packet, 0);
  packet.writeUInt32BE(crc32(packetWithoutCrc), packetWithoutCrc.length);

  return Buffer.concat([cobsEncode(packet), Buffer.from([0])]);
}

function decodeFieldLinkFrame(frameBytes: Buffer): FieldLinkInboundPayload {
  const decoded = cobsDecode(frameBytes);
  if (decoded.length < 16) {
    throw new Error("field-link frame too short");
  }

  const version = decoded.readUInt8(0);
  if (version !== FIELD_LINK_VERSION) {
    throw new Error(`unsupported field-link version: ${String(version)}`);
  }

  const typeCode = decoded.readUInt8(1);
  const frameType = CODE_TO_FRAME_TYPE.get(typeCode);
  if (!frameType) {
    throw new Error(`unknown field-link frame type: ${String(typeCode)}`);
  }

  const sequence = decoded.readUInt32BE(4);
  const payloadLength = decoded.readUInt32BE(8);
  const payloadStart = 12;
  const crcStart = decoded.length - 4;
  const actualPayloadLength = crcStart - payloadStart;
  if (payloadLength !== actualPayloadLength) {
    throw new Error(
      `field-link payload length mismatch: header=${String(payloadLength)} actual=${String(actualPayloadLength)}`
    );
  }

  const expectedCrc = decoded.readUInt32BE(crcStart);
  const packetWithoutCrc = decoded.subarray(0, crcStart);
  const actualCrc = crc32(packetWithoutCrc);
  if (expectedCrc !== actualCrc) {
    throw new Error(
      `field-link crc mismatch: expected=0x${expectedCrc.toString(16)} actual=0x${actualCrc.toString(16)}`
    );
  }

  return {
    rawPayload: decoded.subarray(payloadStart, crcStart).toString("utf8"),
    frameType,
    sequence,
    integrity: "crc32_ok",
    frameBytes: frameBytes.length + 1
  };
}

export function createCobsCrcFieldLinkAssembler(): FieldLinkAssembler {
  let buffer = Buffer.alloc(0);

  return {
    push(chunk: Buffer): FieldLinkAssemblerResult {
      buffer = Buffer.concat([buffer, chunk]);
      const payloads: FieldLinkInboundPayload[] = [];
      const errors: FieldLinkDecodeError[] = [];

      for (;;) {
        const delimiterIndex = buffer.indexOf(0);
        if (delimiterIndex < 0) {
          break;
        }

        const frameBytes = buffer.subarray(0, delimiterIndex);
        buffer = buffer.subarray(delimiterIndex + 1);

        if (delimiterIndex === 0) {
          continue;
        }

        try {
          payloads.push(decodeFieldLinkFrame(frameBytes));
        } catch (err) {
          errors.push({
            reason: err instanceof Error ? err.message : String(err),
            frameBytes: frameBytes.length + 1,
            rawSnippet: summarizeBytes(frameBytes)
          });
        }
      }

      if (buffer.length > 65536) {
        errors.push({
          reason: "field-link assembler buffer overflow",
          frameBytes: buffer.length,
          rawSnippet: summarizeBytes(buffer)
        });
        buffer = Buffer.alloc(0);
      }

      return { payloads, errors };
    }
  };
}
