#!/usr/bin/env python3
"""Measure three-node XLS1 batch polling without changing field-node firmware."""

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
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import termios
except ImportError:
    termios = None


FIELD_LINK_VERSION = 1
FIELD_LINK_TYPE_TELEMETRY = 1
FIELD_LINK_TYPE_COMMAND = 2
FIELD_LINK_TYPE_ACK = 3
COMPACT_PAYLOAD_BYTES = 46
COMPACT_VALID_TEMP = 1 << 0
COMPACT_VALID_SOIL = 1 << 1
COMPACT_VALID_SOIL_EC = 1 << 2
COMPACT_VALID_TILT = 1 << 3
COMPACT_VALID_GPS = 1 << 4
COMPACT_VALID_RAIN = 1 << 5
COMPACT_VALID_IMU = 1 << 6
COMPACT_VALID_BATTERY = 1 << 7
COMPACT_STATUS_WARNING = 1 << 0
COMPACT_STATUS_FIELD_SENSORS_SIMULATED = 1 << 1
NODES = {
    "A": "00000000-0000-0000-0000-000000000001",
    "B": "00000000-0000-0000-0000-000000000002",
    "C": "00000000-0000-0000-0000-000000000003",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(len(ordered) * fraction) - 1))
    return round(ordered[index], 1)


def command_tag(command_id: str) -> int:
    value = 2166136261
    for byte in command_id.encode("ascii"):
        value ^= byte
        value = (value * 16777619) & 0xFFFFFFFF
    return value


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
            raise ValueError("cobs zero marker inside encoded frame")
        index += 1
        end = index + code - 1
        if end > len(payload):
            raise ValueError("cobs code exceeded input length")
        output.extend(payload[index:end])
        index = end
        if code < 0xFF and index < len(payload):
            output.append(0)
    return bytes(output)


def encode_frame(frame_type: int, sequence: int, payload: bytes) -> bytes:
    header = struct.pack(">BBBBII", FIELD_LINK_VERSION, frame_type, 0, 0, sequence & 0xFFFFFFFF, len(payload))
    packet = header + payload
    crc = binascii.crc32(packet) & 0xFFFFFFFF
    return cobs_encode(packet + struct.pack(">I", crc)) + b"\x00"


def decode_frame(encoded: bytes) -> tuple[int, int, bytes]:
    decoded = cobs_decode(encoded)
    if len(decoded) < 16:
        raise ValueError("field-link frame too short")
    version, frame_type, _, _, sequence, payload_length = struct.unpack(">BBBBII", decoded[:12])
    if version != FIELD_LINK_VERSION:
        raise ValueError(f"unsupported field-link version: {version}")
    payload = decoded[12:-4]
    if len(payload) != payload_length:
        raise ValueError(f"field-link payload length mismatch: header={payload_length} actual={len(payload)}")
    expected_crc = struct.unpack(">I", decoded[-4:])[0]
    actual_crc = binascii.crc32(decoded[:-4]) & 0xFFFFFFFF
    if expected_crc != actual_crc:
        raise ValueError(f"field-link crc mismatch: expected=0x{expected_crc:08x} actual=0x{actual_crc:08x}")
    return frame_type, sequence, payload


def configure_serial(fd: int, baud: int) -> None:
    if termios is None:
        raise RuntimeError("serial experiment requires Linux termios support")
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
        chunk = payload[offset : offset + chunk_bytes] if chunk_bytes > 0 else payload[offset:]
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


def service_is_active(service_name: str) -> bool:
    return subprocess.run(
        ["systemctl", "is-active", "--quiet", service_name],
        check=False,
    ).returncode == 0


def set_service_state(service_name: str, action: str) -> None:
    subprocess.run(["systemctl", action, service_name], check=True)


