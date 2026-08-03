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
import statistics
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
COMPACT_PAYLOAD_BYTES_BY_VERSION = {1: 46, 2: 46, 3: 95, 4: 139}
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
COMPACT_STATUS_GNSS_SIMULATED = 1 << 2
V3_VALID_BATTERY = 1 << 0
V3_VALID_SOIL = 1 << 1
V3_VALID_SOIL_EC = 1 << 2
V3_VALID_TILT = 1 << 3
V3_VALID_GNSS_STATUS = 1 << 4
V3_VALID_GNSS_POSITION = 1 << 5
V3_VALID_GNSS_ALTITUDE = 1 << 6
V3_VALID_GNSS_TIME = 1 << 7
V3_VALID_CORRECTION_AGE = 1 << 8
V3_VALID_HDOP = 1 << 9
V3_VALID_GST = 1 << 10
V3_VALID_FIXED_STATS = 1 << 11
V3_VALID_STATION = 1 << 12
V3_KNOWN_VALID_MASK = (1 << 13) - 1
GNSS_FIX_TRUSTED = 1 << 1
GNSS_FIX_TIME_VALID = 1 << 2
GNSS_FIX_GST_VALID = 1 << 3
GNSS_FIX_CORRECTION_AGE_VALID = 1 << 5
GNSS_FIX_HDOP_VALID = 1 << 6
GNSS_FIX_ALTITUDE_VALID = 1 << 9
GNSS_FIX_GEOID_VALID = 1 << 10
GNSS_FIX_STATION_VALID = 1 << 11
GNSS_FIX_POSITION_VALID = 1 << 12
GNSS_FIX_FIXED_STATS_VALID = 1 << 13
GNSS_FIX_COORDINATE_FRAME_VALID = 1 << 14
V4_RTCM_MODE_DISABLED = 0
V4_RTCM_STATE_READY = 1 << 0
V4_RTCM_STATE_SESSION_ARMED = 1 << 1
V4_RTCM_STATE_LEASE_VALID = 1 << 2
V4_RTCM_KNOWN_STATE_MASK = 0x3F
V4_AGE_UNAVAILABLE = 0xFFFFFFFF
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


def should_retry_broadcast_poll(
    received_count: int,
    expected_count: int,
    retries_used: int,
    max_retries: int,
) -> bool:
    return 0 < received_count < expected_count and retries_used < max_retries


def classify_repeated_broadcast_telemetry(
    attempts: int,
    retry_copy_already_observed: bool,
) -> str:
    if attempts > 1 and not retry_copy_already_observed:
        return "redundant-retry"
    return "duplicate"


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


def runtime_service_hold_path(service_name: str) -> Path:
    if Path(service_name).name != service_name or not service_name.endswith(".service"):
        raise ValueError(f"invalid systemd service name: {service_name}")
    return Path("/run/systemd/system") / f"{service_name}.d" / "zz-lsmv2-field-test-hold.conf"


def install_runtime_service_hold(service_name: str) -> Path:
    hold_path = runtime_service_hold_path(service_name)
    hold_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = hold_path.with_suffix(hold_path.suffix + ".tmp")
    temporary_path.write_text(
        "[Unit]\nRefuseManualStart=yes\n\n[Service]\nRestart=no\n",
        encoding="ascii",
    )
    os.chmod(temporary_path, 0o644)
    os.replace(temporary_path, hold_path)
    subprocess.run(["systemctl", "daemon-reload"], check=True)
    set_service_state(service_name, "stop")
    deadline = time.monotonic() + 20.0
    while time.monotonic() < deadline and service_is_active(service_name):
        time.sleep(0.2)
    if service_is_active(service_name):
        raise RuntimeError(f"service remained active after runtime hold: {service_name}")
    return hold_path


def remove_runtime_service_hold(service_name: str, hold_path: Path) -> None:
    expected_path = runtime_service_hold_path(service_name)
    if hold_path != expected_path:
        raise ValueError(f"unexpected runtime hold path: {hold_path}")
    hold_path.unlink(missing_ok=True)
    try:
        hold_path.parent.rmdir()
    except OSError:
        pass
    subprocess.run(["systemctl", "daemon-reload"], check=True)


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
    if len(payload) < 3 or payload[:2] != b"LS" or payload[2] not in COMPACT_PAYLOAD_BYTES_BY_VERSION:
        raise ValueError("compact telemetry magic or version mismatch")

    compact_version = payload[2]
    expected_bytes = COMPACT_PAYLOAD_BYTES_BY_VERSION[compact_version]
    if len(payload) != expected_bytes:
        raise ValueError(
            f"compact telemetry length mismatch: version={compact_version} "
            f"expected={expected_bytes} actual={len(payload)}"
        )
    compact_node = payload[3]
    if compact_node not in (1, 2, 3):
        raise ValueError(f"compact telemetry node out of range: {compact_node}")
    label = chr(ord("A") + compact_node - 1)
    valid = struct.unpack(">H", payload[6:8])[0]
    sequence = struct.unpack(">I", payload[8:12])[0]
    uptime = struct.unpack(">I", payload[12:16])[0]
    last_command_tag = struct.unpack(">I", payload[16:20])[0]
    metrics: dict[str, Any] = {}

    if compact_version in (3, 4):
        return decode_compact_telemetry_v3_v4(payload)

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


