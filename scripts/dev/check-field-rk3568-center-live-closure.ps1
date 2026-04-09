[CmdletBinding()]
param(
  [ValidateSet("validate", "apply", "skip")]
  [string]$CenterDeployMode = "validate",
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$BoardHost = "192.168.124.172",
  [string]$BoardUser = "linaro",
  [string]$BoardPassword = "",
  [int]$BoardSshPort = 22,
  [string]$BoardRepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [int]$ObservationDurationSeconds = 60,
  [int]$ObservationPollSeconds = 10,
  [int]$BoardObservationMaxAttempts = 3,
  [int]$BoardObservationRetryDelaySeconds = 5,
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

function Resolve-OutputPath {
  param(
    [string]$RootPath,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return Join-Path $RootPath $CandidatePath
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

function Invoke-JsonScript {
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

function Convert-ToUtcDateTime {
  param([string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  return ([DateTimeOffset]::Parse($Text)).UtcDateTime
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "JSON file not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

function New-AuthSession {
  param(
    [string]$BaseUrl,
    [string]$UserNameValue,
    [string]$PasswordValue
  )

  $loginUri = ($BaseUrl.TrimEnd("/") + "/api/v1/auth/login")
  $loginBody = @{
    username = $UserNameValue
    password = $PasswordValue
  } | ConvertTo-Json -Compress

  $login = Invoke-RestMethod -Uri $loginUri -Method Post -ContentType "application/json" -Body $loginBody -Headers @{
    Accept = "application/json"
  }

  $token = [string]$login.data.token
  if ([string]::IsNullOrWhiteSpace($token)) {
    throw "Auth token missing from $loginUri"
  }

  $headers = @{
    Accept = "application/json"
    Authorization = "Bearer $token"
  }

  $me = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd("/") + "/api/v1/auth/me") -Method Get -Headers $headers

  return [pscustomobject]@{
    baseUrl = $BaseUrl.TrimEnd("/")
    headers = $headers
    login = $login
    me = $me
  }
}

function Get-DeviceListSnapshot {
  param($Session)

  return Invoke-RestMethod -Uri ($Session.baseUrl + "/api/v1/devices?page=1&pageSize=200") -Method Get -Headers $Session.headers
}

function Get-DeviceStateSnapshot {
  param(
    $Session,
    [string]$DeviceId
  )

  return Invoke-RestMethod -Uri ($Session.baseUrl + "/api/v1/data/state/" + [uri]::EscapeDataString($DeviceId)) -Method Get -Headers $Session.headers
}

function Get-ReadPathSnapshot {
  param(
    [string]$Label,
    $Session,
    [string]$DeviceId
  )

  $devicesResponse = Get-DeviceListSnapshot -Session $Session
  $stateResponse = Get-DeviceStateSnapshot -Session $Session -DeviceId $DeviceId

  $deviceList = @($devicesResponse.data.list)
  $deviceEntry = @($deviceList | Where-Object { $_.deviceId -eq $DeviceId } | Select-Object -First 1)[0]
  $stateData = $stateResponse.data
  $state = $stateData.state
  $metrics = if ($state.metrics) { $state.metrics.PSObject.Properties } else { @() }
  $meta = $state.meta
  $updatedAtText = [string]$stateData.updatedAt
  $updatedAtUtc = Convert-ToUtcDateTime -Text $updatedAtText
  $ageSeconds = if ($updatedAtUtc) {
    [Math]::Round(((Get-Date).ToUniversalTime() - $updatedAtUtc).TotalSeconds, 3)
  } else {
    $null
  }

  return [pscustomobject][ordered]@{
    label = $Label
    baseUrl = $Session.baseUrl
    authUserId = [string]$Session.me.data.userId
    authUsername = [string]$Session.me.data.username
    deviceFound = ($null -ne $deviceEntry)
    listCount = $deviceList.Count
    matchedDeviceLastSeenAt = if ($deviceEntry) { [string]$deviceEntry.lastSeenAt } else { $null }
    updatedAt = $updatedAtText
    updatedAtAgeSeconds = $ageSeconds
    metricsKeyCount = @($metrics).Count
    metricsKeys = @($metrics | ForEach-Object { $_.Name })
    metricsPreview = [ordered]@{
      temperature_c = if ($state.metrics) { $state.metrics.temperature_c } else { $null }
      humidity_pct = if ($state.metrics) { $state.metrics.humidity_pct } else { $null }
      tilt_x_deg = if ($state.metrics) { $state.metrics.tilt_x_deg } else { $null }
      gps_latitude = if ($state.metrics) { $state.metrics.gps_latitude } else { $null }
    }
    metaPreview = [ordered]@{
      install_label = if ($meta) { $meta.install_label } else { $null }
      legacy_node = if ($meta) { $meta.legacy_node } else { $null }
      upload_trigger = if ($meta) { $meta.upload_trigger } else { $null }
      last_command_type = if ($meta) { $meta.last_command_type } else { $null }
      last_command_id = if ($meta) { $meta.last_command_id } else { $null }
      last_command_uptime_s = if ($meta) { $meta.last_command_uptime_s } else { $null }
    }
  }
}

function Test-ReadPathState {
  param(
    $Snapshot,
    [string]$ExpectedInstallLabel,
    [string]$ExpectedCommandId = "",
    [int]$FreshnessMaxSeconds = 180,
    [string[]]$ExpectedMetricsKeys = @()
  )

  $installLabel = [string]$Snapshot.metaPreview.install_label
  $lastCommandId = [string]$Snapshot.metaPreview.last_command_id
  $lastCommandType = [string]$Snapshot.metaPreview.last_command_type

  $installLabelOk = ($installLabel -eq $ExpectedInstallLabel)
  $freshEnough = ($null -ne $Snapshot.updatedAtAgeSeconds -and [double]$Snapshot.updatedAtAgeSeconds -le $FreshnessMaxSeconds)
  $metricsPresent = ([int]$Snapshot.metricsKeyCount -gt 0)
  $actualMetricsKeys = @($Snapshot.metricsKeys | Sort-Object -Unique)
  $expectedMetricsKeysSorted = @($ExpectedMetricsKeys | Sort-Object -Unique)
  $metricsContractOk = $true
  if ($expectedMetricsKeysSorted.Count -gt 0) {
    $metricsContractOk = (
      $actualMetricsKeys.Count -eq $expectedMetricsKeysSorted.Count -and
      -not (Compare-Object -ReferenceObject $expectedMetricsKeysSorted -DifferenceObject $actualMetricsKeys)
    )
  }
  $commandIdMatch = $true
  $commandTypeMatch = $true

  if (-not [string]::IsNullOrWhiteSpace($ExpectedCommandId)) {
    $commandIdMatch = ($lastCommandId -eq $ExpectedCommandId)
    $commandTypeMatch = ($lastCommandType -eq "manual_collect")
  }

  return [pscustomobject][ordered]@{
    passed = ([bool]$Snapshot.deviceFound -and $metricsPresent -and $freshEnough -and $installLabelOk -and $metricsContractOk -and $commandIdMatch -and $commandTypeMatch)
    deviceFound = [bool]$Snapshot.deviceFound
    metricsPresent = $metricsPresent
    metricsContractOk = $metricsContractOk
    actualMetricsKeys = $actualMetricsKeys
    expectedMetricsKeys = if ($expectedMetricsKeysSorted.Count -gt 0) { $expectedMetricsKeysSorted } else { @() }
    freshEnough = $freshEnough
    installLabelOk = $installLabelOk
    commandIdMatch = $commandIdMatch
    commandTypeMatch = $commandTypeMatch
    updatedAtAgeSeconds = $Snapshot.updatedAtAgeSeconds
    expectedInstallLabel = $ExpectedInstallLabel
    expectedCommandId = if ([string]::IsNullOrWhiteSpace($ExpectedCommandId)) { $null } else { $ExpectedCommandId }
  }
}

function Wait-ForDualReadPathProof {
  param(
    [string]$DeviceId,
    [string]$ExpectedInstallLabel,
    [string]$ExpectedCommandId = "",
    $ApiSession,
    $WebSession,
    [int]$TimeoutSeconds = 90,
    [int]$PollSeconds = 5,
    [int]$FreshnessMaxSeconds = 180,
    [string[]]$ExpectedMetricsKeys = @()
  )

  $deadline = (Get-Date).AddSeconds([Math]::Max(1, $TimeoutSeconds))
  $attempts = New-Object System.Collections.Generic.List[object]

  while ($true) {
    $apiSnapshot = Get-ReadPathSnapshot -Label "api-direct" -Session $ApiSession -DeviceId $DeviceId
    $webSnapshot = Get-ReadPathSnapshot -Label "web-proxy" -Session $WebSession -DeviceId $DeviceId
    $apiCheck = Test-ReadPathState -Snapshot $apiSnapshot -ExpectedInstallLabel $ExpectedInstallLabel -ExpectedCommandId $ExpectedCommandId -FreshnessMaxSeconds $FreshnessMaxSeconds -ExpectedMetricsKeys $ExpectedMetricsKeys
    $webCheck = Test-ReadPathState -Snapshot $webSnapshot -ExpectedInstallLabel $ExpectedInstallLabel -ExpectedCommandId $ExpectedCommandId -FreshnessMaxSeconds $FreshnessMaxSeconds -ExpectedMetricsKeys $ExpectedMetricsKeys

    $attempts.Add([pscustomobject][ordered]@{
      polledAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      api = [ordered]@{
        passed = [bool]$apiCheck.passed
        updatedAt = $apiSnapshot.updatedAt
        updatedAtAgeSeconds = $apiSnapshot.updatedAtAgeSeconds
        metricsKeyCount = $apiSnapshot.metricsKeyCount
        metricsContractOk = [bool]$apiCheck.metricsContractOk
        install_label = $apiSnapshot.metaPreview.install_label
        last_command_id = $apiSnapshot.metaPreview.last_command_id
        last_command_type = $apiSnapshot.metaPreview.last_command_type
      }
      web = [ordered]@{
        passed = [bool]$webCheck.passed
        updatedAt = $webSnapshot.updatedAt
        updatedAtAgeSeconds = $webSnapshot.updatedAtAgeSeconds
        metricsKeyCount = $webSnapshot.metricsKeyCount
        metricsContractOk = [bool]$webCheck.metricsContractOk
        install_label = $webSnapshot.metaPreview.install_label
        last_command_id = $webSnapshot.metaPreview.last_command_id
        last_command_type = $webSnapshot.metaPreview.last_command_type
      }
    })

    if ($apiCheck.passed -and $webCheck.passed) {
      return [pscustomobject][ordered]@{
        passed = $true
        deviceId = $DeviceId
        expectedInstallLabel = $ExpectedInstallLabel
        expectedCommandId = if ([string]::IsNullOrWhiteSpace($ExpectedCommandId)) { $null } else { $ExpectedCommandId }
        api = [ordered]@{
          check = $apiCheck
          snapshot = $apiSnapshot
        }
        web = [ordered]@{
          check = $webCheck
          snapshot = $webSnapshot
        }
        attempts = @($attempts.ToArray())
      }
    }

    if ((Get-Date) -ge $deadline) {
      return [pscustomobject][ordered]@{
        passed = $false
        deviceId = $DeviceId
        expectedInstallLabel = $ExpectedInstallLabel
        expectedCommandId = if ([string]::IsNullOrWhiteSpace($ExpectedCommandId)) { $null } else { $ExpectedCommandId }
        api = [ordered]@{
          check = $apiCheck
          snapshot = $apiSnapshot
        }
        web = [ordered]@{
          check = $webCheck
          snapshot = $webSnapshot
        }
        attempts = @($attempts.ToArray())
      }
    }

    Start-Sleep -Seconds ([Math]::Max(1, $PollSeconds))
  }
}

function Get-Check {
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

$repoRoot = Resolve-RepoRoot
$resolvedOutFile = Resolve-OutputPath -RootPath $repoRoot -CandidatePath $OutFile
$reportDir = Split-Path -Parent $resolvedOutFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}

$centerAcceptanceReportPath = "docs/unified/reports/field-center-compose-acceptance-latest.json"
$boardObservationReportPath = "docs/unified/reports/field-rk3568-gateway-observation-latest.json"
$stableCommandReportPath = "docs/unified/reports/field-rk3568-gateway-node-command-stable-latest.json"
$boardObservationReportFullPath = Join-Path $repoRoot $boardObservationReportPath

Push-Location $repoRoot
try {
  $centerArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ".\scripts\dev\check-field-center-compose-acceptance.ps1",
    "-DeployMode", $CenterDeployMode,
    "-ApiBaseUrl", $ApiBaseUrl,
    "-WebBaseUrl", $WebBaseUrl,
    "-MqttUrl", $MqttUrl,
    "-Username", $Username,
    "-Password", $Password,
    "-OutFile", $centerAcceptanceReportPath
  )
  if ($AllowUnsafeSecrets.IsPresent) {
    $centerArgs += "-AllowUnsafeSecrets"
  }

  $centerAcceptance = Invoke-JsonScript "Center compose acceptance" {
    powershell @centerArgs
  }

  $boardObservation = $null
  $boardObservationAttempt = 0
  $boardObservationUsedFailureReport = $false
  $boardObservationFailureMessages = New-Object System.Collections.Generic.List[string]
  while ($boardObservationAttempt -lt [Math]::Max(1, $BoardObservationMaxAttempts)) {
    $boardObservationAttempt += 1
    try {
      $boardObservation = Invoke-JsonScript ("RK3568 board observation window attempt #{0}" -f $boardObservationAttempt) {
        powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-rk3568-field-gateway-observation-window.ps1" `
          -AcceptanceMode skip `
          -BoardHost $BoardHost `
          -User $BoardUser `
          -Password $BoardPassword `
          -SshPort $BoardSshPort `
          -RepoRoot $BoardRepoRoot `
          -MqttUrl $MqttUrl `
          -DurationSeconds $ObservationDurationSeconds `
          -PollSeconds $ObservationPollSeconds `
          -OutFile $boardObservationReportPath
      }
      break
    } catch {
      $boardObservationFailureMessages.Add($_.Exception.Message) | Out-Null
      if ($boardObservationAttempt -ge [Math]::Max(1, $BoardObservationMaxAttempts)) {
        break
      }
      Write-Host ("==> RK3568 board observation retry after transient strict failure ({0}/{1})" -f $boardObservationAttempt, $BoardObservationMaxAttempts) -ForegroundColor Yellow
      Start-Sleep -Seconds ([Math]::Max(1, $BoardObservationRetryDelaySeconds))
    }
  }

  if ($null -eq $boardObservation) {
    if (-not (Test-Path -LiteralPath $boardObservationReportFullPath)) {
      throw "Board observation did not return JSON and no report file was left behind"
    }
    $boardObservation = Read-JsonFile -Path $boardObservationReportFullPath
    $boardObservationUsedFailureReport = $true
  }

  $stableCommand = Invoke-JsonScript "RK3568 stable node command proof" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-rk3568-field-gateway-node-command-stable.ps1" `
      -DeviceId $NodeBDeviceId `
      -Action manual-collect `
      -BoardHost $BoardHost `
      -User $BoardUser `
      -Password $BoardPassword `
      -SshPort $BoardSshPort `
      -MqttUrl $MqttUrl `
      -MaxAttempts $CommandMaxAttempts `
      -RetryDelaySeconds $CommandRetryDelaySeconds `
      -OutFile $stableCommandReportPath
  }

  $stableCommandAttempt = if ($stableCommand.successfulAttempt) { $stableCommand.successfulAttempt } else { $stableCommand.finalAttempt }
  $commandProofDeviceId = [string]$stableCommand.deviceId
  $commandProofCommandId = [string]$stableCommandAttempt.commandId
  $commandProofAckStatus = [string]$stableCommandAttempt.ackStatus
  if ([string]::IsNullOrWhiteSpace($commandProofDeviceId) -or [string]::IsNullOrWhiteSpace($commandProofCommandId)) {
    throw "Stable node command proof did not expose a usable deviceId/commandId"
  }

  $apiSession = New-AuthSession -BaseUrl $ApiBaseUrl -UserNameValue $Username -PasswordValue $Password
  $webSession = New-AuthSession -BaseUrl $WebBaseUrl -UserNameValue $Username -PasswordValue $Password

  $nodeAProof = Wait-ForDualReadPathProof `
    -DeviceId $NodeADeviceId `
    -ExpectedInstallLabel $NodeAInstallLabel `
    -ApiSession $apiSession `
    -WebSession $webSession `
    -TimeoutSeconds $StatePollTimeoutSeconds `
    -PollSeconds $StatePollSeconds `
    -FreshnessMaxSeconds $FreshnessSeconds `
    -ExpectedMetricsKeys $ExpectedFieldMetrics

  $nodeBProof = Wait-ForDualReadPathProof `
    -DeviceId $NodeBDeviceId `
    -ExpectedInstallLabel $NodeBInstallLabel `
    -ExpectedCommandId $commandProofCommandId `
    -ApiSession $apiSession `
    -WebSession $webSession `
    -TimeoutSeconds $StatePollTimeoutSeconds `
    -PollSeconds $StatePollSeconds `
    -FreshnessMaxSeconds $FreshnessSeconds `
    -ExpectedMetricsKeys $ExpectedFieldMetrics

  $centerCurrentBoundary = [string]$centerAcceptance.readiness.currentBoundary
  $boardConclusion = [string]$boardObservation.conclusion
  $nodeCStatus = [string]$boardObservation.window.lastSample.nodeCStatus
  $boardWindow = $boardObservation.window
  $boardWindowClean = (
    [bool]$boardWindow.statusContinuous.serviceActive -and
    [bool]$boardWindow.statusContinuous.mqttConnected -and
    [bool]$boardWindow.statusContinuous.serialOpen -and
    [bool]$boardWindow.statusContinuous.portOnline -and
    [bool]$boardWindow.statusContinuous.nodeAOnline -and
    [bool]$boardWindow.statusContinuous.nodeBOnline -and
    [bool]$boardWindow.statusContinuous.nodeCPrepared -and
    ([int]$boardWindow.counterDelta.nodeATelemetryMessages -gt 0) -and
    ([int]$boardWindow.counterDelta.nodeBTelemetryMessages -gt 0) -and
    ([int]$boardWindow.counterDelta.publishFailures -eq 0) -and
    ([int]$boardWindow.counterDelta.schemaRejected -eq 0) -and
    ([int]$boardWindow.maxObserved.spoolPending -eq 0) -and
    (-not [bool]$boardWindow.reconnectObserved)
  )

  $checks = @(
    (Get-Check -Key "centerComposeAccepted" -Ok:([bool]$centerAcceptance.accepted) -Actual ([bool]$centerAcceptance.accepted) -Expected $true),
    (Get-Check -Key "centerComposeBoundary" -Ok:($centerCurrentBoundary -eq "full-path-ready") -Actual $centerCurrentBoundary -Expected "full-path-ready"),
    (Get-Check -Key "boardObservationWindowClean" -Ok:($boardWindowClean) -Actual $boardConclusion -Expected "continuous-online-window-with-zero-new-rejects-and-no-publish-failures"),
    (Get-Check -Key "boardNodeCPrepared" -Ok:($nodeCStatus -in @("configured", "online")) -Actual $nodeCStatus -Expected "configured|online"),
    (Get-Check -Key "boardStableCommandPassed" -Ok:([bool]$stableCommand.passed) -Actual ([bool]$stableCommand.passed) -Expected $true),
    (Get-Check -Key "boardStableCommandAcked" -Ok:($commandProofAckStatus -eq "acked") -Actual $commandProofAckStatus -Expected "acked"),
    (Get-Check -Key "nodeAApiDirectVisible" -Ok:([bool]$nodeAProof.api.check.passed) -Actual ([bool]$nodeAProof.api.check.passed) -Expected $true),
    (Get-Check -Key "nodeAWebProxyVisible" -Ok:([bool]$nodeAProof.web.check.passed) -Actual ([bool]$nodeAProof.web.check.passed) -Expected $true),
    (Get-Check -Key "nodeAApiMetricsContract" -Ok:([bool]$nodeAProof.api.check.metricsContractOk) -Actual ([int]$nodeAProof.api.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
    (Get-Check -Key "nodeAWebMetricsContract" -Ok:([bool]$nodeAProof.web.check.metricsContractOk) -Actual ([int]$nodeAProof.web.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
    (Get-Check -Key "nodeBApiDirectVisible" -Ok:([bool]$nodeBProof.api.check.passed) -Actual ([bool]$nodeBProof.api.check.passed) -Expected $true),
    (Get-Check -Key "nodeBWebProxyVisible" -Ok:([bool]$nodeBProof.web.check.passed) -Actual ([bool]$nodeBProof.web.check.passed) -Expected $true),
    (Get-Check -Key "nodeBApiMetricsContract" -Ok:([bool]$nodeBProof.api.check.metricsContractOk) -Actual ([int]$nodeBProof.api.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
    (Get-Check -Key "nodeBWebMetricsContract" -Ok:([bool]$nodeBProof.web.check.metricsContractOk) -Actual ([int]$nodeBProof.web.snapshot.metricsKeyCount) -Expected ($ExpectedFieldMetrics.Count)),
    (Get-Check -Key "nodeBCommandIdInApiState" -Ok:([bool]$nodeBProof.api.check.commandIdMatch) -Actual ([string]$nodeBProof.api.snapshot.metaPreview.last_command_id) -Expected $commandProofCommandId),
    (Get-Check -Key "nodeBCommandIdInWebState" -Ok:([bool]$nodeBProof.web.check.commandIdMatch) -Actual ([string]$nodeBProof.web.snapshot.metaPreview.last_command_id) -Expected $commandProofCommandId),
    (Get-Check -Key "nodeBManualCollectTypeInApiState" -Ok:([bool]$nodeBProof.api.check.commandTypeMatch) -Actual ([string]$nodeBProof.api.snapshot.metaPreview.last_command_type) -Expected "manual_collect"),
    (Get-Check -Key "nodeBManualCollectTypeInWebState" -Ok:([bool]$nodeBProof.web.check.commandTypeMatch) -Actual ([string]$nodeBProof.web.snapshot.metaPreview.last_command_type) -Expected "manual_collect")
  )

  $accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    accepted = $accepted
    mode = "field-rk3568-center-live-closure"
    currentBoundary = if ($accepted) {
      "rk3568-live-center-closure-ready"
    } else {
      "rk3568-live-center-closure-not-yet-accepted"
    }
    environment = [ordered]@{
      apiBaseUrl = $ApiBaseUrl
      webBaseUrl = $WebBaseUrl
      mqttUrl = $MqttUrl
      boardHost = $BoardHost
      boardRepoRoot = $BoardRepoRoot
    }
    centerAcceptance = [ordered]@{
      report = "docs/unified/reports/field-center-compose-acceptance-latest.json"
      accepted = [bool]$centerAcceptance.accepted
      currentBoundary = $centerCurrentBoundary
      fullProofConclusion = [string]$centerAcceptance.fullProof.conclusion
      replayConclusion = [string]$centerAcceptance.fullProof.replayConclusion
      productVisibilityConclusion = [string]$centerAcceptance.fullProof.productVisibilityConclusion
    }
    boardObservation = [ordered]@{
      report = "docs/unified/reports/field-rk3568-gateway-observation-latest.json"
      passed = [bool]$boardObservation.passed
      conclusion = $boardConclusion
      retry = [ordered]@{
        maxAttempts = [Math]::Max(1, $BoardObservationMaxAttempts)
        usedAttempts = $boardObservationAttempt
        priorFailureMessages = @($boardObservationFailureMessages.ToArray())
        usedFailureReport = $boardObservationUsedFailureReport
      }
      sampleCount = [int]$boardObservation.sampleCount
      durationSeconds = [int]$boardObservation.durationSeconds
      pollSeconds = [int]$boardObservation.pollSeconds
      acceptance = [ordered]@{
        currentBoundary = [string]$boardObservation.acceptance.currentBoundary
        strictAccepted = [bool]$boardObservation.acceptance.accepted
        strictError = [string]$boardObservation.acceptance.error
        strictCommandProofDeviceId = [string]$boardObservation.acceptance.commandProofDeviceId
        strictCommandProofCommandId = [string]$boardObservation.acceptance.commandProofCommandId
        strictCommandProofAckStatus = [string]$boardObservation.acceptance.commandProofAckStatus
      }
      window = [ordered]@{
        clean = $boardWindowClean
        counterDelta = $boardObservation.window.counterDelta
        maxObserved = $boardObservation.window.maxObserved
        reconnectObserved = [bool]$boardObservation.window.reconnectObserved
        statusContinuous = $boardObservation.window.statusContinuous
        lastSample = $boardObservation.window.lastSample
      }
    }
    stableCommand = [ordered]@{
      report = $stableCommandReportPath
      passed = [bool]$stableCommand.passed
      conclusion = [string]$stableCommand.conclusion
      attemptCount = [int]$stableCommand.attemptCount
      maxAttempts = [int]$stableCommand.maxAttempts
      retryDelaySeconds = [int]$stableCommand.retryDelaySeconds
      deviceId = $commandProofDeviceId
      action = [string]$stableCommand.action
      commandId = $commandProofCommandId
      ackStatus = $commandProofAckStatus
      successfulAttempt = $stableCommand.successfulAttempt
      finalAttempt = $stableCommand.finalAttempt
    }
    livePlatform = [ordered]@{
      expectedFieldMetrics = $ExpectedFieldMetrics
      nodeA = $nodeAProof
      nodeB = $nodeBProof
      nodeC = [ordered]@{
        deviceId = $NodeCDeviceId
        boardStatus = $nodeCStatus
        note = "preallocated-but-not-blocking"
      }
    }
    checks = $checks
    nextUse = @(
      "cross-boundary live closure: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-live-closure.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
      "board-only acceptance: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-rk3568-field-gateway-acceptance.ps1 -DeployMode skip -Password <password>",
      "board-only observation: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-rk3568-field-gateway-observation-window.ps1 -AcceptanceMode skip -DurationSeconds 120 -PollSeconds 10 -Password <password>",
      "board stable command entry: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-rk3568-field-gateway-node-command-stable.ps1 -DeviceId 00000000-0000-0000-0000-000000000002 -Action manual-collect -Password <password>"
    )
    conclusion = if ($accepted) {
      "rk3568-live-telemetry-visible-through-center-api-and-web"
    } else {
      "rk3568-live-telemetry-not-yet-fully-visible-through-center-api-and-web"
    }
  }

  $reportJson = $report | ConvertTo-Json -Depth 10
  Set-Content -Path $resolvedOutFile -Value $reportJson -Encoding UTF8

  if (-not $accepted) {
    $failedKeys = (@($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })) -join ", "
    throw "field rk3568 center live closure failed: $failedKeys"
  }

  $reportJson
} finally {
  Pop-Location
}
