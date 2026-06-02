[CmdletBinding()]
param(
  [string]$BoardHost = "192.168.124.179",
  [string]$BoardUser = "linaro",
  [string]$BoardPassword = "",
  [int]$BoardSshPort = 22,
  [string]$BoardRepoRoot = "/home/linaro/landslide-monitoring-v2-mainline",
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$ApiUsername = "admin",
  [string]$ApiPassword = "123456",
  [switch]$AllowUnsafeSecrets,
  [string]$OutFile = "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-RepoRoot() {
  $here = Get-Location
  $dir = $here.Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Convert-TextToJsonObject {
  param(
    [string]$Text,
    [string]$Label
  )

  $trimmed = $Text.Trim()
  if (-not $trimmed) {
    throw "$Label returned empty output"
  }

  $jsonStart = $trimmed.IndexOf("{")
  $jsonEnd = $trimmed.LastIndexOf("}")
  if ($jsonStart -lt 0 -or $jsonEnd -lt $jsonStart) {
    throw "$Label did not return JSON output"
  }

  return ($trimmed.Substring($jsonStart, $jsonEnd - $jsonStart + 1) | ConvertFrom-Json)
}

function Invoke-JsonScript {
  param(
    [string]$Label,
    [scriptblock]$Action
  )

  Write-Host "==> $Label" -ForegroundColor Cyan
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $output = & $Action 2>&1 | ForEach-Object { $_.ToString() } | Out-String
  } finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed (exit=$LASTEXITCODE)"
  }

  return Convert-TextToJsonObject -Text $output -Label $Label
}

$repoRoot = Resolve-RepoRoot

Push-Location $repoRoot
try {
  $centerArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", ".\scripts\dev\check-field-center-runtime-freeze.ps1"
  )
  if ($AllowUnsafeSecrets.IsPresent) {
    $centerArgs += "-AllowUnsafeSecrets"
  }
  $null = Invoke-JsonScript "Refresh center runtime freeze" {
    powershell @centerArgs
  }

  $null = Invoke-JsonScript "Refresh rk3568 production uplink freeze" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-field-rk3568-production-uplink-freeze.ps1" `
      -BoardHost $BoardHost `
      -User $BoardUser `
      -Password $BoardPassword `
      -SshPort $BoardSshPort `
      -RepoRoot $BoardRepoRoot
  }

  $null = Invoke-JsonScript "Refresh field software read-path adaptation" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-field-software-read-path-adaptation.ps1" `
      -ApiBaseUrl $ApiBaseUrl `
      -WebBaseUrl $WebBaseUrl `
      -Username $ApiUsername `
      -Password $ApiPassword
  }

  $final = Invoke-JsonScript "Refresh center deployment software adaptation readiness" {
    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\check-field-center-deployment-software-adaptation-readiness.ps1" `
      -OutFile $OutFile
  }

  $final | ConvertTo-Json -Depth 8
} finally {
  Pop-Location
}
