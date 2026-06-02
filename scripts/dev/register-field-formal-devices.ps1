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
  [string]$OutFile = "docs/unified/reports/field-formal-device-onboarding-latest.json",
  [string]$SecretOutFile = "backups/evidence/field-formal-device-onboarding-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Convert-NodeSpecToObject {
  param([string]$Value)

  $parts = @($Value.Split("|"))
  if ($parts.Count -lt 3 -or $parts.Count -gt 4) {
    throw "Invalid NodeSpec '$Value'. Expected: fieldNodeId|deviceId|installLabel[|deviceType]"
  }

  $fieldNodeId = $parts[0].Trim()
  $deviceId = $parts[1].Trim()
  $installLabel = $parts[2].Trim()
  $deviceType = if ($parts.Count -ge 4) { $parts[3].Trim() } else { "multi_sensor" }

  if (-not $fieldNodeId) {
    throw "NodeSpec '$Value' has empty fieldNodeId"
  }

  [guid]::Parse($deviceId) | Out-Null

  if (-not $installLabel) {
    $installLabel = "FIELD-NODE-$fieldNodeId"
  }

  if (-not $deviceType) {
    $deviceType = "multi_sensor"
  }

  [ordered]@{
    fieldNodeId = $fieldNodeId
    deviceId = $deviceId
    installLabel = $installLabel
    deviceType = $deviceType
  }
}

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

function Get-AllListItems {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Token
  )

  $items = @()
  $page = 1
  $pageSize = 200
  while ($true) {
    $separator = if ($Path.Contains("?")) { "&" } else { "?" }
    $response = Invoke-ApiJson -Method GET -Path ("{0}{1}page={2}&pageSize={3}" -f $Path, $separator, $page, $pageSize) -Token $Token
    Assert-ApiSuccess -Response $response -Label "GET $Path"
    $data = $response.json.data
    if ($data -and $data.list) {
      $items += @($data.list)
    }
    $totalPages = 1
    if ($data -and $data.pagination -and $data.pagination.totalPages) {
      $totalPages = [int]$data.pagination.totalPages
    }
    if ($page -ge $totalPages) {
      break
    }
    $page += 1
  }
  return ,$items
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedOutFile = Join-Path $repoRoot $OutFile
$resolvedSecretOutFile = Join-Path $repoRoot $SecretOutFile
$resolvedNodes = @($NodeSpec | ForEach-Object { Convert-NodeSpecToObject -Value $_ })

$loginResponse = Invoke-ApiJson -Method POST -Path "/api/v1/auth/login" -Body @{
  username = $Username
  password = $Password
}
Assert-ApiSuccess -Response $loginResponse -Label "POST /api/v1/auth/login"
$token = ""
if ($loginResponse.json -and $loginResponse.json.data -and $loginResponse.json.data.token) {
  $token = [string]$loginResponse.json.data.token
}
if (-not $token -and $loginResponse.raw) {
  try {
    $loginFallback = $loginResponse.raw | ConvertFrom-Json
    if ($loginFallback -and $loginFallback.data -and $loginFallback.data.token) {
      $token = [string]$loginFallback.data.token
    }
  } catch {
  }
}
if (-not $token) {
  throw "Login did not return token: $($loginResponse.raw)"
}

$existingStations = @(Get-AllListItems -Path "/api/v1/stations" -Token $token)
$matchedStation = @($existingStations | Where-Object { [string]$_.stationCode -eq $StationCode } | Select-Object -First 1)[0]

$stationMetadata = [ordered]@{
  identityClass = "formal"
  stationCode = $StationCode
  displayName = $StationDisplayName
  locationName = $LocationName
  location_name = $LocationName
  regionCode = $RegionCode
  slopeCode = $SlopeCode
  lifecycleStatus = $LifecycleStatus
  gatewayCode = $GatewayCode
  gatewayDisplayName = $GatewayDisplayName
  onboardingMode = "gateway_preprovisioned"
}

