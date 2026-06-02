[CmdletBinding()]
param(
  [string]$PythonCommand = "python",
  [switch]$ForceRecreateVenv,
  [switch]$ForceInit
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$toolRoot = Join-Path $repoRoot ".tools\mempalace"
$venvRoot = Join-Path $toolRoot ".venv"
$venvPython = Join-Path $venvRoot "Scripts\python.exe"
$mempalaceExe = Join-Path $venvRoot "Scripts\mempalace.exe"
$palacePath = Join-Path $toolRoot "palace"
$configPath = Join-Path $repoRoot "mempalace.yaml"
$entitiesPath = Join-Path $repoRoot "entities.json"

function Assert-Command {
  param([string]$CommandName)
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Command not found: $CommandName"
  }
}

function Write-ProjectEntities {
  param([string]$Path)
  $entities = [ordered]@{
    people = @()
    projects = @(
      "landslide-monitoring-v2-mainline",
      "rk3568-field-gateway",
      "rk2206-xl01",
      "field-center",
      "desk-win"
    )
  }
  $json = $entities | ConvertTo-Json -Depth 4
  Set-Content -Path $Path -Value $json -Encoding utf8
}

Assert-Command -CommandName $PythonCommand

if ($ForceRecreateVenv -and (Test-Path $venvRoot)) {
  Remove-Item -LiteralPath $venvRoot -Recurse -Force
}

if (-not (Test-Path $toolRoot)) {
  New-Item -ItemType Directory -Path $toolRoot | Out-Null
}

if (-not (Test-Path $venvPython)) {
  & $PythonCommand -m venv $venvRoot
  if ($LASTEXITCODE -ne 0) {
    throw "python -m venv failed (exit=$LASTEXITCODE)"
  }
}

& $venvPython -m pip install --upgrade pip mempalace
if ($LASTEXITCODE -ne 0) {
  throw "pip install mempalace failed (exit=$LASTEXITCODE)"
}

if ($ForceInit -or -not (Test-Path $configPath)) {
  & $mempalaceExe --palace $palacePath init $repoRoot --yes
  if ($LASTEXITCODE -ne 0) {
    throw "mempalace init failed (exit=$LASTEXITCODE)"
  }
}

if ($ForceInit -or -not (Test-Path $entitiesPath)) {
  Write-ProjectEntities -Path $entitiesPath
}

[ordered]@{
  installed = $true
  repoRoot = $repoRoot
  mempalaceExe = $mempalaceExe
  palacePath = $palacePath
  configPath = $configPath
  entitiesPath = $entitiesPath
  nextUse = @(
    ".\mempalace.ps1 status",
    ".\mempalace.ps1 search 'AB stable C pending'",
    ".\mempalace.ps1 wake-up",
    "powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\refresh-mempalace-project-memory.ps1 -ResetPalace -Background"
  )
} | ConvertTo-Json -Depth 6
