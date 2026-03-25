[CmdletBinding()]
param(
  [string]$Sample = "hf-normal",
  [int]$HttpPort = 18091,
  [int]$TimeoutSeconds = 45,
  [string]$OutFile = "docs/unified/reports/field-http-full-path-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile([string]$Path) {
  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

function Read-KafkaOffsets() {
  $text = docker exec lsmv2_kafka /opt/kafka/bin/kafka-get-offsets.sh --bootstrap-server kafka:9092 --topic telemetry.raw.v1 2>$null | Out-String
  $lines = @($text -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })
  $entries = @()
  foreach ($line in $lines) {
    $parts = $line.Split(":")
    if ($parts.Count -lt 3) { continue }
    $entries += [pscustomobject]@{
      topic = $parts[0]
      partition = [int]$parts[1]
      offset = [int64]$parts[2]
    }
  }
  return $entries
}

function Describe-ConsumerGroup([string]$GroupId) {
  try {
    $out = docker exec lsmv2_kafka /opt/kafka/bin/kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group $GroupId 2>&1 | Out-String
    return $out.Trim()
  } catch {
    return ("consumer-group-describe-failed: " + (($_ | Out-String).Trim()))
  }
}

function Get-OffsetDelta($Before, $After) {
  $beforeMap = @{}
  foreach ($entry in @($Before)) {
    $beforeMap["$($entry.partition)"] = [int64]$entry.offset
  }

  $delta = @()
  foreach ($entry in @($After)) {
    $previous = if ($beforeMap.ContainsKey("$($entry.partition)")) { [int64]$beforeMap["$($entry.partition)"] } else { 0 }
    $delta += [pscustomobject]@{
      partition = [int]$entry.partition
      before = $previous
      after = [int64]$entry.offset
      delta = [int64]$entry.offset - $previous
    }
  }
  return $delta
}

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

function Wait-ForHttpOk([string]$Url, [int]$TimeoutSeconds, [string]$Method = "Get") {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    try {
      $resp = Invoke-RestMethod $Url -Method $Method -TimeoutSec 2
      if ($resp.ok -eq $true) { return $true }
    } catch {
    }
  }
  return $false
}

