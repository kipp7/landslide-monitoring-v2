param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$OutDirRoot = "backups/evidence"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\\..\\..")).Path
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outDir = Join-Path (Join-Path $repoRoot $OutDirRoot) $timestamp

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function Redact-Secrets([string]$content) {
  $out = $content

  # Common key=value patterns
  $out = $out -replace '(?im)^(.*?(PASSWORD|SECRET|TOKEN)\s*=\s*).+$', '$1***REDACTED***'
  $out = $out -replace '(?im)^(.*?(PG_PASSWORD|REDIS_PASSWORD|CH_PASSWORD|JWT_SECRET|EMQX_DASHBOARD_PASSWORD|EMQX_WEBHOOK_TOKEN|MQTT_INTERNAL_PASSWORD)\s*=\s*).+$', '$1***REDACTED***'

  # YAML-ish patterns (compose config, env lists)
  $out = $out -replace '(?im)^(\s*(password|secret|token)\s*:\s*).+$', '$1***REDACTED***'
  $out = $out -replace '(?im)^(\s*(PG_PASSWORD|REDIS_PASSWORD|CH_PASSWORD|JWT_SECRET|EMQX_DASHBOARD_PASSWORD|EMQX_WEBHOOK_TOKEN|MQTT_INTERNAL_PASSWORD)\s*:\s*).+$', '$1***REDACTED***'

  # Very common "Authorization: Bearer xxx" cases
  $out = $out -replace '(?im)^(authorization:\s*bearer\s+).+$', '$1***REDACTED***'
  $out = $out -replace '(?im)^(authorization:\s*basic\s+).+$', '$1***REDACTED***'

  return $out
}

function Write-Text([string]$name, [string]$content) {
  $path = Join-Path $outDir $name
  (Redact-Secrets $content) | Set-Content -Encoding UTF8 -NoNewline -LiteralPath $path
}

function Exec([string]$name, [scriptblock]$cmd) {
  try {
    $out = & $cmd 2>&1 | Out-String
    Write-Text $name $out
  } catch {
    Write-Text $name ("ERROR: " + $_.Exception.Message + "`n")
  }
}

Exec "docker-version.txt" { docker --version }
Exec "docker-compose-version.txt" { docker compose version }
Exec "docker-info.txt" { docker info }
Exec "docker-ps.txt" { docker ps -a }
Exec "compose-ps.txt" { docker compose -f $ComposeFile --env-file $EnvFile ps }
Exec "compose-config.txt" { docker compose -f $ComposeFile --env-file $EnvFile config }
Exec "logs-postgres.txt" { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=300 postgres }
Exec "logs-kafka.txt" { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=300 kafka }
Exec "logs-clickhouse.txt" { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=300 clickhouse }
Exec "logs-emqx.txt" { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=300 emqx }

Write-Host "Evidence bundle created:"
Write-Host $outDir
Write-Host "Note: do not commit evidence; backups/ is ignored by .gitignore."