def decode_compact_telemetry_v3_v4(payload: bytes) -> dict[str, Any]:
    compact_version = payload[2]
    compact_node = payload[3]
    if compact_version not in (3, 4) or compact_node not in (1, 2, 3):
        raise ValueError("compact telemetry v3/v4 header mismatch")
    label = chr(ord("A") + compact_node - 1)
    status_flags = payload[4]
    valid = struct.unpack(">H", payload[6:8])[0]
    fix_flags = struct.unpack(">H", payload[76:78])[0]
    if status_flags & ~0x07 or valid & ~V3_KNOWN_VALID_MASK:
        raise ValueError("compact telemetry v3/v4 status or validity flags contain reserved bits")

    gnss_status_valid = bool(valid & V3_VALID_GNSS_STATUS)

    def flag_matches(valid_mask: int, fix_mask: int) -> bool:
        return bool(valid & valid_mask) == bool(fix_flags & fix_mask)

    if not gnss_status_valid and ((valid & 0x1FF0) or fix_flags):
        raise ValueError("compact telemetry v3/v4 carries GNSS evidence without a valid GNSS status")
    if gnss_status_valid and not all(
        (
            flag_matches(V3_VALID_GNSS_POSITION, GNSS_FIX_POSITION_VALID),
            flag_matches(V3_VALID_GNSS_TIME, GNSS_FIX_TIME_VALID),
            flag_matches(V3_VALID_CORRECTION_AGE, GNSS_FIX_CORRECTION_AGE_VALID),
            flag_matches(V3_VALID_HDOP, GNSS_FIX_HDOP_VALID),
            flag_matches(V3_VALID_GST, GNSS_FIX_GST_VALID),
            flag_matches(V3_VALID_FIXED_STATS, GNSS_FIX_FIXED_STATS_VALID),
            flag_matches(V3_VALID_STATION, GNSS_FIX_STATION_VALID),
            bool(valid & V3_VALID_GNSS_ALTITUDE)
            == bool(fix_flags & (GNSS_FIX_ALTITUDE_VALID | GNSS_FIX_GEOID_VALID)),
        )
    ):
        raise ValueError("compact telemetry v3/v4 GNSS validity bitmap contradicts its fix flags")

    coordinate_frame_code = payload[75]
    coordinate_frame_valid = bool(fix_flags & GNSS_FIX_COORDINATE_FRAME_VALID)
    if gnss_status_valid and (
        (coordinate_frame_valid and coordinate_frame_code not in (1, 2))
        or (not coordinate_frame_valid and coordinate_frame_code != 0)
    ):
        raise ValueError("compact telemetry v3/v4 coordinate-frame code contradicts its validity flag")

    gga_quality = payload[74]
    correction_age_ms = struct.unpack(">I", payload[60:64])[0]
    solution_age_ms = struct.unpack(">I", payload[64:68])[0]
    trusted = bool(fix_flags & GNSS_FIX_TRUSTED)
    gnss_simulated = bool(status_flags & COMPACT_STATUS_GNSS_SIMULATED)
    if gnss_simulated and trusted:
        raise ValueError("compact telemetry v3/v4 simulated GNSS cannot be trusted RTK evidence")
    if trusted and (
        gga_quality != 4
        or not valid & V3_VALID_GNSS_POSITION
        or not valid & V3_VALID_CORRECTION_AGE
        or not coordinate_frame_valid
        or correction_age_ms > 5000
        or solution_age_ms > 2000
    ):
        raise ValueError("compact telemetry v3/v4 trusted RTK evidence violates the production gate")
    fixed_ratio_permille = struct.unpack(">H", payload[89:91])[0]
    if valid & V3_VALID_FIXED_STATS and fixed_ratio_permille > 1000:
        raise ValueError("compact telemetry v3/v4 Fixed ratio exceeds 1000 permille")

    metrics: dict[str, Any] = {}
    if valid & V3_VALID_BATTERY:
        metrics["battery_v"] = struct.unpack(">H", payload[20:22])[0] / 1000.0
        metrics["battery_pct"] = payload[22]
    if valid & V3_VALID_SOIL:
        metrics["soil_temperature_c"] = struct.unpack(">h", payload[24:26])[0] / 100.0
        metrics["soil_moisture_pct"] = struct.unpack(">H", payload[26:28])[0] / 100.0
    if valid & V3_VALID_SOIL_EC:
        metrics["electrical_conductivity_us_cm"] = struct.unpack(">H", payload[28:30])[0]
    if valid & V3_VALID_TILT:
        metrics["tilt_x_deg"] = struct.unpack(">h", payload[30:32])[0] / 100.0
        metrics["tilt_y_deg"] = struct.unpack(">h", payload[32:34])[0] / 100.0
        metrics["tilt_z_deg"] = struct.unpack(">h", payload[34:36])[0] / 100.0
        metrics["warning_flag"] = bool(status_flags & COMPACT_STATUS_WARNING)
    if gnss_status_valid:
        metrics["rtk_gga_quality"] = gga_quality
        metrics["rtk_trusted"] = trusted
        metrics["rtk_satellites_used"] = payload[78]
        metrics["rtk_solution_age_ms"] = solution_age_ms
    if valid & V3_VALID_GNSS_POSITION:
        latitude_e9 = struct.unpack(">q", payload[36:44])[0]
        longitude_e9 = struct.unpack(">q", payload[44:52])[0]
        if not -90_000_000_000 <= latitude_e9 <= 90_000_000_000:
            raise ValueError("compact telemetry v3/v4 RTK latitude is out of range")
        if not -180_000_000_000 <= longitude_e9 <= 180_000_000_000:
            raise ValueError("compact telemetry v3/v4 RTK longitude is out of range")
        metrics["rtk_latitude_deg"] = latitude_e9 / 1_000_000_000.0
        metrics["rtk_longitude_deg"] = longitude_e9 / 1_000_000_000.0
    if valid & V3_VALID_GNSS_ALTITUDE:
        altitude_mm = struct.unpack(">i", payload[52:56])[0]
        geoid_mm = struct.unpack(">i", payload[56:60])[0]
        if fix_flags & GNSS_FIX_ALTITUDE_VALID:
            metrics["rtk_altitude_msl_m"] = altitude_mm / 1000.0
        if fix_flags & GNSS_FIX_GEOID_VALID:
            metrics["rtk_geoid_separation_m"] = geoid_mm / 1000.0
        if fix_flags & GNSS_FIX_ALTITUDE_VALID and fix_flags & GNSS_FIX_GEOID_VALID:
            metrics["rtk_ellipsoid_height_m"] = (altitude_mm + geoid_mm) / 1000.0
    if valid & V3_VALID_CORRECTION_AGE:
        metrics["rtk_correction_age_ms"] = correction_age_ms
    if valid & V3_VALID_GNSS_TIME:
        metrics["rtk_tow_ms"] = struct.unpack(">I", payload[68:72])[0]
        metrics["rtk_gnss_week"] = struct.unpack(">H", payload[72:74])[0]
    if valid & V3_VALID_HDOP:
        metrics["rtk_hdop"] = struct.unpack(">H", payload[79:81])[0] / 100.0
    if valid & V3_VALID_GST:
        metrics["rtk_gst_sigma_lat_mm"] = struct.unpack(">H", payload[81:83])[0]
        metrics["rtk_gst_sigma_lon_mm"] = struct.unpack(">H", payload[83:85])[0]
        metrics["rtk_gst_sigma_alt_mm"] = struct.unpack(">H", payload[85:87])[0]
    if valid & V3_VALID_FIXED_STATS:
        metrics["rtk_fixed_streak_s"] = struct.unpack(">H", payload[87:89])[0]
        metrics["rtk_fixed_ratio_1m_pct"] = fixed_ratio_permille / 10.0
        metrics["rtk_fix_drop_count"] = struct.unpack(">H", payload[91:93])[0]
    if valid & V3_VALID_STATION:
        metrics["rtk_reference_station_id"] = struct.unpack(">H", payload[93:95])[0]

    rtcm_mode = 0
    rtcm_state_flags = 0
    if compact_version == 4:
        rtcm_mode = payload[95]
        rtcm_state_flags = payload[96]
        queue_pending = payload[97]
        queue_high_watermark = payload[98]
        session_epoch = struct.unpack(">I", payload[99:103])[0]
        lease_remaining_ms = struct.unpack(">I", payload[103:107])[0]
        session_armed = bool(rtcm_state_flags & V4_RTCM_STATE_SESSION_ARMED)
        lease_valid = bool(rtcm_state_flags & V4_RTCM_STATE_LEASE_VALID)
        if (
            rtcm_mode > 2
            or rtcm_state_flags & ~V4_RTCM_KNOWN_STATE_MASK
            or not rtcm_state_flags & V4_RTCM_STATE_READY
            or queue_pending > queue_high_watermark
        ):
            raise ValueError("compact telemetry v4 RTCM runtime state is malformed")
        if rtcm_mode == V4_RTCM_MODE_DISABLED:
            if session_epoch or lease_remaining_ms or session_armed or lease_valid or queue_pending:
                raise ValueError("compact telemetry v4 disabled RTCM state is not fail-closed")
        elif not session_epoch or not lease_remaining_ms or not session_armed or not lease_valid:
            raise ValueError("compact telemetry v4 active RTCM state lacks a valid session lease")

        metrics.update(
            {
                "rtcm_injection_mode_code": rtcm_mode,
                "rtcm_session_epoch": session_epoch,
                "rtcm_lease_remaining_ms": lease_remaining_ms,
                "rtcm_queue_pending": queue_pending,
                "rtcm_queue_high_watermark": queue_high_watermark,
                "rtcm_accepted_fragments_total": struct.unpack(">I", payload[119:123])[0],
                "rtcm_completed_frames_total": struct.unpack(">I", payload[123:127])[0],
                "rtcm_injected_frames_total": struct.unpack(">I", payload[127:131])[0],
                "rtcm_rejected_fragments_total": struct.unpack(">H", payload[131:133])[0],
                "rtcm_crc_errors_total": struct.unpack(">H", payload[133:135])[0],
                "rtcm_queue_drops_total": struct.unpack(">H", payload[135:137])[0],
                "rtcm_uart_errors_total": struct.unpack(">H", payload[137:139])[0],
            }
        )
        for name, start in (
            ("rtcm_last_fragment_age_ms", 107),
            ("rtcm_last_completed_frame_age_ms", 111),
            ("rtcm_last_action_age_ms", 115),
        ):
            age = struct.unpack(">I", payload[start : start + 4])[0]
            if age != V4_AGE_UNAVAILABLE:
                metrics[name] = age

    trigger = {1: "periodic", 2: "manual_collect", 3: "scheduler_poll"}.get(payload[5], "unknown")
    battery_quality_code = payload[23]
    battery_quality = {
        0: "unavailable",
        1: "default-calibration",
        2: "field-calibrated",
    }.get(battery_quality_code, "unknown")
    simulated = bool(status_flags & COMPACT_STATUS_FIELD_SENSORS_SIMULATED)
    coordinate_frame = {1: "CGCS2000", 2: "WGS84"}.get(coordinate_frame_code, "unknown")
    fix_type = {0: "invalid", 1: "single", 2: "dgps", 4: "rtk_fixed", 5: "rtk_float"}.get(
        gga_quality, "other"
    )
    valid_flags = {
        "temp_ok": 0,
        "imu_ok": 0,
        "gps_ok": int(gnss_status_valid),
        "soil_ok": int(bool(valid & V3_VALID_SOIL)),
        "soil_ec_ok": int(bool(valid & V3_VALID_SOIL_EC)),
        "tilt_ok": int(bool(valid & V3_VALID_TILT)),
        "rain_ok": 0,
        "battery_ok": int(bool(valid & V3_VALID_BATTERY)),
    }
    return {
        "schema_version": 1,
        "device_id": NODES[label],
        "event_ts": None,
        "seq": struct.unpack(">I", payload[8:12])[0],
        "metrics": metrics,
        "meta": {
            "install_label": f"FIELD-NODE-{label}",
            "legacy_node": label,
            "uptime_s": struct.unpack(">I", payload[12:16])[0],
            "last_command_tag": struct.unpack(">I", payload[16:20])[0],
            "upload_trigger": trigger,
            "compact_payload_version": compact_version,
            "field_sensor_source": "simulated" if simulated else "hardware",
            "gnss_source": "simulated" if gnss_simulated else "hardware",
            "battery_estimate_quality": battery_quality,
            "battery_estimate_quality_code": battery_quality_code,
            "legacy_valid_flags": valid_flags,
            "v3_valid_flags": valid,
            "rtk_coordinate_frame": coordinate_frame,
            "rtk_coordinate_frame_code": coordinate_frame_code,
            "rtk_fix_type": fix_type,
            "rtk_fix_flags": fix_flags,
            "rtk_displacement_eligible": not gnss_simulated and trusted and coordinate_frame_code != 0,
            **(
                {
                    "v4_valid_flags": valid,
                    "rtcm_injection_mode": {0: "disabled", 1: "probe", 2: "live"}[rtcm_mode],
                    "rtcm_state_flags": rtcm_state_flags,
                }
                if compact_version == 4
                else {}
            ),
        },
    }


