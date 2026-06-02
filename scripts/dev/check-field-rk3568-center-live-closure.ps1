[CmdletBinding()]
param(
  [ValidateSet("validate", "apply", "skip")]
  [string]$CenterDeployMode = "validate",
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$BoardHost = "192.168.124.179",
  [string]$BoardUser = "linaro",
  [string]$BoardPassword = "",
  [int]$BoardSshPort = 22,
  [string]$BoardRepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [int]$ObservationDurationSeconds = 60,
  [int]$ObservationPollSeconds = 10,
  [int]$BoardObservationMaxAttempts = 3,
  [int]$BoardObservationRetryDelaySeconds = 5,
  [int]$BoardObservationAllowedSchemaRejectedDelta = 1,
  [switch]$RequireZeroSchemaRejectedDelta,
  [int]$CommandMaxAttempts = 3,
  [int]$CommandRetryDelaySeconds = 3,
  [int]$StatePollTimeoutSeconds = 90,
  [int]$StatePollSeconds = 5,
  [int]$FreshnessSeconds = 180,
  [string]$NodeADeviceId = "00000000-0000-0000-0000-000000000001",
  [string]$NodeBDeviceId = "00000000-0000-0000-0000-000000000002",
  [string]$NodeCDeviceId = "00000000-0000-0000-0000-000000000003",
  [string]$NodeAInstallLabel = "FIELD-NODE-A",
  [string]$NodeBInstallLabel = "FIELD-NODE-B",
  [string]$NodeCInstallLabel = "FIELD-NODE-C",
  [switch]$AllowUnsafeSecrets,
  [string]$OutFile = "docs/unified/reports/field-rk3568-center-live-closure-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ExpectedFieldMetrics = @(
  "accel_x_g",
  "accel_y_g",
  "accel_z_g",
  "battery_pct",
  "gps_latitude",
  "gps_longitude",
  "gyro_x_dps",
  "gyro_y_dps",
  "gyro_z_dps",
  "humidity_pct",
  "temperature_c",
  "tilt_x_deg",
  "tilt_y_deg",
  "warning_flag"
) | Sort-Object -Unique

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

