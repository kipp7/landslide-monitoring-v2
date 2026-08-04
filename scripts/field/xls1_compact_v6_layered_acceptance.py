#!/usr/bin/env python3
"""Run fail-closed Compact V6 layered field-link acceptance."""

from __future__ import annotations

import argparse
import json
import math
import os
import select
import signal
import statistics
import time
import uuid
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

from xls1_compact_v4_acceptance import (
    parse_durations,
    require_ntrip_disabled,
    sha256_file,
    validate_prerequisites,
    wait_for_service,
    write_json_atomic,
)
from xls1_three_node_batch_poll import (
    FIELD_LINK_TYPE_ACK,
    FIELD_LINK_TYPE_COMMAND,
    FIELD_LINK_TYPE_TELEMETRY,
    NODES,
    command_tag,
    configure_serial,
    decode_compact_telemetry,
    decode_frame,
    encode_frame,
    install_runtime_service_hold,
    node_label,
    remove_runtime_service_hold,
    runtime_service_hold_path,
    service_is_active,
    set_service_state,
    utc_now,
    write_chunked,
)


V6_WIRE_BYTES = 64
V6_CORE_VALID_TILT = 1 << 0
V6_ENV_VALID_BATTERY = 1 << 0
V6_ENV_VALID_SOIL = 1 << 1
V6_ENV_VALID_SOIL_EC = 1 << 2
V6_RTCM_READY = 1 << 0


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, math.ceil(len(ordered) * fraction) - 1))
    return round(ordered[index], 1)


def build_layered_poll(scope: str, label: str | None = None) -> str:
    nonce = uuid.uuid4().hex[:8].upper()
    if scope == "core":
        if label is None:
            return f"P1{nonce}"
        if label not in NODES:
            raise ValueError("targeted core poll requires node A/B/C")
        return f"P2{label}{nonce}"
    if scope not in ("environment", "audit") or label not in NODES:
        raise ValueError("layered extensions require environment/audit and node A/B/C")
    return f"P{'3' if scope == 'environment' else '4'}{label}{nonce}"


def layered_extension_scope(core_round: int, environment_every: int, audit_every: int) -> str | None:
    if core_round <= 0 or environment_every <= 0 or audit_every <= 0:
        raise ValueError("layered round intervals must be positive")
    if core_round % audit_every == 0:
        return "audit"
    if core_round % environment_every == 0:
        return "environment"
    return None


def sequence_summary(values: list[int]) -> dict[str, Any]:
    non_unit_gaps = 0
    non_forward = 0
    for previous, current in zip(values, values[1:]):
        delta = (current - previous) & 0xFFFFFFFF
        if delta == 0 or delta > 0x7FFFFFFF:
            non_forward += 1
        elif delta != 1:
            non_unit_gaps += 1
    return {
        "first": values[0] if values else None,
        "last": values[-1] if values else None,
        "samples": len(values),
        "nonUnitGaps": non_unit_gaps,
        "nonForward": non_forward,
    }


