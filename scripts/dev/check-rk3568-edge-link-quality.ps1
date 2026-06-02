[CmdletBinding()]
param(
  [string]$RuntimeFile = "docs/unified/reports/field-rk3568-gateway-runtime-latest.json",
  [string]$NetworkBootstrapFile = "docs/unified/reports/field-rk3568-network-bootstrap-latest.json",
  [string]$OperatorEntryFile = "docs/unified/reports/field-center-rk3568-operator-entry-latest.json",
  [string[]]$DeferredNodeIds = @(),
  [int]$PublishFreshnessSeconds = 30,
  [string]$OutFile = "docs/unified/reports/field-rk3568-edge-link-quality-latest.json"
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

function Read-JsonFile {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function Convert-ToUtcDateTime {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  return ([DateTimeOffset]::Parse($Text)).UtcDateTime
}

function Get-AgeSeconds {
  param([string]$Text)

  $utc = Convert-ToUtcDateTime -Text $Text
  if ($null -eq $utc) {
    return $null
  }

  return [Math]::Round(((Get-Date).ToUniversalTime() - $utc).TotalSeconds, 3)
}

function Get-LevelRank {
  param([string]$Level)

  switch ($Level) {
    "not_applicable" { return -1 }
    "healthy" { return 0 }
    "attention" { return 1 }
    "degraded" { return 2 }
    "critical" { return 3 }
    default { return 4 }
  }
}

function New-Dimension {
  param(
    [string]$Key,
    [string]$Level,
    [string]$Summary,
    $Evidence
  )

  return [pscustomobject][ordered]@{
    key = $Key
    level = $Level
    summary = $Summary
    evidence = $Evidence
  }
}

function Test-IsDeferredNode {
  param(
    $Node,
    [string[]]$DeferredIds
  )

  if ($null -eq $Node -or $null -eq $DeferredIds -or $DeferredIds.Count -eq 0) {
    return $false
  }

  $fieldNodeId = [string]$Node.fieldNodeId
  $deviceId = [string]$Node.deviceId
  foreach ($candidate in $DeferredIds) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    if ($candidate.Equals($fieldNodeId, [System.StringComparison]::OrdinalIgnoreCase) -or
        $candidate.Equals($deviceId, [System.StringComparison]::OrdinalIgnoreCase)) {
      return $true
    }
  }

  return $false
}

$repoRoot = Resolve-RepoRoot
$runtime = Read-JsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $RuntimeFile) -Label "RK3568 runtime report"
$network = Read-JsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $NetworkBootstrapFile) -Label "RK3568 network bootstrap report"
$operator = Read-JsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OperatorEntryFile) -Label "RK3568 operator entry report"
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile

$stats = $runtime.runtimeHealth.stats
$southbound = $runtime.runtimeHealth.southbound
$port = @($southbound.ports | Select-Object -First 1)[0]
$nodes = @($southbound.nodes)
$nodeA = @($nodes | Where-Object { $_.fieldNodeId -eq "A" } | Select-Object -First 1)[0]
$nodeB = @($nodes | Where-Object { $_.fieldNodeId -eq "B" } | Select-Object -First 1)[0]
$nodeC = @($nodes | Where-Object { $_.fieldNodeId -eq "C" } | Select-Object -First 1)[0]

$lastPublishedAgeSeconds = Get-AgeSeconds -Text ([string]$stats.lastPublishedTs)
$lastSerialReadAgeSeconds = Get-AgeSeconds -Text ([string]$stats.lastSerialReadTs)
$lastInterleavingAgeSeconds = Get-AgeSeconds -Text ([string]$stats.lastInterleavingTs)

$dimensions = @()

$dimensions += New-Dimension `
  -Key "operator_mainline" `
  -Level $(if ([bool]$operator.accepted) { "healthy" } else { "critical" }) `
  -Summary $(if ([bool]$operator.accepted) { "center-side operator mainline entry is green" } else { "center-side operator mainline entry is not green" }) `
  -Evidence ([ordered]@{
    accepted = [bool]$operator.accepted
    boundary = [string]$operator.currentBoundary
  })

$networkMode = [string]$network.runtimeStatus.mode
$networkSteady = ([bool]$network.accepted -and @("sta_connected", "ethernet_uplink") -contains $networkMode)
$dimensions += New-Dimension `
  -Key "network_bootstrap" `
  -Level $(if ($networkSteady) { "healthy" } else { "critical" }) `
  -Summary $(if ($networkSteady) { "rk3568 bootstrap remains in a steady uplink mode" } else { "rk3568 wifi/bootstrap is not in the expected steady state" }) `
  -Evidence ([ordered]@{
    accepted = [bool]$network.accepted
    boundary = [string]$network.currentBoundary
    runtimeMode = $networkMode
    ipv4 = [string]$network.ipv4Addresses.stdout
  })

