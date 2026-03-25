[CmdletBinding()]
param(
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-modern-installer-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-modern-installer-verify-latest.json",
  [string]$InstallRoot = "C:\Users\Administrator\AppData\Local\LandslideDeskModernInstallerSmoke",
  [string]$BundleUpgradeCode = "{{A5E801B7-9B52-4E5A-BD7A-7D0FE17C53A6}}",
  [int]$WaitSeconds = 20
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullInstallerReportFile = Join-Path $repoRoot $InstallerReportFile
$fullOutFile = Join-Path $repoRoot $OutFile
$fullInstallRoot = if ([System.IO.Path]::IsPathRooted($InstallRoot)) { $InstallRoot } else { Join-Path $repoRoot $InstallRoot }
$runId = "run-" + (Get-Date -Format "yyyyMMdd-HHmmss")
$fullRunRoot = Join-Path $fullInstallRoot $runId
$coreUninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{6F223F64-1B4C-4381-BE67-AC3AC8A7A78D}_is1"
$runtimeLog = Join-Path $env:LOCALAPPDATA "LandslideDesk.Win\runtime.log"

function Get-ModernBundleEntries {
  $uninstallRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
  Get-ChildItem -Path $uninstallRoot -ErrorAction SilentlyContinue |
    ForEach-Object {
      $item = Get-ItemProperty -Path $_.PSPath -ErrorAction SilentlyContinue
      if ($item -and [string]$item.BundleUpgradeCode -eq $bundleUpgradeCode) {
        [PSCustomObject]@{
          RegistryPath = $_.PSPath
          BundleCachePath = [string]$item.BundleCachePath
          QuietUninstallString = [string]$item.QuietUninstallString
          DisplayName = [string]$item.DisplayName
        }
      }
    }
}

function Wait-UntilRemoved {
  param(
    [string]$Path,
    [int]$Seconds = 20
  )

  for ($i = 0; $i -lt $Seconds; $i++) {
    if (-not (Test-Path $Path)) {
      return $true
    }
    Start-Sleep -Seconds 1
  }

  return (-not (Test-Path $Path))
}

function Stop-InstallerProcesses {
  param(
    [string]$BundlePath,
    [string]$InstallDir
  )

  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      ($_.ExecutablePath -and $BundlePath -and ([System.IO.Path]::GetFullPath($_.ExecutablePath) -eq [System.IO.Path]::GetFullPath($BundlePath))) -or
      ($_.ExecutablePath -and $InstallDir -and $_.ExecutablePath.StartsWith($InstallDir, [System.StringComparison]::OrdinalIgnoreCase)) -or
      ($_.Name -eq "wixstdba.exe")
    } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Wait-ForDeskReady {
  param(
    [string]$LogPath,
    [int]$Seconds
  )

  for ($i = 0; $i -lt $Seconds; $i++) {
    if (Test-Path $LogPath) {
      $content = Get-Content -Path $LogPath -Raw -ErrorAction SilentlyContinue
      if ($content -match "App ready handshake received") {
        return $true
      }
    }
    Start-Sleep -Seconds 1
  }

  return $false
}

$failureMessage = $null
$installExitCode = $null
$uninstallExitCode = $null
$alive = $false
$readyAfterLaunch = $false
$stopped = $false
$removedExe = $false
$removedCoreRegistry = $false
$removedBundleRegistry = $false
$installerExe = $null
$installedExe = $null
$installedWeb = $null
$installDir = $null
$precleanLog = Join-Path $fullRunRoot "preclean.log"
$installLog = Join-Path $fullRunRoot "install.log"
$uninstallLog = Join-Path $fullRunRoot "uninstall.log"

try {
  if (-not (Test-Path $fullInstallerReportFile)) {
    throw ("modern installer report not found: " + $InstallerReportFile)
  }

  $report = Get-Content -Path $fullInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $installerExe = [string]$report.installer.path
  if (-not $installerExe -or -not (Test-Path $installerExe)) {
    throw ("modern installer exe not found: " + $installerExe)
  }

  if (Test-Path $fullRunRoot) {
    Remove-Item -Path $fullRunRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $fullRunRoot -Force | Out-Null

  $existingInstallDir = $null
  if (Test-Path $coreUninstallKey) {
    $existingInstallDir = [string](Get-ItemProperty -Path $coreUninstallKey -ErrorAction SilentlyContinue).InstallLocation
  }

  Stop-InstallerProcesses -BundlePath $installerExe -InstallDir $existingInstallDir
  Start-Sleep -Seconds 2

  $bundleEntries = @(Get-ModernBundleEntries)
  foreach ($bundleEntry in $bundleEntries) {
    $quietUninstall = $bundleEntry.QuietUninstallString
    if (-not $quietUninstall -and $bundleEntry.BundleCachePath) {
      $quietUninstall = ('"' + $bundleEntry.BundleCachePath + '" /uninstall /quiet')
    }
    if ($quietUninstall) {
      $proc = Start-Process -FilePath "cmd.exe" -ArgumentList ("/c " + $quietUninstall + ' /log "' + $precleanLog + '"') -PassThru -Wait
      if ($proc.ExitCode -ne 0) {
        throw ("modern bundle preclean exited with code " + $proc.ExitCode)
      }
    }
  }
  if (@(Get-ModernBundleEntries).Count -gt 0) {
    throw "bundle uninstall registry entry still exists after preclean"
  }

  if (Test-Path $coreUninstallKey) {
    $coreEntry = Get-ItemProperty -Path $coreUninstallKey -ErrorAction SilentlyContinue
    $quietUninstall = [string]$coreEntry.QuietUninstallString
    if (-not $quietUninstall) {
      $quietUninstall = [string]$coreEntry.UninstallString
    }
    if ($quietUninstall) {
      $proc = Start-Process -FilePath "cmd.exe" -ArgumentList ("/c " + $quietUninstall) -PassThru -Wait
      if ($proc.ExitCode -ne 0) {
        throw ("core installer preclean exited with code " + $proc.ExitCode)
      }
    }
    if (-not (Wait-UntilRemoved -Path $coreUninstallKey)) {
      throw "core installer uninstall registry entry still exists after preclean"
    }
  }

  & $installerExe /quiet /norestart /log $installLog
  $installExitCode = $LASTEXITCODE
  if ($null -eq $installExitCode) {
    $installExitCode = 0
  }
  if ($installExitCode -ne 0) {
    throw ("modern installer exited with code " + $installExitCode)
  }

  $coreReady = $false
  for ($i = 0; $i -lt 20; $i++) {
    if (Test-Path $coreUninstallKey) {
      $coreReady = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $coreReady) {
    throw "core installer uninstall registry entry missing after install"
  }

  $coreEntry = Get-ItemProperty -Path $coreUninstallKey -ErrorAction SilentlyContinue
  $installDir = [string]$coreEntry.InstallLocation
  if (-not $installDir) {
    throw "installed location missing from core installer registry entry"
  }

  $installedExe = Join-Path $installDir "LandslideDesk.Win.exe"
  $installedWeb = Join-Path $installDir "web\index.html"

  foreach ($path in @($installedExe, $installedWeb)) {
    $found = $false
    for ($i = 0; $i -lt 20; $i++) {
      if (Test-Path $path) {
        $found = $true
        break
      }
      Start-Sleep -Seconds 1
    }
    if (-not $found) {
      throw ("expected installed file missing: " + $path)
    }
  }

  Remove-Item Env:DESK_DEV_SERVER_URL -ErrorAction SilentlyContinue
  Remove-Item -Path $runtimeLog -ErrorAction SilentlyContinue
  $appProc = Start-Process -FilePath $installedExe -WorkingDirectory (Split-Path -Parent $installedExe) -PassThru
  for ($i = 0; $i -lt $WaitSeconds; $i++) {
    Start-Sleep -Seconds 1
    if (Get-Process -Id $appProc.Id -ErrorAction SilentlyContinue) {
      $alive = $true
      break
    }
  }
  if (-not $alive) {
    throw "installed exe did not stay alive after launch"
  }

  $readyAfterLaunch = Wait-ForDeskReady -LogPath $runtimeLog -Seconds $WaitSeconds
  if (-not $readyAfterLaunch) {
    throw "installed exe did not report app ready after launch"
  }

  try {
    Stop-Process -Id $appProc.Id -Force -ErrorAction Stop
    $stopped = $true
  } catch {
    if (-not (Get-Process -Id $appProc.Id -ErrorAction SilentlyContinue)) {
      $stopped = $true
    }
  }
  if (-not $stopped) {
    throw "installed exe could not be stopped after launch check"
  }

  Start-Sleep -Seconds 2
  Stop-InstallerProcesses -BundlePath $installerExe -InstallDir $installDir
  & $installerExe /uninstall /quiet /norestart /log $uninstallLog
  $uninstallExitCode = $LASTEXITCODE
  if ($null -eq $uninstallExitCode) {
    $uninstallExitCode = 0
  }
  if ($uninstallExitCode -ne 0) {
    throw ("modern installer uninstall exited with code " + $uninstallExitCode)
  }

  for ($i = 0; $i -lt 30; $i++) {
    if (-not (Test-Path $installedExe)) {
      $removedExe = $true
      break
    }
    Start-Sleep -Seconds 1
  }

  $removedCoreRegistry = -not (Test-Path $coreUninstallKey)
  $removedBundleRegistry = (@(Get-ModernBundleEntries).Count -eq 0)

  if (-not $removedExe) {
    throw "installed files still exist after uninstall"
  }
  if (-not $removedCoreRegistry) {
    throw "core installer uninstall registry entry still exists after uninstall"
  }
  if (-not $removedBundleRegistry) {
    throw "bundle uninstall registry entry still exists after uninstall"
  }
} catch {
  $failureMessage = $_.Exception.Message
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  installerReportFile = $InstallerReportFile
  installerExe = $installerExe
  installRoot = $fullRunRoot
  precleanLog = $precleanLog
  installDir = $installDir
  installLog = $installLog
  uninstallLog = $uninstallLog
  installedExe = $installedExe
  installedWeb = $installedWeb
  installExitCode = $installExitCode
  aliveAfterLaunch = $alive
  readyAfterLaunch = $readyAfterLaunch
  stoppedAfterVerify = $stopped
  uninstallExitCode = $uninstallExitCode
  runtimeLog = $runtimeLog
  removedExeAfterUninstall = $removedExe
  removedCoreRegistryAfterUninstall = $removedCoreRegistry
  removedBundleRegistryAfterUninstall = $removedBundleRegistry
  failureMessage = $failureMessage
  ready = ($installExitCode -eq 0 -and $alive -and $readyAfterLaunch -and $stopped -and $uninstallExitCode -eq 0 -and $removedExe -and $removedCoreRegistry -and $removedBundleRegistry -and -not $failureMessage)
}

$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

Set-Content -Path $fullOutFile -Value ($result | ConvertTo-Json -Depth 8) -Encoding UTF8

if (-not $result.ready) {
  throw ("modern installer verification failed: " + $result.failureMessage)
}

$result | ConvertTo-Json -Depth 8
