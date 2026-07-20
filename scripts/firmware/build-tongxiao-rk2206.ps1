[CmdletBinding()]
param(
  [string]$OpenHarmonyRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$ContainerName = "openharmony-dev",
  [string]$ArtifactDirectory = "",
  [string]$CredentialFile = "",
  [string]$FirmwareVersion = "",
  [switch]$CheckOnly,
  [switch]$EnableVoice,
  [switch]$ConfirmNoActiveXl01Flash
)

$ErrorActionPreference = "Stop"

function Assert-PathInsideRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Path
  )

  $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  $pathFull = [IO.Path]::GetFullPath($Path)
  if (-not $pathFull.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing filesystem operation outside OpenHarmony root: $pathFull"
  }
}

function Assert-FirmwareSourceSynced {
  param(
    [Parameter(Mandatory = $true)][string]$SourceRoot,
    [Parameter(Mandatory = $true)][string]$VendorRoot
  )

  $sourceFiles = @((Get-Item -LiteralPath (Join-Path $SourceRoot "BUILD.gn")))
  foreach ($directory in @("config", "include", "src")) {
    $sourceFiles += Get-ChildItem -LiteralPath (Join-Path $SourceRoot $directory) -Recurse -File
  }

  foreach ($sourceFile in $sourceFiles) {
    $sourcePrefix = [IO.Path]::GetFullPath($SourceRoot).TrimEnd('\') + '\'
    $relative = $sourceFile.FullName.Substring($sourcePrefix.Length)
    $vendorFile = Join-Path $VendorRoot $relative
    if (-not (Test-Path -LiteralPath $vendorFile -PathType Leaf)) {
      throw "Vendor firmware file is missing: $vendorFile"
    }

    $sourceHash = (Get-FileHash -LiteralPath $sourceFile.FullName -Algorithm SHA256).Hash
    $vendorHash = (Get-FileHash -LiteralPath $vendorFile -Algorithm SHA256).Hash
    if ($sourceHash -ne $vendorHash) {
      throw "Main-repo and vendor firmware differ: $relative"
    }
  }
}

function Read-EnvMap {
  param([Parameter(Mandatory = $true)][string]$Path)

  $result = @{}
  foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    $separator = $trimmed.IndexOf("=")
    if ($separator -lt 1) { continue }
    $result[$trimmed.Substring(0, $separator).Trim()] = $trimmed.Substring($separator + 1).Trim()
  }
  return $result
}

$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$artifactDirectoryValue = if ([string]::IsNullOrWhiteSpace($ArtifactDirectory)) {
  Join-Path $repoRoot "artifacts\firmware\rk2206-tongxiao-alarm"
} else {
  $ArtifactDirectory
}
$credentialFileValue = if ([string]::IsNullOrWhiteSpace($CredentialFile)) {
  Join-Path $repoRoot ".tmp\tongxiao-alarm.credentials.env"
} else {
  $CredentialFile
}
$openHarmonyRootFull = (Resolve-Path -LiteralPath $OpenHarmonyRoot).Path
$sourceRoot = Join-Path $repoRoot "firmware\rk2206-tongxiao-alarm"
$vendorRoot = Join-Path $openHarmonyRootFull "vendor\isoftstone\rk2206\samples\rk2206_tongxiao_alarm"
$lcdDriverRoot = Join-Path $openHarmonyRootFull "vendor\isoftstone\rk2206\samples\landslide_monitor"
$sampleBuildFile = Join-Path $openHarmonyRootFull "vendor\isoftstone\rk2206\samples\BUILD.gn"
$sdkMakefile = Join-Path $openHarmonyRootFull "device\rockchip\rk2206\sdk_liteos\Makefile"
$alarmConfigFile = Join-Path $vendorRoot "config\alarm_config.h"
$productOut = Join-Path $openHarmonyRootFull "out\rk2206\isoftstone-rk2206"
$artifactDirectoryFull = [IO.Path]::GetFullPath($artifactDirectoryValue)
$sourceConfigText = [IO.File]::ReadAllText((Join-Path $sourceRoot "config\alarm_config.h"))
$sourceVersionMatch = [regex]::Match(
  $sourceConfigText,
  '(?m)^#define TONGXIAO_FIRMWARE_VERSION "([^"]+)"$'
)
if (-not $sourceVersionMatch.Success) {
  throw "Cannot read the source Tongxiao firmware version."
}
$sourceFirmwareVersion = $sourceVersionMatch.Groups[1].Value
$effectiveFirmwareVersion = if ([string]::IsNullOrWhiteSpace($FirmwareVersion)) {
  $sourceFirmwareVersion
} else {
  $FirmwareVersion.Trim()
}
if ($effectiveFirmwareVersion -notmatch '^[0-9A-Za-z][0-9A-Za-z._-]{0,31}$') {
  throw "FirmwareVersion must be 1-32 ASCII letters, digits, dots, underscores or hyphens."
}

