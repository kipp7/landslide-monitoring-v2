[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ReleaseDirectory = "F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v4_rs485_hardware_gnss_simulated_targeted_v1_20260803",
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
  ("rk2206-rs485-hardware-gnss-simulated-" + [guid]::NewGuid().ToString("N"))
$builder = Join-Path $PSScriptRoot "build-xl01-compact-v4.ps1"
$verifier = Join-Path $PSScriptRoot "verify-rk2206-release-safety.ps1"

$dirty = @(& git -C $repoRoot status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) {
  throw "Refusing to create an official hybrid firmware release from uncommitted source"
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
    throw "Hybrid A/B/C OpenHarmony build failed"
  }

  & $verifier `
    -ArtifactDirectory $stagingRoot `
    -ExpectedCompactVersion 4 `
    -ExpectedFieldSensorMode hardware `
    -ExpectedGnssSourceMode simulated `
    -ExpectedGnssRtcmInjectionMode disabled `
    -ExpectedBatteryCalibrationState field-calibrated `
    -ExpectedSourceCommit $headCommit `
    -RequireCurrentHead `
    -RequireFinalBatteryAcceptance `
    -RequireCompactTargetedPolling `
    -NodeLabels $NodeLabels
  if ($LASTEXITCODE -ne 0) {
    throw "Hybrid A/B/C release safety verification failed"
  }

  $instructions = @"
Compact V4 indoor RS485 acceptance package

Truth profile
  - XLS1 PB2/PB3: real
  - SC16IS752 PB4/PB5 and both RS485 sensors: real
  - PC0 battery: real and field-calibrated
  - GNSS: simulated; UM220 PB6/PB7 UART is not initialized
  - RTCM: disabled
  - Polling: compact-targeted-v1; one P2 target and one response in flight

Flash only the image matching physical node A/B/C. This package is for indoor
RS485 stabilization and must never be used as RTK Fixed or displacement evidence.

After all nodes are online, run on RK3568:
  sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py --required-gnss-source simulated --check-prerequisites
  sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py --required-gnss-source simulated

Only after 60/600/1800 second gates pass should a new hardware-GNSS package be
built for the outdoor UM220 + BT-760 + CORS gate.

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
  Write-Host "HYBRID_RELEASE_OK path=$releaseRoot manifest_sha256=$manifestSha256 source=$headCommit"
} finally {
  if (Test-Path -LiteralPath $stagingRoot -PathType Container) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
