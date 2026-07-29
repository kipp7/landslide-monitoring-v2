#!/usr/bin/env python3
"""Send bounded synthetic RTCM V3.1 traffic to RK2206 PROBE firmware."""

from __future__ import annotations

import argparse
import binascii
import json
import math
import os
import select
import signal
import struct
import subprocess
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from queue import Empty, Queue
from typing import Any, Callable

try:
    import termios
except ImportError:
    termios = None


FIELD_LINK_VERSION = 1
FIELD_LINK_TYPE_COMMAND = 2
FIELD_LINK_TYPE_CONTROL = 4
FIELD_LINK_TYPE_RTCM = 6
RTCM_FRAGMENT_HEADER_BYTES = 42
GNSS_PROBE_STATS_RESPONSE_BYTES = {1: 92, 2: 148, 3: 204}
GNSS_RTCM_ACK_RESPONSE_BYTES = 24
TARGET_MASKS = {"A": 0x01, "B": 0x02, "C": 0x04, "all": 0x07}
NODE_NUMBERS = {"A": 1, "B": 2, "C": 3}
PROBE_COUNTER_NAMES = (
    "acceptedFragments",
    "duplicateFragments",
    "rejectedFragments",
    "completedFrames",
    "crcErrors",
    "expiredAssemblies",
    "capacityEvictions",
    "ttlUnverifiedFragments",
    "queuedFrames",
    "queueEvictions",
    "queueExpiredFrames",
    "probeValidatedFrames",
    "probeValidatedBytes",
    "injectedFrames",
    "injectedBytes",
    "uartWriteErrors",
    "uartPartialWrites",
    "injectionDroppedFrames",
)
PROBE_TYPE_COUNTERS = (1005, 1033, 1074, 1094, 1114, 1124)
PROBE_LINK_COUNTER_NAMES = (
    "decodedFrames",
    "decodedRtcmFrames",
    "decodeErrors",
    "sequenceGaps",
    "sequenceDuplicates",
    "sequenceResets",
    "fifoDroppedBytes",
    "fifoDropEvents",
)
SENSOR_DIAGNOSTIC_NAMES = (
    "um220Gnss",
    "rsEcthSoil",
    "rsEcthEc",
    "rsDipTilt",
)

# The schedule reproduces the July 26 PC capture at about 880 B/s without
# retaining site coordinates or NTRIP credentials. Frame sizes approximate the
# measured mix; rate and type proportions come from the final capture summary.
PER_SECOND_EVENTS = (
    (0.00, 1124, 250),
    (0.10, 1074, 90),
    (0.20, 1084, 90),
    (0.30, 1094, 90),
    (0.40, 1114, 90),
    (0.50, 1124, 250),
)
REFERENCE_EVENTS = ((0.70, 1005, 100), (0.80, 1033, 100))

# UM220-IV NK supports GPS L1, BDS B1, Galileo E1 and QZSS, but not GLONASS.
# The shaped profile keeps the newest 1 Hz observation for each supported
# constellation and spreads the two slow reference messages across ten seconds.
UM220_SHAPED_EVENTS = (
    (0.00, 1124, 250),
    (0.40, 1074, 90),
    (0.60, 1094, 90),
    (0.80, 1114, 90),
)


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


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


def cobs_decode(payload: bytes) -> bytes:
    output = bytearray()
    index = 0
    while index < len(payload):
        code = payload[index]
        if code == 0:
            raise ValueError("COBS frame contains an embedded delimiter")
        index += 1
        next_index = index + code - 1
        if next_index > len(payload):
            raise ValueError("COBS code exceeds the encoded frame")
        output.extend(payload[index:next_index])
        index = next_index
        if code != 0xFF and index < len(payload):
            output.append(0)
    return bytes(output)


def encode_field_link(sequence: int, payload: bytes, frame_type: int = FIELD_LINK_TYPE_RTCM) -> bytes:
    header = struct.pack(
        ">BBBBII",
        FIELD_LINK_VERSION,
        frame_type,
        0,
        0,
        sequence & 0xFFFFFFFF,
        len(payload),
    )
    packet = header + payload
    crc = binascii.crc32(packet) & 0xFFFFFFFF
    return cobs_encode(packet + struct.pack(">I", crc)) + b"\x00"


def decode_field_link(encoded: bytes) -> tuple[int, int, bytes]:
    packet = cobs_decode(encoded)
    if len(packet) < 16:
        raise ValueError("field-link packet is shorter than its header and CRC")
    version, frame_type, flags, reserved, sequence, payload_bytes = struct.unpack(
        ">BBBBII", packet[:12]
    )
    if version != FIELD_LINK_VERSION or flags != 0 or reserved != 0:
        raise ValueError("unsupported field-link header")
    if len(packet) != 12 + payload_bytes + 4:
        raise ValueError("field-link payload length mismatch")
    expected_crc = struct.unpack(">I", packet[-4:])[0]
    actual_crc = binascii.crc32(packet[:-4]) & 0xFFFFFFFF
    if expected_crc != actual_crc:
        raise ValueError("field-link CRC32 mismatch")
    return frame_type, sequence, packet[12:-4]


class FieldLinkStreamDecoder:
    def __init__(self) -> None:
        self._encoded = bytearray()
        self.decode_errors = 0

    def feed(self, data: bytes) -> list[tuple[int, int, bytes]]:
        frames: list[tuple[int, int, bytes]] = []
        for byte in data:
            if byte != 0:
                if len(self._encoded) >= 4096:
                    self._encoded.clear()
                    self.decode_errors += 1
                else:
                    self._encoded.append(byte)
                continue
            if not self._encoded:
                continue
            try:
                frames.append(decode_field_link(bytes(self._encoded)))
            except ValueError:
                self.decode_errors += 1
            self._encoded.clear()
        return frames


def encode_probe_stats_query(target: str, nonce: int) -> bytes:
    if target not in NODE_NUMBERS or not 1 <= nonce <= 0xFFFFFFFF:
        raise ValueError("stats query requires node A/B/C and a non-zero uint32 nonce")
    return f"G3Q{target}{nonce:08X}".encode("ascii")


def encode_rtcm_ack_query(target: str, nonce: int) -> bytes:
    if target not in NODE_NUMBERS or not 1 <= nonce <= 0xFFFFFFFF:
        raise ValueError("RTCM ACK query requires node A/B/C and a non-zero uint32 nonce")
    return f"G3A{target}{nonce:08X}".encode("ascii")


def decode_rtcm_ack_response(payload: bytes) -> dict[str, Any]:
    if len(payload) != GNSS_RTCM_ACK_RESPONSE_BYTES or payload[:4] != b"G3A\x01":
        raise ValueError("RTCM ACK response magic, version or length is invalid")
    node_number = payload[4]
    injection_mode = payload[5]
    flags = payload[6]
    if node_number not in (1, 2, 3) or injection_mode not in (0, 1, 2):
        raise ValueError("RTCM ACK node or injection mode is invalid")
    if flags & ~0x01 or payload[7] != 0 or payload[22:24] != b"\x00\x00":
        raise ValueError("RTCM ACK flags or reserved bytes are invalid")
    nonce, session_epoch, highest_sequence = struct.unpack_from(">III", payload, 8)
    completed_bitmap = struct.unpack_from(">H", payload, 20)[0]
    if nonce == 0:
        raise ValueError("RTCM ACK nonce is zero")
    session_valid = bool(flags & 0x01)
    if session_valid and session_epoch == 0:
        raise ValueError("RTCM ACK valid session has a zero epoch")
    if not session_valid and (session_epoch != 0 or highest_sequence != 0 or completed_bitmap != 0):
        raise ValueError("RTCM ACK invalid session carries state")
    return {
        "responseVersion": 1,
        "nodeNumber": node_number,
        "injectionMode": injection_mode,
        "nonce": nonce,
        "sessionValid": session_valid,
        "sessionEpoch": session_epoch,
        "highestSequence": highest_sequence,
        "completedBitmap": completed_bitmap,
    }


def ack_reports_completed(ack: dict[str, Any], session_epoch: int, sequence: int) -> bool:
    if not ack["sessionValid"] or ack["sessionEpoch"] != session_epoch:
        return False
    delta = (ack["highestSequence"] - sequence) & 0xFFFFFFFF
    return delta < 16 and bool(ack["completedBitmap"] & (1 << delta))


