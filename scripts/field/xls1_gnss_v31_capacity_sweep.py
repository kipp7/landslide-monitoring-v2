#!/usr/bin/env python3
"""Plan an XLS1 GNSS V3.1 mixed-load sweep without transmitting to hardware."""

from __future__ import annotations

import argparse
import binascii
import json
import math
import struct
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable


FIELD_LINK_VERSION = 1
FIELD_LINK_TYPE_RTCM = 6
GNSS_CORE_WIRE_BYTES_MAX = 116
COMPACT_BROADCAST_POLL_WIRE_BYTES = 28
COMPACT_TELEMETRY_WIRE_BYTES = 64
RTCM_FRAGMENT_HEADER_BYTES = 42
RTCM_MAX_FRAME_BYTES = 1029
TARGET_ALL_NODES = 0x07


@dataclass(frozen=True)
class PacingProfile:
    name: str
    chunk_bytes: int
    chunk_delay_ms: int


PACING_PROFILES = (
    PacingProfile("baseline-32B-15ms", 32, 15),
    PacingProfile("candidate-64B-5ms", 64, 5),
    PacingProfile("candidate-128B-0ms", 128, 0),
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def crc24q(payload: bytes) -> int:
    crc = 0
    for byte in payload:
        crc ^= byte << 16
        for _ in range(8):
            crc <<= 1
            if crc & 0x1000000:
                crc ^= 0x1864CFB
    return crc & 0xFFFFFF


def cobs_encode(payload: bytes) -> bytes:
    output = bytearray([0])
    code_index = 0
    code = 1
    for byte in payload:
        if byte == 0:
            output[code_index] = code
            code_index = len(output)
            output.append(0)
            code = 1
            continue
        output.append(byte)
        code += 1
        if code == 0xFF:
            output[code_index] = code
            code_index = len(output)
            output.append(0)
            code = 1
    output[code_index] = code
    return bytes(output)


def encode_field_link(frame_type: int, sequence: int, payload: bytes) -> bytes:
    header = struct.pack(
        ">BBBBII", FIELD_LINK_VERSION, frame_type, 0, 0, sequence & 0xFFFFFFFF, len(payload)
    )
    packet = header + payload
    return cobs_encode(packet + struct.pack(">I", binascii.crc32(packet) & 0xFFFFFFFF)) + b"\x00"


def inspect_rtcm_frame(frame: bytes) -> tuple[int, int]:
    if len(frame) < 8 or frame[0] != 0xD3 or frame[1] & 0xFC:
        raise ValueError("invalid RTCM3 header")
    payload_bytes = ((frame[1] & 0x03) << 8) | frame[2]
    if len(frame) != payload_bytes + 6 or payload_bytes < 2:
        raise ValueError("invalid RTCM3 length")
    expected_crc = int.from_bytes(frame[-3:], "big")
    actual_crc = crc24q(frame[:-3])
    if expected_crc != actual_crc:
        raise ValueError("RTCM3 CRC24Q mismatch")
    return (frame[3] << 4) | (frame[4] >> 4), actual_crc


def extract_rtcm_frames(payload: bytes) -> tuple[list[bytes], dict[str, int]]:
    frames: list[bytes] = []
    invalid_crc = 0
    discarded_bytes = 0
    cursor = 0
    while cursor < len(payload):
        preamble = payload.find(b"\xD3", cursor)
        if preamble < 0:
            discarded_bytes += len(payload) - cursor
            break
        discarded_bytes += preamble - cursor
        if preamble + 3 > len(payload):
            discarded_bytes += len(payload) - preamble
            break
        frame_bytes = (((payload[preamble + 1] & 0x03) << 8) | payload[preamble + 2]) + 6
        if frame_bytes > RTCM_MAX_FRAME_BYTES or preamble + frame_bytes > len(payload):
            discarded_bytes += 1
            cursor = preamble + 1
            continue
        frame = payload[preamble : preamble + frame_bytes]
        try:
            inspect_rtcm_frame(frame)
        except ValueError:
            invalid_crc += 1
            discarded_bytes += 1
            cursor = preamble + 1
            continue
        frames.append(frame)
        cursor = preamble + frame_bytes
    return frames, {"invalidCrcFrames": invalid_crc, "discardedBytes": discarded_bytes}


def rtcm_class(message_type: int) -> int:
    if 1071 <= message_type <= 1137:
        return 1
    if message_type in (1005, 1006, 1007, 1008, 1033):
        return 2
    return 3


def rtcm_ttl_ms(message_class: int) -> int:
    if message_class == 1:
        return 3000
    if message_class == 2:
        return 600_000
    return 30_000


def encode_rtcm_fragment_payload(
    frame: bytes,
    fragment_data: bytes,
    fragment_index: int,
    fragment_count: int,
    fragment_offset: int,
    session_epoch: int,
    sequence: int,
    generated_unix_ms: int,
) -> bytes:
    message_type, frame_crc = inspect_rtcm_frame(frame)
    message_class = rtcm_class(message_type)
    flags = 1 if message_class == 2 else 0
    common = struct.pack(
        ">BBBBBBBBIIQI",
        0x47,
        0x33,
        3,
        28,
        flags,
        0,
        TARGET_ALL_NODES,
        1,
        session_epoch,
        sequence,
        generated_unix_ms,
        rtcm_ttl_ms(message_class),
    )
    fragment_header = struct.pack(
        ">HBBBBHHI",
        message_type,
        message_class,
        fragment_index,
        fragment_count,
        0,
        len(frame),
        fragment_offset,
        frame_crc,
    )
    payload = common + fragment_header + fragment_data
    if len(payload) != RTCM_FRAGMENT_HEADER_BYTES + len(fragment_data):
        raise AssertionError("RTCM V3 fragment header size drifted")
    return payload


def fragment_wire_lengths(frame: bytes, max_fragment_data_bytes: int, sequence: int) -> list[int]:
    fragment_count = math.ceil(len(frame) / max_fragment_data_bytes)
    if fragment_count > 32:
        raise ValueError("profile exceeds the 32-fragment V3.1 receiver bound")
    wire_lengths: list[int] = []
    for index in range(fragment_count):
        offset = index * max_fragment_data_bytes
        fragment_data = frame[offset : offset + max_fragment_data_bytes]
        payload = encode_rtcm_fragment_payload(
            frame,
            fragment_data,
            index,
            fragment_count,
            offset,
            session_epoch=1,
            sequence=sequence,
            generated_unix_ms=1_785_059_400_000,
        )
        wire_lengths.append(len(encode_field_link(FIELD_LINK_TYPE_RTCM, sequence + index, payload)))
    return wire_lengths


def paced_write_ms(wire_bytes: int, baud: int, profile: PacingProfile) -> float:
    uart_ms = wire_bytes * 10_000.0 / baud
    delays = max(0, math.ceil(wire_bytes / profile.chunk_bytes) - 1)
    return uart_ms + delays * profile.chunk_delay_ms


def build_synthetic_rtcm_frame(message_type: int, frame_bytes: int) -> bytes:
    if frame_bytes < 8 or frame_bytes > RTCM_MAX_FRAME_BYTES:
        raise ValueError("synthetic RTCM frame size must be in [8, 1029]")
    payload_bytes = frame_bytes - 6
    payload = bytearray(payload_bytes)
    payload[0] = message_type >> 4
    payload[1] = (message_type & 0x0F) << 4
    for index in range(2, payload_bytes):
        payload[index] = 0 if index % 17 == 0 else (index * 29) & 0xFF
    header = bytes((0xD3, (payload_bytes >> 8) & 0x03, payload_bytes & 0xFF))
    packet = header + bytes(payload)
    return packet + crc24q(packet).to_bytes(3, "big")


def model_frames(bytes_per_second: int, duration_seconds: float, model_frame_bytes: int) -> list[bytes]:
    total_bytes = max(1, round(bytes_per_second * duration_seconds))
    count = max(1, math.ceil(total_bytes / model_frame_bytes))
    message_types = (1124, 1074, 1084, 1094, 1114, 1005, 1033)
    frames: list[bytes] = []
    remaining = total_bytes
    for index in range(count):
        remaining_frames = count - index
        frame_bytes = min(model_frame_bytes, max(8, remaining - 8 * (remaining_frames - 1)))
        frames.append(build_synthetic_rtcm_frame(message_types[index % len(message_types)], frame_bytes))
        remaining -= frame_bytes
    return frames


def analyze(
    frames: Iterable[bytes],
    duration_seconds: float,
    fragment_data_bytes: int,
    profile: PacingProfile,
    baud: int,
    control_reserve_bps: int,
) -> dict[str, object]:
    frame_list = list(frames)
    rtcm_raw_bytes = sum(len(frame) for frame in frame_list)
    rtcm_wire_bytes = 0
    fragment_count = 0
    downlink_write_ms = 0.0
    maximum_wire_frame = 0
    for sequence, frame in enumerate(frame_list, start=1):
        wire_lengths = fragment_wire_lengths(frame, fragment_data_bytes, sequence)
        fragment_count += len(wire_lengths)
        rtcm_wire_bytes += sum(wire_lengths)
        maximum_wire_frame = max(maximum_wire_frame, *wire_lengths)
        downlink_write_ms += sum(paced_write_ms(length, baud, profile) for length in wire_lengths)

    fixed_wire_bps = (
        3 * GNSS_CORE_WIRE_BYTES_MAX
        + COMPACT_BROADCAST_POLL_WIRE_BYTES
        + 3 * COMPACT_TELEMETRY_WIRE_BYTES
        + control_reserve_bps
    )
    rtcm_wire_bps = rtcm_wire_bytes / duration_seconds
    total_wire_bps = rtcm_wire_bps + fixed_wire_bps
    uart_capacity_bps = baud / 10.0
    utilization = total_wire_bps / uart_capacity_bps * 100.0
    writer_duty = downlink_write_ms / (duration_seconds * 1000.0) * 100.0
    return {
        "pacingProfile": profile.name,
        "uartChunkBytes": profile.chunk_bytes,
        "uartChunkDelayMs": profile.chunk_delay_ms,
        "rtcmFragmentDataBytes": fragment_data_bytes,
        "rtcmFrames": len(frame_list),
        "rtcmFragments": fragment_count,
        "rtcmRawBytes": rtcm_raw_bytes,
        "rtcmWireBytes": rtcm_wire_bytes,
        "rtcmWireBytesPerSecond": round(rtcm_wire_bps, 2),
        "protocolExpansionRatio": round(rtcm_wire_bytes / rtcm_raw_bytes, 4),
        "maximumWireFrameBytes": maximum_wire_frame,
        "fixedGnssTelemetryAndControlBytesPerSecond": fixed_wire_bps,
        "estimatedTotalWireBytesPerSecond": round(total_wire_bps, 2),
        "uartPayloadCapacityBytesPerSecond": round(uart_capacity_bps, 2),
        "estimatedCombinedUartUtilizationPct": round(utilization, 2),
        "estimatedRtcmWriterDutyPct": round(writer_duty, 2),
        "eligibleForHardwareSweep": utilization <= 70.0 and writer_duty <= 70.0,
        "hardwareGatePassed": False,
    }


def parse_fragment_sizes(value: str) -> list[int]:
    values = sorted({int(item.strip()) for item in value.split(",") if item.strip()})
    if not values or any(item < 32 or item > 512 for item in values):
        raise argparse.ArgumentTypeError("fragment sizes must be comma-separated integers in [32, 512]")
    return values


def self_test() -> None:
    frame = build_synthetic_rtcm_frame(1124, 129)
    assert inspect_rtcm_frame(frame)[0] == 1124
    assert len(fragment_wire_lengths(frame, 160, 1)) == 1
    assert fragment_wire_lengths(frame, 160, 1)[0] <= 220
    corrupted = bytearray(frame)
    corrupted[-1] ^= 1
    try:
        inspect_rtcm_frame(bytes(corrupted))
    except ValueError as exc:
        assert "CRC24Q" in str(exc)
    else:
        raise AssertionError("corrupted RTCM frame unexpectedly passed")
    print("xls1 GNSS V3.1 capacity sweep self-test passed")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Offline RTCM/GNSS byte-budget sweep. This tool never opens a serial port."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--rtcm-capture", type=Path, help="Raw RTCM3 byte capture without NTRIP credentials")
    source.add_argument("--model-rtcm-bps", type=int, help="Explicit approximate model when no raw capture exists")
    parser.add_argument("--capture-duration-seconds", type=float, default=60.0)
    parser.add_argument("--model-frame-bytes", type=int, default=180)
    parser.add_argument("--fragment-data-bytes", type=parse_fragment_sizes, default=[46, 96, 160])
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--control-reserve-bps", type=int, default=128)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()

    if args.self_test:
        self_test()
        return 0
    if args.capture_duration_seconds <= 0 or args.baud <= 0 or args.control_reserve_bps < 0:
        parser.error("duration and baud must be positive; control reserve must be non-negative")

    capture_diagnostics = {"invalidCrcFrames": 0, "discardedBytes": 0}
    if args.rtcm_capture:
        frames, capture_diagnostics = extract_rtcm_frames(args.rtcm_capture.read_bytes())
        if not frames:
            parser.error("capture contains no complete CRC-valid RTCM3 frames")
        source_info = {
            "mode": "raw-capture",
            "captureFile": args.rtcm_capture.name,
            "captureShaOrContent": "not-recorded",
        }
    else:
        model_bps = args.model_rtcm_bps
        if model_bps is None:
            parser.error("provide --rtcm-capture or explicitly select --model-rtcm-bps")
        if model_bps <= 0:
            parser.error("--model-rtcm-bps must be positive")
        frames = model_frames(model_bps, args.capture_duration_seconds, args.model_frame_bytes)
        source_info = {
            "mode": "approximate-model",
            "modeledRtcmBytesPerSecond": model_bps,
            "modeledFrameBytes": args.model_frame_bytes,
        }

    type_counts: Counter[int] = Counter(inspect_rtcm_frame(frame)[0] for frame in frames)
    results = [
        analyze(
            frames,
            args.capture_duration_seconds,
            fragment_bytes,
            profile,
            args.baud,
            args.control_reserve_bps,
        )
        for fragment_bytes in args.fragment_data_bytes
        for profile in PACING_PROFILES
    ]
    report = {
        "schemaVersion": 1,
        "experiment": "xls1-gnss-v31-capacity-sweep-offline",
        "generatedAt": utc_now(),
        "source": source_info,
        "captureDurationSeconds": args.capture_duration_seconds,
        "captureDiagnostics": capture_diagnostics,
        "rtcmTypeCounts": {str(key): value for key, value in sorted(type_counts.items())},
        "assumptions": {
            "baud": args.baud,
            "uartBitsPerByte": 10,
            "gnssCoreNodesAt1Hz": 3,
            "gnssCoreWireBytesPerNodeMax": GNSS_CORE_WIRE_BYTES_MAX,
            "compactBroadcastPollWireBytesPerSecond": COMPACT_BROADCAST_POLL_WIRE_BYTES,
            "compactTelemetryWireBytesPerSecond": 3 * COMPACT_TELEMETRY_WIRE_BYTES,
            "controlReserveBytesPerSecond": args.control_reserve_bps,
            "radioCapacityKnown": False,
        },
        "results": results,
        "interpretation": {
            "eligibleForHardwareSweep": "Only an offline UART/pacing screen; it is not an XLS1 pass.",
            "hardwareGate": "Requires three-node mixed-load correction-age and Fixed evidence for at least 60 minutes.",
        },
    }
    rendered = json.dumps(report, ensure_ascii=True, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
        print(f"REPORT_FILE path={args.output.resolve()}")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
