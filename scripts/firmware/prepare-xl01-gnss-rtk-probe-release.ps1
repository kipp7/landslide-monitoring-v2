[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ReleaseDirectory = "F:\2\openharmony\rk2206_firmware_releases\xl01_gnss_rtk_v31_probe_sensor_diag_v3_20260729",
  [string]$RollbackDirectory = "F:\2\openharmony\rk2206_firmware_releases\xl01_one_second_poll_v2_20260719"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$buildScript = Join-Path $PSScriptRoot "build-xl01-compact-broadcast-v2.ps1"
$releaseRoot = [System.IO.Path]::GetFullPath($ReleaseDirectory)
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$stagingRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $temporaryRoot ("rk2206-gnss-probe-release-" + [guid]::NewGuid().ToString("N")))
)
$nodes = @(
  @{ Label = "A"; DeviceId = "00000000-0000-0000-0000-000000000001"; InstallLabel = "FIELD-NODE-A" },
  @{ Label = "B"; DeviceId = "00000000-0000-0000-0000-000000000002"; InstallLabel = "FIELD-NODE-B" },
  @{ Label = "C"; DeviceId = "00000000-0000-0000-0000-000000000003"; InstallLabel = "FIELD-NODE-C" }
)

function Assert-BinaryContains {
  param(
    [string]$Path,
    [string[]]$Needles
  )

  $text = [System.Text.Encoding]::ASCII.GetString([System.IO.File]::ReadAllBytes($Path))
  foreach ($needle in $Needles) {
    if (-not $text.Contains($needle)) {
      throw "Binary verification failed: '$needle' is missing from $Path"
    }
  }
}

