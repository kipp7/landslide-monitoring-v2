[CmdletBinding()]
param(
  [string]$PackageManifestFile = "docs/unified/reports/desk-win-package-latest.json",
  [int]$ProbeSeconds = 5,
  [string]$OutFile = "docs/unified/reports/desk-win-packaged-status-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullManifest = Join-Path $repoRoot $PackageManifestFile
$fullOutFile = Join-Path $repoRoot $OutFile

if (-not (Test-Path $fullManifest)) {
  throw "desk-win package manifest not found: $PackageManifestFile"
}

$manifest = Get-Content -Path $fullManifest -Raw -Encoding UTF8 | ConvertFrom-Json
$exePath = [string]$manifest.exe.path
$webIndex = [string]$manifest.web.indexPath

function Find-PackagedProcess([string]$targetExePath) {
  $byCim = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -eq "LandslideDesk.Win.exe" -and (
      ([string]::IsNullOrWhiteSpace($targetExePath) -and $_.CommandLine -like "*LandslideDesk.Win.exe*") -or
      ($targetExePath -and $_.ExecutablePath -eq $targetExePath)
    )
  } | Select-Object -First 1
  if ($byCim) {
    return $byCim
  }

  if ($targetExePath) {
    $byProcess = Get-Process LandslideDesk.Win -ErrorAction SilentlyContinue | Where-Object {
      $_.Path -eq $targetExePath
    } | Select-Object -First 1
    if ($byProcess) {
      return [pscustomobject]@{
        ProcessId = $byProcess.Id
        Name = "$($byProcess.ProcessName).exe"
        ExecutablePath = $byProcess.Path
        CommandLine = $null
      }
    }
  }

  return $null
}

$proc = $null
for ($i = 0; $i -lt [Math]::Max(1, $ProbeSeconds); $i++) {
  $proc = Find-PackagedProcess $exePath
  if ($proc) {
    break
  }
  if ($i -lt ($ProbeSeconds - 1)) {
    Start-Sleep -Seconds 1
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  manifest = [ordered]@{
    file = $PackageManifestFile
    exePath = $exePath
    webIndex = $webIndex
    exeExists = [bool]($exePath -and (Test-Path $exePath))
    webIndexExists = [bool]($webIndex -and (Test-Path $webIndex))
  }
  runtime = [ordered]@{
    running = [bool]($null -ne $proc)
    pid = if ($proc) { $proc.ProcessId } else { $null }
    executablePath = if ($proc) { $proc.ExecutablePath } else { $null }
    commandLine = if ($proc) { $proc.CommandLine } else { $null }
    isLatestPackage = if ($proc -and $exePath) { $proc.ExecutablePath -eq $exePath } else { $false }
  }
}

$json = $result | ConvertTo-Json -Depth 8
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
