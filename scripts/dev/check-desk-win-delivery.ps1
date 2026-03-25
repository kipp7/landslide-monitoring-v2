[CmdletBinding()]
param(
  [string]$PackageManifestFile = "docs/unified/reports/desk-win-package-latest.json",
  [string]$PackageVerifyFile = "docs/unified/reports/desk-win-package-verify-latest.json",
  [string]$PrerequisitesFile = "docs/unified/reports/desk-win-prerequisites-latest.json",
  [string]$OutFile = "docs/unified/reports/desk-win-delivery-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullPackageManifestFile = Join-Path $repoRoot $PackageManifestFile
$fullPackageVerifyFile = Join-Path $repoRoot $PackageVerifyFile
$fullPrerequisitesFile = Join-Path $repoRoot $PrerequisitesFile
$fullOutFile = Join-Path $repoRoot $OutFile

foreach ($path in @($fullPackageManifestFile, $fullPackageVerifyFile, $fullPrerequisitesFile)) {
  if (-not (Test-Path $path)) {
    throw "required report not found: $path"
  }
}

$package = Get-Content -Path $fullPackageManifestFile -Raw -Encoding UTF8 | ConvertFrom-Json
$verify = Get-Content -Path $fullPackageVerifyFile -Raw -Encoding UTF8 | ConvertFrom-Json
$prereq = Get-Content -Path $fullPrerequisitesFile -Raw -Encoding UTF8 | ConvertFrom-Json

$checks = @(
  [pscustomobject]@{
    key = "packageExe"
    ok = [bool]$package.exe.path
    actual = $package.exe.path
    expected = "packaged exe path"
  },
  [pscustomobject]@{
    key = "packageWebIndex"
    ok = [bool]$package.web.indexPresent
    actual = [bool]$package.web.indexPresent
    expected = $true
  },
  [pscustomobject]@{
    key = "verifyAliveAfterLaunch"
    ok = [bool]$verify.aliveAfterLaunch
    actual = [bool]$verify.aliveAfterLaunch
    expected = $true
  },
  [pscustomobject]@{
    key = "verifyReadyAfterLaunch"
    ok = [bool]$verify.readyAfterLaunch
    actual = [bool]$verify.readyAfterLaunch
    expected = $true
  },
  [pscustomobject]@{
    key = "verifyStoppedAfterVerify"
    ok = [bool]$verify.stoppedAfterVerify
    actual = [bool]$verify.stoppedAfterVerify
    expected = $true
  },
  [pscustomobject]@{
    key = "prereqDotnet"
    ok = [bool](($prereq.checks | Where-Object { $_.key -eq "dotnetCommand" } | Select-Object -First 1).ok)
    actual = [bool](($prereq.checks | Where-Object { $_.key -eq "dotnetCommand" } | Select-Object -First 1).ok)
    expected = $true
  },
  [pscustomobject]@{
    key = "prereqWindowsDesktopRuntime"
    ok = [bool](($prereq.checks | Where-Object { $_.key -eq "windowsDesktopRuntime8" } | Select-Object -First 1).ok)
    actual = ($prereq.checks | Where-Object { $_.key -eq "windowsDesktopRuntime8" } | Select-Object -First 1).actual
    expected = "Microsoft.WindowsDesktop.App 8.x"
  },
  [pscustomobject]@{
    key = "prereqWebView2"
    ok = [bool](($prereq.checks | Where-Object { $_.key -eq "webView2Runtime" } | Select-Object -First 1).ok)
    actual = ($prereq.checks | Where-Object { $_.key -eq "webView2Runtime" } | Select-Object -First 1).actual
    expected = "installed"
  }
)

$failed = @($checks | Where-Object { -not $_.ok })

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  ready = ($failed.Count -eq 0)
  inputs = [ordered]@{
    packageManifestFile = $PackageManifestFile
    packageVerifyFile = $PackageVerifyFile
    prerequisitesFile = $PrerequisitesFile
  }
  summary = [ordered]@{
    outputDir = $package.outputDir
    exePath = $package.exe.path
    webIndex = $package.web.indexPath
    packageFileCount = $package.package.fileCount
    packageTotalBytes = $package.package.totalBytes
  }
  checks = $checks
  failedKeys = @($failed | ForEach-Object { $_.key })
}

$json = $result | ConvertTo-Json -Depth 8
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8

if ($failed.Count -gt 0) {
  throw "desk-win delivery check failed: $((@($failed | ForEach-Object { $_.key })) -join ', ')"
}

$json
