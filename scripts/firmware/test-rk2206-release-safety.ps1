$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$verifier = Join-Path $PSScriptRoot "verify-rk2206-release-safety.ps1"
$testRoot = Join-Path ([System.IO.Path]::GetTempPath()) (
  "rk2206-release-safety-test-" + [guid]::NewGuid().ToString("N")
)
$sourceCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
$nodeIds = @{
  A = "00000000-0000-0000-0000-000000000001"
  B = "00000000-0000-0000-0000-000000000002"
  C = "00000000-0000-0000-0000-000000000003"
}

function Write-Utf8Json {
  param(
    [string]$Path,
    [object]$Value
  )
  [System.IO.File]::WriteAllText(
    $Path,
    (($Value | ConvertTo-Json -Depth 10) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )
}

function New-TestRelease {
  param(
    [string]$Path,
    [ValidateSet(1, 2)]
    [int]$SchemaVersion = 1,
    [ValidateSet(3, 4)]
    [int]$CompactVersion = 3,
    [ValidateSet("hardware", "simulated")]
    [string]$Mode,
    [ValidateSet("disabled", "probe", "live")]
    [string]$RtcmMode = "disabled",
    [ValidateSet("hardware", "simulated")]
    [string]$GnssSource = "hardware",
    [ValidateSet("default-calibration", "field-calibrated")]
    [string]$BatteryState,
    [switch]$FinalAcceptance
  )

  if ($GnssSource -eq "simulated" -and $RtcmMode -ne "disabled") {
    throw "Test fixture cannot combine simulated GNSS with active RTCM"
  }

  New-Item -ItemType Directory -Force -Path $Path | Out-Null
  $calibrated = $BatteryState -eq "field-calibrated"
  $calibrationByNode = [ordered]@{}
  foreach ($node in @("A", "B", "C")) {
    $calibrationByNode[$node] = [ordered]@{
      gainPpm = if ($calibrated) { 1000000 + [int]$node[0] } else { 1000000 }
      offsetMv = 0
      verified = $calibrated
    }
  }

  $calibrationSha256 = $null
  if ($calibrated) {
    $calibration = [ordered]@{
      schemaVersion = 1
      method = "one-point-multiplicative"
      nodes = $calibrationByNode
    }
    if ($FinalAcceptance) {
      $acceptanceByNode = [ordered]@{}
      foreach ($node in @("A", "B", "C")) {
        $acceptanceByNode[$node] = [ordered]@{
          accepted = $true
          acceptedGainPpm = $calibrationByNode[$node].gainPpm
          acceptedOffsetMv = 0
          reportName = "report-$node.json"
          reportSha256 = "a" * 64
          releaseManifestName = "manifest.json"
          releaseManifestSha256 = "b" * 64
          releaseSourceCommit = $sourceCommit
          verificationFieldSensorMode = "simulated"
          verificationGnssRtcmInjectionMode = "disabled"
          measuredStartMv = 11500
          measuredEndMv = 11500
          meterSpanMv = 0
          reportedMedianMv = 11500
          observedSpanMv = 1
          errorAtStartMv = 0
          errorAtEndMv = 0
          maxAbsErrorMv = 0
          batterySamples = 31
          reportStable = $true
          expectedTelemetry = 93
          matchedTelemetry = 93
          completeBatches = 31
          communicationErrorCount = 0
        }
      }
      $calibration["finalAcceptance"] = [ordered]@{
        schemaVersion = 1
        allNodesAccepted = $true
        maxAllowedAbsErrorMv = 60
        maxAllowedMeterSpanMv = 50
        maxAllowedObservedSpanMv = 150
        minimumSamplesPerNode = 30
        strictCommunicationRequired = $true
        evidenceBinding = "operator-supplied release manifests + strict reports + synchronous meter endpoints"
      }
      $calibration["acceptanceByNode"] = $acceptanceByNode
    }
    $calibrationPath = Join-Path $Path "battery-calibration.json"
    Write-Utf8Json -Path $calibrationPath -Value $calibration
    $calibrationSha256 = (
      Get-FileHash -LiteralPath $calibrationPath -Algorithm SHA256
    ).Hash.ToLowerInvariant()
  }

  $firmwareMarker = "fw-release-safety-fixture"
  $sampleVersion = "v-test-compact-v$CompactVersion"
  $compactPayloadBytes = if ($CompactVersion -eq 4) { 139 } else { 95 }
  $fieldLinkWireBytes = if ($CompactVersion -eq 4) { 157 } else { 113 }
  $compactMarker = if ($CompactVersion -eq 4) {
    "Compact v4 (139-byte field + RTK + injection evidence)"
  } else {
    "Compact v3 (95-byte field + RTK payload)"
  }
  $capabilityMarker = "boot=DISABLED capability=$($RtcmMode.ToUpperInvariant())"
  $sensorMarkers = if ($Mode -eq "hardware") {
    "HARDWARE SC16IS752 over EI2C0_M0 PB4/PB5 RS-ECTH-N01-TR-1 [RS485]"
  } else {
    "SIMULATED (RS485 values only)"
  }
  $gnssMarker = if ($GnssSource -eq "simulated") {
    "GNSS Source: SIMULATED (no PB6/PB7 UART)"
  } else {
    "GNSS Source: HARDWARE (UM220-IV NK on PB6/PB7)"
  }
  [System.IO.File]::WriteAllBytes(
    (Join-Path $Path "rk2206_db_loader.bin"),
    [System.Text.Encoding]::ASCII.GetBytes("loader-fixture")
  )
  foreach ($node in @("A", "B", "C")) {
    $content = @(
      $nodeIds[$node],
      "FIELD-NODE-$node",
      $firmwareMarker,
      $sampleVersion,
      "EUART2_M1 PB2/PB3",
      "PC0/SARADC-ch0 input-only",
      $compactMarker,
      $sensorMarkers,
      $capabilityMarker,
      $(if ($CompactVersion -eq 4) { "compact-targeted-v1 P2 singleflight" } else { "" }),
      $(if ($SchemaVersion -ge 2) { $gnssMarker } else { "" })
    ) -join "`0"
    foreach ($extension in @("bin", "img")) {
      [System.IO.File]::WriteAllBytes(
        (Join-Path $Path "rk2206-node-$node-xls1-compact-v$CompactVersion-$Mode.$extension"),
        [System.Text.Encoding]::ASCII.GetBytes($content)
      )
    }
  }

  $files = @(
    Get-ChildItem -LiteralPath $Path -File |
      Where-Object { $_.Extension -in ".bin", ".img" } |
      Sort-Object Name |
      ForEach-Object {
        [ordered]@{
          name = $_.Name
          bytes = $_.Length
          sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
        }
      }
  )
  $manifest = [ordered]@{
    schemaVersion = $SchemaVersion
    profile = if ($SchemaVersion -ge 2) { "rk2206-xl01-compact-v$CompactVersion-$Mode-gnss-$GnssSource" } else { "rk2206-xl01-compact-v$CompactVersion-$Mode" }
    compactVersion = $CompactVersion
    sourceCommit = $sourceCommit
    sourceDirty = $false
    gnssRtcmInjectionMode = $RtcmMode
    rtcmRuntimeBootMode = "disabled"
    rtcmRuntimeControlEnabled = $RtcmMode -ne "disabled"
    fieldSensorMode = $Mode
    fieldSensorTruth = if ($Mode -eq "hardware") {
      "RS485, GPS and battery are real"
    } else {
      "RS485 values simulated; GPS and battery are real"
    }
    rs485HardwareInitialized = $Mode -eq "hardware"
    battery = [ordered]@{
      topology = "3S2P"
      nominalCapacityMah = 5000
      nominalVoltageMv = 11100
      adcRoute = "PC0/SARADC channel 0 input-only"
      dividerOhms = "100000/27000"
      calibrationGainPpm = if ($calibrated) { $null } else { 1000000 }
      calibrationOffsetMv = if ($calibrated) { $null } else { 0 }
      calibrationSourceSha256 = $calibrationSha256
      calibrationByNode = $calibrationByNode
      socMethod = "trimmed ADC mean + calibrated voltage + IIR + 3S voltage curve"
    }
    firmwareMarker = $firmwareMarker
    sampleVersion = $sampleVersion
    compactPayloadBytes = $compactPayloadBytes
    fieldLinkWireBytes = $fieldLinkWireBytes
    compactPollProtocol = if ($CompactVersion -eq 4) { "compact-targeted-v1" } else { "compact-broadcast-v1" }
    compactPollCommandBytes = if ($CompactVersion -eq 4) { 11 } else { 10 }
    compactPollWireBytes = if ($CompactVersion -eq 4) { 29 } else { 28 }
    nodeSlotMs = if ($CompactVersion -eq 4) { 0 } else { 340 }
    files = $files
  }
  if ($SchemaVersion -ge 2) {
    $manifest.fieldSensorTruth = if ($Mode -eq "hardware") {
      "RS485 and battery are real"
    } else {
      "RS485 values simulated; battery is real"
    }
    $manifest.gnssSourceMode = $GnssSource
    $manifest.gnssTruth = if ($GnssSource -eq "simulated") {
      "Synthetic GNSS snapshot; UM220 PB6/PB7 UART is not initialized"
    } else {
      "UM220-IV NK on PB6/PB7 UART is real"
    }
    $manifest.gnssHardwareInitialized = $GnssSource -eq "hardware"
  }
  Write-Utf8Json -Path (Join-Path $Path "manifest.json") -Value $manifest
}

function Assert-Rejected {
  param(
    [scriptblock]$Action,
    [string]$Reason
  )
  $rejected = $false
  try {
    & $Action
  } catch {
    $rejected = $true
  }
  if (-not $rejected) {
    throw "Release verifier accepted invalid fixture: $Reason"
  }
}

try {
  $simulatedRoot = Join-Path $testRoot "simulated"
  New-TestRelease -Path $simulatedRoot -Mode simulated -BatteryState default-calibration
  & $verifier `
    -ArtifactDirectory $simulatedRoot `
    -ExpectedFieldSensorMode simulated `
    -ExpectedGnssRtcmInjectionMode disabled `
    -ExpectedBatteryCalibrationState default-calibration `
    -ExpectedSourceCommit $sourceCommit | Out-Null

  $v4Root = Join-Path $testRoot "v4-live"
  New-TestRelease `
    -Path $v4Root `
    -CompactVersion 4 `
    -Mode simulated `
    -RtcmMode live `
    -BatteryState default-calibration
  & $verifier `
    -ArtifactDirectory $v4Root `
    -ExpectedCompactVersion 4 `
    -ExpectedFieldSensorMode simulated `
    -ExpectedGnssRtcmInjectionMode live `
    -ExpectedBatteryCalibrationState default-calibration `
    -ExpectedSourceCommit $sourceCommit | Out-Null

  $v4ManifestPath = Join-Path $v4Root "manifest.json"
  $v4Manifest = Get-Content -LiteralPath $v4ManifestPath -Raw | ConvertFrom-Json
  $v4Manifest.rtcmRuntimeBootMode = "live"
  Write-Utf8Json -Path $v4ManifestPath -Value $v4Manifest
  Assert-Rejected -Reason "V4 LIVE release that does not boot fail-closed" -Action {
    & $verifier `
      -ArtifactDirectory $v4Root `
      -ExpectedCompactVersion 4 `
      -ExpectedFieldSensorMode simulated `
      -ExpectedGnssRtcmInjectionMode live `
      -ExpectedBatteryCalibrationState default-calibration | Out-Null
  }

  $hybridRoot = Join-Path $testRoot "v4-rs485-hardware-gnss-simulated"
  New-TestRelease `
    -Path $hybridRoot `
    -SchemaVersion 2 `
    -CompactVersion 4 `
    -Mode hardware `
    -GnssSource simulated `
    -RtcmMode disabled `
    -BatteryState default-calibration
  & $verifier `
    -ArtifactDirectory $hybridRoot `
    -ExpectedCompactVersion 4 `
    -ExpectedFieldSensorMode hardware `
    -ExpectedGnssSourceMode simulated `
    -ExpectedGnssRtcmInjectionMode disabled `
    -ExpectedBatteryCalibrationState default-calibration `
    -RequireCompactTargetedPolling `
    -ExpectedFirmwareMarker "fw-release-safety-fixture" `
    -ExpectedSourceCommit $sourceCommit | Out-Null

  Assert-Rejected -Reason "release with an unexpected firmware marker" -Action {
    & $verifier `
      -ArtifactDirectory $hybridRoot `
      -ExpectedCompactVersion 4 `
      -ExpectedFieldSensorMode hardware `
      -ExpectedGnssSourceMode simulated `
      -ExpectedGnssRtcmInjectionMode disabled `
      -ExpectedBatteryCalibrationState default-calibration `
      -ExpectedFirmwareMarker "fw-wrong-version" | Out-Null
  }

  $hybridManifestPath = Join-Path $hybridRoot "manifest.json"
  $hybridManifest = Get-Content -LiteralPath $hybridManifestPath -Raw | ConvertFrom-Json
  $hybridManifest.gnssHardwareInitialized = $true
  Write-Utf8Json -Path $hybridManifestPath -Value $hybridManifest
  Assert-Rejected -Reason "simulated GNSS release presented as hardware-initialized" -Action {
    & $verifier `
      -ArtifactDirectory $hybridRoot `
      -ExpectedCompactVersion 4 `
      -ExpectedFieldSensorMode hardware `
      -ExpectedGnssSourceMode simulated `
      -ExpectedGnssRtcmInjectionMode disabled `
      -ExpectedBatteryCalibrationState default-calibration | Out-Null
  }

  [System.IO.File]::AppendAllText(
    (Join-Path $simulatedRoot "rk2206-node-A-xls1-compact-v3-simulated.img"),
    "tampered"
  )
  Assert-Rejected -Reason "tampered image hash" -Action {
    & $verifier `
      -ArtifactDirectory $simulatedRoot `
      -ExpectedFieldSensorMode simulated `
      -ExpectedGnssRtcmInjectionMode disabled `
      -ExpectedBatteryCalibrationState default-calibration | Out-Null
  }

  Remove-Item -LiteralPath $simulatedRoot -Recurse -Force
  New-TestRelease -Path $simulatedRoot -Mode simulated -BatteryState default-calibration
  $aBin = Join-Path $simulatedRoot "rk2206-node-A-xls1-compact-v3-simulated.bin"
  [System.IO.File]::AppendAllText($aBin, $nodeIds.B)
  $manifestPath = Join-Path $simulatedRoot "manifest.json"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  $entry = @($manifest.files | Where-Object { $_.name -eq (Split-Path -Leaf $aBin) })[0]
  $entry.bytes = (Get-Item -LiteralPath $aBin).Length
  $entry.sha256 = (Get-FileHash -LiteralPath $aBin -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Utf8Json -Path $manifestPath -Value $manifest
  Assert-Rejected -Reason "cross-node identity in a hash-consistent image" -Action {
    & $verifier `
      -ArtifactDirectory $simulatedRoot `
      -ExpectedFieldSensorMode simulated `
      -ExpectedGnssRtcmInjectionMode disabled `
      -ExpectedBatteryCalibrationState default-calibration | Out-Null
  }

  $hardwareRoot = Join-Path $testRoot "hardware"
  New-TestRelease `
    -Path $hardwareRoot `
    -Mode hardware `
    -BatteryState field-calibrated `
    -FinalAcceptance
  & $verifier `
    -ArtifactDirectory $hardwareRoot `
    -ExpectedFieldSensorMode hardware `
    -ExpectedGnssRtcmInjectionMode disabled `
    -ExpectedBatteryCalibrationState field-calibrated `
    -RequireFinalBatteryAcceptance `
    -RequireCurrentHead | Out-Null

  $hardwareWithoutAcceptanceRoot = Join-Path $testRoot "hardware-no-final-acceptance"
  New-TestRelease `
    -Path $hardwareWithoutAcceptanceRoot `
    -Mode hardware `
    -BatteryState field-calibrated
  Assert-Rejected -Reason "field calibration without final acceptance evidence" -Action {
    & $verifier `
      -ArtifactDirectory $hardwareWithoutAcceptanceRoot `
      -ExpectedFieldSensorMode hardware `
      -ExpectedGnssRtcmInjectionMode disabled `
      -ExpectedBatteryCalibrationState field-calibrated `
      -RequireFinalBatteryAcceptance | Out-Null
  }

  $hardwareCalibrationPath = Join-Path $hardwareRoot "battery-calibration.json"
  $hardwareManifestPath = Join-Path $hardwareRoot "manifest.json"
  $hardwareCalibration =
    Get-Content -LiteralPath $hardwareCalibrationPath -Raw | ConvertFrom-Json
  $hardwareCalibration.acceptanceByNode.A.maxAbsErrorMv = 61
  Write-Utf8Json -Path $hardwareCalibrationPath -Value $hardwareCalibration
  $hardwareManifest = Get-Content -LiteralPath $hardwareManifestPath -Raw | ConvertFrom-Json
  $hardwareManifest.battery.calibrationSourceSha256 = (
    Get-FileHash -LiteralPath $hardwareCalibrationPath -Algorithm SHA256
  ).Hash.ToLowerInvariant()
  Write-Utf8Json -Path $hardwareManifestPath -Value $hardwareManifest
  Assert-Rejected -Reason "hash-consistent final acceptance with invalid error arithmetic" -Action {
    & $verifier `
      -ArtifactDirectory $hardwareRoot `
      -ExpectedFieldSensorMode hardware `
      -ExpectedGnssRtcmInjectionMode disabled `
      -ExpectedBatteryCalibrationState field-calibrated `
      -RequireFinalBatteryAcceptance | Out-Null
  }

  Remove-Item -LiteralPath $hardwareRoot -Recurse -Force
  New-TestRelease `
    -Path $hardwareRoot `
    -Mode hardware `
    -BatteryState field-calibrated `
    -FinalAcceptance

  Assert-Rejected -Reason "hardware release presented as simulated" -Action {
    & $verifier `
      -ArtifactDirectory $hardwareRoot `
      -ExpectedFieldSensorMode simulated `
      -ExpectedGnssRtcmInjectionMode disabled `
      -ExpectedBatteryCalibrationState field-calibrated | Out-Null
  }

  Write-Host "RELEASE_SAFETY_TEST_OK V3/V4 field/GNSS source/final-acceptance positives and tamper/identity/mode/runtime/acceptance negatives passed"
} finally {
  if (Test-Path -LiteralPath $testRoot -PathType Container) {
    Remove-Item -LiteralPath $testRoot -Recurse -Force
  }
}
