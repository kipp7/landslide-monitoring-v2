[CmdletBinding()]
param(
  [string]$CloudApiBaseUrl = "http://134.175.187.208:8080",
  [string]$CloudMqttUrl = "mqtt://134.175.187.208:1883",
  [string]$Configuration = "Release",
  [string]$Runtime = "win-x64",
  [string]$PackageOutputDir = "artifacts/desk-win/win-x64-cloud-selfcontained",
  [string]$OutDir = "artifacts/desk-win/latest-cloud",
  [string]$OutZip = "artifacts/desk-win/latest-cloud.zip",
  [string]$InstallerOutputDir = "artifacts/desk-win/cloud-installer",
  [string]$Version = "0.1.0",
  [switch]$SkipDeskBuild,
  [switch]$SkipHealthCheck,
  [switch]$SkipLaunchVerify,
  [switch]$SkipInstaller
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-Step([string]$label, [scriptblock]$action) {
  Write-Host "==> $label" -ForegroundColor Cyan
  $global:LASTEXITCODE = 0
  & $action
  if ($LASTEXITCODE -ne 0) {
    throw "$label failed (exit=$LASTEXITCODE)"
  }
}

function Normalize-Url([string]$value) {
  $trimmed = $value.Trim()
  if ([string]::IsNullOrWhiteSpace($trimmed)) {
    throw "url must not be empty"
  }
  return $trimmed.TrimEnd("/")
}

function Get-HashEntry([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    return $null
  }

  $hash = Get-FileHash -LiteralPath $path -Algorithm SHA256
  return [ordered]@{
    path = $path
    sha256 = $hash.Hash.ToLowerInvariant()
    sizeBytes = (Get-Item -LiteralPath $path).Length
  }
}

function New-ZipArchiveFromDirectory {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SourceDir,
    [Parameter(Mandatory = $true)]
    [string]$DestinationZip
  )

  if (-not (Test-Path -LiteralPath $SourceDir)) {
    throw "archive source directory not found: $SourceDir"
  }

  if (Test-Path -LiteralPath $DestinationZip) {
    Remove-Item -LiteralPath $DestinationZip -Force
  }

  $tarCommand = Get-Command "tar.exe" -ErrorAction SilentlyContinue
  if ($tarCommand) {
    & $tarCommand.Source -a -cf $DestinationZip -C $SourceDir .
    if ($LASTEXITCODE -ne 0) {
      throw "tar.exe failed while creating cloud delivery zip (exit=$LASTEXITCODE)"
    }
  } else {
    Compress-Archive -Path (Join-Path $SourceDir "*") -DestinationPath $DestinationZip -Force
  }

  if (-not (Test-Path -LiteralPath $DestinationZip)) {
    throw "cloud delivery zip was not created: $DestinationZip"
  }
}

function Get-WebView2Version() {
  $paths = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )

  foreach ($path in $paths) {
    try {
      $item = Get-ItemProperty -Path $path -ErrorAction Stop
      if ($item.pv) {
        return [string]$item.pv
      }
    } catch {
      continue
    }
  }

  return $null
}

function Wait-ForDeskReady {
  param(
    [string]$LogPath,
    [int]$Seconds
  )

  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-Path -LiteralPath $LogPath) {
      $content = Get-Content -LiteralPath $LogPath -Raw -ErrorAction SilentlyContinue
      if ($content -match "App ready handshake received") {
        return $true
      }
    }
    Start-Sleep -Seconds 1
  }

  return $false
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$cloudApi = Normalize-Url $CloudApiBaseUrl
$cloudMqtt = Normalize-Url $CloudMqttUrl
$packageScript = Join-Path $repoRoot "scripts/dev/publish-desk-win-selfcontained.ps1"
$installerAssetsScript = Join-Path $repoRoot "scripts/dev/render-desk-win-installer-assets.ps1"
$installerScript = Join-Path $repoRoot "apps/desk-win/installer/LandslideDesk.Win.iss"
$bootstrapperDir = Join-Path $repoRoot "artifacts/desk-win/prerequisites"
$bootstrapperPath = Join-Path $bootstrapperDir "MicrosoftEdgeWebView2Setup.exe"
$chineseLangPath = Join-Path $repoRoot "apps/desk-win/installer/ChineseSimplified.isl"
$fullPackageOutputDir = Join-Path $repoRoot $PackageOutputDir
$fullOutDir = Join-Path $repoRoot $OutDir
$fullOutZip = Join-Path $repoRoot $OutZip
$fullInstallerOutputDir = Join-Path $repoRoot $InstallerOutputDir
$reportFile = Join-Path $repoRoot "docs/unified/reports/desk-win-cloud-delivery-latest.json"
$runtimeLog = Join-Path $env:LOCALAPPDATA "LandslideDesk.Win\runtime.log"

