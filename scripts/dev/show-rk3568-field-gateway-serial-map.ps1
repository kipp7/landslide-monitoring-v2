[CmdletBinding()]
param(
  [string]$Host = "192.168.124.172",
  [string]$User = "linaro",
  [int]$SshPort = 22,
  [string]$HealthFile = "/var/lib/lsmv2/field-gateway/health/runtime-health.json",
  [string]$EnvFile = "/etc/lsmv2/field-gateway.env"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-RemoteBash {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [int]$TargetPort,
    [string]$ScriptText
  )

  $sshArgs = @(
    "-p", [string]$TargetPort,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3",
    "{0}@{1}" -f $TargetUser, $TargetHost,
    "bash -s --"
  )

  $ScriptText | & ssh @sshArgs
}

$remoteScript = @"
set -euo pipefail

health_file='$HealthFile'
env_file='$EnvFile'

python3 - <<'PY'
import json
import os
import pathlib
import subprocess
from datetime import datetime, timezone

health_file = pathlib.Path("$HealthFile")
env_file = pathlib.Path("$EnvFile")

def read_env(path: pathlib.Path):
    env = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value
    return env

def symlink_entries(path_str: str):
    base = pathlib.Path(path_str)
    if not base.exists():
        return []
    result = []
    for entry in sorted(base.iterdir(), key=lambda item: item.name):
        try:
            target = os.path.realpath(str(entry))
        except OSError:
            target = None
        result.append({
            "name": entry.name,
            "path": str(entry),
            "target": target
        })
    return result

def tty_candidates():
    paths = set()
    for pattern in ("/dev/ttyS*", "/dev/ttyUSB*", "/dev/ttyACM*"):
        for item in pathlib.Path("/dev").glob(pathlib.Path(pattern).name):
            paths.add(str(item))

    entries = []
    for path_str in sorted(paths):
        path = pathlib.Path(path_str)
        info = {
            "path": path_str,
            "resolvedPath": os.path.realpath(path_str)
        }
        sys_tty = pathlib.Path("/sys/class/tty") / path.name
        if sys_tty.exists():
            try:
                info["sysPath"] = str(sys_tty.resolve())
            except OSError:
                info["sysPath"] = str(sys_tty)
            driver_link = sys_tty / "device" / "driver"
            subsystem_link = sys_tty / "device" / "subsystem"
            if driver_link.exists():
                try:
                    info["driver"] = driver_link.resolve().name
                except OSError:
                    info["driver"] = driver_link.name
            if subsystem_link.exists():
                try:
                    info["subsystem"] = subsystem_link.resolve().name
                except OSError:
                    info["subsystem"] = subsystem_link.name

        if subprocess.run(["bash", "-lc", "command -v udevadm >/dev/null 2>&1"]).returncode == 0:
            proc = subprocess.run(
                ["udevadm", "info", "--query=property", "--name", path_str],
                capture_output=True,
                text=True
            )
            if proc.returncode == 0:
                props = {}
                for raw in proc.stdout.splitlines():
                    if "=" not in raw:
                        continue
                    key, value = raw.split("=", 1)
                    if key in {
                        "ID_PATH",
                        "ID_SERIAL",
                        "ID_SERIAL_SHORT",
                        "ID_VENDOR",
                        "ID_VENDOR_ID",
                        "ID_MODEL",
                        "ID_MODEL_ID",
                        "ID_USB_DRIVER"
                    }:
                        props[key] = value
                if props:
                    info["udev"] = props

        entries.append(info)
    return entries

env_map = read_env(env_file)
health = None
if health_file.exists():
    try:
        health = json.loads(health_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        health = {
            "decodeError": True
        }

result = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "host": {
        "hostname": subprocess.run(["hostname"], capture_output=True, text=True).stdout.strip(),
        "kernel": subprocess.run(["uname", "-a"], capture_output=True, text=True).stdout.strip()
    },
    "envFile": str(env_file),
    "healthFile": str(health_file),
    "configured": {
        "serialDevice": env_map.get("SERIAL_DEVICE"),
        "southboundNodesJson": env_map.get("SOUTHBOUND_NODES_JSON"),
        "mqttTopicCommandPrefix": env_map.get("MQTT_TOPIC_COMMAND_PREFIX"),
        "mqttTopicAckPrefix": env_map.get("MQTT_TOPIC_ACK_PREFIX")
    },
    "serialById": symlink_entries("/dev/serial/by-id"),
    "serialByPath": symlink_entries("/dev/serial/by-path"),
    "ttyCandidates": tty_candidates(),
    "runtimeHealth": health
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PY
"@

Invoke-RemoteBash -TargetHost $Host -TargetUser $User -TargetPort $SshPort -ScriptText $remoteScript
