[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8081",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [switch]$Apply,
  [string]$OutFile = "docs/unified/reports/field-canonical-metadata-backfill-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Normalize-Code {
  param([object]$Value)

  if ($null -eq $Value) { return "" }
  return ([string]$Value).Trim().ToUpperInvariant()
}

function Read-String {
  param([object]$Value)

  if ($null -eq $Value) { return $null }
  $text = ([string]$Value).Trim()
  if (-not $text) { return $null }
  return $text
}

function Get-PropertyValue {
  param(
    [object]$Object,
    [string[]]$Keys
  )

  if ($null -eq $Object) { return $null }
  foreach ($key in $Keys) {
    $property = $Object.PSObject.Properties[$key]
    if ($property) {
      $value = Read-String $property.Value
      if ($value) { return $value }
    }
  }
  return $null
}

function Convert-ToHashtable {
  param([object]$Value)

  $result = @{}
  if ($null -eq $Value) { return $result }
  foreach ($property in $Value.PSObject.Properties) {
    $result[$property.Name] = $property.Value
  }
  return $result
}

function Derive-SlopeCodeFromStationCode {
  param([string]$StationCode)

  $normalized = Normalize-Code $StationCode
  if ($normalized -match '^ST-(LS-[A-Z0-9]+(?:-[A-Z0-9]+){3,}-\d{3})-\d{2}$') {
    return $Matches[1]
  }
  return ""
}

function Derive-RegionCodeFromSlopeCode {
  param([string]$SlopeCode)

  $normalized = Normalize-Code $SlopeCode
  if ($normalized -match '^LS-([A-Z0-9]+(?:-[A-Z0-9]+){3,})-\d{3}$') {
    return $Matches[1]
  }
  return ""
}

function Derive-RegionCodeFromGatewayCode {
  param([string]$GatewayCode)

  $normalized = Normalize-Code $GatewayCode
  if ($normalized -match '^GW-([A-Z0-9]+(?:-[A-Z0-9]+){3,})-\d{2}$') {
    return $Matches[1]
  }
  return ""
}

function Derive-StationCodeFromNodeCode {
  param([string]$NodeCode)

  $normalized = Normalize-Code $NodeCode
  if ($normalized -match '^ND-(ST-LS-[A-Z0-9]+(?:-[A-Z0-9]+){3,}-\d{3}-\d{2})-[A-Z0-9]+(?:-[A-Z0-9]+)*$') {
    return $Matches[1]
  }
  return ""
}

function Invoke-ApiJson {
  param(
    [Parameter(Mandatory = $true)][ValidateSet("GET", "POST", "PUT")] [string]$Method,
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Body = $null,
    [string]$Token = ""
  )

  $uri = ($ApiBaseUrl.TrimEnd("/") + $Path)
  $headers = @{ Accept = "application/json" }
  if ($Token) {
    $headers["Authorization"] = "Bearer $Token"
  }

  $invokeParams = @{
    Method = $Method
    Uri = $uri
    Headers = $headers
  }

  if ($null -ne $Body) {
    $invokeParams["ContentType"] = "application/json; charset=utf-8"
    $invokeParams["Body"] = ($Body | ConvertTo-Json -Depth 12 -Compress)
  }

  try {
    $response = Invoke-WebRequest @invokeParams
    $statusCode = [int]$response.StatusCode
    $raw = $response.Content
  } catch {
    $webResponse = $_.Exception.Response
    if (-not $webResponse) { throw }
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

  return [ordered]@{
    statusCode = $statusCode
    raw = $raw
    json = $json
  }
}

function Assert-ApiSuccess {
  param(
    [hashtable]$Response,
    [string]$Label
  )

  if ($Response.statusCode -lt 200 -or $Response.statusCode -ge 300) {
    throw "$Label failed (status=$($Response.statusCode)): $($Response.raw)"
  }
}

function Get-AllListItems {
  param(
    [string]$Path,
    [string]$Token
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
      foreach ($item in @($data.list)) {
        $items += $item
      }
    }
    $totalPages = 1
    if ($data -and $data.pagination -and $data.pagination.totalPages) {
      $totalPages = [int]$data.pagination.totalPages
    }
    if ($page -ge $totalPages) { break }
    $page += 1
  }
  return $items
}

