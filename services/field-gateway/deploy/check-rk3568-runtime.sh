#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT_DEFAULT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"

REPO_ROOT="${REPO_ROOT:-${REPO_ROOT_DEFAULT}}"
SYSTEMD_UNIT_NAME="${SYSTEMD_UNIT_NAME:-lsmv2-field-gateway}"
ENV_FILE_PATH="${ENV_FILE_PATH:-/etc/lsmv2/field-gateway.env}"
HEALTH_FILE_PATH="${HEALTH_FILE_PATH:-/var/lib/lsmv2/field-gateway/health/runtime-health.json}"
JOURNAL_LINES="${JOURNAL_LINES:-80}"

python3 - <<'PY'
import json
import os
import pathlib
import subprocess
from datetime import datetime, timezone

repo_root = pathlib.Path(os.environ.get("REPO_ROOT", ""))
systemd_unit_name = os.environ.get("SYSTEMD_UNIT_NAME", "lsmv2-field-gateway")
env_file_path = pathlib.Path(os.environ.get("ENV_FILE_PATH", "/etc/lsmv2/field-gateway.env"))
health_file_path = pathlib.Path(os.environ.get("HEALTH_FILE_PATH", "/var/lib/lsmv2/field-gateway/health/runtime-health.json"))
journal_lines = int(os.environ.get("JOURNAL_LINES", "80"))
service_name = f"{systemd_unit_name}.service"

def run(args):
    proc = subprocess.run(args, capture_output=True, text=True)
    return {
        "command": args,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip(),
        "stderr": proc.stderr.strip(),
    }

def read_env(path):
    env = {}
    if not path.exists():
        return env
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        upper_key = key.upper()
        if "PASSWORD" in upper_key or "SECRET" in upper_key or "TOKEN" in upper_key:
            env[key] = "***REDACTED***"
        else:
            env[key] = value
    return env

def read_json(path):
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        return {
            "decodeError": True,
            "message": str(exc),
        }

def journal_tail():
    proc = subprocess.run(
        ["journalctl", "-u", service_name, "-n", str(journal_lines), "--no-pager"],
        capture_output=True,
        text=True,
    )
    return {
        "returncode": proc.returncode,
        "lines": proc.stdout.splitlines() if proc.stdout else [],
        "stderr": proc.stderr.strip(),
    }

git_head = None
if repo_root.exists() and (repo_root / ".git").exists():
    git_head = run(["git", "-C", str(repo_root), "rev-parse", "HEAD"])

result = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "serviceName": service_name,
    "repoRoot": str(repo_root),
    "envFile": str(env_file_path),
    "healthFile": str(health_file_path),
    "host": {
        "hostname": run(["hostname"])["stdout"],
        "kernel": run(["uname", "-a"])["stdout"],
        "node": run(["bash", "-lc", "command -v node >/dev/null 2>&1 && node -v || true"])["stdout"],
        "npm": run(["bash", "-lc", "command -v npm >/dev/null 2>&1 && npm -v || true"])["stdout"],
        "python3": run(["bash", "-lc", "command -v python3 >/dev/null 2>&1 && python3 --version || true"])["stdout"],
    },
    "gitHead": git_head,
    "serviceState": {
        "isActive": run(["systemctl", "is-active", service_name]),
        "isEnabled": run(["systemctl", "is-enabled", service_name]),
        "show": run(
            [
                "systemctl",
                "show",
                service_name,
                "--property=ActiveState,SubState,MainPID,ExecMainStatus,ExecMainStartTimestamp,FragmentPath",
            ]
        ),
    },
    "configuredEnv": read_env(env_file_path),
    "runtimeHealth": read_json(health_file_path),
    "journalTail": journal_tail(),
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PY
