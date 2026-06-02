[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$ServiceName = "lsmv2-field-gateway",
  [string]$EnvFile = "/etc/lsmv2/field-gateway.env",
  [string]$HealthFile = "/var/lib/lsmv2/field-gateway/health/runtime-health.json",
  [int]$JournalLines = 80,
  [string]$OutFile = "docs/unified/reports/field-rk3568-gateway-runtime-latest.json"
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
client.connect(hostname=host, username=user, password=password, port=port, timeout=20, banner_timeout=60, auth_timeout=30)
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=180)
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

$localRepoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$shellScriptPath = Join-Path $localRepoRoot "services/field-gateway/deploy/check-rk3568-runtime.sh"
$shellScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $shellScriptPath -Raw -Encoding UTF8)))
$repoRootBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RepoRoot))
$serviceNameBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($ServiceName))
$envFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($EnvFile))
$healthFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($HealthFile))

$remoteScript = @'
set -euo pipefail

tmp_script="$(mktemp)"
trap 'rm -f "$tmp_script"' EXIT
printf '%s' '__SHELL_SCRIPT_B64__' | base64 -d > "$tmp_script"
chmod +x "$tmp_script"

export REPO_ROOT="$(printf '%s' '__REPO_ROOT_B64__' | base64 -d)"
export SYSTEMD_UNIT_NAME="$(printf '%s' '__SERVICE_NAME_B64__' | base64 -d)"
export ENV_FILE_PATH="$(printf '%s' '__ENV_FILE_B64__' | base64 -d)"
export HEALTH_FILE_PATH="$(printf '%s' '__HEALTH_FILE_B64__' | base64 -d)"
export JOURNAL_LINES='__JOURNAL_LINES__'

bash "$tmp_script"
'@

$remoteScript = $remoteScript.
  Replace("__SHELL_SCRIPT_B64__", $shellScriptBase64).
  Replace("__REPO_ROOT_B64__", $repoRootBase64).
  Replace("__SERVICE_NAME_B64__", $serviceNameBase64).
  Replace("__ENV_FILE_B64__", $envFileBase64).
  Replace("__HEALTH_FILE_B64__", $healthFileBase64).
  Replace("__JOURNAL_LINES__", [string]$JournalLines)

$raw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$result = $raw | ConvertFrom-Json
$resultJson = $result | ConvertTo-Json -Depth 8

if ($OutFile) {
  Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
}

$resultJson
