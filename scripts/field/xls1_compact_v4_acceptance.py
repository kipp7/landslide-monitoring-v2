#!/usr/bin/env python3
"""Run fail-fast Compact V4 hardware gates while holding the gateway service once."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import signal
import stat
import time
from argparse import Namespace
from datetime import datetime
from pathlib import Path
from typing import Any

from xls1_three_node_batch_poll import (
    install_runtime_service_hold,
    remove_runtime_service_hold,
    run_experiment,
    runtime_service_hold_path,
    service_is_active,
    set_service_state,
    utc_now,
)


def parse_durations(value: str) -> list[float]:
    try:
        durations = [float(part.strip()) for part in value.split(",") if part.strip()]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("durations must be comma-separated numbers") from exc
    if not durations or any(duration <= 0 for duration in durations):
        raise argparse.ArgumentTypeError("durations must contain positive values")
    if len(set(durations)) != len(durations):
        raise argparse.ArgumentTypeError("durations must not contain duplicates")
    return durations


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    temporary_path.write_text(json.dumps(payload, ensure_ascii=True, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary_path, path)


def require_ntrip_disabled(environment_file: Path) -> None:
    if not environment_file.is_file():
        raise RuntimeError(f"field-gateway environment file is missing: {environment_file}")
    assignments: dict[str, str] = {}
    for raw_line in environment_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        assignments[key.strip()] = value.strip().strip("\"'")
    value = assignments.get("NTRIP_ENABLED")
    if value is None or value.lower() not in ("false", "0", "no", "off"):
        raise RuntimeError("pure-telemetry acceptance requires NTRIP_ENABLED=false")


def validate_prerequisites(args: argparse.Namespace) -> dict[str, Any]:
    environment_file = Path(args.environment_file)
    require_ntrip_disabled(environment_file)
    environment_stat = environment_file.stat()
    environment_mode = stat.S_IMODE(environment_stat.st_mode)
    if environment_mode != 0o600 or environment_stat.st_uid != 0:
        raise RuntimeError("field-gateway environment file must be mode 0600 and owned by root")
    serial_device = Path(args.serial_device)
    if not serial_device.exists() or not stat.S_ISCHR(serial_device.stat().st_mode):
        raise RuntimeError(f"serial device is missing or is not a character device: {serial_device}")
    if not service_is_active(args.service):
        raise RuntimeError(f"field-gateway service must be active before acceptance: {args.service}")
    return {
        "environmentFile": str(environment_file),
        "environmentMode": f"{environment_mode:04o}",
        "environmentOwnerUid": environment_stat.st_uid,
        "ntripEnabled": False,
        "serialDevice": str(serial_device),
        "serialDeviceReady": True,
        "service": args.service,
        "serviceActive": True,
    }


def stage_arguments(args: argparse.Namespace, duration_seconds: float) -> Namespace:
    return Namespace(
        serial_device=args.serial_device,
        baud=args.baud,
        duration_seconds=duration_seconds,
        batch_interval_ms=args.batch_interval_ms,
        inter_command_gap_ms=0,
        response_wait_ms=args.response_window_ms,
        broadcast_poll=False,
        targeted_compact_poll=True,
        broadcast_response_timeout_ms=0,
        broadcast_partial_retries=0,
        max_broadcast_retry_rate=args.max_retry_rate,
        max_logical_response_latency_ms=args.session_timeout_ms,
        command_chunk_bytes=32,
        command_chunk_delay_ms=15,
        settle_ms=2000,
        settle_quiet_ms=500,
        warmup_seconds=0.0,
        drain_seconds=5.0,
        service=args.service,
        report_path="",
        required_match_rate=1.0,
        max_p95_interval_ms=args.max_p95_interval_ms,
        max_command_latency_ms=args.response_window_ms,
        required_compact_version=4,
        required_field_sensor_source="hardware",
        required_gnss_source=args.required_gnss_source,
        require_battery_valid=True,
        require_field_sensors_valid=True,
        require_field_calibrated_battery=True,
        required_rtcm_mode="disabled",
        require_rtcm_clean=True,
        fail_on_gate=True,
    )


def stage_label(duration_seconds: float) -> str:
    if duration_seconds.is_integer():
        return f"{int(duration_seconds):04d}s"
    return f"{duration_seconds:g}s".replace(".", "p")


def wait_for_service(service_name: str, expected_active: bool, timeout_seconds: float = 20.0) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if service_is_active(service_name) is expected_active:
            return True
        time.sleep(0.5)
    return service_is_active(service_name) is expected_active


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--serial-device", default="/dev/ttyS3")
    parser.add_argument("--baud", type=int, default=115200)
    parser.add_argument("--durations", type=parse_durations, default=parse_durations("60,600,1800"))
    parser.add_argument("--batch-interval-ms", type=int, default=250)
    parser.add_argument("--response-window-ms", type=int, default=1200)
    parser.add_argument("--session-timeout-ms", type=int, default=2500)
    parser.add_argument("--max-retry-rate", type=float, default=0.02)
    parser.add_argument("--max-p95-interval-ms", type=float, default=2500.0)
    parser.add_argument(
        "--required-gnss-source",
        choices=("hardware", "simulated"),
        default="hardware",
    )
    parser.add_argument("--inter-stage-quiet-seconds", type=float, default=2.0)
    parser.add_argument("--service", default="lsmv2-field-gateway.service")
    parser.add_argument("--environment-file", default="/etc/lsmv2/field-gateway.env")
    parser.add_argument("--output-directory", default="/var/lib/lsmv2/experiments")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check-prerequisites", action="store_true")
    args = parser.parse_args()
    if args.baud <= 0 or args.batch_interval_ms <= 0:
        parser.error("baud and batch interval must be positive")
    if args.response_window_ms <= 0 or args.session_timeout_ms < 2 * args.response_window_ms:
        parser.error("session timeout must cover the initial and one retry response window")
    if not 0.0 <= args.max_retry_rate <= 1.0:
        parser.error("max retry rate must be between zero and one")
    if args.max_p95_interval_ms <= 0 or args.inter_stage_quiet_seconds < 0:
        parser.error("latency limits must be positive and quiet time non-negative")
    if args.dry_run and args.check_prerequisites:
        parser.error("--dry-run and --check-prerequisites are mutually exclusive")
    return args


def main() -> int:
    args = parse_args()
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_directory = Path(args.output_directory)
    summary_path = output_directory / f"xls1-compact-v4-acceptance-{run_id}.json"
    plan = {
        "serialDevice": args.serial_device,
        "baud": args.baud,
        "environmentFile": args.environment_file,
        "requiredNtripEnabled": False,
        "durationsSeconds": args.durations,
        "batchIntervalMs": args.batch_interval_ms,
        "pollingMode": "compact-targeted-v1",
        "responseWindowMs": args.response_window_ms,
        "partialRetries": 0,
        "sessionTimeoutMs": args.session_timeout_ms,
        "maxRetryRate": args.max_retry_rate,
        "requiredCompactVersion": 4,
        "requiredFieldSensorSource": "hardware",
        "requiredGnssSource": args.required_gnss_source,
        "requireFieldSensorsValid": True,
        "requireFieldCalibratedBattery": True,
        "requiredRtcmMode": "disabled",
        "requireRtcmClean": True,
    }
    if args.dry_run:
        print(json.dumps({"dryRun": True, "plan": plan}, ensure_ascii=True, indent=2))
        return 0

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
        for index, duration_seconds in enumerate(args.durations, start=1):
            label = stage_label(duration_seconds)
            report_path = output_directory / f"xls1-compact-v4-{label}-{run_id}.json"
            print(
                json.dumps(
                    {
                        "stageStart": index,
                        "durationSeconds": duration_seconds,
                        "reportPath": str(report_path),
                    },
                    separators=(",", ":"),
                ),
                flush=True,
            )
            report = run_experiment(stage_arguments(args, duration_seconds))
            write_json_atomic(report_path, report)
            passed = bool(report.get("result", {}).get("stableProfile", False))
            stage = {
                "stage": index,
                "durationSeconds": duration_seconds,
                "passed": passed,
                "reportPath": str(report_path),
                "reportSha256": sha256_file(report_path),
                "result": report.get("result", {}),
            }
            stages.append(stage)
            print(json.dumps({"stageFinished": index, **stage}, separators=(",", ":")), flush=True)
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
        hold_to_remove = installed_hold
        if hold_to_remove is None and hold_path.exists():
            hold_to_remove = hold_path
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
        "experiment": "xls1-compact-v4-acceptance",
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
    print(
        json.dumps(
            {
                "summaryPath": str(summary_path),
                "summarySha256": sha256_file(summary_path),
                "passed": passed,
                "serviceRestored": service_restored,
                "completedStages": len(stages),
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    if passed:
        return 0
    return 130 if interrupted else 2 if fatal_error is None else 1


if __name__ == "__main__":
    raise SystemExit(main())
