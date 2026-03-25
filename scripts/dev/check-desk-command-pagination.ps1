$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$composeFile = Join-Path $repoRoot "infra/compose/docker-compose.yml"
$envFile = Join-Path $repoRoot "infra/compose/.env"
$tsFile = Join-Path $repoRoot "scripts/dev/check-desk-command-pagination.ts"

function Invoke-PostgresSql([string]$sql, [string]$label) {
  $sql | docker compose -f $composeFile --env-file $envFile exec -T postgres psql -v ON_ERROR_STOP=1 -U landslide -d landslide_monitor 1>$null
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed: $label (exit=$LASTEXITCODE)"
  }
}

$cleanupSql = @'
DELETE FROM device_command_events
WHERE command_id IN (
  SELECT command_id
  FROM device_commands
  WHERE command_type = 'desk_pagination_proof'
);

DELETE FROM device_commands
WHERE command_type = 'desk_pagination_proof';
'@

try {
  Invoke-PostgresSql $cleanupSql "cleanup previous desk command pagination proof"
  & (Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1") $tsFile
  if ($LASTEXITCODE -ne 0) {
    throw "desk command pagination proof failed (exit=$LASTEXITCODE)"
  }
} finally {
  Invoke-PostgresSql $cleanupSql "cleanup desk command pagination proof"
}

