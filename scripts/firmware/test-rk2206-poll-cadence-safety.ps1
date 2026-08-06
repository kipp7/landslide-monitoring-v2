[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$configPath = Join-Path $repoRoot "firmware\rk2206-xl01\config\app_config.h"
$mainPath = Join-Path $repoRoot "firmware\rk2206-xl01\main\landslide_main.c"
$rs485Path = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\field_sensors_rs485.c"
$config = Get-Content -LiteralPath $configPath -Raw
$main = Get-Content -LiteralPath $mainPath -Raw
$rs485 = Get-Content -LiteralPath $rs485Path -Raw

if ($config -notmatch '(?m)^#define POLL_REQUEST_CHECK_INTERVAL_MS 50(?:U)?\b') {
  throw "The validated polled request interval must remain 50 ms"
}
if ($config -notmatch '(?s)#if EDGE_UPLINK_MODE == EDGE_UPLINK_MODE_POLLED\s+#define DATA_UPLOAD_IDLE_CHECK_INTERVAL_MS POLL_REQUEST_CHECK_INTERVAL_MS') {
  throw "Polled upload idle checks must use POLL_REQUEST_CHECK_INTERVAL_MS"
}
if ($config -notmatch '(?m)^#define ENVIRONMENT_SAMPLE_INTERVAL_MS 10000U\b') {
  throw "Battery and soil/EC must remain on the accepted 10-second low-rate cadence"
}
if ($config -notmatch '(?m)^#define RS485_LOW_PRIORITY_RESPONSE_TIMEOUT_MS 300U\b' -or
    $config -notmatch '(?m)^#define RS485_LOW_PRIORITY_READ_MAX_RETRIES 0U\b') {
  throw "Low-rate RS485 paths must remain bounded to 300 ms with no retry"
}
if ($config -notmatch '(?m)^#define RS485_SOIL_EC_REPROBE_READS 6U\b') {
  throw "EC reprobe must stay near one minute after moving environment reads to 10 seconds"
}

$selectedReadStart = $rs485.IndexOf(
  "int FieldRs485_ReadSelected(FieldRs485Readings *out, uint8_t requested_mask)",
  [System.StringComparison]::Ordinal
)
$selectedReadEnd = $rs485.IndexOf(
  "int FieldRs485_Read(FieldRs485Readings *out)",
  $selectedReadStart,
  [System.StringComparison]::Ordinal
)
if ($selectedReadStart -lt 0 -or $selectedReadEnd -le $selectedReadStart) {
  throw "Cannot isolate FieldRs485_ReadSelected"
}
$selectedRead = $rs485.Substring($selectedReadStart, $selectedReadEnd - $selectedReadStart)
$tiltReadIndex = $selectedRead.IndexOf(
  "/* Core displacement evidence always gets the bus before low-rate paths. */",
  [System.StringComparison]::Ordinal
)
$soilReadIndex = $selectedRead.IndexOf(
  "#if ENABLE_RS485_SOIL_SENSOR",
  $tiltReadIndex,
  [System.StringComparison]::Ordinal
)
if ($tiltReadIndex -lt 0 -or $soilReadIndex -le $tiltReadIndex) {
  throw "High-priority tilt must be read before low-rate soil/EC"
}
if (-not $selectedRead.Contains("if (read_soil || read_rain)")) {
  throw "The tilt path must wait for an inter-request gap only when another path follows"
}

$sensorStart = $main.IndexOf("static void* SensorCollectionTask(", [System.StringComparison]::Ordinal)
$sensorEnd = $main.IndexOf("static void* UartRxTask(", $sensorStart, [System.StringComparison]::Ordinal)
if ($sensorStart -lt 0 -or $sensorEnd -le $sensorStart) {
  throw "Cannot isolate SensorCollectionTask"
}
$sensorTask = $main.Substring($sensorStart, $sensorEnd - $sensorStart)
foreach ($required in @(
    "rs485_read_mask = FIELD_RS485_READ_TILT_MASK;",
    "cycle_started_ms >= next_environment_sample_ms",
    "rs485_read_mask |= FIELD_RS485_READ_SOIL_MASK | FIELD_RS485_READ_RAIN_MASK;",
    "environment_sample_due && g_battery_ready && BatteryMonitor_Read",
    "g_runtime_sampling_interval_ms - (unsigned int)(cycle_completed_ms - cycle_started_ms)"
  )) {
  if (-not $sensorTask.Contains($required)) {
    throw "Sensor cadence protection is missing: $required"
  }
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

Write-Host "POLL_CADENCE_SAFETY_OK core_ms=1000 environment_ms=10000 poll_check_ms=50 low_priority_timeout_ms=300 retries=0"
