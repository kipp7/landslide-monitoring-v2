[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ArtifactDirectory,
  [Parameter(Mandatory = $true)]
  [ValidateSet("hardware", "simulated")]
  [string]$ExpectedFieldSensorMode,
  [Parameter(Mandatory = $true)]
  [ValidateSet("disabled", "probe", "live")]
  [string]$ExpectedGnssRtcmInjectionMode,
  [Parameter(Mandatory = $true)]
  [ValidateSet("default-calibration", "field-calibrated")]
  [string]$ExpectedBatteryCalibrationState,
  [ValidateSet("A", "B", "C")]
  [string[]]$NodeLabels = @("A", "B", "C"),
  [string]$ExpectedSourceCommit = "",
  [switch]$RequireCurrentHead,
  [string]$ExpectedBatteryTopology = "3S2P",
  [ValidateRange(1, 100000)]
  [int]$ExpectedBatteryCapacityMah = 5000,
  [ValidateRange(1000, 100000)]
  [int]$ExpectedBatteryNominalVoltageMv = 11100,
  [switch]$RequireFinalBatteryAcceptance,
  [ValidateRange(1, 500)]
  [int]$MaxAcceptedBatteryErrorMv = 60,
  [ValidateRange(0, 500)]
  [int]$MaxAcceptedBatteryMeterSpanMv = 50,
  [ValidateRange(1, 1000)]
  [int]$MaxAcceptedBatteryObservedSpanMv = 150
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$artifactRoot = (Resolve-Path -LiteralPath $ArtifactDirectory -ErrorAction Stop).Path
$manifestPath = Join-Path $artifactRoot "manifest.json"
$nodeIds = @{
  A = "00000000-0000-0000-0000-000000000001"
  B = "00000000-0000-0000-0000-000000000002"
  C = "00000000-0000-0000-0000-000000000003"
}

if (($NodeLabels | Select-Object -Unique).Count -ne $NodeLabels.Count) {
  throw "NodeLabels contains duplicate node identities"
}

function Assert-ReleaseCondition {
  param(
    [bool]$Condition,
    [string]$Message
  )
  if (-not $Condition) {
    throw $Message
  }
}

function Assert-ObjectProperty {
  param(
    [object]$Object,
    [string]$Name,
    [string]$Context
  )
  Assert-ReleaseCondition `
    -Condition ($null -ne $Object -and $Name -in $Object.PSObject.Properties.Name) `
    -Message "$Context is missing required property '$Name'"
}

function Assert-AsciiMarkers {
  param(
    [string]$Path,
    [string[]]$Required,
    [string[]]$Forbidden
  )
  $ascii = [System.Text.Encoding]::ASCII.GetString(
    [System.IO.File]::ReadAllBytes($Path)
  )
  foreach ($marker in $Required) {
    Assert-ReleaseCondition -Condition $ascii.Contains($marker) `
      -Message "Firmware is missing required marker '$marker': $Path"
  }
  foreach ($marker in $Forbidden) {
    Assert-ReleaseCondition -Condition (-not $ascii.Contains($marker)) `
      -Message "Firmware contains forbidden marker '$marker': $Path"
  }
}

Assert-ReleaseCondition -Condition (Test-Path -LiteralPath $manifestPath -PathType Leaf) `
  -Message "Release manifest is missing: $manifestPath"
try {
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
} catch {
  throw "Release manifest is not valid JSON: $manifestPath`n$($_.Exception.Message)"
}

foreach ($property in @(
    "schemaVersion", "profile", "sourceCommit", "sourceDirty",
    "gnssRtcmInjectionMode", "fieldSensorMode", "fieldSensorTruth",
    "rs485HardwareInitialized", "battery", "firmwareMarker",
    "sampleVersion", "compactPayloadBytes", "fieldLinkWireBytes",
    "compactPollCommandBytes", "compactPollWireBytes", "nodeSlotMs", "files"
  )) {
  Assert-ObjectProperty -Object $manifest -Name $property -Context "Release manifest"
}

Assert-ReleaseCondition -Condition ($manifest.schemaVersion -eq 1) `
  -Message "Unsupported release manifest schemaVersion: $($manifest.schemaVersion)"
Assert-ReleaseCondition `
  -Condition ($manifest.profile -eq "rk2206-xl01-compact-v2-$ExpectedFieldSensorMode") `
  -Message "Release profile does not match expected field sensor mode"
Assert-ReleaseCondition -Condition ($manifest.sourceCommit -match '^[0-9a-f]{40}$') `
  -Message "Release sourceCommit is not a full lowercase Git commit"