def telemetry_profile_errors(
    telemetry: dict[str, Any],
    required_compact_version: int = 0,
    required_field_sensor_source: str = "any",
    required_gnss_source: str = "any",
    require_battery_valid: bool = False,
    require_field_sensors_valid: bool = False,
    require_field_calibrated_battery: bool = False,
    required_rtcm_mode: str = "any",
    require_rtcm_clean: bool = False,
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

    gnss_source = meta.get("gnss_source", "unknown")
    if required_gnss_source != "any" and gnss_source != required_gnss_source:
        errors.append(f"gnss-source-{gnss_source}-expected-{required_gnss_source}")
    if gnss_source == "simulated":
        if metrics.get("rtk_trusted") is not False:
            errors.append("simulated-gnss-trusted-state-invalid")
        if meta.get("rtk_displacement_eligible") is not False:
            errors.append("simulated-gnss-displacement-eligibility-invalid")

    valid_flags = meta.get("legacy_valid_flags")
    if not isinstance(valid_flags, dict):
        errors.append("valid-flags-missing")
        return errors

    if require_field_sensors_valid:
        for key in ("soil_ok", "soil_ec_ok", "tilt_ok"):
            if valid_flags.get(key) != 1:
                errors.append(f"{key}-not-valid")
        field_ranges = {
            "soil_temperature_c": (-50.0, 125.0),
            "soil_moisture_pct": (0.0, 100.0),
            "electrical_conductivity_us_cm": (0.0, 65534.0),
            "tilt_x_deg": (-180.0, 180.0),
            "tilt_y_deg": (-180.0, 180.0),
            "tilt_z_deg": (-180.0, 180.0),
        }
        for key, (minimum, maximum) in field_ranges.items():
            value = metrics.get(key)
            if not isinstance(value, (int, float)) or not minimum <= float(value) <= maximum:
                errors.append(f"{key}-out-of-range")

    if require_battery_valid:
        battery_v = metrics.get("battery_v")
        battery_pct = metrics.get("battery_pct")
        if valid_flags.get("battery_ok") != 1:
            errors.append("battery-not-valid")
        elif not isinstance(battery_v, (int, float)) or not 8.0 <= float(battery_v) <= 13.5:
            errors.append("battery-voltage-out-of-range")
        elif not isinstance(battery_pct, (int, float)) or not 0 <= float(battery_pct) <= 100:
            errors.append("battery-percent-out-of-range")
    if require_field_calibrated_battery and meta.get("battery_estimate_quality") != "field-calibrated":
        errors.append("battery-estimate-not-field-calibrated")

    rtcm_mode = meta.get("rtcm_injection_mode", "unavailable")
    if required_rtcm_mode != "any" and rtcm_mode != required_rtcm_mode:
        errors.append(f"rtcm-mode-{rtcm_mode}-expected-{required_rtcm_mode}")
    if require_rtcm_clean:
        if compact_version != 4:
            errors.append("rtcm-evidence-requires-compact-v4")
        else:
            if required_rtcm_mode == "disabled" and meta.get("rtcm_state_flags") != V4_RTCM_STATE_READY:
                errors.append("rtcm-disabled-state-not-ready-only")
            for key in (
                "rtcm_queue_high_watermark",
                "rtcm_accepted_fragments_total",
                "rtcm_completed_frames_total",
                "rtcm_injected_frames_total",
                "rtcm_rejected_fragments_total",
                "rtcm_crc_errors_total",
                "rtcm_queue_drops_total",
                "rtcm_uart_errors_total",
            ):
                if metrics.get(key) != 0:
                    errors.append(f"{key}-not-zero")
            for key in (
                "rtcm_last_fragment_age_ms",
                "rtcm_last_completed_frame_age_ms",
                "rtcm_last_action_age_ms",
            ):
                if key in metrics:
                    errors.append(f"{key}-unexpected")
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
    broadcast_retry_rate: float = 0.0,
    max_broadcast_retry_rate: float = 1.0,
    max_logical_response_latency_ms: float = 5000.0,
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
        and broadcast_retry_rate <= max_broadcast_retry_rate
        and all(
            result["expected"] > 0
            and result["matched"] > 0
            and result["sequence"]["nonUnitGaps"] == 0
            and result["arrivalIntervalMs"]["p95"] is not None
            and result["arrivalIntervalMs"]["p95"] <= max_p95_interval_ms
            and result["commandToTelemetryLatencyMs"]["max"] is not None
            and result["commandToTelemetryLatencyMs"]["max"] <= max_command_latency_ms
            and result.get(
                "logicalCommandToTelemetryLatencyMs",
                result["commandToTelemetryLatencyMs"],
            )["max"]
            is not None
            and result.get(
                "logicalCommandToTelemetryLatencyMs",
                result["commandToTelemetryLatencyMs"],
            )["max"]
            <= max_logical_response_latency_ms
            for result in node_results.values()
        )
    )


