param(
  [string]$SourcePath = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($SourcePath)) {
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
  $SourcePath = Join-Path $repoRoot "firmware\rk2206-xl01\main\landslide_main.c"
}

$main = Get-Content -Raw $SourcePath

function Get-FunctionSection {
  param(
    [string]$Source,
    [string]$StartMarker,
    [string]$EndMarker
  )

  $start = $Source.IndexOf($StartMarker, [System.StringComparison]::Ordinal)
  $end = $Source.IndexOf($EndMarker, $start + $StartMarker.Length, [System.StringComparison]::Ordinal)
  if ($start -lt 0 -or $end -le $start) {
    throw "Cannot isolate source section: $StartMarker"
  }
  return $Source.Substring($start, $end - $start)
}

$collection = Get-FunctionSection `
  -Source $main `
  -StartMarker "static void* SensorCollectionTask(const char* arg)" `
  -EndMarker "static void* UartRxTask(const char* arg)"
$upload = Get-FunctionSection `
  -Source $main `
  -StartMarker "static void* DataUploadTask(const char* arg)" `
  -EndMarker "static void* SharedPortWriterTask(const char* arg)"

$gpsReadIndex = $collection.IndexOf("GPS_ReadSolution(&next_sample.gnss)", [System.StringComparison]::Ordinal)
$storeIndex = $collection.IndexOf("SensorData_StoreSnapshot(&next_sample)", [System.StringComparison]::Ordinal)
if ($gpsReadIndex -lt 0 -or $storeIndex -lt 0 -or $gpsReadIndex -ge $storeIndex) {
  throw "GNSS must be read into next_sample before the atomic sensor snapshot is stored"
}
if ([regex]::Matches($collection, "GPS_ReadSolution\(").Count -ne 1) {
  throw "SensorCollectionTask must contain exactly one GNSS solution read"
}
if ($upload.Contains("GPS_ReadSolution(") -or $upload.Contains("GPS_Poll(")) {
  throw "DataUploadTask must publish the stored sample_epoch snapshot without refreshing GNSS"
}
if (-not $upload.Contains("SensorData_TakeV6UploadSnapshot(&telemetry_snapshot, poll_scope)")) {
  throw "V6 DataUploadTask must select an atomic core/extension snapshot before encoding"
}
if (-not $main.Contains("g_v6_core_upload_snapshot") -or
    -not $main.Contains("g_v6_core_upload_snapshot_valid")) {
  throw "V6 extensions must reuse the most recently transmitted core snapshot"
}
if (-not $main.Contains("if (sample_epoch == 0U)")) {
  throw "sample_epoch wrap must skip the reserved zero value"
}

Write-Host "RK2206 sample/GNSS atomicity gate passed"
