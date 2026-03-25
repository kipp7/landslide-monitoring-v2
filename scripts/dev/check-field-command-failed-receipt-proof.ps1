[CmdletBinding()]
param(
  [int]$ApiPort = 18084,
  [int]$TimeoutSeconds = 45,
  [string]$OutFile = "docs/unified/reports/field-command-failed-receipt-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

function Wait-ForCondition([scriptblock]$Condition, [int]$TimeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 1
    $result = & $Condition
    if ($result) { return $result }
  }
  return $null
}

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

function Publish-CommandFailedAck([string]$DeviceId, [string]$CommandId, [string]$KafkaBrokers, [string]$Topic, [string]$ErrorMessage) {
  $nodeScript = @"
const { Kafka, logLevel } = require('kafkajs');

(async () => {
  const kafka = new Kafka({
    clientId: 'field-command-failed-receipt-proof',
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
          command_id: '$CommandId',
          device_id: '$DeviceId',
          ack_ts: new Date().toISOString(),
          status: 'failed',
          result: {
            error_message: '$ErrorMessage'
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
    throw "Failed to publish command failed ack"
  }
}

function Start-NodeWithEnv(
  [string]$WorkingDirectory,
  [hashtable]$EnvMap,
  [string]$StdoutPath,
  [string]$StderrPath
) {
  $pairs = @()
  foreach ($key in $EnvMap.Keys) {
    $value = [string]$EnvMap[$key]
    $escaped = $value.Replace("'", "''")
    $pairs += "`$env:$key='$escaped'"
  }
  $script = ($pairs -join "; ") + "; Set-Location '$WorkingDirectory'; node dist/index.js"
  return Start-Process -FilePath "powershell" -ArgumentList @("-NoProfile", "-Command", $script) -PassThru -RedirectStandardOutput $StdoutPath -RedirectStandardError $StderrPath
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  npm --workspace services/api run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/api" }
  npm --workspace services/command-ack-receiver run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-ack-receiver" }
  npm --workspace services/command-events-recorder run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-events-recorder" }
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
  $mqttInternalUsername = Get-EnvOrDefault $apiLocalEnv "MQTT_INTERNAL_USERNAME" (Get-EnvOrDefault $apiContainerEnv "MQTT_INTERNAL_USERNAME" "ingest-service")
  $mqttInternalPassword = Get-EnvOrDefault $apiLocalEnv "MQTT_INTERNAL_PASSWORD" (Get-EnvOrDefault $apiContainerEnv "MQTT_INTERNAL_PASSWORD" "")
  $mqttUrl = "mqtt://127.0.0.1:1883"
  $kafkaBrokers = "127.0.0.1:9094"
  $ackTopic = "device.command_acks.v1"
  $runStamp = Get-Date -Format "yyyyMMddHHmmss"
  $resolvedApiPort = Resolve-FreePort $ApiPort

  $ackEnvPath = Join-Path $repoRoot "services/command-ack-receiver/.env"
  $eventEnvPath = Join-Path $repoRoot "services/command-events-recorder/.env"
  $notifyEnvPath = Join-Path $repoRoot "services/command-notify-worker/.env"

  @(
    "SERVICE_NAME=command-ack-receiver",
    "MQTT_URL=$mqttUrl",
    "MQTT_USERNAME=$mqttInternalUsername",
    "MQTT_PASSWORD=$mqttInternalPassword",
    "MQTT_TOPIC_ACK_PREFIX=cmd_ack/",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=command-ack-receiver-receipt-proof-$runStamp",
    "KAFKA_GROUP_ID=command-ack-receiver-receipt-proof-$runStamp",
    "KAFKA_TOPIC_DEVICE_COMMAND_ACKS=$ackTopic",
    "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
    "POSTGRES_HOST=$postgresHost",
    "POSTGRES_PORT=$postgresPort",
    "POSTGRES_USER=$postgresUser",
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_DATABASE=$postgresDatabase",
    "POSTGRES_POOL_MAX=5"
  ) -join [Environment]::NewLine | Set-Content -Path $ackEnvPath -Encoding UTF8

  @(
    "SERVICE_NAME=command-events-recorder",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=command-events-recorder-receipt-proof-$runStamp",
    "KAFKA_GROUP_ID=command-events-recorder-receipt-proof-$runStamp",
    "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
    "POSTGRES_HOST=$postgresHost",
    "POSTGRES_PORT=$postgresPort",
    "POSTGRES_USER=$postgresUser",
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_DATABASE=$postgresDatabase",
    "POSTGRES_POOL_MAX=5"
  ) -join [Environment]::NewLine | Set-Content -Path $eventEnvPath -Encoding UTF8

  @(
    "SERVICE_NAME=command-notify-worker",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=command-notify-worker-receipt-proof-$runStamp",
    "KAFKA_GROUP_ID=command-notify-worker-receipt-proof-$runStamp",
    "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
    "POSTGRES_HOST=$postgresHost",
    "POSTGRES_PORT=$postgresPort",
    "POSTGRES_USER=$postgresUser",
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_DATABASE=$postgresDatabase",
    "POSTGRES_POOL_MAX=5",
    "NOTIFY_TYPE=app"
  ) -join [Environment]::NewLine | Set-Content -Path $notifyEnvPath -Encoding UTF8

  $logDir = Join-Path $repoRoot ("backups/evidence/field-command-failed-receipt-proof-" + $runStamp)
  New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  $apiOut = Join-Path $logDir "api.stdout.log"
  $apiErr = Join-Path $logDir "api.stderr.log"
  $ackOut = Join-Path $logDir "command-ack-receiver.stdout.log"
  $ackErr = Join-Path $logDir "command-ack-receiver.stderr.log"
  $eventOut = Join-Path $logDir "command-events-recorder.stdout.log"
  $eventErr = Join-Path $logDir "command-events-recorder.stderr.log"
  $notifyOut = Join-Path $logDir "command-notify-worker.stdout.log"
  $notifyErr = Join-Path $logDir "command-notify-worker.stderr.log"

  $apiProc = $null
  $ackProc = $null
  $eventProc = $null
  $notifyProc = $null
  try {
    $apiEnv = @{
      SERVICE_NAME = "api-service-command-failed-receipt-proof"
      API_HOST = "127.0.0.1"
      API_PORT = [string]$resolvedApiPort
      AUTH_REQUIRED = "false"
      JWT_ACCESS_SECRET = $jwtAccessSecret
      JWT_REFRESH_SECRET = $jwtRefreshSecret
      ADMIN_API_TOKEN = $adminApiToken
      POSTGRES_HOST = $postgresHost
      POSTGRES_PORT = $postgresPort
      POSTGRES_USER = $postgresUser
      POSTGRES_PASSWORD = $postgresPassword
      POSTGRES_DATABASE = $postgresDatabase
      CLICKHOUSE_URL = "http://127.0.0.1:8123"
      CLICKHOUSE_USERNAME = $clickhouseUsername
      CLICKHOUSE_PASSWORD = $clickhousePassword
      CLICKHOUSE_DATABASE = $clickhouseDatabase
      CLICKHOUSE_TABLE = $clickhouseTable
      KAFKA_BROKERS = $kafkaBrokers
      KAFKA_TOPIC_DEVICE_COMMANDS = "device.commands.v1"
    }

    $apiProc = Start-NodeWithEnv (Join-Path $repoRoot "services/api") $apiEnv $apiOut $apiErr
    $ackProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-ack-receiver" -PassThru -RedirectStandardOutput $ackOut -RedirectStandardError $ackErr
    $eventProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-events-recorder" -PassThru -RedirectStandardOutput $eventOut -RedirectStandardError $eventErr
    $notifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-notify-worker" -PassThru -RedirectStandardOutput $notifyOut -RedirectStandardError $notifyErr

    if (-not (Wait-ForLogMatch $apiOut "api-service started" 30)) {
      throw "local api-service did not report startup within 30s. Logs: $logDir"
    }
    if (-not (Wait-ForLogMatch $ackOut "command-ack-receiver started" 45)) {
      throw "command-ack-receiver did not start within 45s. Logs: $logDir"
    }
    if (-not (Wait-ForLogMatch $notifyOut "command-notify-worker started" 45)) {
      throw "command-notify-worker did not start within 45s. Logs: $logDir"
    }
    Start-Sleep -Seconds 3

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
      deviceName = "field-command-failed-receipt-proof-" + $runStamp
      deviceType = "multi_sensor"
      metadata = @{
        note = "field_rehearsal"
        install_label = "FIELD-CMD-FAILED-RECEIPT"
      }
    } $headers
    $deviceId = [string]$deviceResp.data.deviceId

    $commandResp = Invoke-ApiJson "Post" ($apiBaseUrl + "/devices/$deviceId/commands") @{
      commandType = "set_config"
      payload = @{
        sampling_s = 10
        report_interval_s = 60
      }
    } $headers
    $commandId = [string]$commandResp.data.commandId

    $markSentSql = @"
UPDATE device_commands
SET
  status = 'sent',
  sent_at = NOW(),
  updated_at = NOW(),
  error_message = NULL
WHERE command_id = '$commandId' AND device_id = '$deviceId';
"@
    $markSentSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null

    $errorMessage = "simulated receipt failure for field proof"
    Publish-CommandFailedAck $deviceId $commandId $kafkaBrokers $ackTopic $errorMessage

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
      throw "device command failed receipt notification was not created within timeout"
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
      conclusion = if (
        [string]$commandStateResp.data.status -eq "failed" -and
        @($eventListResp.data.list | Where-Object { $_.eventType -eq "COMMAND_FAILED" }).Count -ge 1 -and
        $notification.eventType -eq "COMMAND_FAILED" -and
        $notification.notifyType -eq "app" -and
        @($listResp.data.list).Count -ge 1 -and
        [int]$statsBefore.data.totals.unread -ge 1 -and
        [string]$detailResp.data.notificationId -eq [string]$notification.notificationId -and
        $detailResp.data.content -match "simulated receipt failure for field proof" -and
        [string]$readResp.data.notificationId -eq [string]$notification.notificationId -and
        [int]$statsAfter.data.totals.unread -eq 0
      ) {
        "command-failed-receipt-now-produces-readable-command-notification"
      } else {
        "command-failed-receipt-behavior-needs-review"
      }
      notes = @(
        "The proof creates a rehearsal device, issues a sent command, and publishes a failed ack to device.command_acks.v1.",
        "command-ack-receiver should apply the failed ack, emit COMMAND_FAILED, and the downstream event + notification chain should stay readable.",
        "This proof covers device.command_acks.v1 -> command-ack-receiver -> device.command_events.v1 -> device_command_notifications -> API."
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
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
    if ($apiProc -and -not $apiProc.HasExited) { Stop-Process -Id $apiProc.Id -Force }
    if ($ackProc -and -not $ackProc.HasExited) { Stop-Process -Id $ackProc.Id -Force }
    if ($eventProc -and -not $eventProc.HasExited) { Stop-Process -Id $eventProc.Id -Force }
    if ($notifyProc -and -not $notifyProc.HasExited) { Stop-Process -Id $notifyProc.Id -Force }
  }
} finally {
  Pop-Location
}