if (-not (Test-Path -LiteralPath $packageScript)) {
  throw "self-contained publish script not found: $packageScript"
}

$healthCheck = [ordered]@{
  skipped = [bool]$SkipHealthCheck
  ok = $false
  url = "$cloudApi/health"
  status = $null
  message = $null
}

if (-not $SkipHealthCheck.IsPresent) {
  Invoke-Step "Check cloud API health" {
    try {
      $health = Invoke-RestMethod -Uri $healthCheck.url -TimeoutSec 12
      $healthCheck.ok = $true
      $healthCheck.status = if ($health.status) { [string]$health.status } else { "OK" }
    } catch {
      $healthCheck.message = $_.Exception.Message
      throw "cloud API health check failed: $($healthCheck.url) $($healthCheck.message)"
    }
  }
}

$publishArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $packageScript,
  "-Configuration", $Configuration,
  "-Runtime", $Runtime,
  "-OutputDir", $PackageOutputDir
)
if ($SkipDeskBuild.IsPresent) {
  $publishArgs += "-SkipDeskBuild"
}

Invoke-Step "Publish cloud self-contained desk-win package" {
  & powershell @publishArgs
}

$runtimeConfig = [ordered]@{
  profile = "tencent-cloud-lightweight"
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  api = [ordered]@{
    mode = "http"
    baseUrl = $cloudApi
    force = $true
  }
  mqtt = [ordered]@{
    brokerUrl = $cloudMqtt
    note = "Windows desktop client uses the HTTP API directly; RK3568 northbound uses MQTT."
  }
}
$runtimeConfigPath = Join-Path $fullPackageOutputDir "desk-runtime.json"
Set-Content -LiteralPath $runtimeConfigPath -Value ($runtimeConfig | ConvertTo-Json -Depth 6) -Encoding UTF8

$launchVerify = [ordered]@{
  skipped = [bool]$SkipLaunchVerify
  readyAfterLaunch = $false
  stoppedAfterVerify = $false
  runtimeLog = $runtimeLog
  hostApiMatched = $false
  runtimeErrorCount = 0
}

if (-not $SkipLaunchVerify.IsPresent) {
  Invoke-Step "Verify cloud package launch" {
    $exePath = Join-Path $fullPackageOutputDir "LandslideDesk.Win.exe"
    $webIndex = Join-Path $fullPackageOutputDir "web/index.html"
    foreach ($path in @($exePath, $webIndex, $runtimeConfigPath)) {
      if (-not (Test-Path -LiteralPath $path)) {
        throw "required cloud package file not found: $path"
      }
    }

    $existing = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.Name -eq "LandslideDesk.Win.exe"
    })
    if ($existing.Count -gt 0) {
      throw "cloud package verify requires no running LandslideDesk.Win.exe; running pids: $((@($existing | ForEach-Object { $_.ProcessId })) -join ',')"
    }

    Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $runtimeLog -ErrorAction SilentlyContinue
    $proc = Start-Process -FilePath $exePath -WorkingDirectory $fullPackageOutputDir -PassThru
    $ready = Wait-ForDeskReady -LogPath $runtimeLog -Seconds 20
    Start-Sleep -Seconds 3
    $content = if (Test-Path -LiteralPath $runtimeLog) { Get-Content -LiteralPath $runtimeLog -Raw -ErrorAction SilentlyContinue } else { "" }
    $launchVerify.readyAfterLaunch = [bool]$ready
    $launchVerify.hostApiMatched = [bool]($content -match [regex]::Escape("baseUrl=$cloudApi"))
    $launchVerify.runtimeErrorCount = if ([string]::IsNullOrWhiteSpace($content)) { 0 } else { ([regex]::Matches($content, "Frontend runtime error:")).Count }

    try {
      Stop-Process -Id $proc.Id -Force -ErrorAction Stop
      $launchVerify.stoppedAfterVerify = $true
    } catch {
      if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) {
        $launchVerify.stoppedAfterVerify = $true
      }
    }

    if (-not $launchVerify.readyAfterLaunch) {
      throw "cloud desk-win package did not report app ready"
    }
    if (-not $launchVerify.hostApiMatched) {
      throw "cloud desk-win package did not inject expected API base URL: $cloudApi"
    }
    if ($launchVerify.runtimeErrorCount -gt 0) {
      throw "cloud desk-win package reported frontend runtime errors"
    }
  }
}

