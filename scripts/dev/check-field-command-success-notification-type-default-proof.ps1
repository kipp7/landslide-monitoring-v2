[CmdletBinding()]
param(
  [int]$ApiPort = 18088,
  [int]$TimeoutSeconds = 45,
  [string]$OutFile = "docs/unified/reports/field-command-success-notification-type-default-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Wait-ForLogMatch([string]$Path, [string]$Pattern, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $Path) {
      try {
        if (Select-String -Path $Path -Pattern $Pattern -Quiet) { return $true }
      } catch {
      }
    }
    Start-Sleep -Seconds 1
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

function Resolve-FreePort([int]$PreferredPort) {
  for ($port = $PreferredPort; $port -lt ($PreferredPort + 20); $port++) {
    $listener = $null
    try {
      $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
      $listener.Start()
      return $port
    } catch {
    } finally {
      if ($listener) {
        try { $listener.Stop() } catch {}
      }
    }
  }
  throw "No free localhost port found starting from $PreferredPort"
}

function Invoke-ApiJson([string]$Method, [string]$Url, $Body = $null, [hashtable]$Headers = @{}) {
  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -TimeoutSec 15
  }
  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 15
}

function Get-DockerEnvMap([string]$Container) {
  $envLines = docker inspect $Container --format "{{json .Config.Env}}" | ConvertFrom-Json
  $map = @{}
  foreach ($line in $envLines) {
    $idx = $line.IndexOf("=")
    if ($idx -lt 1) { continue }
    $map[$line.Substring(0, $idx)] = $line.Substring($idx + 1)
  }
  return $map
}

function Read-EnvFileMap([string]$Path) {
  $map = @{}
  if (-not (Test-Path $Path)) { return $map }
  $lines = Get-Content -Encoding UTF8 $Path
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
    $map[$key] = $val
  }
  return $map
}

function Get-EnvOrDefault([hashtable]$Map, [string]$Key, [string]$Fallback) {
  if ($Map.ContainsKey($Key) -and [string]::IsNullOrWhiteSpace([string]$Map[$Key]) -eq $false) {
    return [string]$Map[$Key]
  }
  return $Fallback
}

