param(
  # Output root (recommended: under backups/ so it won't be committed)
  [string]$OutDir = "backups/releases",
  # Optional tag (defaults to timestamp)
  [string]$Tag = "",
  # Build docker images via compose (api + web)
  [switch]$BuildDockerImages,
  # Save docker images to a tar (offline delivery)
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

function Ensure-Dir([string]$path) {
  if (-not (Test-Path $path)) { New-Item -ItemType Directory -Force -Path $path | Out-Null }
}

function Write-Utf8File([string]$path, [string]$content) {
  $dir = Split-Path -Parent $path
  if ($dir) { Ensure-Dir $dir }
  Set-Content -Encoding UTF8 -Path $path -Value $content
}

function Require-Command([string]$cmd) {
  $p = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $p) { throw "Missing command: $cmd" }
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

Require-Command "git"

if (-not $Tag) { $Tag = Get-Date -Format "yyyyMMdd-HHmmss" }
$sha = (git rev-parse --short HEAD).Trim()

$bundleRoot = Join-Path $repoRoot $OutDir
Ensure-Dir $bundleRoot

$bundleName = "lsmv2-prod-$Tag-$sha"
$bundlePath = Join-Path $bundleRoot $bundleName
Ensure-Dir $bundlePath

$srcDir = Join-Path $bundlePath "src"
$imagesDir = Join-Path $bundlePath "images"
$deployDir = Join-Path $bundlePath "deploy"
Ensure-Dir $srcDir
Ensure-Dir $deployDir

Write-Host "=== lsmv2 brand package ===" -ForegroundColor Cyan
Write-Host "Repo:   $repoRoot" -ForegroundColor DarkGray
Write-Host "Bundle: $bundlePath" -ForegroundColor DarkGray
Write-Host ""

# 1) Source bundle (reproducible)
$srcZip = Join-Path $srcDir "lsmv2-src-$Tag-$sha.zip"
git archive --format=zip -o $srcZip HEAD
if ($LASTEXITCODE -ne 0) { throw "git archive failed (exit=$LASTEXITCODE)" }
Write-Host "Created source bundle: $srcZip" -ForegroundColor Green

# 2) Deploy bundle (compose + env template + helper scripts)
Copy-Item -Force "infra/compose/docker-compose.yml" (Join-Path $deployDir "docker-compose.yml")
Copy-Item -Force "infra/compose/docker-compose.app.yml" (Join-Path $deployDir "docker-compose.app.yml")
Copy-Item -Force "infra/compose/env.prod.example" (Join-Path $deployDir ".env.example")

Ensure-Dir (Join-Path $deployDir "postman")
Copy-Item -Force "docs/tools/postman/lsmv2.postman_collection.json" (Join-Path $deployDir "postman/lsmv2.postman_collection.json")
Copy-Item -Force "docs/tools/postman/lsmv2.local.postman_environment.json" (Join-Path $deployDir "postman/lsmv2.local.postman_environment.json")

Write-Utf8File (Join-Path $deployDir "start.ps1") @"
param([switch]`$WithOps)
`$ErrorActionPreference = "Stop"
`$here = Split-Path -Parent `$(Resolve-Path `"$PSCommandPath`")
Set-Location `$here

if (-not (Test-Path ".env")) {
  Copy-Item -Force ".env.example" ".env"
  Write-Host "Created .env from .env.example (please edit secrets before real production)." -ForegroundColor Yellow
}

`$args = @("-f", "docker-compose.yml", "-f", "docker-compose.app.yml", "--env-file", ".env")
if (`$WithOps) { `$args += @("--profile", "ops") }
docker compose @args up -d
"@

Write-Utf8File (Join-Path $deployDir "stop.ps1") @"
`$ErrorActionPreference = "Stop"
`$here = Split-Path -Parent `$(Resolve-Path `"$PSCommandPath`")
Set-Location `$here

docker compose -f docker-compose.yml -f docker-compose.app.yml --env-file .env down
"@

Write-Utf8File (Join-Path $deployDir "README.txt") @"
LSMv2 单机交付包（Docker Compose）

1) 安装 Docker Desktop（或 Linux Docker Engine）
2) 在本目录执行：powershell -ExecutionPolicy Bypass -File .\\start.ps1
3) 首次运行会生成 .env（从 .env.example 复制），请编辑其中的密码/密钥再用于真实生产

访问：
- Web: http://localhost:3000
- API: http://localhost:8080/health

可选运维：
- Kafka UI（可选）：powershell -ExecutionPolicy Bypass -File .\\start.ps1 -WithOps
- Postman：导入 postman/ 里的 collection + environment
"@

Write-Host "Created deploy bundle: $deployDir" -ForegroundColor Green

# 3) Docker images (optional)
if ($BuildDockerImages -or $SaveDockerImages) {
  Require-Command "docker"
  docker info 1>$null
  if ($LASTEXITCODE -ne 0) { throw "Docker daemon is not reachable. Start Docker Desktop and retry." }

  $composeBase = "infra/compose/docker-compose.yml"
  $composeApp = "infra/compose/docker-compose.app.yml"
  $envFile = "infra/compose/env.prod.example"

  if ($BuildDockerImages) {
    Write-Host ""
    Write-Host "Building docker images (api + web)..." -ForegroundColor Cyan
    docker compose -f $composeBase -f $composeApp --env-file $envFile build
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed (exit=$LASTEXITCODE)" }
  }

  if ($SaveDockerImages) {
    Ensure-Dir $imagesDir
    Write-Host ""
    Write-Host "Saving docker images (offline)..." -ForegroundColor Cyan
    $imgTar = Join-Path $imagesDir "lsmv2-images-$Tag-$sha.tar"
    docker save lsmv2/api-service:latest lsmv2/web:latest -o $imgTar
    if ($LASTEXITCODE -ne 0) { throw "docker save failed (exit=$LASTEXITCODE)" }
    Write-Host "Created image bundle: $imgTar" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Done." -ForegroundColor Green

