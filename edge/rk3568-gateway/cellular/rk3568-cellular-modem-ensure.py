#!/usr/bin/env python3
"""Verify and recover the RK3568 EC200A cellular modem."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def env_int(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


AT_PORT = Path(os.environ.get("AT_PORT", "/dev/ttyUSB2"))
EXPECTED_APN = os.environ.get("EXPECTED_APN", "cmnet")
ENUM_WAIT_SECONDS = env_int("ENUM_WAIT_SECONDS", 45)
POST_RESET_WAIT_SECONDS = env_int("POST_RESET_WAIT_SECONDS", 20)
POST_RESET_ENUM_WAIT_SECONDS = env_int("POST_RESET_ENUM_WAIT_SECONDS", 90)
RECOVERY_FAILURE_THRESHOLD = max(1, env_int("RECOVERY_FAILURE_THRESHOLD", 2))
REGISTRATION_FAILURE_THRESHOLD = max(
    RECOVERY_FAILURE_THRESHOLD,
    env_int("REGISTRATION_FAILURE_THRESHOLD", 4),
)
RECOVERY_COOLDOWN_SECONDS = env_int("RECOVERY_COOLDOWN_SECONDS", 600)
MAX_RESETS_PER_BOOT = max(1, env_int("MAX_RESETS_PER_BOOT", 1))
USB_DEVICE = os.environ.get("USB_DEVICE", "usb0")
USB_CONNECTION_NAME = os.environ.get("USB_CONNECTION_NAME", "有线连接 2")
FIELD_GATEWAY_SERVICE = os.environ.get(
    "FIELD_GATEWAY_SERVICE", "lsmv2-field-gateway.service"
)
REVERSE_TUNNEL_SERVICE = os.environ.get(
    "REVERSE_TUNNEL_SERVICE", "lsmv2-rk3568-reverse-tunnel.service"
)
GUARDIAN_SERVICE = os.environ.get(
    "GUARDIAN_SERVICE", "lsmv2-rk3568-cellular-link-guardian.service"
)
STATUS_FILE = Path(
    os.environ.get(
        "MODEM_STATUS_FILE", "/var/lib/lsmv2/cellular-cloud/modem-status.json"
    )
)
STATE_FILE = Path(
    os.environ.get(
        "MODEM_STATE_FILE", "/var/lib/lsmv2/cellular-cloud/modem-state.json"
    )
)
LOCK_FILE = Path(
    os.environ.get("MODEM_LOCK_FILE", "/run/lsmv2-cellular-modem-ensure.lock")
)

QUERY_COMMANDS = (
    "AT+CPIN?",
    "AT+CEREG?",
    "AT+CGATT?",
    "AT+CSQ",
    "AT+CGDCONT?",
    "AT+QCCID",
)


def now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def boot_id() -> str:
    try:
        return Path("/proc/sys/kernel/random/boot_id").read_text(
            encoding="ascii"
        ).strip()
    except OSError:
        return "unknown"


def atomic_json_write(path: Path, payload: dict[str, Any], mode: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.chmod(temporary, mode)
    os.replace(temporary, path)


def load_state(current_boot_id: str) -> dict[str, Any]:
    state: dict[str, Any] = {}
    try:
        state = json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        pass

    if state.get("bootId") != current_boot_id:
        state = {
            "bootId": current_boot_id,
            "consecutiveFailures": 0,
            "resetsThisBoot": 0,
            "lastResetEpoch": 0,
            "totalResets": int(state.get("totalResets", 0) or 0),
        }
    return state


def wait_for_path(path: Path, timeout_seconds: int) -> bool:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() <= deadline:
        if path.exists():
            return True
        time.sleep(1)
    return False


def run_at_commands(commands: tuple[str, ...]) -> dict[str, str]:
    try:
        import serial  # type: ignore
    except ImportError as exc:
        raise RuntimeError("python serial module is not installed") from exc

    responses: dict[str, str] = {}
    with serial.Serial(
        str(AT_PORT),
        115200,
        timeout=0.2,
        write_timeout=1,
        exclusive=True,
    ) as modem:
        for command in commands:
            modem.reset_input_buffer()
            modem.write((command + "\r").encode("ascii"))
            modem.flush()
            deadline = time.monotonic() + 1.5
            chunks = bytearray()
            while time.monotonic() < deadline:
                chunk = modem.read(4096)
                if chunk:
                    chunks.extend(chunk)
                    upper = bytes(chunks).upper()
                    if b"\r\nOK\r\n" in upper or b"ERROR" in upper:
                        break
            responses[command] = bytes(chunks).decode("ascii", errors="replace")
    return responses


def registration_state(response: str) -> int | None:
    match = re.search(r"\+CEREG:\s*([^\r\n]+)", response, re.IGNORECASE)
    if not match:
        return None
    fields = [field.strip().strip('"') for field in match.group(1).split(",")]
    try:
        if len(fields) >= 2:
            return int(fields[1])
        return int(fields[0])
    except (ValueError, IndexError):
        return None


def parse_snapshot(responses: dict[str, str]) -> dict[str, Any]:
    cpin = responses.get("AT+CPIN?", "")
    qccid = responses.get("AT+QCCID", "")
    cereg = responses.get("AT+CEREG?", "")
    cgatt = responses.get("AT+CGATT?", "")
    contexts = responses.get("AT+CGDCONT?", "")
    csq = responses.get("AT+CSQ", "")

    sim_ready = "+CPIN: READY" in cpin.upper()
    sim_detected = "+QCCID:" in qccid.upper() and "+CME ERROR: 10" not in qccid.upper()
    reg_state = registration_state(cereg)
    registered = reg_state in (1, 5)
    attached = bool(re.search(r"\+CGATT:\s*1\b", cgatt, re.IGNORECASE))
    apn_ok = EXPECTED_APN.lower() in contexts.lower()
    signal_match = re.search(r"\+CSQ:\s*(\d+)", csq, re.IGNORECASE)
    signal_rssi = int(signal_match.group(1)) if signal_match else None
    sim_operational = sim_ready or (sim_detected and registered and attached)

    if not sim_operational:
        reason = "sim_not_ready"
    elif not registered:
        reason = "network_not_registered"
    elif not attached:
        reason = "packet_not_attached"
    elif not apn_ok:
        reason = "apn_mismatch"
    else:
        reason = "modem_ready"

    return {
        "ok": reason == "modem_ready",
        "reason": reason,
        "simReady": sim_ready,
        "simDetected": sim_detected,
        "simOperational": sim_operational,
        "registered": registered,
        "registrationState": reg_state,
        "attached": attached,
        "apnOk": apn_ok,
        "expectedApn": EXPECTED_APN,
        "signalRssi": signal_rssi,
    }


def add_usb_network_state(snapshot: dict[str, Any]) -> dict[str, Any]:
    usb_present = (Path("/sys/class/net") / USB_DEVICE).exists()
    snapshot["usbDevice"] = USB_DEVICE
    snapshot["usbDevicePresent"] = usb_present
    if snapshot.get("ok") and not usb_present:
        snapshot["ok"] = False
        snapshot["reason"] = "usb_network_missing"
    return snapshot


def failure_threshold(snapshot: dict[str, Any]) -> int:
    if snapshot.get("reason") == "network_not_registered" and snapshot.get(
        "registrationState"
    ) in (0, 2, 4):
        return REGISTRATION_FAILURE_THRESHOLD
    return RECOVERY_FAILURE_THRESHOLD


def recovery_decision(
    snapshot: dict[str, Any],
    state: dict[str, Any],
    current_epoch: int,
    check_only: bool,
) -> tuple[bool, int]:
    last_reset_epoch = int(state.get("lastResetEpoch", 0) or 0)
    cooldown_remaining = max(
        0, RECOVERY_COOLDOWN_SECONDS - (current_epoch - last_reset_epoch)
    )
    eligible = (
        not check_only
        and int(state.get("consecutiveFailures", 0))
        >= failure_threshold(snapshot)
        and int(state.get("resetsThisBoot", 0)) < MAX_RESETS_PER_BOOT
        and cooldown_remaining == 0
        and snapshot.get("reason") != "modem_query_failed"
    )
    return eligible, cooldown_remaining


def service_action(*arguments: str) -> None:
    try:
        subprocess.run(
            ["systemctl", *arguments],
            check=False,
            timeout=30,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def service_is_enabled(service: str) -> bool:
    try:
        result = subprocess.run(
            ["systemctl", "is-enabled", "--quiet", service],
            check=False,
            timeout=10,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False
    return result.returncode == 0


def reconnect_usb() -> None:
    device_path = Path("/sys/class/net") / USB_DEVICE
    if not wait_for_path(device_path, 60):
        return
    try:
        subprocess.run(
            ["nmcli", "connection", "up", USB_CONNECTION_NAME],
            check=False,
            timeout=30,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass


def issue_recovery_reset() -> None:
    recovery_commands = (
        f'AT+CGDCONT=1,"IP","{EXPECTED_APN}"',
        f'AT+QICSGP=1,1,"{EXPECTED_APN}","","",1',
        "AT+CFUN=1,1",
    )
    try:
        run_at_commands(recovery_commands)
    except Exception as exc:
        # CFUN commonly removes the USB serial device before pyserial finishes.
        if AT_PORT.exists():
            raise RuntimeError(f"modem reset command failed: {exc}") from exc


def write_result(
    snapshot: dict[str, Any],
    state: dict[str, Any],
    action: str,
    cooldown_remaining: int,
) -> None:
    payload = {
        "generatedAt": now_iso(),
        "service": "lsmv2-rk3568-cellular-modem-ensure",
        "port": str(AT_PORT),
        **snapshot,
        "recoveryAction": action,
        "consecutiveFailures": int(state.get("consecutiveFailures", 0)),
        "resetsThisBoot": int(state.get("resetsThisBoot", 0)),
        "totalResets": int(state.get("totalResets", 0)),
        "cooldownRemainingSeconds": cooldown_remaining,
    }
    atomic_json_write(STATUS_FILE, payload, 0o644)
    print(json.dumps(payload, ensure_ascii=False, separators=(",", ":")))


def self_test() -> int:
    global EXPECTED_APN
    EXPECTED_APN = "cmnet"
    healthy = parse_snapshot(
        {
            "AT+CPIN?": "+CPIN: READY\r\nOK\r\n",
            "AT+QCCID": "+QCCID: redacted\r\nOK\r\n",
            "AT+CEREG?": "+CEREG: 0,1\r\nOK\r\n",
            "AT+CGATT?": "+CGATT: 1\r\nOK\r\n",
            "AT+CGDCONT?": '+CGDCONT: 1,"IP","cmnet"\r\nOK\r\n',
            "AT+CSQ": "+CSQ: 28,99\r\nOK\r\n",
        }
    )
    assert healthy["ok"] is True
    assert healthy["signalRssi"] == 28
    assert registration_state("+CEREG: 2,5,\"x\"") == 5
    missing = parse_snapshot(
        {
            "AT+CPIN?": "+CME ERROR: 10",
            "AT+QCCID": "+CME ERROR: 10",
        }
    )
    assert missing["reason"] == "sim_not_ready"
    registered_without_cpin = parse_snapshot(
        {
            "AT+CPIN?": "",
            "AT+QCCID": "+QCCID: redacted\r\nOK\r\n",
            "AT+CEREG?": "+CEREG: 0,1\r\nOK\r\n",
            "AT+CGATT?": "+CGATT: 1\r\nOK\r\n",
            "AT+CGDCONT?": '+CGDCONT: 1,"IP","cmnet"\r\nOK\r\n',
        }
    )
    assert registered_without_cpin["simOperational"] is True
    assert registered_without_cpin["ok"] is True
    eligible, _ = recovery_decision(
        missing,
        {"consecutiveFailures": 2, "resetsThisBoot": 0, "lastResetEpoch": 0},
        1_000_000,
        False,
    )
    assert eligible is True
    check_only_eligible, _ = recovery_decision(
        missing,
        {"consecutiveFailures": 2, "resetsThisBoot": 0, "lastResetEpoch": 0},
        1_000_000,
        True,
    )
    assert check_only_eligible is False
    searching = {"reason": "network_not_registered", "registrationState": 2}
    searching_eligible, _ = recovery_decision(
        searching,
        {"consecutiveFailures": 2, "resetsThisBoot": 0, "lastResetEpoch": 0},
        1_000_000,
        False,
    )
    assert searching_eligible is False
    already_reset, _ = recovery_decision(
        missing,
        {"consecutiveFailures": 2, "resetsThisBoot": 1, "lastResetEpoch": 0},
        1_000_000,
        False,
    )
    assert already_reset is False
    print("rk3568-cellular-modem-ensure self-test passed")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check-only", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()

    import fcntl

    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    with LOCK_FILE.open("w", encoding="ascii") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("cellular modem ensure is already running")
            return 0

        current_boot_id = boot_id()
        state = load_state(current_boot_id)
        if not wait_for_path(AT_PORT, ENUM_WAIT_SECONDS):
            state["consecutiveFailures"] = int(
                state.get("consecutiveFailures", 0)
            ) + 1
            snapshot = {
                "ok": False,
                "reason": "modem_port_missing",
                "simReady": False,
                "simDetected": False,
                "simOperational": False,
                "registered": False,
                "registrationState": None,
                "attached": False,
                "apnOk": False,
                "expectedApn": EXPECTED_APN,
                "signalRssi": None,
                "usbDevice": USB_DEVICE,
                "usbDevicePresent": (Path("/sys/class/net") / USB_DEVICE).exists(),
            }
            atomic_json_write(STATE_FILE, state, 0o600)
            write_result(snapshot, state, "none", 0)
            return 0

        try:
            snapshot = add_usb_network_state(
                parse_snapshot(run_at_commands(QUERY_COMMANDS))
            )
        except Exception as exc:
            snapshot = {
                "ok": False,
                "reason": "modem_query_failed",
                "simReady": False,
                "simDetected": False,
                "simOperational": False,
                "registered": False,
                "registrationState": None,
                "attached": False,
                "apnOk": False,
                "expectedApn": EXPECTED_APN,
                "signalRssi": None,
                "usbDevice": USB_DEVICE,
                "usbDevicePresent": (Path("/sys/class/net") / USB_DEVICE).exists(),
                "queryError": str(exc),
            }

        if snapshot["ok"]:
            state["consecutiveFailures"] = 0
            state["lastGoodAt"] = now_iso()
            atomic_json_write(STATE_FILE, state, 0o600)
            write_result(snapshot, state, "none", 0)
            return 0

        state["consecutiveFailures"] = int(state.get("consecutiveFailures", 0)) + 1
        current_epoch = int(time.time())
        eligible, cooldown_remaining = recovery_decision(
            snapshot,
            state,
            current_epoch,
            args.check_only,
        )
        if not eligible:
            atomic_json_write(STATE_FILE, state, 0o600)
            action = "check_only" if args.check_only else "waiting_before_recovery"
            write_result(snapshot, state, action, cooldown_remaining)
            return 0

        state["lastResetEpoch"] = current_epoch
        state["resetsThisBoot"] = int(state.get("resetsThisBoot", 0)) + 1
        state["totalResets"] = int(state.get("totalResets", 0)) + 1
        state["consecutiveFailures"] = 0
        atomic_json_write(STATE_FILE, state, 0o600)
        try:
            issue_recovery_reset()
        except Exception as exc:
            snapshot["reason"] = "recovery_command_failed"
            snapshot["recoveryError"] = str(exc)
            write_result(snapshot, state, "cfun_reset_failed", RECOVERY_COOLDOWN_SECONDS)
            return 0

        snapshot["reason"] = "recovery_reset_issued"
        write_result(snapshot, state, "cfun_reset", RECOVERY_COOLDOWN_SECONDS)
        time.sleep(POST_RESET_WAIT_SECONDS)
        if wait_for_path(AT_PORT, POST_RESET_ENUM_WAIT_SECONDS):
            reconnect_usb()
            if service_is_enabled(REVERSE_TUNNEL_SERVICE):
                service_action("restart", REVERSE_TUNNEL_SERVICE)
            service_action("restart", FIELD_GATEWAY_SERVICE)
            service_action("start", "--no-block", GUARDIAN_SERVICE)
        return 0


if __name__ == "__main__":
    sys.exit(main())
