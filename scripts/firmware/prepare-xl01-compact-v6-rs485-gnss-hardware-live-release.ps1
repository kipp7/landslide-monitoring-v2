[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ReleaseDirectory = "F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_lowrate_v2_corefast_rs485_gnss_hardware_live_20260806",
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
  ("rk2206-compact-v6-lowrate-v2-corefast-hardware-live-" + [guid]::NewGuid().ToString("N"))
$builder = Join-Path $PSScriptRoot "build-xl01-compact-v6.ps1"
$verifier = Join-Path $PSScriptRoot "verify-rk2206-release-safety.ps1"
$rollbackRelease = "F:\2\openharmony\rk2206_firmware_releases\xls1_compact_v6_protected_p1_rs485_gnss_simulated_20260804"
$gates = @(
  "test-gnss-transport-v3-host.ps1",
  "test-rk2206-pin-safety.ps1",
  "test-rk2206-rs485-startup-safety.ps1",
  "test-rk2206-field-link-tx-order-safety.ps1",
  "test-rk2206-poll-cadence-safety.ps1",
  "test-rk2206-release-marker-source-safety.ps1",
  "test-rk2206-snapshot-atomicity.ps1"
)
$expectedFirmwareMarker = "fw-rk2206-rtk-compact-v6-lowrate-v2-live-20260806"

function Assert-AsciiMarker {
  param(
    [string]$Path,
    [string[]]$Required,
    [string[]]$Forbidden = @()
  )
  $ascii = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($Path))
  foreach ($marker in $Required) {
    if (-not $ascii.Contains($marker)) {
      throw "Hardware-GNSS image is missing '$marker': $Path"
    }
  }
  foreach ($marker in $Forbidden) {
    if ($ascii.Contains($marker)) {
      throw "Hardware-GNSS image contains forbidden '$marker': $Path"
    }
  }
}

foreach ($gate in $gates) {
  & (Join-Path $PSScriptRoot $gate)
}
$dirty = @(& git -C $repoRoot status --porcelain --untracked-files=normal)
if ($LASTEXITCODE -ne 0 -or $dirty.Count -ne 0) {
  throw "Refusing to create an official hardware-GNSS V6 release from uncommitted source"
}
$headCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $headCommit -notmatch '^[0-9a-f]{40}$') {
  throw "Cannot resolve repository HEAD"
}
if (-not (Test-Path -LiteralPath $rollbackRelease -PathType Container)) {
  throw "Accepted simulated-GNSS rollback release is missing: $rollbackRelease"
}
if (Test-Path -LiteralPath $releaseRoot) {
  throw "Release directory already exists; choose a new immutable directory: $releaseRoot"
}

