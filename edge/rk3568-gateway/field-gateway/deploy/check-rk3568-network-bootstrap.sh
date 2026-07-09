#!/usr/bin/env bash

set -euo pipefail

ENV_FILE_PATH="${ENV_FILE_PATH:-/etc/lsmv2/network-bootstrap.env}"
STATUS_FILE_PATH="${STATUS_FILE_PATH:-/var/lib/lsmv2/network-bootstrap/status/runtime-status.json}"
GATEWAY_SERVICE_NAME="${GATEWAY_SERVICE_NAME:-lsmv2-field-gateway.service}"
BOOTSTRAP_SERVICE_NAME="${BOOTSTRAP_SERVICE_NAME:-lsmv2-rk3568-network-bootstrap.service}"

python3 - "$ENV_FILE_PATH" "$STATUS_FILE_PATH" "$GATEWAY_SERVICE_NAME" "$BOOTSTRAP_SERVICE_NAME" <<'PY'
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

env_path = pathlib.Path(sys.argv[1])
status_path = pathlib.Path(sys.argv[2])
gateway_service = sys.argv[3]
bootstrap_service = sys.argv[4]

def run(args):
    proc = subprocess.run(args, capture_output=True, text=True)
    return {
        "command": args,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }

def read_env(path):
    result = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if "PSK" in key or "PASSWORD" in key or "SECRET" in key or "TOKEN" in key:
            result[key] = "***REDACTED***" if value else ""
        else:
            result[key] = value
    return result

def read_json(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {"decodeError": True, "message": str(exc)}

result = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "mode": "rk3568-network-bootstrap-runtime-check",
    "envFile": str(env_path),
    "statusFile": str(status_path),
    "configuredEnv": read_env(env_path),
    "bootstrapService": {
        "name": bootstrap_service,
        "isActive": run(["systemctl", "is-active", bootstrap_service]),
        "isEnabled": run(["systemctl", "is-enabled", bootstrap_service]),
    },
    "gatewayService": {
        "name": gateway_service,
        "isActive": run(["systemctl", "is-active", gateway_service]),
        "isEnabled": run(["systemctl", "is-enabled", gateway_service]),
    },
    "nmcliGeneral": run(["nmcli", "-t", "-f", "STATE,CONNECTIVITY", "general"]),
    "nmcliRadio": run(["nmcli", "-t", "-f", "WIFI-HW,WIFI,WWAN-HW,WWAN", "radio", "all"]),
    "nmcliDeviceStatus": run(["nmcli", "-t", "-f", "DEVICE,TYPE,STATE,CONNECTION", "device", "status"]),
    "nmcliConnections": run(["nmcli", "-t", "-f", "NAME,UUID,TYPE,AUTOCONNECT,DEVICE", "connection", "show"]),
    "nmcliActiveConnections": run(["nmcli", "-t", "-f", "NAME,TYPE,DEVICE", "connection", "show", "--active"]),
    "ipv4Addresses": run(["bash", "-lc", "ip -o -4 addr show | awk '{print $2\":\"$4}'"]),
    "runtimeStatus": read_json(status_path),
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PY