foreach ($lcdDependency in @("src\lcd.c", "include\lcd.h", "include\lcd_font.h")) {
  $lcdDependencyPath = Join-Path $lcdDriverRoot $lcdDependency
  if (-not (Test-Path -LiteralPath $lcdDependencyPath -PathType Leaf)) {
    throw "Tongxiao Chinese LCD dependency is missing: $lcdDependencyPath"
  }
}

Assert-FirmwareSourceSynced -SourceRoot $sourceRoot -VendorRoot $vendorRoot

if (-not (Test-Path -LiteralPath $credentialFileValue -PathType Leaf)) {
  throw "Missing Tongxiao credential file. Run scripts/firmware/provision-tongxiao-production.ps1 first: $credentialFileValue"
}
$credentialMap = Read-EnvMap -Path $credentialFileValue
$deviceSecret = [string]$credentialMap["TONGXIAO_MQTT_PASSWORD"]
$wifiSsid = [string]$credentialMap["TONGXIAO_WIFI_SSID"]
$wifiPassword = [string]$credentialMap["TONGXIAO_WIFI_PASSWORD"]
$mqttHost = [string]$credentialMap["TONGXIAO_MQTT_HOST"]
if ($credentialMap["TONGXIAO_DEVICE_ID"] -ne "00000000-0000-4000-8000-000000022206") {
  throw "Credential device ID does not match the Tongxiao firmware device ID."
}
if ([string]::IsNullOrWhiteSpace($wifiSsid) -or [string]::IsNullOrWhiteSpace($wifiPassword)) {
  throw "Tongxiao Wi-Fi SSID/password must be present in the ignored credential file."
}
if ([string]::IsNullOrWhiteSpace($mqttHost)) {
  throw "Tongxiao MQTT host must be present in the ignored credential file."
}
if ($deviceSecret -notmatch '^[0-9a-fA-F]{64}$') {
  throw "Tongxiao device secret must be a 64-character hexadecimal value."
}

$runningBuild = & docker exec $ContainerName bash -lc "ps -eo pid,cmd | grep -E '[h]b build|[n]inja.*isoftstone-rk2206' || true"
if ($LASTEXITCODE -ne 0) {
  throw "Cannot inspect build processes in container '$ContainerName'."
}
if (($runningBuild | Out-String).Trim().Length -gt 0) {
  throw "Another OpenHarmony hb/ninja build is active. Tongxiao build was not started."
}

$xl01Feature = '        "./xl01_landslide_monitor_v1.1:xl01_landslide_monitor"'
$tongxiaoFeature = '        "./rk2206_tongxiao_alarm:rk2206_tongxiao_alarm"'
$xl01Libraries = 'hardware_LIBS = -lhal_iothardware -lhardware -lxl01_landslide_monitor_v1.1'
$tongxiaoLibraries = 'hardware_LIBS = -lhal_iothardware -lhardware -lrk2206_tongxiao_alarm'