try {
  & $builder `
    -SdkRoot $SdkRoot `
    -ContainerName $ContainerName `
    -ArtifactDirectory $stagingRoot `
    -GnssRtcmInjectionMode live `
    -FieldSensorMode hardware `
    -GnssSourceMode hardware `
    -BatteryCalibrationFile $resolvedCalibration `
    -NodeLabels $NodeLabels
  if ($LASTEXITCODE -ne 0) {
    throw "Compact V6 A/B/C hardware-GNSS OpenHarmony build failed"
  }

  & $verifier `
    -ArtifactDirectory $stagingRoot `
    -ExpectedCompactVersion 6 `
    -ExpectedFieldSensorMode hardware `
    -ExpectedGnssSourceMode hardware `
    -ExpectedGnssRtcmInjectionMode live `
    -ExpectedBatteryCalibrationState field-calibrated `
    -ExpectedSourceCommit $headCommit `
    -ExpectedFirmwareMarker $expectedFirmwareMarker `
    -RequireCurrentHead `
    -RequireFinalBatteryAcceptance `
    -RequireCompactLayeredPolling `
    -NodeLabels $NodeLabels
  if ($LASTEXITCODE -ne 0) {
    throw "Compact V6 A/B/C hardware-GNSS release safety verification failed"
  }

  foreach ($node in $NodeLabels) {
    $binary = Join-Path $stagingRoot "rk2206-node-$node-xls1-compact-v6-hardware.bin"
    Assert-AsciiMarker -Path $binary -Required @(
      "GNSS Source: HARDWARE (UM220-IV NK on PB6/PB7)",
      "[GPS] Initializing UART id=",
      "GPS initialized with NMEA parsing + polling task",
      "boot=DISABLED capability=LIVE",
      "layered-v1 P1 core / P3 environment / P4 audit",
      "P1 dedup depth=256 / P2 diagnostic rollback only"
    ) -Forbidden @(
      "GNSS Source: SIMULATED (no PB6/PB7 UART)",
      "boot=DISABLED capability=PROBE",
      "boot=DISABLED capability=DISABLED"
    )
  }

  $instructions = @"
Compact V6 protected-P1 + 10-second low-rate sensors + RTCM G3B v1 + G3S V7 hardware GNSS LIVE-capable release

Truth profile
  - XLS1 PB2/PB3: real
  - SC16IS752 PB4/PB5 and both RS485 sensors: real
  - PC0 battery: real and field-calibrated
  - GNSS: real UM220-IV NK on PB6/PB7 at 115200 baud
  - RTCM capability: LIVE, but every boot starts DISABLED
  - RTCM downlink: legacy G3R plus validated G3B v1 aggregation (2..4 inner fragments)
  - On-demand diagnostics: G3S V7 bounded node queue and UM220 UART latency histograms
  - Runtime modes: DISABLED -> PROBE -> LIVE under a fresh 15..300 s lease
  - Polling: protected single P1, no production P2 recovery
  - Acquisition: tilt/GNSS 1 s; battery/soil/EC 10 s; tilt is read first
  - Core tilt RS485: 300 ms timeout, one retry (worst case about 780 ms including TX waits)
  - Low-rate RS485: 300 ms timeout, no retry, missing data is never encoded as zero
  - Every telemetry payload: 46 bytes; every complete telemetry frame: 64 bytes

Flash only the image matching physical node A/B/C. Do not enable NTRIP before
all three nodes boot with the correct identity and real GNSS source marker.

Fast fail-closed field sequence
  1. Keep RK3568 NTRIP_ENABLED=false.
     Keep RTCM_MAX_FRAGMENTS_PER_FIELD_FRAME=1 until all three new images boot.
  2. Outdoors with all BT-760 antennas connected, run the V6 gate with
     --required-gnss-source hardware for 60 seconds, then 600 seconds.
  3. Confirm real GGA/GST/HDOP/satellite data. Do not create an ENU baseline
     from invalid, stale, simulated, or non-Fixed coordinates.
  4. Arm one fresh common PROBE session and validate RTCM CRC, allowed message
     types, fragment completion, queue bounds, and zero UART injection.
     Then set RTCM_MAX_FRAGMENTS_PER_FIELD_FRAME=2 and repeat PROBE; a G3B batch
     consumes one field-link burst unit while accepted fragment deltas count both.
  5. Only after PROBE passes, arm LIVE with a bounded lease. Require sustained
     GGA quality 4, correction age <=6 s, solution age <=2 s, trustworthy GST,
     and no stale session.
  6. Run the final 1800-second mixed-load gate before accepting centimetre RTK.

This image is flashed once. Mode changes use fail-closed runtime leases; reboot
or lease expiry returns every node to DISABLED.

Accepted rollback release
  $rollbackRelease

Source commit
  $headCommit
"@
  [System.IO.File]::WriteAllText(
    (Join-Path $stagingRoot "FLASHING-INSTRUCTIONS.txt"),
    $instructions,
    [System.Text.UTF8Encoding]::new($false)
  )

  Move-Item -LiteralPath $stagingRoot -Destination $releaseRoot
  $manifestPath = Join-Path $releaseRoot "manifest.json"
  $manifestSha256 = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "COMPACT_V6_RTCM_BATCH_V1_HARDWARE_GNSS_RELEASE_OK path=$releaseRoot manifest_sha256=$manifestSha256 source=$headCommit"
} finally {
  if (Test-Path -LiteralPath $stagingRoot -PathType Container) {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
  }
}
