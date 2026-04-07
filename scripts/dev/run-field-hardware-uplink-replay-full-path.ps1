[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$PayloadFile = "docs/tools/field-rehearsal/payload-samples/hf-hardware-real-20260406-seq21.json",
  [string]$OutFile = "docs/unified/reports/field-hardware-uplink-replay-latest.json",
  [int]$TimeoutMs = 45000,
  [int]$PollMs = 2000
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-DockerEnvMap([string]$Container) {
  $json = docker inspect $Container --format "{{json .Config.Env}}"
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to inspect container env: $Container"
  }
  $envList = $json | ConvertFrom-Json
  $map = @{}
  foreach ($line in $envList) {
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }
    $map[$line.Substring(0, $idx)] = $line.Substring($idx + 1)
  }
  return $map
}

function Read-EnvValue([string]$Path, [string]$Key, [string]$Fallback = "") {
  if (-not (Test-Path $Path)) { return $Fallback }
  $line = Get-Content $Path | Where-Object { $_ -match ("^" + [regex]::Escape($Key) + "=") } | Select-Object -Last 1
  if (-not $line) { return $Fallback }
  return $line.Substring($Key.Length + 1)
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $apiEnvPath = Join-Path $repoRoot "services/api/.env"
  $pgEnv = Get-DockerEnvMap "lsmv2_postgres"
  $chEnv = Get-DockerEnvMap "lsmv2_clickhouse"

  $mqttInternalUsername = Read-EnvValue -Path $apiEnvPath -Key "MQTT_INTERNAL_USERNAME" -Fallback "ingest-service"
  $mqttInternalPassword = Read-EnvValue -Path $apiEnvPath -Key "MQTT_INTERNAL_PASSWORD" -Fallback ""
  if ([string]::IsNullOrWhiteSpace($mqttInternalPassword)) {
    throw "MQTT_INTERNAL_PASSWORD missing in services/api/.env"
  }

  npm --workspace services/ingest run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/ingest" }
  npm --workspace services/telemetry-writer run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/telemetry-writer" }

  @(
    "SERVICE_NAME=ingest-service",
    "MQTT_URL=mqtt://127.0.0.1:1883",
    ("MQTT_USERNAME=" + $mqttInternalUsername),
    ("MQTT_PASSWORD=" + $mqttInternalPassword),
    "MQTT_TOPIC_TELEMETRY=telemetry/+",
    "MQTT_TOPIC_PRESENCE=presence/+",
    "MESSAGE_MAX_BYTES=262144",
    "METRICS_MAX_KEYS=500",
    "DLQ_RAW_PAYLOAD_MAX_BYTES=65536",
    "KAFKA_BROKERS=127.0.0.1:9094",
    "KAFKA_CLIENT_ID=ingest-field-hardware-replay",
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
    "KAFKA_TOPIC_TELEMETRY_DLQ=telemetry.dlq.v1",
    "KAFKA_TOPIC_PRESENCE_EVENTS=presence.events.v1"
  ) -join [Environment]::NewLine | Set-Content -Path (Join-Path $repoRoot "services/ingest/.env") -Encoding UTF8

  @(
    "SERVICE_NAME=telemetry-writer",
    "KAFKA_BROKERS=127.0.0.1:9094",
    "KAFKA_CLIENT_ID=telemetry-writer-field-hardware-replay",
    "KAFKA_GROUP_ID=telemetry-writer-field-hardware-replay",
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
    "KAFKA_TOPIC_TELEMETRY_DLQ=telemetry.dlq.v1",
    "CLICKHOUSE_URL=http://127.0.0.1:8123",
    ("CLICKHOUSE_USERNAME=" + $chEnv["CLICKHOUSE_USER"]),
    ("CLICKHOUSE_PASSWORD=" + $chEnv["CLICKHOUSE_PASSWORD"]),
    ("CLICKHOUSE_DATABASE=" + $chEnv["CLICKHOUSE_DB"]),
    "CLICKHOUSE_TABLE=telemetry_raw",
    "POSTGRES_HOST=127.0.0.1",
    "POSTGRES_PORT=5432",
    ("POSTGRES_USER=" + $pgEnv["POSTGRES_USER"]),
    ("POSTGRES_PASSWORD=" + $pgEnv["POSTGRES_PASSWORD"]),
    ("POSTGRES_DATABASE=" + $pgEnv["POSTGRES_DB"]),
    "POSTGRES_POOL_MAX=5",
    "BATCH_MAX_ROWS=2000",
    "BATCH_MAX_MESSAGES=500",
    "BATCH_FLUSH_INTERVAL_MS=1000",
    "MESSAGE_MAX_BYTES=262144",
    "HIGH_FREQUENCY_BUDGET_BYTES=2048",
    "DLQ_RAW_PAYLOAD_MAX_BYTES=65536",
    "STATS_LOG_INTERVAL_MS=30000"
  ) -join [Environment]::NewLine | Set-Content -Path (Join-Path $repoRoot "services/telemetry-writer/.env") -Encoding UTF8

  $logDir = Join-Path $repoRoot ".tmp/field-hardware-uplink-replay-host"
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $ingestOut = Join-Path $logDir "ingest.stdout.log"
  $ingestErr = Join-Path $logDir "ingest.stderr.log"
  $writerOut = Join-Path $logDir "writer.stdout.log"
  $writerErr = Join-Path $logDir "writer.stderr.log"

  $ingestProc = $null
  $writerProc = $null
  try {
    $ingestProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory (Join-Path $repoRoot "services/ingest") -PassThru -RedirectStandardOutput $ingestOut -RedirectStandardError $ingestErr
    $writerProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory (Join-Path $repoRoot "services/telemetry-writer") -PassThru -RedirectStandardOutput $writerOut -RedirectStandardError $writerErr

    Start-Sleep -Seconds 12
    if ($ingestProc.HasExited) {
      throw "ingest-service exited early. stderr: $(Get-Content -Raw $ingestErr)"
    }
    if ($writerProc.HasExited) {
      throw "telemetry-writer exited early. stderr: $(Get-Content -Raw $writerErr)"
    }

    powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-field-hardware-uplink-replay.ps1" `
      -ApiBaseUrl $ApiBaseUrl `
      -MqttUrl $MqttUrl `
      -Username $Username `
      -Password $Password `
      -PayloadFile $PayloadFile `
      -OutFile $OutFile `
      -TimeoutMs $TimeoutMs `
      -PollMs $PollMs

    if ($LASTEXITCODE -ne 0) {
      throw "run-field-hardware-uplink-replay.ps1 failed (exit=$LASTEXITCODE)"
    }
  } finally {
    if ($ingestProc -and -not $ingestProc.HasExited) { Stop-Process -Id $ingestProc.Id -Force }
    if ($writerProc -and -not $writerProc.HasExited) { Stop-Process -Id $writerProc.Id -Force }
  }
} finally {
  Pop-Location
}