$dimensions += New-Dimension `
  -Key "southbound_serial" `
  -Level $(if ([bool]$runtime.runtimeHealth.serial.open -and [bool]$runtime.runtimeHealth.mqtt.connected -and [string]$port.status -eq "online") { "healthy" } else { "critical" }) `
  -Summary $(if ([bool]$runtime.runtimeHealth.serial.open -and [bool]$runtime.runtimeHealth.mqtt.connected -and [string]$port.status -eq "online") { "serial and mqtt uplink are currently online" } else { "serial and mqtt uplink are not both online" }) `
  -Evidence ([ordered]@{
    serialOpen = [bool]$runtime.runtimeHealth.serial.open
    mqttConnected = [bool]$runtime.runtimeHealth.mqtt.connected
    portStatus = [string]$port.status
    lastSerialReadAgeSeconds = $lastSerialReadAgeSeconds
  })

$publishLevel = "healthy"
if ($null -eq $lastPublishedAgeSeconds -or $lastPublishedAgeSeconds -gt $PublishFreshnessSeconds) {
  $publishLevel = "critical"
} elseif ([int]$stats.spoolPending -gt 0 -or [string]$stats.lastError) {
  $publishLevel = "attention"
}
$dimensions += New-Dimension `
  -Key "northbound_publish" `
  -Level $publishLevel `
  -Summary $(if ($publishLevel -eq "healthy") { "publish path is fresh with no pending spool backlog" } elseif ($publishLevel -eq "attention") { "publish path is still alive but shows retry/backlog pressure" } else { "publish path freshness fell outside the operator budget" }) `
  -Evidence ([ordered]@{
    lastPublishedAgeSeconds = $lastPublishedAgeSeconds
    spoolPending = [int]$stats.spoolPending
    publishFailures = [int]$stats.publishFailures
    lastError = [string]$stats.lastError
  })

$noiseLevel = "healthy"
if ([int]$stats.rejectedWriteFailures -gt 0) {
  $noiseLevel = "critical"
} elseif ([int]$stats.rejectedMessages -gt 0 -or [int]$stats.schemaRejected -gt 0) {
  $noiseLevel = "attention"
}
$dimensions += New-Dimension `
  -Key "parser_noise" `
  -Level $noiseLevel `
  -Summary $(if ($noiseLevel -eq "healthy") { "no parser rejection signal is currently recorded" } elseif ($noiseLevel -eq "attention") { "shared-port parser noise exists but remains non-blocking under the current mainline" } else { "parser rejection is now causing write failures" }) `
  -Evidence ([ordered]@{
    schemaRejected = [int]$stats.schemaRejected
    rejectedMessages = [int]$stats.rejectedMessages
    rejectedWriteFailures = [int]$stats.rejectedWriteFailures
  })

$interleavingLevel = "healthy"
if ([int]$stats.interleavingSuspected -gt 0) {
  $interleavingLevel = "attention"
}
$dimensions += New-Dimension `
  -Key "source_interleaving" `
  -Level $interleavingLevel `
  -Summary $(if ($interleavingLevel -eq "healthy") { "no source-side interleaving signature is currently recorded" } else { "shared-port rejected evidence contains source-side interleaving signatures" }) `
  -Evidence ([ordered]@{
    interleavingSuspected = [int]$stats.interleavingSuspected
    interleavingWithMultipleSchemas = [int]$stats.interleavingWithMultipleSchemas
    interleavingWithMultipleDeviceIds = [int]$stats.interleavingWithMultipleDeviceIds
    lastInterleavingAgeSeconds = $lastInterleavingAgeSeconds
    lastInterleavingSummary = [string]$stats.lastInterleavingSummary
  })

$pollCommandsIssued = [int]$stats.internalPollCommandsIssued
$pollTelemetryMatches = [int]$stats.internalPollTelemetryMatches
$pollSessionTimeouts = [int]$stats.internalPollSessionTimeouts
$pollClosurePercent = if ($pollCommandsIssued -gt 0) {
  [Math]::Round(($pollTelemetryMatches / [Math]::Max($pollCommandsIssued, 1)) * 100, 3)
} else {
  $null
}
$pollLevel = if ($null -eq $pollClosurePercent) {
  "not_applicable"
} elseif ($pollClosurePercent -ge 98) {
  "healthy"
} elseif ($pollClosurePercent -ge 90) {
  "attention"
} elseif ($pollClosurePercent -ge 70) {
  "degraded"
} else {
  "critical"
}
$dimensions += New-Dimension `
  -Key "internal_poll_closure" `
  -Level $pollLevel `
  -Summary $(if ($null -eq $pollClosurePercent) { "internal polling is not active in this runtime window" } else { "internal poll telemetry closure is {0}%" -f $pollClosurePercent }) `
  -Evidence ([ordered]@{
    pollCommandsIssued = $pollCommandsIssued
    pollTelemetryMatches = $pollTelemetryMatches
    pollSessionTimeouts = $pollSessionTimeouts
    pollClosurePercent = $pollClosurePercent
  })

