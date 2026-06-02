[CmdletBinding()]
param(
  [int]$ApiPort = 18081,
  [int]$TimeoutSeconds = 45,
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$EnvFile = "infra/compose/.env",
  [string]$DemoPhones = "13910010001,13910010002",
  [string]$OutFile = "docs/unified/reports/field-alert-sms-notification-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Import-EnvFile([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Missing env file: $Path" }
  foreach ($line in (Get-Content -Encoding UTF8 $Path)) {
    $trimmed = $line.Trim()
    if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) { continue }
    $idx = $trimmed.IndexOf("=")
    if ($idx -lt 1) { continue }
    $key = $trimmed.Substring(0, $idx).Trim()
    $value = $trimmed.Substring($idx + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) { $value = $value.Trim('"') }
    if ($value.StartsWith("'") -and $value.EndsWith("'")) { $value = $value.Trim("'") }
    Set-Item -Path "env:$key" -Value $value
  }
}

function Wait-ForHttpOk([string]$Url, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    try {
      $resp = Invoke-RestMethod $Url -Method Get -TimeoutSec 2
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

function Invoke-PostgresScalar([string]$Sql) {
  $result = $Sql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $script:PgUser -d $script:PgDb -At
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL scalar query failed" }
  return ($result | Out-String).Trim()
}

function Invoke-PostgresCommand([string]$Sql) {
  $Sql | docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $script:PgUser -d $script:PgDb 1>$null
  if ($LASTEXITCODE -ne 0) { throw "PostgreSQL command failed" }
}

function Ensure-KafkaTopic([string]$Topic) {
  docker compose -f $ComposeFile --env-file $EnvFile exec -T kafka /opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --create --if-not-exists --topic $Topic --partitions 1 --replication-factor 1 1>$null
  if ($LASTEXITCODE -ne 0) { throw "Failed to ensure Kafka topic: $Topic" }
}

function ConvertTo-SqlString([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  Import-EnvFile $EnvFile

  $phones = @(
    $DemoPhones.Split(",") |
      ForEach-Object { $_.Trim() } |
      Where-Object { $_.Length -gt 0 }
  )
  if ($phones.Count -lt 1) { throw "DemoPhones must contain at least one phone number" }
  foreach ($phone in $phones) {
    if ($phone -notmatch "^1\d{10}$") { throw "Invalid demo phone number: $phone" }
  }

  $script:PgUser = if ($env:PG_USER) { $env:PG_USER } else { "landslide" }
  $script:PgDb = if ($env:PG_DATABASE) { $env:PG_DATABASE } else { "landslide_monitor" }
  $pgPassword = if ($env:PG_PASSWORD) { $env:PG_PASSWORD } else { "change-me" }
  $chUser = if ($env:CH_USER) { $env:CH_USER } else { "landslide" }
  $chPassword = if ($env:CH_PASSWORD) { $env:CH_PASSWORD } else { "change-me" }
  $chDatabase = if ($env:CH_DATABASE) { $env:CH_DATABASE } else { "landslide" }
  $kafkaBrokers = if ($env:KAFKA_BROKERS) { $env:KAFKA_BROKERS.Replace("localhost", "127.0.0.1") } else { "127.0.0.1:9094" }

  npm --workspace services/alert-notify-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/alert-notify-worker" }
  npm --workspace services/api run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/api" }

  Ensure-KafkaTopic "alerts.events.v1"

  $runStamp = Get-Date -Format "yyyyMMddHHmmss"
  $stationId = [guid]::NewGuid().ToString()
  $deviceId = [guid]::NewGuid().ToString()
  $ruleId = [guid]::NewGuid().ToString()
  $alertId = [guid]::NewGuid().ToString()
  $eventId = [guid]::NewGuid().ToString()
  $createdTs = (Get-Date).ToUniversalTime().ToString("o")
  $phoneSqlRows = New-Object "System.Collections.Generic.List[string]"
  for ($i = 0; $i -lt $phones.Count; $i++) {
    $idx = $i + 1
    $usernameSql = ConvertTo-SqlString ("field_rehearsal_sms_" + $runStamp + "_" + $idx.ToString("00"))
    $phoneSql = ConvertTo-SqlString $phones[$i]
    $realNameSql = ConvertTo-SqlString ("短信演示接收人" + $idx)
    $rowSql = "(" + $usernameSql + "," + $phoneSql + "," + $realNameSql + ")"
    [void]$phoneSqlRows.Add($rowSql)
  }
  $phoneValuesSql = [string]::Join(",`n", $phoneSqlRows)

  $seedSql = @"
WITH demo_users AS (
  SELECT username, phone, real_name
  FROM (VALUES
    $phoneValuesSql
  ) AS v(username, phone, real_name)
),
created_station AS (
  INSERT INTO stations (
    station_id, station_code, station_name, province, city, district, address, latitude, longitude, metadata
  )
  VALUES (
    '$stationId',
    'SMS-DEMO-$runStamp',
    '短信联调演示监测区',
    '重庆市',
    '重庆市',
    '涪陵区',
    '短信联调演示区域',
    29.703,
    107.389,
    '{"note":"field_rehearsal_sms","runStamp":"$runStamp","regionName":"短信联调演示监测区"}'::jsonb
  )
  RETURNING station_id
),
created_device AS (
  INSERT INTO devices (
    device_id, device_name, device_type, station_id, status, device_secret_hash, metadata
  )
  VALUES (
    '$deviceId',
    'field-rehearsal-sms-device-$runStamp',
    'multi_sensor',
    '$stationId',
    'active',
    'demo-not-for-login',
    '{"note":"field_rehearsal_sms","runStamp":"$runStamp"}'::jsonb
  )
  RETURNING device_id
),
upserted_users AS (
  INSERT INTO users (username, password_hash, phone, real_name, status)
  SELECT username, 'demo-not-for-login', phone, real_name, 'active'
  FROM demo_users
  RETURNING user_id, phone
),
created_rule AS (
  INSERT INTO alert_rules (rule_id, rule_name, description, scope, station_id, is_active)
  VALUES (
    '$ruleId',
    '短信联调站点预警',
    '用于验证站点/区域预警触发后进入短信通知队列',
    'station',
    '$stationId',
    true
  )
  RETURNING rule_id
),
created_rule_version AS (
  INSERT INTO alert_rule_versions (
    rule_id, rule_version, dsl_version, dsl_json, conditions, window_json, severity, enabled
  )
  VALUES (
    '$ruleId',
    1,
    1,
    '{"dslVersion":1,"name":"sms-demo-region-warning","scope":{"type":"station"},"actions":[{"type":"emit_alert"}]}'::jsonb,
    '{"sensorKey":"displacement_velocity_mm_h","operator":">=","value":0.3}'::jsonb,
    '{"type":"points","points":1}'::jsonb,
    'high',
    true
  )
  RETURNING rule_id
),
created_subscriptions AS (
  INSERT INTO user_alert_subscriptions (
    user_id, station_id, min_severity, notify_app, notify_sms, notify_email, is_active
  )
  SELECT user_id, '$stationId', 'low', false, true, false, true
  FROM upserted_users
  RETURNING subscription_id
)
INSERT INTO alert_events (
  event_id, alert_id, event_type, rule_id, rule_version, device_id, station_id, severity, title, message, evidence, explain, created_at
)
VALUES (
  '$eventId',
  '$alertId',
  'ALERT_TRIGGER',
  '$ruleId',
  1,
  '$deviceId',
  '$stationId',
  'high',
  '短信联调演示预警',
  '演示监测区位移速率超过阈值，进入短信通知队列',
  '{"sensorKey":"displacement_velocity_mm_h","value":0.42,"threshold":0.3,"unit":"mm/h","demo":true}'::jsonb,
  'sms demo warning event inserted before Kafka publish',
  '$createdTs'::timestamptz
);
"@

  $apiProc = $null
  $notifyProc = $null
  try {
    Invoke-PostgresCommand $seedSql

    $env:SERVICE_NAME = "api-service-alert-sms-proof"
    $env:API_HOST = "127.0.0.1"
    $env:API_PORT = [string]$ApiPort
    $env:AUTH_REQUIRED = "false"
    $env:POSTGRES_HOST = "127.0.0.1"
    $env:POSTGRES_PORT = "5432"
    $env:POSTGRES_USER = $script:PgUser
    $env:POSTGRES_PASSWORD = $pgPassword
    $env:POSTGRES_DATABASE = $script:PgDb
    $env:CLICKHOUSE_URL = "http://127.0.0.1:8123"
    $env:CLICKHOUSE_USERNAME = $chUser
    $env:CLICKHOUSE_PASSWORD = $chPassword
    $env:CLICKHOUSE_DATABASE = $chDatabase
    $env:CLICKHOUSE_TABLE = "telemetry_raw"
    $env:KAFKA_BROKERS = $kafkaBrokers

    $notifyEnvPath = Join-Path $repoRoot "services/alert-notify-worker/.env"
    @(
      "SERVICE_NAME=alert-notify-worker",
      "KAFKA_BROKERS=$kafkaBrokers",
      ("KAFKA_CLIENT_ID=alert-notify-worker-sms-" + $runStamp),
      ("KAFKA_GROUP_ID=alert-notify-worker-sms-" + $runStamp),
      "KAFKA_TOPIC_ALERTS_EVENTS=alerts.events.v1",
      "POSTGRES_HOST=127.0.0.1",
      "POSTGRES_PORT=5432",
      "POSTGRES_USER=$script:PgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$script:PgDb",
      "POSTGRES_POOL_MAX=5",
      "NOTIFY_TYPE=sms"
    ) -join [Environment]::NewLine | Set-Content -Path $notifyEnvPath -Encoding UTF8

    $apiProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/api" -PassThru -WindowStyle Hidden
    $notifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/alert-notify-worker" -PassThru -WindowStyle Hidden

    if (-not (Wait-ForHttpOk "http://127.0.0.1:$ApiPort/health" 30)) {
      throw "local api-service did not become healthy"
    }
    $apiBaseUrl = "http://127.0.0.1:$ApiPort/api/v1"
    $login = Invoke-ApiJson "Post" "$apiBaseUrl/auth/login" @{ username = "admin"; password = "123456" }
    $headers = @{ Authorization = "Bearer $($login.data.token)"; Accept = "application/json" }
    Start-Sleep -Seconds 5

    $eventPayload = [ordered]@{
      schema_version = 1
      alert_id = $alertId
      event_id = $eventId
      event_type = "ALERT_TRIGGER"
      created_ts = $createdTs
      rule_id = $ruleId
      rule_version = 1
      severity = "high"
      device_id = $deviceId
      station_id = $stationId
      evidence = [ordered]@{
        sensorKey = "displacement_velocity_mm_h"
        value = 0.42
        threshold = 0.3
        unit = "mm/h"
        demo = $true
      }
      explain = "sms demo warning event published to alerts.events.v1"
    }
    $payloadJson = $eventPayload | ConvertTo-Json -Depth 8 -Compress
    $publishScript = @"
const { Kafka } = require("kafkajs");
const kafka = new Kafka({ clientId: "sms-proof-publisher-$runStamp", brokers: "$kafkaBrokers".split(",") });
const producer = kafka.producer();
(async () => {
  await producer.connect();
  await producer.send({
    topic: "alerts.events.v1",
    messages: [{ key: "$alertId", value: process.argv[1] }]
  });
  await producer.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
"@
    $oldKafkaJsWarning = $env:KAFKAJS_NO_PARTITIONER_WARNING
    $oldNodeWarnings = $env:NODE_NO_WARNINGS
    $env:KAFKAJS_NO_PARTITIONER_WARNING = "1"
    $env:NODE_NO_WARNINGS = "1"
    try {
      node -e $publishScript $payloadJson
      if ($LASTEXITCODE -ne 0) { throw "Failed to publish sms proof alert event" }
    } finally {
      if ($null -eq $oldKafkaJsWarning) { Remove-Item Env:KAFKAJS_NO_PARTITIONER_WARNING -ErrorAction SilentlyContinue } else { $env:KAFKAJS_NO_PARTITIONER_WARNING = $oldKafkaJsWarning }
      if ($null -eq $oldNodeWarnings) { Remove-Item Env:NODE_NO_WARNINGS -ErrorAction SilentlyContinue } else { $env:NODE_NO_WARNINGS = $oldNodeWarnings }
    }

    $notificationRowsJson = Wait-ForCondition {
      $sql = @"
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
FROM (
  SELECT
    n.notification_id,
    n.notify_type,
    n.status,
    n.title,
    u.user_id,
    u.real_name,
    u.phone,
    s.station_code,
    s.station_name
  FROM alert_notifications n
  JOIN users u ON u.user_id = n.user_id
  JOIN alert_events e ON e.event_id = n.event_id
  LEFT JOIN stations s ON s.station_id = e.station_id
  WHERE n.event_id = '$eventId'
    AND n.notify_type = 'sms'
  ORDER BY u.phone
) t;
"@
      $text = Invoke-PostgresScalar $sql
      if (-not $text -or $text -eq "[]") { return $null }
      $rows = $text | ConvertFrom-Json
      if (@($rows).Count -lt $phones.Count) { return $null }
      return $text
    } $TimeoutSeconds

    if (-not $notificationRowsJson) {
      throw "sms notifications were not produced within timeout"
    }

    $listResp = Invoke-ApiJson "Get" "$apiBaseUrl/alerts/$alertId/notifications?page=1&pageSize=20&notifyType=sms" $null $headers
    $statsResp = Invoke-ApiJson "Get" "$apiBaseUrl/alerts/$alertId/notifications/stats?notifyType=sms" $null $headers

    $notificationRows = @($notificationRowsJson | ConvertFrom-Json)
    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      conclusion = if (
        $notificationRows.Count -eq $phones.Count -and
        [int]$statsResp.data.totals.total -eq $phones.Count -and
        @($listResp.data.list).Count -eq $phones.Count
      ) {
        "region-warning-produced-sms-notifications-for-demo-phone-library"
      } else {
        "region-warning-sms-notification-needs-review"
      }
      warning = [ordered]@{
        alertId = $alertId
        eventId = $eventId
        severity = "high"
        stationId = $stationId
        stationName = "短信联调演示监测区"
        deviceId = $deviceId
      }
      demoPhoneLibrary = @($notificationRows | ForEach-Object {
        [ordered]@{
          userId = $_.user_id
          realName = $_.real_name
          phone = $_.phone
          stationCode = $_.station_code
          stationName = $_.station_name
        }
      })
      notifications = $notificationRows
      api = [ordered]@{
        list = $listResp.data
        stats = $statsResp.data
      }
      notes = @(
        "This proof uses users.phone as the demo phone library and user_alert_subscriptions.station_id as the region/station binding.",
        "alert-notify-worker runs with NOTIFY_TYPE=sms and writes alert_notifications rows with notify_type=sms.",
        "No external SMS provider is called in this proof; it validates the queue/record stage before Aliyun/Tencent SMS integration."
      )
    }

    $fullOutFile = Join-Path $repoRoot $OutFile
    $outDir = Split-Path -Parent $fullOutFile
    if ($outDir -and -not (Test-Path $outDir)) {
      New-Item -ItemType Directory -Path $outDir -Force | Out-Null
    }
    $json = $report | ConvertTo-Json -Depth 10
    Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
    $json
  } finally {
    if ($notifyProc -and -not $notifyProc.HasExited) { Stop-Process -Id $notifyProc.Id -Force }
    if ($apiProc -and -not $apiProc.HasExited) { Stop-Process -Id $apiProc.Id -Force }

    $cleanupSql = @"
DELETE FROM alert_notifications WHERE event_id = '$eventId';
DELETE FROM alert_events WHERE event_id = '$eventId';
DELETE FROM user_alert_subscriptions WHERE station_id = '$stationId';
DELETE FROM alert_rule_versions WHERE rule_id = '$ruleId';
DELETE FROM alert_rules WHERE rule_id = '$ruleId';
DELETE FROM devices WHERE device_id = '$deviceId';
DELETE FROM stations WHERE station_id = '$stationId';
DELETE FROM users WHERE username LIKE 'field_rehearsal_sms_$runStamp%';
"@
    try {
      Invoke-PostgresCommand $cleanupSql
    } catch {
      Write-Warning ("cleanup failed: " + $_.Exception.Message)
    }
  }
} finally {
  Pop-Location
}