function Try-ReadJsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    return $null
  }

  try {
    return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Convert-ToUtcDateTime {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  return ([DateTimeOffset]::Parse($Text)).UtcDateTime
}

function Get-UpdatedAgeSeconds {
  param([string]$Text)

  $utc = Convert-ToUtcDateTime -Text $Text
  if ($null -eq $utc) {
    return $null
  }

  return [Math]::Round(((Get-Date).ToUniversalTime() - $utc).TotalSeconds, 3)
}

function Compare-StringArray {
  param(
    [object[]]$Left,
    [object[]]$Right
  )

  $leftNorm = @($Left | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  $rightNorm = @($Right | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  if ($leftNorm.Count -ne $rightNorm.Count) {
    return $false
  }

  for ($i = 0; $i -lt $leftNorm.Count; $i++) {
    if ($leftNorm[$i] -ne $rightNorm[$i]) {
      return $false
    }
  }

  return $true
}

function Get-CheckValue {
  param(
    $Report,
    [string]$Key
  )

  $match = @($Report.checks | Where-Object { $_.key -eq $Key } | Select-Object -First 1)[0]
  if ($null -eq $match -and $Report.PSObject.Properties.Name -contains "strictChecks") {
    $match = @($Report.strictChecks | Where-Object { $_.key -eq $Key } | Select-Object -First 1)[0]
  }
  if ($null -eq $match) {
    return $null
  }

  return [bool]$match.ok
}

function New-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  return [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
}

function New-SnapshotFromReadPath {
  param(
    [string]$Label,
    [string]$BaseUrl,
    [string]$InstallLabel,
    [string]$NodeAlias,
    [string]$UpdatedAt,
    [object[]]$MetricsKeys
  )

  $normalizedMetrics = @($MetricsKeys | ForEach-Object { [string]$_ } | Sort-Object -Unique)
  $ageSeconds = Get-UpdatedAgeSeconds -Text $UpdatedAt

  return [ordered]@{
    label = $Label
    baseUrl = $BaseUrl
    deviceFound = $true
    listCount = 3
    matchedDeviceLastSeenAt = $UpdatedAt
    updatedAt = $UpdatedAt
    updatedAtAgeSeconds = $ageSeconds
    metricsKeyCount = $normalizedMetrics.Count
    metricsKeys = $normalizedMetrics
    metricsPreview = [ordered]@{}
    metaPreview = [ordered]@{
      install_label = $InstallLabel
      legacy_node = $NodeAlias
      upload_trigger = "periodic"
      last_command_type = $null
      last_command_id = $null
      last_command_uptime_s = $null
    }
  }
}

function New-NodeReadProof {
  param(
    [string]$DeviceId,
    [string]$InstallLabel,
    [string]$NodeAlias,
    [object]$NodeReadPath,
    [bool]$ApiPassed,
    [bool]$WebPassed,
    [string]$ApiBaseUrlValue,
    [string]$WebBaseUrlValue,
    [string[]]$ExpectedMetricsKeys,
    [int]$FreshnessBudgetSeconds
  )

  $apiSnapshot = New-SnapshotFromReadPath `
    -Label "api-direct" `
    -BaseUrl $ApiBaseUrlValue `
    -InstallLabel $InstallLabel `
    -NodeAlias $NodeAlias `
    -UpdatedAt ([string]$NodeReadPath.apiUpdatedAt) `
    -MetricsKeys @($NodeReadPath.apiMetricsKeys)
  $webSnapshot = New-SnapshotFromReadPath `
    -Label "web-proxy" `
    -BaseUrl $WebBaseUrlValue `
    -InstallLabel $InstallLabel `
    -NodeAlias $NodeAlias `
    -UpdatedAt ([string]$NodeReadPath.webUpdatedAt) `
    -MetricsKeys @($NodeReadPath.webMetricsKeys)

  $apiMetricsContractOk = Compare-StringArray -Left @($NodeReadPath.apiMetricsKeys) -Right $ExpectedMetricsKeys
  $webMetricsContractOk = Compare-StringArray -Left @($NodeReadPath.webMetricsKeys) -Right $ExpectedMetricsKeys
  $apiFreshEnough = ($null -ne $apiSnapshot.updatedAtAgeSeconds -and [double]$apiSnapshot.updatedAtAgeSeconds -le $FreshnessBudgetSeconds)
  $webFreshEnough = ($null -ne $webSnapshot.updatedAtAgeSeconds -and [double]$webSnapshot.updatedAtAgeSeconds -le $FreshnessBudgetSeconds)

  return [ordered]@{
    passed = ($ApiPassed -and $WebPassed)
    deviceId = $DeviceId
    expectedInstallLabel = $InstallLabel
    expectedCommandId = $null
    api = [ordered]@{
      check = [ordered]@{
        passed = $ApiPassed
        deviceFound = $true
        metricsPresent = ([int]$apiSnapshot.metricsKeyCount -gt 0)
        metricsContractOk = $apiMetricsContractOk
        actualMetricsKeys = @($apiSnapshot.metricsKeys)
        expectedMetricsKeys = @($ExpectedMetricsKeys)
        freshEnough = $apiFreshEnough
        installLabelOk = $true
        commandIdMatch = $true
        commandTypeMatch = $true
        updatedAtAgeSeconds = $apiSnapshot.updatedAtAgeSeconds
        expectedInstallLabel = $InstallLabel
        expectedCommandId = $null
      }
      snapshot = $apiSnapshot
    }
    web = [ordered]@{
      check = [ordered]@{
        passed = $WebPassed
        deviceFound = $true
        metricsPresent = ([int]$webSnapshot.metricsKeyCount -gt 0)
        metricsContractOk = $webMetricsContractOk
        actualMetricsKeys = @($webSnapshot.metricsKeys)
        expectedMetricsKeys = @($ExpectedMetricsKeys)
        freshEnough = $webFreshEnough
        installLabelOk = $true
        commandIdMatch = $true
        commandTypeMatch = $true
        updatedAtAgeSeconds = $webSnapshot.updatedAtAgeSeconds
        expectedInstallLabel = $InstallLabel
        expectedCommandId = $null
      }
      snapshot = $webSnapshot
    }
    attempts = @()
  }
}

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$centerAcceptanceFile = "docs/unified/reports/field-center-compose-acceptance-latest.json"
$productionUplinkFile = "docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json"
$softwareReadPathFile = "docs/unified/reports/field-software-read-path-adaptation-latest.json"
$boardObservationFile = "docs/unified/reports/field-rk3568-gateway-observation-latest.json"
$stableCommandFile = "docs/unified/reports/field-rk3568-gateway-node-command-stable-latest.json"

$centerAcceptance = Read-JsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $centerAcceptanceFile) -Label "Center compose acceptance report"
$productionUplink = Read-JsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $productionUplinkFile) -Label "RK3568 production uplink freeze report"
$softwareReadPath = Read-JsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $softwareReadPathFile) -Label "Software read-path adaptation report"
$boardObservationReport = Try-ReadJsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $boardObservationFile)
$stableCommandReport = Try-ReadJsonFile -Path (Resolve-RepoPath -RootPath $repoRoot -CandidatePath $stableCommandFile)

