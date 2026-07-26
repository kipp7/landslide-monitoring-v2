#!/usr/bin/env python3
"""Plan an XLS1 GNSS V3.1 mixed-load sweep without transmitting to hardware."""

from __future__ import annotations

import argparse
import binascii
import json
import math
import re
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


def parse_rtcm_type_counts(value: str) -> Counter[int]:
    counts: Counter[int] = Counter()
    if value == "none":
        return counts
    for item in value.split(","):
        message_type, separator, count = item.partition(":")
        if not separator:
            raise ValueError(f"invalid RTCM type count: {item}")
        parsed_type = int(message_type)
        parsed_count = int(count)
        if not 1 <= parsed_type <= 4095 or parsed_count <= 0:
            raise ValueError(f"invalid RTCM type count: {item}")
        counts[parsed_type] += parsed_count
    return counts


def parse_summary_result(result_line: str) -> tuple[float, int, int, Counter[int]]:
    fields = dict(re.findall(r"(\w+)=([^\s]+)", result_line))
    required = ("duration", "valid_rtcm_bytes", "rtcm_crc_errors", "rtcm_types")
    missing = [key for key in required if key not in fields]
    if missing:
        raise ValueError(f"summary RESULT is missing: {', '.join(missing)}")
    duration_value = fields["duration"]
    if not duration_value.endswith("s"):
        raise ValueError("summary duration must end in 's'")
    duration_seconds = float(duration_value[:-1])
    valid_rtcm_bytes = int(fields["valid_rtcm_bytes"])
    crc_errors = int(fields["rtcm_crc_errors"])
    type_counts = parse_rtcm_type_counts(fields["rtcm_types"])
    if duration_seconds <= 0 or valid_rtcm_bytes <= 0 or crc_errors < 0 or not type_counts:
        raise ValueError("summary values are outside their valid ranges")
    return duration_seconds, valid_rtcm_bytes, crc_errors, type_counts


def parse_summary_log(path: Path) -> tuple[float, int, int, Counter[int]]:
    result_lines = [
        line
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.startswith("RESULT ")
    ]
    if not result_lines:
        raise ValueError("summary log has no RESULT line")
    return parse_summary_result(result_lines[-1])


def model_frames_from_summary(total_bytes: int, type_counts: Counter[int]) -> list[bytes]:
    frame_count = sum(type_counts.values())
    if total_bytes < frame_count * 8 or total_bytes > frame_count * RTCM_MAX_FRAME_BYTES:
        raise ValueError("summary byte count is incompatible with its RTCM frame count")
    base_frame_bytes, larger_frame_count = divmod(total_bytes, frame_count)
    frames: list[bytes] = []
    for message_type, count in sorted(type_counts.items()):
        for _ in range(count):
            frame_bytes = base_frame_bytes + (1 if larger_frame_count > 0 else 0)
            if larger_frame_count > 0:
                larger_frame_count -= 1
            frames.append(build_synthetic_rtcm_frame(message_type, frame_bytes))
    if sum(len(frame) for frame in frames) != total_bytes:
        raise AssertionError("summary reconstruction byte count drifted")
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
    summary = (
        "RESULT completed=False duration=10.5s valid_rtcm_bytes=160 "
        "rtcm_crc_errors=0 rtcm_types=1005:10,1074:10\n"
    )
    duration, total_bytes, errors, counts = parse_summary_result(summary)
    assert duration == 10.5
    assert total_bytes == 160
    assert errors == 0
    summary_frames = model_frames_from_summary(160, counts)
    assert len(summary_frames) == 20
    assert sum(len(item) for item in summary_frames) == 160
    print("xls1 GNSS V3.1 capacity sweep self-test passed")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Offline RTCM/GNSS byte-budget sweep. This tool never opens a serial port."
    )
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--rtcm-capture", type=Path, help="Raw RTCM3 byte capture without NTRIP credentials")
    source.add_argument(
        "--rtcm-summary-log",
        type=Path,
        help="ntrip_rtk_test.py text log; only its final RESULT summary is used",
    )
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

    duration_seconds = args.capture_duration_seconds
    capture_diagnostics: dict[str, int | None] = {"invalidCrcFrames": 0, "discardedBytes": 0}
    if args.rtcm_capture:
        frames, capture_diagnostics = extract_rtcm_frames(args.rtcm_capture.read_bytes())
        if not frames:
            parser.error("capture contains no complete CRC-valid RTCM3 frames")
        source_info = {
            "mode": "raw-capture",
            "captureFile": args.rtcm_capture.name,
            "captureShaOrContent": "not-recorded",
        }
    elif args.rtcm_summary_log:
        try:
            duration_seconds, valid_rtcm_bytes, crc_errors, summary_counts = parse_summary_log(
                args.rtcm_summary_log
            )
            frames = model_frames_from_summary(valid_rtcm_bytes, summary_counts)
        except (OSError, UnicodeError, ValueError) as exc:
            parser.error(f"cannot use RTCM summary log: {exc}")
        capture_diagnostics = {"invalidCrcFrames": crc_errors, "discardedBytes": None}
        source_info = {
            "mode": "measured-summary-log",
            "summaryFile": args.rtcm_summary_log.name,
            "measuredRtcmBytes": valid_rtcm_bytes,
            "measuredRtcmBytesPerSecond": round(valid_rtcm_bytes / duration_seconds, 2),
            "measuredRtcmFrames": sum(summary_counts.values()),
            "meanRtcmFrameBytes": round(valid_rtcm_bytes / sum(summary_counts.values()), 2),
            "frameReconstruction": "uniform-average-size-from-measured-byte-and-frame-counts",
            "individualFrameSizesAvailable": False,
            "arrivalTimingAvailable": False,
        }
    else:
        model_bps = args.model_rtcm_bps
        if model_bps is None:
            parser.error(
                "provide --rtcm-capture, --rtcm-summary-log, or explicitly select --model-rtcm-bps"
            )
        if model_bps <= 0:
            parser.error("--model-rtcm-bps must be positive")
        frames = model_frames(model_bps, duration_seconds, args.model_frame_bytes)
        source_info = {
            "mode": "approximate-model",
            "modeledRtcmBytesPerSecond": model_bps,
            "modeledFrameBytes": args.model_frame_bytes,
        }

    type_counts: Counter[int] = Counter(inspect_rtcm_frame(frame)[0] for frame in frames)
    results = [
        analyze(
            frames,
            duration_seconds,
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
        "captureDurationSeconds": duration_seconds,
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
