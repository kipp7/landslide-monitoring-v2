[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,

  [Parameter(Mandatory = $true)]
  [string]$FirmwareArtifactDirectory,

  [Parameter(Mandatory = $true)]
  [string]$FirmwareMarker,

  [string]$FirmwareAssetName = "",
  [string]$SourceAssetName = "",
  [string]$ValidationDocument = "docs\field-tests\xls1-compact-broadcast-poll-v2.md",
  [string]$OutputDirectory = "",
  [string]$GitHubRepository = "kipp7/landslide-monitoring-v2",
  [switch]$Upload,
  [switch]$Clobber,
  [switch]$AllowDirtySource
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceRoot = Join-Path $repoRoot "firmware\rk2206-xl01"
$artifactRoot = (Resolve-Path $FirmwareArtifactDirectory).Path
$sourceCommit = (git -C $repoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $sourceCommit) {
  throw "Unable to resolve the source commit."
}
$sourceStatus = @(git -C $repoRoot status --porcelain -- firmware/rk2206-xl01 scripts/firmware scripts/field docs/field-tests)
$sourceTreeDirty = $sourceStatus.Count -gt 0
if ($sourceTreeDirty -and -not $AllowDirtySource) {
  throw "Release source inputs have uncommitted changes. Commit them before packaging, or use -AllowDirtySource only for a local smoke test."
}
if ($Upload -and $sourceTreeDirty) {
  throw "Uploading a source package from a dirty working tree is not allowed."
}

if (-not $FirmwareAssetName) {
  $FirmwareAssetName = "RK2206-Field-Nodes-ABC-$ReleaseTag.zip"
}
if (-not $SourceAssetName) {
  $SourceAssetName = "OpenHarmony-Source-$ReleaseTag.zip"
}
foreach ($assetName in @($FirmwareAssetName, $SourceAssetName)) {
  if ([IO.Path]::GetFileName($assetName) -ne $assetName -or -not $assetName.EndsWith(".zip", [StringComparison]::OrdinalIgnoreCase)) {
    throw "Asset names must be plain .zip filenames: $assetName"
  }
}
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $repoRoot ("artifacts\releases\" + $ReleaseTag)
}
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) ("lsmv2-rk2206-release-" + [guid]::NewGuid().ToString("N"))

function Write-Utf8File {
  param([string]$Path, [string]$Content)
  [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function Copy-RequiredFile {
  param([string]$Source, [string]$Destination)
  if (-not (Test-Path -LiteralPath $Source -PathType Leaf)) {
    throw "Required release input is missing: $Source"
  }
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Destination) | Out-Null
  Copy-Item -LiteralPath $Source -Destination $Destination -Force
}

function Write-FileManifest {
  param(
    [string]$Root,
    [string]$Path,
    [hashtable]$Metadata
  )
  $files = Get-ChildItem -LiteralPath $Root -File -Recurse |
    Where-Object FullName -ne $Path |
    Sort-Object FullName
  $manifest = [ordered]@{
    schemaVersion = 1
    releaseTag = $ReleaseTag
    sourceCommit = $sourceCommit
    sourceTreeDirty = $sourceTreeDirty
    firmwareMarker = $FirmwareMarker
    metadata = $Metadata
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    files = @($files | ForEach-Object {
      [ordered]@{
        path = $_.FullName.Substring($Root.Length + 1).Replace("\", "/")
        bytes = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    })
  }
  Write-Utf8File -Path $Path -Content (($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine)
}

function Test-Manifest {
  param([string]$Root, [string]$ManifestPath)
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  foreach ($entry in $manifest.files) {
    $relative = [string]$entry.path -replace "/", [IO.Path]::DirectorySeparatorChar
    $path = Join-Path $Root $relative
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Manifest file is missing: $($entry.path)"
    }
    $actual = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actual -ne [string]$entry.sha256) {
      throw "Manifest hash mismatch: $($entry.path)"
    }
  }
}

function New-DirectoryZip {
  param([string]$Directory, [string]$ZipPath)
  if (Test-Path -LiteralPath $ZipPath -PathType Leaf) {
    [IO.File]::Delete($ZipPath)
  }
  Compress-Archive -LiteralPath $Directory -DestinationPath $ZipPath -CompressionLevel Optimal
  if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf)) {
    throw "ZIP creation failed: $ZipPath"
  }
}

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
  throw "RK2206 XL01 source is missing: $sourceRoot"
}
$configPath = Join-Path $sourceRoot "config\app_config.h"
$configText = Get-Content -LiteralPath $configPath -Raw
if ($configText -notmatch '#define\s+DEVICE_SECRET\s+"CHANGE_ME_DEVICE_SECRET"') {
  throw "Public source packaging requires the DEVICE_SECRET placeholder."
}
$markerMatches = Get-ChildItem -LiteralPath $sourceRoot -File -Recurse -Include *.c,*.h,*.md |
  Select-String -SimpleMatch $FirmwareMarker