def build_command(node_id: str, command_id: str) -> bytes:
    issued_ts = utc_now()
    command = {
        "schema_version": 1,
        "command_id": command_id,
        "device_id": node_id,
        "command_type": "poll_latest_telemetry",
        "payload": {},
        "issued_ts": issued_ts,
    }
    return json.dumps(command, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def decode_compact_telemetry(payload: bytes) -> dict[str, Any]:
    if len(payload) != COMPACT_PAYLOAD_BYTES:
        raise ValueError(f"compact telemetry length mismatch: expected={COMPACT_PAYLOAD_BYTES} actual={len(payload)}")
    if payload[:2] != b"LS" or payload[2] not in (1, 2):
        raise ValueError("compact telemetry magic or version mismatch")

    compact_version = payload[2]
    compact_node = payload[3]
    if compact_node not in (1, 2, 3):
        raise ValueError(f"compact telemetry node out of range: {compact_node}")
    label = chr(ord("A") + compact_node - 1)
    valid = struct.unpack(">H", payload[6:8])[0]
    sequence = struct.unpack(">I", payload[8:12])[0]
    uptime = struct.unpack(">I", payload[12:16])[0]
    last_command_tag = struct.unpack(">I", payload[16:20])[0]
    metrics: dict[str, Any] = {}

    if compact_version == 1 and valid & COMPACT_VALID_TEMP:
        metrics["temperature_c"] = struct.unpack(">h", payload[20:22])[0] / 100.0
        metrics["humidity_pct"] = struct.unpack(">H", payload[22:24])[0] / 100.0
    if compact_version == 2 and valid & COMPACT_VALID_BATTERY:
        metrics["battery_v"] = struct.unpack(">H", payload[20:22])[0] / 1000.0
        metrics["battery_pct"] = payload[22]
    if valid & COMPACT_VALID_SOIL:
        metrics["soil_temperature_c"] = struct.unpack(">h", payload[24:26])[0] / 100.0
        metrics["soil_moisture_pct"] = struct.unpack(">H", payload[26:28])[0] / 100.0
    if valid & COMPACT_VALID_SOIL_EC:
        metrics["electrical_conductivity_us_cm"] = struct.unpack(">H", payload[28:30])[0]
    if valid & COMPACT_VALID_TILT:
        metrics["tilt_x_deg"] = struct.unpack(">h", payload[30:32])[0] / 100.0
        metrics["tilt_y_deg"] = struct.unpack(">h", payload[32:34])[0] / 100.0
        metrics["tilt_z_deg"] = struct.unpack(">h", payload[34:36])[0] / 100.0
        metrics["warning_flag"] = bool(payload[4] & COMPACT_STATUS_WARNING)
    if valid & COMPACT_VALID_GPS:
        metrics["gps_latitude"] = struct.unpack(">i", payload[36:40])[0] / 1_000_000.0
        metrics["gps_longitude"] = struct.unpack(">i", payload[40:44])[0] / 1_000_000.0
    if valid & COMPACT_VALID_RAIN:
        metrics["rain_total_mm"] = struct.unpack(">H", payload[44:46])[0] / 10.0

    trigger = {
        1: "periodic",
        2: "manual_collect",
        3: "scheduler_poll",
    }.get(payload[5], "unknown")
    battery_quality_code = payload[23] if compact_version == 2 else 0
    battery_quality = {
        0: "unavailable",
        1: "default-calibration",
        2: "field-calibrated",
    }.get(battery_quality_code, "unknown")
    field_sensor_source = (
        "simulated"
        if compact_version == 2 and payload[4] & COMPACT_STATUS_FIELD_SENSORS_SIMULATED
        else "hardware" if compact_version == 2 else "unknown"
    )
    return {
        "schema_version": 1,
        "device_id": NODES[label],
        "event_ts": None,
        "seq": sequence,
        "metrics": metrics,
        "meta": {
            "install_label": f"FIELD-NODE-{label}",
            "legacy_node": label,
            "uptime_s": uptime,
            "last_command_tag": last_command_tag,
            "upload_trigger": trigger,
            "compact_payload_version": compact_version,
            "field_sensor_source": field_sensor_source,
            "battery_estimate_quality": battery_quality,
            "battery_estimate_quality_code": battery_quality_code,
            "legacy_valid_flags": {
                "temp_ok": int(compact_version == 1 and bool(valid & COMPACT_VALID_TEMP)),
                "imu_ok": int(bool(valid & COMPACT_VALID_IMU)),
                "gps_ok": int(bool(valid & COMPACT_VALID_GPS)),
                "soil_ok": int(bool(valid & COMPACT_VALID_SOIL)),
                "soil_ec_ok": int(bool(valid & COMPACT_VALID_SOIL_EC)),
                "tilt_ok": int(bool(valid & COMPACT_VALID_TILT)),
                "rain_ok": int(bool(valid & COMPACT_VALID_RAIN)),
                "battery_ok": int(bool(valid & COMPACT_VALID_BATTERY)),
            },
        },
    }


def telemetry_profile_errors(
    telemetry: dict[str, Any],
    required_compact_version: int = 0,
    required_field_sensor_source: str = "any",
    require_battery_valid: bool = False,
    require_field_sensors_valid: bool = False,
) -> list[str]:
    errors: list[str] = []
    meta = telemetry.get("meta")
    metrics = telemetry.get("metrics")
    if not isinstance(meta, dict) or not isinstance(metrics, dict):
        return ["telemetry-meta-or-metrics-missing"]

    compact_version = meta.get("compact_payload_version")
    if required_compact_version and compact_version != required_compact_version:
        errors.append(f"compact-version-{compact_version}-expected-{required_compact_version}")

    field_sensor_source = meta.get("field_sensor_source", "unknown")
    if required_field_sensor_source != "any" and field_sensor_source != required_field_sensor_source:
        errors.append(f"field-source-{field_sensor_source}-expected-{required_field_sensor_source}")

    valid_flags = meta.get("legacy_valid_flags")
    if not isinstance(valid_flags, dict):
        errors.append("valid-flags-missing")
        return errors

    if require_field_sensors_valid:
        for key in ("soil_ok", "soil_ec_ok", "tilt_ok"):
            if valid_flags.get(key) != 1:
                errors.append(f"{key}-not-valid")

    if require_battery_valid:
        battery_v = metrics.get("battery_v")
        battery_pct = metrics.get("battery_pct")
        if valid_flags.get("battery_ok") != 1:
            errors.append("battery-not-valid")
        elif not isinstance(battery_v, (int, float)) or not 8.0 <= float(battery_v) <= 13.5:
            errors.append("battery-voltage-out-of-range")
        elif not isinstance(battery_pct, (int, float)) or not 0 <= float(battery_pct) <= 100:
            errors.append("battery-percent-out-of-range")
    return errors


def node_label(device_id: str) -> str | None:
    for label, configured_id in NODES.items():
        if device_id == configured_id:
            return label
    return None


def evaluate_stability_gate(
    *,
    matched_rate: float,
    required_match_rate: float,
    decode_error_count: int,
    unmatched_telemetry: int,
    duplicate_telemetry: int,
    profile_violation_count: int,
    trailing_undelimited_bytes: int,
    node_results: dict[str, Any],
    max_p95_interval_ms: float,
    max_command_latency_ms: float,
) -> bool:
    if set(node_results) != set(NODES):
        return False
    return (
        matched_rate >= required_match_rate
        and decode_error_count == 0
        and unmatched_telemetry == 0
        and duplicate_telemetry == 0
        and profile_violation_count == 0
        and trailing_undelimited_bytes == 0
        and all(
            result["expected"] > 0
            and result["matched"] > 0
            and result["sequence"]["nonUnitGaps"] == 0
            and result["arrivalIntervalMs"]["p95"] is not None
            and result["arrivalIntervalMs"]["p95"] <= max_p95_interval_ms
            and result["commandToTelemetryLatencyMs"]["max"] is not None
            and result["commandToTelemetryLatencyMs"]["max"] <= max_command_latency_ms
            for result in node_results.values()
        )
    )


def run_experiment(args: argparse.Namespace) -> dict[str, Any]:
    started_at = utc_now()
    started_mono = time.monotonic()
    send_records: dict[str, dict[str, Any]] = {}
    send_records_by_tag: dict[tuple[int, str], dict[str, Any]] = {}
    received_command_ids: set[str] = set()
    arrivals_by_node: dict[str, list[float]] = defaultdict(list)
    latencies_by_node: dict[str, list[float]] = defaultdict(list)
    seq_by_node: dict[str, list[int]] = defaultdict(list)
    compact_versions_by_node: dict[str, Counter[int]] = defaultdict(Counter)
    field_sources_by_node: dict[str, Counter[str]] = defaultdict(Counter)
    profile_violations_by_node: dict[str, Counter[str]] = defaultdict(Counter)
    battery_voltages_by_node: dict[str, list[float]] = defaultdict(list)
    last_telemetry_by_node: dict[str, dict[str, Any]] = {}
    errors: Counter[str] = Counter()
    error_samples: list[dict[str, Any]] = []
    unmatched_samples: list[dict[str, Any]] = []
    duplicate_samples: list[dict[str, Any]] = []
    ack_samples: list[dict[str, Any]] = []
    valid_frame_types: Counter[str] = Counter()
    unmatched_telemetry = 0
    duplicate_telemetry = 0
    serial_sequence = 0
    batches_sent = 0
    bytes_read = 0
    bytes_written = 0
    receive_buffer = bytearray()
    settle_elapsed_ms = 0.0
    warmup_elapsed_ms = 0.0
    warmup_batches_sent = 0
    warmup_bytes_written = 0

    def receive_once(fd: int, timeout: float) -> None:
        nonlocal bytes_read, unmatched_telemetry, duplicate_telemetry

        readable, _, _ = select.select([fd], [], [], max(0.0, timeout))
        if not readable:
            return
        try:
            chunk = os.read(fd, 4096)
        except BlockingIOError:
            return
        if not chunk:
            return
        bytes_read += len(chunk)
        receive_buffer.extend(chunk)

        while True:
            try:
                delimiter = receive_buffer.index(0)
            except ValueError:
                break
            encoded = bytes(receive_buffer[:delimiter])
            del receive_buffer[: delimiter + 1]
            if not encoded:
                continue
            received_mono = time.monotonic()
            try:
                frame_type, _, payload = decode_frame(encoded)
            except Exception as exc:
                reason = str(exc)
                errors[reason] += 1
                if len(error_samples) < 20:
                    error_samples.append(
                        {
                            "at": utc_now(),
                            "reason": reason,
                            "frameBytes": len(encoded) + 1,
                            "hexPrefix": encoded[:64].hex(" "),
                        }
                    )
                continue

            valid_frame_types[str(frame_type)] += 1
            if frame_type == FIELD_LINK_TYPE_ACK:
                try:
                    ack = json.loads(payload.decode("utf-8"))
                    if len(ack_samples) < 100:
                        ack_samples.append({"at": utc_now(), "payload": ack})
                except Exception as exc:
                    errors[f"ack payload decode failed: {exc}"] += 1
                continue
            if frame_type != FIELD_LINK_TYPE_TELEMETRY:
                continue
            try:
                if len(payload) == COMPACT_PAYLOAD_BYTES and payload[:2] == b"LS" and payload[2] in (1, 2):
                    telemetry = decode_compact_telemetry(payload)
                else:
                    telemetry = json.loads(payload.decode("utf-8"))
            except Exception as exc:
                reason = f"telemetry payload decode failed: {exc}"
                errors[reason] += 1
                if len(error_samples) < 20:
                    error_samples.append({"at": utc_now(), "reason": reason, "frameBytes": len(encoded) + 1})
                continue

            device_id = telemetry.get("device_id")
            label = node_label(device_id) if isinstance(device_id, str) else None
            if label is None:
                errors["telemetry from unknown device"] += 1
                continue
            meta = telemetry.get("meta")
            metrics = telemetry.get("metrics")
            if isinstance(meta, dict):
                compact_version = meta.get("compact_payload_version")
                field_source = meta.get("field_sensor_source", "unknown")
                if isinstance(compact_version, int):
                    compact_versions_by_node[label][compact_version] += 1
                if isinstance(field_source, str):
                    field_sources_by_node[label][field_source] += 1
            for profile_error in telemetry_profile_errors(
                telemetry,
                required_compact_version=args.required_compact_version,
                required_field_sensor_source=args.required_field_sensor_source,
                require_battery_valid=args.require_battery_valid,
                require_field_sensors_valid=args.require_field_sensors_valid,
            ):
                profile_violations_by_node[label][profile_error] += 1
            if isinstance(metrics, dict) and isinstance(metrics.get("battery_v"), (int, float)):
                battery_voltages_by_node[label].append(float(metrics["battery_v"]))
            last_telemetry_by_node[label] = telemetry
            arrivals_by_node[label].append(received_mono)
            seq = telemetry.get("seq")
            if isinstance(seq, int):
                seq_by_node[label].append(seq)
            command_id = meta.get("last_command_id") if isinstance(meta, dict) else None
            last_command_tag = meta.get("last_command_tag") if isinstance(meta, dict) else None
            if isinstance(command_id, str):
                send_record = send_records.get(command_id)
            elif isinstance(last_command_tag, int):
                send_record = send_records_by_tag.get((last_command_tag, label))
                command_id = send_record["commandId"] if send_record else None
            else:
                send_record = None
            if not send_record or send_record["node"] != label:
                unmatched_telemetry += 1
                if len(unmatched_samples) < 50:
                    unmatched_samples.append(
                        {
                            "at": utc_now(),
                            "elapsedMs": round((received_mono - started_mono) * 1000.0, 1),
                            "node": label,
                            "sequence": seq,
                            "commandTag": last_command_tag,
                        }
                    )
                continue
            if command_id in received_command_ids:
                duplicate_telemetry += 1
                if len(duplicate_samples) < 50:
                    duplicate_samples.append(
                        {
                            "at": utc_now(),
                            "elapsedMs": round((received_mono - started_mono) * 1000.0, 1),
                            "node": label,
                            "sequence": seq,
                            "commandTag": last_command_tag,
                            "batch": send_record["batch"],
                        }
                    )
                continue
            received_command_ids.add(command_id)
            latency_ms = (received_mono - float(send_record["sentMono"])) * 1000.0
            latencies_by_node[label].append(latency_ms)

        if len(receive_buffer) > 65536:
            errors["field-link assembler buffer overflow"] += 1
            receive_buffer.clear()

    fd = os.open(args.serial_device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        configure_serial(fd, args.baud)
        settle_started = time.monotonic()
        settle_deadline = settle_started + args.settle_ms / 1000.0
        settle_quiet_since = settle_started
        while time.monotonic() < settle_deadline:
            readable, _, _ = select.select([fd], [], [], 0.1)
            if readable:
                try:
                    chunk = os.read(fd, 4096)
                    if chunk:
                        settle_quiet_since = time.monotonic()
                except BlockingIOError:
                    pass
            if args.settle_quiet_ms > 0 and (
                time.monotonic() - settle_quiet_since >= args.settle_quiet_ms / 1000.0
            ):
                break
        settle_elapsed_ms = round((time.monotonic() - settle_started) * 1000.0, 1)
        termios.tcflush(fd, termios.TCIOFLUSH)

        if args.warmup_seconds > 0:
            if not args.broadcast_poll:
                raise ValueError("--warmup-seconds currently requires --broadcast-poll")
            warmup_started = time.monotonic()
            warmup_send_deadline = warmup_started + args.warmup_seconds
            next_warmup_batch_at = warmup_started
            while True:
                now = time.monotonic()
                if now >= next_warmup_batch_at and next_warmup_batch_at < warmup_send_deadline:
                    poll_command = f"P1{uuid.uuid4().hex[:8].upper()}"
                    frame = encode_frame(FIELD_LINK_TYPE_COMMAND, serial_sequence, poll_command.encode("ascii"))
                    serial_sequence = (serial_sequence + 1) & 0xFFFFFFFF
                    write_chunked(fd, frame, args.command_chunk_bytes, args.command_chunk_delay_ms)
                    warmup_batches_sent += 1
                    warmup_bytes_written += len(frame)
                    next_warmup_batch_at = (
                        warmup_started + warmup_batches_sent * args.batch_interval_ms / 1000.0
                    )
                    now = time.monotonic()

                if now >= warmup_send_deadline:
                    break
                readable, _, _ = select.select(
                    [fd], [], [], max(0.0, min(0.1, next_warmup_batch_at - now))
                )
                if readable:
                    try:
                        os.read(fd, 4096)
                    except BlockingIOError:
                        pass

            warmup_drain_deadline = time.monotonic() + 1.2
            while time.monotonic() < warmup_drain_deadline:
                readable, _, _ = select.select([fd], [], [], 0.1)
                if readable:
                    try:
                        os.read(fd, 4096)
                    except BlockingIOError:
                        pass
            warmup_elapsed_ms = round((time.monotonic() - warmup_started) * 1000.0, 1)
            termios.tcflush(fd, termios.TCIOFLUSH)

        first_batch_at = time.monotonic() + 0.25
        send_deadline = first_batch_at + args.duration_seconds
        next_batch_at = first_batch_at
        drain_deadline: float | None = None

        while True:
            now = time.monotonic()
            if now >= next_batch_at and next_batch_at < send_deadline:
                order = list(NODES.items())
                rotation = batches_sent % len(order)
                order = order[rotation:] + order[:rotation]
                batch_number = batches_sent + 1
                if args.broadcast_poll:
                    poll_command = f"P1{uuid.uuid4().hex[:8].upper()}"
                    tag = command_tag(poll_command)
                    while any((tag, label) in send_records_by_tag for label in NODES):
                        poll_command = f"P1{uuid.uuid4().hex[:8].upper()}"
                        tag = command_tag(poll_command)
                    frame = encode_frame(FIELD_LINK_TYPE_COMMAND, serial_sequence, poll_command.encode("ascii"))
                    serial_sequence = (serial_sequence + 1) & 0xFFFFFFFF
                    sent_mono = time.monotonic()
                    for position, label in enumerate(NODES):
                        record_id = f"{poll_command}:{label}"
                        send_record = {
                            "commandId": record_id,
                            "pollCommand": poll_command,
                            "commandTag": tag,
                            "node": label,
                            "batch": batch_number,
                            "position": position,
                            "sentAt": utc_now(),
                            "sentMono": sent_mono,
                        }
                        send_records[record_id] = send_record
                        send_records_by_tag[(tag, label)] = send_record
                    write_chunked(fd, frame, args.command_chunk_bytes, args.command_chunk_delay_ms)
                    bytes_written += len(frame)
                else:
                    for position, (label, device_id) in enumerate(order):
                        command_id = str(uuid.uuid4())
                        tag = command_tag(command_id)
                        while (tag, label) in send_records_by_tag:
                            command_id = str(uuid.uuid4())
                            tag = command_tag(command_id)
                        command_payload = build_command(device_id, command_id)
                        frame = encode_frame(FIELD_LINK_TYPE_COMMAND, serial_sequence, command_payload)
                        serial_sequence = (serial_sequence + 1) & 0xFFFFFFFF
                        sent_mono = time.monotonic()
                        send_record = {
                            "commandId": command_id,
                            "commandTag": tag,
                            "node": label,
                            "batch": batch_number,
                            "position": position,
                            "sentAt": utc_now(),
                            "sentMono": sent_mono,
                        }
                        send_records[command_id] = send_record
                        send_records_by_tag[(tag, label)] = send_record
                        write_chunked(fd, frame, args.command_chunk_bytes, args.command_chunk_delay_ms)
                        bytes_written += len(frame)
                        if args.response_wait_ms > 0:
                            response_deadline = time.monotonic() + args.response_wait_ms / 1000.0
                            while command_id not in received_command_ids and time.monotonic() < response_deadline:
                                receive_once(fd, min(0.05, response_deadline - time.monotonic()))
                        if args.inter_command_gap_ms > 0 and position < len(order) - 1:
                            gap_deadline = time.monotonic() + args.inter_command_gap_ms / 1000.0
                            while time.monotonic() < gap_deadline:
                                receive_once(fd, min(0.05, gap_deadline - time.monotonic()))
                batches_sent += 1
                next_batch_at = first_batch_at + batches_sent * args.batch_interval_ms / 1000.0
                now = time.monotonic()

            if now >= send_deadline and drain_deadline is None:
                drain_deadline = now + args.drain_seconds
            if drain_deadline is not None and now >= drain_deadline:
                break

            wake_at = next_batch_at if next_batch_at < send_deadline else (drain_deadline or send_deadline)
            timeout = max(0.0, min(0.1, wake_at - now))
            receive_once(fd, timeout)
    finally:
        os.close(fd)

    expected_by_node = Counter(record["node"] for record in send_records.values())
    received_by_node = Counter(send_records[command_id]["node"] for command_id in received_command_ids)
    node_results: dict[str, Any] = {}
    for label in NODES:
        arrivals = arrivals_by_node[label]
        intervals_ms = [(right - left) * 1000.0 for left, right in zip(arrivals, arrivals[1:])]
        latencies = latencies_by_node[label]
        sequences = seq_by_node[label]
        sequence_steps = [(right - left) & 0xFFFFFFFF for left, right in zip(sequences, sequences[1:])]
        forward_missing = sum(step - 1 for step in sequence_steps if 1 < step < 0x80000000)
        backward_or_reset = sum(1 for step in sequence_steps if step >= 0x80000000)
        sequence_duplicates = sum(1 for step in sequence_steps if step == 0)
        expected = expected_by_node[label]
        matched = received_by_node[label]
        battery_voltages = battery_voltages_by_node[label]
        latest_telemetry = last_telemetry_by_node.get(label, {})
        latest_meta = latest_telemetry.get("meta") if isinstance(latest_telemetry, dict) else None
        latest_metrics = latest_telemetry.get("metrics") if isinstance(latest_telemetry, dict) else None
        node_results[label] = {
            "expected": expected,
            "matched": matched,
            "missing": max(0, expected - matched),
            "matchedRate": round(matched / expected, 4) if expected else 0.0,
            "arrivalIntervalMs": {
                "p50": percentile(intervals_ms, 0.50),
                "p95": percentile(intervals_ms, 0.95),
                "max": round(max(intervals_ms), 1) if intervals_ms else None,
            },
            "commandToTelemetryLatencyMs": {
                "p50": percentile(latencies, 0.50),
                "p95": percentile(latencies, 0.95),
                "max": round(max(latencies), 1) if latencies else None,
            },
            "sequence": {
                "first": sequences[0] if sequences else None,
                "last": sequences[-1] if sequences else None,
                "nonUnitGaps": sum(1 for step in sequence_steps if step != 1),
                "forwardMissing": forward_missing,
                "duplicates": sequence_duplicates,
                "backwardOrReset": backward_or_reset,
                "maxForwardStep": max((step for step in sequence_steps if step < 0x80000000), default=None),
            },
            "observedCompactVersions": dict(compact_versions_by_node[label]),
            "observedFieldSensorSources": dict(field_sources_by_node[label]),
            "profileViolations": dict(profile_violations_by_node[label]),
            "battery": {
                "samples": len(battery_voltages),
                "voltageMin": round(min(battery_voltages), 3) if battery_voltages else None,
                "voltageMax": round(max(battery_voltages), 3) if battery_voltages else None,
                "voltageLast": (
                    latest_metrics.get("battery_v") if isinstance(latest_metrics, dict) else None
                ),
                "percentLast": (
                    latest_metrics.get("battery_pct") if isinstance(latest_metrics, dict) else None
                ),
                "estimateQuality": (
                    latest_meta.get("battery_estimate_quality") if isinstance(latest_meta, dict) else None
                ),
            },
        }

    expected_total = len(send_records)
    matched_total = len(received_command_ids)
    matched_rate = matched_total / expected_total if expected_total else 0.0
    error_count = sum(errors.values())
    profile_violation_count = sum(
        sum(violations.values()) for violations in profile_violations_by_node.values()
    )
    stable_one_second = evaluate_stability_gate(
        matched_rate=matched_rate,
        required_match_rate=args.required_match_rate,
        decode_error_count=error_count,
        unmatched_telemetry=unmatched_telemetry,
        duplicate_telemetry=duplicate_telemetry,
        profile_violation_count=profile_violation_count,
        trailing_undelimited_bytes=len(receive_buffer),
        node_results=node_results,
        max_p95_interval_ms=args.max_p95_interval_ms,
        max_command_latency_ms=args.max_command_latency_ms,
    )

    return {
        "schemaVersion": 1,
        "experiment": "xls1-three-node-batch-poll",
        "startedAt": started_at,
        "finishedAt": utc_now(),
        "elapsedSeconds": round(time.monotonic() - started_mono, 3),
        "configuration": {
            "serialDevice": args.serial_device,
            "baud": args.baud,
            "durationSeconds": args.duration_seconds,
            "settleElapsedMs": settle_elapsed_ms,
            "settleQuietMs": args.settle_quiet_ms,
            "warmupSeconds": args.warmup_seconds,
            "warmupElapsedMs": warmup_elapsed_ms,
            "warmupBatchesSent": warmup_batches_sent,
            "warmupBytesWritten": warmup_bytes_written,
            "batchIntervalMs": args.batch_interval_ms,
            "interCommandGapMs": args.inter_command_gap_ms,
            "responseWaitMs": args.response_wait_ms,
            "broadcastPoll": args.broadcast_poll,
            "commandChunkBytes": args.command_chunk_bytes,
            "commandChunkDelayMs": args.command_chunk_delay_ms,
            "drainSeconds": args.drain_seconds,
            "nodeOrderPolicy": "fixed-A-B-C-slots" if args.broadcast_poll else "rotating-A-B-C",
            "requiredCompactVersion": args.required_compact_version,
            "requiredFieldSensorSource": args.required_field_sensor_source,
            "requireBatteryValid": args.require_battery_valid,
            "requireFieldSensorsValid": args.require_field_sensors_valid,
            "maxCommandLatencyMs": args.max_command_latency_ms,
        },
        "result": {
            "stableProfile": stable_one_second,
            # Kept for compatibility with reports produced by the original 1 Hz tool.
            "stableOneSecondProfile": stable_one_second,
            "expectedTelemetry": expected_total,
            "matchedTelemetry": matched_total,
            "missingTelemetry": max(0, expected_total - matched_total),
            "matchedRate": round(matched_rate, 4),
            "batchesSent": batches_sent,
            "decodeOrJsonErrors": error_count,
            "profileViolations": profile_violation_count,
            "unmatchedTelemetry": unmatched_telemetry,
            "duplicateTelemetry": duplicate_telemetry,
            "bytesWritten": bytes_written,
            "bytesRead": bytes_read,
            "trailingUndelimitedBytes": len(receive_buffer),
        },
        "nodes": node_results,
        "validFrameTypes": dict(valid_frame_types),
        "errors": dict(errors),
        "errorSamples": error_samples,
        "unmatchedSamples": unmatched_samples,
        "duplicateSamples": duplicate_samples,
        "ackSamples": ack_samples,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial-device", default="/dev/ttyS3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--duration-seconds", type=float, default=60.0)
    parser.add_argument("--batch-interval-ms", type=int, default=1000)
    parser.add_argument("--inter-command-gap-ms", type=int, default=0)
    parser.add_argument("--response-wait-ms", type=int, default=0)
    parser.add_argument("--broadcast-poll", action="store_true")
    parser.add_argument("--command-chunk-bytes", type=int, default=32)
    parser.add_argument("--command-chunk-delay-ms", type=int, default=15)
    parser.add_argument("--settle-ms", type=int, default=2000)
    parser.add_argument("--settle-quiet-ms", type=int, default=0)
    parser.add_argument("--warmup-seconds", type=float, default=0.0)
    parser.add_argument("--drain-seconds", type=float, default=5.0)
    parser.add_argument("--service", default="lsmv2-field-gateway.service")
    parser.add_argument("--runtime-mask-service", action="store_true")
    parser.add_argument("--report-path", default="")
    parser.add_argument("--required-match-rate", type=float, default=1.0)
    parser.add_argument("--max-p95-interval-ms", type=float, default=1500.0)
    parser.add_argument("--max-command-latency-ms", type=float, default=950.0)
    parser.add_argument("--required-compact-version", type=int, choices=(0, 1, 2), default=0)
    parser.add_argument(
        "--required-field-sensor-source",
        choices=("any", "simulated", "hardware"),
        default="any",
    )
    parser.add_argument("--require-battery-valid", action="store_true")
    parser.add_argument("--require-field-sensors-valid", action="store_true")
    parser.add_argument("--fail-on-gate", action="store_true")
    args = parser.parse_args()
    if args.baud <= 0:
        parser.error("--baud must be positive")
    if args.duration_seconds <= 0:
        parser.error("--duration-seconds must be positive")
    if args.batch_interval_ms <= 0:
        parser.error("--batch-interval-ms must be positive")
    if args.inter_command_gap_ms < 0:
        parser.error("--inter-command-gap-ms must be non-negative")
    if args.response_wait_ms < 0:
        parser.error("--response-wait-ms must be non-negative")
    if args.command_chunk_bytes <= 0:
        parser.error("--command-chunk-bytes must be positive")
    if args.command_chunk_delay_ms < 0:
        parser.error("--command-chunk-delay-ms must be non-negative")
    if args.settle_ms < 0 or args.settle_quiet_ms < 0:
        parser.error("settle durations must be non-negative")
    if args.warmup_seconds < 0 or args.drain_seconds < 0:
        parser.error("warm-up and drain durations must be non-negative")
    if args.warmup_seconds > 0 and not args.broadcast_poll:
        parser.error("--warmup-seconds requires --broadcast-poll")
    if not 0.0 <= args.required_match_rate <= 1.0:
        parser.error("--required-match-rate must be between 0 and 1")
    if args.max_p95_interval_ms <= 0 or args.max_command_latency_ms <= 0:
        parser.error("latency limits must be positive")
    return args


def main() -> int:
    args = parse_args()
    report_path = Path(args.report_path) if args.report_path else Path(
        f"/var/lib/lsmv2/experiments/xls1-three-node-batch-poll-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    )
    service_was_active = service_is_active(args.service)
    service_was_masked = False
    recovery: dict[str, Any] = {
        "serviceWasActive": service_was_active,
        "serviceRuntimeMasked": False,
        "serviceRestored": not service_was_active,
    }
    report: dict[str, Any]

    def interrupt_handler(signum: int, _frame: Any) -> None:
        raise InterruptedError(f"received signal {signum}")

    signal.signal(signal.SIGINT, interrupt_handler)
    signal.signal(signal.SIGTERM, interrupt_handler)

    try:
        if service_was_active:
            if args.runtime_mask_service:
                subprocess.run(["systemctl", "mask", "--runtime", "--now", args.service], check=True)
                service_was_masked = True
                recovery["serviceRuntimeMasked"] = True
            else:
                set_service_state(args.service, "stop")
        report = run_experiment(args)
    except Exception as exc:
        report = {
            "schemaVersion": 1,
            "experiment": "xls1-three-node-batch-poll",
            "startedAt": utc_now(),
            "finishedAt": utc_now(),
            "fatalError": str(exc),
        }
    finally:
        if service_was_active:
            restore_errors: list[str] = []
            if service_was_masked:
                try:
                    subprocess.run(["systemctl", "unmask", "--runtime", args.service], check=True)
                except Exception as exc:
                    restore_errors.append(f"runtime unmask failed: {exc}")
            try:
                set_service_state(args.service, "start")
                deadline = time.monotonic() + 20.0
                while time.monotonic() < deadline and not service_is_active(args.service):
                    time.sleep(0.5)
                recovery["serviceRestored"] = service_is_active(args.service)
            except Exception as exc:
                restore_errors.append(f"service start failed: {exc}")
            if restore_errors:
                recovery["serviceRestoreError"] = "; ".join(restore_errors)

    report["recovery"] = recovery
    report_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = report_path.with_suffix(report_path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary_path, report_path)
    print(json.dumps({"reportPath": str(report_path), **report.get("result", {}), **recovery}, separators=(",", ":")))
    if not recovery.get("serviceRestored") or "fatalError" in report:
        return 1
    if args.fail_on_gate and not report.get("result", {}).get("stableProfile", False):
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
