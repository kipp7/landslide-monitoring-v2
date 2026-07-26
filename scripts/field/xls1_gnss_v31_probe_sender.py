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
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import termios
except ImportError:
    termios = None


FIELD_LINK_VERSION = 1
FIELD_LINK_TYPE_RTCM = 6
RTCM_FRAGMENT_HEADER_BYTES = 42
TARGET_MASKS = {"A": 0x01, "B": 0x02, "C": 0x04, "all": 0x07}

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


def encode_field_link(sequence: int, payload: bytes) -> bytes:
    header = struct.pack(
        ">BBBBII",
        FIELD_LINK_VERSION,
        FIELD_LINK_TYPE_RTCM,
        0,
        0,
        sequence & 0xFFFFFFFF,
        len(payload),
    )
    packet = header + payload
    crc = binascii.crc32(packet) & 0xFFFFFFFF
    return cobs_encode(packet + struct.pack(">I", crc)) + b"\x00"


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


def service_is_active(service_name: str) -> bool:
    return subprocess.run(
        ["systemctl", "is-active", "--quiet", service_name], check=False
    ).returncode == 0


def build_schedule(duration_seconds: float) -> list[tuple[float, int, int]]:
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


def run_probe(args: argparse.Namespace) -> dict[str, Any]:
    schedule = build_schedule(args.duration_seconds)
    if not schedule:
        raise ValueError("duration did not produce any scheduled RTCM frames")
    session_epoch = int(time.time()) & 0xFFFFFFFF
    transport_sequence = 1
    field_sequence = 1
    raw_bytes = 0
    wire_bytes = 0
    fragment_count = 0
    late_events = 0
    max_lateness_ms = 0.0
    message_counts: Counter[int] = Counter()
    started_mono = time.monotonic()

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
        started_mono = time.monotonic()
        last_progress_second = -1

        for due, message_type, frame_bytes in schedule:
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
            for payload in payloads:
                wire_frame = encode_field_link(field_sequence, payload)
                write_chunked(fd, wire_frame, args.chunk_bytes, args.chunk_delay_ms)
                wire_bytes += len(wire_frame)
                fragment_count += 1
                field_sequence = (field_sequence + 1) & 0xFFFFFFFF
            raw_bytes += len(frame)
            message_counts[message_type] += 1
            transport_sequence = (transport_sequence + 1) & 0xFFFFFFFF

            elapsed_second = int(time.monotonic() - started_mono)
            if elapsed_second >= last_progress_second + 5:
                last_progress_second = elapsed_second
                print(
                    f"PROGRESS elapsed={elapsed_second}s frames={sum(message_counts.values())} "
                    f"fragments={fragment_count} raw_bytes={raw_bytes} wire_bytes={wire_bytes}",
                    flush=True,
                )

        termios.tcdrain(fd)
        if args.drain_ms > 0:
            time.sleep(args.drain_ms / 1000.0)
    finally:
        os.close(fd)

    elapsed_seconds = time.monotonic() - started_mono
    return {
        "sessionEpoch": session_epoch,
        "target": args.target,
        "targetMask": TARGET_MASKS[args.target],
        "framesSent": sum(message_counts.values()),
        "fragmentsSent": fragment_count,
        "rtcmRawBytes": raw_bytes,
        "fieldLinkWireBytes": wire_bytes,
        "rtcmRawBytesPerSecond": round(raw_bytes / args.duration_seconds, 2),
        "fieldLinkWireBytesPerSecond": round(wire_bytes / args.duration_seconds, 2),
        "elapsedSecondsIncludingDrain": round(elapsed_seconds, 3),
        "lateEvents": late_events,
        "lateThresholdMs": args.late_threshold_ms,
        "maxLatenessMs": round(max_lateness_ms, 3),
        "messageTypeCounts": {str(key): value for key, value in sorted(message_counts.items())},
        "nodeCounterGate": "pending-debug-uart",
        "hardwareGatePassed": False,
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
    ten_second_schedule = build_schedule(10.0)
    assert len(ten_second_schedule) == 62
    assert sum(item[2] for item in ten_second_schedule) == 8800
    assert Counter(item[1] for item in ten_second_schedule) == Counter(
        {1124: 20, 1074: 10, 1084: 10, 1094: 10, 1114: 10, 1005: 1, 1033: 1}
    )
    print("xls1 GNSS V3.1 PROBE sender self-test passed")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Send credential-free synthetic RTCM to RK2206 PROBE firmware."
    )
    parser.add_argument("--serial-device", default="/dev/ttyS3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--target", choices=tuple(TARGET_MASKS), default="A")
    parser.add_argument("--duration-seconds", type=float, default=12.0)
    parser.add_argument("--fragment-data-bytes", type=int, default=160)
    parser.add_argument("--chunk-bytes", type=int, default=32)
    parser.add_argument("--chunk-delay-ms", type=int, default=15)
    parser.add_argument("--settle-ms", type=int, default=1000)
    parser.add_argument("--drain-ms", type=int, default=1000)
    parser.add_argument("--late-threshold-ms", type=float, default=50.0)
    parser.add_argument("--service", default="lsmv2-field-gateway.service")
    parser.add_argument(
        "--runtime-mask-service", action=argparse.BooleanOptionalAction, default=True
    )
    parser.add_argument("--report-path", default="")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.duration_seconds <= 0 or args.baud <= 0:
        parser.error("duration and baud must be positive")
    if not 32 <= args.fragment_data_bytes <= 512:
        parser.error("fragment data bytes must be in [32, 512]")
    if args.chunk_bytes <= 0 or args.chunk_delay_ms < 0 or args.settle_ms < 0 or args.drain_ms < 0:
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
        "schemaVersion": 1,
        "experiment": "xls1-gnss-v31-probe-sender",
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
            "durationSeconds": args.duration_seconds,
            "fragmentDataBytes": args.fragment_data_bytes,
            "chunkBytes": args.chunk_bytes,
            "chunkDelayMs": args.chunk_delay_ms,
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
        report["result"] = run_probe(args)
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
    summary = {
        "reportPath": str(report_path),
        **report.get("result", {}),
        **recovery,
    }
    if "fatalError" in report:
        summary["fatalError"] = report["fatalError"]
    print(json.dumps(summary, separators=(",", ":")), flush=True)
    return 0 if "fatalError" not in report and recovery.get("serviceRestored") else 1


if __name__ == "__main__":
    raise SystemExit(main())
