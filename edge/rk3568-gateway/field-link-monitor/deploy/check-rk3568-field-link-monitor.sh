#!/usr/bin/env bash

set -euo pipefail

UNIT_NAME="${UNIT_NAME:-lsmv2-field-link-monitor.service}"
ENV_FILE_PATH="${ENV_FILE_PATH:-/etc/lsmv2/field-link-monitor.env}"
SUMMARY_FILE_PATH="${SUMMARY_FILE_PATH:-/var/lib/lsmv2/field-link-monitor/status/summary.json}"
HTTP_URL="${HTTP_URL:-http://127.0.0.1:18081/v1/summary}"
AUTOMATION_URL="${AUTOMATION_URL:-http://127.0.0.1:18081/v1/automation}"

python3 - <<'PY' "${UNIT_NAME}" "${ENV_FILE_PATH}" "${SUMMARY_FILE_PATH}" "${HTTP_URL}" "${AUTOMATION_URL}"
import json
import pathlib
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone

unit_name = sys.argv[1]
env_path = pathlib.Path(sys.argv[2])
summary_path = pathlib.Path(sys.argv[3])
http_url = sys.argv[4]
automation_url = sys.argv[5]

def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def run(command: list[str]) -> dict[str, object]:
    proc = subprocess.run(command, capture_output=True, text=True)
    return {
        "command": command,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }

def read_json(path: pathlib.Path):
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

def read_env(path: pathlib.Path) -> dict[str, str]:
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        values[key] = value
    return values

def fetch_http(url: str):
    try:
        with urllib.request.urlopen(url, timeout=5) as response:
            body = response.read().decode("utf-8", errors="replace")
        return json.loads(body)
    except Exception as exc:  # noqa: BLE001
        return {"error": str(exc)}

result = {
    "generatedAt": iso_now(),
    "mode": "rk3568-field-link-monitor-runtime-check",
    "unitName": unit_name,
    "envFile": str(env_path),
    "summaryFile": str(summary_path),
    "httpUrl": http_url,
    "automationUrl": automation_url,
    "serviceState": {
        "isActive": run(["systemctl", "is-active", unit_name]),
        "isEnabled": run(["systemctl", "is-enabled", unit_name]),
        "show": run(["systemctl", "show", unit_name, "--property=ActiveState,SubState,MainPID,ExecMainStartTimestamp,FragmentPath"]),
    },
    "configuredEnv": read_env(env_path),
    "summaryFileJson": read_json(summary_path),
    "httpSummary": fetch_http(http_url),
    "httpAutomation": fetch_http(automation_url),
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PY