if (-not $markerMatches) {
  throw "Firmware marker is not present in the source tree: $FirmwareMarker"
}
$credentialFiles = Get-ChildItem -LiteralPath $sourceRoot -File -Recurse | Where-Object {
  $_.Name -match '(^|\.)env($|\.)|\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|id_ed25519'
}
if ($credentialFiles) {
  throw "Credential-like files are not allowed in the public source package: $($credentialFiles.Name -join ', ')"
}

$firmwareInputs = Get-ChildItem -LiteralPath $artifactRoot -File | Where-Object {
  $_.Extension -in ".img", ".bin", ".json", ".md", ".txt"
}
if (-not ($firmwareInputs | Where-Object Extension -eq ".img")) {
  throw "Firmware artifact directory contains no IMG files."
}
if (-not ($firmwareInputs | Where-Object Extension -eq ".bin")) {
  throw "Firmware artifact directory contains no BIN files."
}
$artifactManifest = Join-Path $artifactRoot "manifest.json"
if (Test-Path -LiteralPath $artifactManifest -PathType Leaf) {
  $artifactMetadata = Get-Content -LiteralPath $artifactManifest -Raw | ConvertFrom-Json
  if ($artifactMetadata.firmwareMarker -and $artifactMetadata.firmwareMarker -ne $FirmwareMarker) {
    throw "Firmware artifact marker does not match the requested source marker."
  }
}