def decode_probe_stats_response(payload: bytes) -> dict[str, Any]:
    if len(payload) < 4 or payload[:3] != b"G3S":
        raise ValueError("GNSS PROBE stats magic or version mismatch")
    response_version = payload[3]
    if response_version not in GNSS_PROBE_STATS_RESPONSE_BYTES:
        raise ValueError("GNSS PROBE stats version is unsupported")
    if len(payload) != GNSS_PROBE_STATS_RESPONSE_BYTES[response_version]:
        raise ValueError("GNSS PROBE stats payload length mismatch")
    node_number = payload[4]
    injection_mode = payload[5]
    if node_number not in (1, 2, 3) or injection_mode not in (0, 1, 2):
        raise ValueError("GNSS PROBE stats node or injection mode is invalid")
    if payload[6:8] != b"\x00\x00":
        raise ValueError("GNSS PROBE stats reserved bytes are non-zero")
    nonce, snapshot_uptime_s = struct.unpack_from(">II", payload, 8)
    if nonce == 0:
        raise ValueError("GNSS PROBE stats nonce is zero")
    counter_values = struct.unpack_from(">18I", payload, 16)
    queue_high_watermark, queue_pending = struct.unpack_from(">HH", payload, 88)
    response = {
        "responseVersion": response_version,
        "nodeNumber": node_number,
        "injectionMode": injection_mode,
        "nonce": nonce,
        "snapshotUptimeS": snapshot_uptime_s,
        "stats": {
            **dict(zip(PROBE_COUNTER_NAMES, counter_values, strict=True)),
            "queueHighWatermark": queue_high_watermark,
            "queuePending": queue_pending,
        },
    }
    if response_version >= 2:
        type_values = struct.unpack_from(">6I", payload, 92)
        link_values = struct.unpack_from(">8I", payload, 116)
        response["completedTypeCounts"] = {
            str(message_type): value
            for message_type, value in zip(PROBE_TYPE_COUNTERS, type_values, strict=True)
        }
        response["linkStats"] = dict(
            zip(PROBE_LINK_COUNTER_NAMES, link_values, strict=True)
        )
    if response_version >= 3:
        enabled_mask, initialization_success_mask, current_valid_mask, ever_success_mask = (
            payload[148:152]
        )
        sensor_count = payload[152]
        if sensor_count != len(SENSOR_DIAGNOSTIC_NAMES) or payload[153:156] != b"\x00\x00\x00":
            raise ValueError("GNSS PROBE sensor diagnostic count or reserved bytes are invalid")
        all_sensor_mask = (1 << sensor_count) - 1
        masks = (
            enabled_mask,
            initialization_success_mask,
            current_valid_mask,
            ever_success_mask,
        )
        if (
            any(mask & ~all_sensor_mask for mask in masks)
            or initialization_success_mask & ~enabled_mask
            or current_valid_mask & ~enabled_mask
            or ever_success_mask & ~enabled_mask
            or current_valid_mask & ~ever_success_mask
        ):
            raise ValueError("GNSS PROBE sensor diagnostic masks are inconsistent")
        sample_counts = struct.unpack_from(">4I", payload, 156)
        last_success_uptime_s = struct.unpack_from(">4I", payload, 172)
        consecutive_failures = struct.unpack_from(">4I", payload, 188)
        response["sensorDiagnostics"] = {
            "enabledMask": enabled_mask,
            "initializationSuccessMask": initialization_success_mask,
            "currentValidMask": current_valid_mask,
            "everSuccessMask": ever_success_mask,
            "sensors": {
                name: {
                    "index": index,
                    "mask": 1 << index,
                    "enabled": bool(enabled_mask & (1 << index)),
                    "initializationSucceeded": bool(
                        initialization_success_mask & (1 << index)
                    ),
                    "currentValid": bool(current_valid_mask & (1 << index)),
                    "everSucceeded": bool(ever_success_mask & (1 << index)),
                    "sampleCount": sample_counts[index],
                    "lastSuccessUptimeS": last_success_uptime_s[index],
                    "consecutiveFailures": consecutive_failures[index],
                }
                for index, name in enumerate(SENSOR_DIAGNOSTIC_NAMES)
            },
        }
    return response


def print_sensor_diagnostics(prefix: str, response: dict[str, Any]) -> None:
    diagnostics = response.get("sensorDiagnostics")
    if diagnostics is None:
        return
    print(
        f"{prefix}_SENSOR_MASKS enabled=0x{diagnostics['enabledMask']:02X} "
        f"init=0x{diagnostics['initializationSuccessMask']:02X} "
        f"current=0x{diagnostics['currentValidMask']:02X} "
        f"ever=0x{diagnostics['everSuccessMask']:02X}",
        flush=True,
    )
    for name, sensor in diagnostics["sensors"].items():
        if not sensor["enabled"]:
            continue
        print(
            f"{prefix}_SENSOR path={name} init={int(sensor['initializationSucceeded'])} "
            f"valid={int(sensor['currentValid'])} ever={int(sensor['everSucceeded'])} "
            f"samples={sensor['sampleCount']} last_ok_uptime={sensor['lastSuccessUptimeS']} "
            f"fail_streak={sensor['consecutiveFailures']}",
            flush=True,
        )


def uint32_delta(after: int, before: int) -> int:
    return (after - before) & 0xFFFFFFFF


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


def build_rtcm_frame(message_type: int, frame_bytes: int, sequence: int) -> bytes:
    if not 1 <= message_type <= 4095 or not 8 <= frame_bytes <= 1029:
        raise ValueError("RTCM type or frame size is outside the V3.1 bounds")
    payload_bytes = frame_bytes - 6
    payload = bytearray(payload_bytes)
    payload[0] = message_type >> 4
    payload[1] = (message_type & 0x0F) << 4
    for index in range(2, payload_bytes):
        value = (index * 29 + sequence * 17 + message_type) & 0xFF
        payload[index] = 0 if (index + sequence) % 31 == 0 else value
    header = bytes((0xD3, (payload_bytes >> 8) & 0x03, payload_bytes & 0xFF))
    packet = header + bytes(payload)
    return packet + crc24q(packet).to_bytes(3, "big")


def fragment_rtcm_frame(
    frame: bytes,
    message_type: int,
    session_epoch: int,
    transport_sequence: int,
    generated_unix_ms: int,
    target_mask: int,
    fragment_data_bytes: int,
) -> list[bytes]:
    frame_crc = int.from_bytes(frame[-3:], "big")
    message_class = rtcm_class(message_type)
    fragment_count = math.ceil(len(frame) / fragment_data_bytes)
    if fragment_count > 32:
        raise ValueError("fragment profile exceeds the RK2206 32-fragment bound")
    fragments: list[bytes] = []
    for fragment_index in range(fragment_count):
        offset = fragment_index * fragment_data_bytes
        data = frame[offset : offset + fragment_data_bytes]
        common = struct.pack(
            ">BBBBBBBBIIQI",
            0x47,
            0x33,
            3,
            28,
            1 if message_class == 2 else 0,
            0,
            target_mask,
            1,
            session_epoch,
            transport_sequence,
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
            offset,
            frame_crc,
        )
        payload = common + fragment_header + data
        if len(payload) != RTCM_FRAGMENT_HEADER_BYTES + len(data):
            raise AssertionError("RTCM fragment header size drifted")
        fragments.append(payload)
    return fragments


def configure_serial(fd: int, baud: int) -> None:
    if termios is None:
        raise RuntimeError("the PROBE sender requires Linux termios")
    speed_name = f"B{baud}"
    if not hasattr(termios, speed_name):
        raise ValueError(f"unsupported serial baud rate: {baud}")
    speed = getattr(termios, speed_name)
    attrs = termios.tcgetattr(fd)
    attrs[0] = 0
    attrs[1] = 0
    attrs[2] = termios.CLOCAL | termios.CREAD | termios.CS8
    attrs[3] = 0
    attrs[4] = speed
    attrs[5] = speed
    attrs[6][termios.VMIN] = 0
    attrs[6][termios.VTIME] = 1
    termios.tcsetattr(fd, termios.TCSANOW, attrs)
    termios.tcflush(fd, termios.TCIOFLUSH)


def write_chunked(fd: int, payload: bytes, chunk_bytes: int, chunk_delay_ms: int) -> None:
    offset = 0
    while offset < len(payload):
        chunk = payload[offset : offset + chunk_bytes]
        written = 0
        while written < len(chunk):
            try:
                count = os.write(fd, chunk[written:])
            except BlockingIOError:
                select.select([], [fd], [], 0.1)
                continue
            if count <= 0:
                raise OSError("serial write returned no progress")
            written += count
        offset += len(chunk)
        if offset < len(payload) and chunk_delay_ms > 0:
            time.sleep(chunk_delay_ms / 1000.0)


