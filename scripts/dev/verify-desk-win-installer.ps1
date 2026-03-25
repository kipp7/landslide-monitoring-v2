[CmdletBinding()]
param(
  [string]$InstallerReportFile = "docs/unified/reports/desk-win-installer-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-installer-verify-latest.json",
  [string]$InstallRoot = "C:\Users\Administrator\AppData\Local\LandslideDeskInstallerSmoke",
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
$fullInstallDir = Join-Path $fullRunRoot "app"
$uninstallKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{6F223F64-1B4C-4381-BE67-AC3AC8A7A78D}_is1"
$runtimeLog = Join-Path $env:LOCALAPPDATA "LandslideDesk.Win\runtime.log"
$startMenuShortcuts = @(
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Landslide Desk.lnk"),
  (Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\山体滑坡监测桌面端.lnk")
)

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
$cleanupFallbackUsed = $false
$installedExe = $null
$installedWeb = $null
$uninstaller = $null
$installerExe = $null
$installLog = Join-Path $fullRunRoot "installer-install.log"
$uninstallLog = Join-Path $fullRunRoot "installer-uninstall.log"

try {
  if (-not (Test-Path $fullInstallerReportFile)) {
    throw "installer report not found: $InstallerReportFile"
  }

  $report = Get-Content -Path $fullInstallerReportFile -Raw -Encoding UTF8 | ConvertFrom-Json
  $installerExe = [string]$report.installer.path
  if (-not $installerExe -or -not (Test-Path $installerExe)) {
    throw "installer exe not found: $installerExe"
  }

  if (Test-Path $uninstallKey) {
    $existing = Get-ItemProperty $uninstallKey
    $existingInstallLocation = [string]$existing.InstallLocation
    if ($existingInstallLocation -and $existingInstallLocation.StartsWith($fullInstallRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
          ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($existingInstallLocation, [System.StringComparison]::OrdinalIgnoreCase)) -or
          ($_.CommandLine -and $_.CommandLine.Contains($existingInstallLocation))
        } |
        ForEach-Object {
          Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        }
      Start-Sleep -Seconds 2
      if (Test-Path $existingInstallLocation) {
        cmd /c "attrib -r -s -h /s /d ""$existingInstallLocation\*""" | Out-Null
        cmd /c "rd /s /q ""$existingInstallLocation""" | Out-Null
      }
      Remove-Item -Path $uninstallKey -Recurse -Force
      foreach ($shortcut in $startMenuShortcuts) {
        if (Test-Path $shortcut) {
          Remove-Item -Path $shortcut -Force
        }
      }
    }
  }

  if (Test-Path $fullRunRoot) {
    Remove-Item -Path $fullRunRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $fullInstallDir -Force | Out-Null

  $installArgs = @(
    "/VERYSILENT",
    "/SUPPRESSMSGBOXES",
    "/NORESTART",
    "/SP-",
    "/DIR=$fullInstallDir",
    "/LOG=$installLog"
  )

  & $installerExe @installArgs
  $installExitCode = $LASTEXITCODE
  if ($null -eq $installExitCode) {
    $installExitCode = 0
  }
  if ($installExitCode -ne 0) {
    throw "installer exited with code $installExitCode"
  }

  $installedExe = Join-Path $fullInstallDir "LandslideDesk.Win.exe"
  $installedWeb = Join-Path $fullInstallDir "web/index.html"
  $uninstaller = Join-Path $fullInstallDir "unins000.exe"

  foreach ($path in @($installedExe, $installedWeb, $uninstaller)) {
    $found = $false
    for ($i = 0; $i -lt 30; $i++) {
      if (Test-Path $path) {
        $found = $true
        break
      }
      Start-Sleep -Seconds 1
    }
    if (-not $found) {
      throw "expected installed file missing: $path"
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
  for ($i = 0; $i -lt 10; $i++) {
    $resident = @(
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith($fullInstallDir, [System.StringComparison]::OrdinalIgnoreCase)) -or
        ($_.CommandLine -and $_.CommandLine.Contains($fullInstallDir)) -or
        ($_.Name -eq "msedgewebview2.exe" -and $_.CommandLine -and $_.CommandLine.Contains("webview-exe-name=LandslideDesk.Win.exe"))
      }
    )
    if (@($resident).Count -eq 0) {
      break
    }
    foreach ($procInfo in $resident) {
      Stop-Process -Id $procInfo.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 1
  }

  $quietUninstall = "`"$uninstaller`" /SILENT"
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "cmd.exe"
  $psi.Arguments = "/c $quietUninstall"
  $psi.UseShellExecute = $false
  $proc = [System.Diagnostics.Process]::Start($psi)
  $proc.WaitForExit()
  $uninstallExitCode = $proc.ExitCode

  for ($i = 0; $i -lt 60; $i++) {
    $uninsRunning = @(Get-Process -Name unins000 -ErrorAction SilentlyContinue)
    if ($uninsRunning.Count -eq 0) {
      break
    }
    Start-Sleep -Seconds 1
  }

  for ($i = 0; $i -lt 30; $i++) {
    if (-not (Test-Path $installedExe)) {
      $removedExe = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  $removedRegistry = -not (Test-Path $uninstallKey)

  if (-not $removedRegistry) {
    throw "uninstall registry entry still exists after uninstall"
  }

  if (-not $removedExe) {
    try {
      if (Test-Path $fullRunRoot) {
        cmd /c "attrib -r -s -h /s /d ""$fullRunRoot\*""" | Out-Null
        cmd /c "rd /s /q ""$fullRunRoot""" | Out-Null
      }
      $cleanupFallbackUsed = $true
      $removedExe = -not (Test-Path $installedExe)
    } catch {
      # keep original state; final failure below will expose it
    }
  }

  if (-not $removedExe) {
    throw "installed files still exist after uninstall"
  }
} catch {
  $failureMessage = $_.Exception.Message
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  installerReportFile = $InstallerReportFile
  installerExe = $installerExe
  installRoot = $fullRunRoot
  installDir = $fullInstallDir
  installLog = $installLog
  uninstallLog = $uninstallLog
  installedExe = $installedExe
  installedWeb = $installedWeb
  uninstallExe = $uninstaller
  installExitCode = $installExitCode
  aliveAfterLaunch = $alive
  readyAfterLaunch = $readyAfterLaunch
  stoppedAfterVerify = $stopped
  uninstallExitCode = $uninstallExitCode
  runtimeLog = $runtimeLog
  removedExeAfterUninstall = $removedExe
  removedRegistryAfterUninstall = (-not (Test-Path $uninstallKey))
  cleanupFallbackUsed = $cleanupFallbackUsed
  failureMessage = $failureMessage
  ready = ($installExitCode -eq 0 -and $alive -and $readyAfterLaunch -and $stopped -and $removedExe -and (-not (Test-Path $uninstallKey)) -and -not $failureMessage)
}

$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value ($result | ConvertTo-Json -Depth 8) -Encoding UTF8

if (-not $result.ready) {
  throw "installer verification failed: $($result.failureMessage)"
}

$result | ConvertTo-Json -Depth 8