function Wait-ForCondition([scriptblock]$Condition, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $result = & $Condition
    if ($result) { return $result }
  }
  return $null
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $samplePath = Join-Path $repoRoot ("docs/tools/field-rehearsal/payload-samples/" + $Sample + ".json")
  if (-not (Test-Path $samplePath)) {
    throw "Sample not found: $samplePath"
  }

  $apiEnv = Get-DockerEnvMap "lsmv2_api"
  $pgEnv = Get-DockerEnvMap "lsmv2_postgres"
  $chEnv = Get-DockerEnvMap "lsmv2_clickhouse"
  $runStamp = Get-Date -Format "yyyyMMddHHmmss"

  npm --workspace services/huawei-iot-adapter run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/huawei-iot-adapter" }
  npm --workspace services/telemetry-writer run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/telemetry-writer" }

  $adapterEnvPath = Join-Path $repoRoot "services/huawei-iot-adapter/.env"
  $writerEnvPath = Join-Path $repoRoot "services/telemetry-writer/.env"

  @(
    "SERVICE_NAME=huawei-iot-adapter",
    "HTTP_HOST=127.0.0.1",
    ("HTTP_PORT=" + $HttpPort),
    "IOT_HTTP_TOKEN=",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=huawei-iot-adapter-proof-" + $runStamp),
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1"
  ) -join [Environment]::NewLine | Set-Content -Path $adapterEnvPath -Encoding UTF8

  $writerGroupId = "telemetry-writer-proof-" + $runStamp

  @(
    "SERVICE_NAME=telemetry-writer",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=telemetry-writer-proof-" + $runStamp),
    ("KAFKA_GROUP_ID=" + $writerGroupId),
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
    "DLQ_RAW_PAYLOAD_MAX_BYTES=65536",
    "STATS_LOG_INTERVAL_MS=30000"
  ) -join [Environment]::NewLine | Set-Content -Path $writerEnvPath -Encoding UTF8

  $logDir = Join-Path $repoRoot ("backups/evidence/field-http-full-path-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $adapterOut = Join-Path $logDir "adapter.stdout.log"
  $adapterErr = Join-Path $logDir "adapter.stderr.log"
  $writerOut = Join-Path $logDir "writer.stdout.log"
  $writerErr = Join-Path $logDir "writer.stderr.log"

  $adapterProc = $null
  $writerProc = $null
  $createdDevice = $null
  try {
    $adapterProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/huawei-iot-adapter" -PassThru -RedirectStandardOutput $adapterOut -RedirectStandardError $adapterErr
    $writerProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/telemetry-writer" -PassThru -RedirectStandardOutput $writerOut -RedirectStandardError $writerErr

    $adapterBaseUrl = "http://127.0.0.1:$HttpPort"
    if (-not (Wait-ForHttpOk ($adapterBaseUrl + "/health") 20 "Post")) {
      throw "huawei-iot-adapter did not become healthy"
    }

    Start-Sleep -Seconds 12
    if ($writerProc.HasExited) {
      throw "telemetry-writer exited early"
    }

    $payload = Read-JsonFile $samplePath
    $createRaw = powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/create-field-rehearsal-device.ps1" | Out-String
    $createdRaw = $createRaw.Trim()
    if ($createdRaw.Length -gt 0 -and [int][char]$createdRaw[0] -eq 65279) {
      $createdRaw = $createdRaw.Substring(1)
    }
    $createdDevice = $createdRaw | ConvertFrom-Json
    $deviceId = [string]$createdDevice.data.deviceId
    $payload | Add-Member -NotePropertyName "device_id" -NotePropertyValue $deviceId -Force
    $payload | Add-Member -NotePropertyName "received_ts" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
    $payload | Add-Member -NotePropertyName "event_ts" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
    $payload | Add-Member -NotePropertyName "seq" -NotePropertyValue (700000 + (Get-Random -Minimum 1 -Maximum 9999)) -Force

    $kafkaOffsetsBefore = Read-KafkaOffsets
    $publishResp = Invoke-RestMethod ($adapterBaseUrl + "/iot/huawei/telemetry") -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 10
    Start-Sleep -Seconds 2
    $kafkaOffsetsAfter = Read-KafkaOffsets
    $kafkaOffsetDelta = Get-OffsetDelta $kafkaOffsetsBefore $kafkaOffsetsAfter
    Start-Sleep -Seconds 3
    $consumerGroup = Describe-ConsumerGroup $writerGroupId

    $pgQuery = "SELECT version, updated_at, state::text FROM device_state WHERE device_id = '$deviceId';"
    $chQuery = "SELECT sensor_key, toString(received_ts) AS received_ts, seq, value_f64, value_i64, value_str, value_bool FROM landslide.telemetry_raw WHERE device_id = '$deviceId' ORDER BY received_ts DESC LIMIT 20"

    $pgResult = Wait-ForCondition {
      $out = $pgQuery | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $($pgEnv["POSTGRES_USER"]) -d $($pgEnv["POSTGRES_DB"]) -At 2>$null
      $text = ($out | Out-String).Trim()
      if ($text) { return $text }
      return $null
    } $TimeoutSeconds

    $chResult = Wait-ForCondition {
      $out = docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T clickhouse clickhouse-client --user $($chEnv["CLICKHOUSE_USER"]) --password $($chEnv["CLICKHOUSE_PASSWORD"]) --database $($chEnv["CLICKHOUSE_DB"]) --query $chQuery 2>$null
      $text = ($out | Out-String).Trim()
      if ($text) { return $text }
      return $null
    } $TimeoutSeconds

    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      sample = $Sample
      deviceId = $deviceId
      createdDevice = [ordered]@{
        deviceId = $deviceId
        secretFile = $createdDevice.secretFile
      }
      boundary = if ($pgResult -and $chResult) { "full-path-ok" } else { "downstream-not-confirmed" }
      publish = $publishResp
      kafka = [ordered]@{
        writerGroupId = $writerGroupId
        offsetsBefore = $kafkaOffsetsBefore
        offsetsAfter = $kafkaOffsetsAfter
        offsetDelta = $kafkaOffsetDelta
        anyOffsetAdvanced = (@($kafkaOffsetDelta | Where-Object { $_.delta -gt 0 }).Count -gt 0)
        consumerGroup = $consumerGroup
      }
      postgresShadowObserved = [bool]$pgResult
      clickhouseObserved = [bool]$chResult
      postgresShadow = $pgResult
      clickhouseRows = $chResult
      logs = [ordered]@{
        adapterBaseUrl = $adapterBaseUrl
        adapterStdout = $adapterOut
        adapterStderr = $adapterErr
        writerStdout = $writerOut
        writerStderr = $writerErr
      }
    }

    $fullOutFile = Join-Path $repoRoot $OutFile
    $outDir = Split-Path -Parent $fullOutFile
    if ($outDir -and -not (Test-Path $outDir)) {
      New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $json = $report | ConvertTo-Json -Depth 8
    Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
    $json

    if (-not $pgResult -or -not $chResult) {
      throw "field http full path proof did not confirm downstream persistence"
    }
  } finally {
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
    if ($adapterProc -and -not $adapterProc.HasExited) { Stop-Process -Id $adapterProc.Id -Force }
    if ($writerProc -and -not $writerProc.HasExited) { Stop-Process -Id $writerProc.Id -Force }
  }
} finally {
  Pop-Location
}