New-Item -ItemType Directory -Force -Path $outputRoot, $stagingRoot | Out-Null
try {
  $firmwarePackageName = [IO.Path]::GetFileNameWithoutExtension($FirmwareAssetName)
  $firmwareStage = Join-Path $stagingRoot $firmwarePackageName
  New-Item -ItemType Directory -Force -Path $firmwareStage | Out-Null
  foreach ($file in $firmwareInputs) {
    Copy-Item -LiteralPath $file.FullName -Destination (Join-Path $firmwareStage $file.Name) -Force
  }
  $firmwareManifestPath = Join-Path $firmwareStage "release-manifest.json"
  Write-FileManifest -Root $firmwareStage -Path $firmwareManifestPath -Metadata @{
    kind = "rk2206-firmware-binaries"
    sourceAsset = $SourceAssetName
  }
  Test-Manifest -Root $firmwareStage -ManifestPath $firmwareManifestPath

  $sourcePackageName = [IO.Path]::GetFileNameWithoutExtension($SourceAssetName)
  $sourceStage = Join-Path $stagingRoot $sourcePackageName
  $repositoryStage = Join-Path $sourceStage "repository"
  $vendorStage = Join-Path $sourceStage "vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.1"
  New-Item -ItemType Directory -Force -Path (Join-Path $repositoryStage "firmware"), (Split-Path -Parent $vendorStage) | Out-Null
  Copy-Item -LiteralPath $sourceRoot -Destination (Join-Path $repositoryStage "firmware\rk2206-xl01") -Recurse
  Copy-Item -LiteralPath $sourceRoot -Destination $vendorStage -Recurse

  Copy-RequiredFile -Source (Join-Path $repoRoot "scripts\firmware\build-xl01-compact-broadcast-v2.ps1") -Destination (Join-Path $repositoryStage "scripts\firmware\build-xl01-compact-broadcast-v2.ps1")
  Copy-RequiredFile -Source (Join-Path $repoRoot "scripts\field\compact_telemetry_codec_test.py") -Destination (Join-Path $repositoryStage "scripts\field\compact_telemetry_codec_test.py")
  Copy-RequiredFile -Source (Join-Path $repoRoot "scripts\field\xls1_three_node_batch_poll.py") -Destination (Join-Path $repositoryStage "scripts\field\xls1_three_node_batch_poll.py")
  Copy-RequiredFile -Source (Join-Path $repoRoot "LICENSE") -Destination (Join-Path $sourceStage "LICENSE")
  if ($ValidationDocument) {
    $validationSource = Join-Path $repoRoot $ValidationDocument
    Copy-RequiredFile -Source $validationSource -Destination (Join-Path $repositoryStage $ValidationDocument)
  }

  $sourceReadme = @"
# RK2206 XL01 OpenHarmony source package

Release: $ReleaseTag
Source commit: $sourceCommit
Firmware marker: $FirmwareMarker

This archive is the mandatory source companion for $FirmwareAssetName.

- Repository source: `repository/firmware/rk2206-xl01/`
- OpenHarmony vendor-ready copy: `vendor/isoftstone/rk2206/samples/xl01_landslide_monitor_v1.1/`
- A/B/C build entrypoint: `repository/scripts/firmware/build-xl01-compact-broadcast-v2.ps1`
- Per-file hashes: `manifest.json`

The public source keeps DEVICE_SECRET=CHANGE_ME_DEVICE_SECRET and contains no production .env, private key, or server credential.
"@
  Write-Utf8File -Path (Join-Path $sourceStage "README.md") -Content ($sourceReadme + [Environment]::NewLine)
  $sourceManifestPath = Join-Path $sourceStage "manifest.json"
  Write-FileManifest -Root $sourceStage -Path $sourceManifestPath -Metadata @{
    kind = "rk2206-openharmony-source"
    firmwareAsset = $FirmwareAssetName
    vendorRelativePath = "vendor/isoftstone/rk2206/samples/xl01_landslide_monitor_v1.1"
  }
  Test-Manifest -Root $sourceStage -ManifestPath $sourceManifestPath

  $firmwareZip = Join-Path $outputRoot $FirmwareAssetName
  $sourceZip = Join-Path $outputRoot $SourceAssetName
  New-DirectoryZip -Directory $firmwareStage -ZipPath $firmwareZip
  New-DirectoryZip -Directory $sourceStage -ZipPath $sourceZip

  $pair = [ordered]@{
    schemaVersion = 1
    releaseTag = $ReleaseTag
    sourceCommit = $sourceCommit
    sourceTreeDirty = $sourceTreeDirty
    firmwareMarker = $FirmwareMarker
    assets = @(
      [ordered]@{ kind = "firmware"; name = $FirmwareAssetName; bytes = (Get-Item $firmwareZip).Length; sha256 = (Get-FileHash $firmwareZip -Algorithm SHA256).Hash.ToLowerInvariant() },
      [ordered]@{ kind = "source"; name = $SourceAssetName; bytes = (Get-Item $sourceZip).Length; sha256 = (Get-FileHash $sourceZip -Algorithm SHA256).Hash.ToLowerInvariant() }
    )
  }
  $pairPath = Join-Path $outputRoot "release-pair.json"
  Write-Utf8File -Path $pairPath -Content (($pair | ConvertTo-Json -Depth 6) + [Environment]::NewLine)

  if ($Upload) {
    $existingRelease = gh release view $ReleaseTag --repo $GitHubRepository --json tagName 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $existingRelease) {
      throw "GitHub Release does not exist: $ReleaseTag"
    }
    $uploadArguments = @("release", "upload", $ReleaseTag, $firmwareZip, $sourceZip, "--repo", $GitHubRepository)
    if ($Clobber) { $uploadArguments += "--clobber" }
    & gh @uploadArguments
    if ($LASTEXITCODE -ne 0) { throw "GitHub Release upload failed." }
  }

  $pair | ConvertTo-Json -Depth 6
} finally {
  if (Test-Path -LiteralPath $stagingRoot -PathType Container) {
    [IO.Directory]::Delete($stagingRoot, $true)
  }
}
