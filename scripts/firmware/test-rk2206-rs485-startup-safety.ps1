[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$fieldSourcePath = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\field_sensors_rs485.c"
$mainSourcePath = Join-Path $repoRoot "firmware\rk2206-xl01\main\landslide_main.c"
$fieldSource = Get-Content -LiteralPath $fieldSourcePath -Raw
$mainSource = Get-Content -LiteralPath $mainSourcePath -Raw

function Get-SourceSection {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$StartMarker,
    [Parameter(Mandatory = $true)][string]$EndMarker
  )

  $start = $Source.IndexOf($StartMarker, [System.StringComparison]::Ordinal)
  if ($start -lt 0) {
    throw "Missing source marker: $StartMarker"
  }
  $end = $Source.IndexOf($EndMarker, $start + $StartMarker.Length, [System.StringComparison]::Ordinal)
  if ($end -lt 0) {
    throw "Missing source marker: $EndMarker"
  }
  return $Source.Substring($start, $end - $start)
}

$initSection = Get-SourceSection `
  -Source $fieldSource `
  -StartMarker "int FieldRs485_Init(void)" `
  -EndMarker "void FieldRs485_RunDiagnostics(void)"
if ($initSection.Contains("RunReadOnlyDiagnostics")) {
  throw "FieldRs485_Init must not run timeout diagnostics before the scheduler starts"
}

$diagnosticSection = Get-SourceSection `
  -Source $fieldSource `
  -StartMarker "void FieldRs485_RunDiagnostics(void)" `
  -EndMarker "int FieldRs485_ReadSelected(FieldRs485Readings *out, uint8_t requested_mask)"
if (-not $diagnosticSection.Contains("RunReadOnlyDiagnostics")) {
  throw "Deferred RS485 diagnostics entry point is missing the read-only scan"
}

$sensorTaskSection = Get-SourceSection `
  -Source $mainSource `
  -StartMarker "static void* SensorCollectionTask(const char* arg)" `
  -EndMarker "static void* UartRxTask(const char* arg)"
$snapshotIndex = $sensorTaskSection.IndexOf("SensorData_StoreSnapshot", [System.StringComparison]::Ordinal)
$diagnosticIndex = $sensorTaskSection.IndexOf("FieldRs485_RunDiagnostics", [System.StringComparison]::Ordinal)
if ($snapshotIndex -lt 0 -or $diagnosticIndex -lt 0 -or $diagnosticIndex -le $snapshotIndex) {
  throw "RS485 diagnostics must run only after a sensor snapshot is stored"
}
foreach ($tiltOnlyGuard in @(
    "paths[FIELD_RS485_PATH_TILT_INDEX].enabled",
    "paths[FIELD_RS485_PATH_TILT_INDEX].attempted",
    "paths[FIELD_RS485_PATH_TILT_INDEX].final_status != RS485_MODBUS_OK"
  )) {
  if (-not $sensorTaskSection.Contains($tiltOnlyGuard)) {
    throw "Deferred RS485 scan must be gated by a final high-priority tilt failure: $tiltOnlyGuard"
  }
}
if ($sensorTaskSection.Contains("FieldRs485_CycleHasFinalFailure")) {
  throw "A low-priority soil/EC failure must not trigger the full RS485 scan"
}
foreach ($requiredSnapshotGuard in @(
    "rs485_cycle_diagnostics = NULL;",
    "rs485_cycle_diagnostics = &rs485_readings.cycle_diagnostics;"
  )) {
  if (-not $sensorTaskSection.Contains($requiredSnapshotGuard)) {
    throw "RS485 runtime diagnostics must not consume an uninitialized collection snapshot: $requiredSnapshotGuard"
  }
}
if ($sensorTaskSection -notmatch '(?s)SensorDiagnostics_RecordCycle\(\s*diagnostic_success_mask,\s*completed_uptime_s,\s*rs485_cycle_diagnostics\);') {
  throw "Sensor diagnostics must receive the guarded RS485 cycle pointer"
}

$systemInitSection = Get-SourceSection `
  -Source $mainSource `
  -StartMarker "static void App_SystemInit(void)" `
  -EndMarker "static void MainEntry(void)"
if ($systemInitSection.Contains("FieldRs485_RunDiagnostics")) {
  throw "App_SystemInit must not call scheduler-dependent RS485 diagnostics"
}

$probeSection = Get-SourceSection `
  -Source $fieldSource `
  -StartMarker "static int ProbeReadOnlyPath(" `
  -EndMarker "static void RunReadOnlyDiagnostics("
if (-not $probeSection.Contains("Watchdog_Feed();")) {
  throw "Each bounded read-only scan attempt must feed the watchdog"
}

Write-Host "RS485_STARTUP_SAFETY_OK diagnostics=post-scheduler-tilt-failure-only initialized_snapshot_only watchdog_fed"