foreach ($node in @($nodeA, $nodeB, $nodeC)) {
  $isDisabledNode = $node.PSObject.Properties.Name -contains "enabled" -and $false -eq [bool]$node.enabled
  $isDeferredNode = $isDisabledNode -or (Test-IsDeferredNode -Node $node -DeferredIds $DeferredNodeIds)
  $nodeLevel = switch ([string]$node.status) {
    "online" { "healthy" }
    "degraded" { if ($isDeferredNode) { "not_applicable" } else { "attention" } }
    "offline" { if ($isDeferredNode) { "not_applicable" } else { "degraded" } }
    default { if ($isDeferredNode) { "not_applicable" } else { "critical" } }
  }

  $nodeSummary = "node {0} status={1}" -f [string]$node.fieldNodeId, [string]$node.status
  if ($isDisabledNode) {
    $nodeSummary = "{0} (disabled in current southbound runtime)" -f $nodeSummary
  } elseif ($isDeferredNode) {
    $nodeSummary = "{0} (deferred from current freeze boundary)" -f $nodeSummary
  }

  $dimensions += New-Dimension `
    -Key ("node_{0}" -f ([string]$node.fieldNodeId).ToLowerInvariant()) `
    -Level $nodeLevel `
    -Summary $nodeSummary `
    -Evidence ([ordered]@{
      deviceId = [string]$node.deviceId
      enabled = if ($node.PSObject.Properties.Name -contains "enabled") { [bool]$node.enabled } else { $true }
      deferred = $isDeferredNode
      status = [string]$node.status
      telemetryMessages = [int]$node.telemetryMessages
      commandForwards = [int]$node.commandForwards
      ackPublishes = [int]$node.ackPublishes
      lastTelemetryAgeSeconds = Get-AgeSeconds -Text ([string]$node.lastTelemetryTs)
      lastAckAgeSeconds = Get-AgeSeconds -Text ([string]$node.lastAckTs)
    })
}

$overallLevel = "healthy"
$score = 100
foreach ($dimension in $dimensions) {
  switch ($dimension.level) {
    "attention" { $score -= 10 }
    "degraded" { $score -= 25 }
    "critical" { $score -= 40 }
  }
  if ((Get-LevelRank -Level $dimension.level) -gt (Get-LevelRank -Level $overallLevel)) {
    $overallLevel = [string]$dimension.level
  }
}
$score = if ($null -ne $pollClosurePercent) { [Math]::Min($score, [Math]::Floor($pollClosurePercent)) } else { $score }
$score = [Math]::Max(0, $score)

$accepted = ([bool]$operator.accepted -and [bool]$network.accepted -and [bool]$runtime.runtimeHealth.serial.open -and [bool]$runtime.runtimeHealth.mqtt.connected)

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  mode = "rk3568-edge-link-quality"
  currentBoundary = if ($accepted) { "rk3568-edge-link-quality-visible" } else { "rk3568-edge-link-quality-needs-review" }
  summary = [ordered]@{
    overallLevel = $overallLevel
    score = $score
    deferredNodeIds = @($DeferredNodeIds)
    operatorAccepted = [bool]$operator.accepted
    networkMode = [string]$network.runtimeStatus.mode
    portStatus = [string]$port.status
    spoolPending = [int]$stats.spoolPending
    rejectedWriteFailures = [int]$stats.rejectedWriteFailures
    rejectedMessages = [int]$stats.rejectedMessages
    interleavingSuspected = [int]$stats.interleavingSuspected
    lastPublishedAgeSeconds = $lastPublishedAgeSeconds
  }
  dimensions = $dimensions
  sources = [ordered]@{
    runtime = [ordered]@{
      file = $RuntimeFile.Replace("\", "/")
      generatedAt = [string]$runtime.generatedAt
    }
    networkBootstrap = [ordered]@{
      file = $NetworkBootstrapFile.Replace("\", "/")
      generatedAt = [string]$network.generatedAt
    }
    operatorEntry = [ordered]@{
      file = $OperatorEntryFile.Replace("\", "/")
      generatedAt = [string]$operator.generatedAt
    }
  }
  recommendations = @(
    "feed this summary into the future rk3568 local monitoring/OpenClaw sidecar as a read-only input",
    "treat parser_noise=attention as a shared-port quality issue to monitor, not a reason to reopen protocol scope",
    "treat source_interleaving as direct evidence of upstream shared-port byte collision and use it to verify source-side fixes",
    "escalate only when northbound_publish leaves the freshness budget or rejectedWriteFailures becomes non-zero"
  )
  nextUse = @(
    "refresh edge link quality summary: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-edge-link-quality.ps1 -DeferredNodeIds B,C",
    "refresh operator entry first: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-operator-entry.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
    "refresh board runtime first: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-runtime.ps1 -Password <password>"
  )
}

$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8
$json