$sampleBuildText = [IO.File]::ReadAllText($sampleBuildFile)
$sdkMakefileText = [IO.File]::ReadAllText($sdkMakefile)
if (-not $sampleBuildText.Contains($xl01Feature)) {
  throw "Expected XL01 v1.1 baseline feature is not active; refusing an ambiguous selector rewrite."
}
if (-not $sdkMakefileText.Contains($xl01Libraries)) {
  throw "Expected XL01 v1.1 baseline library is not active; refusing an ambiguous Makefile rewrite."
}

Write-Host "Tongxiao preflight passed: source is synced and no hb/ninja build is active."
Write-Host "Tongxiao credential is present for the fixed production device (secret not printed)."
Write-Host "Tongxiao build profile: firmware=$effectiveFirmwareVersion voice=$([bool]$EnableVoice)."
if ($CheckOnly) {
  return
}
if (-not $ConfirmNoActiveXl01Flash) {
  throw "XL01 and Tongxiao share out/. Re-run with -ConfirmNoActiveXl01Flash only after XL01 flashing has fully stopped."
}

$tempRoot = Join-Path $openHarmonyRootFull (".tmp\tongxiao-build-" + [guid]::NewGuid().ToString("N"))
$outputBackup = Join-Path $tempRoot "previous-product-out"
$lockPath = Join-Path $openHarmonyRootFull ".tmp\tongxiao-build.lock"
$lockStream = $null
$lockCreated = $false
$ownsProductOut = $false
$originalProductOutMoved = $false
$originalProductOutCopied = $false
$sampleBuildPatched = $false
$sdkMakefilePatched = $false
$alarmConfigPatched = $false
$originalSampleBuildBytes = [IO.File]::ReadAllBytes($sampleBuildFile)
$originalSdkMakefileBytes = [IO.File]::ReadAllBytes($sdkMakefile)
$originalAlarmConfigBytes = [IO.File]::ReadAllBytes($alarmConfigFile)
$alarmConfigText = [IO.File]::ReadAllText($alarmConfigFile)
$emptySsidLine = '#define TONGXIAO_WIFI_SSID ""'
$emptyWifiPasswordLine = '#define TONGXIAO_WIFI_PASSWORD ""'
$emptyMqttHostLine = '#define TONGXIAO_MQTT_HOST ""'
$emptyPasswordLine = '#define TONGXIAO_MQTT_PASSWORD ""'
$sourceVersionLine = "#define TONGXIAO_FIRMWARE_VERSION `"$sourceFirmwareVersion`""
$voiceDisabledLine = '#define TONGXIAO_VOICE_ENABLED 0'
foreach ($placeholder in @($emptySsidLine, $emptyWifiPasswordLine, $emptyMqttHostLine, $emptyPasswordLine)) {
  if (-not $alarmConfigText.Contains($placeholder)) {
    throw "Vendor alarm_config.h does not contain the expected empty credential placeholder: $placeholder"
  }
}
if (-not $alarmConfigText.Contains($sourceVersionLine)) {
  throw "Vendor alarm_config.h does not contain the expected firmware version line."
}
if (-not $alarmConfigText.Contains($voiceDisabledLine)) {
  throw "Vendor alarm_config.h must default to disabled voice before a profile build."
}
$hadProductOut = Test-Path -LiteralPath $productOut

try {
  New-Item -ItemType Directory -Path (Split-Path -Parent $lockPath) -Force | Out-Null
  $lockStream = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $lockCreated = $true
  New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

  Assert-PathInsideRoot -Root $openHarmonyRootFull -Path $productOut
  Assert-PathInsideRoot -Root $openHarmonyRootFull -Path $outputBackup
  if ($hadProductOut) {
    try {
      Move-Item -LiteralPath $productOut -Destination $outputBackup
      $originalProductOutMoved = $true
    } catch {
      Write-Warning "Cannot rename the shared output directory; using copy-and-restore fallback."
      Copy-Item -LiteralPath $productOut -Destination $outputBackup -Recurse -Force
      $originalProductOutCopied = $true
    }
  }
  $ownsProductOut = -not $originalProductOutCopied

  $sampleBuildPatched = $true
  [IO.File]::WriteAllText($sampleBuildFile, $sampleBuildText.Replace($xl01Feature, $tongxiaoFeature))
  $sdkMakefilePatched = $true
  [IO.File]::WriteAllText($sdkMakefile, $sdkMakefileText.Replace($xl01Libraries, $tongxiaoLibraries))
  $alarmConfigPatched = $true
  $alarmConfigText = $alarmConfigText.Replace($emptySsidLine, "#define TONGXIAO_WIFI_SSID `"$wifiSsid`"")
  $alarmConfigText = $alarmConfigText.Replace($emptyWifiPasswordLine, "#define TONGXIAO_WIFI_PASSWORD `"$wifiPassword`"")
  $alarmConfigText = $alarmConfigText.Replace($emptyMqttHostLine, "#define TONGXIAO_MQTT_HOST `"$mqttHost`"")
  $alarmConfigText = $alarmConfigText.Replace($emptyPasswordLine, "#define TONGXIAO_MQTT_PASSWORD `"$deviceSecret`"")
  $alarmConfigText = $alarmConfigText.Replace(
    $sourceVersionLine,
    "#define TONGXIAO_FIRMWARE_VERSION `"$effectiveFirmwareVersion`""
  )
  if ($EnableVoice) {
    $alarmConfigText = $alarmConfigText.Replace($voiceDisabledLine, '#define TONGXIAO_VOICE_ENABLED 1')
  }
  [IO.File]::WriteAllText(
    $alarmConfigFile,
    $alarmConfigText
  )

  & docker exec $ContainerName bash -lc "cd /root/workspace/txsmartropenharmony && hb build -f"
  if ($LASTEXITCODE -ne 0) {
    throw "Tongxiao OpenHarmony build failed with exit code $LASTEXITCODE."
  }

  $firmwareImage = Join-Path $productOut "images\Firmware.img"
  $liteOsImage = Join-Path $productOut "liteos.bin"
  $loaderImage = Join-Path $productOut "images\rk2206_db_loader.bin"
  foreach ($image in @($firmwareImage, $liteOsImage, $loaderImage)) {
    if (-not (Test-Path -LiteralPath $image -PathType Leaf)) {
      throw "Expected build artifact is missing: $image"
    }
  }

  New-Item -ItemType Directory -Path $artifactDirectoryFull -Force | Out-Null
  $firmwareArchive = Join-Path $artifactDirectoryFull "Firmware-tongxiao-alarm-rk2206.img"
  $liteOsArchive = Join-Path $artifactDirectoryFull "liteos-tongxiao-alarm-rk2206.bin"
  $loaderArchive = Join-Path $artifactDirectoryFull "rk2206_db_loader.bin"
  Copy-Item -LiteralPath $firmwareImage -Destination $firmwareArchive -Force
  Copy-Item -LiteralPath $liteOsImage -Destination $liteOsArchive -Force
  Copy-Item -LiteralPath $loaderImage -Destination $loaderArchive -Force

  $hashLines = @(
    "SHA256  $((Get-FileHash -LiteralPath $firmwareArchive -Algorithm SHA256).Hash)  $([IO.Path]::GetFileName($firmwareArchive))",
    "SHA256  $((Get-FileHash -LiteralPath $liteOsArchive -Algorithm SHA256).Hash)  $([IO.Path]::GetFileName($liteOsArchive))",
    "SHA256  $((Get-FileHash -LiteralPath $loaderArchive -Algorithm SHA256).Hash)  $([IO.Path]::GetFileName($loaderArchive))"
  )
  [IO.File]::WriteAllLines((Join-Path $artifactDirectoryFull "SHA256SUMS.txt"), $hashLines)

  $metadata = [ordered]@{
    role = "tongxiao_alarm_terminal"
    board = "rk2206"
    os = "OpenHarmony LiteOS-M"
    built_at = [DateTimeOffset]::Now.ToString("o")
    source = "firmware/rk2206-tongxiao-alarm"
    firmware_version = $effectiveFirmwareVersion
    voice_enabled = [bool]$EnableVoice
  }
  [IO.File]::WriteAllText(
    (Join-Path $artifactDirectoryFull "build-metadata.json"),
    ($metadata | ConvertTo-Json) + [Environment]::NewLine
  )

  Write-Host "Tongxiao artifacts archived separately at: $artifactDirectoryFull"
}
finally {
  $cleanupErrors = New-Object 'System.Collections.Generic.List[string]'

  try {
    if ($sampleBuildPatched) {
      [IO.File]::WriteAllBytes($sampleBuildFile, $originalSampleBuildBytes)
    }
  } catch {
    $cleanupErrors.Add("Cannot restore samples/BUILD.gn: $($_.Exception.Message)") | Out-Null
  }
  try {
    if ($sdkMakefilePatched) {
      [IO.File]::WriteAllBytes($sdkMakefile, $originalSdkMakefileBytes)
    }
  } catch {
    $cleanupErrors.Add("Cannot restore sdk_liteos/Makefile: $($_.Exception.Message)") | Out-Null
  }
  try {
    if ($alarmConfigPatched) {
      [IO.File]::WriteAllBytes($alarmConfigFile, $originalAlarmConfigBytes)
    }
  } catch {
    $cleanupErrors.Add("Cannot restore vendor alarm_config.h: $($_.Exception.Message)") | Out-Null
  }

  try {
    if ($originalProductOutCopied -and (Test-Path -LiteralPath $productOut)) {
      Assert-PathInsideRoot -Root $openHarmonyRootFull -Path $productOut
      Assert-PathInsideRoot -Root $openHarmonyRootFull -Path $outputBackup
      foreach ($entry in Get-ChildItem -LiteralPath $productOut -Force) {
        Remove-Item -LiteralPath $entry.FullName -Recurse -Force
      }
      foreach ($entry in Get-ChildItem -LiteralPath $outputBackup -Force) {
        Copy-Item -LiteralPath $entry.FullName -Destination $productOut -Recurse -Force
      }
      Remove-Item -LiteralPath $outputBackup -Recurse -Force
    } elseif ($ownsProductOut -and (Test-Path -LiteralPath $productOut)) {
      Assert-PathInsideRoot -Root $openHarmonyRootFull -Path $productOut
      Remove-Item -LiteralPath $productOut -Recurse -Force
    }
  } catch {
    $cleanupErrors.Add("Cannot remove temporary Tongxiao product output: $($_.Exception.Message)") | Out-Null
  }
  try {
    if ($originalProductOutMoved -and (Test-Path -LiteralPath $outputBackup)) {
      Move-Item -LiteralPath $outputBackup -Destination $productOut
    }
  } catch {
    $cleanupErrors.Add("Cannot restore previous XL01 product output: $($_.Exception.Message)") | Out-Null
  }

  try {
    $backupStillExists = Test-Path -LiteralPath $outputBackup
    if ((Test-Path -LiteralPath $tempRoot) -and -not $backupStillExists) {
      Assert-PathInsideRoot -Root $openHarmonyRootFull -Path $tempRoot
      Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
    if ($backupStillExists) {
      $cleanupErrors.Add("XL01 output backup is preserved for recovery at: $outputBackup") | Out-Null
    }
  } catch {
    $cleanupErrors.Add("Cannot clean temporary build directory: $($_.Exception.Message)") | Out-Null
  }

  try {
    if ($null -ne $lockStream) {
      $lockStream.Dispose()
    }
  } catch {
    $cleanupErrors.Add("Cannot close Tongxiao build lock: $($_.Exception.Message)") | Out-Null
  }
  try {
    if ($lockCreated -and (Test-Path -LiteralPath $lockPath)) {
      Remove-Item -LiteralPath $lockPath -Force
    }
  } catch {
    $cleanupErrors.Add("Cannot remove Tongxiao build lock: $($_.Exception.Message)") | Out-Null
  }

  if ($cleanupErrors.Count -gt 0) {
    throw ($cleanupErrors -join [Environment]::NewLine)
  }
}
