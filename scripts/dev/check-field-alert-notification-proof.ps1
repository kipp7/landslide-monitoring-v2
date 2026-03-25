[CmdletBinding()]
param(
  [int]$HttpPort = 18100,
  [int]$ApiPort = 18080,
  [int]$TimeoutSeconds = 45,
  [string]$OutFile = "docs/unified/reports/field-alert-notification-proof-latest.json"
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
  $payload = Read-JsonText (Get-Content -Raw -Encoding UTF8 (Join-Path $repoRoot ("docs/tools/field-rehearsal/payload-samples/" + $SampleName + ".json")))
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
  npm --workspace services/alert-notify-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/alert-notify-worker" }
  npm --workspace services/api run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/api" }

  $adapterEnvPath = Join-Path $repoRoot "services/huawei-iot-adapter/.env"
  $ruleEnvPath = Join-Path $repoRoot "services/rule-engine-worker/.env"
  $notifyEnvPath = Join-Path $repoRoot "services/alert-notify-worker/.env"
  $apiEnv = docker inspect lsmv2_api --format "{{json .Config.Env}}" | ConvertFrom-Json
  $apiEnvMap = @{}
  foreach ($line in $apiEnv) {
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }
    $apiEnvMap[$line.Substring(0, $idx)] = $line.Substring($idx + 1)
  }
  $runStamp = Get-Date -Format "yyyyMMddHHmmss"

  @(
    "SERVICE_NAME=huawei-iot-adapter",
    "HTTP_HOST=127.0.0.1",
    ("HTTP_PORT=" + $HttpPort),
    "IOT_HTTP_TOKEN=",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=huawei-iot-adapter-notify-" + $runStamp),
    "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1"
  ) -join [Environment]::NewLine | Set-Content -Path $adapterEnvPath -Encoding UTF8

  @(
    "SERVICE_NAME=rule-engine-worker",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=rule-engine-worker-notify-" + $runStamp),
    ("KAFKA_GROUP_ID=rule-engine-worker-notify-" + $runStamp),
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

  @(
    "SERVICE_NAME=alert-notify-worker",
    "KAFKA_BROKERS=127.0.0.1:9094",
    ("KAFKA_CLIENT_ID=alert-notify-worker-" + $runStamp),
    ("KAFKA_GROUP_ID=alert-notify-worker-" + $runStamp),
    "KAFKA_TOPIC_ALERTS_EVENTS=alerts.events.v1",
    "POSTGRES_HOST=127.0.0.1",
    "POSTGRES_PORT=5432",
    "POSTGRES_USER=landslide",
    "POSTGRES_PASSWORD=3idpB3urbHv_wuPEG-4NGPWcu0ySr5dj",
    "POSTGRES_DATABASE=landslide_monitor",
    "POSTGRES_POOL_MAX=5",
    "NOTIFY_TYPE=app"
  ) -join [Environment]::NewLine | Set-Content -Path $notifyEnvPath -Encoding UTF8

  $adapterProc = $null
  $ruleProc = $null
  $notifyProc = $null
  $apiProc = $null
  $ruleId = $null
  $subscriptionDeviceId = $null
  try {
    $env:SERVICE_NAME = "api-service-alert-notify-proof"
    $env:API_HOST = "127.0.0.1"
    $env:API_PORT = [string]$ApiPort
    $env:AUTH_REQUIRED = "false"
    $env:POSTGRES_HOST = "127.0.0.1"
    $env:POSTGRES_PORT = $apiEnvMap["POSTGRES_PORT"]
    $env:POSTGRES_USER = $apiEnvMap["POSTGRES_USER"]
    $env:POSTGRES_PASSWORD = $apiEnvMap["POSTGRES_PASSWORD"]
    $env:POSTGRES_DATABASE = $apiEnvMap["POSTGRES_DATABASE"]
    $env:CLICKHOUSE_URL = "http://127.0.0.1:8123"
    $env:CLICKHOUSE_USERNAME = $apiEnvMap["CLICKHOUSE_USERNAME"]
    $env:CLICKHOUSE_PASSWORD = $apiEnvMap["CLICKHOUSE_PASSWORD"]
    $env:CLICKHOUSE_DATABASE = $apiEnvMap["CLICKHOUSE_DATABASE"]
    $env:CLICKHOUSE_TABLE = $apiEnvMap["CLICKHOUSE_TABLE"]
    $env:KAFKA_BROKERS = "127.0.0.1:9094"
    $apiProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/api" -PassThru
    $adapterProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/huawei-iot-adapter" -PassThru
    $ruleProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/rule-engine-worker" -PassThru
    $notifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/alert-notify-worker" -PassThru

    $adapterBaseUrl = "http://127.0.0.1:$HttpPort"
    $apiBaseUrl = "http://127.0.0.1:$ApiPort/api/v1"
    if (-not (Wait-ForHttpOk "http://127.0.0.1:$ApiPort/health" 30 "Get")) {
      throw "local api-service did not become healthy"
    }
    if (-not (Wait-ForHttpOk ($adapterBaseUrl + "/health") 20 "Post")) {
      throw "huawei-iot-adapter did not become healthy"
    }
    Start-Sleep -Seconds 6

    $login = Invoke-RestMethod -Method Post -Uri ($apiBaseUrl + "/auth/login") -ContentType "application/json" -Body '{"username":"admin","password":"123456"}' -TimeoutSec 10
    $token = [string]$login.data.token
    $userId = [string]$login.data.user.userId
    $headers = @{ Authorization = "Bearer $token"; Accept = "application/json" }

    $createRaw = powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/create-field-rehearsal-device.ps1" | Out-String
    $created = Read-JsonText $createRaw
    $deviceId = [string]$created.data.deviceId
    $subscriptionDeviceId = $deviceId

    Invoke-ApiJson "Put" "$apiBaseUrl/devices/$deviceId/sensors" @{
      sensors = @(
        @{ sensorKey = "tilt_x_deg"; status = "enabled" },
        @{ sensorKey = "humidity_pct"; status = "enabled" }
      )
    } $headers | Out-Null

    $subscriptionSql = @"
INSERT INTO user_alert_subscriptions (user_id, device_id, min_severity, notify_app, is_active)
VALUES ('$userId', '$deviceId', 'low', true, true)
ON CONFLICT (user_id, device_id, station_id)
DO UPDATE SET min_severity='low', notify_app=true, is_active=true, updated_at=NOW();
"@
    $subscriptionSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U landslide -d landslide_monitor 1>$null 2>$null

    $ruleBody = @{
      rule = @{
        ruleName = "missing-humidity-notify-" + $deviceId.Substring(0, 8)
        description = "field missing humidity notify proof"
        scope = @{ type = "device"; deviceId = $deviceId }
        isActive = $true
      }
      dsl = @{
        dslVersion = 1
        name = "missing-humidity-notify"
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
    $ruleResp = Invoke-ApiJson "Post" "$apiBaseUrl/alert-rules" $ruleBody $headers
    $ruleId = [string]$ruleResp.data.ruleId

    Start-Sleep -Seconds 4
    Publish-Sample $adapterBaseUrl "hf-normal" $deviceId | Out-Null

    $notification = Wait-ForCondition {
      $sql = @"
SELECT
  n.notification_id,
  e.alert_id,
  n.status,
  n.notify_type,
  n.title,
  e.event_type
FROM alert_notifications n
JOIN alert_events e ON e.event_id = n.event_id
WHERE e.rule_id = '$ruleId'
  AND e.device_id = '$deviceId'
ORDER BY n.created_at DESC
LIMIT 1;
"@
      $out = $sql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U landslide -d landslide_monitor -At 2>$null
      $text = ($out | Out-String).Trim()
      if (-not $text) { return $null }
      $parts = $text.Split("|")
      return [pscustomobject]@{
        notificationId = [string]$parts[0]
        alertId = [string]$parts[1]
        status = [string]$parts[2]
        notifyType = [string]$parts[3]
        title = [string]$parts[4]
        eventType = [string]$parts[5]
      }
    } $TimeoutSeconds

    $listResp = Invoke-ApiJson "Get" "$apiBaseUrl/alerts/$($notification.alertId)/notifications?page=1&pageSize=20" $null $headers
    $statsBefore = Invoke-ApiJson "Get" "$apiBaseUrl/alerts/$($notification.alertId)/notifications/stats" $null $headers
    $detailResp = Invoke-ApiJson "Get" "$apiBaseUrl/alerts/$($notification.alertId)/notifications/$($notification.notificationId)" $null $headers
    $readResp = Invoke-ApiJson "Put" "$apiBaseUrl/alerts/$($notification.alertId)/notifications/$($notification.notificationId)/read" @{} $headers
    $statsAfter = Invoke-ApiJson "Get" "$apiBaseUrl/alerts/$($notification.alertId)/notifications/stats" $null $headers

    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      deviceId = $deviceId
      userId = $userId
      notification = $notification
      conclusion = if (
        $notification -and
        $notification.notifyType -eq "app" -and
        $notification.eventType -eq "ALERT_TRIGGER" -and
        @($listResp.data.list).Count -ge 1 -and
        [int]$statsBefore.data.totals.unread -ge 1 -and
        [string]$detailResp.data.notificationId -eq [string]$notification.notificationId -and
        [string]$readResp.data.notificationId -eq [string]$notification.notificationId -and
        [int]$statsAfter.data.totals.unread -eq 0
      ) {
        "missing-alert-now-produces-readable-alert-notification"
      } else {
        "missing-alert-notification-behavior-needs-review"
      }
      notes = @(
        "The proof inserts a user_alert_subscription for the admin user and the target device.",
        "A declared humidity sensor missing from hf-normal should trigger an alert notification.",
        "The new alert notification APIs should support list, stats, detail, and mark-as-read."
      )
      api = [ordered]@{
        list = $listResp.data
        statsBefore = $statsBefore.data
        detail = $detailResp.data
        read = $readResp.data
        statsAfter = $statsAfter.data
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
  } finally {
    if ($subscriptionDeviceId) {
      $cleanupSql = @"
DELETE FROM alert_notifications WHERE event_id IN (SELECT event_id FROM alert_events WHERE device_id = '$subscriptionDeviceId');
DELETE FROM alert_events WHERE device_id = '$subscriptionDeviceId';
DELETE FROM user_alert_subscriptions WHERE device_id = '$subscriptionDeviceId';
"@
      $cleanupSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U landslide -d landslide_monitor 1>$null 2>$null
    }
    if ($ruleId) {
      $sql = @"
DELETE FROM alert_rule_versions WHERE rule_id = '$ruleId';
DELETE FROM alert_rules WHERE rule_id = '$ruleId';
"@
      $sql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U landslide -d landslide_monitor 1>$null 2>$null
    }
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
    if ($apiProc -and -not $apiProc.HasExited) { Stop-Process -Id $apiProc.Id -Force }
    if ($adapterProc -and -not $adapterProc.HasExited) { Stop-Process -Id $adapterProc.Id -Force }
    if ($ruleProc -and -not $ruleProc.HasExited) { Stop-Process -Id $ruleProc.Id -Force }
    if ($notifyProc -and -not $notifyProc.HasExited) { Stop-Process -Id $notifyProc.Id -Force }
  }
} finally {
  Pop-Location
}
