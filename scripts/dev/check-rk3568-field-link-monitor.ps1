[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$RepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$UnitName = "lsmv2-field-link-monitor.service",
  [string]$EnvFile = "/etc/lsmv2/field-link-monitor.env",
  [string]$SummaryFile = "/var/lib/lsmv2/field-link-monitor/status/summary.json",
  [string]$HttpUrl = "http://127.0.0.1:18081/v1/summary",
  [string]$AutomationUrl = "http://127.0.0.1:18081/v1/automation",
  [string]$OutFile = "docs/unified/reports/field-rk3568-field-link-monitor-latest.json"
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

function Resolve-RepoRoot() {
  $here = Get-Location
  $dir = $here.Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Resolve-RepoPath {
  param(
    [string]$RootPath,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return Join-Path $RootPath $CandidatePath
}

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

$repoRootLocal = Resolve-RepoRoot
$shellScriptPath = Join-Path $repoRootLocal "services/field-link-monitor/deploy/check-rk3568-field-link-monitor.sh"
$shellScriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((Get-Content -Path $shellScriptPath -Raw -Encoding UTF8)))
$repoRootBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($RepoRoot))
$unitNameBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($UnitName))
$envFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($EnvFile))
$summaryFileBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($SummaryFile))
$httpUrlBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($HttpUrl))
$automationUrlBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($AutomationUrl))

$remoteScript = @'
set -euo pipefail

tmp_script="$(mktemp)"
trap 'rm -f "$tmp_script"' EXIT
printf '%s' '__SCRIPT_B64__' | base64 -d > "$tmp_script"
chmod +x "$tmp_script"

cd "$(printf '%s' '__REPO_ROOT_B64__' | base64 -d)"
export UNIT_NAME="$(printf '%s' '__UNIT_NAME_B64__' | base64 -d)"
export ENV_FILE_PATH="$(printf '%s' '__ENV_FILE_B64__' | base64 -d)"
export SUMMARY_FILE_PATH="$(printf '%s' '__SUMMARY_FILE_B64__' | base64 -d)"
export HTTP_URL="$(printf '%s' '__HTTP_URL_B64__' | base64 -d)"
export AUTOMATION_URL="$(printf '%s' '__AUTOMATION_URL_B64__' | base64 -d)"

bash "$tmp_script"
'@

$remoteScript = $remoteScript.
  Replace("__SCRIPT_B64__", $shellScriptBase64).
  Replace("__REPO_ROOT_B64__", $repoRootBase64).
  Replace("__UNIT_NAME_B64__", $unitNameBase64).
  Replace("__ENV_FILE_B64__", $envFileBase64).
  Replace("__SUMMARY_FILE_B64__", $summaryFileBase64).
  Replace("__HTTP_URL_B64__", $httpUrlBase64).
  Replace("__AUTOMATION_URL_B64__", $automationUrlBase64)

$raw = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$rawText = [string]::Join([Environment]::NewLine, @($raw))
$jsonStart = $rawText.IndexOf("{")
if ($jsonStart -lt 0) {
  throw "check-rk3568-field-link-monitor did not return JSON output"
}
$result = ($rawText.Substring($jsonStart) | ConvertFrom-Json)

$summaryFileJson = $result.summaryFileJson
$httpSummary = $result.httpSummary
$httpAutomation = $result.httpAutomation
$httpSummaryError = $null
if ($httpSummary -and $httpSummary.PSObject.Properties.Name -contains "error") {
  $httpSummaryError = [string]$httpSummary.error
}
$httpAutomationError = $null
if ($httpAutomation -and $httpAutomation.PSObject.Properties.Name -contains "error") {
  $httpAutomationError = [string]$httpAutomation.error
}
$summaryAccepted = ($null -ne $summaryFileJson -and [bool]$summaryFileJson.accepted)
$httpAccepted = ($null -ne $httpSummary -and [string]::IsNullOrWhiteSpace($httpSummaryError) -and [bool]$httpSummary.accepted)
$automationReady = ($null -ne $httpAutomation -and [string]::IsNullOrWhiteSpace($httpAutomationError) -and [string]$httpAutomation.mode -eq "rk3568-edge-supervision-plan" -and @($httpAutomation.tasks).Count -gt 0)
$sourceAgreement = $false
if ($summaryAccepted -and $httpAccepted) {
  $sourceAgreement = (
    ([string]$summaryFileJson.generatedAt -eq [string]$httpSummary.generatedAt) -and
    ([string]$summaryFileJson.summary.overallLevel -eq [string]$httpSummary.summary.overallLevel) -and
    ([int]$summaryFileJson.summary.score -eq [int]$httpSummary.summary.score)
  )
}

