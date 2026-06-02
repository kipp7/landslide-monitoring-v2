[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 45,
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$EnvFile = "infra/compose/.env",
  [string]$DemoPhones = "13910010001",
  [ValidateSet("mock", "aliyun")]
  [string]$SmsProvider = "mock",
  [switch]$RealSend,
  [string]$OutFile = "docs/unified/reports/field-alert-sms-contact-library-proof-latest.json"
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

function Wait-ForCondition([scriptblock]$Condition, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $result = & $Condition
    if ($result) { return $result }
  }
  return $null
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

function Normalize-PhoneE164([string]$Phone) {
  $digits = ($Phone.Trim() -replace "[^\d+]", "")
  if ($digits.StartsWith("+86")) { return $digits }
  if ($digits.StartsWith("86") -and $digits.Length -eq 13) { return "+" + $digits }
  if ($digits -match "^1\d{10}$") { return "+86" + $digits }
  throw "Invalid China mainland mobile phone number: $Phone"
}

function Mask-Phone([string]$PhoneE164) {
  if ($PhoneE164.Length -le 7) { return "***" }
  return $PhoneE164.Substring(0, 3) + "****" + $PhoneE164.Substring($PhoneE164.Length - 4)
}

function Ensure-ContactSchema() {
  $schemaSql = @'
CREATE TABLE IF NOT EXISTS alert_contact_groups (
  group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code VARCHAR(80) NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  group_type VARCHAR(20) NOT NULL DEFAULT 'station'
    CHECK (group_type IN ('global', 'region', 'station', 'device')),
  province VARCHAR(50),
  city VARCHAR(50),
  district VARCHAR(50),
  region_code VARCHAR(80),
  station_id UUID REFERENCES stations(station_id) ON DELETE SET NULL,
  device_id UUID REFERENCES devices(device_id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_name TEXT NOT NULL,
  phone_e164 VARCHAR(32) NOT NULL UNIQUE,
  phone_country_code VARCHAR(8) NOT NULL DEFAULT '86',
  email VARCHAR(100),
  role_label VARCHAR(80),
  organization TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alert_contact_bindings (
  binding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES alert_contacts(contact_id) ON DELETE CASCADE,
  group_id UUID REFERENCES alert_contact_groups(group_id) ON DELETE CASCADE,
  station_id UUID REFERENCES stations(station_id) ON DELETE CASCADE,
  device_id UUID REFERENCES devices(device_id) ON DELETE CASCADE,
  region_code VARCHAR(80),
  min_severity VARCHAR(20) NOT NULL DEFAULT 'medium'
    CHECK (min_severity IN ('low', 'medium', 'high', 'critical')),
  notify_sms BOOLEAN NOT NULL DEFAULT TRUE,
  priority INT NOT NULL DEFAULT 100,
  duty_label VARCHAR(80),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (group_id IS NOT NULL OR station_id IS NOT NULL OR device_id IS NOT NULL OR region_code IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS alert_sms_delivery_jobs (
  sms_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES alert_events(event_id) ON DELETE CASCADE,
  contact_id UUID REFERENCES alert_contacts(contact_id) ON DELETE SET NULL,
  phone_e164 VARCHAR(32) NOT NULL,
  provider VARCHAR(30) NOT NULL DEFAULT 'mock',
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'skipped')),
  title TEXT,
  content TEXT,
  template_code VARCHAR(80),
  template_params JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_message_id TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, contact_id, phone_e164, provider)
);
'@
  Invoke-PostgresCommand $schemaSql
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  Import-EnvFile $EnvFile

  $phones = @(
    $DemoPhones.Split(",") |
      ForEach-Object { Normalize-PhoneE164 $_ } |
      Where-Object { $_.Length -gt 0 }
  )
  if ($phones.Count -lt 1) { throw "DemoPhones must contain at least one phone number" }

  $script:PgUser = if ($env:PG_USER) { $env:PG_USER } else { "landslide" }
  $script:PgDb = if ($env:PG_DATABASE) { $env:PG_DATABASE } else { "landslide_monitor" }
  $pgPassword = if ($env:PG_PASSWORD) { $env:PG_PASSWORD } else { "change-me" }
  $kafkaBrokers = if ($env:KAFKA_BROKERS) { $env:KAFKA_BROKERS.Replace("localhost", "127.0.0.1") } else { "127.0.0.1:9094" }

  npm --workspace services/alert-notify-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/alert-notify-worker" }

  Ensure-ContactSchema
  Ensure-KafkaTopic "alerts.events.v1"

  $runStamp = Get-Date -Format "yyyyMMddHHmmss"
  $stationId = [guid]::NewGuid().ToString()
  $deviceId = [guid]::NewGuid().ToString()
  $ruleId = [guid]::NewGuid().ToString()
  $alertId = [guid]::NewGuid().ToString()
  $eventId = [guid]::NewGuid().ToString()
  $createdTs = (Get-Date).ToUniversalTime().ToString("o")
  $groupCode = "sms-contact-demo-" + $runStamp

  $phoneSqlRows = New-Object "System.Collections.Generic.List[string]"
  for ($i = 0; $i -lt $phones.Count; $i++) {
    $idx = $i + 1
    $phoneSql = ConvertTo-SqlString $phones[$i]
    $nameSql = ConvertTo-SqlString ("短信联系人" + $idx)
    $roleSql = ConvertTo-SqlString "区域值班"
    [void]$phoneSqlRows.Add("(" + $nameSql + "," + $phoneSql + "," + $roleSql + ")")
  }
  $phoneValuesSql = [string]::Join(",`n", $phoneSqlRows)

  $seedSql = @"
WITH contact_values AS (
  SELECT contact_name, phone_e164, role_label
  FROM (VALUES
    $phoneValuesSql
  ) AS v(contact_name, phone_e164, role_label)
),
created_station AS (
  INSERT INTO stations (
    station_id, station_code, station_name, province, city, district, address, latitude, longitude, metadata
  )
  VALUES (
    '$stationId',
    'SMS-CONTACT-$runStamp',
    '联系人库短信联调监测区',
    '重庆市',
    '重庆市',
    '涪陵区',
    '联系人库短信联调区域',
    29.703,
    107.389,
    '{"note":"field_rehearsal_sms_contact","runStamp":"$runStamp","regionCode":"FULING-DEMO"}'::jsonb
  )
  RETURNING station_id
),
created_device AS (
  INSERT INTO devices (
    device_id, device_name, device_type, station_id, status, device_secret_hash, metadata
  )
  VALUES (
    '$deviceId',
    'field-rehearsal-sms-contact-device-$runStamp',
    'multi_sensor',
    '$stationId',
    'active',
    'demo-not-for-login',
    '{"note":"field_rehearsal_sms_contact","runStamp":"$runStamp"}'::jsonb
  )
  RETURNING device_id
),
created_group AS (
  INSERT INTO alert_contact_groups (
    group_code, group_name, group_type, province, city, district, region_code, station_id, is_active, metadata
  )
  VALUES (
    '$groupCode',
    '联系人库短信联调值班组',
    'station',
    '重庆市',
    '重庆市',
    '涪陵区',
    'FULING-DEMO',
    '$stationId',
    true,
    '{"note":"field_rehearsal_sms_contact","runStamp":"$runStamp"}'::jsonb
  )
  RETURNING group_id
),
created_contacts AS (
  INSERT INTO alert_contacts (contact_name, phone_e164, phone_country_code, role_label, organization, is_active, metadata)
  SELECT contact_name, phone_e164, '86', role_label, '演示值班组', true, '{"note":"field_rehearsal_sms_contact","runStamp":"$runStamp"}'::jsonb
  FROM contact_values
  RETURNING contact_id, phone_e164
),
created_bindings AS (
  INSERT INTO alert_contact_bindings (
    contact_id, group_id, station_id, region_code, min_severity, notify_sms, priority, duty_label, is_active, metadata
  )
  SELECT
    contact_id,
    (SELECT group_id FROM created_group),
    '$stationId',
    'FULING-DEMO',
    'low',
    true,
    10,
    '区域值班',
    true,
    '{"note":"field_rehearsal_sms_contact","runStamp":"$runStamp"}'::jsonb
  FROM created_contacts
  RETURNING binding_id
),
created_rule AS (
  INSERT INTO alert_rules (rule_id, rule_name, description, scope, station_id, is_active)
  VALUES (
    '$ruleId',
    '联系人库短信联调预警',
    '用于验证联系人库站点/区域短信发送链路',
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
    '{"dslVersion":1,"name":"sms-contact-library-demo","scope":{"type":"station"},"actions":[{"type":"emit_alert"}]}'::jsonb,
    '{"sensorKey":"displacement_velocity_mm_h","operator":">=","value":0.3}'::jsonb,
    '{"type":"points","points":1}'::jsonb,
    'high',
    true
  )
  RETURNING rule_id
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
  '联系人库短信联调预警',
  '联系人库演示监测区位移速率超过阈值，进入短信发送任务',
  '{"sensorKey":"displacement_velocity_mm_h","value":0.42,"threshold":0.3,"unit":"mm/h","demo":true}'::jsonb,
  'sms contact-library demo warning event inserted before Kafka publish',
  '$createdTs'::timestamptz
);
"@

  $notifyProc = $null
  $notifyOut = Join-Path $repoRoot (".tmp/sms-contact-worker-" + $runStamp + ".out.log")
  $notifyErr = Join-Path $repoRoot (".tmp/sms-contact-worker-" + $runStamp + ".err.log")
  try {
    Invoke-PostgresCommand $seedSql

    $notifyEnvPath = Join-Path $repoRoot "services/alert-notify-worker/.env"
    @(
      "SERVICE_NAME=alert-notify-worker",
      "KAFKA_BROKERS=$kafkaBrokers",
      ("KAFKA_CLIENT_ID=alert-notify-worker-contact-sms-" + $runStamp),
      ("KAFKA_GROUP_ID=alert-notify-worker-contact-sms-" + $runStamp),
      "KAFKA_TOPIC_ALERTS_EVENTS=alerts.events.v1",
      "POSTGRES_HOST=127.0.0.1",
      "POSTGRES_PORT=5432",
      "POSTGRES_USER=$script:PgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$script:PgDb",
      "POSTGRES_POOL_MAX=5",
      "NOTIFY_TYPE=sms",
      "SMS_RECIPIENT_MODE=contact_library",
      "SMS_PROVIDER=$SmsProvider",
      ("SMS_REAL_SEND_ENABLED=" + ($(if ($RealSend) { "true" } else { "false" }))),
      ("SMS_ALIYUN_ENDPOINT=" + ($(if ($env:SMS_ALIYUN_ENDPOINT) { $env:SMS_ALIYUN_ENDPOINT } else { "dysmsapi.aliyuncs.com" }))),
      ("SMS_ALIYUN_ACCESS_KEY_ID=" + $env:SMS_ALIYUN_ACCESS_KEY_ID),
      ("SMS_ALIYUN_ACCESS_KEY_SECRET=" + $env:SMS_ALIYUN_ACCESS_KEY_SECRET),
      ("SMS_ALIYUN_SIGN_NAME=" + $env:SMS_ALIYUN_SIGN_NAME),
      ("SMS_ALIYUN_TEMPLATE_CODE=" + $env:SMS_ALIYUN_TEMPLATE_CODE)
    ) -join [Environment]::NewLine | Set-Content -Path $notifyEnvPath -Encoding UTF8

    $tmpDir = Join-Path $repoRoot ".tmp"
    if (-not (Test-Path $tmpDir)) { New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null }
    $notifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/alert-notify-worker" -PassThru -WindowStyle Hidden -RedirectStandardOutput $notifyOut -RedirectStandardError $notifyErr
    Start-Sleep -Seconds 5
    if ($notifyProc.HasExited) { throw "alert-notify-worker exited early; check SMS provider env and credentials" }

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
      explain = "sms contact-library demo warning event published to alerts.events.v1"
    }
    $payloadJson = $eventPayload | ConvertTo-Json -Depth 8 -Compress
    $publishScript = @"
const { Kafka } = require("kafkajs");
const kafka = new Kafka({ clientId: "sms-contact-proof-publisher-$runStamp", brokers: "$kafkaBrokers".split(",") });
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
      if ($LASTEXITCODE -ne 0) { throw "Failed to publish sms contact-library proof alert event" }
    } finally {
      if ($null -eq $oldKafkaJsWarning) { Remove-Item Env:KAFKAJS_NO_PARTITIONER_WARNING -ErrorAction SilentlyContinue } else { $env:KAFKAJS_NO_PARTITIONER_WARNING = $oldKafkaJsWarning }
      if ($null -eq $oldNodeWarnings) { Remove-Item Env:NODE_NO_WARNINGS -ErrorAction SilentlyContinue } else { $env:NODE_NO_WARNINGS = $oldNodeWarnings }
    }

    $jobsJson = Wait-ForCondition {
      $sql = @"
SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json)::text
FROM (
  SELECT
    j.sms_job_id,
    j.provider,
    j.status,
    j.phone_e164,
    j.provider_message_id,
    j.error_message,
    c.contact_name,
    b.duty_label,
    g.group_code,
    g.group_name
  FROM alert_sms_delivery_jobs j
  JOIN alert_contacts c ON c.contact_id = j.contact_id
  JOIN alert_contact_bindings b ON b.contact_id = c.contact_id
  LEFT JOIN alert_contact_groups g ON g.group_id = b.group_id
  WHERE j.event_id = '$eventId'
  ORDER BY j.phone_e164
) t;
"@
      $text = Invoke-PostgresScalar $sql
      if (-not $text -or $text -eq "[]") { return $null }
      $rows = @($text | ConvertFrom-Json)
      if ($rows.Count -lt $phones.Count) { return $null }
      if (($rows | Where-Object { $_.status -eq "queued" }).Count -gt 0) { return $null }
      return $text
    } $TimeoutSeconds

    if (-not $jobsJson) {
      $outTail = if (Test-Path $notifyOut) { (Get-Content -LiteralPath $notifyOut -Tail 20 | Out-String).Trim() } else { "" }
      $errTail = if (Test-Path $notifyErr) { (Get-Content -LiteralPath $notifyErr -Tail 20 | Out-String).Trim() } else { "" }
      throw ("sms contact-library delivery jobs were not produced within timeout`nworker stdout:`n" + $outTail + "`nworker stderr:`n" + $errTail)
    }
    $jobs = @($jobsJson | ConvertFrom-Json)
    $expectedStatus = if ($SmsProvider -eq "aliyun" -and -not $RealSend) { "skipped" } else { "sent" }

    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      conclusion = if (($jobs | Where-Object { $_.status -eq $expectedStatus }).Count -eq $phones.Count) {
        "region-warning-produced-contact-library-sms-delivery-jobs"
      } else {
        "region-warning-contact-library-sms-needs-review"
      }
      provider = [ordered]@{
        name = $SmsProvider
        realSendEnabled = [bool]$RealSend
        expectedStatus = $expectedStatus
      }
      warning = [ordered]@{
        alertId = $alertId
        eventId = $eventId
        severity = "high"
        stationId = $stationId
        stationName = "联系人库短信联调监测区"
        deviceId = $deviceId
      }
      contactLibrary = @($jobs | ForEach-Object {
        [ordered]@{
          contactName = $_.contact_name
          phoneMasked = Mask-Phone ([string]$_.phone_e164)
          dutyLabel = $_.duty_label
          groupCode = $_.group_code
          groupName = $_.group_name
          provider = $_.provider
          status = $_.status
          providerMessageId = $_.provider_message_id
          errorMessage = $_.error_message
        }
      })
      notes = @(
        "This proof uses alert_contacts, alert_contact_groups and alert_contact_bindings instead of users.phone.",
        "The real phone number is used only in temporary local DB rows and is masked in this report.",
        "Set SmsProvider=aliyun and RealSend with approved Aliyun sign/template credentials to attempt real SMS delivery."
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

    $cleanupSql = @"
DELETE FROM alert_sms_delivery_jobs WHERE event_id = '$eventId';
DELETE FROM alert_notifications WHERE event_id = '$eventId';
DELETE FROM alert_events WHERE event_id = '$eventId';
DELETE FROM alert_contact_bindings WHERE metadata->>'runStamp' = '$runStamp';
DELETE FROM alert_contacts WHERE metadata->>'runStamp' = '$runStamp';
DELETE FROM alert_contact_groups WHERE metadata->>'runStamp' = '$runStamp';
DELETE FROM alert_rule_versions WHERE rule_id = '$ruleId';
DELETE FROM alert_rules WHERE rule_id = '$ruleId';
DELETE FROM devices WHERE device_id = '$deviceId';
DELETE FROM stations WHERE station_id = '$stationId';
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
