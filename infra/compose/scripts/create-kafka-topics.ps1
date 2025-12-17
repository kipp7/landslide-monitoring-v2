$ErrorActionPreference = "Stop"

param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml"
)

function Import-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing env file: $path" }
  $lines = Get-Content -Encoding UTF8 $path
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.Length -eq 0) { continue }
    if ($t.StartsWith("#")) { continue }
    $idx = $t.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $t.Substring(0, $idx).Trim()
    $val = $t.Substring($idx + 1).Trim()
    if ($val.StartsWith('"') -and $val.EndsWith('"')) { $val = $val.Trim('"') }
    if ($val.StartsWith("'") -and $val.EndsWith("'")) { $val = $val.Trim("'") }
    Set-Item -Path "env:$key" -Value $val
  }
}

function Invoke-ComposeExec([string]$cmd) {
  docker compose -f $ComposeFile --env-file $EnvFile exec -T kafka bash -lc $cmd
}

Import-EnvFile $EnvFile

$topics = @(
  "telemetry.raw.v1",
  "telemetry.dlq.v1",
  "alerts.events.v1",
  "device.commands.v1",
  "device.command_acks.v1"
)

foreach ($t in $topics) {
  Write-Host "Ensuring topic: $t"
  Invoke-ComposeExec "kafka-topics.sh --bootstrap-server kafka:9092 --create --if-not-exists --topic $t --partitions 6 --replication-factor 1"
}

Write-Host "Done."
