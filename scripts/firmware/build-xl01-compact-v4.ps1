[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ArtifactDirectory = "",
  [ValidateSet("disabled", "probe", "live")]
  [string]$GnssRtcmInjectionMode = "disabled",
  [ValidateSet("hardware", "simulated")]
  [string]$FieldSensorMode = "hardware",
  [ValidateSet("hardware", "simulated")]
  [string]$GnssSourceMode = "hardware",
  [ValidateRange(800000, 1200000)]
  [int]$BatteryCalibrationGainPpm = 1000000,
  [ValidateRange(-2000, 2000)]
  [int]$BatteryCalibrationOffsetMv = 0,
  [string]$BatteryCalibrationFile = "",
  [ValidateSet("A", "B", "C")]
  [string[]]$NodeLabels = @("A", "B", "C"),
  [switch]$KeepSdkExperimentSource
)

$ErrorActionPreference = "Stop"
$builder = Join-Path $PSScriptRoot "build-xl01-compact-v3.ps1"
& $builder `
  -SdkRoot $SdkRoot `
  -ContainerName $ContainerName `
  -ArtifactDirectory $ArtifactDirectory `
  -GnssRtcmInjectionMode $GnssRtcmInjectionMode `
  -FieldSensorMode $FieldSensorMode `
  -GnssSourceMode $GnssSourceMode `
  -CompactVersion 4 `
  -BatteryCalibrationGainPpm $BatteryCalibrationGainPpm `
  -BatteryCalibrationOffsetMv $BatteryCalibrationOffsetMv `
  -BatteryCalibrationFile $BatteryCalibrationFile `
  -NodeLabels $NodeLabels `
  -KeepSdkExperimentSource:$KeepSdkExperimentSource
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