Assert-ReleaseCondition -Condition ($manifest.sourceDirty -is [bool] -and -not $manifest.sourceDirty) `
  -Message "Release was built from dirty source"
Assert-ReleaseCondition `
  -Condition ($manifest.gnssRtcmInjectionMode -eq $ExpectedGnssRtcmInjectionMode) `
  -Message "RTCM mode mismatch: expected $ExpectedGnssRtcmInjectionMode, found $($manifest.gnssRtcmInjectionMode)"
Assert-ReleaseCondition -Condition ($manifest.fieldSensorMode -eq $ExpectedFieldSensorMode) `
  -Message "Field sensor mode mismatch: expected $ExpectedFieldSensorMode, found $($manifest.fieldSensorMode)"

$expectHardware = $ExpectedFieldSensorMode -eq "hardware"
$expectedSensorTruth = if ($expectHardware) {
  "RS485, GPS and battery are real"
} else {
  "RS485 values simulated; GPS and battery are real"
}
Assert-ReleaseCondition -Condition ($manifest.fieldSensorTruth -eq $expectedSensorTruth) `
  -Message "Field sensor truth statement is inconsistent with the requested profile"
Assert-ReleaseCondition `
  -Condition ($manifest.rs485HardwareInitialized -is [bool] -and
    $manifest.rs485HardwareInitialized -eq $expectHardware) `
  -Message "rs485HardwareInitialized is inconsistent with fieldSensorMode"

foreach ($fixedField in @(
    @{ Name = "compactPayloadBytes"; Value = 46 },
    @{ Name = "fieldLinkWireBytes"; Value = 64 },
    @{ Name = "compactPollCommandBytes"; Value = 10 },
    @{ Name = "compactPollWireBytes"; Value = 28 },
    @{ Name = "nodeSlotMs"; Value = 340 }
  )) {
  Assert-ReleaseCondition -Condition ($manifest.($fixedField.Name) -eq $fixedField.Value) `
    -Message "Unexpected $($fixedField.Name): $($manifest.($fixedField.Name))"
}
Assert-ReleaseCondition -Condition (
    $manifest.firmwareMarker -is [string] -and $manifest.firmwareMarker.Length -gt 0
  ) -Message "Release firmwareMarker is empty"
Assert-ReleaseCondition -Condition (
    $manifest.sampleVersion -is [string] -and $manifest.sampleVersion.Length -gt 0
  ) -Message "Release sampleVersion is empty"