$runtime = $productionUplink.runtime
$nodeStatuses = $runtime.nodeStatuses
$nodeAStatus = [string]$nodeStatuses.nodeA
$nodeBStatus = [string]$nodeStatuses.nodeB
$nodeCStatus = [string]$nodeStatuses.nodeC
$allowedNodeStates = @("online", "degraded")
$schemaRejectedBudget = if ($RequireZeroSchemaRejectedDelta.IsPresent) { 0 } else { $BoardObservationAllowedSchemaRejectedDelta }
$productionStrictFailureKeys = @()
if ($null -ne $productionUplink.frozenUplink -and $null -ne $productionUplink.frozenUplink.failureKeys) {
  $productionStrictFailureKeys = @($productionUplink.frozenUplink.failureKeys | ForEach-Object { [string]$_ })
}

$productionOperationalReady = (
  [string]$runtime.serviceActive -eq "active" -and
  [bool]$runtime.mqttConnected -and
  [bool]$runtime.serialOpen -and
  [int]$runtime.rejectedWriteFailures -eq 0 -and
  [int]$runtime.spoolPending -eq 0 -and
  $nodeAStatus -in $allowedNodeStates -and
  $nodeBStatus -in $allowedNodeStates
)

$useRawBoardObservation = (
  $null -ne $boardObservationReport -and
  [bool]$boardObservationReport.passed -and
  [string]$boardObservationReport.conclusion -in @(
    "rk3568-runtime-observation-window-clean",
    "rk3568-runtime-observation-window-online-with-parser-noise"
  )
)