if ($matchedStation) {
  $stationDetail = Invoke-ApiJson -Method GET -Path ("/api/v1/stations/{0}" -f [uri]::EscapeDataString([string]$matchedStation.stationId)) -Token $token
  Assert-ApiSuccess -Response $stationDetail -Label "GET /api/v1/stations/{stationId}"
  $mergedStationMetadata = @{}
  if ($stationDetail.json.data.metadata) {
    foreach ($property in $stationDetail.json.data.metadata.PSObject.Properties) {
      $mergedStationMetadata[$property.Name] = $property.Value
    }
  }
  foreach ($property in $stationMetadata.GetEnumerator()) {
    $mergedStationMetadata[$property.Key] = $property.Value
  }
  $updateStation = Invoke-ApiJson -Method PUT -Path ("/api/v1/stations/{0}" -f [uri]::EscapeDataString([string]$matchedStation.stationId)) -Token $token -Body @{
    stationName = $StationName
    status = "active"
    metadata = $mergedStationMetadata
  }
  Assert-ApiSuccess -Response $updateStation -Label "PUT /api/v1/stations/{stationId}"
  $stationId = [string]$matchedStation.stationId
  $stationAction = "updated"
} else {
  $createStation = Invoke-ApiJson -Method POST -Path "/api/v1/stations" -Token $token -Body @{
    stationCode = $StationCode
    stationName = $StationName
    status = "active"
    metadata = $stationMetadata
  }
  Assert-ApiSuccess -Response $createStation -Label "POST /api/v1/stations"
  $stationId = [string]$createStation.json.data.stationId
  $stationAction = "created"
}

$deviceResults = @()
foreach ($node in $resolvedNodes) {
  $fieldNodeId = [string]$node.fieldNodeId
  $deviceId = [string]$node.deviceId
  $installLabel = [string]$node.installLabel
  $deviceType = [string]$node.deviceType
  $nodeCode = "ND-$StationCode-$fieldNodeId"
  $displayName = "$StationDisplayName Node $fieldNodeId"
  $deviceName = ("field-node-{0}" -f $fieldNodeId.ToLowerInvariant())

  $desiredMetadata = [ordered]@{
    identityClass = "formal"
    deviceRole = "field_node"
    lifecycleStatus = $LifecycleStatus
    regionCode = $RegionCode
    slopeCode = $SlopeCode
    stationCode = $StationCode
    nodeCode = $nodeCode
    gatewayCode = $GatewayCode
    displayName = $displayName
    installLabel = $installLabel
    fieldNodeId = $fieldNodeId
    gatewayManaged = $true
    onboardingMode = "gateway_preprovisioned"
    gatewayDisplayName = $GatewayDisplayName
  }

  $getDevice = Invoke-ApiJson -Method GET -Path ("/api/v1/devices/{0}" -f [uri]::EscapeDataString($deviceId)) -Token $token
  if ($getDevice.statusCode -eq 404) {
    $createDevice = Invoke-ApiJson -Method POST -Path "/api/v1/devices" -Token $token -Body @{
      deviceId = $deviceId
      deviceName = $deviceName
      deviceType = $deviceType
      stationId = $stationId
      metadata = $desiredMetadata
    }
    Assert-ApiSuccess -Response $createDevice -Label ("POST /api/v1/devices ({0})" -f $fieldNodeId)
    $deviceSecret = [string]$createDevice.json.data.deviceSecret
    $detailResponse = Invoke-ApiJson -Method GET -Path ("/api/v1/devices/{0}" -f [uri]::EscapeDataString($deviceId)) -Token $token
    Assert-ApiSuccess -Response $detailResponse -Label ("GET /api/v1/devices/{0}" -f $deviceId)
    $deviceAction = "created"
  } else {
    Assert-ApiSuccess -Response $getDevice -Label ("GET /api/v1/devices/{0}" -f $deviceId)
    $currentMetadata = @{}
    if ($getDevice.json.data.metadata) {
      foreach ($property in $getDevice.json.data.metadata.PSObject.Properties) {
        $currentMetadata[$property.Name] = $property.Value
      }
    }
    foreach ($property in $desiredMetadata.GetEnumerator()) {
      $currentMetadata[$property.Key] = $property.Value
    }
    $updateDevice = Invoke-ApiJson -Method PUT -Path ("/api/v1/devices/{0}" -f [uri]::EscapeDataString($deviceId)) -Token $token -Body @{
      deviceName = $deviceName
      deviceType = $deviceType
      stationId = $stationId
      metadata = $currentMetadata
    }
    Assert-ApiSuccess -Response $updateDevice -Label ("PUT /api/v1/devices/{0}" -f $deviceId)
    $deviceSecret = $null
    $detailResponse = Invoke-ApiJson -Method GET -Path ("/api/v1/devices/{0}" -f [uri]::EscapeDataString($deviceId)) -Token $token
    Assert-ApiSuccess -Response $detailResponse -Label ("GET /api/v1/devices/{0}" -f $deviceId)
    $deviceAction = "updated"
  }

  $deviceResults += [ordered]@{
    fieldNodeId = $fieldNodeId
    action = $deviceAction
    deviceId = $deviceId
    deviceName = [string]$detailResponse.json.data.deviceName
    deviceType = [string]$detailResponse.json.data.deviceType
    stationId = [string]$detailResponse.json.data.stationId
    stationCode = [string]$detailResponse.json.data.stationCode
    displayName = [string]$detailResponse.json.data.displayName
    installLabel = [string]$detailResponse.json.data.installLabel
    nodeCode = [string]$detailResponse.json.data.nodeCode
    gatewayCode = [string]$detailResponse.json.data.gatewayCode
    identityClass = [string]$detailResponse.json.data.identityClass
    lifecycleStatus = [string]$detailResponse.json.data.lifecycleStatus
    southboundSuggestedSpec = "{0}|{1}|{2}|{3}|true" -f $fieldNodeId, $deviceId, $SouthboundPort, $installLabel
    deviceSecret = if ($deviceSecret) { $deviceSecret } else { $null }
  }
}