function Publish-CommandAckedEvent([string]$DeviceId, [string]$CommandId, [string]$EventId, [string]$KafkaBrokers, [string]$Topic) {
  $nodeScript = @"
const { Kafka, logLevel } = require('kafkajs');

(async () => {
  const kafka = new Kafka({
    clientId: 'field-command-success-policy-type-default-proof',
    brokers: '$KafkaBrokers'.split(',').map((x) => x.trim()).filter(Boolean),
    logLevel: logLevel.NOTHING
  });
  const producer = kafka.producer();
  await producer.connect();
  await producer.send({
    topic: '$Topic',
    messages: [
      {
        key: '$DeviceId',
        value: JSON.stringify({
          schema_version: 1,
          event_id: '$EventId',
          event_type: 'COMMAND_ACKED',
          created_ts: new Date().toISOString(),
          command_id: '$CommandId',
          device_id: '$DeviceId',
          status: 'acked',
          result: {
            applied: true,
            source: 'command_type_default_success_policy'
          }
        })
      }
    ]
  });
  await producer.disconnect();
})().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
"@
  $nodeScript | node -
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to publish command acked event"
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  npm --workspace services/api run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/api" }
  npm --workspace services/command-notify-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-notify-worker" }

  $apiContainerEnv = Get-DockerEnvMap "lsmv2_api"
  $apiLocalEnv = Read-EnvFileMap (Join-Path $repoRoot "services/api/.env")

  $postgresHost = Get-EnvOrDefault $apiLocalEnv "POSTGRES_HOST" "127.0.0.1"
  $postgresPort = Get-EnvOrDefault $apiLocalEnv "POSTGRES_PORT" (Get-EnvOrDefault $apiContainerEnv "POSTGRES_PORT" "5432")
  $postgresUser = Get-EnvOrDefault $apiLocalEnv "POSTGRES_USER" (Get-EnvOrDefault $apiContainerEnv "POSTGRES_USER" "landslide")
  $postgresPassword = Get-EnvOrDefault $apiLocalEnv "POSTGRES_PASSWORD" (Get-EnvOrDefault $apiContainerEnv "POSTGRES_PASSWORD" "")
  $postgresDatabase = Get-EnvOrDefault $apiLocalEnv "POSTGRES_DATABASE" (Get-EnvOrDefault $apiContainerEnv "POSTGRES_DATABASE" "landslide_monitor")
  $clickhouseUsername = Get-EnvOrDefault $apiLocalEnv "CLICKHOUSE_USERNAME" (Get-EnvOrDefault $apiContainerEnv "CLICKHOUSE_USERNAME" "landslide")
  $clickhousePassword = Get-EnvOrDefault $apiLocalEnv "CLICKHOUSE_PASSWORD" (Get-EnvOrDefault $apiContainerEnv "CLICKHOUSE_PASSWORD" "")
  $clickhouseDatabase = Get-EnvOrDefault $apiLocalEnv "CLICKHOUSE_DATABASE" (Get-EnvOrDefault $apiContainerEnv "CLICKHOUSE_DATABASE" "landslide")
  $clickhouseTable = Get-EnvOrDefault $apiLocalEnv "CLICKHOUSE_TABLE" (Get-EnvOrDefault $apiContainerEnv "CLICKHOUSE_TABLE" "telemetry_raw")
  $jwtAccessSecret = Get-EnvOrDefault $apiLocalEnv "JWT_ACCESS_SECRET" (Get-EnvOrDefault $apiContainerEnv "JWT_ACCESS_SECRET" "")
  $jwtRefreshSecret = Get-EnvOrDefault $apiLocalEnv "JWT_REFRESH_SECRET" (Get-EnvOrDefault $apiContainerEnv "JWT_REFRESH_SECRET" "")
  $adminApiToken = Get-EnvOrDefault $apiLocalEnv "ADMIN_API_TOKEN" (Get-EnvOrDefault $apiContainerEnv "ADMIN_API_TOKEN" "")
  $kafkaBrokers = "127.0.0.1:9094"
  $eventTopic = "device.command_events.v1"
  $runStamp = Get-Date -Format "yyyyMMddHHmmss"
  $resolvedApiPort = Resolve-FreePort $ApiPort

  $notifyEnvPath = Join-Path $repoRoot "services/command-notify-worker/.env"
  $logDir = Join-Path $repoRoot ("backups/evidence/field-command-success-notification-type-default-proof-" + $runStamp)
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $apiOut = Join-Path $logDir "api.stdout.log"
  $apiErr = Join-Path $logDir "api.stderr.log"
  $notifyOut = Join-Path $logDir "command-notify-worker.stdout.log"
  $notifyErr = Join-Path $logDir "command-notify-worker.stderr.log"

  @(
    "SERVICE_NAME=command-notify-worker",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=command-notify-worker-success-policy-type-default-proof-$runStamp",
    "KAFKA_GROUP_ID=command-notify-worker-success-policy-type-default-proof-$runStamp",
    "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
    "POSTGRES_HOST=$postgresHost",
    "POSTGRES_PORT=$postgresPort",
    "POSTGRES_USER=$postgresUser",
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_DATABASE=$postgresDatabase",
    "POSTGRES_POOL_MAX=5",
    "NOTIFY_TYPE=app"
  ) -join [Environment]::NewLine | Set-Content -Path $notifyEnvPath -Encoding UTF8

  $apiProc = $null
  $notifyProc = $null
  $originalSystemDefault = $null
  $originalCommandTypeDefaults = $null
  try {
    $env:SERVICE_NAME = "api-service-command-success-policy-type-default-proof"
    $env:API_HOST = "127.0.0.1"
    $env:API_PORT = [string]$resolvedApiPort
    $env:AUTH_REQUIRED = "false"
    $env:JWT_ACCESS_SECRET = $jwtAccessSecret
    $env:JWT_REFRESH_SECRET = $jwtRefreshSecret
    $env:ADMIN_API_TOKEN = $adminApiToken
    $env:POSTGRES_HOST = $postgresHost
    $env:POSTGRES_PORT = $postgresPort
    $env:POSTGRES_USER = $postgresUser
    $env:POSTGRES_PASSWORD = $postgresPassword
    $env:POSTGRES_DATABASE = $postgresDatabase
    $env:CLICKHOUSE_URL = "http://127.0.0.1:8123"
    $env:CLICKHOUSE_USERNAME = $clickhouseUsername
    $env:CLICKHOUSE_PASSWORD = $clickhousePassword
    $env:CLICKHOUSE_DATABASE = $clickhouseDatabase
    $env:CLICKHOUSE_TABLE = $clickhouseTable
    $env:KAFKA_BROKERS = $kafkaBrokers
    $env:KAFKA_TOPIC_DEVICE_COMMANDS = "device.commands.v1"

    $apiProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/api" -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
    $notifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-notify-worker" -PassThru -RedirectStandardOutput $notifyOut -RedirectStandardError $notifyErr

    if (-not (Wait-ForLogMatch $apiOut "api-service started" 30)) {
      throw "local api-service did not report startup within 30s. Logs: $logDir"
    }
    if (-not (Wait-ForLogMatch $notifyOut "command-notify-worker started" 45)) {
      throw "command-notify-worker did not start within 45s. Logs: $logDir"
    }
    Start-Sleep -Seconds 12

    $notifyColumnExistsSql = @"
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'device_commands'
    AND column_name = 'notify_on_acked'
);
"@
    $notifyColumnExists = (($notifyColumnExistsSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase -At 2>$null) | Out-String).Trim()
    if ($notifyColumnExists -ne "t") {
      $addNotifyColumnSql = @"
ALTER TABLE device_commands
  ADD COLUMN notify_on_acked BOOLEAN NOT NULL DEFAULT FALSE;
"@
      $addNotifyColumnSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null
    }

    $successPolicyColumnExistsSql = @"
SELECT EXISTS (
  SELECT 1
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'device_commands'
    AND column_name = 'success_notification_policy'
);
"@
    $successPolicyColumnExists = (($successPolicyColumnExistsSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase -At 2>$null) | Out-String).Trim()
    if ($successPolicyColumnExists -ne "t") {
      $addSuccessPolicyColumnSql = @"
ALTER TABLE device_commands
  ADD COLUMN success_notification_policy VARCHAR(20);

UPDATE device_commands
SET success_notification_policy = CASE
  WHEN notify_on_acked THEN 'always_notify'
  ELSE 'silent'
END
WHERE success_notification_policy IS NULL;

ALTER TABLE device_commands
  ALTER COLUMN success_notification_policy SET DEFAULT 'inherit';

ALTER TABLE device_commands
  ALTER COLUMN success_notification_policy SET NOT NULL;

ALTER TABLE device_commands
  ADD CONSTRAINT device_commands_success_notification_policy_check
    CHECK (success_notification_policy IN ('inherit', 'silent', 'always_notify'));
"@
      $addSuccessPolicyColumnSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null
    }

    $readPolicyConfigSql = @"
SELECT config_key, COALESCE(config_value, '')
FROM system_configs
WHERE config_key IN (
  'command.success_notification.system_default',
  'command.success_notification.command_type_defaults'
)
ORDER BY config_key;
"@
    $rawPolicyConfig = ($readPolicyConfigSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase -At 2>$null | Out-String).Trim()
    if ($rawPolicyConfig) {
      foreach ($line in ($rawPolicyConfig -split "`r?`n")) {
        if (-not $line.Trim()) { continue }
        $parts = $line.Split("|", 2)
        if ($parts.Count -lt 2) { continue }
        if ($parts[0] -eq "command.success_notification.system_default") {
          $originalSystemDefault = $parts[1]
        }
        if ($parts[0] -eq "command.success_notification.command_type_defaults") {
          $originalCommandTypeDefaults = $parts[1]
        }
      }
    }

    $ensurePolicyConfigSql = @"
INSERT INTO system_configs (config_key, config_value, config_type, description, is_public)
VALUES
  ('command.success_notification.system_default', 'silent', 'string', 'Command success notification system default policy', FALSE),
  ('command.success_notification.command_type_defaults', '{"set_config":"always_notify","reboot":"always_notify","restart_device":"always_notify","deactivate_device":"always_notify","set_sampling_interval":"always_notify","manual_collect":"always_notify","huawei:reboot":"always_notify"}', 'json', 'Command success notification policy defaults by command type', FALSE)
ON CONFLICT (config_key) DO UPDATE
SET
  config_value = EXCLUDED.config_value,
  config_type = EXCLUDED.config_type,
  description = EXCLUDED.description,
  updated_at = NOW();
"@
    $ensurePolicyConfigSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null

    $apiBaseUrl = "http://127.0.0.1:$resolvedApiPort/api/v1"
    $headers = @{}
    if ($jwtAccessSecret -and $jwtRefreshSecret) {
      $loginResp = Invoke-ApiJson "Post" ($apiBaseUrl + "/auth/login") @{
        username = "admin"
        password = "123456"
      }
      $headers["Authorization"] = "Bearer " + [string]$loginResp.data.token
      $headers["Accept"] = "application/json"
    } elseif ($adminApiToken) {
      $headers["Authorization"] = "Bearer " + $adminApiToken
      $headers["Accept"] = "application/json"
    }

    $deviceResp = Invoke-ApiJson "Post" ($apiBaseUrl + "/devices") @{
      deviceName = "field-command-success-policy-type-default-proof-" + $runStamp
      deviceType = "multi_sensor"
      metadata = @{
        note = "field_rehearsal"
        install_label = "FIELD-CMD-SUCCESS-POLICY-TYPE-DEFAULT"
      }
    } $headers
    $deviceId = [string]$deviceResp.data.deviceId

    $commandResp = Invoke-ApiJson "Post" ($apiBaseUrl + "/devices/$deviceId/commands") @{
      commandType = "set_config"
      payload = @{
        source = "field-command-success-policy-type-default-proof"
        expectedPolicy = "command_type_default_always_notify"
        sampling_s = 10
        report_interval_s = 60
      }
    } $headers
    $commandId = [string]$commandResp.data.commandId

    $markAckedSql = @"
UPDATE device_commands
SET
  status = 'acked',
  sent_at = COALESCE(sent_at, NOW()),
  acked_at = NOW(),
  updated_at = NOW(),
  result = '{"applied": true, "source": "command_type_default_success_policy"}'::jsonb,
  error_message = NULL
WHERE command_id = '$commandId' AND device_id = '$deviceId';
"@
    $markAckedSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null

    $eventId = [guid]::NewGuid().ToString()
    $insertEventSql = @"
INSERT INTO device_command_events (
  event_id, event_type, command_id, device_id, status, detail, result, created_at
) VALUES (
  '$eventId'::uuid,
  'COMMAND_ACKED',
  '$commandId'::uuid,
  '$deviceId'::uuid,
  'acked',
  'command type default success notification proof',
  '{"applied": true, "source": "command_type_default_success_policy"}'::jsonb,
  NOW()
)
ON CONFLICT (event_id) DO NOTHING;
"@
    $insertEventSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null
    Publish-CommandAckedEvent $deviceId $commandId $eventId $kafkaBrokers $eventTopic

    $notification = Wait-ForCondition {
      $sql = @"
SELECT
  n.notification_id,
  n.event_id,
  e.event_type,
  e.command_id,
  e.device_id,
  n.status,
  n.notify_type,
  n.title
FROM device_command_notifications n
JOIN device_command_events e ON e.event_id = n.event_id
WHERE e.device_id = '$deviceId'
  AND e.command_id = '$commandId'
ORDER BY n.created_at DESC
LIMIT 1;
"@
      $out = $sql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase -At 2>$null
      $text = ($out | Out-String).Trim()
      if (-not $text) { return $null }
      $parts = $text.Split("|")
      return [pscustomobject]@{
        notificationId = [string]$parts[0]
        eventId = [string]$parts[1]
        eventType = [string]$parts[2]
        commandId = [string]$parts[3]
        deviceId = [string]$parts[4]
        status = [string]$parts[5]
        notifyType = [string]$parts[6]
        title = [string]$parts[7]
      }
    } $TimeoutSeconds

    if (-not $notification) {
      throw "device command success-notification type-default proof did not create a notification within timeout"
    }

    $commandStateResp = Invoke-ApiJson "Get" "$apiBaseUrl/devices/$deviceId/commands/$commandId" $null $headers
    $eventListResp = Invoke-ApiJson "Get" "$apiBaseUrl/devices/$deviceId/command-events?page=1&pageSize=20&commandId=$commandId" $null $headers
    $listResp = Invoke-ApiJson "Get" "$apiBaseUrl/devices/$deviceId/command-notifications?page=1&pageSize=20&commandId=$commandId" $null $headers
    $statsBefore = Invoke-ApiJson "Get" "$apiBaseUrl/devices/$deviceId/command-notifications/stats" $null $headers
    $detailResp = Invoke-ApiJson "Get" "$apiBaseUrl/devices/$deviceId/command-notifications/$($notification.notificationId)" $null $headers
    $readResp = Invoke-ApiJson "Put" "$apiBaseUrl/devices/$deviceId/command-notifications/$($notification.notificationId)/read" @{} $headers
    $statsAfter = Invoke-ApiJson "Get" "$apiBaseUrl/devices/$deviceId/command-notifications/stats" $null $headers

    $report = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      deviceId = $deviceId
      commandId = $commandId
      notification = $notification
      configBefore = [ordered]@{
        systemDefault = $originalSystemDefault
        commandTypeDefaults = $originalCommandTypeDefaults
      }
      configApplied = [ordered]@{
        systemDefault = "silent"
        commandTypeDefaults = @{
          set_config = "always_notify"
          reboot = "always_notify"
          restart_device = "always_notify"
          deactivate_device = "always_notify"
          set_sampling_interval = "always_notify"
          manual_collect = "always_notify"
          "huawei:reboot" = "always_notify"
        }
      }
      conclusion = if (
        [string]$commandStateResp.data.status -eq "acked" -and
        [bool]$commandStateResp.data.notifyOnAck -eq $true -and
        [string]$commandStateResp.data.successNotificationPolicy -eq "inherit" -and
        [string]$commandStateResp.data.effectiveSuccessNotificationPolicy -eq "always_notify" -and
        [string]$commandStateResp.data.commandType -eq "set_config" -and
        @($eventListResp.data.list | Where-Object { $_.eventType -eq "COMMAND_ACKED" }).Count -ge 1 -and
        $notification.eventType -eq "COMMAND_ACKED" -and
        $notification.notifyType -eq "app" -and
        @($listResp.data.list).Count -ge 1 -and
        [int]$statsBefore.data.totals.total -ge 1 -and
        [int]$statsBefore.data.totals.unread -ge 1 -and
        [string]$detailResp.data.notificationId -eq [string]$notification.notificationId -and
        [string]$readResp.data.notificationId -eq [string]$notification.notificationId -and
        [int]$statsAfter.data.totals.unread -eq 0
      ) {
        "command-type-default-success-notification-now-produces-readable-command-notification"
      } else {
        "command-type-default-success-notification-behavior-needs-review"
      }
      notes = @(
        "The proof upserts the command.success_notification.* system configs, creates a rehearsal device, and issues a set_config command without notifyOnAck or per-command successNotificationPolicy override.",
        "The real command type set_config should inherit the command-type default from system_configs and resolve to always_notify.",
        "command-notify-worker should create device_command_notifications because the effective success-notification policy resolves from the productized command-type default table."
      )
      command = $commandStateResp.data
      events = $eventListResp.data
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
    $json = $report | ConvertTo-Json -Depth 10
    Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
    $json
  } finally {
    if ($null -ne $originalSystemDefault -or $null -ne $originalCommandTypeDefaults) {
      $restoreSqlLines = @()
      if ($null -ne $originalSystemDefault) {
        $escapedSystemDefault = [string]$originalSystemDefault -replace "'", "''"
        $restoreSqlLines += @"
UPDATE system_configs
SET config_value = '$escapedSystemDefault', updated_at = NOW()
WHERE config_key = 'command.success_notification.system_default';
"@
      }
      if ($null -ne $originalCommandTypeDefaults) {
        $escapedCommandTypeDefaults = [string]$originalCommandTypeDefaults -replace "'", "''"
        $restoreSqlLines += @"
UPDATE system_configs
SET config_value = '$escapedCommandTypeDefaults', updated_at = NOW()
WHERE config_key = 'command.success_notification.command_type_defaults';
"@
      }
      if ($restoreSqlLines.Count -gt 0) {
        ($restoreSqlLines -join [Environment]::NewLine) | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null
      }
    }
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
    if ($apiProc -and -not $apiProc.HasExited) { Stop-Process -Id $apiProc.Id -Force }
    if ($notifyProc -and -not $notifyProc.HasExited) { Stop-Process -Id $notifyProc.Id -Force }
  }
} finally {
  Pop-Location
}
