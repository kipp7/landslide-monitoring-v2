[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$StationCode = "ST-LS-CN-GX-YL-GBS-001-01",
  [string]$StationName = "GBS Landslide Station 01",
  [string]$StationDisplayName = "GBS Station 01",
  [string]$LocationName = "GBS Field Area",
  [string]$RegionCode = "CN-GX-YL-GBS",
  [string]$SlopeCode = "LS-CN-GX-YL-GBS-001",
  [string]$GatewayCode = "GW-CN-GX-YL-GBS-01",
  [string]$GatewayDisplayName = "RK3568-1",
  [string]$LifecycleStatus = "commissioned",
  [string]$SouthboundPort = "/dev/ttyS3",
  [string[]]$NodeSpec = @(
    "A|00000000-0000-0000-0000-000000000001|FIELD-NODE-A",
    "B|00000000-0000-0000-0000-000000000002|FIELD-NODE-B",
    "C|00000000-0000-0000-0000-000000000003|FIELD-NODE-C"
  ),
  [switch]$ApplySouthbound,
  [string]$BoardHost = "192.168.124.179",
  [string]$BoardUser = "linaro",
  [string]$BoardPassword = "",
  [int]$BoardSshPort = 22,
  [ValidateSet("auto", "skip")] [string]$BaselineMode = "auto",
  [string[]]$BaselineFieldNodeId = @(),
  [int]$BaselinePointsCount = 20,
  [int]$BaselineLookbackDays = 30,
  [string]$BaselineLatKey = "gps_latitude",
  [string]$BaselineLonKey = "gps_longitude",
  [string]$BaselineAltKey = "gps_altitude",
  [switch]$SkipQualityCheck,
  [switch]$Strict,
  [string]$OnboardingOutFile = "docs/unified/reports/field-formal-device-onboarding-latest.json",
  [string]$OnboardingSecretOutFile = "backups/evidence/field-formal-device-onboarding-latest.json",
  [string]$OutFile = "docs/unified/reports/field-formal-device-commissioning-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-ApiJson {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "PUT", "DELETE")] [string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null,
    [string]$Token = ""
  )

  $uri = ($ApiBaseUrl.TrimEnd("/") + $Path)
  $headers = @{
    "Accept" = "application/json"
  }
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $invokeParams = @{
    Method = $Method
    Uri = $uri
    Headers = $headers
  }

  if ($Body -ne $null) {
    $invokeParams["ContentType"] = "application/json; charset=utf-8"
    $invokeParams["Body"] = ($Body | ConvertTo-Json -Depth 12 -Compress)
  }

  try {
    $response = Invoke-WebRequest @invokeParams
    $statusCode = [int]$response.StatusCode
    $raw = $response.Content
  } catch {
    $webResponse = $_.Exception.Response
    if (-not $webResponse) {
      throw
    }
    $statusCode = [int]$webResponse.StatusCode
    $stream = $webResponse.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    try {
      $raw = $reader.ReadToEnd()
    } finally {
      $reader.Dispose()
      $stream.Dispose()
    }
  }

  $json = $null
  if ($raw -and $raw.Trim()) {
    try {
      $json = $raw | ConvertFrom-Json
    } catch {
      $json = $null
    }
  }

  [ordered]@{
    statusCode = $statusCode
    raw = $raw
    json = $json
  }
}