function Write-Utf8NoBom {
  param(
    [string]$Path,
    [string]$Text
  )

  [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

if (Test-Path -LiteralPath $releaseRoot) {
  throw "Release directory already exists; refusing to mix or overwrite firmware: $releaseRoot"
}
if (-not (Test-Path -LiteralPath $RollbackDirectory -PathType Container)) {
  throw "Rollback release is missing: $RollbackDirectory"
}
if (-not $stagingRoot.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Staging path escaped the system temporary directory: $stagingRoot"
}

try {
  & $buildScript `
    -SdkRoot $SdkRoot `
    -ContainerName $ContainerName `
    -ArtifactDirectory $stagingRoot `
    -GnssRtcmInjectionMode probe `
    -NodeLabels @("A", "B", "C")
  if (-not $?) {
    throw "RK2206 A/B/C PROBE build failed"
  }

  $buildManifestPath = Join-Path $stagingRoot "manifest.json"
  if (-not (Test-Path -LiteralPath $buildManifestPath -PathType Leaf)) {
    throw "Build manifest is missing: $buildManifestPath"
  }
  $buildManifest = Get-Content -Raw -LiteralPath $buildManifestPath | ConvertFrom-Json
  if ($buildManifest.gnssRtcmInjectionMode -ne "probe") {
    throw "Build manifest is not a PROBE build"
  }

  foreach ($node in $nodes) {
    $sourceBin = Join-Path $stagingRoot ("rk2206-node-{0}-xls1-compact-broadcast-v2.bin" -f $node.Label)
    $sourceImage = Join-Path $stagingRoot ("rk2206-node-{0}-xls1-compact-broadcast-v2.img" -f $node.Label)
    foreach ($required in @($sourceBin, $sourceImage, (Join-Path $stagingRoot "rk2206_db_loader.bin"))) {
      if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
        throw "Required build output is missing: $required"
      }
    }
    Assert-BinaryContains -Path $sourceBin -Needles @(
      $node.DeviceId,
      $node.InstallLabel,
      $buildManifest.firmwareMarker,
      $buildManifest.sampleVersion,
      "PROBE (no GNSS UART writes)"
    )
  }

  New-Item -ItemType Directory -Path $releaseRoot | Out-Null
  foreach ($node in $nodes) {
    $nodeRoot = Join-Path $releaseRoot $node.Label
    New-Item -ItemType Directory -Path $nodeRoot | Out-Null
    Copy-Item -LiteralPath (
      Join-Path $stagingRoot ("rk2206-node-{0}-xls1-compact-broadcast-v2.img" -f $node.Label)
    ) -Destination (Join-Path $nodeRoot "Firmware.img")
    Copy-Item -LiteralPath (
      Join-Path $stagingRoot ("rk2206-node-{0}-xls1-compact-broadcast-v2.bin" -f $node.Label)
    ) -Destination (Join-Path $nodeRoot "liteos.bin")
    Copy-Item -LiteralPath (Join-Path $stagingRoot "rk2206_db_loader.bin") `
      -Destination (Join-Path $nodeRoot "rk2206_db_loader.bin")
  }

  $binaryFiles = Get-ChildItem -LiteralPath $releaseRoot -Recurse -File |
    Where-Object Extension -in ".bin", ".img" |
    Sort-Object FullName
  $manifestFiles = @($binaryFiles | ForEach-Object {
    $relative = $_.FullName.Substring($releaseRoot.Length + 1).Replace("\", "/")
    [ordered]@{
      path = $relative
      bytes = $_.Length
      sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
    }
  })
  $sourceCommit = (git -C $repoRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $sourceCommit) {
    throw "Cannot determine source commit"
  }
  $releaseManifest = [ordered]@{
    schemaVersion = 1
    profile = "rk2206-xl01-gnss-rtk-v31-probe-sensor-diag-v3"
    sourceCommit = $sourceCommit
    gnssRtcmInjectionMode = "probe"
    firmwareMarker = $buildManifest.firmwareMarker
    sampleVersion = $buildManifest.sampleVersion
    nodes = @($nodes | ForEach-Object { $_.Label })
    rollbackDirectory = [System.IO.Path]::GetFullPath($RollbackDirectory)
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    files = $manifestFiles
  }
  Write-Utf8NoBom -Path (Join-Path $releaseRoot "manifest.json") -Text (
    ($releaseManifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine
  )

  $checksumLines = @($manifestFiles | ForEach-Object {
    "{0}  {1}" -f $_.sha256.ToUpperInvariant(), $_.path
  })
  Write-Utf8NoBom -Path (Join-Path $releaseRoot "SHA256SUMS.txt") -Text (
    ($checksumLines -join [Environment]::NewLine) + [Environment]::NewLine
  )

  $readme = @"
RK2206 A/B/C GNSS RTK V3.1 PROBE release

Purpose:
- Validate XL01 RTCM receive, fragmentation, reassembly, CRC24Q and bounded queues.
- Report PROBE V2 per-message-type and field-link loss diagnostics.
- Report PROBE V3 diagnostics for the deployed UM220-IV NK, RS-ECTH-N01-TR-1
  base/EC paths and RS-DIP-N01-1 tilt path.
- Return a 24-byte recent-completion bitmap ACK for bounded selective retry.
- Absorb short scheduler stalls with a four-frame newest-first RTCM queue.
- PROBE never writes RTCM to the UM220 GNSS UART.
- SHT30, MPU6050 and rain are not installed/enabled production sensor paths.

Directory layout:
- A/B/C/Firmware.img: packaged image from that node's full hb build -f run.
- A/B/C/liteos.bin: application binary from the same node build.
- A/B/C/rk2206_db_loader.bin: common RK2206 loader.
- manifest.json and SHA256SUMS.txt: identity and integrity evidence.

Flash order:
1. Flash A/B/C from their matching directories in one maintenance operation.
2. Power all three nodes and verify their identities remain A/B/C.
3. Run the RK3568 closed-loop gate against A first, then B and C.

Important:
- Use the same proven HiBurn image/address procedure as the previous release.
- Do not mix Firmware.img or liteos.bin between A, B and C.
- Do not use LIVE mode from any temporary build directory.
- Verify the boot log says: RTCM Injection: PROBE (no GNSS UART writes).

Rollback release:
$([System.IO.Path]::GetFullPath($RollbackDirectory))

Source commit:
$sourceCommit
"@
  Write-Utf8NoBom -Path (Join-Path $releaseRoot "README.txt") -Text ($readme + [Environment]::NewLine)

  Write-Host "PROBE release ready: $releaseRoot"
  Write-Host "Flash A/B/C from their matching directories, then run the RK3568 gate A -> B -> C."
} catch {
  if (Test-Path -LiteralPath $releaseRoot -PathType Container) {
    $releasePath = [System.IO.Path]::GetFullPath($releaseRoot)
    $releaseParent = [System.IO.Path]::GetFullPath((Split-Path -Parent $releaseRoot))
    if ($releasePath.StartsWith($releaseParent + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
      [System.IO.Directory]::Delete($releasePath, $true)
    }
  }
  throw
} finally {
  if (Test-Path -LiteralPath $stagingRoot -PathType Container) {
    $stagingPath = [System.IO.Path]::GetFullPath($stagingRoot)
    if ($stagingPath.StartsWith($temporaryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      [System.IO.Directory]::Delete($stagingPath, $true)
    }
  }
}
