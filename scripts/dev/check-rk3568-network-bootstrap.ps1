[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.172",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$EnvFile = "/etc/lsmv2/network-bootstrap.env",
  [string]$StatusFile = "/var/lib/lsmv2/network-bootstrap/status/runtime-status.json",
  [string]$GatewayServiceName = "lsmv2-field-gateway.service",
  [string]$BootstrapServiceName = "lsmv2-rk3568-network-bootstrap.service",
  [string]$SudoPassword = "",
  [string]$OutFile = "docs/unified/reports/field-rk3568-network-bootstrap-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$pythonConnectHelper = @'

import time

def connect_with_retry(client, **kwargs):
    last_error = None
    for attempt in range(1, 6):
        try:
            client.connect(
                timeout=15,
                banner_timeout=15,
                auth_timeout=15,
                look_for_keys=False,
                allow_agent=False,
                **kwargs,
            )
            return
        except Exception as exc:
            last_error = exc
            if attempt >= 5:
                raise
            time.sleep(3)
    raise last_error
'@

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
'@ + $pythonConnectHelper + @'

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = Path(sys.argv[5]).read_text(encoding="utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
connect_with_retry(client, hostname=host, username=user, password=password, port=port)
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

$repoRootLocal = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$shellScriptPath = Join-Path $repoRootLocal "services/field-gateway/deploy/check-rk3568-network-bootstrap.sh"
$shellScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $shellScriptPath -Raw -Encoding UTF8)))
$envFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($EnvFile))
$statusFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($StatusFile))
$gatewayServiceBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($GatewayServiceName))
$bootstrapServiceBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($BootstrapServiceName))
$sudoPasswordBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($(if ($SudoPassword) { $SudoPassword } else { $Password })))

$remoteScript = @'
set -euo pipefail

tmp_script="$(mktemp)"
trap 'rm -f "$tmp_script"' EXIT
printf '%s' '__SCRIPT_B64__' | base64 -d > "$tmp_script"
chmod +x "$tmp_script"

export ENV_FILE_PATH="$(printf '%s' '__ENV_B64__' | base64 -d)"
export STATUS_FILE_PATH="$(printf '%s' '__STATUS_B64__' | base64 -d)"
export GATEWAY_SERVICE_NAME="$(printf '%s' '__GATEWAY_B64__' | base64 -d)"
export BOOTSTRAP_SERVICE_NAME="$(printf '%s' '__BOOTSTRAP_B64__' | base64 -d)"
SUDO_PASSWORD="$(printf '%s' '__SUDO_PASSWORD_B64__' | base64 -d)"

if [ -n "$SUDO_PASSWORD" ]; then
  printf '%s\n' "$SUDO_PASSWORD" | sudo -S bash "$tmp_script"
else
  sudo bash "$tmp_script"
fi
'@

$remoteScript = $remoteScript.
  Replace("__SCRIPT_B64__", $shellScriptBase64).
  Replace("__ENV_B64__", $envFileBase64).
  Replace("__STATUS_B64__", $statusFileBase64).
  Replace("__GATEWAY_B64__", $gatewayServiceBase64).
  Replace("__BOOTSTRAP_B64__", $bootstrapServiceBase64).
  Replace("__SUDO_PASSWORD_B64__", $sudoPasswordBase64)

$raw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$rawText = [string]::Join([Environment]::NewLine, @($raw))
$jsonStart = $rawText.IndexOf("{")
if ($jsonStart -lt 0) {
  throw "check-rk3568-network-bootstrap did not return JSON output"
}
$result = ($rawText.Substring($jsonStart) | ConvertFrom-Json)
$resultJson = $result | ConvertTo-Json -Depth 8

if ($OutFile) {
  Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
}

$resultJson