function Assert-ApiSuccess {
  param(
    [Parameter(Mandatory = $true)][hashtable]$Response,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ($Response.statusCode -lt 200 -or $Response.statusCode -ge 300) {
    throw "$Label failed (status=$($Response.statusCode)): $($Response.raw)"
  }
}

function Get-JsonField {
  param(
    [object]$Object,
    [string]$Name
  )

  if ($null -eq $Object) {
    return ""
  }

  if ($Object.PSObject.Properties.Name -contains $Name) {
    return [string]$Object.$Name
  }

  if (($Object.PSObject.Properties.Name -contains "metadata") -and $null -ne $Object.metadata) {
    if ($Object.metadata.PSObject.Properties.Name -contains $Name) {
      return [string]$Object.metadata.$Name
    }
  }

  return ""
}

function Add-Mismatch {
  param(
    [System.Collections.Generic.List[object]]$Items,
    [string]$Field,
    [string]$Expected,
    [string]$Actual
  )

  if ([string]$Expected -ne [string]$Actual) {
    $Items.Add([ordered]@{
      field = $Field
      expected = $Expected
      actual = $Actual
    })
  }
}

function Get-ResponseMessage {
  param([hashtable]$Response)

  if ($Response.json -and $Response.json.message) {
    return [string]$Response.json.message
  }

  if ($Response.raw) {
    return [string]$Response.raw
  }

  return ""
}

function Get-BaselineSummary {
  param([object]$BaselineDetail)

  if ($null -eq $BaselineDetail) {
    return $null
  }

  $baseline = $BaselineDetail.baseline
  [ordered]@{
    method = [string]$BaselineDetail.method
    pointsCount = if ($null -eq $BaselineDetail.pointsCount) { $null } else { [int]$BaselineDetail.pointsCount }
    computedAt = [string]$BaselineDetail.computedAt
    latitude = if ($null -eq $baseline.latitude) { $null } else { [double]$baseline.latitude }
    longitude = if ($null -eq $baseline.longitude) { $null } else { [double]$baseline.longitude }
    altitude = if ($null -eq $baseline.altitude) { $null } else { [double]$baseline.altitude }
    positionAccuracyMeters = if ($null -eq $baseline.positionAccuracyMeters) { $null } else { [double]$baseline.positionAccuracyMeters }
    satelliteCount = if ($null -eq $baseline.satelliteCount) { $null } else { [int]$baseline.satelliteCount }
    notes = if ($null -eq $baseline.notes) { $null } else { [string]$baseline.notes }
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$registerScript = Join-Path $PSScriptRoot "register-field-formal-devices.ps1"
$registerSplat = @{
  ApiBaseUrl = $ApiBaseUrl
  Username = $Username
  Password = $Password
  StationCode = $StationCode
  StationName = $StationName
  StationDisplayName = $StationDisplayName
  LocationName = $LocationName
  RegionCode = $RegionCode
  SlopeCode = $SlopeCode
  GatewayCode = $GatewayCode
  GatewayDisplayName = $GatewayDisplayName
  LifecycleStatus = $LifecycleStatus
  SouthboundPort = $SouthboundPort
  NodeSpec = $NodeSpec
  BoardHost = $BoardHost
  BoardUser = $BoardUser
  BoardSshPort = $BoardSshPort
  OutFile = $OnboardingOutFile
  SecretOutFile = $OnboardingSecretOutFile
}

if ($ApplySouthbound) {
  $registerSplat["ApplySouthbound"] = $true
}

if ($BoardPassword) {
  $registerSplat["BoardPassword"] = $BoardPassword
}

$registerRaw = & $registerScript @registerSplat | Out-String
if (-not $registerRaw.Trim()) {
  throw "register-field-formal-devices.ps1 returned empty output"
}
$registerResult = $registerRaw | ConvertFrom-Json

$loginResponse = Invoke-ApiJson -Method POST -Path "/api/v1/auth/login" -Body @{
  username = $Username
  password = $Password
}
Assert-ApiSuccess -Response $loginResponse -Label "POST /api/v1/auth/login"
$token = ""
if ($loginResponse.json -and $loginResponse.json.data -and $loginResponse.json.data.token) {
  $token = [string]$loginResponse.json.data.token
}
if (-not $token) {
  throw "Login did not return token: $($loginResponse.raw)"
}

$stationResponse = Invoke-ApiJson -Method GET -Path ("/api/v1/stations/{0}" -f [uri]::EscapeDataString([string]$registerResult.station.stationId)) -Token $token
Assert-ApiSuccess -Response $stationResponse -Label "GET /api/v1/stations/{stationId}"
$stationDetail = $stationResponse.json.data
$stationMismatches = New-Object 'System.Collections.Generic.List[object]'
Add-Mismatch -Items $stationMismatches -Field "stationCode" -Expected ([string]$registerResult.station.stationCode) -Actual (Get-JsonField -Object $stationDetail -Name "stationCode")
Add-Mismatch -Items $stationMismatches -Field "displayName" -Expected ([string]$registerResult.station.displayName) -Actual (Get-JsonField -Object $stationDetail -Name "displayName")
Add-Mismatch -Items $stationMismatches -Field "regionCode" -Expected ([string]$registerResult.station.regionCode) -Actual (Get-JsonField -Object $stationDetail -Name "regionCode")
Add-Mismatch -Items $stationMismatches -Field "slopeCode" -Expected ([string]$registerResult.station.slopeCode) -Actual (Get-JsonField -Object $stationDetail -Name "slopeCode")
Add-Mismatch -Items $stationMismatches -Field "lifecycleStatus" -Expected ([string]$registerResult.station.lifecycleStatus) -Actual (Get-JsonField -Object $stationDetail -Name "lifecycleStatus")
$stationPassed = $stationMismatches.Count -eq 0

$baselineTarget = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
if ($BaselineFieldNodeId.Count -gt 0) {
  foreach ($fieldNodeId in $BaselineFieldNodeId) {
    [void]$baselineTarget.Add([string]$fieldNodeId)
  }
} else {
  foreach ($device in @($registerResult.devices)) {
    [void]$baselineTarget.Add([string]$device.fieldNodeId)
  }
}

$qualityPointsCount = [Math]::Max(10, [Math]::Min($BaselinePointsCount, 200))
$deviceResults = New-Object System.Collections.ArrayList
foreach ($device in @($registerResult.devices)) {
  $deviceId = [string]$device.deviceId
  $detailResponse = Invoke-ApiJson -Method GET -Path ("/api/v1/devices/{0}" -f [uri]::EscapeDataString($deviceId)) -Token $token
  Assert-ApiSuccess -Response $detailResponse -Label ("GET /api/v1/devices/{0}" -f $deviceId)
  $detail = $detailResponse.json.data

  $mismatches = New-Object 'System.Collections.Generic.List[object]'
  Add-Mismatch -Items $mismatches -Field "identityClass" -Expected ([string]$device.identityClass) -Actual (Get-JsonField -Object $detail -Name "identityClass")
  Add-Mismatch -Items $mismatches -Field "stationCode" -Expected ([string]$device.stationCode) -Actual (Get-JsonField -Object $detail -Name "stationCode")
  Add-Mismatch -Items $mismatches -Field "regionCode" -Expected $RegionCode -Actual (Get-JsonField -Object $detail -Name "regionCode")
  Add-Mismatch -Items $mismatches -Field "slopeCode" -Expected $SlopeCode -Actual (Get-JsonField -Object $detail -Name "slopeCode")
  Add-Mismatch -Items $mismatches -Field "nodeCode" -Expected ([string]$device.nodeCode) -Actual (Get-JsonField -Object $detail -Name "nodeCode")
  Add-Mismatch -Items $mismatches -Field "gatewayCode" -Expected ([string]$device.gatewayCode) -Actual (Get-JsonField -Object $detail -Name "gatewayCode")
  Add-Mismatch -Items $mismatches -Field "displayName" -Expected ([string]$device.displayName) -Actual (Get-JsonField -Object $detail -Name "displayName")
  Add-Mismatch -Items $mismatches -Field "installLabel" -Expected ([string]$device.installLabel) -Actual (Get-JsonField -Object $detail -Name "installLabel")
  $namingPassed = $mismatches.Count -eq 0

  $baselineRequired = ($BaselineMode -eq "auto") -and $baselineTarget.Contains([string]$device.fieldNodeId)
  $baselineAutoSummary = $null
  if ($baselineRequired) {
    $autoResponse = Invoke-ApiJson -Method POST -Path ("/api/v1/gps/baselines/{0}/auto-establish" -f [uri]::EscapeDataString($deviceId)) -Token $token -Body @{
      pointsCount = $BaselinePointsCount
      lookbackDays = $BaselineLookbackDays
      latKey = $BaselineLatKey
      lonKey = $BaselineLonKey
      altKey = $BaselineAltKey
    }

    $autoData = if ($autoResponse.json) { $autoResponse.json.data } else { $null }
    $baselineAutoSummary = [ordered]@{
      statusCode = $autoResponse.statusCode
      success = $autoResponse.statusCode -ge 200 -and $autoResponse.statusCode -lt 300
      message = Get-ResponseMessage -Response $autoResponse
      persisted = if ($null -ne $autoData -and $null -ne $autoData.persisted) { [bool]$autoData.persisted } else { $null }
      pointsUsed = if ($null -ne $autoData -and $null -ne $autoData.pointsUsed) { [int]$autoData.pointsUsed } else { $null }
    }
  }

  $baselineDetailResponse = Invoke-ApiJson -Method GET -Path ("/api/v1/gps/baselines/{0}" -f [uri]::EscapeDataString($deviceId)) -Token $token
  $baselineDetail = $null
  if ($baselineDetailResponse.statusCode -ge 200 -and $baselineDetailResponse.statusCode -lt 300) {
    $baselineDetail = $baselineDetailResponse.json.data
  } elseif ($baselineDetailResponse.statusCode -ne 404) {
    throw "GET /api/v1/gps/baselines/$deviceId failed (status=$($baselineDetailResponse.statusCode)): $($baselineDetailResponse.raw)"
  }

  $qualitySummary = $null
  $qualityPassed = $SkipQualityCheck.IsPresent -or (-not $baselineRequired)
  if ($baselineRequired -and $baselineDetail -and -not $SkipQualityCheck) {
    $query = "pointsCount=$qualityPointsCount&lookbackDays=$BaselineLookbackDays&latKey=$([uri]::EscapeDataString($BaselineLatKey))&lonKey=$([uri]::EscapeDataString($BaselineLonKey))&altKey=$([uri]::EscapeDataString($BaselineAltKey))"
    $qualityResponse = Invoke-ApiJson -Method GET -Path ("/api/v1/gps/baselines/{0}/quality-check?{1}" -f [uri]::EscapeDataString($deviceId), $query) -Token $token
    if ($qualityResponse.statusCode -ge 200 -and $qualityResponse.statusCode -lt 300) {
      $qualityData = $qualityResponse.json.data
      $qualityLevel = if ($qualityData.recommendation -and $qualityData.recommendation.level) { [string]$qualityData.recommendation.level } else { "" }
      $qualityPassed = $qualityLevel -ne "bad"
      $qualitySummary = [ordered]@{
        statusCode = $qualityResponse.statusCode
        level = $qualityLevel
        message = Get-ResponseMessage -Response $qualityResponse
        p95Meters = if ($qualityData.driftMeters -and $null -ne $qualityData.driftMeters.p95) { [double]$qualityData.driftMeters.p95 } else { $null }
        maxMeters = if ($qualityData.driftMeters -and $null -ne $qualityData.driftMeters.max) { [double]$qualityData.driftMeters.max } else { $null }
      }
    } else {
      $qualityPassed = $false
      $qualitySummary = [ordered]@{
        statusCode = $qualityResponse.statusCode
        level = ""
        message = Get-ResponseMessage -Response $qualityResponse
      }
    }
  }

  $baselinePassed = -not $baselineRequired
  if ($baselineRequired) {
    $baselinePassed = ($null -ne $baselineDetail) -and $qualityPassed
  }

  $expectedNaming = @{}
  $expectedNaming["identityClass"] = [string]$device.identityClass
  $expectedNaming["stationCode"] = [string]$device.stationCode
  $expectedNaming["regionCode"] = $RegionCode
  $expectedNaming["slopeCode"] = $SlopeCode
  $expectedNaming["nodeCode"] = [string]$device.nodeCode
  $expectedNaming["gatewayCode"] = [string]$device.gatewayCode
  $expectedNaming["displayName"] = [string]$device.displayName
  $expectedNaming["installLabel"] = [string]$device.installLabel

  $actualNaming = @{}
  $actualNaming["identityClass"] = Get-JsonField -Object $detail -Name "identityClass"
  $actualNaming["stationCode"] = Get-JsonField -Object $detail -Name "stationCode"
  $actualNaming["regionCode"] = Get-JsonField -Object $detail -Name "regionCode"
  $actualNaming["slopeCode"] = Get-JsonField -Object $detail -Name "slopeCode"
  $actualNaming["nodeCode"] = Get-JsonField -Object $detail -Name "nodeCode"
  $actualNaming["gatewayCode"] = Get-JsonField -Object $detail -Name "gatewayCode"
  $actualNaming["displayName"] = Get-JsonField -Object $detail -Name "displayName"
  $actualNaming["installLabel"] = Get-JsonField -Object $detail -Name "installLabel"

  $baselineBlock = @{}
  $baselineBlock["mode"] = $BaselineMode
  $baselineBlock["required"] = $baselineRequired
  $baselineBlock["passed"] = $baselinePassed
  $baselineBlock["autoEstablish"] = $baselineAutoSummary
  $baselineBlock["detail"] = Get-BaselineSummary -BaselineDetail $baselineDetail
  $baselineBlock["qualityCheck"] = $qualitySummary

  $namingBlock = @{}
  $namingBlock["passed"] = $namingPassed
  $namingBlock["expected"] = $expectedNaming
  $namingBlock["actual"] = $actualNaming
  $namingBlock["mismatchCount"] = [int]$mismatches.Count
  $namingBlock["mismatchFieldsCsv"] = (@($mismatches | ForEach-Object { [string]$_.field })) -join ","

  $deviceResult = New-Object PSObject
  $deviceResult | Add-Member -NotePropertyName fieldNodeId -NotePropertyValue ([string]$device.fieldNodeId)
  $deviceResult | Add-Member -NotePropertyName deviceId -NotePropertyValue $deviceId
  $deviceResult | Add-Member -NotePropertyName deviceType -NotePropertyValue ([string]$detail.deviceType)
  $deviceResult | Add-Member -NotePropertyName status -NotePropertyValue ([string]$detail.status)
  $deviceResult | Add-Member -NotePropertyName lastSeenAt -NotePropertyValue ([string]$detail.lastSeenAt)
  $deviceResult | Add-Member -NotePropertyName naming -NotePropertyValue $namingBlock
  $deviceResult | Add-Member -NotePropertyName baseline -NotePropertyValue $baselineBlock
  [void]$deviceResults.Add($deviceResult)
}

$deviceFailures = @($deviceResults | Where-Object { -not $_.naming.passed -or -not $_.baseline.passed })
$namingPassed = $stationPassed -and (@($deviceResults | Where-Object { -not $_.naming.passed }).Count -eq 0)
$baselineGatePassed = @($deviceResults | Where-Object { $_.baseline.required -and -not $_.baseline.passed }).Count -eq 0
$accepted = $namingPassed -and $baselineGatePassed
$blockingIssues = New-Object 'System.Collections.Generic.List[string]'
if (-not $stationPassed) {
  $blockingIssues.Add("station canonical identity mismatch")
}
if (@($deviceResults | Where-Object { -not $_.naming.passed }).Count -gt 0) {
  $blockingIssues.Add("one or more devices failed canonical naming verification")
}
if (@($deviceResults | Where-Object { $_.baseline.required -and -not $_.baseline.passed }).Count -gt 0) {
  $blockingIssues.Add("one or more required baseline nodes failed baseline establishment or quality check")
}

$stationActual = @{}
$stationActual["stationId"] = [string]$stationDetail.stationId
$stationActual["stationCode"] = Get-JsonField -Object $stationDetail -Name "stationCode"
$stationActual["stationName"] = Get-JsonField -Object $stationDetail -Name "stationName"
$stationActual["displayName"] = Get-JsonField -Object $stationDetail -Name "displayName"
$stationActual["regionCode"] = Get-JsonField -Object $stationDetail -Name "regionCode"
$stationActual["slopeCode"] = Get-JsonField -Object $stationDetail -Name "slopeCode"
$stationActual["lifecycleStatus"] = Get-JsonField -Object $stationDetail -Name "lifecycleStatus"
$stationActual["status"] = Get-JsonField -Object $stationDetail -Name "status"

$stationReport = @{}
$stationReport["expected"] = $registerResult.station
$stationReport["actual"] = $stationActual
$stationReport["passed"] = $stationPassed
$stationReport["mismatchCount"] = [int]$stationMismatches.Count
$stationReport["mismatchFieldsCsv"] = (@($stationMismatches | ForEach-Object { [string]$_.field })) -join ","

$baselineOptions = @{}
$baselineOptions["pointsCount"] = $BaselinePointsCount
$baselineOptions["lookbackDays"] = $BaselineLookbackDays
$baselineOptions["latKey"] = $BaselineLatKey
$baselineOptions["lonKey"] = $BaselineLonKey
$baselineOptions["altKey"] = $BaselineAltKey
$baselineOptions["qualityCheckEnabled"] = (-not $SkipQualityCheck.IsPresent)

$commissioningReport = @{}
$commissioningReport["registrationReport"] = $OnboardingOutFile
$commissioningReport["firstRegistrationFlow"] = $registerResult.firstRegistrationFlow
$commissioningReport["southbound"] = $registerResult.southbound
$commissioningReport["baselineMode"] = $BaselineMode
$commissioningReport["baselineFieldNodeIds"] = @($baselineTarget)
$commissioningReport["baselineOptions"] = $baselineOptions

$acceptanceReport = @{}
$acceptanceReport["namingPassed"] = $namingPassed
$acceptanceReport["baselinePassed"] = $baselineGatePassed
$acceptanceReport["accepted"] = $accepted
$acceptanceReport["failedDevices"] = @($deviceFailures | ForEach-Object { [string]$_.fieldNodeId })
$acceptanceReport["blockingIssues"] = @($blockingIssues)

$report = @{}
$report["generatedAt"] = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$report["mode"] = "field-formal-device-commissioning"
$report["apiBaseUrl"] = $ApiBaseUrl
$report["runbook"] = "docs/guides/runbooks/field-formal-device-commissioning-runbook.md"
$report["station"] = $stationReport
$report["commissioning"] = $commissioningReport
$report["devices"] = @($deviceResults)
$report["acceptance"] = $acceptanceReport

$reportJson = $report | ConvertTo-Json -Depth 12
Set-Content -Path $resolvedOutFile -Value $reportJson -Encoding UTF8

if ($Strict -and -not $accepted) {
  throw "field formal device commissioning not accepted; see $OutFile"
}

$reportJson