function Set-IfMissing {
  param(
    [hashtable]$Metadata,
    [string]$Key,
    [string]$Value,
    [System.Collections.Generic.List[string]]$ChangedFields
  )

  if (-not $Value) { return }
  $existing = Get-PropertyValue -Object ([pscustomobject]$Metadata) -Keys @($Key)
  if ($existing) { return }
  $Metadata[$Key] = $Value
  $ChangedFields.Add($Key) | Out-Null
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedOutFile = Join-Path $repoRoot $OutFile

$loginResponse = Invoke-ApiJson -Method POST -Path "/api/v1/auth/login" -Body @{
  username = $Username
  password = $Password
}
Assert-ApiSuccess -Response $loginResponse -Label "POST /api/v1/auth/login"
$token = Read-String $loginResponse.json.data.token
if (-not $token) {
  throw "Login did not return token: $($loginResponse.raw)"
}

$stations = @(Get-AllListItems -Path "/api/v1/stations" -Token $token)
$devices = @(Get-AllListItems -Path "/api/v1/devices" -Token $token)

$devicesByStationId = @{}
foreach ($device in $devices) {
  $stationId = Read-String $device.stationId
  if (-not $stationId) { continue }
  if (-not $devicesByStationId.ContainsKey($stationId)) {
    $devicesByStationId[$stationId] = New-Object System.Collections.ArrayList
  }
  [void]$devicesByStationId[$stationId].Add($device)
}

$stationResults = @()
$stationIndex = @{}

foreach ($station in $stations) {
  $metadata = Convert-ToHashtable $station.metadata
  $changedFields = New-Object 'System.Collections.Generic.List[string]'
  $stationCode = Normalize-Code $station.stationCode
  $slopeCode = Get-PropertyValue -Object $station.metadata -Keys @("slopeCode", "slope_code")
  if (-not $slopeCode) {
    $slopeCode = Derive-SlopeCodeFromStationCode $stationCode
  }
  $gatewayHint = Get-PropertyValue -Object $station.metadata -Keys @("gatewayCode", "gateway_code")
  if (-not $gatewayHint -and $devicesByStationId.ContainsKey([string]$station.stationId)) {
    foreach ($device in $devicesByStationId[[string]$station.stationId]) {
      $gatewayHint = Read-String $device.gatewayCode
      if ($gatewayHint) { break }
    }
  }
  $regionCode = Get-PropertyValue -Object $station.metadata -Keys @("regionCode", "region_code")
  if (-not $regionCode) {
    $regionCode = Derive-RegionCodeFromSlopeCode $slopeCode
  }
  if (-not $regionCode) {
    $regionCode = Derive-RegionCodeFromGatewayCode $gatewayHint
  }

  Set-IfMissing -Metadata $metadata -Key "stationCode" -Value $stationCode -ChangedFields $changedFields
  Set-IfMissing -Metadata $metadata -Key "slopeCode" -Value $slopeCode -ChangedFields $changedFields
  Set-IfMissing -Metadata $metadata -Key "regionCode" -Value $regionCode -ChangedFields $changedFields
  Set-IfMissing -Metadata $metadata -Key "gatewayCode" -Value $gatewayHint -ChangedFields $changedFields

  $applied = $false
  if ($Apply -and $changedFields.Count -gt 0) {
    $response = Invoke-ApiJson -Method PUT -Path ("/api/v1/stations/{0}" -f [uri]::EscapeDataString([string]$station.stationId)) -Token $token -Body @{
      metadata = $metadata
    }
    Assert-ApiSuccess -Response $response -Label ("PUT /api/v1/stations/{0}" -f [string]$station.stationId)
    $applied = $true
  }

  $stationIndex[[string]$station.stationId] = [ordered]@{
    stationCode = $stationCode
    slopeCode = $slopeCode
    regionCode = $regionCode
    gatewayCode = $gatewayHint
  }

  $stationResults += [ordered]@{
    stationId = [string]$station.stationId
    stationCode = $stationCode
    changedFields = @($changedFields)
    changed = [bool]($changedFields.Count -gt 0)
    applied = $applied
  }
}

$deviceResults = @()
foreach ($device in $devices) {
  $metadata = Convert-ToHashtable $device.metadata
  $changedFields = New-Object 'System.Collections.Generic.List[string]'
  $stationHint = $null
  $stationId = Read-String $device.stationId
  if ($stationId -and $stationIndex.ContainsKey($stationId)) {
    $stationHint = $stationIndex[$stationId]
  }

  $nodeCode =
    Get-PropertyValue -Object $device.metadata -Keys @("nodeCode", "node_code")
  $stationCode =
    Read-String $device.stationCode
  if (-not $stationCode) {
    $stationCode = Get-PropertyValue -Object $device.metadata -Keys @("stationCode", "station_code")
  }
  if (-not $stationCode -and $stationHint) {
    $stationCode = Read-String $stationHint.stationCode
  }
  if (-not $stationCode) {
    $stationCode = Derive-StationCodeFromNodeCode $nodeCode
  }

  $slopeCode = Read-String $device.slopeCode
  if (-not $slopeCode) {
    $slopeCode = Get-PropertyValue -Object $device.metadata -Keys @("slopeCode", "slope_code")
  }
  if (-not $slopeCode -and $stationHint) {
    $slopeCode = Read-String $stationHint.slopeCode
  }
  if (-not $slopeCode) {
    $slopeCode = Derive-SlopeCodeFromStationCode $stationCode
  }

  $gatewayCode = Read-String $device.gatewayCode
  if (-not $gatewayCode) {
    $gatewayCode = Get-PropertyValue -Object $device.metadata -Keys @("gatewayCode", "gateway_code")
  }
  if (-not $gatewayCode -and $stationHint) {
    $gatewayCode = Read-String $stationHint.gatewayCode
  }

  $regionCode = Read-String $device.regionCode
  if (-not $regionCode) {
    $regionCode = Get-PropertyValue -Object $device.metadata -Keys @("regionCode", "region_code")
  }
  if (-not $regionCode -and $stationHint) {
    $regionCode = Read-String $stationHint.regionCode
  }
  if (-not $regionCode) {
    $regionCode = Derive-RegionCodeFromSlopeCode $slopeCode
  }
  if (-not $regionCode) {
    $regionCode = Derive-RegionCodeFromGatewayCode $gatewayCode
  }

  Set-IfMissing -Metadata $metadata -Key "stationCode" -Value $stationCode -ChangedFields $changedFields
  Set-IfMissing -Metadata $metadata -Key "slopeCode" -Value $slopeCode -ChangedFields $changedFields
  Set-IfMissing -Metadata $metadata -Key "regionCode" -Value $regionCode -ChangedFields $changedFields
  Set-IfMissing -Metadata $metadata -Key "gatewayCode" -Value $gatewayCode -ChangedFields $changedFields

  $applied = $false
  if ($Apply -and $changedFields.Count -gt 0) {
    $response = Invoke-ApiJson -Method PUT -Path ("/api/v1/devices/{0}" -f [uri]::EscapeDataString([string]$device.deviceId)) -Token $token -Body @{
      metadata = $metadata
    }
    Assert-ApiSuccess -Response $response -Label ("PUT /api/v1/devices/{0}" -f [string]$device.deviceId)
    $applied = $true
  }

  $deviceResults += [ordered]@{
    deviceId = [string]$device.deviceId
    deviceName = [string]$device.deviceName
    stationId = $stationId
    changedFields = @($changedFields)
    changed = [bool]($changedFields.Count -gt 0)
    applied = $applied
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "field-canonical-metadata-backfill"
  apiBaseUrl = $ApiBaseUrl
  apply = [bool]$Apply
  summary = [ordered]@{
    stationCount = $stations.Count
    deviceCount = $devices.Count
    changedStationCount = @($stationResults | Where-Object { $_.changed }).Count
    changedDeviceCount = @($deviceResults | Where-Object { $_.changed }).Count
  }
  stations = $stationResults
  devices = $deviceResults
}

$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $result | ConvertTo-Json -Depth 8
Set-Content -Path $resolvedOutFile -Value $json -Encoding UTF8
$json