New-Item -ItemType Directory -Path $bootstrapperDir -Force | Out-Null
if (-not (Test-Path -LiteralPath $bootstrapperPath)) {
  Invoke-Step "Download WebView2 bootstrapper" {
    Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $bootstrapperPath -UseBasicParsing
  }
}

if (Test-Path -LiteralPath $fullOutDir) {
  Remove-Item -LiteralPath $fullOutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $fullOutDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $fullOutDir "package") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $fullOutDir "tools") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $fullOutDir "installer") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $fullOutDir "docs") -Force | Out-Null

Copy-Item -Path (Join-Path $fullPackageOutputDir "*") -Destination (Join-Path $fullOutDir "package") -Recurse -Force
Copy-Item -LiteralPath $bootstrapperPath -Destination (Join-Path $fullOutDir "tools\MicrosoftEdgeWebView2Setup.exe") -Force

$startPs1 = @'
param()
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Resolve-Path $PSCommandPath)
$packageDir = Join-Path $root "package"
$exe = Join-Path $packageDir "LandslideDesk.Win.exe"
$configPath = Join-Path $packageDir "desk-runtime.json"
$bootstrapper = Join-Path $root "tools\MicrosoftEdgeWebView2Setup.exe"

function Get-WebView2Version() {
  $paths = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )
  foreach ($path in $paths) {
    try {
      $item = Get-ItemProperty -Path $path -ErrorAction Stop
      if ($item.pv) { return [string]$item.pv }
    } catch {
      continue
    }
  }
  return $null
}

if (-not (Test-Path -LiteralPath $exe)) {
  throw "desktop executable not found: $exe"
}
if (-not (Test-Path -LiteralPath $configPath)) {
  throw "cloud runtime config not found: $configPath"
}

$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not $config.api.baseUrl) {
  throw "desk-runtime.json missing api.baseUrl"
}

if (-not (Get-WebView2Version)) {
  if (-not (Test-Path -LiteralPath $bootstrapper)) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $bootstrapper) -Force | Out-Null
    Invoke-WebRequest -Uri "https://go.microsoft.com/fwlink/p/?LinkId=2124703" -OutFile $bootstrapper -UseBasicParsing
  }
  Write-Host "Installing WebView2 Runtime..."
  $setup = Start-Process -FilePath $bootstrapper -ArgumentList "/silent", "/install" -Wait -PassThru
  if ($setup.ExitCode -ne 0 -and $setup.ExitCode -ne 2147747602) {
    throw "WebView2 Runtime install failed, exit code: $($setup.ExitCode). Try the installer package instead."
  }
}

Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
$env:DESK_API_MODE = [string]$config.api.mode
$env:DESK_API_BASE_URL = [string]$config.api.baseUrl
Start-Process -FilePath $exe -WorkingDirectory $packageDir
'@
Set-Content -LiteralPath (Join-Path $fullOutDir "start-cloud.ps1") -Value $startPs1 -Encoding UTF8