def analyze_batch_completeness(
    send_records: dict[str, dict[str, Any]],
    received_command_ids: set[str],
) -> dict[str, Any]:
    batches: dict[int, dict[str, int]] = defaultdict(lambda: {"expected": 0, "matched": 0})
    for command_id, record in send_records.items():
        batch = int(record["batch"])
        batches[batch]["expected"] += 1
        if command_id in received_command_ids:
            batches[batch]["matched"] += 1

    ordered = [
        {"batch": batch, **batches[batch]}
        for batch in sorted(batches)
    ]
    complete_batches = sum(row["matched"] == row["expected"] for row in ordered)
    partial_batches = sum(0 < row["matched"] < row["expected"] for row in ordered)
    empty_batches = sum(row["matched"] == 0 for row in ordered)

    longest_empty_streak = 0
    current_empty_streak = 0
    for row in ordered:
        if row["matched"] == 0:
            current_empty_streak += 1
            longest_empty_streak = max(longest_empty_streak, current_empty_streak)
        else:
            current_empty_streak = 0

    trailing_empty_batches = 0
    for row in reversed(ordered):
        if row["matched"] != 0:
            break
        trailing_empty_batches += 1

    rows_before_trailing_silence = (
        ordered[:-trailing_empty_batches] if trailing_empty_batches else ordered
    )
    complete_before_trailing_silence = sum(
        row["matched"] == row["expected"] for row in rows_before_trailing_silence
    )
    simultaneous_silence_after_healthy_traffic = (
        trailing_empty_batches >= 3 and complete_before_trailing_silence >= 3
    )

    return {
        "completeBatches": complete_batches,
        "partialBatches": partial_batches,
        "emptyBatches": empty_batches,
        "longestConsecutiveEmptyBatches": longest_empty_streak,
        "trailingConsecutiveEmptyBatches": trailing_empty_batches,
        "lastCompleteBatch": max(
            (row["batch"] for row in ordered if row["matched"] == row["expected"]),
            default=None,
        ),
        "lastMatchedBatch": max(
            (row["batch"] for row in ordered if row["matched"] > 0),
            default=None,
        ),
        "simultaneousSilenceAfterHealthyTraffic": simultaneous_silence_after_healthy_traffic,
    }


