[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$NodeSpec,
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$EnvFile = "/etc/lsmv2/field-gateway.env",
  [string]$HealthFile = "/var/lib/lsmv2/field-gateway/health/runtime-health.json",
  [string]$ServiceName = "lsmv2-field-gateway.service",
  [switch]$NoRestart
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-RemoteBash {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$ScriptText
  )

  if ($TargetPassword) {
    $tempScriptFile = [System.IO.Path]::GetTempFileName()
    $pythonSnippet = @'
import sys
import paramiko
from pathlib import Path

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = Path(sys.argv[5]).read_text(encoding="utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=host, username=user, password=password, port=port, timeout=15, banner_timeout=15, auth_timeout=15)
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=120)
stdin.write(script)
stdin.flush()
stdin.channel.shutdown_write()
sys.stdout.write(stdout.read().decode("utf-8", errors="replace"))
sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
code = stdout.channel.recv_exit_status()
client.close()
raise SystemExit(code)
'@

    try {
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::WriteAllText($tempScriptFile, $ScriptText, $utf8NoBom)
      $pythonSnippet | & python - $TargetHost $TargetUser $TargetPassword ([string]$TargetPort) $tempScriptFile
    } finally {
      Remove-Item $tempScriptFile -Force -ErrorAction SilentlyContinue
    }
    return
  }

  $sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
  $sshArgs = @(
    "-p"
    ([string]$TargetPort)
    "-o"
    "StrictHostKeyChecking=accept-new"
    "-o"
    "ServerAliveInterval=15"
    "-o"
    "ServerAliveCountMax=3"
    ("{0}@{1}" -f $TargetUser, $TargetHost)
    "bash"
    "-s"
    "--"
  )

  $ScriptText | & $sshExe @sshArgs
}

function Convert-NodeSpecToObject {
  param([string]$Value)

  $parts = @($Value.Split('|'))
  if ($parts.Count -lt 3 -or $parts.Count -gt 5) {
    throw "Invalid NodeSpec '$Value'. Expected: fieldNodeId|deviceId|southboundPort|installLabel|enabled"
  }

  $fieldNodeId = $parts[0].Trim()
  $deviceId = $parts[1].Trim()
  $southboundPort = $parts[2].Trim()
  $installLabel = if ($parts.Count -ge 4) { $parts[3].Trim() } else { "" }
  $enabled = if ($parts.Count -ge 5) { [System.Convert]::ToBoolean($parts[4].Trim()) } else { $true }

  if (-not $fieldNodeId) {
    throw "NodeSpec '$Value' has empty fieldNodeId"
  }

  [guid]::Parse($deviceId) | Out-Null

  if (-not $southboundPort.StartsWith("/dev/")) {
    throw "NodeSpec '$Value' southboundPort must start with /dev/"
  }

  $node = [ordered]@{
    fieldNodeId = $fieldNodeId
    deviceId = $deviceId
    installLabel = if ($installLabel) { $installLabel } else { "FIELD-NODE-$fieldNodeId" }
    southboundPort = $southboundPort
    enabled = [bool]$enabled
  }

  return $node
}

$nodes = @($NodeSpec | ForEach-Object { Convert-NodeSpecToObject -Value $_ })
$nodesJson = $nodes | ConvertTo-Json -Depth 6 -Compress
$nodesJsonBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($nodesJson))
$restartValue = if ($NoRestart) { "0" } else { "1" }

$remoteScript = @'
set -euo pipefail

env_file='__ENV_FILE__'
health_file='__HEALTH_FILE__'
service_name='__SERVICE_NAME__'
restart_service='__RESTART_VALUE__'
nodes_b64='__NODES_B64__'

work_file="$(mktemp)"
backup_file=""

python3 - "$env_file" "$work_file" "$nodes_b64" <<'PY'
import base64
import pathlib
import sys

env_path = pathlib.Path(sys.argv[1])
out_path = pathlib.Path(sys.argv[2])
nodes_json = base64.b64decode(sys.argv[3]).decode("utf-8")

required = {
    "MQTT_TOPIC_COMMAND_PREFIX": "cmd/",
    "MQTT_TOPIC_ACK_PREFIX": "cmd_ack/",
    "SOUTHBOUND_NODES_JSON": nodes_json,
}

lines = []
if env_path.exists():
    lines = env_path.read_text(encoding="utf-8").splitlines()

output = []
seen = set()
for raw in lines:
    if "=" not in raw or raw.lstrip().startswith("#") or not raw.strip():
        output.append(raw)
        continue
    key, value = raw.split("=", 1)
    if key in required:
        output.append(f"{key}={required[key]}")
        seen.add(key)
    else:
        output.append(raw)

for key in ("MQTT_TOPIC_COMMAND_PREFIX", "MQTT_TOPIC_ACK_PREFIX", "SOUTHBOUND_NODES_JSON"):
    if key not in seen:
        output.append(f"{key}={required[key]}")

out_path.write_text("\n".join(output) + "\n", encoding="utf-8")
PY

if [ -f "$env_file" ]; then
  backup_file="${env_file}.bak.$(date +%Y%m%d-%H%M%S)"
  sudo cp "$env_file" "$backup_file"
fi

sudo install -m 0640 "$work_file" "$env_file"
sudo chown root:"$(id -gn)" "$env_file" || true
rm -f "$work_file"

if [ "$restart_service" = "1" ]; then
  sudo systemctl restart "$service_name"
fi

python3 - "$env_file" "$health_file" "$service_name" "$backup_file" "$nodes_b64" "$restart_service" <<'PY'
import base64
import json
import pathlib
import subprocess
import sys
from datetime import datetime, timezone

env_file = pathlib.Path(sys.argv[1])
health_file = pathlib.Path(sys.argv[2])
service_name = sys.argv[3]
backup_file = sys.argv[4]
nodes = json.loads(base64.b64decode(sys.argv[5]).decode("utf-8"))
restart_service = sys.argv[6] == "1"

health = None
if health_file.exists():
    try:
        health = json.loads(health_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        health = {"decodeError": True}

service_state = None
proc = subprocess.run(["systemctl", "is-active", service_name], capture_output=True, text=True)
if proc.stdout:
    service_state = proc.stdout.strip()

result = {
    "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "envFile": str(env_file),
    "backupFile": backup_file or None,
    "serviceName": service_name,
    "serviceRestarted": restart_service,
    "serviceState": service_state,
    "southboundNodes": nodes,
    "healthFile": str(health_file),
    "runtimeHealth": health,
}

print(json.dumps(result, ensure_ascii=False, indent=2))
PY
'@

$remoteScript = $remoteScript.
  Replace("__ENV_FILE__", $EnvFile).
  Replace("__HEALTH_FILE__", $HealthFile).
  Replace("__SERVICE_NAME__", $ServiceName).
  Replace("__RESTART_VALUE__", $restartValue).
  Replace("__NODES_B64__", $nodesJsonBase64)

Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
