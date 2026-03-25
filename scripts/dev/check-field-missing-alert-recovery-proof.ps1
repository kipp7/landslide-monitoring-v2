[CmdletBinding()]
param(
  [int]$HttpPort = 18099,
  [int]$TimeoutSeconds = 45,
  [string]$OutFile = "docs/unified/reports/field-missing-alert-recovery-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonText([string]$Text) {
  $raw = $Text.Trim()
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

function Read-JsonFile([string]$Path) {
  return Read-JsonText (Get-Content -Raw -Encoding UTF8 $Path)
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

function Invoke-ApiJson([string]$Method, [string]$Url, $Body = $null, [hashtable]$Headers = @{}) {
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -TimeoutSec 15
  }
  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 15
}

function Publish-Sample([string]$BaseUrl, [string]$SampleName, [string]$DeviceId) {
  $payload = Read-JsonFile (Join-Path $repoRoot ("docs/tools/field-rehearsal/payload-samples/" + $SampleName + ".json"))
  $payload | Add-Member -NotePropertyName "device_id" -NotePropertyValue $DeviceId -Force
  $payload | Add-Member -NotePropertyName "received_ts" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
  $payload | Add-Member -NotePropertyName "event_ts" -NotePropertyValue ((Get-Date).ToUniversalTime().ToString("o")) -Force
  return Invoke-RestMethod ($BaseUrl + "/iot/huawei/telemetry") -Method Post -ContentType "application/json" -Body ($payload | ConvertTo-Json -Depth 8 -Compress) -TimeoutSec 10
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  npm --workspace services/huawei-iot-adapter run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/huawei-iot-adapter" }
  npm --workspace services/rule-engine-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/rule-engine-worker" }

  $adapterEnvPath = Join-Path $repoRoot "services/huawei-iot-adapter/.env"
  $ruleEnvPath = Join-Path $repoRoot "services/rule-engine-worker/.env"
  $runStamp = Get-Date -Format "yyyyMMddHHmmss"

  @(
    "SERVICE_NAME=huawei-iot-adapter",
    "HTTP_HOST=127.0.0.1",
    ("HTTP_PORT=" + $HttpPort),
    "IOT_HTTP_TOKEN=",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=huawei-iot-adapter-missing-recovery-" + $runStamp),
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1"
  ) -join [Environment]::NewLine | Set-Content -Path $adapterEnvPath -Encoding UTF8

  @(
    "SERVICE_NAME=rule-engine-worker",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=rule-engine-worker-missing-recovery-" + $runStamp),
    ("KAFKA_GROUP_ID=rule-engine-worker-missing-recovery-" + $runStamp),
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
    "KAFKA_TOPIC_ALERTS_EVENTS=alerts.events.v1",
    "POSTGRES_HOST=127.0.0.1",
    "POSTGRES_PORT=5432",
    "POSTGRES_USER=landslide",
    "POSTGRES_PASSWORD=3idpB3urbHv_wuPEG-4NGPWcu0ySr5dj",
    "POSTGRES_DATABASE=landslide_monitor",
    "POSTGRES_POOL_MAX=5",
    "RULES_REFRESH_MS=2000",
    "MAX_POINTS_PER_RULE=600"
  ) -join [Environment]::NewLine | Set-Content -Path $ruleEnvPath -Encoding UTF8

  $adapterProc = $null
  $ruleProc = $null
  $ruleId = $null
  try {
    $adapterProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/huawei-iot-adapter" -PassThru
    $ruleProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/rule-engine-worker" -PassThru

    $adapterBaseUrl = "http://127.0.0.1:$HttpPort"
    if (-not (Wait-ForHttpOk ($adapterBaseUrl + "/health") 20 "Post")) {
      throw "huawei-iot-adapter did not become healthy"
    }
    Start-Sleep -Seconds 6

    $login = Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:8080/api/v1/auth/login" -ContentType "application/json" -Body '{"username":"admin","password":"123456"}' -TimeoutSec 10
    $token = [string]$login.data.token
    $headers = @{ Authorization = "Bearer $token"; Accept = "application/json" }

    $createRaw = powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/create-field-rehearsal-device.ps1" | Out-String
    $created = Read-JsonText $createRaw
    $deviceId = [string]$created.data.deviceId

    Invoke-ApiJson "Put" "http://127.0.0.1:8080/api/v1/devices/$deviceId/sensors" @{
      sensors = @(
        @{ sensorKey = "tilt_x_deg"; status = "enabled" },
        @{ sensorKey = "humidity_pct"; status = "enabled" }
      )
    } $headers | Out-Null

    $ruleBody = @{
      rule = @{
        ruleName = "missing-humidity-recovery-" + $deviceId.Substring(0, 8)
        description = "field missing humidity recovery proof"
        scope = @{ type = "device"; deviceId = $deviceId }
        isActive = $true
      }
      dsl = @{
        dslVersion = 1
        name = "missing-humidity-recovery"
        scope = @{ type = "device"; deviceId = $deviceId }
        enabled = $true
        severity = "medium"
        cooldown = @{ minutes = 1 }
        timeField = "received"
        missing = @{ policy = "raise_missing_alert"; sensorKeys = @("humidity_pct") }
        when = @{
          sensorKey = "humidity_pct"
          operator = ">="
          value = 0
        }
        window = @{ type = "points"; points = 1 }
        actions = @(
          @{ type = "emit_alert"; titleTemplate = "humidity missing"; messageTemplate = "humidity missing" }
        )
      }
    }
    $ruleResp = Invoke-ApiJson "Post" "http://127.0.0.1:8080/api/v1/alert-rules" $ruleBody $headers
    $ruleId = [string]$ruleResp.data.ruleId
    Start-Sleep -Seconds 4

    Publish-Sample $adapterBaseUrl "hf-normal" $deviceId | Out-Null

    $triggered = Wait-ForCondition {
      $alerts = Invoke-ApiJson "Get" "http://127.0.0.1:8080/api/v1/alerts?deviceId=$deviceId&page=1&pageSize=20" $null $headers
      $match = @($alerts.data.list | Where-Object { $_.title -eq "humidity missing" -and $_.status -eq "active" } | Select-Object -First 1)
      if ($match) { return $match }
      return $null
    } $TimeoutSeconds
    if (-not $triggered) {
      throw "missing alert did not trigger"
    }

    Publish-Sample $adapterBaseUrl "lf-meta" $deviceId | Out-Null

    $resolved = Wait-ForCondition {
      $alerts = Invoke-ApiJson "Get" "http://127.0.0.1:8080/api/v1/alerts?deviceId=$deviceId&page=1&pageSize=20" $null $headers
      $match = @($alerts.data.list | Where-Object { $_.alertId -eq $triggered.alertId -and $_.status -eq "resolved" } | Select-Object -First 1)
      if ($match) { return $match }
      return $null
    } $TimeoutSeconds

    $events = Invoke-ApiJson "Get" "http://127.0.0.1:8080/api/v1/alerts/$($triggered.alertId)/events" $null $headers
    $eventTypes = @($events.data.events | ForEach-Object { $_.eventType })

    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      deviceId = $deviceId
      alertId = $triggered.alertId
      eventTypes = $eventTypes
      conclusion = if ($resolved -and $eventTypes -contains "ALERT_TRIGGER" -and $eventTypes -contains "ALERT_RESOLVE") {
        "missing-alert-now-resolves-when-sensor-recovers"
      } else {
        "missing-alert-recovery-behavior-needs-review"
      }
      notes = @(
        "hf-normal does not contain humidity_pct, so a declared humidity sensor should trigger a missing alert.",
        "lf-meta restores humidity_pct, so the missing alert should resolve."
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
    if ($ruleId) {
      $sql = @"
DELETE FROM alert_events WHERE rule_id = '$ruleId';
DELETE FROM alert_rule_versions WHERE rule_id = '$ruleId';
DELETE FROM alert_rules WHERE rule_id = '$ruleId';
"@
      $sql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U landslide -d landslide_monitor 1>$null 2>$null
    }
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
    if ($adapterProc -and -not $adapterProc.HasExited) { Stop-Process -Id $adapterProc.Id -Force }
    if ($ruleProc -and -not $ruleProc.HasExited) { Stop-Process -Id $ruleProc.Id -Force }
  }
} finally {
  Pop-Location
}
