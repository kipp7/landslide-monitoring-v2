param(
  [string]$OutDir = "release",
  [string]$Tag = "",
  [switch]$BuildDockerImages,
  [switch]$SaveDockerImages
)

$ErrorActionPreference = "Stop"

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

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

if (-not $Tag) { $Tag = Get-Date -Format "yyyyMMdd-HHmmss" }
$sha = (git rev-parse --short HEAD).Trim()
$outPath = Join-Path $repoRoot $OutDir
New-Item -ItemType Directory -Force -Path $outPath | Out-Null

Write-Host "=== lsmv2 production package ===" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot" -ForegroundColor DarkGray
Write-Host "Tag:  $Tag ($sha)" -ForegroundColor DarkGray
Write-Host ""

$srcZip = Join-Path $outPath "lsmv2-src-$Tag-$sha.zip"
git archive --format=zip -o $srcZip HEAD
if ($LASTEXITCODE -ne 0) { throw "git archive failed (exit=$LASTEXITCODE)" }
Write-Host "Created source bundle: $srcZip" -ForegroundColor Green

if ($BuildDockerImages -or $SaveDockerImages) {
  $composeBase = "infra/compose/docker-compose.yml"
  $composeApp = "infra/compose/docker-compose.app.yml"
  $envFile = "infra/compose/.env"

  if (-not (Test-Path $envFile)) {
    Write-Host "Missing $envFile, creating from env.prod.example..." -ForegroundColor Yellow
    Copy-Item -Force "infra/compose/env.prod.example" $envFile
  }

  if ($BuildDockerImages) {
    Write-Host ""
    Write-Host "Building docker images..." -ForegroundColor Cyan
    docker compose -f $composeBase -f $composeApp --env-file $envFile build
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed (exit=$LASTEXITCODE)" }
  }

  if ($SaveDockerImages) {
    Write-Host ""
    Write-Host "Saving docker images..." -ForegroundColor Cyan
    $imgTar = Join-Path $outPath "lsmv2-images-$Tag-$sha.tar"
    docker save lsmv2/api-service:latest lsmv2/web:latest -o $imgTar
    if ($LASTEXITCODE -ne 0) { throw "docker save failed (exit=$LASTEXITCODE)" }
    Write-Host "Created image bundle: $imgTar" -ForegroundColor Green
  }
}

