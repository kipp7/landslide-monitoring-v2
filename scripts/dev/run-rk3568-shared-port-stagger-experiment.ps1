[CmdletBinding()]
param(
  [int]$NodeAReportIntervalSeconds = 5,
  [int]$NodeBReportIntervalSeconds = 7,
  [int]$NodeCReportIntervalSeconds = 11,
  [int]$ObservationDurationSeconds = 90,
  [int]$PollSeconds = 5,
  [int]$SettleSeconds = 20,
  [int]$NodeCommandWaitSeconds = 15,
  [int]$NodeCommandPollSeconds = 2,
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$MqttUrl = "mqtt://192.168.124.17:1883",
  [switch]$RestoreFiveSecondProfile = $true,
  [string]$OutFile = "docs/unified/reports/field-rk3568-shared-port-stagger-experiment-latest.json"
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

function Convert-TextToJsonObject {
  param(
    [string]$Text,
    [string]$Label
  )

  $trimmed = $Text.Trim()
  if (-not $trimmed) {
    throw "$Label returned empty output"
  }

  $jsonStart = $trimmed.IndexOf("{")
  $jsonEnd = $trimmed.LastIndexOf("}")
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    throw "$Label did not return JSON output"
  }

  return ($trimmed.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)
}

function Invoke-JsonStep {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "==> $Label" -ForegroundColor Cyan
  $output = & $Action | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }

  return Convert-TextToJsonObject -Text $output -Label $Label
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "JSON file not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function Get-NodeByFieldNodeId {
  param(
    $RuntimeReport,
    [string]$FieldNodeId
  )

  return @($RuntimeReport.runtimeHealth.southbound.nodes | Where-Object { $_.fieldNodeId -eq $FieldNodeId } | Select-Object -First 1)[0]
}

function Get-NodeDeviceMap {
  param($RuntimeReport)

  return [pscustomobject][ordered]@{
    A = [string](Get-NodeByFieldNodeId -RuntimeReport $RuntimeReport -FieldNodeId "A").deviceId
    B = [string](Get-NodeByFieldNodeId -RuntimeReport $RuntimeReport -FieldNodeId "B").deviceId
    C = [string](Get-NodeByFieldNodeId -RuntimeReport $RuntimeReport -FieldNodeId "C").deviceId
  }
}

function Get-RuntimeCounterSummary {
  param($RuntimeReport)

  $stats = $RuntimeReport.runtimeHealth.stats
  $nodeA = Get-NodeByFieldNodeId -RuntimeReport $RuntimeReport -FieldNodeId "A"
  $nodeB = Get-NodeByFieldNodeId -RuntimeReport $RuntimeReport -FieldNodeId "B"
  $nodeC = Get-NodeByFieldNodeId -RuntimeReport $RuntimeReport -FieldNodeId "C"

  return [pscustomobject][ordered]@{
    emittedTs = [string]$RuntimeReport.runtimeHealth.emitted_ts
    parsedMessages = [int]$stats.parsedMessages
    publishedMessages = [int]$stats.publishedMessages
    schemaRejected = [int]$stats.schemaRejected
    rejectedMessages = [int]$stats.rejectedMessages
    rejectedWriteFailures = [int]$stats.rejectedWriteFailures
    publishFailures = [int]$stats.publishFailures
    interleavingSuspected = [int]$stats.interleavingSuspected
    interleavingWithMultipleSchemas = [int]$stats.interleavingWithMultipleSchemas
    interleavingWithMultipleDeviceIds = [int]$stats.interleavingWithMultipleDeviceIds
    lastInterleavingTs = [string]$stats.lastInterleavingTs
    lastInterleavingSummary = [string]$stats.lastInterleavingSummary
    nodeAStatus = [string]$nodeA.status
    nodeATelemetryMessages = [int]$nodeA.telemetryMessages
    nodeBStatus = [string]$nodeB.status
    nodeBTelemetryMessages = [int]$nodeB.telemetryMessages
    nodeCStatus = [string]$nodeC.status
    nodeCTelemetryMessages = [int]$nodeC.telemetryMessages
  }
}

