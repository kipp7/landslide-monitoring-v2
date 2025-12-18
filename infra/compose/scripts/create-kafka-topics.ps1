param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml"
)

$ErrorActionPreference = "Stop"

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

Import-EnvFile $EnvFile

function Assert-LastExitCode([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw "$message (exit=$LASTEXITCODE)" }
}

function Invoke-KafkaTopics([string[]]$kafkaArgs) {
  docker compose -f $ComposeFile --env-file $EnvFile exec -T kafka /opt/kafka/bin/kafka-topics.sh @kafkaArgs
}

Write-Host "Waiting for Kafka broker to be ready..." -ForegroundColor Cyan
$maxWaitSeconds = 120
$start = Get-Date
while ($true) {
  Invoke-KafkaTopics @("--bootstrap-server", "kafka:9092", "--list") 1>$null 2>$null
  if ($LASTEXITCODE -eq 0) { break }
  if (((Get-Date) - $start).TotalSeconds -gt $maxWaitSeconds) {
    throw "Kafka is not ready after ${maxWaitSeconds}s. Check: docker compose logs kafka"
  }
  Start-Sleep -Seconds 2
}
Write-Host "Kafka is ready." -ForegroundColor Green

$topics = @(
  "telemetry.raw.v1",
  "telemetry.dlq.v1",
  "alerts.events.v1",
  "device.commands.v1",
  "device.command_acks.v1"
)

foreach ($t in $topics) {
  Write-Host "Ensuring topic: $t"
  Invoke-KafkaTopics @(
    "--bootstrap-server", "kafka:9092",
    "--create", "--if-not-exists",
    "--topic", $t,
    "--partitions", "6",
    "--replication-factor", "1"
  ) 1>$null
  Assert-LastExitCode "kafka-topics create failed: $t"
}

Write-Host "Done."
