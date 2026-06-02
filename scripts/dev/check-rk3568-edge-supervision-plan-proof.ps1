[CmdletBinding()]
param(
  [int]$HttpPort = 18091,
  [string]$OutFile = "docs/unified/reports/rk3568-edge-supervision-plan-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

function Write-JsonFile {
  param(
    [string]$Path,
    $Value
  )

  $dir = Split-Path -Parent $Path
  if ($dir -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }

  $json = $Value | ConvertTo-Json -Depth 12
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $json, $utf8NoBom)
}

function Wait-JsonEndpoint {
  param(
    [string]$Url,
    [System.Diagnostics.Process]$Process,
    [int]$TimeoutSeconds = 20
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $lastError = $null
  while ((Get-Date) -lt $deadline) {
    if ($Process.HasExited) {
      throw "field-link-monitor exited before endpoint became ready. exit=$($Process.ExitCode)"
    }

    try {
      return Invoke-RestMethod -Method Get -Uri $Url -TimeoutSec 3
    } catch {
      $lastError = $_.Exception.Message
      Start-Sleep -Milliseconds 500
    }
  }

  throw "Timed out waiting for $Url. Last error: $lastError"
}

$repoRoot = Resolve-RepoRoot
$serviceRoot = Join-Path $repoRoot "services/field-link-monitor"
$proofRoot = Join-Path $repoRoot ".tmp/rk3568-edge-supervision-plan-proof"
$gatewayHealthFile = Join-Path $proofRoot "field-gateway/health/runtime-health.json"
$networkStatusFile = Join-Path $proofRoot "network-bootstrap/status/runtime-status.json"
$summaryFile = Join-Path $proofRoot "field-link-monitor/status/summary.json"
$stdoutFile = Join-Path $proofRoot "field-link-monitor.stdout.log"
$stderrFile = Join-Path $proofRoot "field-link-monitor.stderr.log"
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile

New-Item -ItemType Directory -Path $proofRoot -Force | Out-Null

$now = (Get-Date).ToUniversalTime()
$stalePublished = $now.AddMinutes(-3).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
$fresh = $now.ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

Write-JsonFile -Path $gatewayHealthFile -Value ([ordered]@{
  emitted_ts = $fresh
  serial = [ordered]@{
    open = $true
  }
  mqtt = [ordered]@{
    connected = $true
  }
  southbound = [ordered]@{
    ports = @(
      [ordered]@{
        path = "/dev/ttyS3"
        status = "online"
      }
    )
    nodes = @(
      [ordered]@{
        fieldNodeId = "A"
        deviceId = "00000000-0000-0000-0000-000000000001"
        status = "online"
        telemetryMessages = 120
        commandForwards = 3
        ackPublishes = 3
        lastTelemetryTs = $fresh
      }
    )
  }
  stats = [ordered]@{
    spoolPending = 2
    rejectedWriteFailures = 0
    rejectedMessages = 4
    schemaRejected = 3
    interleavingSuspected = 1
    interleavingWithMultipleSchemas = 1
    interleavingWithMultipleDeviceIds = 1
    publishFailures = 1
    lastPublishedTs = $stalePublished
    lastSerialReadTs = $fresh
    lastInterleavingTs = $fresh
    lastInterleavingSummary = "fixture shared-port interleaving evidence"
  }
})

Write-JsonFile -Path $networkStatusFile -Value ([ordered]@{
  generatedAt = $fresh
  mode = "ap_fallback"
  lastError = "fixture sta backhaul unavailable"
  wifiDevice = "wlan0"
  lastAction = "fallback_ap_started"
})

$nodeExe = (Get-Command node -ErrorAction Stop).Source
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $nodeExe
$psi.Arguments = "dist/index.js"
$psi.WorkingDirectory = $serviceRoot
$psi.UseShellExecute = $false
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.CreateNoWindow = $true
$psi.EnvironmentVariables["SERVICE_NAME"] = "field-link-monitor-proof"
$psi.EnvironmentVariables["GATEWAY_HEALTH_FILE_PATH"] = $gatewayHealthFile
$psi.EnvironmentVariables["NETWORK_STATUS_FILE_PATH"] = $networkStatusFile
$psi.EnvironmentVariables["SUMMARY_FILE_PATH"] = $summaryFile
$psi.EnvironmentVariables["HTTP_HOST"] = "127.0.0.1"
$psi.EnvironmentVariables["HTTP_PORT"] = [string]$HttpPort
$psi.EnvironmentVariables["POLL_INTERVAL_MS"] = "1000"
$psi.EnvironmentVariables["PUBLISH_FRESHNESS_MS"] = "30000"
$psi.EnvironmentVariables["SOURCE_STALE_AFTER_MS"] = "120000"

$process = New-Object System.Diagnostics.Process
$process.StartInfo = $psi
$null = $process.Start()

try {
  $summaryUrl = "http://127.0.0.1:$HttpPort/v1/summary"
  $automationUrl = "http://127.0.0.1:$HttpPort/v1/automation"
  $summary = Wait-JsonEndpoint -Url $summaryUrl -Process $process
  $automation = Wait-JsonEndpoint -Url $automationUrl -Process $process

  $taskKeys = @($automation.tasks | ForEach-Object { [string]$_.key })
  $requiredTaskKeys = @(
    "network_bootstrap_review",
    "northbound_publish_drain",
    "shared_port_noise_evidence",
    "source_interleaving_review"
  )
  $missingTaskKeys = @($requiredTaskKeys | Where-Object { $taskKeys -notcontains $_ })
  $accepted = (
    [bool]$summary.accepted -and
    [string]$automation.mode -eq "rk3568-edge-supervision-plan" -and
    @($automation.tasks).Count -ge 4 -and
    $missingTaskKeys.Count -eq 0 -and
    [bool]$automation.governance.gatewayCoreProtected -and
    [bool]$automation.governance.serialIngestProtected -and
    [bool]$automation.governance.mqttUplinkProtected
  )

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "rk3568-edge-supervision-plan-proof"
    currentBoundary = if ($accepted) { "rk3568-edge-supervision-plan-proof-ready" } else { "rk3568-edge-supervision-plan-proof-needs-review" }
    scope = [ordered]@{
      target = "field-link-monitor-automation-endpoint"
      summaryUrl = $summaryUrl
      automationUrl = $automationUrl
      missingTaskKeys = $missingTaskKeys
    }
    summary = $summary
    automation = $automation
  }

  Write-JsonFile -Path $resolvedOutFile -Value $report
  $report | ConvertTo-Json -Depth 12
} finally {
  if (-not $process.HasExited) {
    $process.Kill()
    $process.WaitForExit(5000) | Out-Null
  }

  Set-Content -LiteralPath $stdoutFile -Value $process.StandardOutput.ReadToEnd() -Encoding UTF8
  Set-Content -LiteralPath $stderrFile -Value $process.StandardError.ReadToEnd() -Encoding UTF8
}