function Get-CounterDelta {
  param(
    $Before,
    $After
  )

  return [pscustomobject][ordered]@{
    parsedMessages = [int]$After.parsedMessages - [int]$Before.parsedMessages
    publishedMessages = [int]$After.publishedMessages - [int]$Before.publishedMessages
    schemaRejected = [int]$After.schemaRejected - [int]$Before.schemaRejected
    rejectedMessages = [int]$After.rejectedMessages - [int]$Before.rejectedMessages
    rejectedWriteFailures = [int]$After.rejectedWriteFailures - [int]$Before.rejectedWriteFailures
    publishFailures = [int]$After.publishFailures - [int]$Before.publishFailures
    interleavingSuspected = [int]$After.interleavingSuspected - [int]$Before.interleavingSuspected
    interleavingWithMultipleSchemas = [int]$After.interleavingWithMultipleSchemas - [int]$Before.interleavingWithMultipleSchemas
    interleavingWithMultipleDeviceIds = [int]$After.interleavingWithMultipleDeviceIds - [int]$Before.interleavingWithMultipleDeviceIds
    nodeATelemetryMessages = [int]$After.nodeATelemetryMessages - [int]$Before.nodeATelemetryMessages
    nodeBTelemetryMessages = [int]$After.nodeBTelemetryMessages - [int]$Before.nodeBTelemetryMessages
    nodeCTelemetryMessages = [int]$After.nodeCTelemetryMessages - [int]$Before.nodeCTelemetryMessages
  }
}

function Invoke-NodeSetReport {
  param(
    [string]$RepoRoot,
    [string]$DeviceId,
    [int]$ReportIntervalSeconds,
    [string]$NodeLabel,
    [int]$WaitSeconds,
    [int]$PollSeconds
  )

  return Invoke-JsonStep -Label ("Set {0} report interval to {1}s" -f $NodeLabel, $ReportIntervalSeconds) {
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RepoRoot "scripts/dev/run-rk3568-field-gateway-node-command-proof.ps1") `
      -DeviceId $DeviceId `
      -Action "set-report-custom" `
      -ReportIntervalSeconds $ReportIntervalSeconds `
      -BoardHost $BoardHost `
      -User $User `
      -Password $Password `
      -SshPort $SshPort `
      -MqttUrl $MqttUrl `
      -WaitSeconds $WaitSeconds `
      -PollSeconds $PollSeconds
  }
}

if ($ObservationDurationSeconds -lt 30) {
  throw "ObservationDurationSeconds must be >= 30"
}
if ($NodeCommandWaitSeconds -lt 1) {
  throw "NodeCommandWaitSeconds must be >= 1"
}
if ($NodeCommandPollSeconds -lt 1) {
  throw "NodeCommandPollSeconds must be >= 1"
}

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Join-Path $repoRoot $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$runtimeScript = Join-Path $repoRoot "scripts/dev/check-rk3568-field-gateway-runtime.ps1"
$runtimeBefore = Invoke-JsonStep -Label "Capture runtime before stagger experiment" {
  powershell -NoProfile -ExecutionPolicy Bypass -File $runtimeScript `
    -BoardHost $BoardHost `
    -User $User `
    -Password $Password `
    -SshPort $SshPort
}
$deviceMap = Get-NodeDeviceMap -RuntimeReport $runtimeBefore
$beforeSummary = Get-RuntimeCounterSummary -RuntimeReport $runtimeBefore

$applyResults = New-Object System.Collections.Generic.List[object]
$restoreResults = New-Object System.Collections.Generic.List[object]
$samples = New-Object System.Collections.Generic.List[object]
$runtimeAfterApply = $null
$runtimeAfterObservation = $null
$afterApplySummary = $null
$afterObservationSummary = $null
$applyDelta = $null
$observationDelta = $null
$applyResultArray = @()
$restoreResultArray = @()
$sampleArray = @()
$observationPassed = $true
$observationError = $null
$observationReport = $null
$conclusion = ""
$passed = $false

