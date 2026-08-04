[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$configPath = Join-Path $repoRoot "firmware\rk2206-xl01\config\app_config.h"
$mainPath = Join-Path $repoRoot "firmware\rk2206-xl01\main\landslide_main.c"
$config = Get-Content -LiteralPath $configPath -Raw
$main = Get-Content -LiteralPath $mainPath -Raw

if ($config -notmatch '(?m)^#define POLL_REQUEST_CHECK_INTERVAL_MS 50(?:U)?\b') {
  throw "The validated polled request interval must remain 50 ms"
}
if ($config -notmatch '(?s)#if EDGE_UPLINK_MODE == EDGE_UPLINK_MODE_POLLED\s+#define DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS POLL_REQUEST_CHECK_INTERVAL_MS') {
  throw "Polled upload idle checks must use POLL_REQUEST_CHECK_INTERVAL_MS"
}

$start = $main.IndexOf("static void* DataUploadTask(", [System.StringComparison]::Ordinal)
$end = $main.IndexOf("static void* SharedPortWriterTask(", $start, [System.StringComparison]::Ordinal)
if ($start -lt 0 -or $end -le $start) {
  throw "Cannot isolate DataUploadTask"
}
$uploadTask = $main.Substring($start, $end - $start)
if ($uploadTask -notmatch 'unsigned int sleep_ms = DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS;') {
  throw "DataUploadTask must use the configured idle-check interval"
}
if ($uploadTask -match 'unsigned int sleep_ms = 200(?:U)?;') {
  throw "DataUploadTask regressed to the misleading hard-coded 200 ms poll interval"
}
if ($uploadTask -notmatch 'Poll Request Check: %d ms\\n", DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS') {
  throw "The startup summary must print the interval actually used by DataUploadTask"
}

Write-Host "POLL_CADENCE_SAFETY_OK configured_ms=50 runtime_macro=DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS"