def validate_scope_profile(telemetry: dict[str, Any], required_gnss_source: str) -> list[str]:
    meta = telemetry.get("meta")
    metrics = telemetry.get("metrics")
    if not isinstance(meta, dict) or not isinstance(metrics, dict):
        return ["telemetry-shape-invalid"]
    errors: list[str] = []
    scope = meta.get("compact_scope")
    valid = meta.get("v6_valid_flags")
    if meta.get("compact_payload_version") != 6:
        errors.append("compact-version-not-v6")
    if meta.get("field_sensor_source") != "hardware":
        errors.append("field-sensor-source-not-hardware")
    if meta.get("gnss_source") != required_gnss_source:
        errors.append(f"gnss-source-{meta.get('gnss_source')}-expected-{required_gnss_source}")
    if not isinstance(valid, int):
        return errors + ["v6-valid-flags-missing"]

    if scope == "core":
        if valid & V6_CORE_VALID_TILT == 0:
            errors.append("tilt-not-valid")
        for key in ("tilt_x_deg", "tilt_y_deg", "tilt_z_deg"):
            value = metrics.get(key)
            if not isinstance(value, (int, float)) or not -180.0 <= float(value) <= 180.0:
                errors.append(f"{key}-out-of-range")
        if required_gnss_source == "simulated":
            if metrics.get("rtk_trusted") is not False:
                errors.append("simulated-gnss-trusted-state-invalid")
            if meta.get("rtk_displacement_eligible") is not False:
                errors.append("simulated-gnss-displacement-eligibility-invalid")
    elif scope == "environment":
        required = V6_ENV_VALID_BATTERY | V6_ENV_VALID_SOIL | V6_ENV_VALID_SOIL_EC
        if valid & required != required:
            errors.append("environment-field-validity-incomplete")
        battery_v = metrics.get("battery_v")
        battery_pct = metrics.get("battery_pct")
        if not isinstance(battery_v, (int, float)) or not 8.0 <= float(battery_v) <= 13.5:
            errors.append("battery-voltage-out-of-range")
        if not isinstance(battery_pct, (int, float)) or not 0 <= float(battery_pct) <= 100:
            errors.append("battery-percent-out-of-range")
        if meta.get("battery_estimate_quality_code") != 2:
            errors.append("battery-estimate-not-field-calibrated")
        ranges = {
            "soil_temperature_c": (-50.0, 125.0),
            "soil_moisture_pct": (0.0, 100.0),
            "electrical_conductivity_us_cm": (0.0, 65534.0),
        }
        for key, (minimum, maximum) in ranges.items():
            value = metrics.get(key)
            if not isinstance(value, (int, float)) or not minimum <= float(value) <= maximum:
                errors.append(f"{key}-out-of-range")
    elif scope == "audit":
        if meta.get("rtcm_injection_mode") != "disabled":
            errors.append("rtcm-mode-not-disabled")
        if meta.get("rtcm_state_flags") != V6_RTCM_READY:
            errors.append("rtcm-disabled-state-not-ready-only")
        for key in (
            "rtcm_session_epoch",
            "rtcm_lease_remaining_ms",
            "rtcm_queue_pending",
            "rtcm_queue_high_watermark",
            "rtcm_injected_frames_total",
            "rtcm_error_summary_flags",
        ):
            if metrics.get(key) != 0:
                errors.append(f"{key}-not-zero")
        if "rtcm_last_completed_frame_age_ms" in metrics:
            errors.append("rtcm-last-completed-age-unexpected")
    else:
        errors.append("compact-scope-invalid")
    return errors


def evaluate_layered_gate(report: dict[str, Any], max_p95_interval_ms: float, max_latency_ms: float) -> bool:
    result = report["result"]
    nodes = report["nodes"]
    extensions = report["extensions"]
    return (
        set(nodes) == set(NODES)
        and result["completeCoreRounds"] == result["coreRoundsSent"]
        and result["decodeErrors"] == 0
        and result["wireLengthViolations"] == 0
        and result["unmatchedTelemetry"] == 0
        and result["duplicateTelemetry"] == 0
        and result["scopeMismatches"] == 0
        and result["extensionEpochMismatches"] == 0
        and result["profileViolations"] == 0
        and result["trailingUndelimitedBytes"] == 0
        and extensions["environment"]["expected"] > 0
        and extensions["environment"]["matched"] == extensions["environment"]["expected"]
        and extensions["audit"]["expected"] > 0
        and extensions["audit"]["matched"] == extensions["audit"]["expected"]
        and all(
            node["coreExpected"] > 0
            and node["coreMatched"] == node["coreExpected"]
            and node["allScopeSequence"]["nonUnitGaps"] == 0
            and node["allScopeSequence"]["nonForward"] == 0
            and node["coreArrivalIntervalMs"]["p95"] is not None
            and node["coreArrivalIntervalMs"]["p95"] <= max_p95_interval_ms
            and node["commandToTelemetryLatencyMs"]["max"] is not None
            and node["commandToTelemetryLatencyMs"]["max"] <= max_latency_ms
            for node in nodes.values()
        )
    )