$startCmd = @'
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-cloud.ps1"
if errorlevel 1 pause
'@
Set-Content -LiteralPath (Join-Path $fullOutDir "start-cloud.cmd") -Value $startCmd -Encoding Default

$diagnosticsPs1 = @'
param()
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent (Resolve-Path $PSCommandPath)
$packageDir = Join-Path $root "package"
$exe = Join-Path $packageDir "LandslideDesk.Win.exe"
$configPath = Join-Path $packageDir "desk-runtime.json"
$bootstrapper = Join-Path $root "tools\MicrosoftEdgeWebView2Setup.exe"
$log = Join-Path $root "cloud-diagnostics.log"

function Write-Check($name, $ok, $detail) {
  $line = ("[{0}] {1}: {2}" -f ($(if ($ok) { "OK" } else { "FAIL" }), $name, $detail))
  Write-Host $line
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

function Get-WebView2Version() {
  $paths = @(
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}",
    "HKCU:\Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}"
  )
  foreach ($path in $paths) {
    try {
      $item = Get-ItemProperty -Path $path -ErrorAction Stop
      if ($item.pv) { return [string]$item.pv }
    } catch {
      continue
    }
  }
  return $null
}

Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
Add-Content -LiteralPath $log -Value ("GeneratedAt: " + (Get-Date).ToString("O")) -Encoding UTF8
Add-Content -LiteralPath $log -Value ("Root: " + $root) -Encoding UTF8

$is64BitOs = [Environment]::Is64BitOperatingSystem
Write-Check "Windows x64" $is64BitOs ("Is64BitOperatingSystem=" + $is64BitOs)
Write-Check "Package exe" (Test-Path -LiteralPath $exe) $exe
Write-Check "Runtime config" (Test-Path -LiteralPath $configPath) $configPath
Write-Check "WebView2 bootstrapper" (Test-Path -LiteralPath $bootstrapper) $bootstrapper

$webView2Version = Get-WebView2Version
Write-Check "WebView2 Runtime" (-not [string]::IsNullOrWhiteSpace($webView2Version)) ($(if ($webView2Version) { $webView2Version } else { "missing" }))

if (Test-Path -LiteralPath $configPath) {
  try {
    $config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $apiBaseUrl = [string]$config.api.baseUrl
    Write-Check "API base URL" (-not [string]::IsNullOrWhiteSpace($apiBaseUrl)) $apiBaseUrl
    if ($apiBaseUrl) {
      try {
        $health = Invoke-RestMethod -Uri "$($apiBaseUrl.TrimEnd('/'))/health" -TimeoutSec 10
        Write-Check "Cloud API health" $true ($health | ConvertTo-Json -Compress -Depth 4)
      } catch {
        Write-Check "Cloud API health" $false $_.Exception.Message
      }
    }
  } catch {
    Write-Check "Runtime config parse" $false $_.Exception.Message
  }
}

Write-Host ""
Write-Host "Diagnostics written to: $log"
'@
Set-Content -LiteralPath (Join-Path $fullOutDir "diagnose-cloud.ps1") -Value $diagnosticsPs1 -Encoding UTF8

$diagnosticsCmd = @'
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0diagnose-cloud.ps1"
echo.
pause
'@
Set-Content -LiteralPath (Join-Path $fullOutDir "diagnose-cloud.cmd") -Value $diagnosticsCmd -Encoding Default

