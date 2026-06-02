[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8081",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$ProfilesDir = ".tmp/regional-model-library/raw/CLCD-1985-2025/extracts/region-profiles",
  [string]$BindingsFile = "",
  [string]$StationSnapshotFile = "",
  [switch]$Apply,
  [string]$OutFile = "docs/unified/reports/regional-model-station-profile-backfill-latest.json"
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

function Convert-ToHashtable {
  param([object]$Value)

  $result = @{}
  if ($null -eq $Value) { return $result }
  foreach ($property in $Value.PSObject.Properties) {
    $result[$property.Name] = $property.Value
  }
  return $result
}

function Get-NestedValue {
  param(
    [hashtable]$Record,
    [string[]]$Path
  )

  $current = $Record
  foreach ($segment in $Path) {
    if ($null -eq $current) { return $null }
    if ($current -isnot [hashtable]) {
      $current = Convert-ToHashtable $current
    }
    if (-not $current.ContainsKey($segment)) { return $null }
    $current = $current[$segment]
  }
  return $current
}

function Set-NestedValue {
  param(
    [hashtable]$Record,
    [string[]]$Path,
    [object]$Value
  )

  $current = $Record
  for ($index = 0; $index -lt ($Path.Count - 1); $index += 1) {
    $segment = $Path[$index]
    if (-not $current.ContainsKey($segment) -or $null -eq $current[$segment]) {
      $current[$segment] = @{}
    } elseif ($current[$segment] -isnot [hashtable]) {
      $current[$segment] = Convert-ToHashtable $current[$segment]
    }
    $current = $current[$segment]
  }

  $leaf = $Path[$Path.Count - 1]
  $current[$leaf] = $Value
}

function Read-JsonFile {
  param([string]$FilePath)

  return (Get-Content -Path $FilePath -Raw -Encoding UTF8 | ConvertFrom-Json)
}

function Write-JsonFile {
  param(
    [string]$FilePath,
    [object]$Value
  )

  $directory = Split-Path -Parent $FilePath
  if ($directory -and -not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }
  $Value | ConvertTo-Json -Depth 20 | Set-Content -Path $FilePath -Encoding UTF8
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
    $invokeParams["Body"] = ($Body | ConvertTo-Json -Depth 20 -Compress)
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

function Get-AllStations {
  param([string]$Token)

  $items = @()
  $page = 1
  $pageSize = 200
  while ($true) {
    $response = Invoke-ApiJson -Method GET -Path ("/api/v1/stations?page=$page&pageSize=$pageSize") -Token $Token
    Assert-ApiSuccess -Response $response -Label "GET /api/v1/stations"
    $data = $response.json.data
    if ($data -and $data.list) {
      foreach ($item in @($data.list)) {
        $items += $item
      }
    }
    $totalPages = if ($data -and $data.pagination -and $data.pagination.totalPages) {
      [int]$data.pagination.totalPages
    } else {
      1
    }
    if ($page -ge $totalPages) { break }
    $page += 1
  }
  return $items
}

function New-LandCoverPayload {
  param([object]$Profile)

  return $Profile.properties.staticFactors.landCover
}

function New-RegionProfileRef {
  param([object]$Profile)

  return [ordered]@{
    profileKey = $Profile.profileKey
    profileVersion = $Profile.profileVersion
    sourceRegionCode = $Profile.identity.regionCode
    sourceDatasets = @($Profile.sourceDatasets)
    sourceRegionKeys = @($Profile.sourceRegionKeys)
  }
}

function Resolve-Binding {
  param(
    [object[]]$Bindings,
    [object]$Station
  )

  foreach ($binding in $Bindings) {
    $match = $true
    foreach ($selectorKey in @("stationId", "stationCode", "slopeCode", "regionCode")) {
      $expected = Read-String $binding.$selectorKey
      if (-not $expected) { continue }
      $actual = Read-String $Station.$selectorKey
      if (-not $actual) {
        $actual = Read-String $Station.metadata.$selectorKey
      }
      if ((Normalize-Code $expected) -ne (Normalize-Code $actual)) {
        $match = $false
        break
      }
    }

    if ($match) {
      return $binding
    }
  }

  return $null
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedProfilesDir = Join-Path $repoRoot $ProfilesDir
$resolvedOutFile = Join-Path $repoRoot $OutFile
$resolvedBindingsFile = if ($BindingsFile) { Join-Path $repoRoot $BindingsFile } else { "" }
$resolvedSnapshotFile = if ($StationSnapshotFile) { Join-Path $repoRoot $StationSnapshotFile } else { "" }

$profileFiles = Get-ChildItem -Path $resolvedProfilesDir -Filter *.region-profile.json -File | Sort-Object Name
$profilesByRegionCode = @{}
foreach ($profileFile in $profileFiles) {
  $profile = Read-JsonFile -FilePath $profileFile.FullName
  $regionCode = Read-String $profile.identity.regionCode
  if (-not $regionCode) { continue }
  $profilesByRegionCode[(Normalize-Code $regionCode)] = [ordered]@{
    filePath = $profileFile.FullName
    profile = $profile
  }
}

$bindings = @()
if ($resolvedBindingsFile -and (Test-Path -LiteralPath $resolvedBindingsFile)) {
  $bindings = @(Read-JsonFile -FilePath $resolvedBindingsFile)
}

$stations = @()
$token = ""
$applyEnabled = $false

if ($resolvedSnapshotFile) {
  $stations = @(Read-JsonFile -FilePath $resolvedSnapshotFile)
} else {
  $loginResponse = Invoke-ApiJson -Method POST -Path "/api/v1/auth/login" -Body @{
    username = $Username
    password = $Password
  }
  Assert-ApiSuccess -Response $loginResponse -Label "POST /api/v1/auth/login"
  $token = Read-String $loginResponse.json.data.token
  if (-not $token) {
    throw "Login did not return token: $($loginResponse.raw)"
  }
  $stations = @(Get-AllStations -Token $token)
  $applyEnabled = $Apply.IsPresent
}

$results = @()

foreach ($station in $stations) {
  $binding = Resolve-Binding -Bindings $bindings -Station $station
  $sourceRegionCode = $null
  if ($binding) {
    $sourceRegionCode = Read-String $binding.sourceRegionCode
  }
  if (-not $sourceRegionCode) {
    $sourceRegionCode =
      Read-String $station.regionCode
    if (-not $sourceRegionCode) {
      $sourceRegionCode = Read-String $station.metadata.regionCode
    }
  }

  $normalizedSourceRegionCode = Normalize-Code $sourceRegionCode
  $profileEntry = $null
  if ($normalizedSourceRegionCode -and $profilesByRegionCode.ContainsKey($normalizedSourceRegionCode)) {
    $profileEntry = $profilesByRegionCode[$normalizedSourceRegionCode]
  }

  $metadata = Convert-ToHashtable $station.metadata
  $existingLandCover = Get-NestedValue -Record $metadata -Path @("staticFactors", "landCover")
  $existingRegionProfileRef = Get-NestedValue -Record $metadata -Path @("regionProfileRef")
  $newLandCover = $null
  $newRegionProfileRef = $null
  $changed = $false
  $applied = $false

  if ($profileEntry) {
    $newLandCover = New-LandCoverPayload -Profile $profileEntry.profile
    $newRegionProfileRef = New-RegionProfileRef -Profile $profileEntry.profile
    $existingLandCoverJson = if ($null -eq $existingLandCover) { "" } else { ($existingLandCover | ConvertTo-Json -Depth 20 -Compress) }
    $existingRegionProfileRefJson = if ($null -eq $existingRegionProfileRef) { "" } else { ($existingRegionProfileRef | ConvertTo-Json -Depth 20 -Compress) }
    $newLandCoverJson = $newLandCover | ConvertTo-Json -Depth 20 -Compress
    $newRegionProfileRefJson = $newRegionProfileRef | ConvertTo-Json -Depth 20 -Compress
    $changed = ($existingLandCoverJson -ne $newLandCoverJson) -or ($existingRegionProfileRefJson -ne $newRegionProfileRefJson)

    if ($changed) {
      Set-NestedValue -Record $metadata -Path @("staticFactors", "landCover") -Value $newLandCover
      $metadata["regionProfileRef"] = $newRegionProfileRef
      if ($applyEnabled) {
        $response = Invoke-ApiJson -Method PUT -Path ("/api/v1/stations/{0}" -f [uri]::EscapeDataString([string]$station.stationId)) -Token $token -Body @{
          metadata = $metadata
        }
        Assert-ApiSuccess -Response $response -Label ("PUT /api/v1/stations/{0}" -f [string]$station.stationId)
        $applied = $true
      }
    }
  }

  $results += [ordered]@{
    stationId = Read-String $station.stationId
    stationCode = Read-String $station.stationCode
    slopeCode = Read-String $station.slopeCode
    regionCode = Read-String $station.regionCode
    sourceRegionCode = $sourceRegionCode
    matchedProfile = if ($profileEntry) { Read-String $profileEntry.profile.profileKey } else { $null }
    profilePath = if ($profileEntry) { $profileEntry.filePath } else { $null }
    targetPath = "metadata.staticFactors.landCover"
    usedBinding = [bool]($null -ne $binding)
    changed = $changed
    applied = $applied
  }
}

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  mode = if ($resolvedSnapshotFile) { "snapshot" } else { "api" }
  profilesDir = $resolvedProfilesDir
  bindingsFile = if ($resolvedBindingsFile) { $resolvedBindingsFile } else { $null }
  stationSnapshotFile = if ($resolvedSnapshotFile) { $resolvedSnapshotFile } else { $null }
  stationCount = $results.Count
  matchedCount = @($results | Where-Object { $_.matchedProfile }).Count
  changedCount = @($results | Where-Object { $_.changed }).Count
  appliedCount = @($results | Where-Object { $_.applied }).Count
  results = $results
}

Write-JsonFile -FilePath $resolvedOutFile -Value $report
$report | ConvertTo-Json -Depth 20