$checks = @(
  (Get-Check -Key "serviceActive" -Ok:([string]$result.serviceState.isActive.stdout -eq "active") -Actual ([string]$result.serviceState.isActive.stdout) -Expected "active"),
  (Get-Check -Key "serviceEnabled" -Ok:([string]$result.serviceState.isEnabled.stdout -eq "enabled") -Actual ([string]$result.serviceState.isEnabled.stdout) -Expected "enabled"),
  (Get-Check -Key "summaryFileAccepted" -Ok:$summaryAccepted -Actual $(if ($summaryFileJson) { [bool]$summaryFileJson.accepted } else { $null }) -Expected $true),
  (Get-Check -Key "httpSummaryAccepted" -Ok:$httpAccepted -Actual $(if ([string]::IsNullOrWhiteSpace($httpSummaryError)) { if ($httpSummary) { [bool]$httpSummary.accepted } else { $null } } else { $httpSummaryError }) -Expected $true),
  (Get-Check -Key "httpAutomationReady" -Ok:$automationReady -Actual $(if ([string]::IsNullOrWhiteSpace($httpAutomationError)) { if ($httpAutomation) { [ordered]@{ mode = [string]$httpAutomation.mode; taskCount = @($httpAutomation.tasks).Count; boundary = [string]$httpAutomation.currentBoundary } } else { $null } } else { $httpAutomationError }) -Expected "rk3568-edge-supervision-plan with at least one task"),
  (Get-Check -Key "summaryAndHttpAligned" -Ok:$sourceAgreement -Actual ([ordered]@{
    summaryGeneratedAt = if ($summaryFileJson) { [string]$summaryFileJson.generatedAt } else { $null }
    httpGeneratedAt = if ($httpSummary -and [string]::IsNullOrWhiteSpace($httpSummaryError)) { [string]$httpSummary.generatedAt } else { $null }
    summaryOverallLevel = if ($summaryFileJson) { [string]$summaryFileJson.summary.overallLevel } else { $null }
    httpOverallLevel = if ($httpSummary -and [string]::IsNullOrWhiteSpace($httpSummaryError)) { [string]$httpSummary.summary.overallLevel } else { $null }
  }) -Expected "same generatedAt/overallLevel/score across summary file and localhost http")
)

$accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
$failureKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$report = [ordered]@{
  generatedAt = [string]$result.generatedAt
  accepted = $accepted
  mode = "rk3568-field-link-monitor-runtime-check"
  currentBoundary = if ($accepted) { "rk3568-field-link-monitor-ready" } else { "rk3568-field-link-monitor-needs-review" }
  scope = [ordered]@{
    target = "rk3568-field-link-monitor-runtime"
    failureKeys = $failureKeys
  }
  unitName = [string]$result.unitName
  envFile = [string]$result.envFile
  summaryFile = [string]$result.summaryFile
  httpUrl = [string]$result.httpUrl
  automationUrl = [string]$result.automationUrl
  serviceState = $result.serviceState
  configuredEnv = $result.configuredEnv
  summaryFileJson = $summaryFileJson
  httpSummary = $httpSummary
  httpAutomation = $httpAutomation
  nextUse = @(
    "field-link-monitor check: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-link-monitor.ps1 -Password <password>",
    "edge-link quality aggregation: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-edge-link-quality.ps1",
    "gateway runtime refresh: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-runtime.ps1 -Password <password>"
  )
  checks = $checks
}

$resultJson = $report | ConvertTo-Json -Depth 8
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRootLocal -CandidatePath $OutFile
$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $resolvedOutFile -Value $resultJson -Encoding UTF8

$resultJson