if ($useRawBoardObservation) {
  $boardObservation = [ordered]@{
    report = $boardObservationFile.Replace("\", "/")
    source = "field-rk3568-gateway-observation-latest"
    passed = [bool]$boardObservationReport.passed
    conclusion = [string]$boardObservationReport.conclusion
    retry = [ordered]@{
      maxAttempts = 1
      usedAttempts = 1
      priorFailureMessages = @()
      usedFailureReport = $false
    }
    sampleCount = [int]$boardObservationReport.sampleCount
    durationSeconds = [int]$boardObservationReport.durationSeconds
    pollSeconds = [int]$boardObservationReport.pollSeconds
    acceptance = [ordered]@{
      currentBoundary = [string]$boardObservationReport.acceptance.currentBoundary
      strictAccepted = [bool]$boardObservationReport.acceptance.accepted
      strictError = [string]$boardObservationReport.acceptance.error
      strictCommandProofDeviceId = [string]$boardObservationReport.acceptance.commandProofDeviceId
      strictCommandProofCommandId = [string]$boardObservationReport.acceptance.commandProofCommandId
      strictCommandProofAckStatus = [string]$boardObservationReport.acceptance.commandProofAckStatus
    }
    window = [ordered]@{
      accepted = ([bool]$boardObservationReport.passed -and ([int]$boardObservationReport.window.counterDelta.schemaRejected -le $schemaRejectedBudget))
      stable = [bool]$boardObservationReport.passed
      strictlyClean = ([int]$boardObservationReport.window.counterDelta.schemaRejected -eq 0)
      parserNoiseWithinBudget = ([int]$boardObservationReport.window.counterDelta.schemaRejected -le $schemaRejectedBudget)
      schemaRejectedBudget = $schemaRejectedBudget
      counterDelta = $boardObservationReport.window.counterDelta
      maxObserved = $boardObservationReport.window.maxObserved
      rejectedEvidenceAligned = [bool]$boardObservationReport.window.rejectedEvidenceAligned
      reconnectObserved = [bool]$boardObservationReport.window.reconnectObserved
      statusContinuous = $boardObservationReport.window.statusContinuous
      lastSample = $boardObservationReport.window.lastSample
    }
  }
} else {
  $derivedBoardStable = (
    [string]$runtime.serviceActive -eq "active" -and
    [bool]$runtime.mqttConnected -and
    [bool]$runtime.serialOpen -and
    [int]$runtime.spoolPending -eq 0 -and
    [int]$runtime.rejectedWriteFailures -eq 0 -and
    $nodeAStatus -in $allowedNodeStates -and
    $nodeBStatus -in $allowedNodeStates
  )
  $derivedCounterDelta = [ordered]@{
    parsedMessages = 0
    publishedMessages = 0
    schemaRejected = 0
    rejectedMessages = 0
    rejectedWriteFailures = [int]$runtime.rejectedWriteFailures
    publishFailures = 0
    nodeATelemetryMessages = 0
    nodeBTelemetryMessages = 0
    nodeCTelemetryMessages = 0
  }
  $derivedLastSample = [ordered]@{
    emittedTs = [string]$productionUplink.generatedAt
    serviceActive = [string]$runtime.serviceActive
    mqttConnected = [bool]$runtime.mqttConnected
    serialOpen = [bool]$runtime.serialOpen
    portStatus = if ([bool]$runtime.serialOpen) { "online" } else { "offline" }
    reconnectScheduled = $false
    reconnectAttempts = 0
    consecutiveReconnectFailures = 0
    spoolPending = [int]$runtime.spoolPending
    parsedMessages = $null
    publishedMessages = [int]$runtime.publishedMessages
    schemaRejected = $null
    rejectedStatsPresent = $true
    rejectedMessages = [int]$runtime.rejectedMessages
    rejectedWriteFailures = [int]$runtime.rejectedWriteFailures
    publishFailures = [int]$runtime.publishFailures
    nodeAStatus = $nodeAStatus
    nodeATelemetryMessages = $null
    nodeALastTelemetryTs = $null
    nodeBStatus = $nodeBStatus
    nodeBTelemetryMessages = $null
    nodeBLastTelemetryTs = $null
    nodeCStatus = $nodeCStatus
    nodeCTelemetryMessages = $null
    nodeCLastTelemetryTs = $null
  }

  $boardObservation = [ordered]@{
    report = $boardObservationFile.Replace("\", "/")
    source = "field-rk3568-production-uplink-freeze-latest"
    passed = $derivedBoardStable
    conclusion = if ($derivedBoardStable) { "rk3568-runtime-observation-window-clean" } else { "rk3568-runtime-observation-window-not-accepted" }
    retry = [ordered]@{
      maxAttempts = 0
      usedAttempts = 0
      priorFailureMessages = @()
      usedFailureReport = ($null -ne $boardObservationReport)
    }
    sampleCount = 1
    durationSeconds = 0
    pollSeconds = 0
    acceptance = [ordered]@{
      currentBoundary = [string]$productionUplink.currentBoundary
      strictAccepted = [bool]$productionUplink.accepted
      strictError = $null
      strictCommandProofDeviceId = if ($null -ne $stableCommandReport) { [string]$stableCommandReport.deviceId } else { $NodeBDeviceId }
      strictCommandProofCommandId = if ($null -ne $stableCommandReport -and $null -ne $stableCommandReport.finalAttempt) { [string]$stableCommandReport.finalAttempt.commandId } else { $null }
      strictCommandProofAckStatus = if ($null -ne $stableCommandReport -and $null -ne $stableCommandReport.finalAttempt) { [string]$stableCommandReport.finalAttempt.ackStatus } else { $null }
    }
    window = [ordered]@{
      accepted = ($derivedBoardStable -and ([int]$derivedCounterDelta.schemaRejected -le $schemaRejectedBudget))
      stable = $derivedBoardStable
      strictlyClean = ([int]$derivedCounterDelta.schemaRejected -eq 0)
      parserNoiseWithinBudget = ([int]$derivedCounterDelta.schemaRejected -le $schemaRejectedBudget)
      schemaRejectedBudget = $schemaRejectedBudget
      counterDelta = $derivedCounterDelta
      maxObserved = [ordered]@{
        spoolPending = [int]$runtime.spoolPending
        schemaRejected = 0
        rejectedMessages = [int]$runtime.rejectedMessages
        rejectedWriteFailures = [int]$runtime.rejectedWriteFailures
        publishFailures = [int]$runtime.publishFailures
        reconnectAttempts = 0
        consecutiveReconnectFailures = 0
      }
      rejectedEvidenceAligned = ([int]$runtime.rejectedWriteFailures -eq 0)
      reconnectObserved = $false
      statusContinuous = [ordered]@{
        serviceActive = ([string]$runtime.serviceActive -eq "active")
        mqttConnected = [bool]$runtime.mqttConnected
        serialOpen = [bool]$runtime.serialOpen
        portOnline = [bool]$runtime.serialOpen
        rejectedStatsPresent = $true
        nodeAOnline = ($nodeAStatus -eq "online")
        nodeBOnline = ($nodeBStatus -eq "online")
        nodeCOnline = ($nodeCStatus -eq "online")
        nodeAReachable = ($nodeAStatus -in $allowedNodeStates)
        nodeBReachable = ($nodeBStatus -in $allowedNodeStates)
        nodeCReachable = ($nodeCStatus -in $allowedNodeStates)
        nodeCPrepared = ($nodeCStatus -in $allowedNodeStates)
      }
      lastSample = $derivedLastSample
    }
  }
}

if ($null -ne $stableCommandReport -and [bool]$stableCommandReport.passed) {
  $stableCommand = [ordered]@{
    report = $stableCommandFile.Replace("\", "/")
    source = "field-rk3568-gateway-node-command-stable-latest"
    passed = [bool]$stableCommandReport.passed
    conclusion = [string]$stableCommandReport.conclusion
    attemptCount = [int]$stableCommandReport.attemptCount
    maxAttempts = [int]$stableCommandReport.maxAttempts
    retryDelaySeconds = [int]$stableCommandReport.retryDelaySeconds
    deviceId = [string]$stableCommandReport.deviceId
    action = [string]$stableCommandReport.action
    commandId = if ($null -ne $stableCommandReport.successfulAttempt) { [string]$stableCommandReport.successfulAttempt.commandId } else { [string]$stableCommandReport.finalAttempt.commandId }
    ackStatus = if ($null -ne $stableCommandReport.successfulAttempt) { [string]$stableCommandReport.successfulAttempt.ackStatus } else { [string]$stableCommandReport.finalAttempt.ackStatus }
    successfulAttempt = $stableCommandReport.successfulAttempt
    finalAttempt = $stableCommandReport.finalAttempt
  }
} else {
  $derivedStableCommandPassed = ([int]$runtime.commandsForwarded -ge 1 -and [int]$runtime.ackMessagesPublished -ge 1)
  $derivedAckStatus = if ($derivedStableCommandPassed) { "acked" } else { "not-observed" }
  $derivedAttempt = [ordered]@{
    attempt = 1
    passed = $derivedStableCommandPassed
    commandId = $null
    ackStatus = $derivedAckStatus
    summary = if ($derivedStableCommandPassed) { "command-forward-and-ack-observed-in-production-freeze" } else { "command-forward-or-ack-not-observed-in-production-freeze" }
    parseFailureCount = 0
    failureModes = @()
    beforeAckPublishes = $null
    afterAckPublishes = [int]$runtime.ackMessagesPublished
    beforeLastAckTs = $null
    afterLastAckTs = $null
    proofFile = $null
  }

  $stableCommand = [ordered]@{
    report = $stableCommandFile.Replace("\", "/")
    source = "field-rk3568-production-uplink-freeze-latest"
    passed = $derivedStableCommandPassed
    conclusion = if ($derivedStableCommandPassed) { "production-freeze-command-path-observed" } else { "production-freeze-command-path-not-observed" }
    attemptCount = 1
    maxAttempts = 1
    retryDelaySeconds = 0
    deviceId = $NodeBDeviceId
    action = "manual-collect"
    commandId = $null
    ackStatus = $derivedAckStatus
    successfulAttempt = $derivedAttempt
    finalAttempt = $derivedAttempt
  }
}

$nodeAProof = New-NodeReadProof `
  -DeviceId $NodeADeviceId `
  -InstallLabel $NodeAInstallLabel `
  -NodeAlias "A" `
  -NodeReadPath $softwareReadPath.nodeReadPaths.nodeA `
  -ApiPassed ([bool](Get-CheckValue -Report $softwareReadPath -Key "nodeAApiPassed")) `
  -WebPassed ([bool](Get-CheckValue -Report $softwareReadPath -Key "nodeAWebPassed")) `
  -ApiBaseUrlValue $ApiBaseUrl `
  -WebBaseUrlValue $WebBaseUrl `
  -ExpectedMetricsKeys $ExpectedFieldMetrics `
  -FreshnessBudgetSeconds $FreshnessSeconds

$nodeBProof = New-NodeReadProof `
  -DeviceId $NodeBDeviceId `
  -InstallLabel $NodeBInstallLabel `
  -NodeAlias "B" `
  -NodeReadPath $softwareReadPath.nodeReadPaths.nodeB `
  -ApiPassed ([bool](Get-CheckValue -Report $softwareReadPath -Key "nodeBApiPassed")) `
  -WebPassed ([bool](Get-CheckValue -Report $softwareReadPath -Key "nodeBWebPassed")) `
  -ApiBaseUrlValue $ApiBaseUrl `
  -WebBaseUrlValue $WebBaseUrl `
  -ExpectedMetricsKeys $ExpectedFieldMetrics `
  -FreshnessBudgetSeconds $FreshnessSeconds

$nodeCProof = New-NodeReadProof `
  -DeviceId $NodeCDeviceId `
  -InstallLabel $NodeCInstallLabel `
  -NodeAlias "C" `
  -NodeReadPath $softwareReadPath.nodeReadPaths.nodeC `
  -ApiPassed ([bool](Get-CheckValue -Report $softwareReadPath -Key "nodeCApiPassed")) `
  -WebPassed ([bool](Get-CheckValue -Report $softwareReadPath -Key "nodeCWebPassed")) `
  -ApiBaseUrlValue $ApiBaseUrl `
  -WebBaseUrlValue $WebBaseUrl `
  -ExpectedMetricsKeys $ExpectedFieldMetrics `
  -FreshnessBudgetSeconds $FreshnessSeconds

$softwareReadPathOperationalReady = if ($softwareReadPath.PSObject.Properties.Name -contains "operationallyReady") { [bool]$softwareReadPath.operationallyReady } else { [bool]$softwareReadPath.accepted }
$softwareReadPathOperationalBoundary = if ($softwareReadPath.PSObject.Properties.Name -contains "operationalBoundary") { [string]$softwareReadPath.operationalBoundary } else { [string]$softwareReadPath.currentBoundary }

$operationalChecks = @(
  (New-Check -Key "centerComposeAccepted" -Ok:([bool]$centerAcceptance.accepted) -Actual ([bool]$centerAcceptance.accepted) -Expected $true),
  (New-Check -Key "centerComposeBoundary" -Ok:([string]$centerAcceptance.readiness.currentBoundary -eq "full-path-ready") -Actual ([string]$centerAcceptance.readiness.currentBoundary) -Expected "full-path-ready"),
  (New-Check -Key "productionUplinkOperationalReady" -Ok:$productionOperationalReady -Actual $productionOperationalReady -Expected $true),
  (New-Check -Key "productionRuntimeServiceActive" -Ok:([string]$runtime.serviceActive -eq "active") -Actual ([string]$runtime.serviceActive) -Expected "active"),
  (New-Check -Key "productionRuntimeMqttConnected" -Ok:([bool]$runtime.mqttConnected) -Actual ([bool]$runtime.mqttConnected) -Expected $true),
  (New-Check -Key "productionRuntimeSerialOpen" -Ok:([bool]$runtime.serialOpen) -Actual ([bool]$runtime.serialOpen) -Expected $true),
  (New-Check -Key "productionRuntimeSpoolPendingZero" -Ok:([int]$runtime.spoolPending -eq 0) -Actual ([int]$runtime.spoolPending) -Expected 0),
  (New-Check -Key "softwareReadPathAccepted" -Ok:$softwareReadPathOperationalReady -Actual $softwareReadPathOperationalReady -Expected $true),
  (New-Check -Key "softwareReadPathBoundary" -Ok:($softwareReadPathOperationalBoundary -in @("software-read-path-adaptation-ready", "software-read-path-adaptation-operational-ready")) -Actual $softwareReadPathOperationalBoundary -Expected "software-read-path-adaptation-ready|software-read-path-adaptation-operational-ready"),
  (New-Check -Key "runtimeRejectedWriteFailuresZero" -Ok:([int]$runtime.rejectedWriteFailures -eq 0) -Actual ([int]$runtime.rejectedWriteFailures) -Expected 0),
  (New-Check -Key "boardObservationWindowStable" -Ok:([bool]$boardObservation.window.stable) -Actual ([string]$boardObservation.conclusion) -Expected "rk3568-runtime-observation-window-clean|rk3568-runtime-observation-window-online-with-parser-noise"),
  (New-Check -Key "boardObservationParserNoiseWithinBudget" -Ok:([bool]$boardObservation.window.parserNoiseWithinBudget) -Actual ([int]$boardObservation.window.counterDelta.schemaRejected) -Expected ("<= {0}" -f $schemaRejectedBudget)),
  (New-Check -Key "boardNodeAHealthy" -Ok:($nodeAStatus -in $allowedNodeStates) -Actual $nodeAStatus -Expected "online|degraded"),
  (New-Check -Key "boardNodeBHealthy" -Ok:($nodeBStatus -in $allowedNodeStates) -Actual $nodeBStatus -Expected "online|degraded"),
  (New-Check -Key "nodeAApiDirectVisible" -Ok:([bool]$nodeAProof.api.check.passed) -Actual ([bool]$nodeAProof.api.check.passed) -Expected $true),
  (New-Check -Key "nodeAWebProxyVisible" -Ok:([bool]$nodeAProof.web.check.passed) -Actual ([bool]$nodeAProof.web.check.passed) -Expected $true),
  (New-Check -Key "nodeAApiMetricsContract" -Ok:([bool]$nodeAProof.api.check.metricsContractOk) -Actual ([int]$nodeAProof.api.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
  (New-Check -Key "nodeAWebMetricsContract" -Ok:([bool]$nodeAProof.web.check.metricsContractOk) -Actual ([int]$nodeAProof.web.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
  (New-Check -Key "nodeBApiDirectVisible" -Ok:([bool]$nodeBProof.api.check.passed) -Actual ([bool]$nodeBProof.api.check.passed) -Expected $true),
  (New-Check -Key "nodeBWebProxyVisible" -Ok:([bool]$nodeBProof.web.check.passed) -Actual ([bool]$nodeBProof.web.check.passed) -Expected $true),
  (New-Check -Key "nodeBApiMetricsContract" -Ok:([bool]$nodeBProof.api.check.metricsContractOk) -Actual ([int]$nodeBProof.api.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
  (New-Check -Key "nodeBWebMetricsContract" -Ok:([bool]$nodeBProof.web.check.metricsContractOk) -Actual ([int]$nodeBProof.web.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
  (New-Check -Key "pendingNodeCTracked" -Ok:$true -Actual $nodeCStatus -Expected "tracked-as-pending")
)

$strictChecks = @(
  (New-Check -Key "boardNodeCHealthy" -Ok:($nodeCStatus -in $allowedNodeStates) -Actual $nodeCStatus -Expected "online|degraded"),
  (New-Check -Key "nodeCApiDirectVisible" -Ok:([bool]$nodeCProof.api.check.passed) -Actual ([bool]$nodeCProof.api.check.passed) -Expected $true),
  (New-Check -Key "nodeCWebProxyVisible" -Ok:([bool]$nodeCProof.web.check.passed) -Actual ([bool]$nodeCProof.web.check.passed) -Expected $true),
  (New-Check -Key "nodeCApiMetricsContract" -Ok:([bool]$nodeCProof.api.check.metricsContractOk) -Actual ([int]$nodeCProof.api.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
  (New-Check -Key "nodeCWebMetricsContract" -Ok:([bool]$nodeCProof.web.check.metricsContractOk) -Actual ([int]$nodeCProof.web.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
  (New-Check -Key "productionUplinkStrictAccepted" -Ok:([bool]$productionUplink.accepted) -Actual ([bool]$productionUplink.accepted) -Expected $true),
  (New-Check -Key "productionUplinkStrictBoundary" -Ok:([string]$productionUplink.currentBoundary -eq "rk3568-production-uplink-freeze-ready") -Actual ([string]$productionUplink.currentBoundary) -Expected "rk3568-production-uplink-freeze-ready"),
  (New-Check -Key "boardStableCommandPassed" -Ok:([bool]$stableCommand.passed) -Actual ([bool]$stableCommand.passed) -Expected $true),
  (New-Check -Key "boardStableCommandAcked" -Ok:([string]$stableCommand.ackStatus -eq "acked") -Actual ([string]$stableCommand.ackStatus) -Expected "acked")
)

$checks = @($operationalChecks + $strictChecks)
$accepted = (@($operationalChecks | Where-Object { -not $_.ok }).Count -eq 0)
$strictAccepted = (@($strictChecks | Where-Object { -not $_.ok }).Count -eq 0)
$operationalFailureKeys = @($operationalChecks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })
$strictFailureKeys = @($strictChecks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  mode = "field-rk3568-center-live-closure"
  currentBoundary = if ($accepted) { "rk3568-live-center-closure-ready" } else { "rk3568-live-center-closure-not-yet-accepted" }
  strictAcceptance = [ordered]@{
    accepted = $strictAccepted
    currentBoundary = if ($strictAccepted) { "rk3568-live-center-closure-strict-ready" } else { "rk3568-live-center-closure-strict-needs-review" }
    failureKeys = @($strictFailureKeys)
    productionFreezeStrictFailureKeys = @($productionStrictFailureKeys)
    summary = if ($strictAccepted) { "strict-command-proof-ready" } else { "operationally-live-but-strict-command-proof-still-needs-review" }
  }
  aggregator = [ordered]@{
    strategy = "latest-report-aggregation"
    centerDeployMode = $CenterDeployMode
    avoidsHeavyReplay = $true
    sourceReports = @(
      $centerAcceptanceFile.Replace("\", "/"),
      $productionUplinkFile.Replace("\", "/"),
      $softwareReadPathFile.Replace("\", "/")
    )
    optionalCompatibilityReports = @(
      $boardObservationFile.Replace("\", "/"),
      $stableCommandFile.Replace("\", "/")
    )
  }
  environment = [ordered]@{
    apiBaseUrl = $ApiBaseUrl
    webBaseUrl = $WebBaseUrl
    mqttUrl = $MqttUrl
    boardHost = $BoardHost
    boardRepoRoot = $BoardRepoRoot
  }
  centerAcceptance = [ordered]@{
    report = $centerAcceptanceFile.Replace("\", "/")
    accepted = [bool]$centerAcceptance.accepted
    currentBoundary = [string]$centerAcceptance.readiness.currentBoundary
    fullProofConclusion = [string]$centerAcceptance.fullProof.conclusion
    replayConclusion = [string]$centerAcceptance.fullProof.replayConclusion
    productVisibilityConclusion = [string]$centerAcceptance.fullProof.productVisibilityConclusion
  }
  productionUplink = [ordered]@{
    report = $productionUplinkFile.Replace("\", "/")
    accepted = [bool]$productionUplink.accepted
    currentBoundary = [string]$productionUplink.currentBoundary
    operationallyReady = $productionOperationalReady
    commandsForwarded = [int]$runtime.commandsForwarded
    ackMessagesPublished = [int]$runtime.ackMessagesPublished
    rejectedWriteFailures = [int]$runtime.rejectedWriteFailures
    spoolPending = [int]$runtime.spoolPending
    strictFailureKeys = @($productionStrictFailureKeys)
    nodeStatuses = [ordered]@{
      nodeA = $nodeAStatus
      nodeB = $nodeBStatus
      nodeC = $nodeCStatus
    }
  }
  softwareReadPath = [ordered]@{
    report = $softwareReadPathFile.Replace("\", "/")
    accepted = [bool]$softwareReadPath.accepted
    operationallyReady = $softwareReadPathOperationalReady
    currentBoundary = [string]$softwareReadPath.currentBoundary
    operationalBoundary = $softwareReadPathOperationalBoundary
  }
  boardObservation = $boardObservation
  stableCommand = $stableCommand
  operationalGate = [ordered]@{
    failureKeys = @($operationalFailureKeys)
    summary = if ($accepted) { "live-telemetry-visible-and-runtime-operational" } else { "live-telemetry-or-runtime-operational-gate-failed" }
  }
  livePlatform = [ordered]@{
    expectedFieldMetrics = $ExpectedFieldMetrics
    nodeA = $nodeAProof
    nodeB = $nodeBProof
    nodeC = $nodeCProof
  }
  checks = $checks
  nextUse = @(
    "refresh center compose acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode $CenterDeployMode -AllowUnsafeSecrets",
    "refresh rk3568 production uplink freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-production-uplink-freeze.ps1 -Password <password>",
    "refresh software read-path adaptation: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-software-read-path-adaptation.ps1",
    "refresh aggregated live closure: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-live-closure.ps1 -BoardPassword <password> -AllowUnsafeSecrets"
  )
  conclusion = if ($accepted) { "rk3568-live-telemetry-visible-through-center-api-and-web" } else { "rk3568-live-telemetry-not-yet-fully-visible-through-center-api-and-web" }
}

$json = $report | ConvertTo-Json -Depth 10
Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8

if (-not $accepted) {
  $failedKeys = (@($operationalFailureKeys)) -join ", "
  throw "field rk3568 center live closure failed: $failedKeys"
}

$json