def query_probe_stats(
    fd: int,
    decoder: FieldLinkStreamDecoder,
    target: str,
    field_sequence: int,
    chunk_bytes: int,
    chunk_delay_ms: int,
    timeout_seconds: float,
    retries: int,
) -> tuple[dict[str, Any], int]:
    nonce = (time.time_ns() ^ (os.getpid() << 8) ^ field_sequence) & 0xFFFFFFFF
    if nonce == 0:
        nonce = 1
    query = encode_probe_stats_query(target, nonce)
    next_sequence = field_sequence
    payload_errors = 0

    for _attempt in range(retries):
        wire = encode_field_link(next_sequence, query, FIELD_LINK_TYPE_COMMAND)
        write_chunked(fd, wire, chunk_bytes, chunk_delay_ms)
        next_sequence = (next_sequence + 1) & 0xFFFFFFFF
        if next_sequence == 0:
            next_sequence = 1

        deadline = time.monotonic() + timeout_seconds
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            readable, _, _ = select.select([fd], [], [], remaining)
            if not readable:
                break
            try:
                chunk = os.read(fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                continue
            for frame_type, _sequence, payload in decoder.feed(chunk):
                if frame_type != FIELD_LINK_TYPE_CONTROL or not payload.startswith(b"G3S"):
                    continue
                try:
                    response = decode_probe_stats_response(payload)
                except ValueError:
                    payload_errors += 1
                    continue
                if response["nonce"] != nonce or response["nodeNumber"] != NODE_NUMBERS[target]:
                    continue
                response["queryAttempts"] = _attempt + 1
                response["payloadDecodeErrorsBeforeMatch"] = payload_errors
                return response, next_sequence

    raise TimeoutError(
        f"node {target} did not return a matching PROBE stats response after {retries} attempts"
    )


def query_rtcm_ack(
    fd: int,
    decoder: FieldLinkStreamDecoder,
    target: str,
    field_sequence: int,
    chunk_bytes: int,
    chunk_delay_ms: int,
    timeout_seconds: float,
    retries: int,
    write_lock: Any | None = None,
    sequence_supplier: Callable[[], int] | None = None,
) -> tuple[dict[str, Any], int]:
    nonce = (time.time_ns() ^ (os.getpid() << 8) ^ field_sequence) & 0xFFFFFFFF
    if nonce == 0:
        nonce = 1
    query = encode_rtcm_ack_query(target, nonce)
    next_sequence = field_sequence
    payload_errors = 0

    for attempt in range(retries):
        if sequence_supplier is None:
            query_sequence = next_sequence
            next_sequence = (next_sequence + 1) & 0xFFFFFFFF
            if next_sequence == 0:
                next_sequence = 1
        else:
            query_sequence = sequence_supplier()
        wire = encode_field_link(query_sequence, query, FIELD_LINK_TYPE_COMMAND)
        if write_lock is None:
            write_chunked(fd, wire, chunk_bytes, chunk_delay_ms)
        else:
            with write_lock:
                write_chunked(fd, wire, chunk_bytes, chunk_delay_ms)

        deadline = time.monotonic() + timeout_seconds
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            readable, _, _ = select.select([fd], [], [], remaining)
            if not readable:
                break
            try:
                chunk = os.read(fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                continue
            for frame_type, _sequence, payload in decoder.feed(chunk):
                if frame_type != FIELD_LINK_TYPE_CONTROL or not payload.startswith(b"G3A"):
                    continue
                try:
                    response = decode_rtcm_ack_response(payload)
                except ValueError:
                    payload_errors += 1
                    continue
                if response["nonce"] != nonce or response["nodeNumber"] != NODE_NUMBERS[target]:
                    continue
                response["queryAttempts"] = attempt + 1
                response["payloadDecodeErrorsBeforeMatch"] = payload_errors
                return response, next_sequence

    raise TimeoutError(
        f"node {target} did not return a matching RTCM ACK after {retries} attempts"
    )


def evaluate_probe_gate(
    baseline: dict[str, Any],
    final: dict[str, Any],
    expected_fragments: int,
    expected_frames: int,
    expected_rtcm_bytes: int,
    expected_message_counts: Counter[int],
    required_stats_version: int,
    reliability: dict[str, Any] | None = None,
) -> dict[str, Any]:
    before_stats = baseline["stats"]
    after_stats = final["stats"]
    deltas = {
        name: uint32_delta(after_stats[name], before_stats[name])
        for name in PROBE_COUNTER_NAMES
    }
    checks: list[dict[str, Any]] = []

    def exact(name: str, actual: Any, expected: Any) -> None:
        checks.append({
            "name": name,
            "expected": expected,
            "actual": actual,
            "passed": actual == expected,
        })

    def at_least(name: str, actual: int, expected: int) -> None:
        checks.append({
            "name": name,
            "expected": f">= {expected}",
            "actual": actual,
            "passed": actual >= expected,
        })

    def at_most(name: str, actual: int | float, expected: int | float) -> None:
        checks.append({
            "name": name,
            "expected": f"<= {expected}",
            "actual": actual,
            "passed": actual <= expected,
        })

    exact("baselineInjectionMode", baseline["injectionMode"], 1)
    exact("finalInjectionMode", final["injectionMode"], 1)
    at_least("baselineStatsVersion", baseline["responseVersion"], required_stats_version)
    at_least("finalStatsVersion", final["responseVersion"], required_stats_version)
    exact("sameStatsVersion", final["responseVersion"], baseline["responseVersion"])
    exact("sameNode", final["nodeNumber"], baseline["nodeNumber"])
    checks.append({
        "name": "nodeDidNotReboot",
        "expected": "final uptime >= baseline uptime",
        "actual": {
            "baseline": baseline["snapshotUptimeS"],
            "final": final["snapshotUptimeS"],
        },
        "passed": final["snapshotUptimeS"] >= baseline["snapshotUptimeS"],
    })
    exact("baselineQueuePending", before_stats["queuePending"], 0)
    exact("finalQueuePending", after_stats["queuePending"], 0)
    exact("acceptedFragmentsDelta", deltas["acceptedFragments"], expected_fragments)
    exact("completedFramesDelta", deltas["completedFrames"], expected_frames)
    exact("ttlUnverifiedFragmentsDelta", deltas["ttlUnverifiedFragments"], expected_fragments)
    exact("queuedFramesDelta", deltas["queuedFrames"], expected_frames)
    exact("probeValidatedFramesDelta", deltas["probeValidatedFrames"], expected_frames)
    exact("probeValidatedBytesDelta", deltas["probeValidatedBytes"], expected_rtcm_bytes)

    zero_delta_counters = [
        "rejectedFragments",
        "crcErrors",
        "expiredAssemblies",
        "capacityEvictions",
        "queueEvictions",
        "queueExpiredFrames",
        "injectedFrames",
        "injectedBytes",
        "uartWriteErrors",
        "uartPartialWrites",
        "injectionDroppedFrames",
    ]
    if reliability is None:
        zero_delta_counters.insert(0, "duplicateFragments")
    for name in zero_delta_counters:
        exact(f"{name}Delta", deltas[name], 0)

    type_deltas: dict[str, int] | None = None
    link_deltas: dict[str, int] | None = None
    if baseline["responseVersion"] >= 2 and final["responseVersion"] >= 2:
        type_deltas = {
            str(message_type): uint32_delta(
                final["completedTypeCounts"][str(message_type)],
                baseline["completedTypeCounts"][str(message_type)],
            )
            for message_type in PROBE_TYPE_COUNTERS
        }
        for message_type in PROBE_TYPE_COUNTERS:
            exact(
                f"completedType{message_type}Delta",
                type_deltas[str(message_type)],
                expected_message_counts[message_type],
            )

        link_deltas = {
            name: uint32_delta(final["linkStats"][name], baseline["linkStats"][name])
            for name in PROBE_LINK_COUNTER_NAMES
        }
        if reliability is None:
            exact("decodedRtcmFramesDelta", link_deltas["decodedRtcmFrames"], expected_fragments)
        else:
            at_least("decodedRtcmFramesDelta", link_deltas["decodedRtcmFrames"], expected_fragments)
        for name in (
            "fifoDroppedBytes",
            "fifoDropEvents",
        ):
            exact(f"{name}Delta", link_deltas[name], 0)
        if reliability is None:
            exact("decodeErrorsDelta", link_deltas["decodeErrors"], 0)

    if reliability is not None:
        exact("reliabilityFailedWindows", reliability["failedWindows"], 0)
        exact(
            "reliabilityRecoveredWindows",
            reliability["recoveredWindows"],
            reliability["windowCount"],
        )
        at_most(
            "reliabilityMaxRecoveryLatencyMs",
            reliability["maxRecoveryLatencyMs"],
            reliability["maxRecoveryAgeMs"],
        )
        at_most(
            "reliabilityMaxOldestPendingAgeMs",
            reliability["maxOldestPendingAgeMs"],
            reliability["maxRecoveryAgeMs"],
        )
        at_most("reliabilityMaxPendingFrames", reliability["maxPendingFrames"], 16)
        at_least(
            "reliabilityMinBitmapHeadroom", reliability["minBitmapHeadroom"], 0
        )
        at_most(
            "reliabilityRetransmitRatio",
            reliability["retransmitRatio"],
            reliability["maxRetransmitRatio"],
        )
        at_most(
            "reliabilityMaxScheduleLatenessMs",
            reliability["maxScheduleLatenessMs"],
            reliability["maxAllowedScheduleLatenessMs"],
        )

    failed = [check["name"] for check in checks if not check["passed"]]
    return {
        "passed": not failed,
        "failedChecks": failed,
        "deltas": deltas,
        "typeDeltas": type_deltas,
        "linkDeltas": link_deltas,
        "reliability": reliability,
        "checks": checks,
    }


def service_is_active(service_name: str) -> bool:
    return subprocess.run(
        ["systemctl", "is-active", "--quiet", service_name], check=False
    ).returncode == 0


def build_measured_mix_schedule(duration_seconds: float) -> list[tuple[float, int, int]]:
    schedule: list[tuple[float, int, int]] = []
    whole_seconds = math.ceil(duration_seconds)
    for second in range(whole_seconds):
        events = list(PER_SECOND_EVENTS)
        if second % 10 == 0:
            events.extend(REFERENCE_EVENTS)
        for offset, message_type, frame_bytes in events:
            due = second + offset
            if due < duration_seconds:
                schedule.append((due, message_type, frame_bytes))
    return sorted(schedule)


def build_packet_rate_schedule(
    duration_seconds: float,
    packet_rate_hz: float,
    packet_frame_bytes: int,
    packet_message_type: int,
) -> list[tuple[float, int, int]]:
    event_count = math.ceil(duration_seconds * packet_rate_hz - 1e-12)
    return [
        (index / packet_rate_hz, packet_message_type, packet_frame_bytes)
        for index in range(event_count)
    ]


def build_um220_shaped_schedule(
    duration_seconds: float,
    include_qzss: bool = True,
    qzss_rate_hz: float = 1.0,
) -> list[tuple[float, int, int]]:
    schedule: list[tuple[float, int, int]] = []
    for second in range(math.ceil(duration_seconds)):
        events = [event for event in UM220_SHAPED_EVENTS if event[1] != 1114]
        qzss_due = include_qzss and (
            qzss_rate_hz == 1.0 or (qzss_rate_hz == 0.5 and second % 2 == 0)
        )
        if qzss_due:
            events.append((0.80, 1114, 90))
        if second % 10 == 5:
            events.append((0.20, 1005, 100))
        if second % 10 == 9:
            events.append((0.20, 1033, 100))
        for offset, message_type, frame_bytes in events:
            due = second + offset
            if due < duration_seconds:
                schedule.append((due, message_type, frame_bytes))
    return sorted(schedule)


def build_schedule(args: argparse.Namespace) -> list[tuple[float, int, int]]:
    if args.profile == "packet-rate":
        return build_packet_rate_schedule(
            args.duration_seconds,
            args.packet_rate_hz,
            args.packet_frame_bytes,
            args.packet_message_type,
        )
    if args.profile == "um220-shaped":
        return build_um220_shaped_schedule(
            args.duration_seconds,
            include_qzss=args.um220_include_qzss,
            qzss_rate_hz=args.um220_qzss_rate_hz,
        )
    return build_measured_mix_schedule(args.duration_seconds)


def run_probe(args: argparse.Namespace) -> dict[str, Any]:
    schedule = build_schedule(args)
    if not schedule:
        raise ValueError("duration did not produce any scheduled RTCM frames")
    session_epoch = int(time.time()) & 0xFFFFFFFF
    transport_sequence = 1
    field_sequence = 1
    raw_bytes = 0
    wire_bytes = 0
    fragment_count = 0
    transmitted_fragment_count = 0
    retransmitted_frame_count = 0
    retransmitted_fragment_count = 0
    retransmitted_wire_bytes = 0
    late_events = 0
    max_lateness_ms = 0.0
    packet_pacing_waits = 0
    packet_pacing_wait_ms = 0.0
    last_packet_write_mono: float | None = None
    message_counts: Counter[int] = Counter()
    started_mono = time.monotonic()
    decoder = FieldLinkStreamDecoder()
    baseline_stats: dict[str, Any]
    final_stats: dict[str, Any]
    counter_gate: dict[str, Any]
    reliability: dict[str, Any] | None = None

    schedule_windows: list[tuple[int, list[tuple[float, int, int]]]] = []
    for event in schedule:
        window_second = int(event[0])
        if not schedule_windows or schedule_windows[-1][0] != window_second:
            schedule_windows.append((window_second, []))
        schedule_windows[-1][1].append(event)
    if args.selective_retry:
        reliability = {
            "mode": "cumulative-completed-sequence-bitmap-selective-retry",
            "scheduler": "absolute-time-producer-plus-batched-ack-worker",
            "windowCount": len(schedule_windows),
            "recoveredWindows": 0,
            "failedWindows": 0,
            "maxAckBacklog": 0,
            "ackBatchCount": 0,
            "ackNoResponseBatches": 0,
            "maxAckBatchSize": 0,
            "maxPendingFrames": 0,
            "maxPendingWindows": 0,
            "maxOldestPendingAgeMs": 0.0,
            "minBitmapHeadroom": 16,
            "ackQueryAttempts": 0,
            "retransmitRounds": 0,
            "retransmittedFrames": 0,
            "retransmittedFragments": 0,
            "retransmittedWireBytes": 0,
            "maxRecoveryLatencyMs": 0.0,
            "maxRecoveryAgeMs": args.max_recovery_age_ms,
            "maxScheduleLatenessMs": 0.0,
            "maxAllowedScheduleLatenessMs": args.max_schedule_lateness_ms,
            "retransmitRatio": 0.0,
            "maxRetransmitRatio": args.max_retransmit_ratio,
            "batches": [],
            "windows": [],
        }

    fd = os.open(args.serial_device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        configure_serial(fd, args.baud)
        settle_deadline = time.monotonic() + args.settle_ms / 1000.0
        while time.monotonic() < settle_deadline:
            readable, _, _ = select.select([fd], [], [], 0.05)
            if readable:
                try:
                    os.read(fd, 4096)
                except BlockingIOError:
                    pass
        termios.tcflush(fd, termios.TCIOFLUSH)
        baseline_stats, field_sequence = query_probe_stats(
            fd,
            decoder,
            args.target,
            field_sequence,
            args.chunk_bytes,
            args.chunk_delay_ms,
            args.stats_timeout_seconds,
            args.stats_retries,
        )
        print(
            f"STATS_BASELINE node={args.target} mode={baseline_stats['injectionMode']} "
            f"uptime={baseline_stats['snapshotUptimeS']} "
            f"queue={baseline_stats['stats']['queuePending']}",
            flush=True,
        )
        print_sensor_diagnostics("BASELINE", baseline_stats)
        started_mono = time.monotonic()
        last_progress_second = -1
        link_slot_lock = threading.Lock()
        field_sequence_lock = threading.Lock()
        rtcm_pacing_lock = threading.Lock()
        counter_lock = threading.Lock()

        def allocate_field_sequence() -> int:
            nonlocal field_sequence
            with field_sequence_lock:
                allocated = field_sequence
                field_sequence = (field_sequence + 1) & 0xFFFFFFFF
                if field_sequence == 0:
                    field_sequence = 1
                return allocated

        def send_payloads(payloads: list[bytes], retransmit: bool) -> None:
            nonlocal fragment_count, transmitted_fragment_count
            nonlocal wire_bytes, retransmitted_fragment_count, retransmitted_wire_bytes
            nonlocal last_packet_write_mono, packet_pacing_waits, packet_pacing_wait_ms
            for payload in payloads:
                with rtcm_pacing_lock:
                    if last_packet_write_mono is not None and args.min_packet_interval_ms > 0:
                        packet_deadline = (
                            last_packet_write_mono + args.min_packet_interval_ms / 1000.0
                        )
                        packet_wait_seconds = packet_deadline - time.monotonic()
                        if packet_wait_seconds > 0:
                            time.sleep(packet_wait_seconds)
                            with counter_lock:
                                packet_pacing_waits += 1
                                packet_pacing_wait_ms += packet_wait_seconds * 1000.0
                    wire_frame = encode_field_link(allocate_field_sequence(), payload)
                    # The lock covers the whole write slot. The ACK worker holds
                    # the same lock while waiting for a response, so RTCM cannot
                    # collide with the half-duplex return path.
                    with link_slot_lock:
                        write_chunked(fd, wire_frame, args.chunk_bytes, args.chunk_delay_ms)
                    last_packet_write_mono = time.monotonic()
                    with counter_lock:
                        wire_bytes += len(wire_frame)
                        transmitted_fragment_count += 1
                        if retransmit:
                            retransmitted_fragment_count += 1
                            retransmitted_wire_bytes += len(wire_frame)
                        else:
                            fragment_count += 1

        ack_jobs: Queue[dict[str, Any] | None] | None = None
        ack_thread: threading.Thread | None = None
        ack_abort = threading.Event()
        ack_errors: list[BaseException] = []

        def run_ack_worker() -> None:
            nonlocal retransmitted_frame_count
            assert ack_jobs is not None
            assert reliability is not None
            pending_frames: dict[int, dict[str, Any]] = {}
            confirmed_sequences: set[int] = set()
            failed_sequences: dict[int, str] = {}
            window_results: dict[int, dict[str, Any]] = {}
            window_started: dict[int, float] = {}

            def ingest(job: dict[str, Any]) -> None:
                window_second = job["windowSecond"]
                window_started[window_second] = job["windowStartedMonotonic"]
                result = {
                    "windowSecond": window_second,
                    "expectedTypeCounts": job["expectedTypeCounts"],
                    "frameSequences": [frame["sequence"] for frame in job["frames"]],
                    "batchIndices": [],
                    "recovered": False,
                    "failed": False,
                }
                window_results[window_second] = result
                reliability["windows"].append(result)
                for frame in job["frames"]:
                    frame["windowSecond"] = window_second
                    frame["windowStartedMonotonic"] = job["windowStartedMonotonic"]
                    frame["retransmitRounds"] = 0
                    pending_frames[frame["sequence"]] = frame

            def pending_metrics(now: float) -> dict[str, Any]:
                if not pending_frames:
                    return {
                        "pendingFrames": 0,
                        "pendingWindows": 0,
                        "oldestPendingAgeMs": 0.0,
                        "sequenceSpan": 0,
                        "bitmapHeadroom": 16,
                    }
                frames = list(pending_frames.values())
                pending_windows = {frame["windowSecond"] for frame in frames}
                oldest_age_ms = max(
                    0.0,
                    (now - min(frame["windowStartedMonotonic"] for frame in frames))
                    * 1000.0,
                )
                sequence_span = (
                    (frames[-1]["sequence"] - frames[0]["sequence"]) & 0xFFFFFFFF
                ) + 1
                bitmap_headroom = 16 - sequence_span
                reliability["maxAckBacklog"] = max(
                    reliability["maxAckBacklog"], len(pending_windows)
                )
                reliability["maxPendingWindows"] = max(
                    reliability["maxPendingWindows"], len(pending_windows)
                )
                reliability["maxPendingFrames"] = max(
                    reliability["maxPendingFrames"], len(frames)
                )
                reliability["maxOldestPendingAgeMs"] = max(
                    reliability["maxOldestPendingAgeMs"], oldest_age_ms
                )
                reliability["minBitmapHeadroom"] = min(
                    reliability["minBitmapHeadroom"], bitmap_headroom
                )
                return {
                    "pendingFrames": len(frames),
                    "pendingWindows": len(pending_windows),
                    "oldestPendingAgeMs": round(oldest_age_ms, 3),
                    "sequenceSpan": sequence_span,
                    "bitmapHeadroom": bitmap_headroom,
                }

            def resolve_windows(now: float) -> None:
                for window_second, result in window_results.items():
                    if result["recovered"] or result["failed"]:
                        continue
                    sequences = result["frameSequences"]
                    if all(sequence in confirmed_sequences for sequence in sequences):
                        latency_ms = (now - window_started[window_second]) * 1000.0
                        result["recovered"] = True
                        result["recoveryLatencyMs"] = round(latency_ms, 3)
                        reliability["recoveredWindows"] += 1
                        reliability["maxRecoveryLatencyMs"] = max(
                            reliability["maxRecoveryLatencyMs"], latency_ms
                        )
                    elif any(sequence in failed_sequences for sequence in sequences):
                        result["failed"] = True
                        result["failureReasons"] = sorted({
                            failed_sequences[sequence]
                            for sequence in sequences
                            if sequence in failed_sequences
                        })
                        result["failureLatencyMs"] = round(
                            (now - window_started[window_second]) * 1000.0, 3
                        )
                        reliability["failedWindows"] += 1

            def fail_frames(frames: list[dict[str, Any]], reason: str) -> None:
                for frame in frames:
                    sequence = frame["sequence"]
                    pending_frames.pop(sequence, None)
                    failed_sequences[sequence] = reason

            def expire_old_pending(now: float) -> None:
                expired = [
                    frame
                    for frame in pending_frames.values()
                    if (now - frame["windowStartedMonotonic"]) * 1000.0
                    > args.max_recovery_age_ms
                ]
                if expired:
                    fail_frames(expired, "recovery-age-exceeded")

            def process_ack_batch(finalizing: bool = False) -> None:
                if not pending_frames:
                    return
                batch_started = time.monotonic()
                metrics_before = pending_metrics(batch_started)
                batch_index = len(reliability["batches"])
                frames_before = list(pending_frames.values())
                affected_windows = sorted({frame["windowSecond"] for frame in frames_before})
                for window_second in affected_windows:
                    window_results[window_second]["batchIndices"].append(batch_index)
                batch: dict[str, Any] = {
                    "batchIndex": batch_index,
                    "finalizing": finalizing,
                    "windowSeconds": affected_windows,
                    "pendingSequences": [frame["sequence"] for frame in frames_before],
                    "batchSize": len(frames_before),
                    **metrics_before,
                }
                reliability["ackBatchCount"] += 1
                reliability["maxAckBatchSize"] = max(
                    reliability["maxAckBatchSize"], len(frames_before)
                )
                reliability["ackQueryAttempts"] += 1

                ack: dict[str, Any] | None = None
                try:
                    with link_slot_lock:
                        ack, _unused_sequence = query_rtcm_ack(
                            fd,
                            decoder,
                            args.target,
                            1,
                            args.chunk_bytes,
                            args.chunk_delay_ms,
                            args.ack_timeout_seconds,
                            1,
                            sequence_supplier=allocate_field_sequence,
                        )
                except TimeoutError:
                    reliability["ackNoResponseBatches"] += 1
                    batch["status"] = "no-response"

                if ack is not None:
                    if ack["injectionMode"] != 1:
                        raise RuntimeError(
                            f"node {args.target} ACK reports injection mode "
                            f"{ack['injectionMode']}"
                        )
                    if not ack["sessionValid"] or ack["sessionEpoch"] != session_epoch:
                        raise RuntimeError(
                            f"node {args.target} ACK reports a different or invalid RTCM session"
                        )
                    batch.update({
                        "status": "response",
                        "ackHighestSequence": ack["highestSequence"],
                        "ackCompletedBitmap": f"{ack['completedBitmap']:04X}",
                        "payloadDecodeErrorsBeforeMatch": ack[
                            "payloadDecodeErrorsBeforeMatch"
                        ],
                    })
                    confirmed_now: list[dict[str, Any]] = []
                    missing_now: list[dict[str, Any]] = []
                    overflow_now: list[dict[str, Any]] = []
                    for frame in list(pending_frames.values()):
                        sequence = frame["sequence"]
                        age = (ack["highestSequence"] - sequence) & 0xFFFFFFFF
                        if age < 16:
                            if ack["completedBitmap"] & (1 << age):
                                confirmed_now.append(frame)
                            else:
                                missing_now.append(frame)
                            continue
                        ahead = (sequence - ack["highestSequence"]) & 0xFFFFFFFF
                        if 0 < ahead < 0x80000000:
                            missing_now.append(frame)
                        else:
                            overflow_now.append(frame)

                    for frame in confirmed_now:
                        sequence = frame["sequence"]
                        pending_frames.pop(sequence, None)
                        confirmed_sequences.add(sequence)
                    if overflow_now:
                        fail_frames(overflow_now, "ack-bitmap-overflow")

                    retransmit_now: list[dict[str, Any]] = []
                    retry_exhausted: list[dict[str, Any]] = []
                    for frame in missing_now:
                        if frame["retransmitRounds"] >= args.max_retransmit_rounds:
                            retry_exhausted.append(frame)
                        else:
                            retransmit_now.append(frame)
                    if retry_exhausted:
                        fail_frames(retry_exhausted, "retransmit-rounds-exhausted")
                    if retransmit_now:
                        reliability["retransmitRounds"] += 1
                        for frame in retransmit_now:
                            frame["retransmitRounds"] += 1
                            send_payloads(frame["payloads"], retransmit=True)
                            with counter_lock:
                                retransmitted_frame_count += 1

                    batch["confirmedSequences"] = [
                        frame["sequence"] for frame in confirmed_now
                    ]
                    batch["missingSequences"] = [
                        frame["sequence"] for frame in missing_now
                    ]
                    batch["retransmittedSequences"] = [
                        frame["sequence"] for frame in retransmit_now
                    ]
                    batch["outOfWindowSequences"] = [
                        frame["sequence"] for frame in overflow_now
                    ]
                    batch["retryExhaustedSequences"] = [
                        frame["sequence"] for frame in retry_exhausted
                    ]

                finished = time.monotonic()
                expire_old_pending(finished)
                resolve_windows(finished)
                batch["slotDurationMs"] = round((finished - batch_started) * 1000.0, 3)
                batch["after"] = pending_metrics(finished)
                reliability["batches"].append(batch)

            finalize_requested = False
            while not finalize_requested:
                job = ack_jobs.get()
                consumed = [job]
                try:
                    if job is None:
                        finalize_requested = True
                    elif not ack_abort.is_set():
                        ingest(job)

                    while not finalize_requested:
                        try:
                            queued = ack_jobs.get_nowait()
                        except Empty:
                            break
                        consumed.append(queued)
                        if queued is None:
                            finalize_requested = True
                        elif not ack_abort.is_set():
                            ingest(queued)

                    if not ack_abort.is_set() and pending_frames:
                        process_ack_batch(finalizing=finalize_requested)
                except BaseException as exc:
                    ack_errors.append(exc)
                    ack_abort.set()
                finally:
                    for _item in consumed:
                        ack_jobs.task_done()

            if not ack_abort.is_set():
                final_slots = 0
                max_final_slots = max(args.ack_retries, args.max_retransmit_rounds + 1)
                while pending_frames and final_slots < max_final_slots:
                    process_ack_batch(finalizing=True)
                    final_slots += 1
                if pending_frames:
                    fail_frames(list(pending_frames.values()), "final-ack-unconfirmed")
                    resolve_windows(time.monotonic())

        if reliability is not None:
            ack_jobs = Queue()
            ack_thread = threading.Thread(
                target=run_ack_worker,
                name=f"gnss-ack-{args.target}",
                daemon=True,
            )
            ack_thread.start()

        try:
            for window_second, events in schedule_windows:
                if ack_errors:
                    raise RuntimeError(f"ACK worker failed: {ack_errors[0]}") from ack_errors[0]
                window_frames: list[dict[str, Any]] = []
                window_expected_counts: Counter[int] = Counter()

                for due, message_type, frame_bytes in events:
                    if ack_errors:
                        raise RuntimeError(f"ACK worker failed: {ack_errors[0]}") from ack_errors[0]
                    deadline = started_mono + due
                    remaining = deadline - time.monotonic()
                    if remaining > 0:
                        time.sleep(remaining)
                    lateness_ms = max(0.0, (time.monotonic() - deadline) * 1000.0)
                    if lateness_ms > args.late_threshold_ms:
                        late_events += 1
                    max_lateness_ms = max(max_lateness_ms, lateness_ms)

                    generated_unix_ms = int(time.time() * 1000)
                    frame = build_rtcm_frame(message_type, frame_bytes, transport_sequence)
                    payloads = fragment_rtcm_frame(
                        frame,
                        message_type,
                        session_epoch,
                        transport_sequence,
                        generated_unix_ms,
                        TARGET_MASKS[args.target],
                        args.fragment_data_bytes,
                    )
                    send_payloads(payloads, retransmit=False)
                    window_frames.append({
                        "messageType": message_type,
                        "sequence": transport_sequence,
                        "payloads": payloads,
                    })
                    window_expected_counts[message_type] += 1
                    raw_bytes += len(frame)
                    message_counts[message_type] += 1
                    transport_sequence = (transport_sequence + 1) & 0xFFFFFFFF

                    elapsed_second = int(time.monotonic() - started_mono)
                    if elapsed_second >= last_progress_second + 5:
                        last_progress_second = elapsed_second
                        with counter_lock:
                            progress_fragments = fragment_count
                            progress_transmissions = transmitted_fragment_count
                            progress_wire_bytes = wire_bytes
                        print(
                            f"PROGRESS elapsed={elapsed_second}s frames={sum(message_counts.values())} "
                            f"fragments={progress_fragments} transmissions={progress_transmissions} "
                            f"raw_bytes={raw_bytes} wire_bytes={progress_wire_bytes}",
                            flush=True,
                        )

                if reliability is not None:
                    assert ack_jobs is not None
                    ack_jobs.put({
                        "windowSecond": window_second,
                        "windowStartedMonotonic": started_mono + window_second,
                        "frames": window_frames,
                        "expectedTypeCounts": {
                            str(key): value
                            for key, value in sorted(window_expected_counts.items())
                        },
                    })
        except BaseException:
            ack_abort.set()
            raise
        finally:
            if ack_jobs is not None and ack_thread is not None:
                ack_jobs.put(None)
                ack_jobs.join()
                ack_thread.join()

        if ack_errors:
            raise RuntimeError(f"ACK worker failed: {ack_errors[0]}") from ack_errors[0]

        termios.tcdrain(fd)
        if args.drain_ms > 0:
            time.sleep(args.drain_ms / 1000.0)
        final_stats, field_sequence = query_probe_stats(
            fd,
            decoder,
            args.target,
            field_sequence,
            args.chunk_bytes,
            args.chunk_delay_ms,
            args.stats_timeout_seconds,
            args.stats_retries,
        )
        if reliability is not None:
            reliability["retransmittedFrames"] = retransmitted_frame_count
            reliability["retransmittedFragments"] = retransmitted_fragment_count
            reliability["retransmittedWireBytes"] = retransmitted_wire_bytes
            reliability["retransmitRatio"] = round(
                retransmitted_fragment_count / fragment_count if fragment_count else 0.0,
                6,
            )
            reliability["maxRecoveryLatencyMs"] = round(
                reliability["maxRecoveryLatencyMs"], 3
            )
            reliability["maxOldestPendingAgeMs"] = round(
                reliability["maxOldestPendingAgeMs"], 3
            )
            reliability["maxScheduleLatenessMs"] = round(max_lateness_ms, 3)
        counter_gate = evaluate_probe_gate(
            baseline_stats,
            final_stats,
            fragment_count,
            sum(message_counts.values()),
            raw_bytes,
            message_counts,
            args.require_stats_version,
            reliability,
        )
        print(
            f"STATS_FINAL node={args.target} mode={final_stats['injectionMode']} "
            f"accepted_delta={counter_gate['deltas']['acceptedFragments']} "
            f"complete_delta={counter_gate['deltas']['completedFrames']} "
            f"probe_delta={counter_gate['deltas']['probeValidatedFrames']} "
            f"bytes_delta={counter_gate['deltas']['probeValidatedBytes']} "
            f"gate={'PASS' if counter_gate['passed'] else 'FAIL'}",
            flush=True,
        )
        print_sensor_diagnostics("FINAL", final_stats)
    finally:
        os.close(fd)

    elapsed_seconds = time.monotonic() - started_mono
    return {
        "sessionEpoch": session_epoch,
        "target": args.target,
        "targetMask": TARGET_MASKS[args.target],
        "profile": args.profile,
        "framesSent": sum(message_counts.values()),
        "fragmentsSent": fragment_count,
        "fragmentTransmissions": transmitted_fragment_count,
        "retransmittedFrames": retransmitted_frame_count,
        "retransmittedFragments": retransmitted_fragment_count,
        "rtcmRawBytes": raw_bytes,
        "fieldLinkWireBytes": wire_bytes,
        "retransmittedWireBytes": retransmitted_wire_bytes,
        "rtcmRawBytesPerSecond": round(raw_bytes / args.duration_seconds, 2),
        "fieldLinkWireBytesPerSecond": round(wire_bytes / args.duration_seconds, 2),
        "elapsedSecondsIncludingDrain": round(elapsed_seconds, 3),
        "lateEvents": late_events,
        "lateThresholdMs": args.late_threshold_ms,
        "maxLatenessMs": round(max_lateness_ms, 3),
        "minPacketIntervalMs": args.min_packet_interval_ms,
        "packetPacingWaits": packet_pacing_waits,
        "packetPacingWaitMs": round(packet_pacing_wait_ms, 3),
        "messageTypeCounts": {str(key): value for key, value in sorted(message_counts.items())},
        "fieldLinkRxDecodeErrors": decoder.decode_errors,
        "baselineStats": baseline_stats,
        "finalStats": final_stats,
        "reliability": reliability,
        "counterGate": counter_gate,
        "nodeCounterGate": "passed" if counter_gate["passed"] else "failed",
        "hardwareGatePassed": counter_gate["passed"],
    }


def run_diagnostics_query(args: argparse.Namespace) -> dict[str, Any]:
    decoder = FieldLinkStreamDecoder()
    field_sequence = int(time.time_ns() & 0xFFFFFFFF) or 1
    fd = os.open(args.serial_device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        configure_serial(fd, args.baud)
        settle_deadline = time.monotonic() + args.settle_ms / 1000.0
        while time.monotonic() < settle_deadline:
            readable, _, _ = select.select([fd], [], [], 0.05)
            if readable:
                try:
                    os.read(fd, 4096)
                except BlockingIOError:
                    pass
        termios.tcflush(fd, termios.TCIOFLUSH)
        snapshot, _ = query_probe_stats(
            fd,
            decoder,
            args.target,
            field_sequence,
            args.chunk_bytes,
            args.chunk_delay_ms,
            args.stats_timeout_seconds,
            args.stats_retries,
        )
    finally:
        os.close(fd)

    if snapshot["responseVersion"] < args.require_stats_version:
        raise RuntimeError(
            f"diagnostic response version {snapshot['responseVersion']} is below required "
            f"version {args.require_stats_version}"
        )
    diagnostics = snapshot.get("sensorDiagnostics")
    if args.require_stats_version >= 3 and diagnostics is None:
        raise RuntimeError("G3S V3 sensor diagnostics are missing")
    print(
        f"DIAGNOSTICS node={args.target} version={snapshot['responseVersion']} "
        f"mode={snapshot['injectionMode']} uptime={snapshot['snapshotUptimeS']}",
        flush=True,
    )
    print_sensor_diagnostics("DIAGNOSTIC", snapshot)
    sensor_degraded = None
    if diagnostics is not None:
        sensor_degraded = bool(
            diagnostics["enabledMask"] & ~diagnostics["currentValidMask"]
        )
    print(
        "DIAGNOSTIC_HEALTH link_online=1 telemetry_online=unknown "
        f"sensor_degraded={str(sensor_degraded).lower() if sensor_degraded is not None else 'unknown'}",
        flush=True,
    )
    return {
        "target": args.target,
        "framesSent": 0,
        "fragmentsSent": 0,
        "diagnosticQueryPassed": True,
        "hardwareGatePassed": True,
        "linkOnline": True,
        "telemetryOnline": None,
        "sensorDegraded": sensor_degraded,
        "snapshot": snapshot,
    }


def self_test() -> None:
    frame = build_rtcm_frame(1124, 250, 7)
    assert len(frame) == 250
    assert ((frame[3] << 4) | (frame[4] >> 4)) == 1124
    assert crc24q(frame[:-3]) == int.from_bytes(frame[-3:], "big")
    fragments = fragment_rtcm_frame(frame, 1124, 1, 7, 1_785_059_400_000, 1, 160)
    assert len(fragments) == 2
    assert [len(item) for item in fragments] == [202, 132]
    wire_frames = [encode_field_link(index + 1, payload) for index, payload in enumerate(fragments)]
    assert all(item.endswith(b"\x00") for item in wire_frames)
    query = encode_probe_stats_query("B", 0x89ABCDEF)
    assert query == b"G3QB89ABCDEF"
    assert encode_rtcm_ack_query("B", 0x89ABCDEF) == b"G3AB89ABCDEF"
    ack_payload = (
        b"G3A"
        + bytes((1, 2, 1, 1, 0))
        + struct.pack(">IIIH", 0x89ABCDEF, 0x10203040, 117, 0xA55A)
        + b"\x00\x00"
    )
    decoded_ack = decode_rtcm_ack_response(ack_payload)
    assert decoded_ack["sessionValid"]
    assert decoded_ack["completedBitmap"] == 0xA55A
    assert ack_reports_completed(decoded_ack, 0x10203040, 116)
    assert not ack_reports_completed(decoded_ack, 0x10203040, 117)
    response_payload = (
        b"G3S"
        + bytes((1, 2, 1, 0, 0))
        + struct.pack(">II18IHH", 0x89ABCDEF, 1234, *range(1, 19), 19, 20)
    )
    decoded_response = decode_probe_stats_response(response_payload)
    assert decoded_response["stats"]["acceptedFragments"] == 1
    assert decoded_response["stats"]["injectionDroppedFrames"] == 18
    assert decoded_response["stats"]["queuePending"] == 20
    baseline_v2_payload = (
        b"G3S"
        + bytes((2, 2, 1, 0, 0))
        + struct.pack(">II18IHH6I8I", 1, 100, *([0] * 18), 0, 0, *([0] * 14))
    )
    final_counters = [1, 0, 0, 1, 0, 0, 0, 1, 1, 0, 0, 1, 90, 0, 0, 0, 0, 0]
    final_types = [0, 0, 1, 0, 0, 0]
    # Sequence counters cover a shared multi-sender bus. They remain diagnostic
    # because switching sender sequence spaces can look like gaps or resets.
    final_link = [10, 1, 0, 93, 4, 2, 0, 0]
    final_v2_payload = (
        b"G3S"
        + bytes((2, 2, 1, 0, 0))
        + struct.pack(
            ">II18IHH6I8I",
            2,
            101,
            *final_counters,
            1,
            0,
            *final_types,
            *final_link,
        )
    )
    baseline_v2 = decode_probe_stats_response(baseline_v2_payload)
    final_v2 = decode_probe_stats_response(final_v2_payload)
    assert baseline_v2["responseVersion"] == 2
    assert final_v2["completedTypeCounts"]["1074"] == 1
    assert final_v2["linkStats"]["decodedRtcmFrames"] == 1
    v3_payload = bytearray(204)
    v3_payload[:148] = baseline_v2_payload
    v3_payload[3] = 3
    v3_payload[148:153] = bytes((0x0F, 0x0F, 0x05, 0x0F, 4))
    struct.pack_into(">4I", v3_payload, 156, 41, 42, 43, 44)
    struct.pack_into(">4I", v3_payload, 172, 51, 52, 53, 54)
    struct.pack_into(">4I", v3_payload, 188, 61, 62, 63, 64)
    decoded_v3 = decode_probe_stats_response(bytes(v3_payload))
    assert decoded_v3["responseVersion"] == 3
    assert decoded_v3["sensorDiagnostics"]["sensors"]["um220Gnss"]["currentValid"]
    assert not decoded_v3["sensorDiagnostics"]["sensors"]["rsEcthSoil"]["currentValid"]
    assert decoded_v3["sensorDiagnostics"]["sensors"]["rsEcthEc"]["sampleCount"] == 43
    assert decoded_v3["sensorDiagnostics"]["sensors"]["rsDipTilt"]["consecutiveFailures"] == 64
    inconsistent_v3 = bytearray(v3_payload)
    inconsistent_v3[151] = 0x01
    try:
        decode_probe_stats_response(bytes(inconsistent_v3))
        raise AssertionError("inconsistent sensor masks were accepted")
    except ValueError as exc:
        assert "masks are inconsistent" in str(exc)
    v2_gate = evaluate_probe_gate(
        baseline_v2,
        final_v2,
        1,
        1,
        90,
        Counter({1074: 1}),
        2,
    )
    assert v2_gate["passed"]
    assert v2_gate["linkDeltas"]["sequenceGaps"] == 93
    assert v2_gate["linkDeltas"]["sequenceDuplicates"] == 4
    assert v2_gate["linkDeltas"]["sequenceResets"] == 2
    reliable_counters = final_counters.copy()
    reliable_counters[1] = 1
    reliable_link = [10, 2, 3, 93, 4, 2, 0, 0]
    reliable_v2_payload = (
        b"G3S"
        + bytes((2, 2, 1, 0, 0))
        + struct.pack(
            ">II18IHH6I8I",
            2,
            101,
            *reliable_counters,
            1,
            0,
            *final_types,
            *reliable_link,
        )
    )
    reliable_gate = evaluate_probe_gate(
        baseline_v2,
        decode_probe_stats_response(reliable_v2_payload),
        1,
        1,
        90,
        Counter({1074: 1}),
        2,
        {
            "windowCount": 1,
            "recoveredWindows": 1,
            "failedWindows": 0,
            "maxRecoveryLatencyMs": 900.0,
            "maxRecoveryAgeMs": 3000.0,
            "maxOldestPendingAgeMs": 800.0,
            "maxPendingFrames": 1,
            "minBitmapHeadroom": 15,
            "retransmitRatio": 1.0,
            "maxRetransmitRatio": 1.0,
            "maxScheduleLatenessMs": 100.0,
            "maxAllowedScheduleLatenessMs": 500.0,
        },
    )
    assert reliable_gate["passed"]
    assert reliable_gate["deltas"]["duplicateFragments"] == 1
    assert reliable_gate["linkDeltas"]["decodeErrors"] == 3
    response_wire = encode_field_link(99, response_payload, FIELD_LINK_TYPE_CONTROL)
    stream_decoder = FieldLinkStreamDecoder()
    decoded_frames = stream_decoder.feed(response_wire[:11])
    decoded_frames.extend(stream_decoder.feed(response_wire[11:]))
    assert decoded_frames == [(FIELD_LINK_TYPE_CONTROL, 99, response_payload)]
    assert stream_decoder.decode_errors == 0
    assert uint32_delta(3, 0xFFFFFFFE) == 5
    ten_second_schedule = build_measured_mix_schedule(10.0)
    assert len(ten_second_schedule) == 62
    assert sum(item[2] for item in ten_second_schedule) == 8800
    assert Counter(item[1] for item in ten_second_schedule) == Counter(
        {1124: 20, 1074: 10, 1084: 10, 1094: 10, 1114: 10, 1005: 1, 1033: 1}
    )
    packet_rate_schedule = build_packet_rate_schedule(2.0, 2.5, 90, 1124)
    assert packet_rate_schedule == [
        (0.0, 1124, 90),
        (0.4, 1124, 90),
        (0.8, 1124, 90),
        (1.2, 1124, 90),
        (1.6, 1124, 90),
    ]
    um220_schedule = build_um220_shaped_schedule(10.0)
    assert len(um220_schedule) == 42
    assert sum(item[2] for item in um220_schedule) == 5400
    assert Counter(item[1] for item in um220_schedule) == Counter(
        {1124: 10, 1074: 10, 1094: 10, 1114: 10, 1005: 1, 1033: 1}
    )
    um220_half_qzss_schedule = build_um220_shaped_schedule(10.0, qzss_rate_hz=0.5)
    assert len(um220_half_qzss_schedule) == 37
    assert sum(item[2] for item in um220_half_qzss_schedule) == 4950
    assert Counter(item[1] for item in um220_half_qzss_schedule) == Counter(
        {1124: 10, 1074: 10, 1094: 10, 1114: 5, 1005: 1, 1033: 1}
    )
    um220_essential_schedule = build_um220_shaped_schedule(10.0, include_qzss=False)
    assert len(um220_essential_schedule) == 32
    assert sum(item[2] for item in um220_essential_schedule) == 4500
    assert Counter(item[1] for item in um220_essential_schedule) == Counter(
        {1124: 10, 1074: 10, 1094: 10, 1005: 1, 1033: 1}
    )
    print("xls1 GNSS V3.1 PROBE sender self-test passed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send credential-free synthetic RTCM to RK2206 PROBE firmware."
    )
    parser.add_argument("--serial-device", default="/dev/ttyS3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--target", choices=tuple(NODE_NUMBERS), default="A")
    parser.add_argument("--duration-seconds", type=float, default=12.0)
    parser.add_argument("--diagnostics-only", action="store_true")
    parser.add_argument(
        "--profile",
        choices=("measured-mix", "packet-rate", "um220-shaped"),
        default="measured-mix",
    )
    parser.add_argument("--packet-rate-hz", type=float, default=2.0)
    parser.add_argument("--packet-frame-bytes", type=int, default=90)
    parser.add_argument("--packet-message-type", type=int, default=1124)
    parser.add_argument(
        "--um220-include-qzss", action=argparse.BooleanOptionalAction, default=True
    )
    parser.add_argument(
        "--um220-qzss-rate-hz", type=float, choices=(0.0, 0.5, 1.0), default=1.0
    )
    parser.add_argument("--fragment-data-bytes", type=int, default=160)
    parser.add_argument("--chunk-bytes", type=int, default=128)
    parser.add_argument("--chunk-delay-ms", type=int, default=0)
    parser.add_argument("--min-packet-interval-ms", type=int)
    parser.add_argument("--settle-ms", type=int, default=1000)
    parser.add_argument("--drain-ms", type=int, default=2000)
    parser.add_argument("--stats-timeout-seconds", type=float, default=3.0)
    parser.add_argument("--stats-retries", type=int, default=3)
    parser.add_argument("--require-stats-version", type=int, choices=(1, 2, 3), default=1)
    parser.add_argument("--selective-retry", action="store_true")
    parser.add_argument("--max-retransmit-rounds", type=int, default=2)
    parser.add_argument("--ack-timeout-seconds", type=float, default=0.65)
    parser.add_argument("--ack-retries", type=int, default=3)
    parser.add_argument("--max-recovery-age-ms", type=float, default=3000.0)
    parser.add_argument("--max-retransmit-ratio", type=float, default=0.25)
    parser.add_argument("--max-schedule-lateness-ms", type=float, default=500.0)
    parser.add_argument("--late-threshold-ms", type=float, default=50.0)
    parser.add_argument("--service", default="lsmv2-field-gateway.service")
    parser.add_argument(
        "--runtime-mask-service", action=argparse.BooleanOptionalAction, default=True
    )
    parser.add_argument("--report-path", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.min_packet_interval_ms is None:
        args.min_packet_interval_ms = 160 if args.profile == "um220-shaped" else 0
    if (
        args.duration_seconds <= 0
        or args.baud <= 0
        or args.stats_timeout_seconds <= 0
        or args.packet_rate_hz <= 0
    ):
        parser.error("duration, baud and stats timeout must be positive")
    if args.stats_retries <= 0 or args.ack_retries <= 0:
        parser.error("stats and ACK retries must be positive")
    if args.max_retransmit_rounds < 0:
        parser.error("max retransmit rounds must be non-negative")
    if args.max_recovery_age_ms <= 0 or args.ack_timeout_seconds <= 0:
        parser.error("max recovery age and ACK timeout must be positive")
    if args.max_schedule_lateness_ms < 0:
        parser.error("max schedule lateness must be non-negative")
    if not 0.0 <= args.max_retransmit_ratio <= 1.0:
        parser.error("max retransmit ratio must be in [0, 1]")
    if args.selective_retry and args.require_stats_version < 2:
        parser.error("selective retry requires --require-stats-version 2 or 3")
    if args.diagnostics_only and args.selective_retry:
        parser.error("diagnostics-only mode cannot use selective retry")
    if not 32 <= args.fragment_data_bytes <= 512:
        parser.error("fragment data bytes must be in [32, 512]")
    if not 8 <= args.packet_frame_bytes <= 512:
        parser.error("packet frame bytes must be in [8, 512]")
    if not 1 <= args.packet_message_type <= 4095:
        parser.error("packet message type must be in [1, 4095]")
    if args.profile == "packet-rate" and args.packet_frame_bytes > args.fragment_data_bytes:
        parser.error(
            "packet-rate profile requires packet frame bytes <= fragment data bytes"
        )
    if (
        args.chunk_bytes <= 0
        or args.chunk_delay_ms < 0
        or args.min_packet_interval_ms < 0
        or args.settle_ms < 0
        or args.drain_ms < 0
    ):
        parser.error("chunk size must be positive and delays must be non-negative")
    return args


def main() -> int:
    args = parse_args()
    if args.self_test:
        self_test()
        return 0

    report_path = Path(args.report_path) if args.report_path else Path(
        f"/var/lib/lsmv2/experiments/xls1-gnss-v31-probe-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    )
    service_was_active = service_is_active(args.service)
    service_was_masked = False
    recovery: dict[str, Any] = {
        "serviceWasActive": service_was_active,
        "serviceRuntimeMasked": False,
        "serviceRestored": not service_was_active,
    }
    report: dict[str, Any] = {
        "schemaVersion": 3,
        "experiment": (
            "xls1-rk2206-sensor-diagnostics"
            if args.diagnostics_only
            else "xls1-gnss-v31-probe-closed-loop"
        ),
        "startedAt": utc_now(),
        "source": {
            "mode": "credential-free-synthetic-from-measured-summary",
            "measuredCaptureDurationSeconds": 584.7,
            "measuredRtcmBytes": 515609,
            "measuredRtcmBytesPerSecond": 881.84,
            "containsSiteCoordinates": False,
            "containsNtripCredentials": False,
        },
        "configuration": {
            "serialDevice": args.serial_device,
            "baud": args.baud,
            "target": args.target,
            "diagnosticsOnly": args.diagnostics_only,
            "durationSeconds": args.duration_seconds,
            "profile": args.profile,
            "packetRateHz": args.packet_rate_hz if args.profile == "packet-rate" else None,
            "packetFrameBytes": (
                args.packet_frame_bytes if args.profile == "packet-rate" else None
            ),
            "packetMessageType": (
                args.packet_message_type if args.profile == "packet-rate" else None
            ),
            "um220IncludeQzss": (
                args.um220_include_qzss if args.profile == "um220-shaped" else None
            ),
            "um220QzssRateHz": (
                args.um220_qzss_rate_hz if args.profile == "um220-shaped" else None
            ),
            "fragmentDataBytes": args.fragment_data_bytes,
            "chunkBytes": args.chunk_bytes,
            "chunkDelayMs": args.chunk_delay_ms,
            "minPacketIntervalMs": args.min_packet_interval_ms,
            "settleMs": args.settle_ms,
            "drainMs": args.drain_ms,
            "statsTimeoutSeconds": args.stats_timeout_seconds,
            "statsRetries": args.stats_retries,
            "requiredStatsVersion": args.require_stats_version,
            "selectiveRetry": args.selective_retry,
            "maxRetransmitRounds": args.max_retransmit_rounds,
            "ackTimeoutSeconds": args.ack_timeout_seconds,
            "ackRetries": args.ack_retries,
            "maxRecoveryAgeMs": args.max_recovery_age_ms,
            "maxRetransmitRatio": args.max_retransmit_ratio,
            "maxScheduleLatenessMs": args.max_schedule_lateness_ms,
        },
    }

    def interrupt_handler(signum: int, _frame: Any) -> None:
        raise InterruptedError(f"received signal {signum}")

    signal.signal(signal.SIGINT, interrupt_handler)
    signal.signal(signal.SIGTERM, interrupt_handler)

    try:
        if service_was_active:
            if os.geteuid() != 0:
                raise PermissionError("run as root so the gateway service can be restored reliably")
            if args.runtime_mask_service:
                subprocess.run(
                    ["systemctl", "mask", "--runtime", "--now", args.service], check=True
                )
                service_was_masked = True
                recovery["serviceRuntimeMasked"] = True
            else:
                subprocess.run(["systemctl", "stop", args.service], check=True)
        report["result"] = (
            run_diagnostics_query(args) if args.diagnostics_only else run_probe(args)
        )
    except Exception as exc:
        report["fatalError"] = str(exc)
    finally:
        restore_errors: list[str] = []
        if service_was_active:
            if service_was_masked:
                try:
                    subprocess.run(["systemctl", "unmask", "--runtime", args.service], check=True)
                except Exception as exc:
                    restore_errors.append(f"runtime unmask failed: {exc}")
            try:
                subprocess.run(["systemctl", "start", args.service], check=True)
                deadline = time.monotonic() + 20.0
                while time.monotonic() < deadline and not service_is_active(args.service):
                    time.sleep(0.5)
                recovery["serviceRestored"] = service_is_active(args.service)
            except Exception as exc:
                restore_errors.append(f"service start failed: {exc}")
        if restore_errors:
            recovery["serviceRestoreError"] = "; ".join(restore_errors)

    report["finishedAt"] = utc_now()
    report["recovery"] = recovery
    report_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = report_path.with_suffix(report_path.suffix + ".tmp")
    temporary_path.write_text(
        json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="utf-8"
    )
    os.replace(temporary_path, report_path)
    result = report.get("result", {})
    summary = {
        "reportPath": str(report_path),
        "target": result.get("target"),
        "framesSent": result.get("framesSent"),
        "fragmentsSent": result.get("fragmentsSent"),
        "hardwareGatePassed": result.get("hardwareGatePassed", False),
        "diagnosticQueryPassed": result.get("diagnosticQueryPassed"),
        "linkOnline": result.get("linkOnline"),
        "telemetryOnline": result.get("telemetryOnline"),
        "sensorDegraded": result.get("sensorDegraded"),
        "failedChecks": result.get("counterGate", {}).get("failedChecks", []),
        **recovery,
    }
    if "fatalError" in report:
        summary["fatalError"] = report["fatalError"]
    print(json.dumps(summary, separators=(",", ":")), flush=True)
    return 0 if (
        "fatalError" not in report
        and result.get("hardwareGatePassed") is True
        and recovery.get("serviceRestored")
    ) else 1


if __name__ == "__main__":
    raise SystemExit(main())