try {
  $applyResults.Add((Invoke-NodeSetReport -RepoRoot $repoRoot -DeviceId $deviceMap.A -ReportIntervalSeconds $NodeAReportIntervalSeconds -NodeLabel "node A" -WaitSeconds $NodeCommandWaitSeconds -PollSeconds $NodeCommandPollSeconds))
  $applyResults.Add((Invoke-NodeSetReport -RepoRoot $repoRoot -DeviceId $deviceMap.B -ReportIntervalSeconds $NodeBReportIntervalSeconds -NodeLabel "node B" -WaitSeconds $NodeCommandWaitSeconds -PollSeconds $NodeCommandPollSeconds))
  $applyResults.Add((Invoke-NodeSetReport -RepoRoot $repoRoot -DeviceId $deviceMap.C -ReportIntervalSeconds $NodeCReportIntervalSeconds -NodeLabel "node C" -WaitSeconds $NodeCommandWaitSeconds -PollSeconds $NodeCommandPollSeconds))

  if ($SettleSeconds -gt 0) {
    Write-Host ("==> Settling stagger profile for {0}s" -f $SettleSeconds) -ForegroundColor Cyan
    Start-Sleep -Seconds $SettleSeconds
  }

  $runtimeAfterApply = Invoke-JsonStep -Label "Capture runtime after stagger apply" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $runtimeScript `
      -BoardHost $BoardHost `
      -User $User `
      -Password $Password `
      -SshPort $SshPort
  }

  $deadline = (Get-Date).AddSeconds($ObservationDurationSeconds)
  while ($true) {
    $sampleRuntime = Invoke-JsonStep -Label "Sample stagger runtime window" {
      powershell -NoProfile -ExecutionPolicy Bypass -File $runtimeScript `
        -BoardHost $BoardHost `
        -User $User `
        -Password $Password `
        -SshPort $SshPort
    }
    $samples.Add((Get-RuntimeCounterSummary -RuntimeReport $sampleRuntime))

    if ((Get-Date) -ge $deadline) {
      break
    }

    Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
  }

  $runtimeAfterObservation = Invoke-JsonStep -Label "Capture runtime after stagger observation" {
    powershell -NoProfile -ExecutionPolicy Bypass -File $runtimeScript `
      -BoardHost $BoardHost `
      -User $User `
      -Password $Password `
      -SshPort $SshPort
  }

  $afterApplySummary = Get-RuntimeCounterSummary -RuntimeReport $runtimeAfterApply
  $afterObservationSummary = Get-RuntimeCounterSummary -RuntimeReport $runtimeAfterObservation
  $applyDelta = Get-CounterDelta -Before $beforeSummary -After $afterApplySummary
  $observationDelta = Get-CounterDelta -Before $afterApplySummary -After $afterObservationSummary
  $sampleArray = @($samples.ToArray())
  $windowOnline = (@($sampleArray | Where-Object {
    $_.nodeAStatus -ne "online" -or $_.nodeBStatus -notin @("online", "degraded") -or $_.nodeCStatus -ne "online"
  }).Count -eq 0)
  $interleavingReduced = ([int]$observationDelta.interleavingSuspected -le 0)
  $schemaRejectedFlat = ([int]$observationDelta.schemaRejected -le 0)
  $degradedNodeBObserved = (@($sampleArray | Where-Object { $_.nodeBStatus -eq "degraded" }).Count -gt 0)

  $conclusion = if ($observationPassed -and $windowOnline -and $interleavingReduced -and $schemaRejectedFlat) {
    "stagger-profile-observation-clean"
  } elseif ($windowOnline -and ([int]$observationDelta.interleavingSuspected -lt 3) -and ([int]$observationDelta.schemaRejected -lt 3)) {
    "stagger-profile-improved-but-not-clean"
  } else {
    "stagger-profile-did-not-stabilize-shared-port"
  }
  $passed = ($conclusion -ne "stagger-profile-did-not-stabilize-shared-port")
  $observationReport = [pscustomobject][ordered]@{
    durationSeconds = $ObservationDurationSeconds
    pollSeconds = $PollSeconds
    sampleCount = $sampleArray.Count
    degradedNodeBObserved = $degradedNodeBObserved
    samples = $sampleArray
  }
} finally {
  if ($RestoreFiveSecondProfile) {
    try {
      if (-not $deviceMap) {
        $runtimeRestore = Invoke-JsonStep -Label "Capture runtime for restore mapping" {
          powershell -NoProfile -ExecutionPolicy Bypass -File $runtimeScript `
            -BoardHost $BoardHost `
            -User $User `
            -Password $Password `
            -SshPort $SshPort
        }
        $deviceMap = Get-NodeDeviceMap -RuntimeReport $runtimeRestore
      }

      $restoreResults.Add((Invoke-NodeSetReport -RepoRoot $repoRoot -DeviceId $deviceMap.A -ReportIntervalSeconds 5 -NodeLabel "node A restore" -WaitSeconds $NodeCommandWaitSeconds -PollSeconds $NodeCommandPollSeconds))
      $restoreResults.Add((Invoke-NodeSetReport -RepoRoot $repoRoot -DeviceId $deviceMap.B -ReportIntervalSeconds 5 -NodeLabel "node B restore" -WaitSeconds $NodeCommandWaitSeconds -PollSeconds $NodeCommandPollSeconds))
      $restoreResults.Add((Invoke-NodeSetReport -RepoRoot $repoRoot -DeviceId $deviceMap.C -ReportIntervalSeconds 5 -NodeLabel "node C restore" -WaitSeconds $NodeCommandWaitSeconds -PollSeconds $NodeCommandPollSeconds))
    } catch {
      Write-Warning ("RestoreFiveSecondProfile failed: {0}" -f $_.Exception.Message)
    }
  }
}