if ($ExpectedSourceCommit) {
  Assert-ReleaseCondition -Condition ($manifest.sourceCommit -eq $ExpectedSourceCommit) `
    -Message "Release sourceCommit does not match ExpectedSourceCommit"
}
& git -C $repoRoot cat-file -e "$($manifest.sourceCommit)^{commit}" 2>$null
Assert-ReleaseCondition -Condition ($LASTEXITCODE -eq 0) `
  -Message "Release sourceCommit is not present in this repository: $($manifest.sourceCommit)"
if ($RequireCurrentHead) {
  $headCommit = (& git -C $repoRoot rev-parse HEAD).Trim()
  Assert-ReleaseCondition -Condition ($LASTEXITCODE -eq 0 -and $manifest.sourceCommit -eq $headCommit) `
    -Message "Release sourceCommit does not match current HEAD $headCommit"
}

$battery = $manifest.battery
foreach ($property in @(
    "topology", "nominalCapacityMah", "nominalVoltageMv", "adcRoute",
    "dividerOhms", "calibrationGainPpm", "calibrationOffsetMv",
    "calibrationSourceSha256", "calibrationByNode", "socMethod"
  )) {
  Assert-ObjectProperty -Object $battery -Name $property -Context "Battery manifest"
}
Assert-ReleaseCondition -Condition ($battery.topology -eq $ExpectedBatteryTopology) `
  -Message "Battery topology mismatch: expected $ExpectedBatteryTopology, found $($battery.topology)"
Assert-ReleaseCondition -Condition ($battery.nominalCapacityMah -eq $ExpectedBatteryCapacityMah) `
  -Message "Battery capacity mismatch: expected $ExpectedBatteryCapacityMah mAh"
Assert-ReleaseCondition -Condition ($battery.nominalVoltageMv -eq $ExpectedBatteryNominalVoltageMv) `
  -Message "Battery nominal voltage mismatch: expected $ExpectedBatteryNominalVoltageMv mV"
Assert-ReleaseCondition -Condition ($battery.adcRoute -eq "PC0/SARADC channel 0 input-only") `
  -Message "Battery ADC route is not the input-only PC0/SARADC channel 0 path"
Assert-ReleaseCondition -Condition ($battery.dividerOhms -eq "100000/27000") `
  -Message "Battery divider does not match the V1.3 100k/27k circuit"
Assert-ReleaseCondition `
  -Condition ($battery.socMethod -eq "trimmed ADC mean + calibrated voltage + IIR + 3S voltage curve") `
  -Message "Battery estimator method is not the reviewed production method"

$expectCalibrated = $ExpectedBatteryCalibrationState -eq "field-calibrated"
foreach ($node in $NodeLabels) {
  $property = $battery.calibrationByNode.PSObject.Properties[$node]
  Assert-ReleaseCondition -Condition ($null -ne $property) `
    -Message "Battery calibration is missing node $node"
  $entry = $property.Value
  foreach ($name in @("gainPpm", "offsetMv", "verified")) {
    Assert-ObjectProperty -Object $entry -Name $name -Context "Battery calibration for node $node"
  }
  Assert-ReleaseCondition `
    -Condition ($entry.gainPpm -ge 800000 -and $entry.gainPpm -le 1200000) `
    -Message "Battery gain is outside the reviewed range for node $node"
  Assert-ReleaseCondition `
    -Condition ($entry.offsetMv -ge -2000 -and $entry.offsetMv -le 2000) `
    -Message "Battery offset is outside the reviewed range for node $node"
  Assert-ReleaseCondition `
    -Condition ($entry.verified -is [bool] -and $entry.verified -eq $expectCalibrated) `
    -Message "Battery calibration verification state is wrong for node $node"
  if (-not $expectCalibrated) {
    Assert-ReleaseCondition -Condition (
        $entry.gainPpm -eq 1000000 -and $entry.offsetMv -eq 0
      ) -Message "Unverified battery calibration must remain neutral for node $node"
  }
}

$calibrationPath = Join-Path $artifactRoot "battery-calibration.json"
if ($expectCalibrated) {
  Assert-ReleaseCondition -Condition (
      $null -eq $battery.calibrationGainPpm -and
      $null -eq $battery.calibrationOffsetMv
    ) -Message "Field-calibrated release must use per-node calibration only"
  Assert-ReleaseCondition -Condition (
      $battery.calibrationSourceSha256 -match '^[0-9a-f]{64}$'
    ) -Message "Field-calibrated release is missing calibrationSourceSha256"
  Assert-ReleaseCondition -Condition (Test-Path -LiteralPath $calibrationPath -PathType Leaf) `
    -Message "Field-calibrated release is missing battery-calibration.json"
  $calibrationSha256 = (Get-FileHash -LiteralPath $calibrationPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert-ReleaseCondition -Condition ($calibrationSha256 -eq $battery.calibrationSourceSha256) `
    -Message "battery-calibration.json hash does not match the manifest"
  $calibration = Get-Content -LiteralPath $calibrationPath -Raw | ConvertFrom-Json
  Assert-ReleaseCondition -Condition ($calibration.schemaVersion -eq 1) `
    -Message "Unsupported battery calibration schemaVersion"
  foreach ($node in $NodeLabels) {
    $calibrationProperty = $calibration.nodes.PSObject.Properties[$node]
    Assert-ReleaseCondition -Condition ($null -ne $calibrationProperty) `
      -Message "battery-calibration.json is missing node $node"
    $fileEntry = $calibrationProperty.Value
    $manifestEntry = $battery.calibrationByNode.PSObject.Properties[$node].Value
    Assert-ReleaseCondition -Condition (
        $fileEntry.gainPpm -eq $manifestEntry.gainPpm -and
        $fileEntry.offsetMv -eq $manifestEntry.offsetMv -and
        $fileEntry.verified -eq $true
      ) -Message "Battery calibration file and manifest disagree for node $node"
  }
  if ($RequireFinalBatteryAcceptance) {
    foreach ($property in @("finalAcceptance", "acceptanceByNode")) {
      Assert-ObjectProperty -Object $calibration -Name $property `
        -Context "Final battery calibration"
    }
    $finalAcceptance = $calibration.finalAcceptance
    foreach ($property in @(
        "schemaVersion", "allNodesAccepted", "maxAllowedAbsErrorMv",
        "maxAllowedMeterSpanMv", "maxAllowedObservedSpanMv",
        "minimumSamplesPerNode", "strictCommunicationRequired", "evidenceBinding"
      )) {
      Assert-ObjectProperty -Object $finalAcceptance -Name $property `
        -Context "Final battery acceptance"
    }
    Assert-ReleaseCondition -Condition ($finalAcceptance.schemaVersion -eq 1) `
      -Message "Unsupported final battery acceptance schemaVersion"
    Assert-ReleaseCondition -Condition (
        $finalAcceptance.allNodesAccepted -is [bool] -and
        $finalAcceptance.allNodesAccepted -eq $true -and
        $finalAcceptance.strictCommunicationRequired -is [bool] -and
        $finalAcceptance.strictCommunicationRequired -eq $true
      ) -Message "Final battery acceptance is not complete and strict"
    Assert-ReleaseCondition -Condition (
        [int]$finalAcceptance.maxAllowedAbsErrorMv -gt 0 -and
        [int]$finalAcceptance.maxAllowedAbsErrorMv -le $MaxAcceptedBatteryErrorMv
      ) -Message "Final battery error gate is weaker than the release policy"
    Assert-ReleaseCondition -Condition (
        [int]$finalAcceptance.maxAllowedMeterSpanMv -ge 0 -and
        [int]$finalAcceptance.maxAllowedMeterSpanMv -le $MaxAcceptedBatteryMeterSpanMv
      ) -Message "Final battery meter-span gate is weaker than the release policy"
    Assert-ReleaseCondition -Condition (
        [int]$finalAcceptance.maxAllowedObservedSpanMv -gt 0 -and
        [int]$finalAcceptance.maxAllowedObservedSpanMv -le $MaxAcceptedBatteryObservedSpanMv
      ) -Message "Final battery observed-span gate is weaker than the release policy"
    Assert-ReleaseCondition -Condition ([int]$finalAcceptance.minimumSamplesPerNode -ge 30) `
      -Message "Final battery acceptance used fewer than 30 samples per node"
    Assert-ReleaseCondition -Condition (
        [string]$finalAcceptance.evidenceBinding -eq
          "operator-supplied release manifests + strict reports + synchronous meter endpoints"
      ) -Message "Final battery evidence binding is not the reviewed workflow"

    foreach ($node in $NodeLabels) {
      $acceptanceProperty = $calibration.acceptanceByNode.PSObject.Properties[$node]
      Assert-ReleaseCondition -Condition ($null -ne $acceptanceProperty) `
        -Message "Final battery acceptance is missing node $node"
      $accepted = $acceptanceProperty.Value
      foreach ($property in @(
          "accepted", "acceptedGainPpm", "acceptedOffsetMv", "reportName",
          "reportSha256", "releaseManifestName", "releaseManifestSha256",
          "releaseSourceCommit", "verificationFieldSensorMode",
          "verificationGnssRtcmInjectionMode", "measuredStartMv", "measuredEndMv",
          "meterSpanMv", "reportedMedianMv", "observedSpanMv", "errorAtStartMv",
          "errorAtEndMv", "maxAbsErrorMv", "batterySamples", "reportStable",
          "expectedTelemetry", "matchedTelemetry", "completeBatches",
          "communicationErrorCount"
        )) {
        Assert-ObjectProperty -Object $accepted -Name $property `
          -Context "Final battery acceptance for node $node"
      }
      $calibrationNode = $calibration.nodes.PSObject.Properties[$node].Value
      Assert-ReleaseCondition -Condition (
          $accepted.accepted -is [bool] -and $accepted.accepted -eq $true -and
          [int]$accepted.acceptedGainPpm -eq [int]$calibrationNode.gainPpm -and
          [int]$accepted.acceptedOffsetMv -eq [int]$calibrationNode.offsetMv
        ) -Message "Final battery acceptance does not bind the active calibration for node $node"
      Assert-ReleaseCondition -Condition (
          [string]$accepted.reportName -eq [System.IO.Path]::GetFileName([string]$accepted.reportName) -and
          [string]$accepted.releaseManifestName -eq
            [System.IO.Path]::GetFileName([string]$accepted.releaseManifestName)
        ) -Message "Final battery evidence names are not safe leaf names for node $node"
      Assert-ReleaseCondition -Condition (
          [string]$accepted.reportSha256 -match '^[0-9a-f]{64}$' -and
          [string]$accepted.releaseManifestSha256 -match '^[0-9a-f]{64}$' -and
          [string]$accepted.releaseSourceCommit -match '^[0-9a-f]{40}$'
        ) -Message "Final battery evidence hashes are malformed for node $node"
      Assert-ReleaseCondition -Condition (
          [string]$accepted.verificationFieldSensorMode -in @("simulated", "hardware") -and
          [string]$accepted.verificationGnssRtcmInjectionMode -eq "disabled"
        ) -Message "Final battery verification profile is invalid for node $node"

      $measuredStartMv = [int]$accepted.measuredStartMv
      $measuredEndMv = [int]$accepted.measuredEndMv
      $reportedMedianMv = [int]$accepted.reportedMedianMv
      $calculatedMeterSpanMv = [math]::Abs($measuredEndMv - $measuredStartMv)
      $calculatedErrorAtStartMv = $reportedMedianMv - $measuredStartMv
      $calculatedErrorAtEndMv = $reportedMedianMv - $measuredEndMv
      $calculatedMaxAbsErrorMv = [math]::Max(
        [math]::Abs($calculatedErrorAtStartMv),
        [math]::Abs($calculatedErrorAtEndMv)
      )
      Assert-ReleaseCondition -Condition (
          $measuredStartMv -ge 8000 -and $measuredStartMv -le 13500 -and
          $measuredEndMv -ge 8000 -and $measuredEndMv -le 13500 -and
          $reportedMedianMv -ge 8000 -and $reportedMedianMv -le 13500 -and
          [int]$accepted.meterSpanMv -eq $calculatedMeterSpanMv -and
          [int]$accepted.errorAtStartMv -eq $calculatedErrorAtStartMv -and
          [int]$accepted.errorAtEndMv -eq $calculatedErrorAtEndMv -and
          [int]$accepted.maxAbsErrorMv -eq $calculatedMaxAbsErrorMv
        ) -Message "Final battery voltage arithmetic is inconsistent for node $node"
      Assert-ReleaseCondition -Condition (
          $calculatedMeterSpanMv -le $MaxAcceptedBatteryMeterSpanMv -and
          [int]$accepted.observedSpanMv -ge 0 -and
          [int]$accepted.observedSpanMv -le $MaxAcceptedBatteryObservedSpanMv -and
          $calculatedMaxAbsErrorMv -le $MaxAcceptedBatteryErrorMv
        ) -Message "Final battery voltage gate failed for node $node"
      Assert-ReleaseCondition -Condition (
          [int]$accepted.batterySamples -ge 30 -and
          $accepted.reportStable -is [bool] -and $accepted.reportStable -eq $true -and
          [int]$accepted.expectedTelemetry -gt 0 -and
          [int]$accepted.matchedTelemetry -eq [int]$accepted.expectedTelemetry -and
          [int]$accepted.completeBatches -gt 0 -and
          [int]$accepted.communicationErrorCount -eq 0
        ) -Message "Final battery strict report evidence failed for node $node"
    }
  }
} else {
  Assert-ReleaseCondition -Condition (-not $RequireFinalBatteryAcceptance) `
    -Message "Final battery acceptance cannot be required for a default-calibration release"
  Assert-ReleaseCondition -Condition ($null -eq $battery.calibrationSourceSha256) `
    -Message "Default-calibration release unexpectedly references a calibration source"
  Assert-ReleaseCondition -Condition (
      $battery.calibrationGainPpm -eq 1000000 -and
      $battery.calibrationOffsetMv -eq 0
    ) -Message "Default-calibration release must use neutral global calibration"
  Assert-ReleaseCondition -Condition (-not (Test-Path -LiteralPath $calibrationPath)) `
    -Message "Default-calibration release contains a stale battery-calibration.json"
}

$expectedFiles = @("rk2206_db_loader.bin")
foreach ($node in $NodeLabels) {
  $expectedFiles += "rk2206-node-$node-xls1-compact-v2-$ExpectedFieldSensorMode.bin"
  $expectedFiles += "rk2206-node-$node-xls1-compact-v2-$ExpectedFieldSensorMode.img"
}
$manifestEntries = @($manifest.files)
$manifestNames = @($manifestEntries | ForEach-Object { [string]$_.name })
Assert-ReleaseCondition -Condition (($manifestNames | Select-Object -Unique).Count -eq $manifestNames.Count) `
  -Message "Release manifest contains duplicate file names"
$fileDifference = @(Compare-Object ($expectedFiles | Sort-Object) ($manifestNames | Sort-Object))
Assert-ReleaseCondition -Condition ($fileDifference.Count -eq 0) `
  -Message "Release manifest file set is incomplete or contains stale artifacts"
$actualFirmwareFiles = @(
  Get-ChildItem -LiteralPath $artifactRoot -File |
    Where-Object { $_.Extension -in ".bin", ".img" } |
    ForEach-Object Name
)
$actualDifference = @(
  Compare-Object ($expectedFiles | Sort-Object) ($actualFirmwareFiles | Sort-Object)
)
Assert-ReleaseCondition -Condition ($actualDifference.Count -eq 0) `
  -Message "Release directory contains missing or unexpected firmware files"

foreach ($entry in $manifestEntries) {
  $name = [string]$entry.name
  Assert-ReleaseCondition -Condition (
      $name -eq [System.IO.Path]::GetFileName($name) -and
      $name -notmatch '[/\\]'
    ) -Message "Manifest file name is not a safe leaf name: $name"
  Assert-ReleaseCondition -Condition ([string]$entry.sha256 -match '^[0-9a-f]{64}$') `
    -Message "Manifest SHA-256 is malformed for $name"
  $path = Join-Path $artifactRoot $name
  Assert-ReleaseCondition -Condition (Test-Path -LiteralPath $path -PathType Leaf) `
    -Message "Manifest file is missing: $path"
  $item = Get-Item -LiteralPath $path
  $sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
  Assert-ReleaseCondition -Condition (
      $item.Length -eq $entry.bytes -and $sha256 -eq $entry.sha256
    ) -Message "Manifest size/hash mismatch: $path"
}

$rtcmMarker = switch ($ExpectedGnssRtcmInjectionMode) {
  "disabled" { "DISABLED" }
  "probe" { "PROBE (no GNSS UART writes)" }
  "live" { "LIVE" }
}
$sensorMarker = if ($expectHardware) { "HARDWARE" } else { "SIMULATED (RS485 values only)" }
$modeRequired = if ($expectHardware) {
  @("SC16IS752 over EI2C0_M0 PB4/PB5", "RS-ECTH-N01-TR-1", "[RS485]")
} else {
  @()
}
$modeForbidden = if ($expectHardware) {
  @("SIMULATED (RS485 values only)")
} else {
  @("SC16IS752", "[RS485]", "EI2C0_M0 PB4/PB5", "Field Sensor Source: HARDWARE")
}

foreach ($node in $NodeLabels) {
  foreach ($extension in @("bin", "img")) {
    $path = Join-Path $artifactRoot "rk2206-node-$node-xls1-compact-v2-$ExpectedFieldSensorMode.$extension"
    $required = @(
      $nodeIds[$node],
      "FIELD-NODE-$node",
      $manifest.firmwareMarker,
      $manifest.sampleVersion,
      "EUART2_M1 PB2/PB3",
      "PC0/SARADC-ch0 input-only",
      "Compact v2 (46-byte payload)",
      $sensorMarker,
      $rtcmMarker
    ) + $modeRequired
    $forbidden = @($modeForbidden)
    foreach ($otherNode in @("A", "B", "C") | Where-Object { $_ -ne $node }) {
      $forbidden += $nodeIds[$otherNode]
      $forbidden += "FIELD-NODE-$otherNode"
    }
    Assert-AsciiMarkers -Path $path -Required $required -Forbidden $forbidden
  }
}

Write-Host (
  "RELEASE_SAFETY_OK path={0} nodes={1} sensor_mode={2} rtcm={3} battery={4} final_acceptance={5} source={6} files={7}" -f `
    $artifactRoot,
    ($NodeLabels -join ","),
    $ExpectedFieldSensorMode,
    $ExpectedGnssRtcmInjectionMode,
    $ExpectedBatteryCalibrationState,
    [bool]$RequireFinalBatteryAcceptance,
    $manifest.sourceCommit,
    $manifestEntries.Count
)
