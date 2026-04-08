[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$MqttUrl = "mqtt://192.168.124.17:1883",
  [string]$RunUser = "linaro",
  [string]$RunGroup = "linaro",
  [string]$EnvFile = "/etc/lsmv2/field-gateway.env",
  [string]$StateRoot = "/var/lib/lsmv2/field-gateway",
  [string]$SerialDevice = "/dev/ttyS3",
  [int]$SerialBaudRate = 115200,
  [switch]$SkipBuild,
  [switch]$OverwriteEnv,
  [switch]$NoEnable
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
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=900)
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

$repoRootLocal = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$installScriptPath = Join-Path $repoRootLocal "services/field-gateway/deploy/install-rk3568.sh"
$checkScriptPath = Join-Path $repoRootLocal "services/field-gateway/deploy/check-rk3568-runtime.sh"
$installScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $installScriptPath -Raw -Encoding UTF8)))
$checkScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $checkScriptPath -Raw -Encoding UTF8)))

$argList = @(
  "--repo-root", $RepoRoot,
  "--run-user", $RunUser,
  "--run-group", $RunGroup,
  "--env-file", $EnvFile,
  "--state-root", $StateRoot,
  "--mqtt-url", $MqttUrl,
  "--serial-device", $SerialDevice,
  "--serial-baud-rate", ([string]$SerialBaudRate)
)
if ($SkipBuild) { $argList += "--skip-build" }
if ($OverwriteEnv) { $argList += "--overwrite-env" }
if ($NoEnable) { $argList += "--no-enable" }

$argJsonBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes(($argList | ConvertTo-Json -Compress)))
$repoRootBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RepoRoot))
$envFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($EnvFile))
$healthFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("$StateRoot/health/runtime-health.json"))
$passwordBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Password))

$remoteScript = @'
set -euo pipefail

tmp_install="$(mktemp)"
tmp_check="$(mktemp)"
trap 'rm -f "$tmp_install" "$tmp_check"' EXIT

printf '%s' '__INSTALL_SCRIPT_B64__' | base64 -d > "$tmp_install"
printf '%s' '__CHECK_SCRIPT_B64__' | base64 -d > "$tmp_check"
chmod +x "$tmp_install" "$tmp_check"

mapfile -t INSTALL_ARGS < <(
  python3 - <<'PY'
import base64
import json

for item in json.loads(base64.b64decode('__ARG_JSON_B64__').decode('utf-8')):
    print(item)
PY
)

SUDO_PASSWORD="$(printf '%s' '__PASSWORD_B64__' | base64 -d)"
if [ -n "$SUDO_PASSWORD" ]; then
  printf '%s\n' "$SUDO_PASSWORD" | sudo -S bash "$tmp_install" "${INSTALL_ARGS[@]}"
else
  sudo bash "$tmp_install" "${INSTALL_ARGS[@]}"
fi

export REPO_ROOT="$(printf '%s' '__REPO_ROOT_B64__' | base64 -d)"
export SYSTEMD_UNIT_NAME='lsmv2-field-gateway'
export ENV_FILE_PATH="$(printf '%s' '__ENV_FILE_B64__' | base64 -d)"
export HEALTH_FILE_PATH="$(printf '%s' '__HEALTH_FILE_B64__' | base64 -d)"
export JOURNAL_LINES='40'

bash "$tmp_check"
'@

$remoteScript = $remoteScript.
  Replace("__INSTALL_SCRIPT_B64__", $installScriptBase64).
  Replace("__CHECK_SCRIPT_B64__", $checkScriptBase64).
  Replace("__ARG_JSON_B64__", $argJsonBase64).
  Replace("__PASSWORD_B64__", $passwordBase64).
  Replace("__REPO_ROOT_B64__", $repoRootBase64).
  Replace("__ENV_FILE_B64__", $envFileBase64).
  Replace("__HEALTH_FILE_B64__", $healthFileBase64)

$raw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$jsonStart = $raw.IndexOf("{")
if ($jsonStart -lt 0) {
  throw "install-rk3568-field-gateway did not return JSON runtime snapshot"
}
$jsonText = $raw.Substring($jsonStart)
$result = $jsonText | ConvertFrom-Json
$resultJson = $result | ConvertTo-Json -Depth 8
$resultJson
