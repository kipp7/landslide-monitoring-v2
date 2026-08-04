[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ReleaseDirectory = "F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v5_rs485_gnss_simulated_20260804",
  [string]$BatteryCalibrationFile = "",
  [ValidateSet("A", "B", "C")]
  [string[]]$NodeLabels = @("A", "B", "C")
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($BatteryCalibrationFile)) {
  $BatteryCalibrationFile = Join-Path (Split-Path -Parent $repoRoot) `
    "output\rk2206-battery-calibration-20260802\battery-calibration-final-accepted-20260802.json"
}
$resolvedCalibration = (Resolve-Path -LiteralPath $BatteryCalibrationFile -ErrorAction Stop).Path
$releaseRoot = [System.IO.Path]::GetFullPath($ReleaseDirectory)
$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) `
  ("rk2206-compact-v5-rs485-gnss-simulated-" + [guid]::NewGuid().ToString("N"))
$builder = Join-Path $PSScriptRoot "build-xl01-compact-v5.ps1"
$verifier = Join-Path $PSScriptRoot "verify-rk2206-release-safety.ps1"
$startupSafety = Join-Path $PSScriptRoot "test-rk2206-rs485-startup-safety.ps1"
$txOrderSafety = Join-Path $PSScriptRoot "test-rk2206-field-link-tx-order-safety.ps1"
$pollCadenceSafety = Join-Path $PSScriptRoot "test-rk2206-poll-cadence-safety.ps1"
$markerSourceSafety = Join-Path $PSScriptRoot "test-rk2206-release-marker-source-safety.ps1"
$expectedFirmwareMarker = "fw-rk2206-rtk-compact-v5-rtcm-summary-v1-20260804"

& $startupSafety
& $txOrderSafety
& $pollCadenceSafety
& $markerSourceSafety

$dirty = @(& git -C $repoRoot status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) {
  throw "Refusing to create an official Compact V5 release from uncommitted source"
}
$headCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $headCommit -notmatch '^[0-9a-f]{40}$') {
  throw "Cannot resolve repository HEAD"
}
if (Test-Path -LiteralPath $releaseRoot) {
  throw "Release directory already exists; choose a new immutable directory: $releaseRoot"
}

try {
  & $builder `
    -SdkRoot $SdkRoot `
    -ContainerName $ContainerName `
    -ArtifactDirectory $stagingRoot `
    -GnssRtcmInjectionMode disabled `
    -FieldSensorMode hardware `
    -GnssSourceMode simulated `
    -BatteryCalibrationFile $resolvedCalibration `
    -NodeLabels $NodeLabels
  if ($LASTEXITCODE -ne 0) {
    throw "Compact V5 A/B/C OpenHarmony build failed"
  }

  & $verifier `
    -ArtifactDirectory $stagingRoot `
    -ExpectedCompactVersion 5 `
    -ExpectedFieldSensorMode hardware `
    -ExpectedGnssSourceMode simulated `
    -ExpectedGnssRtcmInjectionMode disabled `
    -ExpectedBatteryCalibrationState field-calibrated `
    -ExpectedSourceCommit $headCommit `
    -ExpectedFirmwareMarker $expectedFirmwareMarker `
    -RequireCurrentHead `
    -RequireFinalBatteryAcceptance `
    -RequireCompactTargetedPolling `
    -NodeLabels $NodeLabels
  if ($LASTEXITCODE -ne 0) {
    throw "Compact V5 A/B/C release safety verification failed"
  }

  $instructions = @"
Compact V5 indoor RS485 acceptance package

Truth profile
  - XLS1 PB2/PB3: real
  - SC16IS752 PB4/PB5 and both RS485 sensors: real
  - PC0 battery: real and field-calibrated
  - GNSS: simulated; UM220 PB6/PB7 UART is not initialized
  - RTCM: disabled for the pure-telemetry gate
  - Polling: compact-targeted-v1; one P2 target and one response in flight
  - Normal telemetry: 110-byte payload / 128-byte complete frame
  - On-demand diagnostics: G3S V5, 552-byte payload; never poll periodically

Flash only the image matching physical node A/B/C. This indoor package does
not prove RTK Fixed or centimetre-level displacement.

After all nodes are online, run on RK3568:
  sudo python3 /usr/local/bin/xls1_compact_v5_acceptance.py --required-gnss-source simulated --check-prerequisites
  sudo python3 /usr/local/bin/xls1_compact_v5_acceptance.py --required-gnss-source simulated

Only after the strict 60/600/1800-second gates pass should a hardware-GNSS
V5 package be built for the outdoor UM220 + BT-760 + CORS gate.

Source commit: $headCommit
"@
  [System.IO.File]::WriteAllText(
    (Join-Path $stagingRoot "FLASHING-INSTRUCTIONS.txt"),
    $instructions,
    [System.Text.UTF8Encoding]::new($false)
  )
  Move-Item -LiteralPath $stagingRoot -Destination $releaseRoot
  $manifestPath = Join-Path $releaseRoot "manifest.json"
  $manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "COMPACT_V5_RELEASE_OK path=$releaseRoot manifest_sha256=$manifestSha256 source=$headCommit"
} finally {
  if (Test-Path -LiteralPath $stagingRoot -PathType Container) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