$southboundResult = $null
if ($ApplySouthbound) {
  $southboundScript = Join-Path $PSScriptRoot "set-rk3568-field-gateway-southbound-nodes.ps1"
  $southboundArgs = @(
    "-BoardHost", $BoardHost,
    "-User", $BoardUser,
    "-SshPort", ([string]$BoardSshPort)
  )
  if ($BoardPassword) {
    $southboundArgs += @("-Password", $BoardPassword)
  }
  foreach ($item in $deviceResults) {
    $southboundArgs += @("-NodeSpec", [string]$item.southboundSuggestedSpec)
  }
  $southboundJson = & powershell -NoProfile -ExecutionPolicy Bypass -File $southboundScript @southboundArgs
  if ($LASTEXITCODE -ne 0) {
    throw "set-rk3568-field-gateway-southbound-nodes.ps1 failed (exit=$LASTEXITCODE)"
  }
  if ($southboundJson -and $southboundJson.Trim()) {
    $southboundResult = $southboundJson | ConvertFrom-Json -Depth 12
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "field-formal-device-onboarding"
  apiBaseUrl = $ApiBaseUrl
  station = [ordered]@{
    action = $stationAction
    stationId = $stationId
    stationCode = $StationCode
    stationName = $StationName
    displayName = $StationDisplayName
    locationName = $LocationName
    regionCode = $RegionCode
    slopeCode = $SlopeCode
    gatewayCode = $GatewayCode
    gatewayDisplayName = $GatewayDisplayName
    lifecycleStatus = $LifecycleStatus
  }
  devices = $deviceResults
  firstRegistrationFlow = [ordered]@{
    mode = "gateway_preprovisioned"
    summary = "Pre-register the formal station and devices in the platform, then freeze the same deviceIds into RK3568 SOUTHBOUND_NODES_JSON. RK2206 nodes keep reporting through XL01 plus RK3568 instead of self-claiming identity on first boot."
    steps = @(
      "1. Create or update the formal station and device registry first.",
      "2. Freeze one deviceId per field node and bind stationCode, regionCode, slopeCode, nodeCode, and gatewayCode.",
      "3. Freeze fieldNodeId -> deviceId -> southboundPort in RK3568 SOUTHBOUND_NODES_JSON.",
      "4. Once telemetry and ack carry the same device_id, Desk can read formal devices through the API.",
      "5. deviceSecret can stay in the identity package, but the current shared-port field path does not rely on RK2206 MQTT login."
    )
  }
  southbound = [ordered]@{
    suggestedPort = $SouthboundPort
    suggestedSpecs = @($deviceResults | ForEach-Object { [string]$_.southboundSuggestedSpec })
    applied = [bool]$ApplySouthbound
    applyCommand = ("powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\set-rk3568-field-gateway-southbound-nodes.ps1 " + (($deviceResults | ForEach-Object { '-NodeSpec "' + [string]$_.southboundSuggestedSpec + '"' }) -join " "))
    runtime = $southboundResult
  }
}

$secretDir = Split-Path -Parent $resolvedSecretOutFile
if ($secretDir -and -not (Test-Path $secretDir)) {
  New-Item -ItemType Directory -Path $secretDir -Force | Out-Null
}
$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$secretJson = $result | ConvertTo-Json -Depth 12
Set-Content -Path $resolvedSecretOutFile -Value $secretJson -Encoding UTF8

$public = $secretJson | ConvertFrom-Json
foreach ($device in @($public.devices)) {
  if ($device.deviceSecret) {
    $device.deviceSecret = "***REDACTED***"
  }
}
$public | Add-Member -NotePropertyName secretFile -NotePropertyValue $SecretOutFile -Force
$publicJson = $public | ConvertTo-Json -Depth 12
Set-Content -Path $resolvedOutFile -Value $publicJson -Encoding UTF8
$publicJson
