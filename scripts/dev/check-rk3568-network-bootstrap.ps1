[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.179",
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

function Get-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
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

$expectedWifiDevice = [string]$result.configuredEnv.WIFI_DEVICE
$expectedStaConnectionName = [string]$result.configuredEnv.STA_CONNECTION_NAME
$expectedApConnectionName = [string]$result.configuredEnv.AP_CONNECTION_NAME
$nmcliGeneral = [string]$result.nmcliGeneral.stdout
$nmcliRadio = [string]$result.nmcliRadio.stdout
$nmcliDeviceStatus = [string]$result.nmcliDeviceStatus.stdout
$nmcliConnections = [string]$result.nmcliConnections.stdout
$activeConnections = [string]$result.nmcliActiveConnections.stdout
$ipv4Addresses = [string]$result.ipv4Addresses.stdout
$runtimeMode = [string]$result.runtimeStatus.mode
$runtimeLastError = [string]$result.runtimeStatus.lastError
$expectedActiveConnection = "${expectedStaConnectionName}:802-11-wireless:${expectedWifiDevice}"
$healthyRuntimeModes = @("sta_connected", "ethernet_uplink")
$runtimeModeHealthy = $healthyRuntimeModes -contains $runtimeMode
$staOrEthernetConnectionOk = ($activeConnections -like "*$expectedActiveConnection*") -or ($activeConnections -like "*:802-3-ethernet:*")
$wifiDeviceReachable = (
  ($nmcliDeviceStatus -like "*${expectedWifiDevice}:wifi:connected:*") -or
  ($nmcliDeviceStatus -like "*${expectedWifiDevice}:wifi:disconnected:*")
)
$wifiRadioEnabled = ($nmcliRadio -like "*enabled:enabled*")
$apProfileMatches = @($nmcliConnections -split "`r?`n" | Where-Object { $_ -like "${expectedApConnectionName}:*" })
$apProfileCount = $apProfileMatches.Count
$apFallbackActive = ($activeConnections -like "*${expectedApConnectionName}:802-11-wireless:${expectedWifiDevice}*")
$apSuppressedWhileHealthy = ((-not $runtimeModeHealthy) -or (-not $apFallbackActive))

$checks = @(
  (Get-Check -Key "bootstrapServiceActive" -Ok:([string]$result.bootstrapService.isActive.stdout -eq "active") -Actual ([string]$result.bootstrapService.isActive.stdout) -Expected "active"),
  (Get-Check -Key "bootstrapServiceEnabled" -Ok:([string]$result.bootstrapService.isEnabled.stdout -eq "enabled") -Actual ([string]$result.bootstrapService.isEnabled.stdout) -Expected "enabled"),
  (Get-Check -Key "gatewayServiceActive" -Ok:([string]$result.gatewayService.isActive.stdout -eq "active") -Actual ([string]$result.gatewayService.isActive.stdout) -Expected "active"),
  (Get-Check -Key "gatewayServiceEnabled" -Ok:([string]$result.gatewayService.isEnabled.stdout -eq "enabled") -Actual ([string]$result.gatewayService.isEnabled.stdout) -Expected "enabled"),
  (Get-Check -Key "nmcliConnectedFull" -Ok:($nmcliGeneral -eq "connected:full") -Actual $nmcliGeneral -Expected "connected:full"),
  (Get-Check -Key "wifiRadioEnabled" -Ok:$wifiRadioEnabled -Actual $nmcliRadio -Expected "enabled:enabled:<wwan-hw>:<wwan>"),
  (Get-Check -Key "wifiDeviceReachable" -Ok:$wifiDeviceReachable -Actual $nmcliDeviceStatus -Expected "${expectedWifiDevice}:wifi:connected|disconnected:<connection>"),
  (Get-Check -Key "apProfileCanonicalSingle" -Ok:($apProfileCount -eq 1) -Actual $apProfileCount -Expected 1),
  (Get-Check -Key "apSuppressedWhileHealthy" -Ok:$apSuppressedWhileHealthy -Actual $activeConnections -Expected "${expectedApConnectionName} inactive while mode=sta_connected|ethernet_uplink"),
  (Get-Check -Key "uplinkConnectionActive" -Ok:$staOrEthernetConnectionOk -Actual $activeConnections -Expected "$expectedActiveConnection or <ethernet-uplink>"),
  (Get-Check -Key "runtimeModeHealthyUplink" -Ok:$runtimeModeHealthy -Actual $runtimeMode -Expected "sta_connected|ethernet_uplink"),
  (Get-Check -Key "runtimeLastErrorClear" -Ok:([string]::IsNullOrWhiteSpace($runtimeLastError)) -Actual $(if ([string]::IsNullOrWhiteSpace($runtimeLastError)) { $null } else { $runtimeLastError }) -Expected $null),
  (Get-Check -Key "ipv4PresentOnUplink" -Ok:(($ipv4Addresses -like "*${expectedWifiDevice}:*") -or ($ipv4Addresses -like "*eth0:*")) -Actual $ipv4Addresses -Expected "${expectedWifiDevice}:<ipv4> or eth0:<ipv4>")
)

$accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
$failureKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$report = [ordered]@{
  generatedAt = [string]$result.generatedAt
  accepted = $accepted
  mode = [string]$result.mode
  currentBoundary = if ($accepted) { "rk3568-network-bootstrap-ready" } else { "rk3568-network-bootstrap-needs-review" }
  scope = [ordered]@{
    target = "rk3568-network-bootstrap-runtime"
    failureKeys = $failureKeys
  }
  envFile = [string]$result.envFile
  statusFile = [string]$result.statusFile
  configuredEnv = $result.configuredEnv
  bootstrapService = $result.bootstrapService
  gatewayService = $result.gatewayService
  nmcliGeneral = $result.nmcliGeneral
  nmcliRadio = $result.nmcliRadio
  nmcliDeviceStatus = $result.nmcliDeviceStatus
  nmcliConnections = $result.nmcliConnections
  nmcliActiveConnections = $result.nmcliActiveConnections
  ipv4Addresses = $result.ipv4Addresses
  runtimeStatus = $result.runtimeStatus
  nextUse = @(
    "bootstrap check: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-network-bootstrap.ps1 -Password <password>",
    "bootstrap install/update: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\install-rk3568-network-bootstrap.ps1 -Password <password> -WifiDevice wlan0 -StaConnectionName JRSPR_5G",
    "routine guard: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-routine-guard.ps1 -BoardPassword <password> -AllowUnsafeSecrets"
  )
  checks = $checks
}

$resultJson = $report | ConvertTo-Json -Depth 8

if ($OutFile) {
  Set-Content -Path $OutFile -Value $resultJson -Encoding UTF8
}

$resultJson