$verifyPs1 = @'
param([int]$WaitSeconds = 15)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Resolve-Path $PSCommandPath)
$packageDir = Join-Path $root "package"
$exe = Join-Path $packageDir "LandslideDesk.Win.exe"
$configPath = Join-Path $packageDir "desk-runtime.json"
$runtimeLog = Join-Path $env:LOCALAPPDATA "LandslideDesk.Win\runtime.log"
if (-not (Test-Path -LiteralPath $exe)) { throw "desktop executable not found: $exe" }
if (-not (Test-Path -LiteralPath $configPath)) { throw "cloud runtime config not found: $configPath" }
$config = Get-Content -LiteralPath $configPath -Raw -Encoding UTF8 | ConvertFrom-Json
$health = Invoke-RestMethod -Uri "$($config.api.baseUrl.TrimEnd('/'))/health" -TimeoutSec 10
Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $runtimeLog -ErrorAction SilentlyContinue
$env:DESK_API_MODE = [string]$config.api.mode
$env:DESK_API_BASE_URL = [string]$config.api.baseUrl
$proc = Start-Process -FilePath $exe -WorkingDirectory $packageDir -PassThru
$ready = $false
for ($i = 0; $i -lt $WaitSeconds; $i++) {
  Start-Sleep -Seconds 1
  if (Test-Path -LiteralPath $runtimeLog) {
    $content = Get-Content -LiteralPath $runtimeLog -Raw -ErrorAction SilentlyContinue
    if ($content -match "App ready handshake received") {
      $ready = $true
      break
    }
  }
}
$stopped = $false
try {
  Stop-Process -Id $proc.Id -Force -ErrorAction Stop
  $stopped = $true
} catch {
  if (-not (Get-Process -Id $proc.Id -ErrorAction SilentlyContinue)) { $stopped = $true }
}
[pscustomobject]@{
  ready = $ready
  stopped = $stopped
  apiBaseUrl = $config.api.baseUrl
  health = $health
} | ConvertTo-Json -Depth 6
if (-not $ready) { throw "desktop ready handshake was not received" }
'@
Set-Content -LiteralPath (Join-Path $fullOutDir "verify-cloud-package.ps1") -Value $verifyPs1 -Encoding UTF8

$readme = @(
  "Landslide Monitor Desktop - Cloud Direct Package",
  "",
  "Cloud API: $cloudApi",
  "Cloud MQTT: $cloudMqtt",
  "Login: admin / 123456",
  "",
  "Recommended usage:",
  "1. Extract latest-cloud.zip and run start-cloud.cmd.",
  "2. If WebView2 Runtime is missing, start-cloud.ps1 will try to install or download Microsoft WebView2 Bootstrapper.",
  "3. If PowerShell is restricted or runtime repair fails, use the installer in the installer directory.",
  "",
  "Boundary:",
  "- The desktop client uses the cloud HTTP API only. It does not connect to PostgreSQL, ClickHouse, or Kafka directly.",
  "- MQTT is mainly for RK3568 / edge northbound traffic. The desktop views data and sends commands through API.",
  "- package\desk-runtime.json contains the cloud profile. api.force=true overrides stale local API settings on copied PCs.",
  "",
  "Verification:",
  "- Run .\verify-cloud-package.ps1 to check cloud API health and desktop ready handshake."
) -join [System.Environment]::NewLine
Set-Content -LiteralPath (Join-Path $fullOutDir "README-cloud.txt") -Value $readme -Encoding UTF8

$installerResult = [ordered]@{
  skipped = [bool]$SkipInstaller
  built = $false
  path = $null
  sha256 = $null
  message = $null
}

