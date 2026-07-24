[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ArtifactDirectory = "",
  [switch]$KeepSdkExperimentSource
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceRoot = Join-Path $repoRoot "firmware\rk2206-xl01"
$sampleRelative = "vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.1"
$sampleRoot = Join-Path $SdkRoot $sampleRelative
$productOut = Join-Path $SdkRoot "out\rk2206\isoftstone-rk2206"
if (-not $ArtifactDirectory) {
  $ArtifactDirectory = Join-Path $repoRoot "artifacts\firmware\rk2206-xl01-compact-broadcast-v2"
}
$artifactRoot = [System.IO.Path]::GetFullPath($ArtifactDirectory)
$backupRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("xls1-compact-sdk-backup-" + [guid]::NewGuid().ToString("N"))

$syncFiles = @(
  "BUILD.gn",
  "config\app_config.h",
  "main\landslide_main.c",
  "drivers\xl01\xl01_driver.c",
  "app\compact_telemetry_builder.c",
  "app\compact_telemetry_builder.h",
  "app\compact_poll_command.c",
  "app\compact_poll_command.h"
)

$nodes = @(
  @{ Label = "A"; Suffix = "0001"; DeviceId = "00000000-0000-0000-0000-000000000001"; InstallLabel = "FIELD-NODE-A" },
  @{ Label = "B"; Suffix = "0002"; DeviceId = "00000000-0000-0000-0000-000000000002"; InstallLabel = "FIELD-NODE-B" },
  @{ Label = "C"; Suffix = "0003"; DeviceId = "00000000-0000-0000-0000-000000000003"; InstallLabel = "FIELD-NODE-C" }
)

function Set-SingleMacro {
  param(
    [string]$Text,
    [string]$Macro,
    [string]$Value
  )

  $pattern = "(?m)^#define\s+" + [regex]::Escape($Macro) + "\s+.*$"
  $matches = [regex]::Matches($Text, $pattern)
  if ($matches.Count -ne 1) {
    throw "Expected one $Macro definition, found $($matches.Count)"
  }
  return [regex]::Replace($Text, $pattern, "#define $Macro                `"$Value`"")
}

function Set-NodeIdentity {
  param([hashtable]$Node)

  $configPath = Join-Path $sampleRoot "config\app_config.h"
  $text = [System.IO.File]::ReadAllText($configPath)
  $text = Set-SingleMacro -Text $text -Macro "DEVICE_ID" -Value $Node.DeviceId
  $text = Set-SingleMacro -Text $text -Macro "INSTALL_LABEL" -Value $Node.InstallLabel
  $text = Set-SingleMacro -Text $text -Macro "LEGACY_NODE_LABEL" -Value $Node.Label
  [System.IO.File]::WriteAllText($configPath, $text, [System.Text.UTF8Encoding]::new($false))
}

function Copy-BuildOutputs {
  param([hashtable]$Node)

  $imageSource = Join-Path $productOut "images\Firmware.img"
  $liteOsSource = Join-Path $productOut "liteos.bin"
  $loaderSource = Join-Path $productOut "images\rk2206_db_loader.bin"
  foreach ($required in @($imageSource, $liteOsSource)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
      throw "Required build output is missing: $required"
    }
  }

  $imageTarget = Join-Path $artifactRoot ("rk2206-node-{0}-xls1-compact-broadcast-v2.img" -f $Node.Label)
  $liteOsTarget = Join-Path $artifactRoot ("rk2206-node-{0}-xls1-compact-broadcast-v2.bin" -f $Node.Label)
  Copy-Item -LiteralPath $imageSource -Destination $imageTarget -Force
  Copy-Item -LiteralPath $liteOsSource -Destination $liteOsTarget -Force
  if (Test-Path -LiteralPath $loaderSource -PathType Leaf) {
    Copy-Item -LiteralPath $loaderSource -Destination (Join-Path $artifactRoot "rk2206_db_loader.bin") -Force
  }
}

if (-not (Test-Path -LiteralPath $sampleRoot -PathType Container)) {
  throw "OpenHarmony sample is missing: $sampleRoot"
}
if (-not (docker inspect $ContainerName 2>$null)) {
  throw "Docker container is unavailable: $ContainerName"
}

New-Item -ItemType Directory -Force -Path $backupRoot, $artifactRoot | Out-Null
$originalFiles = @{}

try {
  foreach ($relative in $syncFiles) {
    $source = Join-Path $sourceRoot $relative
    $target = Join-Path $sampleRoot $relative
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
      throw "Experiment source is missing: $source"
    }

    $targetExists = Test-Path -LiteralPath $target -PathType Leaf
    $originalFiles[$relative] = $targetExists
    if ($targetExists) {
      $backup = Join-Path $backupRoot $relative
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $backup) | Out-Null
      Copy-Item -LiteralPath $target -Destination $backup -Force
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
    Copy-Item -LiteralPath $source -Destination $target -Force
  }

  foreach ($node in $nodes) {
    Set-NodeIdentity -Node $node
    Write-Host ("Building compact XLS1 firmware for node {0} ({1})" -f $node.Label, $node.DeviceId)
    docker exec $ContainerName bash -lc "cd /root/workspace/txsmartropenharmony && hb build -f"
    if ($LASTEXITCODE -ne 0) {
      throw "OpenHarmony build failed for node $($node.Label)"
    }
    Copy-BuildOutputs -Node $node
  }

  $files = Get-ChildItem -LiteralPath $artifactRoot -File |
    Where-Object Extension -in ".bin", ".img" |
    Sort-Object Name
  $manifest = [ordered]@{
    schemaVersion = 1
    profile = "rk2206-xl01-compact-broadcast-v2"
    firmwareMarker = "fw-compact-broadcast-poll-v2-20260724"
    compactPayloadBytes = 46
    fieldLinkWireBytes = 64
    compactPollCommandBytes = 10
    compactPollWireBytes = 28
    nodeSlotMs = 340
    rollbackRelease = "competition-suite-20260723"
    generatedAt = (Get-Date).ToUniversalTime().ToString("o")
    files = @($files | ForEach-Object {
      [ordered]@{
        name = $_.Name
        bytes = $_.Length
        sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
      }
    })
  }
  $manifestPath = Join-Path $artifactRoot "manifest.json"
  [System.IO.File]::WriteAllText(
    $manifestPath,
    (($manifest | ConvertTo-Json -Depth 8) + [Environment]::NewLine),
    [System.Text.UTF8Encoding]::new($false)
  )
  Write-Host "Artifacts: $artifactRoot"
  Write-Host "Manifest:  $manifestPath"
} finally {
  if (-not $KeepSdkExperimentSource) {
    foreach ($relative in $syncFiles) {
      $target = Join-Path $sampleRoot $relative
      if ($originalFiles[$relative]) {
        Copy-Item -LiteralPath (Join-Path $backupRoot $relative) -Destination $target -Force
      } elseif (Test-Path -LiteralPath $target -PathType Leaf) {
        [System.IO.File]::Delete($target)
      }
    }
  }

  if (Test-Path -LiteralPath $backupRoot -PathType Container) {
    [System.IO.Directory]::Delete($backupRoot, $true)
  }
}
