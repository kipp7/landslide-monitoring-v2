[CmdletBinding()]
param(
  [int]$ApiPort = 18082,
  [int]$TimeoutSeconds = 45,
  [string]$OutFile = "docs/unified/reports/field-command-notification-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

function Get-EnvOrDefault([hashtable]$Map, [string]$Key, [string]$Fallback) {
  if ($Map.ContainsKey($Key) -and [string]::IsNullOrWhiteSpace([string]$Map[$Key]) -eq $false) {
    return [string]$Map[$Key]
  }
  return $Fallback
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  npm --workspace services/api run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/api" }
  npm --workspace services/command-events-recorder run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-events-recorder" }
  npm --workspace services/command-timeout-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-timeout-worker" }
  npm --workspace services/command-notify-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-notify-worker" }

  $apiEnvMap = Get-DockerEnvMap "lsmv2_api"
  $postgresHost = "127.0.0.1"
  $postgresPort = Get-EnvOrDefault $apiEnvMap "POSTGRES_PORT" "5432"
  $postgresUser = Get-EnvOrDefault $apiEnvMap "POSTGRES_USER" "landslide"
  $postgresPassword = Get-EnvOrDefault $apiEnvMap "POSTGRES_PASSWORD" ""
  $postgresDatabase = Get-EnvOrDefault $apiEnvMap "POSTGRES_DATABASE" "landslide_monitor"
  $clickhouseUsername = Get-EnvOrDefault $apiEnvMap "CLICKHOUSE_USERNAME" "landslide"
  $clickhousePassword = Get-EnvOrDefault $apiEnvMap "CLICKHOUSE_PASSWORD" ""
  $clickhouseDatabase = Get-EnvOrDefault $apiEnvMap "CLICKHOUSE_DATABASE" "landslide"
  $clickhouseTable = Get-EnvOrDefault $apiEnvMap "CLICKHOUSE_TABLE" "telemetry_raw"
  $jwtAccessSecret = Get-EnvOrDefault $apiEnvMap "JWT_ACCESS_SECRET" ""
  $jwtRefreshSecret = Get-EnvOrDefault $apiEnvMap "JWT_REFRESH_SECRET" ""
  $kafkaBrokers = "127.0.0.1:9094"
  $runStamp = Get-Date -Format "yyyyMMddHHmmss"

  $eventEnvPath = Join-Path $repoRoot "services/command-events-recorder/.env"
  $timeoutEnvPath = Join-Path $repoRoot "services/command-timeout-worker/.env"
  $notifyEnvPath = Join-Path $repoRoot "services/command-notify-worker/.env"

  @(
    "SERVICE_NAME=command-events-recorder",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=command-events-recorder-proof-$runStamp",
    "KAFKA_GROUP_ID=command-events-recorder-proof-$runStamp",
    "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
    "POSTGRES_HOST=$postgresHost",
    "POSTGRES_PORT=$postgresPort",
    "POSTGRES_USER=$postgresUser",
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_DATABASE=$postgresDatabase",
    "POSTGRES_POOL_MAX=5"
  ) -join [Environment]::NewLine | Set-Content -Path $eventEnvPath -Encoding UTF8

  @(
    "SERVICE_NAME=command-timeout-worker",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=command-timeout-worker-proof-$runStamp",
    "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
    "POSTGRES_HOST=$postgresHost",
    "POSTGRES_PORT=$postgresPort",
    "POSTGRES_USER=$postgresUser",
    "POSTGRES_PASSWORD=$postgresPassword",
    "POSTGRES_DATABASE=$postgresDatabase",
    "POSTGRES_POOL_MAX=5",
    "COMMAND_ACK_TIMEOUT_SECONDS=2",
    "SCAN_INTERVAL_MS=1000",
    "SCAN_LIMIT=50"
  ) -join [Environment]::NewLine | Set-Content -Path $timeoutEnvPath -Encoding UTF8

  @(
    "SERVICE_NAME=command-notify-worker",
    "KAFKA_BROKERS=$kafkaBrokers",
    "KAFKA_CLIENT_ID=command-notify-worker-proof-$runStamp",
    "KAFKA_GROUP_ID=command-notify-worker-proof-$runStamp",
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
  $eventProc = $null
  $timeoutProc = $null
  $notifyProc = $null
  try {
    $env:SERVICE_NAME = "api-service-command-notify-proof"
    $env:API_HOST = "127.0.0.1"
    $env:API_PORT = [string]$ApiPort
    $env:AUTH_REQUIRED = "false"
    $env:JWT_ACCESS_SECRET = $jwtAccessSecret
    $env:JWT_REFRESH_SECRET = $jwtRefreshSecret
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

    $apiProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/api" -PassThru
    $eventProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-events-recorder" -PassThru
    $notifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-notify-worker" -PassThru
    $timeoutProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-timeout-worker" -PassThru

    $apiBaseUrl = "http://127.0.0.1:$ApiPort/api/v1"
    if (-not (Wait-ForHttpOk "http://127.0.0.1:$ApiPort/health" 30 "Get")) {
      throw "local api-service did not become healthy"
    }
    Start-Sleep -Seconds 3

    $loginResp = Invoke-ApiJson "Post" ($apiBaseUrl + "/auth/login") @{
      username = "admin"
      password = "123456"
    }
    $headers = @{
      Authorization = "Bearer " + [string]$loginResp.data.token
      Accept = "application/json"
    }

    $deviceResp = Invoke-ApiJson "Post" ($apiBaseUrl + "/devices") @{
      deviceName = "field-command-notify-proof-" + $runStamp
      deviceType = "multi_sensor"
      metadata = @{
        note = "field_rehearsal"
        install_label = "FIELD-CMD-PROOF"
      }
    } $headers
    $deviceId = [string]$deviceResp.data.deviceId

    $commandResp = Invoke-ApiJson "Post" ($apiBaseUrl + "/devices/$deviceId/commands") @{
      commandType = "set_config"
      payload = @{
        sampling_s = 5
        report_interval_s = 30
      }
    } $headers
    $commandId = [string]$commandResp.data.commandId

    $markSentSql = @"
UPDATE device_commands
SET
  status = 'sent',
  sent_at = NOW() - INTERVAL '120 seconds',
  updated_at = NOW(),
  error_message = NULL
WHERE command_id = '$commandId' AND device_id = '$deviceId';
"@
    $markSentSql | docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env exec -T postgres psql -U $postgresUser -d $postgresDatabase 1>$null 2>$null

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
      throw "device command notification was not created within timeout"
    }

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
        $notification.eventType -eq "COMMAND_TIMEOUT" -and
        $notification.notifyType -eq "app" -and
        @($listResp.data.list).Count -ge 1 -and
        [int]$statsBefore.data.totals.unread -ge 1 -and
        [string]$detailResp.data.notificationId -eq [string]$notification.notificationId -and
        [string]$readResp.data.notificationId -eq [string]$notification.notificationId -and
        [int]$statsAfter.data.totals.unread -eq 0
      ) {
        "command-timeout-now-produces-readable-command-notification"
      } else {
        "command-notification-behavior-needs-review"
      }
      notes = @(
        "The proof creates a rehearsal device, issues a queued command, and promotes it to an overdue sent command.",
        "command-timeout-worker should emit COMMAND_TIMEOUT, command-events-recorder should persist the event, and command-notify-worker should create device_command_notifications.",
        "The command notification APIs should support list, stats, detail, and mark-as-read."
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
    powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/cleanup-field-rehearsal.ps1" | Out-Null
    if ($apiProc -and -not $apiProc.HasExited) { Stop-Process -Id $apiProc.Id -Force }
    if ($eventProc -and -not $eventProc.HasExited) { Stop-Process -Id $eventProc.Id -Force }
    if ($notifyProc -and -not $notifyProc.HasExited) { Stop-Process -Id $notifyProc.Id -Force }
    if ($timeoutProc -and -not $timeoutProc.HasExited) { Stop-Process -Id $timeoutProc.Id -Force }
  }
} finally {
  Pop-Location
}
