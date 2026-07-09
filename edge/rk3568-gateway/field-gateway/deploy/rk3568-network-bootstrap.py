#!/usr/bin/env python3

import json
import os
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def env_str(name: str, default: str = "") -> str:
    value = os.environ.get(name, default)
    return value.strip()


def env_int(name: str, default: int) -> int:
    try:
        return int(env_str(name, str(default)))
    except ValueError:
        return default


def run(args: list[str], check: bool = False) -> subprocess.CompletedProcess[str]:
    proc = subprocess.run(args, capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"command failed ({proc.returncode}): {' '.join(shlex.quote(item) for item in args)} :: {proc.stderr.strip()}"
        )
    return proc


def write_json_atomic(target: Path, value: Any) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    temp = target.with_suffix(target.suffix + f".{os.getpid()}.{int(time.time() * 1000)}.tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
    temp.replace(target)


class BootstrapRuntime:
    def __init__(self) -> None:
        self.loop_interval_seconds = max(5, env_int("BOOTSTRAP_LOOP_INTERVAL_SECONDS", 20))
        self.sta_connect_timeout_seconds = max(5, env_int("STA_CONNECT_TIMEOUT_SECONDS", 45))
        self.sta_retry_interval_seconds = max(15, env_int("STA_RETRY_INTERVAL_SECONDS", 60))
        self.wifi_device = env_str("WIFI_DEVICE")
        self.sta_connection_name = env_str("STA_CONNECTION_NAME", "lsmv2-uplink")
        self.sta_ssid = env_str("STA_SSID")
        self.sta_psk = env_str("STA_PSK")
        self.ap_connection_name = env_str("AP_CONNECTION_NAME", "lsmv2-ap-fallback")
        self.ap_ssid = env_str("AP_SSID", "rk3568-1")
        self.ap_psk = env_str("AP_PSK")
        self.gateway_service_name = env_str("GATEWAY_SERVICE_NAME", "lsmv2-field-gateway.service")
        self.status_file_path = Path(env_str("STATUS_FILE_PATH", "/var/lib/lsmv2/network-bootstrap/status/runtime-status.json"))

        self.last_mode = "initializing"
        self.last_mode_change_ts = iso_now()
        self.last_sta_attempt_ts: str | None = None
        self.last_sta_success_ts: str | None = None
        self.last_error: str | None = None
        self.last_action = "startup"

    def detect_wifi_device(self) -> str | None:
        if self.wifi_device:
            return self.wifi_device

        proc = run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"])
        for line in proc.stdout.splitlines():
            parts = line.split(":", 3)
            if len(parts) < 2:
                continue
            device = parts[0].strip()
            dev_type = parts[1].strip()
            if device and dev_type == "wifi":
                self.wifi_device = device
                return device
        return None

    def active_connections(self) -> list[dict[str, str]]:
        proc = run(["nmcli", "-t", "-f", "NAME,TYPE,DEVICE", "connection", "show", "--active"])
        results: list[dict[str, str]] = []
        for line in proc.stdout.splitlines():
            parts = line.split(":", 2)
            if len(parts) != 3:
                continue
            results.append({"name": parts[0], "type": parts[1], "device": parts[2]})
        return results

    def connection_profiles(self) -> list[dict[str, str]]:
        proc = run(["nmcli", "-t", "-f", "NAME,UUID,TYPE", "connection", "show"])
        results: list[dict[str, str]] = []
        for line in proc.stdout.splitlines():
            parts = line.split(":", 2)
            if len(parts) != 3:
                continue
            results.append({"name": parts[0], "uuid": parts[1], "type": parts[2]})
        return results

    def delete_connection_uuid(self, uuid: str) -> None:
        if uuid:
            run(["nmcli", "connection", "delete", "uuid", uuid])

    def cleanup_ap_profiles(self) -> None:
        ap_related = [
            item
            for item in self.connection_profiles()
            if item["type"] == "802-11-wireless"
            and (
                item["name"] == self.ap_connection_name
                or item["name"] == self.ap_ssid
                or item["name"].startswith(f"{self.ap_ssid} ")
            )
        ]
        for item in ap_related:
            self.delete_connection_uuid(item["uuid"])

    def has_ethernet_uplink(self, active_connections: list[dict[str, str]], general: dict[str, str]) -> bool:
        if general.get("state") != "connected" or general.get("connectivity") != "full":
            return False

        for item in active_connections:
            if item["type"] == "802-3-ethernet" and item["device"]:
                return True

        return False

    def ensure_wifi_operational(self, wifi_device: str) -> None:
        # Keep the Wi-Fi radio unblocked so the board can fall back to STA
        # immediately after Ethernet disappears.
        run(["rfkill", "unblock", "wifi"])
        run(["nmcli", "radio", "wifi", "on"])
        run(["nmcli", "device", "set", wifi_device, "managed", "yes"])

    def ip_addrs(self) -> list[str]:
        proc = run(["bash", "-lc", "ip -o -4 addr show | awk '{print $2\":\"$4}'"])
        return [line.strip() for line in proc.stdout.splitlines() if line.strip()]

    def general_state(self) -> dict[str, str]:
        proc = run(["nmcli", "-t", "-f", "STATE,CONNECTIVITY", "general"])
        line = proc.stdout.strip()
        if not line:
            return {"state": "unknown", "connectivity": "unknown"}
        parts = line.split(":", 1)
        if len(parts) == 1:
            return {"state": parts[0], "connectivity": "unknown"}
        return {"state": parts[0], "connectivity": parts[1]}

    def gateway_service_state(self) -> str:
        return run(["systemctl", "is-active", self.gateway_service_name]).stdout.strip() or "unknown"

    def gateway_service_enabled(self) -> str:
        return run(["systemctl", "is-enabled", self.gateway_service_name]).stdout.strip() or "unknown"

    def ensure_sta_profile(self, wifi_device: str) -> None:
        if not self.sta_connection_name:
            return

        exists = run(["nmcli", "-t", "-f", "NAME", "connection", "show", self.sta_connection_name]).returncode == 0
        if exists:
            if self.sta_ssid:
                run(["nmcli", "connection", "modify", self.sta_connection_name, "802-11-wireless.ssid", self.sta_ssid], check=True)
            if self.sta_psk:
                run(
                    [
                        "nmcli",
                        "connection",
                        "modify",
                        self.sta_connection_name,
                        "802-11-wireless-security.key-mgmt",
                        "wpa-psk",
                        "802-11-wireless-security.psk",
                        self.sta_psk,
                    ],
                    check=True,
                )
            run(["nmcli", "connection", "modify", self.sta_connection_name, "connection.autoconnect", "yes"], check=True)
            return

        if not self.sta_ssid or not self.sta_psk:
            raise RuntimeError("STA connection profile missing and STA_SSID/STA_PSK not configured")

        run(
            [
                "nmcli",
                "connection",
                "add",
                "type",
                "wifi",
                "ifname",
                wifi_device,
                "con-name",
                self.sta_connection_name,
                "ssid",
                self.sta_ssid,
            ],
            check=True,
        )
        run(
            [
                "nmcli",
                "connection",
                "modify",
                self.sta_connection_name,
                "wifi-sec.key-mgmt",
                "wpa-psk",
                "wifi-sec.psk",
                self.sta_psk,
                "connection.autoconnect",
                "yes",
            ],
            check=True,
        )

    def ensure_ap_profile(self, wifi_device: str, current_mode: str) -> None:
        if not self.ap_psk:
            raise RuntimeError("AP fallback requires AP_PSK to be configured in the local environment file")

        if current_mode != "ap_fallback":
            self.cleanup_ap_profiles()
        exists = run(["nmcli", "-t", "-f", "NAME", "connection", "show", self.ap_connection_name]).returncode == 0
        if not exists:
            run(
                [
                    "nmcli",
                    "connection",
                    "add",
                    "type",
                    "wifi",
                    "ifname",
                    wifi_device,
                    "con-name",
                    self.ap_connection_name,
                    "ssid",
                    self.ap_ssid,
                ],
                check=True,
            )
        run(
            [
                "nmcli",
                "connection",
                "modify",
                self.ap_connection_name,
                "connection.interface-name",
                wifi_device,
                "802-11-wireless.mode",
                "ap",
                "802-11-wireless.band",
                "bg",
                "802-11-wireless.hidden",
                "no",
                "ipv4.method",
                "shared",
                "ipv6.method",
                "ignore",
                "wifi-sec.key-mgmt",
                "wpa-psk",
                "wifi-sec.psk",
                self.ap_psk,
                "connection.autoconnect",
                "no",
            ],
            check=True,
        )

    def connection_up(self, connection_name: str, timeout_seconds: int) -> bool:
        proc = run(["nmcli", "--wait", str(timeout_seconds), "connection", "up", connection_name])
        return proc.returncode == 0

    def connection_down(self, connection_name: str) -> None:
        run(["nmcli", "connection", "down", connection_name])

    def ensure_gateway_started(self) -> None:
        if not self.gateway_service_name:
            return
        if self.gateway_service_state() != "active":
            run(["systemctl", "start", self.gateway_service_name])

    def classify_mode(self, wifi_device: str, active_connections: list[dict[str, str]]) -> str:
        for item in active_connections:
            if item["device"] != wifi_device:
                continue
            if item["name"] == self.ap_connection_name:
                return "ap_fallback"
            return "sta_connected"
        return "disconnected"

    def status_snapshot(self) -> dict[str, Any]:
        wifi_device = self.detect_wifi_device()
        active_connections = self.active_connections()
        general = self.general_state()
        gateway_state = self.gateway_service_state()
        gateway_enabled = self.gateway_service_enabled()
        mode = self.classify_mode(wifi_device or "", active_connections) if wifi_device else "no_wifi_device"
        if self.has_ethernet_uplink(active_connections, general):
            mode = "ethernet_uplink"

        return {
          "generatedAt": iso_now(),
          "service": "rk3568-network-bootstrap",
          "mode": mode,
          "wifiDevice": wifi_device,
          "staConnectionName": self.sta_connection_name,
          "apConnectionName": self.ap_connection_name,
          "apSsid": self.ap_ssid,
          "loopIntervalSeconds": self.loop_interval_seconds,
          "staConnectTimeoutSeconds": self.sta_connect_timeout_seconds,
          "staRetryIntervalSeconds": self.sta_retry_interval_seconds,
          "lastAction": self.last_action,
          "lastError": self.last_error,
          "lastMode": self.last_mode,
          "lastModeChangeTs": self.last_mode_change_ts,
          "lastStaAttemptTs": self.last_sta_attempt_ts,
          "lastStaSuccessTs": self.last_sta_success_ts,
          "nmcliGeneral": general,
          "activeConnections": active_connections,
          "ipAddresses": self.ip_addrs(),
          "gatewayService": {
              "name": self.gateway_service_name,
              "active": gateway_state,
              "enabled": gateway_enabled,
          },
        }

    def set_mode(self, mode: str) -> None:
        if mode != self.last_mode:
            self.last_mode = mode
            self.last_mode_change_ts = iso_now()

    def tick(self) -> None:
        wifi_device = self.detect_wifi_device()
        if not wifi_device:
            self.last_action = "wait-wifi-device"
            self.set_mode("no_wifi_device")
            return

        self.ensure_wifi_operational(wifi_device)
        self.ensure_gateway_started()
        active_connections = self.active_connections()
        general = self.general_state()
        current_mode = self.classify_mode(wifi_device, active_connections)
        self.ensure_ap_profile(wifi_device, current_mode)
        active_connections = self.active_connections()
        current_mode = self.classify_mode(wifi_device, active_connections)
        if self.has_ethernet_uplink(active_connections, general):
            if any(item["device"] == wifi_device and item["name"] == self.ap_connection_name for item in active_connections):
                self.connection_down(self.ap_connection_name)
            self.last_action = "ethernet-healthy"
            self.last_error = None
            self.set_mode("ethernet_uplink")
            return

        if current_mode == "sta_connected":
            for item in active_connections:
                if item["device"] == wifi_device and item["name"] == self.ap_connection_name:
                    self.connection_down(self.ap_connection_name)
            self.last_action = "sta-healthy"
            self.last_sta_success_ts = iso_now()
            self.last_error = None
            self.set_mode("sta_connected")
            return

        now = time.time()
        should_retry_sta = True
        if self.last_sta_attempt_ts:
            last_attempt = datetime.strptime(self.last_sta_attempt_ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp()
            should_retry_sta = (now - last_attempt) >= self.sta_retry_interval_seconds

        sta_error = None
        if should_retry_sta and self.sta_connection_name:
            self.last_sta_attempt_ts = iso_now()
            try:
                self.ensure_sta_profile(wifi_device)
                if current_mode == "ap_fallback":
                    self.connection_down(self.ap_connection_name)
                if self.connection_up(self.sta_connection_name, self.sta_connect_timeout_seconds):
                    self.last_action = "sta-up"
                    self.last_sta_success_ts = iso_now()
                    self.last_error = None
                    self.set_mode("sta_connected")
                    return
                sta_error = f"STA connect timed out or failed for {self.sta_connection_name}"
            except Exception as exc:
                sta_error = str(exc)

        self.ensure_ap_profile(wifi_device)
        if self.connection_up(self.ap_connection_name, 20):
            self.last_action = "ap-fallback-up"
            self.last_error = sta_error
            self.set_mode("ap_fallback")
            return

        self.last_action = "ap-fallback-failed"
        self.last_error = sta_error or "AP fallback failed"
        self.set_mode("degraded")

    def loop(self) -> None:
        while True:
            try:
                self.tick()
            except Exception as exc:
                self.last_error = str(exc)
                self.last_action = "exception"
                self.set_mode("degraded")

            write_json_atomic(self.status_file_path, self.status_snapshot())
            time.sleep(self.loop_interval_seconds)


def main() -> None:
    BootstrapRuntime().loop()


if __name__ == "__main__":
    main()