def run_experiment(args: argparse.Namespace) -> dict[str, Any]:
    started_at = utc_now()
    started_mono = time.monotonic()
    send_records: dict[str, dict[str, Any]] = {}
    send_records_by_tag: dict[tuple[int, str], dict[str, Any]] = {}
    received_command_ids: set[str] = set()
    redundant_retry_command_ids: set[str] = set()
    arrivals_by_node: dict[str, list[float]] = defaultdict(list)
    latencies_by_node: dict[str, list[float]] = defaultdict(list)
    logical_latencies_by_node: dict[str, list[float]] = defaultdict(list)
    seq_by_node: dict[str, list[int]] = defaultdict(list)
    compact_versions_by_node: dict[str, Counter[int]] = defaultdict(Counter)
    field_sources_by_node: dict[str, Counter[str]] = defaultdict(Counter)
    profile_violations_by_node: dict[str, Counter[str]] = defaultdict(Counter)
    battery_voltages_by_node: dict[str, list[float]] = defaultdict(list)
    matched_after_retry_dispatch_by_node: Counter[str] = Counter()
    last_telemetry_by_node: dict[str, dict[str, Any]] = {}
    errors: Counter[str] = Counter()
    error_samples: list[dict[str, Any]] = []
    unmatched_samples: list[dict[str, Any]] = []
    duplicate_samples: list[dict[str, Any]] = []
    post_retry_match_samples: list[dict[str, Any]] = []
    redundant_retry_samples: list[dict[str, Any]] = []
    ack_samples: list[dict[str, Any]] = []
    valid_frame_types: Counter[str] = Counter()
    unmatched_telemetry = 0
    duplicate_telemetry = 0
    redundant_retry_telemetry = 0
    broadcast_retry_commands = 0
    broadcast_retry_rounds = 0
    broadcast_retry_bytes = 0
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
        nonlocal bytes_read, unmatched_telemetry, duplicate_telemetry, redundant_retry_telemetry

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
                if len(payload) >= 3 and payload[:2] == b"LS" and payload[2] in COMPACT_PAYLOAD_BYTES_BY_VERSION:
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
                required_gnss_source=args.required_gnss_source,
                require_battery_valid=args.require_battery_valid,
                require_field_sensors_valid=args.require_field_sensors_valid,
                require_field_calibrated_battery=args.require_field_calibrated_battery,
                required_rtcm_mode=args.required_rtcm_mode,
                require_rtcm_clean=args.require_rtcm_clean,
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
                repeated_classification = classify_repeated_broadcast_telemetry(
                    int(send_record.get("attempts", 1)),
                    command_id in redundant_retry_command_ids,
                )
                if repeated_classification == "redundant-retry":
                    redundant_retry_command_ids.add(command_id)
                    redundant_retry_telemetry += 1
                    if len(redundant_retry_samples) < 50:
                        redundant_retry_samples.append(
                            {
                                "at": utc_now(),
                                "elapsedMs": round((received_mono - started_mono) * 1000.0, 1),
                                "node": label,
                                "sequence": seq,
                                "commandTag": last_command_tag,
                                "batch": send_record["batch"],
                                "attempts": send_record["attempts"],
                            }
                        )
                    continue
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
            latency_ms = (received_mono - float(send_record["lastAttemptSentMono"])) * 1000.0
            latencies_by_node[label].append(latency_ms)
            logical_latency_ms = (received_mono - float(send_record["sentMono"])) * 1000.0
            logical_latencies_by_node[label].append(logical_latency_ms)
            if int(send_record.get("attempts", 1)) > 1:
                matched_after_retry_dispatch_by_node[label] += 1
                if len(post_retry_match_samples) < 50:
                    post_retry_match_samples.append(
                        {
                            "at": utc_now(),
                            "elapsedMs": round((received_mono - started_mono) * 1000.0, 1),
                            "node": label,
                            "sequence": seq,
                            "commandTag": last_command_tag,
                            "batch": send_record["batch"],
                            "attempts": send_record["attempts"],
                            "attemptLatencyMs": round(latency_ms, 1),
                            "logicalLatencyMs": round(logical_latency_ms, 1),
                        }
                    )

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
                    batch_record_ids: list[str] = []
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
                            "lastAttemptSentMono": sent_mono,
                            "attempts": 1,
                        }
                        send_records[record_id] = send_record
                        send_records_by_tag[(tag, label)] = send_record
                        batch_record_ids.append(record_id)
                    write_chunked(fd, frame, args.command_chunk_bytes, args.command_chunk_delay_ms)
                    bytes_written += len(frame)
                    if args.broadcast_response_timeout_ms > 0:
                        response_deadline = time.monotonic() + args.broadcast_response_timeout_ms / 1000.0
                        while (
                            not all(record_id in received_command_ids for record_id in batch_record_ids)
                            and time.monotonic() < response_deadline
                        ):
                            receive_once(fd, min(0.05, response_deadline - time.monotonic()))
                        retries_used = 0
                        while (
                            should_retry_broadcast_poll(
                                sum(
                                    record_id in received_command_ids
                                    for record_id in batch_record_ids
                                ),
                                len(batch_record_ids),
                                retries_used,
                                args.broadcast_partial_retries,
                            )
                        ):
                            retries_used += 1
                            broadcast_retry_commands += 1
                            if retries_used == 1:
                                broadcast_retry_rounds += 1
                            retry_sent_mono = time.monotonic()
                            for record_id in batch_record_ids:
                                send_records[record_id]["attempts"] = retries_used + 1
                                send_records[record_id]["lastAttemptSentMono"] = retry_sent_mono
                            retry_frame = encode_frame(
                                FIELD_LINK_TYPE_COMMAND,
                                serial_sequence,
                                poll_command.encode("ascii"),
                            )
                            serial_sequence = (serial_sequence + 1) & 0xFFFFFFFF
                            write_chunked(
                                fd,
                                retry_frame,
                                args.command_chunk_bytes,
                                args.command_chunk_delay_ms,
                            )
                            bytes_written += len(retry_frame)
                            broadcast_retry_bytes += len(retry_frame)
                            response_deadline = (
                                time.monotonic() + args.broadcast_response_timeout_ms / 1000.0
                            )
                            while (
                                not all(record_id in received_command_ids for record_id in batch_record_ids)
                                and time.monotonic() < response_deadline
                            ):
                                receive_once(fd, min(0.05, response_deadline - time.monotonic()))
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
                            "lastAttemptSentMono": sent_mono,
                            "attempts": 1,
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
                if args.broadcast_poll and args.broadcast_response_timeout_ms > 0:
                    next_batch_at = time.monotonic() + args.batch_interval_ms / 1000.0
                else:
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
        logical_latencies = logical_latencies_by_node[label]
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
        latest_metrics = latest_metrics if isinstance(latest_metrics, dict) else {}
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
            "logicalCommandToTelemetryLatencyMs": {
                "p50": percentile(logical_latencies, 0.50),
                "p95": percentile(logical_latencies, 0.95),
                "max": round(max(logical_latencies), 1) if logical_latencies else None,
            },
            "matchedAfterBroadcastRetryDispatch": matched_after_retry_dispatch_by_node[label],
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
                "voltageMedian": (
                    round(statistics.median(battery_voltages), 3) if battery_voltages else None
                ),
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
            "latestFieldSnapshot": {
                key: latest_metrics.get(key)
                for key in (
                    "soil_temperature_c",
                    "soil_moisture_pct",
                    "electrical_conductivity_us_cm",
                    "tilt_x_deg",
                    "tilt_y_deg",
                    "tilt_z_deg",
                )
            },
            "latestGnssHealth": {
                key: latest_metrics.get(key)
                for key in (
                    "rtk_gga_quality",
                    "rtk_trusted",
                    "rtk_satellites_used",
                    "rtk_hdop",
                    "rtk_correction_age_ms",
                    "rtk_solution_age_ms",
                    "rtk_fixed_streak_s",
                    "rtk_fixed_ratio_1m_pct",
                    "rtk_fix_drop_count",
                    "rtk_reference_station_id",
                )
            },
            "latestRtcmHealth": {
                "mode": latest_meta.get("rtcm_injection_mode") if isinstance(latest_meta, dict) else None,
                **{
                    key: latest_metrics.get(key)
                    for key in (
                        "rtcm_session_epoch",
                        "rtcm_lease_remaining_ms",
                        "rtcm_queue_pending",
                        "rtcm_queue_high_watermark",
                        "rtcm_accepted_fragments_total",
                        "rtcm_completed_frames_total",
                        "rtcm_injected_frames_total",
                        "rtcm_rejected_fragments_total",
                        "rtcm_crc_errors_total",
                        "rtcm_queue_drops_total",
                        "rtcm_uart_errors_total",
                    )
                },
            },
        }

    expected_total = len(send_records)
    matched_total = len(received_command_ids)
    matched_rate = matched_total / expected_total if expected_total else 0.0
    broadcast_retry_rate = broadcast_retry_rounds / batches_sent if batches_sent else 0.0
    error_count = sum(errors.values())
    profile_violation_count = sum(
        sum(violations.values()) for violations in profile_violations_by_node.values()
    )
    batch_completeness = analyze_batch_completeness(send_records, received_command_ids)
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
        broadcast_retry_rate=broadcast_retry_rate,
        max_broadcast_retry_rate=args.max_broadcast_retry_rate,
        max_logical_response_latency_ms=args.max_logical_response_latency_ms,
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
            "broadcastResponseTimeoutMs": args.broadcast_response_timeout_ms,
            "broadcastPartialRetries": args.broadcast_partial_retries,
            "maxBroadcastRetryRate": args.max_broadcast_retry_rate,
            "maxLogicalResponseLatencyMs": args.max_logical_response_latency_ms,
            "commandChunkBytes": args.command_chunk_bytes,
            "commandChunkDelayMs": args.command_chunk_delay_ms,
            "drainSeconds": args.drain_seconds,
            "nodeOrderPolicy": "fixed-A-B-C-slots" if args.broadcast_poll else "rotating-A-B-C",
            "requiredCompactVersion": args.required_compact_version,
            "requiredFieldSensorSource": args.required_field_sensor_source,
            "requiredGnssSource": args.required_gnss_source,
            "requireBatteryValid": args.require_battery_valid,
            "requireFieldSensorsValid": args.require_field_sensors_valid,
            "requireFieldCalibratedBattery": args.require_field_calibrated_battery,
            "requiredRtcmMode": args.required_rtcm_mode,
            "requireRtcmClean": args.require_rtcm_clean,
            "maxP95IntervalMs": args.max_p95_interval_ms,
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
            "broadcastRetryCommands": broadcast_retry_commands,
            "broadcastRetryRounds": broadcast_retry_rounds,
            "broadcastRetryRate": round(broadcast_retry_rate, 6),
            "broadcastRetryBytes": broadcast_retry_bytes,
            "broadcastMatchedAfterRetryDispatch": sum(
                matched_after_retry_dispatch_by_node.values()
            ),
            "redundantRetryTelemetry": redundant_retry_telemetry,
            "batchCompleteness": batch_completeness,
        },
        "nodes": node_results,
        "validFrameTypes": dict(valid_frame_types),
        "errors": dict(errors),
        "errorSamples": error_samples,
        "unmatchedSamples": unmatched_samples,
        "duplicateSamples": duplicate_samples,
        "postRetryMatchSamples": post_retry_match_samples,
        "redundantRetrySamples": redundant_retry_samples,
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
    parser.add_argument("--broadcast-response-timeout-ms", type=int, default=0)
    parser.add_argument("--broadcast-partial-retries", type=int, default=0)
    parser.add_argument("--max-broadcast-retry-rate", type=float, default=1.0)
    parser.add_argument("--max-logical-response-latency-ms", type=float, default=5000.0)
    parser.add_argument("--command-chunk-bytes", type=int, default=32)
    parser.add_argument("--command-chunk-delay-ms", type=int, default=15)
    parser.add_argument("--settle-ms", type=int, default=2000)
    parser.add_argument("--settle-quiet-ms", type=int, default=0)
    parser.add_argument("--warmup-seconds", type=float, default=0.0)
    parser.add_argument("--drain-seconds", type=float, default=5.0)
    parser.add_argument("--service", default="lsmv2-field-gateway.service")
    parser.add_argument(
        "--runtime-mask-service",
        action="store_true",
        help="deprecated compatibility flag; an effective runtime service hold is now always used",
    )
    parser.add_argument("--report-path", default="")
    parser.add_argument("--required-match-rate", type=float, default=1.0)
    parser.add_argument("--max-p95-interval-ms", type=float, default=1500.0)
    parser.add_argument("--max-command-latency-ms", type=float, default=950.0)
    parser.add_argument("--required-compact-version", type=int, choices=(0, 1, 2, 3, 4), default=0)
    parser.add_argument(
        "--required-field-sensor-source",
        choices=("any", "simulated", "hardware"),
        default="any",
    )
    parser.add_argument(
        "--required-gnss-source",
        choices=("any", "simulated", "hardware"),
        default="any",
    )
    parser.add_argument("--require-battery-valid", action="store_true")
    parser.add_argument("--require-field-sensors-valid", action="store_true")
    parser.add_argument("--require-field-calibrated-battery", action="store_true")
    parser.add_argument(
        "--required-rtcm-mode",
        choices=("any", "disabled", "probe", "live"),
        default="any",
    )
    parser.add_argument("--require-rtcm-clean", action="store_true")
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
    if args.broadcast_response_timeout_ms < 0:
        parser.error("--broadcast-response-timeout-ms must be non-negative")
    if args.broadcast_response_timeout_ms > 0 and not args.broadcast_poll:
        parser.error("--broadcast-response-timeout-ms requires --broadcast-poll")
    if args.broadcast_partial_retries not in (0, 1):
        parser.error("--broadcast-partial-retries must be 0 or 1")
    if args.broadcast_partial_retries > 0 and (
        not args.broadcast_poll or args.broadcast_response_timeout_ms <= 0
    ):
        parser.error(
            "--broadcast-partial-retries requires --broadcast-poll and a positive response timeout"
        )
    if not 0.0 <= args.max_broadcast_retry_rate <= 1.0:
        parser.error("--max-broadcast-retry-rate must be between 0 and 1")
    if args.max_logical_response_latency_ms <= 0:
        parser.error("--max-logical-response-latency-ms must be positive")
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
    service_hold_path: Path | None = None
    service_hold_candidate: Path | None = None
    service_hold_preexisting = False
    recovery: dict[str, Any] = {
        "serviceWasActive": service_was_active,
        "serviceRuntimeMasked": False,
        "serviceRuntimeHeld": False,
        "serviceRestored": not service_was_active,
    }
    report: dict[str, Any]

    def interrupt_handler(signum: int, _frame: Any) -> None:
        raise InterruptedError(f"received signal {signum}")

    signal.signal(signal.SIGINT, interrupt_handler)
    signal.signal(signal.SIGTERM, interrupt_handler)

    try:
        service_hold_candidate = runtime_service_hold_path(args.service)
        service_hold_preexisting = service_hold_candidate.exists()
        if service_hold_preexisting:
            raise RuntimeError(f"runtime service hold already exists: {service_hold_candidate}")
        if service_was_active:
            service_hold_path = install_runtime_service_hold(args.service)
            recovery["serviceRuntimeHeld"] = True
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
            hold_to_remove = service_hold_path
            if (
                hold_to_remove is None
                and not service_hold_preexisting
                and service_hold_candidate is not None
                and service_hold_candidate.exists()
            ):
                hold_to_remove = service_hold_candidate
            if hold_to_remove is not None:
                try:
                    remove_runtime_service_hold(args.service, hold_to_remove)
                except Exception as exc:
                    restore_errors.append(f"runtime hold removal failed: {exc}")
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
