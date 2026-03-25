[CmdletBinding()]
param(
  [int]$HttpPort = 18093,
  [int]$TimeoutSeconds = 45,
  [string]$OutFile = "docs/unified/reports/field-sequence-semantic-proofs-latest.json"
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

function Publish-Sample([string]$BaseUrl, [string]$SampleName, [string]$DeviceId) {
  $payload = Read-JsonFile (Join-Path $repoRoot ("docs/tools/field-rehearsal/payload-samples/" + $SampleName + ".json"))
  $payload | Add-Member -NotePropertyName "device_id" -NotePropertyValue $DeviceId -Force
  $payload | Add-Member -NotePropertyName "received_ts" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
  $payload | Add-Member -NotePropertyName "event_ts" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
  return Invoke-RestMethod ($BaseUrl + "/iot/huawei/telemetry") -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 10
}

function Query-DeviceState([string]$DeviceId) {
  $sql = "SELECT version, state #>> '{metrics,tilt_x_deg}' AS tilt_x_deg, state #>> '{metrics,tilt_y_deg}' AS tilt_y_deg, state #>> '{metrics,battery_pct}' AS battery_pct FROM device_state WHERE device_id = '$DeviceId';"
  $out = $sql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $($pgEnv["POSTGRES_USER"]) -d $($pgEnv["POSTGRES_DB"]) -At 2>$null
  $text = ($out | Out-String).Trim()
  if (-not $text) { return $null }
  $parts = $text.Split("|")
  return [pscustomobject]@{
    version = [int]$parts[0]
    tilt_x_deg = [double]$parts[1]
    tilt_y_deg = [double]$parts[2]
    battery_pct = [double]$parts[3]
  }
}

function Query-SeqCounts([string]$DeviceId) {
  $sql = "SELECT toString(seq) AS seq, count() AS row_count FROM landslide.telemetry_raw WHERE device_id = '$DeviceId' GROUP BY seq ORDER BY seq FORMAT JSONEachRow"
  $out = docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T clickhouse clickhouse-client --user $($chEnv["CLICKHOUSE_USER"]) --password $($chEnv["CLICKHOUSE_PASSWORD"]) --database $($chEnv["CLICKHOUSE_DB"]) --query $sql 2>$null | Out-String
  $lines = @($out -split "`r?`n" | Where-Object { $_.Trim().Length -gt 0 })
  $rows = @()
  foreach ($line in $lines) {
    $rows += ($line | ConvertFrom-Json)
  }
  return $rows
}

function Wait-ForFullPath([string]$DeviceId, [int]$ExpectedTotalRows) {
  return Wait-ForCondition {
    $state = Query-DeviceState $DeviceId
    $seqs = Query-SeqCounts $DeviceId
    $totalRows = (@($seqs) | ForEach-Object { [int]$_.row_count } | Measure-Object -Sum).Sum
    if ($state -and $totalRows -ge $ExpectedTotalRows) {
      return [pscustomobject]@{
        state = $state
        seqs = $seqs
      }
    }
    return $null
  } $TimeoutSeconds
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $pgEnv = Get-DockerEnvMap "lsmv2_postgres"
  $chEnv = Get-DockerEnvMap "lsmv2_clickhouse"
  $runStamp = Get-Date -Format "yyyyMMddHHmmss"
  $adapterEnvPath = Join-Path $repoRoot "services/huawei-iot-adapter/.env"
  $writerEnvPath = Join-Path $repoRoot "services/telemetry-writer/.env"

  npm --workspace services/huawei-iot-adapter run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/huawei-iot-adapter" }
  npm --workspace services/telemetry-writer run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/telemetry-writer" }

  @(
    "SERVICE_NAME=huawei-iot-adapter",
    "HTTP_HOST=127.0.0.1",
    ("HTTP_PORT=" + $HttpPort),
    "IOT_HTTP_TOKEN=",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=huawei-iot-adapter-seq-" + $runStamp),
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1"
  ) -join [Environment]::NewLine | Set-Content -Path $adapterEnvPath -Encoding UTF8

  @(
    "SERVICE_NAME=telemetry-writer",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=telemetry-writer-seq-" + $runStamp),
    ("KAFKA_GROUP_ID=telemetry-writer-seq-" + $runStamp),
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
    "HIGH_FREQUENCY_BUDGET_BYTES=192",
    "DLQ_RAW_PAYLOAD_MAX_BYTES=65536",
    "STATS_LOG_INTERVAL_MS=30000"
  ) -join [Environment]::NewLine | Set-Content -Path $writerEnvPath -Encoding UTF8

  $adapterProc = $null
  $writerProc = $null
  try {
    $adapterProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/huawei-iot-adapter" -PassThru
    $writerProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/telemetry-writer" -PassThru

    $baseUrl = "http://127.0.0.1:$HttpPort"
    if (-not (Wait-ForHttpOk ($baseUrl + "/health") 20 "Post")) {
      throw "huawei-iot-adapter did not become healthy"
    }
    Start-Sleep -Seconds 12

    $scenarios = @(
      [pscustomobject]@{ name = "duplicate"; baseline = "hf-normal"; followup = "hf-duplicate"; expectedTiltX = 0.18 },
      [pscustomobject]@{ name = "out_of_order"; baseline = "hf-normal"; followup = "hf-out-of-order"; expectedTiltX = 0.14 },
      [pscustomobject]@{ name = "replay"; baseline = "hf-normal"; followup = "hf-replay"; expectedTiltX = 0.22 }
    )

    $results = [System.Collections.Generic.List[object]]::new()
    foreach ($scenario in $scenarios) {
      $createRaw = powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/create-field-rehearsal-device.ps1" | Out-String
      $createText = $createRaw.Trim()
      if ($createText.Length -gt 0 -and [int][char]$createText[0] -eq 65279) {
        $createText = $createText.Substring(1)
      }
      $created = $createText | ConvertFrom-Json
      $deviceId = [string]$created.data.deviceId

      Publish-Sample $baseUrl $scenario.baseline $deviceId | Out-Null
      Start-Sleep -Seconds 2
      Publish-Sample $baseUrl $scenario.followup $deviceId | Out-Null

      $observed = Wait-ForFullPath $deviceId 4
      if (-not $observed) {
        $results.Add([ordered]@{
          scenario = $scenario.name
          ok = $false
          deviceId = $deviceId
          error = "full path did not stabilize in time"
        }) | Out-Null
        continue
      }

      $state = $observed.state
      $seqs = @($observed.seqs)
      $baselineSeq = (Read-JsonFile (Join-Path $repoRoot ("docs/tools/field-rehearsal/payload-samples/" + $scenario.baseline + ".json"))).seq
      $followupSeq = (Read-JsonFile (Join-Path $repoRoot ("docs/tools/field-rehearsal/payload-samples/" + $scenario.followup + ".json"))).seq
      $baselineRowCount = [int](@($seqs | Where-Object { $_.seq -eq "$baselineSeq" } | Select-Object -First 1).row_count)
      $followupRowCount = [int](@($seqs | Where-Object { $_.seq -eq "$followupSeq" } | Select-Object -First 1).row_count)

      $conclusion = switch ($scenario.name) {
        "duplicate" {
          if ($baselineRowCount -gt 4) { "duplicate-currently-persists-without-idempotency" } else { "duplicate-idempotency-guard-present" }
        }
        "out_of_order" {
          if ($followupRowCount -gt 0 -or [Math]::Abs([double]$state.tilt_x_deg - [double]$scenario.expectedTiltX) -lt 0.0001) {
            "older-seq-currently-overwrites-latest-state"
          } else {
            "ordering-guard-present"
          }
        }
        "replay" {
          if ($followupRowCount -gt 0 -or [Math]::Abs([double]$state.tilt_x_deg - [double]$scenario.expectedTiltX) -lt 0.0001) {
            "replay-currently-overwrites-latest-state"
          } else {
            "replay-guard-present"
          }
        }
      }

      $results.Add([ordered]@{
        scenario = $scenario.name
        ok = $true
        deviceId = $deviceId
        baselineSample = $scenario.baseline
        followupSample = $scenario.followup
        state = $state
        seqCounts = $seqs
        conclusion = $conclusion
      }) | Out-Null
    }

    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      scenarios = $results
      notes = @(
        "duplicate checks whether identical seq payloads persist duplicate rows.",
        "out_of_order and replay check whether lower seq followups overwrite the latest device_state."
      )
    }

    $fullOutFile = Join-Path $repoRoot $OutFile
    $outDir = Split-Path -Parent $fullOutFile
    if ($outDir -and -not (Test-Path $outDir)) {
      New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $json = $report | ConvertTo-Json -Depth 8
    Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
    $json
  } finally {
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
    if ($adapterProc -and -not $adapterProc.HasExited) { Stop-Process -Id $adapterProc.Id -Force }
    if ($writerProc -and -not $writerProc.HasExited) { Stop-Process -Id $writerProc.Id -Force }
  }
} finally {
  Pop-Location
}
