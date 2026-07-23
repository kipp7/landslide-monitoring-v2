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
import termios
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


FIELD_LINK_VERSION = 1
FIELD_LINK_TYPE_TELEMETRY = 1
FIELD_LINK_TYPE_COMMAND = 2
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


def node_label(device_id: str) -> str | None:
    for label, configured_id in NODES.items():
        if device_id == configured_id:
            return label
    return None


def run_experiment(args: argparse.Namespace) -> dict[str, Any]:
    started_at = utc_now()
    started_mono = time.monotonic()
    send_records: dict[str, dict[str, Any]] = {}
    received_command_ids: set[str] = set()
    arrivals_by_node: dict[str, list[float]] = defaultdict(list)
    latencies_by_node: dict[str, list[float]] = defaultdict(list)
    seq_by_node: dict[str, list[int]] = defaultdict(list)
    errors: Counter[str] = Counter()
    error_samples: list[dict[str, Any]] = []
    valid_frame_types: Counter[str] = Counter()
    unmatched_telemetry = 0
    duplicate_telemetry = 0
    serial_sequence = 0
    batches_sent = 0
    bytes_read = 0
    bytes_written = 0
    receive_buffer = bytearray()

    fd = os.open(args.serial_device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        configure_serial(fd, args.baud)
        settle_deadline = time.monotonic() + args.settle_ms / 1000.0
        while time.monotonic() < settle_deadline:
            readable, _, _ = select.select([fd], [], [], 0.1)
            if readable:
                try:
                    os.read(fd, 4096)
                except BlockingIOError:
                    pass
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
                for position, (label, device_id) in enumerate(order):
                    command_id = str(uuid.uuid4())
                    command_payload = build_command(device_id, command_id)
                    frame = encode_frame(FIELD_LINK_TYPE_COMMAND, serial_sequence, command_payload)
                    serial_sequence = (serial_sequence + 1) & 0xFFFFFFFF
                    sent_mono = time.monotonic()
                    send_records[command_id] = {
                        "node": label,
                        "batch": batch_number,
                        "position": position,
                        "sentAt": utc_now(),
                        "sentMono": sent_mono,
                    }
                    write_chunked(fd, frame, args.command_chunk_bytes, args.command_chunk_delay_ms)
                    bytes_written += len(frame)
                    if args.inter_command_gap_ms > 0 and position < len(order) - 1:
                        time.sleep(args.inter_command_gap_ms / 1000.0)
                batches_sent += 1
                next_batch_at = first_batch_at + batches_sent * args.batch_interval_ms / 1000.0
                now = time.monotonic()

            if now >= send_deadline and drain_deadline is None:
                drain_deadline = now + args.drain_seconds
            if drain_deadline is not None and now >= drain_deadline:
                break

            wake_at = next_batch_at if next_batch_at < send_deadline else (drain_deadline or send_deadline)
            timeout = max(0.0, min(0.1, wake_at - now))
            readable, _, _ = select.select([fd], [], [], timeout)
            if not readable:
                continue
            try:
                chunk = os.read(fd, 4096)
            except BlockingIOError:
                continue
            if not chunk:
                continue
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
                if frame_type != FIELD_LINK_TYPE_TELEMETRY:
                    continue
                try:
                    telemetry = json.loads(payload.decode("utf-8"))
                except Exception as exc:
                    reason = f"telemetry json decode failed: {exc}"
                    errors[reason] += 1
                    if len(error_samples) < 20:
                        error_samples.append({"at": utc_now(), "reason": reason, "frameBytes": len(encoded) + 1})
                    continue

                device_id = telemetry.get("device_id")
                label = node_label(device_id) if isinstance(device_id, str) else None
                if label is None:
                    errors["telemetry from unknown device"] += 1
                    continue
                arrivals_by_node[label].append(received_mono)
                seq = telemetry.get("seq")
                if isinstance(seq, int):
                    seq_by_node[label].append(seq)
                meta = telemetry.get("meta")
                command_id = meta.get("last_command_id") if isinstance(meta, dict) else None
                send_record = send_records.get(command_id) if isinstance(command_id, str) else None
                if not send_record or send_record["node"] != label:
                    unmatched_telemetry += 1
                    continue
                if command_id in received_command_ids:
                    duplicate_telemetry += 1
                    continue
                received_command_ids.add(command_id)
                latency_ms = (received_mono - float(send_record["sentMono"])) * 1000.0
                latencies_by_node[label].append(latency_ms)

            if len(receive_buffer) > 65536:
                errors["field-link assembler buffer overflow"] += 1
                receive_buffer.clear()
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
        sequence_gaps = [right - left for left, right in zip(sequences, sequences[1:])]
        expected = expected_by_node[label]
        matched = received_by_node[label]
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
                "nonUnitGaps": sum(1 for gap in sequence_gaps if gap != 1),
                "maxGap": max(sequence_gaps) if sequence_gaps else None,
            },
        }

    expected_total = len(send_records)
    matched_total = len(received_command_ids)
    matched_rate = matched_total / expected_total if expected_total else 0.0
    error_count = sum(errors.values())
    stable_one_second = (
        matched_rate >= args.required_match_rate
        and error_count == 0
        and all(
            result["arrivalIntervalMs"]["p95"] is not None
            and result["arrivalIntervalMs"]["p95"] <= args.max_p95_interval_ms
            for result in node_results.values()
        )
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
            "batchIntervalMs": args.batch_interval_ms,
            "interCommandGapMs": args.inter_command_gap_ms,
            "commandChunkBytes": args.command_chunk_bytes,
            "commandChunkDelayMs": args.command_chunk_delay_ms,
            "drainSeconds": args.drain_seconds,
            "nodeOrderPolicy": "rotating-A-B-C",
        },
        "result": {
            "stableOneSecondProfile": stable_one_second,
            "expectedTelemetry": expected_total,
            "matchedTelemetry": matched_total,
            "missingTelemetry": max(0, expected_total - matched_total),
            "matchedRate": round(matched_rate, 4),
            "batchesSent": batches_sent,
            "decodeOrJsonErrors": error_count,
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
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial-device", default="/dev/ttyS3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--duration-seconds", type=float, default=60.0)
    parser.add_argument("--batch-interval-ms", type=int, default=1000)
    parser.add_argument("--inter-command-gap-ms", type=int, default=0)
    parser.add_argument("--command-chunk-bytes", type=int, default=64)
    parser.add_argument("--command-chunk-delay-ms", type=int, default=10)
    parser.add_argument("--settle-ms", type=int, default=2000)
    parser.add_argument("--drain-seconds", type=float, default=5.0)
    parser.add_argument("--service", default="lsmv2-field-gateway.service")
    parser.add_argument("--report-path", default="")
    parser.add_argument("--required-match-rate", type=float, default=0.99)
    parser.add_argument("--max-p95-interval-ms", type=float, default=1500.0)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    report_path = Path(args.report_path) if args.report_path else Path(
        f"/var/lib/lsmv2/experiments/xls1-three-node-batch-poll-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    )
    service_was_active = service_is_active(args.service)
    recovery: dict[str, Any] = {"serviceWasActive": service_was_active, "serviceRestored": False}
    report: dict[str, Any]

    def interrupt_handler(signum: int, _frame: Any) -> None:
        raise InterruptedError(f"received signal {signum}")

    signal.signal(signal.SIGINT, interrupt_handler)
    signal.signal(signal.SIGTERM, interrupt_handler)

    try:
        if service_was_active:
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
            try:
                set_service_state(args.service, "start")
                deadline = time.monotonic() + 20.0
                while time.monotonic() < deadline and not service_is_active(args.service):
                    time.sleep(0.5)
                recovery["serviceRestored"] = service_is_active(args.service)
            except Exception as exc:
                recovery["serviceRestoreError"] = str(exc)

    report["recovery"] = recovery
    report_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = report_path.with_suffix(report_path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(report, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary_path, report_path)
    print(json.dumps({"reportPath": str(report_path), **report.get("result", {}), **recovery}, separators=(",", ":")))
    return 0 if recovery.get("serviceRestored") and "fatalError" not in report else 1


if __name__ == "__main__":
    raise SystemExit(main())