if (-not $SkipInstaller.IsPresent) {
  Invoke-Step "Build cloud installer" {
    $isccCandidates = @(
      "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
      "C:\Program Files\Inno Setup 6\ISCC.exe",
      "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
    )
    $iscc = @($isccCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1)[0]
    if (-not $iscc) {
      $installerResult.message = "ISCC.exe not found; cloud installer skipped"
      return
    }

    if (-not (Test-Path -LiteralPath $installerScript)) {
      throw "installer script not found: $installerScript"
    }

    if (-not (Test-Path -LiteralPath $chineseLangPath)) {
      Invoke-WebRequest -Uri "https://raw.githubusercontent.com/jrsoftware/issrc/main/Files/Languages/Unofficial/ChineseSimplified.isl" -OutFile $chineseLangPath -UseBasicParsing
    }

    powershell -NoProfile -ExecutionPolicy Bypass -File $installerAssetsScript
    if ($LASTEXITCODE -ne 0) {
      throw "installer assets render failed (exit=$LASTEXITCODE)"
    }

    New-Item -ItemType Directory -Path $fullInstallerOutputDir -Force | Out-Null
    $buildInfoFile = Join-Path $repoRoot "docs/unified/reports/desk-win-build-info-latest.json"
    $gitShortSha = if (Test-Path -LiteralPath $buildInfoFile) {
      ([string](Get-Content -LiteralPath $buildInfoFile -Raw -Encoding UTF8 | ConvertFrom-Json).git.shortSha)
    } else {
      (git rev-parse --short HEAD).Trim()
    }
    $outputBaseFilename = "LandslideDesk-Cloud-Setup-$Runtime-$gitShortSha"
    $verName = "Landslide Desk Cloud $Version ($gitShortSha)"

    & $iscc `
      "/DMyAppVersion=$Version" `
      "/DMyAppVerName=$verName" `
      "/DSourceDir=$fullPackageOutputDir" `
      "/DOutputDir=$fullInstallerOutputDir" `
      "/DOutputBaseFilename=$outputBaseFilename" `
      "/DWebView2Bootstrapper=$bootstrapperPath" `
      $installerScript
    if ($LASTEXITCODE -ne 0) {
      throw "cloud Inno installer build failed (exit=$LASTEXITCODE)"
    }

    $installerExe = Join-Path $fullInstallerOutputDir "$outputBaseFilename.exe"
    if (-not (Test-Path -LiteralPath $installerExe)) {
      throw "cloud installer exe not found: $installerExe"
    }

    Copy-Item -LiteralPath $installerExe -Destination (Join-Path $fullOutDir "installer") -Force
    $installerRunner = @"
@echo off
setlocal
set SETUP=%~dp0installer\$outputBaseFilename.exe
if not exist "%SETUP%" (
  echo Installer not found: %SETUP%
  pause
  exit /b 1
)
"%SETUP%" /LOG="%~dp0cloud-installer.log"
echo.
echo Installer exited with code %ERRORLEVEL%.
echo Log file: %~dp0cloud-installer.log
pause
"@
    Set-Content -LiteralPath (Join-Path $fullOutDir "install-cloud-with-log.cmd") -Value $installerRunner -Encoding Default
    $installerHash = Get-HashEntry $installerExe
    $installerResult.built = $true
    $installerResult.path = $installerExe
    $installerResult.sha256 = $installerHash.sha256
  }
}

New-ZipArchiveFromDirectory -SourceDir $fullOutDir -DestinationZip $fullOutZip

$bundleFiles = Get-ChildItem -LiteralPath $fullOutDir -Recurse -File
$zipHash = Get-HashEntry $fullOutZip
$packageExeHash = Get-HashEntry (Join-Path $fullPackageOutputDir "LandslideDesk.Win.exe")
$runtimeConfigHash = Get-HashEntry $runtimeConfigPath
$webView2Version = Get-WebView2Version

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  cloudApiBaseUrl = $cloudApi
  cloudMqttUrl = $cloudMqtt
  configuration = $Configuration
  runtime = $Runtime
  package = [ordered]@{
    outputDir = $fullPackageOutputDir
    runtimeConfig = $runtimeConfigPath
    selfContained = $true
    dotnetRuntimeHandledBy = "self-contained publish"
    webView2RuntimeHandledBy = "start-cloud.ps1 and installer bootstrapper"
  }
  delivery = [ordered]@{
    dir = $fullOutDir
    zip = $fullOutZip
    fileCount = @($bundleFiles).Count
    totalBytes = (@($bundleFiles | Measure-Object -Property Length -Sum).Sum)
  }
  installer = $installerResult
  healthCheck = $healthCheck
  launchVerify = $launchVerify
  prerequisites = [ordered]@{
    webView2VersionOnBuildMachine = $webView2Version
    webView2Bootstrapper = $bootstrapperPath
  }
  hashes = [ordered]@{
    packageExe = $packageExeHash
    runtimeConfig = $runtimeConfigHash
    zip = $zipHash
  }
}

$json = $result | ConvertTo-Json -Depth 10
$reportDir = Split-Path -Parent $reportFile
if ($reportDir -and -not (Test-Path -LiteralPath $reportDir)) {
  New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
}
Set-Content -LiteralPath $reportFile -Value $json -Encoding UTF8
$json
