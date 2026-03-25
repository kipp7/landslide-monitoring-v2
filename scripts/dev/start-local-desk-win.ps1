param(
  [string]$DeskUrl = "http://localhost:5174/"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$project = Join-Path $repoRoot "apps/desk-win/LandslideDesk.Win/LandslideDesk.Win.csproj"
$exe = Join-Path $repoRoot "apps/desk-win/LandslideDesk.Win/bin/Debug/net8.0-windows/LandslideDesk.Win.exe"

if (-not (Test-Path $project)) {
  throw "desk-win project not found: $project"
}

$existing = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -in @("LandslideDesk.Win.exe", "dotnet.exe") -and $_.CommandLine -like "*LandslideDesk.Win*"
} | Select-Object -First 1

if ($existing) {
  [pscustomobject]@{
    started = $false
    alreadyRunning = $true
    pid = $existing.ProcessId
    deskUrl = $DeskUrl
  } | ConvertTo-Json -Depth 4
  exit 0
}

Push-Location $repoRoot
try {
  dotnet build $project
  if ($LASTEXITCODE -ne 0) {
    throw "desk-win build failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}

if (-not (Test-Path $exe)) {
  throw "desk-win exe not found after build: $exe"
}

$env:DESK_DEV_SERVER_URL = $DeskUrl
$proc = Start-Process -FilePath $exe -WorkingDirectory (Split-Path -Parent $exe) -PassThru

[pscustomobject]@{
  started = $true
  alreadyRunning = $false
  pid = $proc.Id
  deskUrl = $DeskUrl
} | ConvertTo-Json -Depth 4