def run_layered_experiment(args: argparse.Namespace) -> dict[str, Any]:
    started_at = utc_now()
    started_mono = time.monotonic()
    records_by_tag: dict[tuple[int, str], dict[str, Any]] = {}
    records: list[dict[str, Any]] = []
    core_arrivals: dict[str, list[float]] = defaultdict(list)
    all_sequences: dict[str, list[int]] = defaultdict(list)
    core_sequences: dict[str, list[int]] = defaultdict(list)
    latest_core_epoch: dict[str, int] = {}
    errors: Counter[str] = Counter()
    profile_violations: Counter[str] = Counter()
    samples: list[dict[str, Any]] = []
    receive_buffer = bytearray()
    serial_sequence = 0
    bytes_read = 0
    bytes_written = 0
    wire_length_violations = 0
    unmatched = 0
    duplicates = 0
    scope_mismatches = 0
    epoch_mismatches = 0
    core_rounds_sent = 0
    targeted_recovery_commands = 0
    extension_cursor = 0

    def add_sample(kind: str, **values: Any) -> None:
        if len(samples) < 100:
            samples.append({"at": utc_now(), "kind": kind, **values})

    def receive_once(fd: int, timeout: float) -> None:
        nonlocal bytes_read, wire_length_violations, unmatched, duplicates, scope_mismatches, epoch_mismatches
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
            frame_bytes = len(encoded) + 1
            try:
                frame_type, _, payload = decode_frame(encoded)
            except Exception as exc:
                errors[str(exc)] += 1
                add_sample("decode-error", reason=str(exc), frameBytes=frame_bytes)
                continue
            if frame_type == FIELD_LINK_TYPE_ACK:
                continue
            if frame_type != FIELD_LINK_TYPE_TELEMETRY:
                errors[f"unexpected-frame-type-{frame_type}"] += 1
                continue
            if frame_bytes != V6_WIRE_BYTES:
                wire_length_violations += 1
                add_sample("wire-length", frameBytes=frame_bytes)
            try:
                telemetry = decode_compact_telemetry(payload)
            except Exception as exc:
                errors[f"telemetry decode failed: {exc}"] += 1
                add_sample("telemetry-decode-error", reason=str(exc), frameBytes=frame_bytes)
                continue
            meta = telemetry.get("meta")
            label = node_label(str(telemetry.get("device_id")))
            if label is None or not isinstance(meta, dict):
                unmatched += 1
                add_sample("unknown-node")
                continue
            tag = meta.get("last_command_tag")
            scope = meta.get("compact_scope")
            record = records_by_tag.get((tag, label)) if isinstance(tag, int) else None
            if record is None:
                unmatched += 1
                add_sample("unmatched", node=label, commandTag=tag, scope=scope)
                continue
            if record["matched"]:
                duplicates += 1
                add_sample("duplicate", node=label, commandTag=tag, scope=scope)
                continue
            if scope != record["scope"]:
                scope_mismatches += 1
                add_sample("scope-mismatch", node=label, expected=record["scope"], actual=scope)
                continue

            received_mono = time.monotonic()
            record["matched"] = True
            record["receivedMono"] = received_mono
            record["sampleEpoch"] = meta.get("sample_epoch")
            latency_ms = (received_mono - record["sentMono"]) * 1000.0
            sequence = telemetry.get("seq")
            if isinstance(sequence, int):
                all_sequences[label].append(sequence)
                if scope == "core":
                    core_sequences[label].append(sequence)
            if scope == "core":
                core_arrivals[label].append(received_mono)
                if isinstance(meta.get("sample_epoch"), int):
                    latest_core_epoch[label] = meta["sample_epoch"]
            else:
                expected_epoch = latest_core_epoch.get(label)
                if expected_epoch is None or meta.get("sample_epoch") != expected_epoch:
                    epoch_mismatches += 1
                    add_sample(
                        "extension-epoch-mismatch",
                        node=label,
                        scope=scope,
                        coreEpoch=expected_epoch,
                        extensionEpoch=meta.get("sample_epoch"),
                    )
            for violation in validate_scope_profile(telemetry, args.required_gnss_source):
                profile_violations[violation] += 1
                add_sample("profile-violation", node=label, scope=scope, reason=violation)

        if len(receive_buffer) > 65536:
            errors["field-link assembler buffer overflow"] += 1
            receive_buffer.clear()

    def send_poll(fd: int, scope: str, labels: list[str], round_number: int) -> list[dict[str, Any]]:
        nonlocal serial_sequence, bytes_written
        target = labels[0] if len(labels) == 1 else None
        command = build_layered_poll(scope, target)
        tag = command_tag(command)
        while any((tag, label) in records_by_tag for label in labels):
            command = build_layered_poll(scope, target)
            tag = command_tag(command)
        frame = encode_frame(FIELD_LINK_TYPE_COMMAND, serial_sequence, command.encode("ascii"))
        serial_sequence = (serial_sequence + 1) & 0xFFFFFFFF
        sent_mono = time.monotonic()
        created: list[dict[str, Any]] = []
        for label in labels:
            record = {
                "round": round_number,
                "scope": scope,
                "node": label,
                "command": command,
                "commandTag": tag,
                "sentMono": sent_mono,
                "matched": False,
            }
            records.append(record)
            records_by_tag[(tag, label)] = record
            created.append(record)
        write_chunked(fd, frame, args.command_chunk_bytes, args.command_chunk_delay_ms)
        bytes_written += len(frame)
        return created

    def send_targeted_recovery(fd: int, record: dict[str, Any]) -> None:
        nonlocal serial_sequence, bytes_written, targeted_recovery_commands
        command = build_layered_poll("core", record["node"])
        tag = command_tag(command)
        while (tag, record["node"]) in records_by_tag:
            command = build_layered_poll("core", record["node"])
            tag = command_tag(command)
        frame = encode_frame(FIELD_LINK_TYPE_COMMAND, serial_sequence, command.encode("ascii"))
        serial_sequence = (serial_sequence + 1) & 0xFFFFFFFF
        record["command"] = command
        record["commandTag"] = tag
        record["sentMono"] = time.monotonic()
        record["recoveryDispatched"] = True
        records_by_tag[(tag, record["node"])] = record
        write_chunked(fd, frame, args.command_chunk_bytes, args.command_chunk_delay_ms)
        bytes_written += len(frame)
        targeted_recovery_commands += 1

    fd = os.open(args.serial_device, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
    try:
        configure_serial(fd, args.baud)
        settle_started = time.monotonic()
        settle_deadline = settle_started + args.settle_timeout_ms / 1000.0
        quiet_since = settle_started
        while time.monotonic() < settle_deadline:
            readable, _, _ = select.select([fd], [], [], 0.1)
            if readable:
                try:
                    if os.read(fd, 4096):
                        quiet_since = time.monotonic()
                except BlockingIOError:
                    pass
            if time.monotonic() - quiet_since >= args.settle_quiet_ms / 1000.0:
                break
        import termios

        termios.tcflush(fd, termios.TCIOFLUSH)
        send_deadline = time.monotonic() + args.duration_seconds
        while time.monotonic() < send_deadline:
            round_started = time.monotonic()
            core_rounds_sent += 1
            core_records: list[dict[str, Any]] = []
            if args.core_mode == "targeted":
                for label in NODES:
                    node_records = send_poll(fd, "core", [label], core_rounds_sent)
                    core_records.extend(node_records)
                    response_deadline = time.monotonic() + args.core_response_timeout_ms / 1000.0
                    while not node_records[0]["matched"] and time.monotonic() < response_deadline:
                        receive_once(fd, min(0.05, response_deadline - time.monotonic()))
            else:
                core_records = send_poll(fd, "core", list(NODES), core_rounds_sent)
                response_deadline = time.monotonic() + args.core_response_timeout_ms / 1000.0
                while not all(record["matched"] for record in core_records) and time.monotonic() < response_deadline:
                    receive_once(fd, min(0.05, response_deadline - time.monotonic()))
                if args.core_mode == "hybrid":
                    for record in core_records:
                        if record["matched"]:
                            continue
                        send_targeted_recovery(fd, record)
                        recovery_deadline = time.monotonic() + args.core_response_timeout_ms / 1000.0
                        while not record["matched"] and time.monotonic() < recovery_deadline:
                            receive_once(fd, min(0.05, recovery_deadline - time.monotonic()))

            extension_scope = (
                layered_extension_scope(
                    core_rounds_sent,
                    args.environment_every_rounds,
                    args.audit_every_rounds,
                )
                if all(record["matched"] for record in core_records)
                else None
            )
            if extension_scope is not None:
                label = list(NODES)[extension_cursor % len(NODES)]
                extension_cursor += 1
                extension_records = send_poll(fd, extension_scope, [label], core_rounds_sent)
                extension_deadline = time.monotonic() + args.extension_response_timeout_ms / 1000.0
                while not extension_records[0]["matched"] and time.monotonic() < extension_deadline:
                    receive_once(fd, min(0.05, extension_deadline - time.monotonic()))

            next_round = round_started + args.core_interval_ms / 1000.0
            while time.monotonic() < next_round:
                receive_once(fd, min(0.05, next_round - time.monotonic()))

        drain_deadline = time.monotonic() + args.drain_seconds
        while time.monotonic() < drain_deadline:
            receive_once(fd, min(0.05, drain_deadline - time.monotonic()))
    finally:
        os.close(fd)

    core_rounds: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        if record["scope"] == "core":
            core_rounds[record["round"]].append(record)
    complete_core_rounds = sum(
        len(round_records) == len(NODES) and all(record["matched"] for record in round_records)
        for round_records in core_rounds.values()
    )
    nodes: dict[str, Any] = {}
    for label in NODES:
        core_records = [record for record in records if record["scope"] == "core" and record["node"] == label]
        intervals = [
            (current - previous) * 1000.0
            for previous, current in zip(core_arrivals[label], core_arrivals[label][1:])
        ]
        node_latencies = [
            (record["receivedMono"] - record["sentMono"]) * 1000.0
            for record in core_records
            if record["matched"]
        ]
        nodes[label] = {
            "coreExpected": len(core_records),
            "coreMatched": sum(record["matched"] for record in core_records),
            "coreArrivalIntervalMs": {
                "min": round(min(intervals), 1) if intervals else None,
                "mean": round(statistics.fmean(intervals), 1) if intervals else None,
                "p95": percentile(intervals, 0.95),
                "max": round(max(intervals), 1) if intervals else None,
            },
            "commandToTelemetryLatencyMs": {
                "p95": percentile(node_latencies, 0.95),
                "max": round(max(node_latencies), 1) if node_latencies else None,
            },
            "allScopeSequence": sequence_summary(all_sequences[label]),
            "coreSequence": sequence_summary(core_sequences[label]),
        }
    extensions = {}
    for scope in ("environment", "audit"):
        scoped = [record for record in records if record["scope"] == scope]
        scoped_latencies = [
            (record["receivedMono"] - record["sentMono"]) * 1000.0
            for record in scoped
            if record["matched"]
        ]
        extensions[scope] = {
            "expected": len(scoped),
            "matched": sum(record["matched"] for record in scoped),
            "nodes": dict(Counter(record["node"] for record in scoped if record["matched"])),
            "commandToTelemetryLatencyMs": {
                "p95": percentile(scoped_latencies, 0.95),
                "max": round(max(scoped_latencies), 1) if scoped_latencies else None,
            },
        }
    result = {
        "coreRoundsSent": core_rounds_sent,
        "completeCoreRounds": complete_core_rounds,
        "decodeErrors": sum(errors.values()),
        "wireLengthViolations": wire_length_violations,
        "unmatchedTelemetry": unmatched,
        "duplicateTelemetry": duplicates,
        "scopeMismatches": scope_mismatches,
        "extensionEpochMismatches": epoch_mismatches,
        "profileViolations": sum(profile_violations.values()),
        "targetedRecoveryCommands": targeted_recovery_commands,
        "trailingUndelimitedBytes": len(receive_buffer),
    }
    report = {
        "schemaVersion": 1,
        "experiment": "xls1-compact-v6-layered",
        "startedAt": started_at,
        "finishedAt": utc_now(),
        "durationSeconds": args.duration_seconds,
        "configuration": {
            "coreMode": args.core_mode,
            "coreIntervalMs": args.core_interval_ms,
            "coreResponseTimeoutMs": args.core_response_timeout_ms,
            "extensionResponseTimeoutMs": args.extension_response_timeout_ms,
            "environmentEveryRounds": args.environment_every_rounds,
            "auditEveryRounds": args.audit_every_rounds,
            "requiredWireBytes": V6_WIRE_BYTES,
            "requiredGnssSource": args.required_gnss_source,
            "requiredRtcmMode": "disabled",
        },
        "transport": {"bytesRead": bytes_read, "bytesWritten": bytes_written},
        "result": result,
        "nodes": nodes,
        "extensions": extensions,
        "errors": dict(errors),
        "profileViolations": dict(profile_violations),
        "samples": samples,
    }
    result["stableProfile"] = evaluate_layered_gate(
        report,
        args.max_p95_interval_ms,
        args.max_command_latency_ms,
    )
    return report


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial-device", default="/dev/ttyS3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--durations", type=parse_durations, default=parse_durations("60,600,1800"))
    parser.add_argument("--core-mode", choices=("broadcast", "targeted", "hybrid"), default="hybrid")
    parser.add_argument("--core-interval-ms", type=int, default=250)
    parser.add_argument("--core-response-timeout-ms", type=int, default=1500)
    parser.add_argument("--extension-response-timeout-ms", type=int, default=6000)
    parser.add_argument("--environment-every-rounds", type=int, default=30)
    parser.add_argument("--audit-every-rounds", type=int, default=60)
    parser.add_argument("--settle-timeout-ms", type=int, default=30000)
    parser.add_argument("--settle-quiet-ms", type=int, default=5000)
    parser.add_argument("--command-chunk-bytes", type=int, default=64)
    parser.add_argument("--command-chunk-delay-ms", type=int, default=10)
    parser.add_argument("--drain-seconds", type=float, default=3.0)
    parser.add_argument("--max-p95-interval-ms", type=float, default=2500.0)
    parser.add_argument("--max-command-latency-ms", type=float, default=1500.0)
    parser.add_argument("--required-gnss-source", choices=("hardware", "simulated"), default="simulated")
    parser.add_argument("--inter-stage-quiet-seconds", type=float, default=2.0)
    parser.add_argument("--service", default="lsmv2-field-gateway.service")
    parser.add_argument("--environment-file", default="/etc/lsmv2/field-gateway.env")
    parser.add_argument("--output-directory", default="/var/lib/lsmv2/experiments")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check-prerequisites", action="store_true")
    args = parser.parse_args()
    positive = (
        args.baud,
        args.core_interval_ms,
        args.core_response_timeout_ms,
        args.extension_response_timeout_ms,
        args.environment_every_rounds,
        args.audit_every_rounds,
        args.settle_timeout_ms,
        args.settle_quiet_ms,
        args.command_chunk_bytes,
        args.max_p95_interval_ms,
        args.max_command_latency_ms,
    )
    if any(value <= 0 for value in positive) or args.drain_seconds < 0:
        parser.error("timing, cadence, baud and limit values must be positive")
    if args.settle_timeout_ms < args.settle_quiet_ms:
        parser.error("settle timeout must cover settle quiet time")
    if args.audit_every_rounds < 2:
        parser.error("audit cadence must be at least two core rounds")
    if args.dry_run and args.check_prerequisites:
        parser.error("--dry-run and --check-prerequisites are mutually exclusive")
    return args


def stage_args(args: argparse.Namespace, duration: float) -> argparse.Namespace:
    values = vars(args).copy()
    values["duration_seconds"] = duration
    return argparse.Namespace(**values)


def main() -> int:
    args = parse_args()
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_directory = Path(args.output_directory)
    summary_path = output_directory / f"xls1-compact-v6-layered-acceptance-{run_id}.json"
    plan = {
        "pollingMode": "compact-layered-v1",
        "durationsSeconds": args.durations,
        "coreIntervalMs": args.core_interval_ms,
        "coreResponseTimeoutMs": args.core_response_timeout_ms,
        "environmentEveryRounds": args.environment_every_rounds,
        "auditEveryRounds": args.audit_every_rounds,
        "requiredWireBytes": V6_WIRE_BYTES,
        "requiredGnssSource": args.required_gnss_source,
        "requiredNtripEnabled": False,
        "maxP95IntervalMs": args.max_p95_interval_ms,
        "maxCommandLatencyMs": args.max_command_latency_ms,
    }
    if args.dry_run:
        print(json.dumps({"dryRun": True, "plan": plan}, ensure_ascii=True, indent=2))
        return 0

    require_ntrip_disabled(Path(args.environment_file))
    prerequisites = validate_prerequisites(args)
    if args.check_prerequisites:
        print(json.dumps({"prerequisitesPassed": True, **prerequisites}, ensure_ascii=True, indent=2))
        return 0
    service_was_active = service_is_active(args.service)
    hold_path = runtime_service_hold_path(args.service)
    if hold_path.exists():
        raise RuntimeError(f"runtime service hold already exists: {hold_path}")

    stages: list[dict[str, Any]] = []
    fatal_error: str | None = None
    service_restored = not service_was_active
    interrupted = False

    def interrupt_handler(signum: int, _frame: Any) -> None:
        raise InterruptedError(f"received signal {signum}")

    signal.signal(signal.SIGINT, interrupt_handler)
    signal.signal(signal.SIGTERM, interrupt_handler)
    installed_hold: Path | None = None
    started_at = utc_now()
    try:
        installed_hold = install_runtime_service_hold(args.service)
        for index, duration in enumerate(args.durations, start=1):
            label = f"{int(duration):04d}s" if duration.is_integer() else f"{duration:g}s".replace(".", "p")
            report_path = output_directory / f"xls1-compact-v6-layered-{label}-{run_id}.json"
            report = run_layered_experiment(stage_args(args, duration))
            write_json_atomic(report_path, report)
            passed = bool(report["result"]["stableProfile"])
            stages.append({
                "stage": index,
                "durationSeconds": duration,
                "passed": passed,
                "reportPath": str(report_path),
                "reportSha256": sha256_file(report_path),
                "result": report["result"],
            })
            print(json.dumps({"stageFinished": index, **stages[-1]}, separators=(",", ":")), flush=True)
            if not passed:
                break
            if index < len(args.durations) and args.inter_stage_quiet_seconds > 0:
                time.sleep(args.inter_stage_quiet_seconds)
    except InterruptedError as exc:
        interrupted = True
        fatal_error = str(exc)
    except Exception as exc:
        fatal_error = str(exc)
    finally:
        hold_to_remove = installed_hold if installed_hold is not None else hold_path if hold_path.exists() else None
        if hold_to_remove is not None:
            try:
                remove_runtime_service_hold(args.service, hold_to_remove)
            except Exception as exc:
                fatal_error = f"{fatal_error}; hold removal failed: {exc}" if fatal_error else str(exc)
        if service_was_active:
            try:
                set_service_state(args.service, "start")
                service_restored = wait_for_service(args.service, True)
            except Exception as exc:
                service_restored = False
                fatal_error = f"{fatal_error}; service restore failed: {exc}" if fatal_error else str(exc)

    passed = (
        fatal_error is None
        and service_restored
        and len(stages) == len(args.durations)
        and all(stage["passed"] for stage in stages)
    )
    summary = {
        "schemaVersion": 1,
        "experiment": "xls1-compact-v6-layered-acceptance",
        "startedAt": started_at,
        "finishedAt": utc_now(),
        "plan": plan,
        "prerequisites": prerequisites,
        "serviceWasActive": service_was_active,
        "serviceRestored": service_restored,
        "passed": passed,
        "stages": stages,
        **({"fatalError": fatal_error} if fatal_error else {}),
    }
    write_json_atomic(summary_path, summary)
    print(json.dumps({
        "summaryPath": str(summary_path),
        "summarySha256": sha256_file(summary_path),
        "passed": passed,
        "serviceRestored": service_restored,
        "completedStages": len(stages),
    }, separators=(",", ":")), flush=True)
    if passed:
        return 0
    return 130 if interrupted else 2 if fatal_error is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