$applyResultArray = @($applyResults.ToArray())
$restoreResultArray = @($restoreResults.ToArray())

$report = [pscustomobject][ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "rk3568-shared-port-stagger-experiment"
  conclusion = $conclusion
  passed = $passed
  board = [pscustomobject][ordered]@{
    host = $BoardHost
    sshPort = $SshPort
    mqttUrl = $MqttUrl
  }
  profile = [pscustomobject][ordered]@{
    nodeAReportIntervalSeconds = $NodeAReportIntervalSeconds
    nodeBReportIntervalSeconds = $NodeBReportIntervalSeconds
    nodeCReportIntervalSeconds = $NodeCReportIntervalSeconds
    nodeCommandWaitSeconds = $NodeCommandWaitSeconds
    nodeCommandPollSeconds = $NodeCommandPollSeconds
    settleSeconds = $SettleSeconds
    observationDurationSeconds = $ObservationDurationSeconds
    pollSeconds = $PollSeconds
    restoreFiveSecondProfile = [bool]$RestoreFiveSecondProfile
  }
  devices = $deviceMap
  runtime = [pscustomobject][ordered]@{
    before = $beforeSummary
    afterApply = $afterApplySummary
    afterObservation = $afterObservationSummary
    applyDelta = $applyDelta
    observationDelta = $observationDelta
  }
  applyResults = $applyResultArray
  restoreResults = $restoreResultArray
  observation = [pscustomobject][ordered]@{
    commandSucceeded = $observationPassed
    commandError = $observationError
    report = $observationReport
  }
  nextUse = @(
    "rerun the same stagger experiment: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\run-rk3568-shared-port-stagger-experiment.ps1 -Password <password>",
    "try a different profile such as 5/9/13: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\run-rk3568-shared-port-stagger-experiment.ps1 -NodeAReportIntervalSeconds 5 -NodeBReportIntervalSeconds 9 -NodeCReportIntervalSeconds 13 -Password <password>",
    "restore all nodes to 5s if needed: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\run-rk3568-field-gateway-node-command-proof.ps1 -DeviceId <deviceId> -Action set-report-5 -Password <password>"
  )
}

$reportJson = $report | ConvertTo-Json -Depth 8
Set-Content -Path $resolvedOutFile -Value $reportJson -Encoding UTF8
$reportJson
