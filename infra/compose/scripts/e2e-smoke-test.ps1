param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$DeviceId = "",
  [switch]$Stage1Regression,
  [switch]$Stage2Regression,
  [switch]$Stage4Regression,
  [switch]$Stage5Regression,
  [switch]$UseMqttAuth,
  [switch]$CreateDevice,
  [switch]$ConfigureEmqx,
  [switch]$TestCommands,
  [switch]$TestCommandAcks,
  [switch]$TestCommandFailed,
  [switch]$TestCommandTimeout,
  [switch]$TestAlerts,
  [switch]$TestAlertNotifications,
  [switch]$TestTelemetryDlq,
  [switch]$TestPresence,
  [switch]$TestRevoke,
  [switch]$TestMobileMvp,
  [switch]$TestFirmwareSimulator,
  [bool]$CollectEvidenceOnFailure = $true,
  [switch]$SkipBuild,
  [switch]$SkipWriteServiceEnv,
  [switch]$ForceWriteServiceEnv
)

$ErrorActionPreference = "Stop"

function Assert-LastExitCode([string]$message) {
  if ($LASTEXITCODE -ne 0) { throw "$message (exit=$LASTEXITCODE)" }
}

function Read-EnvFile([string]$path) {
  if (-not (Test-Path $path)) { throw "Missing env file: $path" }
  $map = @{}
  $lines = Get-Content -Encoding UTF8 $path
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

function Resolve-EnvTemplate([string]$value, [hashtable]$envMap) {
  $out = $value
  $maxPasses = 10
  for ($i = 0; $i -lt $maxPasses; $i++) {
    $before = $out
    $out = [regex]::Replace($out, "\$\{([A-Za-z_][A-Za-z0-9_]*)\}", {
      param($m)
      $k = $m.Groups[1].Value
      if ($envMap.ContainsKey($k) -and $envMap[$k]) { return [string]$envMap[$k] }
      $fromEnv = [System.Environment]::GetEnvironmentVariable($k)
      if ($fromEnv) { return $fromEnv }
      return $m.Value
    })
    if ($out -eq $before) { break }
  }
  return $out
}

function Write-EnvIfMissingOrForced([string]$path, [string[]]$lines, [switch]$force) {
  if ((Test-Path $path) -and (-not $force)) {
    Write-Host "Keeping existing env: $path" -ForegroundColor DarkGray
    return
  }
  $dir = Split-Path -Parent $path
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
  $content = ($lines -join "`n") + "`n"
  Set-Content -Encoding UTF8 -Path $path -Value $content
  Write-Host "Wrote env: $path" -ForegroundColor Green
}

function Read-EnvValue([string]$path, [string]$key, [string]$fallback) {
  if (-not (Test-Path $path)) { return $fallback }
  $lines = Get-Content -Encoding UTF8 $path
  $lastNonEmpty = $null
  foreach ($line in $lines) {
    $t = $line.Trim()
    if ($t.StartsWith("#")) { continue }
    if (-not $t.StartsWith("$key=")) { continue }
    $v = $t.Substring($key.Length + 1).Trim()
    if ($v.Length -gt 0) { $lastNonEmpty = $v }
  }
  if ($null -ne $lastNonEmpty) { return $lastNonEmpty }
  return $fallback
}

function Exec-ToFile([string]$path, [scriptblock]$cmd) {
  try {
    $out = & $cmd 2>&1 | Out-String
    $out | Set-Content -Encoding UTF8 -NoNewline -LiteralPath $path
  } catch {
    ("ERROR: " + $_.Exception.Message + "`n") | Set-Content -Encoding UTF8 -NoNewline -LiteralPath $path
  }
}

function Wait-ForLogMatch([string]$path, [string]$pattern, [int]$timeoutSeconds) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $path) {
      try {
        if (Select-String -Path $path -Pattern $pattern -Quiet) { return $true }
      } catch {
        # ignore transient read errors
      }
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Run-Node([string[]]$nodeArgs, [string]$logPath) {
  $argText = ($nodeArgs -join " ")
  $header = "== node $argText =="
  Add-Content -Encoding UTF8 -LiteralPath $logPath -Value ($header + "`n")

  $prevPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = (& node @nodeArgs 2>&1 | Out-String)
  } finally {
    $ErrorActionPreference = $prevPreference
  }
  if ($out) { Add-Content -Encoding UTF8 -LiteralPath $logPath -Value $out }

  $exit = $LASTEXITCODE
  Add-Content -Encoding UTF8 -LiteralPath $logPath -Value ("exit=" + $exit + "`n")
  return $exit
}

if (-not (Test-Path $EnvFile)) {
  throw "Missing env file: $EnvFile (copy infra/compose/env.example -> infra/compose/.env)"
}

$envs = Read-EnvFile $EnvFile

$mqttUrl = if ($envs.ContainsKey("MQTT_URL")) { Resolve-EnvTemplate $envs["MQTT_URL"] $envs } else { "mqtt://localhost:1883" }
$kafkaBrokers = if ($envs.ContainsKey("KAFKA_BROKERS")) { $envs["KAFKA_BROKERS"] } else { "localhost:9094" }
$chUrl = if ($envs.ContainsKey("CH_HTTP_URL")) { Resolve-EnvTemplate $envs["CH_HTTP_URL"] $envs } else { "http://localhost:8123" }
$chUser = if ($envs.ContainsKey("CH_USER")) { $envs["CH_USER"] } else { "default" }
$chPassword = if ($envs.ContainsKey("CH_PASSWORD")) { $envs["CH_PASSWORD"] } else { "" }
$chDb = if ($envs.ContainsKey("CH_DATABASE")) { $envs["CH_DATABASE"] } else { "landslide" }

$pgHost = if ($envs.ContainsKey("PG_HOST")) { $envs["PG_HOST"] } else { "localhost" }
$pgPort = if ($envs.ContainsKey("PG_PORT")) { $envs["PG_PORT"] } else { "5432" }
$pgUser = if ($envs.ContainsKey("PG_USER")) { $envs["PG_USER"] } else { "landslide" }
$pgPassword = if ($envs.ContainsKey("PG_PASSWORD")) { $envs["PG_PASSWORD"] } else { "" }
$pgDb = if ($envs.ContainsKey("PG_DATABASE")) { $envs["PG_DATABASE"] } else { "landslide_monitor" }

$redisUrl = if ($envs.ContainsKey("REDIS_URL")) { Resolve-EnvTemplate $envs["REDIS_URL"] $envs } else { "redis://:change-me@localhost:6379" }

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logDir = "backups/evidence/e2e-smoke-$timestamp"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null

$evidenceDir = $null

$ingestOut = Join-Path $logDir "ingest.stdout.log"
$ingestErr = Join-Path $logDir "ingest.stderr.log"
$writerOut = Join-Path $logDir "writer.stdout.log"
$writerErr = Join-Path $logDir "writer.stderr.log"
$apiOut = Join-Path $logDir "api.stdout.log"
$apiErr = Join-Path $logDir "api.stderr.log"
$cmdOut = Join-Path $logDir "command-dispatcher.stdout.log"
$cmdErr = Join-Path $logDir "command-dispatcher.stderr.log"
$ackOut = Join-Path $logDir "command-ack-receiver.stdout.log"
$ackErr = Join-Path $logDir "command-ack-receiver.stderr.log"
$timeoutOut = Join-Path $logDir "command-timeout-worker.stdout.log"
$timeoutErr = Join-Path $logDir "command-timeout-worker.stderr.log"
$eventsOut = Join-Path $logDir "command-events-recorder.stdout.log"
$eventsErr = Join-Path $logDir "command-events-recorder.stderr.log"
$notifyOut = Join-Path $logDir "command-notify-worker.stdout.log"
$notifyErr = Join-Path $logDir "command-notify-worker.stderr.log"
$alertNotifyOut = Join-Path $logDir "alert-notify-worker.stdout.log"
$alertNotifyErr = Join-Path $logDir "alert-notify-worker.stderr.log"
$ruleOut = Join-Path $logDir "rule-engine-worker.stdout.log"
$ruleErr = Join-Path $logDir "rule-engine-worker.stderr.log"
$dlqOut = Join-Path $logDir "telemetry-dlq-recorder.stdout.log"
$dlqErr = Join-Path $logDir "telemetry-dlq-recorder.stderr.log"
$presenceOut = Join-Path $logDir "presence-recorder.stdout.log"
$presenceErr = Join-Path $logDir "presence-recorder.stderr.log"
$waitCmdOut = Join-Path $logDir "wait-command.stdout.log"
$waitCmdErr = Join-Path $logDir "wait-command.stderr.log"
$publishLog = Join-Path $logDir "publish-telemetry.log"
$firmwareOut = Join-Path $logDir "firmware-sim.stdout.log"
$firmwareErr = Join-Path $logDir "firmware-sim.stderr.log"
$firmwareState = Join-Path $logDir "firmware-sim.state.json"

$apiEnvPath = "services/api/.env"
$apiPort = Read-EnvValue $apiEnvPath "API_PORT" "8080"
$apiLocalHost = "127.0.0.1"

if (-not $DeviceId -or $DeviceId.Trim().Length -eq 0) {
  $DeviceId = (New-Guid).ToString()
}

Write-Host "Using deviceId: $DeviceId" -ForegroundColor Cyan

$ingestProc = $null
$writerProc = $null
$apiProc = $null
$cmdProc = $null
$ackProc = $null
$timeoutProc = $null
$eventsProc = $null
$notifyProc = $null
$alertNotifyProc = $null
$ruleProc = $null
$dlqProc = $null
$presenceProc = $null
$firmwareProc = $null

try {
  if ($Stage1Regression) {
    if ($Stage2Regression -or $Stage4Regression -or $Stage5Regression -or $UseMqttAuth -or $CreateDevice -or $ConfigureEmqx -or $TestCommands -or $TestCommandAcks -or $TestCommandFailed -or $TestCommandTimeout -or $TestAlerts -or $TestAlertNotifications -or $TestTelemetryDlq -or $TestRevoke -or $TestMobileMvp -or $TestFirmwareSimulator) {
      throw "Stage1Regression is a preset and must not be combined with other switches. Use either -Stage1Regression or the individual switches."
    }
    $ConfigureEmqx = $true
    $UseMqttAuth = $true
    $CreateDevice = $true
    $TestCommands = $true
    $TestTelemetryDlq = $true
    $TestPresence = $true
    $TestRevoke = $true
  }

  if ($Stage2Regression) {
    if ($Stage1Regression -or $Stage4Regression -or $UseMqttAuth -or $CreateDevice -or $ConfigureEmqx -or $TestCommands -or $TestCommandAcks -or $TestCommandFailed -or $TestCommandTimeout -or $TestAlerts -or $TestAlertNotifications -or $TestTelemetryDlq -or $TestRevoke -or $TestMobileMvp) {
      throw "Stage2Regression is a preset and must not be combined with other switches. Use either -Stage2Regression or the individual switches."
    }
    $ConfigureEmqx = $true
    $UseMqttAuth = $true
    $CreateDevice = $true
    $TestCommands = $true
    $TestTelemetryDlq = $true
    $TestAlerts = $true
    $TestAlertNotifications = $true
    $TestPresence = $true
    $TestRevoke = $true
  }

  if ($Stage4Regression) {
    if ($Stage1Regression -or $Stage2Regression -or $Stage5Regression -or $UseMqttAuth -or $CreateDevice -or $ConfigureEmqx -or $TestCommands -or $TestCommandAcks -or $TestCommandFailed -or $TestCommandTimeout -or $TestAlerts -or $TestAlertNotifications -or $TestTelemetryDlq -or $TestRevoke -or $TestMobileMvp -or $TestFirmwareSimulator) {
      throw "Stage4Regression is a preset and must not be combined with other switches. Use either -Stage4Regression or the individual switches."
    }
    $ConfigureEmqx = $true
    $UseMqttAuth = $true
    $CreateDevice = $true
    $TestCommands = $true
    $TestTelemetryDlq = $true
    $TestAlerts = $true
    $TestAlertNotifications = $true
    $TestPresence = $true
    $TestRevoke = $true
  }

  if ($Stage5Regression) {
    if ($Stage1Regression -or $Stage2Regression -or $Stage4Regression -or $UseMqttAuth -or $CreateDevice -or $ConfigureEmqx -or $TestCommands -or $TestCommandAcks -or $TestCommandFailed -or $TestCommandTimeout -or $TestAlerts -or $TestAlertNotifications -or $TestTelemetryDlq -or $TestRevoke -or $TestMobileMvp -or $TestFirmwareSimulator) {
      throw "Stage5Regression is a preset and must not be combined with other switches. Use either -Stage5Regression or the individual switches."
    }
    $ConfigureEmqx = $true
    $UseMqttAuth = $true
    $CreateDevice = $true
    $TestFirmwareSimulator = $true
    $TestPresence = $true
  }

  if ($TestAlertNotifications -and -not $TestAlerts) {
    throw "TestAlertNotifications requires -TestAlerts (needs an alert trigger to verify notifications)."
  }

  if ($TestPresence -and (-not $UseMqttAuth -or -not $CreateDevice)) {
    throw "TestPresence requires -UseMqttAuth and -CreateDevice (needs device_secret)."
  }

  if ($ConfigureEmqx) {
    Write-Host "Configuring EMQX HTTP authn/authz (via dashboard API)..." -ForegroundColor Cyan
    powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/configure-emqx-http-auth.ps1 -WriteServiceEnv -WriteIngestEnv
    Assert-LastExitCode "configure-emqx-http-auth.ps1 failed"
  }

  if (-not $SkipWriteServiceEnv) {
    Write-Host "Preparing service env files (ignored by git)..." -ForegroundColor Cyan

    $apiEnvPath = "services/api/.env"
    $internalPassword = Read-EnvValue $apiEnvPath "MQTT_INTERNAL_PASSWORD" ""
    $webhookToken = Read-EnvValue $apiEnvPath "EMQX_WEBHOOK_TOKEN" ""
    if ($UseMqttAuth -and -not $internalPassword) {
      throw "MQTT auth enabled but MQTT_INTERNAL_PASSWORD is missing in $apiEnvPath. Run this script with -ConfigureEmqx or run: infra/compose/scripts/configure-emqx-http-auth.ps1 -WriteServiceEnv -WriteIngestEnv"
    }

    # Preset regressions should be deterministic: env files are ignored by git and safe to rewrite.
    $forceEnv = $ForceWriteServiceEnv -or $Stage1Regression -or $Stage2Regression -or $Stage4Regression -or $Stage5Regression

    Write-EnvIfMissingOrForced "services/ingest/.env" @(
      "SERVICE_NAME=ingest-service",
      "",
      "MQTT_URL=$mqttUrl",
      "MQTT_USERNAME=$(if ($UseMqttAuth) { 'ingest-service' } else { '' })",
      "MQTT_PASSWORD=$(if ($UseMqttAuth) { $internalPassword } else { '' })",
      "MQTT_TOPIC_TELEMETRY=telemetry/+",
      "MQTT_TOPIC_PRESENCE=presence/+",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=ingest-service",
      "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
      "KAFKA_TOPIC_TELEMETRY_DLQ=telemetry.dlq.v1",
      "KAFKA_TOPIC_PRESENCE_EVENTS=presence.events.v1"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/telemetry-writer/.env" @(
      "SERVICE_NAME=telemetry-writer",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=telemetry-writer",
      "KAFKA_GROUP_ID=telemetry-writer.v1",
      "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
      "",
      "CLICKHOUSE_URL=$chUrl",
      "CLICKHOUSE_USERNAME=$chUser",
      "CLICKHOUSE_PASSWORD=$chPassword",
      "CLICKHOUSE_DATABASE=$chDb",
      "CLICKHOUSE_TABLE=telemetry_raw",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "",
      "REDIS_URL=$redisUrl",
      "DEDUPE_TTL_SECONDS=604800",
      "",
      "BATCH_MAX_ROWS=2000",
      "BATCH_FLUSH_INTERVAL_MS=1000"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/command-dispatcher/.env" @(
      "SERVICE_NAME=command-dispatcher",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=command-dispatcher",
      "KAFKA_GROUP_ID=command-dispatcher.v1",
      "KAFKA_TOPIC_DEVICE_COMMANDS=device.commands.v1",
      "",
      "MQTT_URL=$mqttUrl",
      "MQTT_USERNAME=$(if ($UseMqttAuth) { 'ingest-service' } else { '' })",
      "MQTT_PASSWORD=$(if ($UseMqttAuth) { $internalPassword } else { '' })",
      "MQTT_TOPIC_COMMAND_PREFIX=cmd/",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/command-ack-receiver/.env" @(
      "SERVICE_NAME=command-ack-receiver",
      "",
      "MQTT_URL=$mqttUrl",
      "MQTT_USERNAME=$(if ($UseMqttAuth) { 'ingest-service' } else { '' })",
      "MQTT_PASSWORD=$(if ($UseMqttAuth) { $internalPassword } else { '' })",
      "MQTT_TOPIC_ACK_PREFIX=cmd_ack/",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=command-ack-receiver",
      "KAFKA_GROUP_ID=command-ack-receiver.v1",
      "KAFKA_TOPIC_DEVICE_COMMAND_ACKS=device.command_acks.v1",
      "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5"
    ) -force:$forceEnv

    $ackTimeoutSeconds = if ($TestCommandTimeout -or $Stage1Regression -or $Stage2Regression -or $Stage4Regression) { "10" } else { "60" }
    $scanIntervalMs = if ($TestCommandTimeout -or $Stage1Regression -or $Stage2Regression -or $Stage4Regression) { "1000" } else { "5000" }

    Write-EnvIfMissingOrForced "services/command-timeout-worker/.env" @(
      "SERVICE_NAME=command-timeout-worker",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=command-timeout-worker",
      "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5",
      "",
      "COMMAND_ACK_TIMEOUT_SECONDS=$ackTimeoutSeconds",
      "SCAN_INTERVAL_MS=$scanIntervalMs",
      "SCAN_LIMIT=200"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/command-events-recorder/.env" @(
      "SERVICE_NAME=command-events-recorder",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=command-events-recorder",
      "KAFKA_GROUP_ID=command-events-recorder.v1",
      "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/command-notify-worker/.env" @(
      "SERVICE_NAME=command-notify-worker",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=command-notify-worker",
      "KAFKA_GROUP_ID=command-notify-worker.v1",
      "KAFKA_TOPIC_DEVICE_COMMAND_EVENTS=device.command_events.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5",
      "",
      "NOTIFY_TYPE=app"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/alert-notify-worker/.env" @(
      "SERVICE_NAME=alert-notify-worker",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=alert-notify-worker",
      "KAFKA_GROUP_ID=alert-notify-worker.v1",
      "KAFKA_TOPIC_ALERTS_EVENTS=alerts.events.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5",
      "",
      "NOTIFY_TYPE=app"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/rule-engine-worker/.env" @(
      "SERVICE_NAME=rule-engine-worker",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=rule-engine-worker",
      "KAFKA_GROUP_ID=rule-engine-worker.v1",
      "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
      "KAFKA_TOPIC_ALERTS_EVENTS=alerts.events.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5",
      "",
      "RULES_REFRESH_MS=5000",
      "MAX_POINTS_PER_RULE=600"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/telemetry-dlq-recorder/.env" @(
      "SERVICE_NAME=telemetry-dlq-recorder",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=telemetry-dlq-recorder",
      "KAFKA_GROUP_ID=telemetry-dlq-recorder.v1",
      "KAFKA_TOPIC_TELEMETRY_DLQ=telemetry.dlq.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/presence-recorder/.env" @(
      "SERVICE_NAME=presence-recorder",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=presence-recorder",
      "KAFKA_GROUP_ID=presence-recorder.v1",
      "KAFKA_TOPIC_PRESENCE_EVENTS=presence.events.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5"
    ) -force:$forceEnv

    Write-EnvIfMissingOrForced "services/api/.env" @(
      "SERVICE_NAME=api-service",
      "API_HOST=0.0.0.0",
      "API_PORT=8080",
      "",
      "AUTH_REQUIRED=false",
      "ADMIN_API_TOKEN=",
      "EMQX_WEBHOOK_TOKEN=$webhookToken",
      "MQTT_INTERNAL_USERNAME=ingest-service",
      "MQTT_INTERNAL_PASSWORD=$internalPassword",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_TOPIC_DEVICE_COMMANDS=device.commands.v1",
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=10",
      "",
      "CLICKHOUSE_URL=$chUrl",
      "CLICKHOUSE_USERNAME=$chUser",
      "CLICKHOUSE_PASSWORD=$chPassword",
      "CLICKHOUSE_DATABASE=$chDb",
      "CLICKHOUSE_TABLE=telemetry_raw",
      "",
      "API_MAX_SERIES_RANGE_HOURS=168",
      "API_MAX_POINTS=100000"
    ) -force:$forceEnv
  }

  if (-not $SkipBuild) {
    Write-Host "Building workspaces..." -ForegroundColor Cyan
    npm run build
    Assert-LastExitCode "npm run build failed"
  }

  Write-Host "Checking infra is reachable..." -ForegroundColor Cyan
  try {
    $resp = Invoke-WebRequest -UseBasicParsing -Uri "$chUrl/ping" -TimeoutSec 3
    if ($resp.StatusCode -ne 200 -or ($resp.Content -notmatch "Ok")) {
      throw "ClickHouse /ping did not return Ok"
    }
  } catch {
    throw "ClickHouse not reachable at $chUrl. Did you run: docker compose -f $ComposeFile --env-file $EnvFile up -d ?"
  }

  Write-Host "Ensuring ClickHouse schema is initialized..." -ForegroundColor Cyan
  $chExists = $false
  try {
    $args = @("compose", "-f", $ComposeFile, "--env-file", $EnvFile, "exec", "-T", "clickhouse", "clickhouse-client", "--user", $chUser)
    if ($chPassword) { $args += @("--password", $chPassword) }
    $args += @("--database", $chDb, "--query", "EXISTS TABLE $chDb.telemetry_raw")
    $out = (& docker @args 2>$null | Out-String).Trim()
    if ($out -eq "1") { $chExists = $true }
  } catch {
    # ignore and fall back to init script
  }
  if (-not $chExists) {
    Write-Host "ClickHouse table missing; running init-clickhouse.ps1..." -ForegroundColor Yellow
    powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/init-clickhouse.ps1 -EnvFile $EnvFile -ComposeFile $ComposeFile
    Assert-LastExitCode "init-clickhouse.ps1 failed"
  }

  Write-Host "Ensuring PostgreSQL schema is initialized..." -ForegroundColor Cyan
  $pgHasSchema = $false
  try {
    $out = (& docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -U $pgUser -d $pgDb -At -c "SELECT (to_regclass('public.devices') IS NOT NULL) AND (to_regclass('public.telemetry_dlq_messages') IS NOT NULL) AND (to_regclass('public.device_presence') IS NOT NULL);" 2>$null | Out-String).Trim()
    if ($out.ToLowerInvariant() -eq "t") { $pgHasSchema = $true }
  } catch {
    # ignore and fall back to init script
  }
  if (-not $pgHasSchema) {
    Write-Host "PostgreSQL tables missing; running init-postgres.ps1..." -ForegroundColor Yellow
    powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/init-postgres.ps1 -EnvFile $EnvFile -ComposeFile $ComposeFile
    Assert-LastExitCode "init-postgres.ps1 failed"
  }

  Write-Host "Ensuring Kafka topics exist..." -ForegroundColor Cyan
  powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/create-kafka-topics.ps1 -EnvFile $EnvFile -ComposeFile $ComposeFile
  Assert-LastExitCode "create-kafka-topics.ps1 failed"

  Write-Host "Starting services..." -ForegroundColor Cyan

  # Start API first so EMQX HTTP authn/authz webhooks are reachable before MQTT clients connect.
  $apiProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/api" -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
  $writerProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/telemetry-writer" -PassThru -RedirectStandardOutput $writerOut -RedirectStandardError $writerErr

  Write-Host "Waiting for API /health..." -ForegroundColor Cyan
  $maxWaitSeconds = 60
  $start = Get-Date
  while ($true) {
    try {
      $health = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/health" -TimeoutSec 2
      if ($health.ok -eq $true) { break }
    } catch {
      # ignore
    }
    if (((Get-Date) - $start).TotalSeconds -gt $maxWaitSeconds) {
      throw "API did not become healthy after ${maxWaitSeconds}s. Logs: $logDir"
    }
    Start-Sleep -Seconds 2
  }
  Write-Host "API is healthy." -ForegroundColor Green

  Write-Host "Checking API system endpoints (/system/status, /dashboard)..." -ForegroundColor Cyan
  try {
    $st = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/system/status" -TimeoutSec 10
    if ($st.success -ne $true) { throw "system/status failed" }
    $dash = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/dashboard" -TimeoutSec 10
    if ($dash.success -ne $true) { throw "dashboard failed" }

    if ($Stage4Regression) {
      if (-not $st.data) { throw "system/status missing data" }
      if (-not $st.data.postgres.status) { throw "system/status missing postgres.status" }
      if (-not $st.data.clickhouse.status) { throw "system/status missing clickhouse.status" }
      if ($st.data.postgres.status -ne "healthy") { throw "system/status postgres not healthy: $($st.data.postgres.status)" }
      if ($st.data.clickhouse.status -ne "healthy") { throw "system/status clickhouse not healthy: $($st.data.clickhouse.status)" }

      if (-not $dash.data) { throw "dashboard missing data" }
      foreach ($k in @("todayDataCount", "onlineDevices", "offlineDevices", "pendingAlerts", "alertsBySeverity", "stations", "lastUpdatedAt")) {
        if (-not ($dash.data.PSObject.Properties.Name -contains $k)) { throw "dashboard missing field: $k" }
      }

      Write-Host "Checking API sensors dictionary (/sensors)..." -ForegroundColor Cyan
      $sensors = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/sensors" -TimeoutSec 10
      if ($sensors.success -ne $true -or -not $sensors.data -or -not $sensors.data.list) { throw "/sensors failed" }
      $requiredKeys = @("sensorKey", "displayName", "unit", "dataType")
      $first = $sensors.data.list | Select-Object -First 1
      foreach ($k in $requiredKeys) {
        if (-not ($first.PSObject.Properties.Name -contains $k)) { throw "/sensors missing field: $k" }
      }
      $hasDisplacement = $false
      foreach ($s in $sensors.data.list) {
        if ($s.sensorKey -eq "displacement_mm") { $hasDisplacement = $true; break }
      }
      if (-not $hasDisplacement) { throw "/sensors missing expected key: displacement_mm" }
    }
  } catch {
    throw "API system endpoints not available. Logs: $logDir"
  }

  $ingestProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/ingest" -PassThru -RedirectStandardOutput $ingestOut -RedirectStandardError $ingestErr
  $cmdProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-dispatcher" -PassThru -RedirectStandardOutput $cmdOut -RedirectStandardError $cmdErr
  $ackProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-ack-receiver" -PassThru -RedirectStandardOutput $ackOut -RedirectStandardError $ackErr
  $timeoutProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-timeout-worker" -PassThru -RedirectStandardOutput $timeoutOut -RedirectStandardError $timeoutErr
  $eventsProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-events-recorder" -PassThru -RedirectStandardOutput $eventsOut -RedirectStandardError $eventsErr
  $notifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-notify-worker" -PassThru -RedirectStandardOutput $notifyOut -RedirectStandardError $notifyErr
  if ($TestAlertNotifications -or $Stage2Regression -or $Stage4Regression) {
    $alertNotifyProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/alert-notify-worker" -PassThru -RedirectStandardOutput $alertNotifyOut -RedirectStandardError $alertNotifyErr
  }
  $ruleProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/rule-engine-worker" -PassThru -RedirectStandardOutput $ruleOut -RedirectStandardError $ruleErr
  $dlqProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/telemetry-dlq-recorder" -PassThru -RedirectStandardOutput $dlqOut -RedirectStandardError $dlqErr
  if ($TestPresence) {
    $presenceProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/presence-recorder" -PassThru -RedirectStandardOutput $presenceOut -RedirectStandardError $presenceErr
  }

  Write-Host "Waiting for ingest MQTT subscription..." -ForegroundColor Cyan
  if (-not (Wait-ForLogMatch $ingestOut "mqtt subscribed" 45)) {
    throw "ingest-service did not subscribe to MQTT within 45s. Logs: $logDir"
  }
  Write-Host "ingest-service is subscribed." -ForegroundColor Green

  Write-Host "Waiting for command-ack-receiver MQTT subscription..." -ForegroundColor Cyan
  if (-not (Wait-ForLogMatch $ackOut "mqtt subscribed" 45)) {
    throw "command-ack-receiver did not subscribe to MQTT within 45s. Logs: $logDir"
  }
  Write-Host "command-ack-receiver is subscribed." -ForegroundColor Green

  Write-Host "Waiting for command-timeout-worker startup..." -ForegroundColor Cyan
  if (-not (Wait-ForLogMatch $timeoutOut "command-timeout-worker started" 45)) {
    throw "command-timeout-worker did not start within 45s. Logs: $logDir"
  }
  Write-Host "command-timeout-worker is running." -ForegroundColor Green

  Write-Host "Waiting for command-events-recorder startup..." -ForegroundColor Cyan
  if (-not (Wait-ForLogMatch $eventsOut "device.command_events" 45)) {
    # recorder logs include topic name on schema invalid/skipped; use looser match by service startup info if needed
    if (-not (Wait-ForLogMatch $eventsOut "command event recorded" 45)) {
      Write-Host "WARN: command-events-recorder startup marker not found; continuing." -ForegroundColor Yellow
    }
  }

  Write-Host "Waiting for command-notify-worker startup..." -ForegroundColor Cyan
  if (-not (Wait-ForLogMatch $notifyOut "command-notify-worker started" 45)) {
    throw "command-notify-worker did not start within 45s. Logs: $logDir"
  }
  Write-Host "command-notify-worker is running." -ForegroundColor Green

  if ($alertNotifyProc) {
    Write-Host "Waiting for alert-notify-worker startup..." -ForegroundColor Cyan
    if (-not (Wait-ForLogMatch $alertNotifyOut "alert-notify-worker started" 45)) {
      throw "alert-notify-worker did not start within 45s. Logs: $logDir"
    }
    Write-Host "alert-notify-worker is running." -ForegroundColor Green
  }

  Write-Host "Waiting for telemetry-dlq-recorder startup..." -ForegroundColor Cyan
  if (-not (Wait-ForLogMatch $dlqOut "telemetry-dlq-recorder started" 45)) {
    throw "telemetry-dlq-recorder did not start within 45s. Logs: $logDir"
  }
  Write-Host "telemetry-dlq-recorder is running." -ForegroundColor Green

  if ($presenceProc) {
    Write-Host "Waiting for presence-recorder startup..." -ForegroundColor Cyan
    if (-not (Wait-ForLogMatch $presenceOut "presence-recorder started" 45)) {
      throw "presence-recorder did not start within 45s. Logs: $logDir"
    }
    Write-Host "presence-recorder is running." -ForegroundColor Green
  }

  Write-Host "Waiting for rule-engine-worker startup..." -ForegroundColor Cyan
  if (-not (Wait-ForLogMatch $ruleOut "rule-engine-worker started" 45)) {
    throw "rule-engine-worker did not start within 45s. Logs: $logDir"
  }
  Write-Host "rule-engine-worker is running." -ForegroundColor Green

  $deviceSecret = $null
  if ($CreateDevice) {
    Write-Host "Creating a test device via API..." -ForegroundColor Cyan
    $body = @{
      deviceId = $DeviceId
      deviceName = "smoke-device"
      deviceType = "generic"
      metadata = @{ note = "smoke_test" }
    } | ConvertTo-Json -Depth 5

    try {
      $create = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices" -ContentType "application/json" -Body $body -TimeoutSec 10
      if (-not $create.success -or -not $create.data.deviceSecret) {
        throw "unexpected API response"
      }
      $deviceSecret = [string]$create.data.deviceSecret
    } catch {
      throw "device creation failed. Ensure PostgreSQL is initialized (infra/compose/scripts/init-postgres.ps1). Logs: $logDir"
    }
    Write-Host "Device created: $DeviceId (secret not printed)" -ForegroundColor Green
  }

  if ($Stage4Regression) {
    Write-Host "Declaring device sensors via API (stage4)..." -ForegroundColor Cyan
    $declBody = @{
      sensors = @(
        @{ sensorKey = "displacement_mm"; status = "enabled" },
        @{ sensorKey = "tilt_x_deg"; status = "enabled" },
        @{ sensorKey = "battery_v"; status = "enabled" },
        @{ sensorKey = "humidity_pct"; status = "missing" }
      )
    } | ConvertTo-Json -Depth 6

    $declUrl = "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/sensors"
    $decl = Invoke-RestMethod -Method Put -Uri $declUrl -ContentType "application/json" -Body $declBody -TimeoutSec 10
    if ($decl.success -ne $true) { throw "device sensors PUT failed. Logs: $logDir" }

    $get = Invoke-RestMethod -Method Get -Uri $declUrl -TimeoutSec 10
    if ($get.success -ne $true -or -not $get.data -or -not $get.data.list) { throw "device sensors GET failed. Logs: $logDir" }
    $found = $false
    foreach ($row in $get.data.list) {
      if ($row.sensorKey -eq "displacement_mm" -and $row.status -eq "enabled") { $found = $true; break }
    }
    if (-not $found) { throw "device sensors declaration mismatch (expected displacement_mm enabled). Logs: $logDir" }
  }

  if ($TestPresence) {
    Write-Host "Publishing presence (online) to MQTT..." -ForegroundColor Cyan
    Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish presence (online) --`n")
    $pExit = Run-Node @(
      "scripts/dev/publish-presence.js",
      "--mqtt", $mqttUrl,
      "--device", $DeviceId,
      "--status", "online",
      "--username", $DeviceId,
      "--password", $deviceSecret
    ) $publishLog
    if ($pExit -ne 0) {
      throw "publish-presence.js failed (exit=$pExit). Logs: $logDir"
    }

    Write-Host "Waiting for presence to be recorded in PostgreSQL..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds(45)
    $recorded = $false
    while ((Get-Date) -lt $deadline) {
      try {
        $count = docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -U $pgUser -d $pgDb -At -c "SELECT count(*) FROM device_presence WHERE device_id = '$DeviceId'::uuid AND status='online';"
        Assert-LastExitCode "psql failed to query device_presence"
        if ([int]$count -ge 1) { $recorded = $true; break }
      } catch {
        # ignore transient
      }
      Start-Sleep -Seconds 2
    }
    if (-not $recorded) {
      throw "presence was not recorded within 45s. Logs: $logDir"
    }
    Write-Host "Presence recorded." -ForegroundColor Green
  }

  if ($TestFirmwareSimulator) {
    if (-not $UseMqttAuth -or -not $CreateDevice -or -not $deviceSecret) {
      throw "TestFirmwareSimulator requires -UseMqttAuth and -CreateDevice (needs device_secret)."
    }

    Write-Host "Starting firmware simulator (MQTT telemetry + command ack)..." -ForegroundColor Cyan
    $firmwareProc = Start-Process -FilePath "node" -ArgumentList @(
      "scripts/dev/firmware-sim.js",
      "--mqtt", $mqttUrl,
      "--device", $DeviceId,
      "--username", $DeviceId,
      "--password", $deviceSecret,
      "--stateFile", $firmwareState,
      "--telemetryIntervalMs", "2000"
    ) -WorkingDirectory "." -PassThru -RedirectStandardOutput $firmwareOut -RedirectStandardError $firmwareErr

    if (-not (Wait-ForLogMatch $firmwareOut "^ready$" 45)) {
      throw "firmware simulator did not become ready within 45s. Logs: $logDir"
    }
    Write-Host "firmware simulator is ready." -ForegroundColor Green
  }

  if ($UseMqttAuth) {
    if (-not $CreateDevice) {
      throw "UseMqttAuth requires CreateDevice (needs device_secret)."
    }

    Write-Host "Verifying anonymous MQTT publish is denied..." -ForegroundColor Cyan
    $anonDenied = $false
    for ($i = 1; $i -le 10; $i++) {
      Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- anonymous attempt " + $i + " --`n")
      $exit = Run-Node @("scripts/dev/publish-telemetry.js", "--mqtt", $mqttUrl, "--device", $DeviceId) $publishLog
      if ($exit -eq 0) {
        throw "Expected anonymous MQTT publish to be denied, but it succeeded. Check EMQX authn is enabled and points to the correct URL."
      }
      $tail = ""
      try { $tail = (Get-Content -LiteralPath $publishLog -Tail 30 | Out-String) } catch { }
      if ($tail -match "Not authorized") { $anonDenied = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $anonDenied) {
      throw "Anonymous MQTT publish did not clearly fail with 'Not authorized' after retries. Check EMQX authn resource health and webhook connectivity. Logs: $logDir"
    }
  }

  if (-not $TestFirmwareSimulator) {
    Write-Host "Publishing telemetry to MQTT..." -ForegroundColor Cyan
    $published = $false
    for ($i = 1; $i -le 10; $i++) {
      Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish attempt " + $i + " --`n")
      if ($UseMqttAuth) {
        $exit = Run-Node @("scripts/dev/publish-telemetry.js", "--mqtt", $mqttUrl, "--device", $DeviceId, "--username", $DeviceId, "--password", $deviceSecret) $publishLog
      } else {
        $exit = Run-Node @("scripts/dev/publish-telemetry.js", "--mqtt", $mqttUrl, "--device", $DeviceId) $publishLog
      }
      if ($exit -eq 0) { $published = $true; break }
      Start-Sleep -Seconds ([Math]::Min(10, 1 + ($i * 2)))
    }
    if (-not $published) {
      throw "publish-telemetry.js failed after retries. See: $publishLog"
    }
  } else {
    Write-Host "Telemetry is provided by firmware simulator." -ForegroundColor DarkGray
  }

  Write-Host "Querying latest state..." -ForegroundColor Cyan
  $stateUrl = "http://$apiLocalHost`:$apiPort/api/v1/data/state/$DeviceId"
  $deadline = (Get-Date).AddSeconds(45)
  $state = $null
  while ((Get-Date) -lt $deadline) {
    try {
      $state = Invoke-RestMethod -Uri $stateUrl -TimeoutSec 3
      if ($state.success -eq $true) { break }
    } catch {
      # ignore
    }
    Start-Sleep -Seconds 2
  }
  if (-not $state -or $state.success -ne $true) {
    throw "state query failed or timed out. Logs: $logDir"
  }

  $metrics = $state.data.state.metrics
  foreach ($k in @("displacement_mm", "tilt_x_deg", "battery_v")) {
    if (-not $metrics.PSObject.Properties.Name -contains $k) {
      throw "Missing metric '$k' in state response. Logs: $logDir"
    }
  }

  Write-Host "Querying series..." -ForegroundColor Cyan
  $startTime = (Get-Date).AddHours(-1).ToUniversalTime().ToString("o")
  $endTime = (Get-Date).AddHours(1).ToUniversalTime().ToString("o")
  $seriesUrl = "http://$apiLocalHost`:$apiPort/api/v1/data/series/$($DeviceId)?startTime=$startTime&endTime=$endTime&sensorKeys=displacement_mm"
  $series = Invoke-RestMethod -Uri $seriesUrl -TimeoutSec 10
  if ($series.success -ne $true) { throw "series query failed. Logs: $logDir" }

  if ($TestFirmwareSimulator) {
    function Invoke-FirmwareCommand([string]$commandType, [hashtable]$payload, [string]$expectResultKey = "") {
      Write-Host "Creating firmware command via API (type=$commandType)..." -ForegroundColor Cyan
      $cmdBody = @{
        commandType = $commandType
        payload = $payload
      } | ConvertTo-Json -Depth 10

      $cmdResp = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/commands" -ContentType "application/json" -Body $cmdBody -TimeoutSec 10
      if (-not $cmdResp.success -or -not $cmdResp.data.commandId) {
        throw "command creation failed (type=$commandType). Logs: $logDir"
      }
      $cmdId = [string]$cmdResp.data.commandId

      Write-Host "Waiting for command status to become acked (type=$commandType)..." -ForegroundColor Cyan
      $deadline = (Get-Date).AddSeconds(45)
      $status = ""
      $cmd = $null
      while ((Get-Date) -lt $deadline) {
        try {
          $cmd = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/commands/$cmdId" -TimeoutSec 3
          if ($cmd.success -eq $true -and $cmd.data.status) { $status = [string]$cmd.data.status }
        } catch {
          # ignore transient failures
        }
        if ($status -eq "acked" -or $status -eq "failed") { break }
        Start-Sleep -Seconds 2
      }
      if ($status -ne "acked") {
        $errMsg = ""
        try { $errMsg = $(if ($cmd -and $cmd.data -and $cmd.data.errorMessage) { [string]$cmd.data.errorMessage } else { "" }) } catch { }
        throw "firmware command did not ack within 45s (type=$commandType status=$status err=$errMsg). Logs: $logDir"
      }

      if ($expectResultKey -and $expectResultKey.Length -gt 0) {
        try {
          if (-not ($cmd.data.result.PSObject.Properties.Name -contains $expectResultKey)) {
            throw "missing result key '$expectResultKey'"
          }
        } catch {
          throw "firmware command result did not include expected key '$expectResultKey' (type=$commandType). Logs: $logDir"
        }
      }

      return $cmdId
    }

    $null = Invoke-FirmwareCommand "ping" @{} "pong"
    $null = Invoke-FirmwareCommand "set_config" @{ sampling_s = 7; report_interval_s = 7 } "applied"
    $null = Invoke-FirmwareCommand "reboot" @{} "rebooting"

    # Optional: ensure simulator stays alive and continues telemetry after reboot.
    if (-not (Wait-ForLogMatch $firmwareOut "telemetry published:" 45)) {
      throw "firmware simulator did not publish telemetry (post reboot) within 45s. Logs: $logDir"
    }
  }
  if (-not $series.data.series -or $series.data.series.Count -lt 1) {
    throw "series response has no data. Logs: $logDir"
  }
  if (-not $series.data.series[0].points -or $series.data.series[0].points.Count -lt 1) {
    throw "series response has no points. Logs: $logDir"
  }

  if ($TestCommands) {
    if (-not $UseMqttAuth -or -not $CreateDevice -or -not $deviceSecret) {
      throw "TestCommands requires -UseMqttAuth and -CreateDevice (needs device credentials)."
    }

    function Get-NotificationStats([string]$deviceId, [string]$startTime, [string]$endTime) {
      return Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($deviceId)/command-notifications/stats?startTime=$startTime&endTime=$endTime" -TimeoutSec 10
    }

    function Verify-NotificationAndRead([string]$deviceId, [string]$commandId, [string]$windowStartTime, [string]$windowEndTime) {
      Write-Host "Verifying command notification is created..." -ForegroundColor Cyan
      $deadline = (Get-Date).AddSeconds(45)
      $found = $false
      $notificationId = ""
      while ((Get-Date) -lt $deadline) {
        try {
          $n = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($deviceId)/command-notifications?commandId=$commandId" -TimeoutSec 3
          if ($n.success -eq $true -and $n.data.list -and $n.data.list.Count -ge 1) {
            $notificationId = [string]$n.data.list[0].notificationId
            $found = $true
            break
          }
        } catch {
          # ignore
        }
        Start-Sleep -Seconds 2
      }
      if (-not $found) {
        throw "command notification not found within 45s. Logs: $logDir"
      }

      Write-Host "Verifying unreadOnly filter..." -ForegroundColor Cyan
      $deadline = (Get-Date).AddSeconds(20)
      $unreadFound = $false
      while ((Get-Date) -lt $deadline) {
        try {
          $u = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($deviceId)/command-notifications?commandId=$commandId&unreadOnly=true&pageSize=50" -TimeoutSec 3
          if ($u.success -eq $true -and $u.data.list -and $u.data.list.Count -ge 1) {
            $unreadFound = $true
            break
          }
        } catch {
          # ignore
        }
        Start-Sleep -Seconds 2
      }
      if (-not $unreadFound) {
        throw "unreadOnly filter did not return the notification within 20s. Logs: $logDir"
      }

      Write-Host "Verifying notification stats and read marker..." -ForegroundColor Cyan
      $statsBefore = Get-NotificationStats $deviceId $windowStartTime $windowEndTime
      if ($statsBefore.success -ne $true) { throw "notification stats query failed. Logs: $logDir" }
      if ($statsBefore.data.totals.total -lt 1) { throw "notification stats total < 1. Logs: $logDir" }
      $unreadBefore = [int]$statsBefore.data.totals.unread
      if ($unreadBefore -lt 1) { throw "notification stats unread < 1. Logs: $logDir" }

      $read = Invoke-RestMethod -Method Put -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($deviceId)/command-notifications/$notificationId/read" -TimeoutSec 10
      if ($read.success -ne $true) { throw "mark notification read failed. Logs: $logDir" }

      $statsAfter = Get-NotificationStats $deviceId $windowStartTime $windowEndTime
      if ($statsAfter.success -ne $true) { throw "notification stats query failed (after read). Logs: $logDir" }
      $unreadAfter = [int]$statsAfter.data.totals.unread
      if ($unreadAfter -gt ($unreadBefore - 1)) {
        throw "notification stats unread did not decrease after read (before=$unreadBefore after=$unreadAfter). Logs: $logDir"
      }

      $deadline = (Get-Date).AddSeconds(20)
      while ((Get-Date) -lt $deadline) {
        try {
          $u2 = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($deviceId)/command-notifications?commandId=$commandId&unreadOnly=true&pageSize=50" -TimeoutSec 3
          if ($u2.success -eq $true -and (-not $u2.data.list -or $u2.data.list.Count -eq 0)) { return }
        } catch {
          # ignore
        }
        Start-Sleep -Seconds 2
      }
      throw "unreadOnly filter still returns the notification after read within 20s. Logs: $logDir"
    }

    function Invoke-CommandTest([ValidateSet("acked", "failed", "timeout")][string]$mode) {
      $testStartTime = (Get-Date).ToUniversalTime().ToString("o")
      $testEndTime = (Get-Date).AddMinutes(5).ToUniversalTime().ToString("o")

      Write-Host "Subscribing to device command topic (mode=$mode)..." -ForegroundColor Cyan
      $waitProc = Start-Process -FilePath "node" -ArgumentList @(
        "scripts/dev/wait-for-command.js",
        "--mqtt", $mqttUrl,
        "--device", $DeviceId,
        "--username", $DeviceId,
        "--password", $deviceSecret,
        "--timeout", "45"
      ) -WorkingDirectory "." -PassThru -RedirectStandardOutput $waitCmdOut -RedirectStandardError $waitCmdErr

      Start-Sleep -Seconds 2

      Write-Host "Creating a device command via API..." -ForegroundColor Cyan
      $cmdBody = @{
        commandType = "set_config"
        payload = @{ sampling_s = 5; report_interval_s = 5 }
      } | ConvertTo-Json -Depth 5

      $cmdResp = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/commands" -ContentType "application/json" -Body $cmdBody -TimeoutSec 10
      if (-not $cmdResp.success -or -not $cmdResp.data.commandId) {
        throw "command creation failed. Logs: $logDir"
      }
      $cmdId = [string]$cmdResp.data.commandId

      if (-not $waitProc.WaitForExit(60000)) {
        try { Stop-Process -Id $waitProc.Id -Force } catch { }
        throw "Timed out waiting for MQTT command delivery. Logs: $logDir"
      }
      try { $waitProc.Refresh() } catch { }
      $exitCode = $null
      try { $exitCode = $waitProc.ExitCode } catch { }

      if ($null -eq $exitCode -or $exitCode -ne 0) {
        $received = $false
        try {
          if (Test-Path $waitCmdOut) {
            $received = Select-String -Path $waitCmdOut -Pattern "^received:" -Quiet
          }
        } catch {
          # ignore
        }

        if (-not $received) {
          $codeText = $(if ($null -eq $exitCode) { "unknown" } else { [string]$exitCode })
          throw "Device did not receive command (wait-for-command.js exit=$codeText). Logs: $logDir"
        }
      }

      if ($mode -eq "acked" -or $mode -eq "failed") {
        $statusArg = $(if ($mode -eq "acked") { "acked" } else { "failed" })
        # NOTE: On Windows/PowerShell, passing raw JSON with quotes to native executables can lose quotes due to
        # command line escaping rules. Keep the JSON valid by escaping quotes.
        $resultArg = $(if ($mode -eq "failed") { '{\"error\":\"simulated_failure\"}' } else { '' })

        Write-Host "Publishing command ack from device (status=$statusArg)..." -ForegroundColor Cyan
        Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish command ack (" + $statusArg + ") --`n")

        $args = @(
          "scripts/dev/publish-command-ack.js",
          "--mqtt", $mqttUrl,
          "--device", $DeviceId,
          "--commandId", $cmdId,
          "--username", $DeviceId,
          "--password", $deviceSecret,
          "--status", $statusArg
        )
        if ($mode -eq "failed") { $args += @("--result", $resultArg) }

        $ackExit = Run-Node $args $publishLog
        if ($ackExit -ne 0) {
          throw "publish-command-ack.js failed (exit=$ackExit). Logs: $logDir"
        }
      }

      $expectedStatus = $(if ($mode -eq "timeout") { "timeout" } else { $mode })
      $expectedEventType = $(if ($mode -eq "acked") { "COMMAND_ACKED" } elseif ($mode -eq "failed") { "COMMAND_FAILED" } else { "COMMAND_TIMEOUT" })

      Write-Host "Waiting for command status to become $expectedStatus..." -ForegroundColor Cyan
      $deadline = (Get-Date).AddSeconds(45)
      $status = ""
      while ((Get-Date) -lt $deadline) {
        try {
          $cmd = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/commands/$cmdId" -TimeoutSec 3
          if ($cmd.success -eq $true -and $cmd.data.status) { $status = [string]$cmd.data.status }
        } catch {
          # ignore transient failures
        }
        if ($status -eq $expectedStatus) { break }
        Start-Sleep -Seconds 2
      }
      if ($status -ne $expectedStatus) {
        throw "command did not become $expectedStatus within 45s (status='$status'). Logs: $logDir"
      }

      Write-Host "Verifying $expectedEventType event is recorded..." -ForegroundColor Cyan
      $deadline = (Get-Date).AddSeconds(45)
      $found = $false
      while ((Get-Date) -lt $deadline) {
        try {
          $events = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/command-events?commandId=$cmdId&eventType=$expectedEventType" -TimeoutSec 3
          if ($events.success -eq $true -and $events.data.list -and $events.data.list.Count -ge 1) { $found = $true; break }
        } catch {
          # ignore
        }
        Start-Sleep -Seconds 2
      }
      if (-not $found) {
        throw "$expectedEventType event not found within 45s. Logs: $logDir"
      }

      if ($mode -eq "failed" -or $mode -eq "timeout") {
        Verify-NotificationAndRead $DeviceId $cmdId $testStartTime $testEndTime
      }
    }

    if ($Stage1Regression -or $Stage2Regression -or $Stage4Regression) {
      Invoke-CommandTest "acked"
      Invoke-CommandTest "failed"
      Invoke-CommandTest "timeout"
    } else {
      $selected = 0
      if ($TestCommandAcks) { $selected++ }
      if ($TestCommandFailed) { $selected++ }
      if ($TestCommandTimeout) { $selected++ }
      if ($selected -gt 1) {
        throw "TestCommandAcks/TestCommandFailed/TestCommandTimeout are mutually exclusive (a single command has only one final status)."
      }

      if ($TestCommandAcks) { Invoke-CommandTest "acked" }
      if ($TestCommandFailed) { Invoke-CommandTest "failed" }
      if ($TestCommandTimeout) { Invoke-CommandTest "timeout" }
    }
  }

  if ($TestTelemetryDlq) {
    if (-not $UseMqttAuth -or -not $CreateDevice -or -not $deviceSecret) {
      throw "TestTelemetryDlq requires -UseMqttAuth and -CreateDevice (needs device credentials)."
    }

    $startTime = (Get-Date).AddMinutes(-5).ToUniversalTime().ToString("o")
    $endTime = (Get-Date).AddMinutes(5).ToUniversalTime().ToString("o")

    Write-Host "Publishing invalid telemetry JSON to trigger DLQ..." -ForegroundColor Cyan
    Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish invalid telemetry json --`n")
    $exit = Run-Node @(
      "scripts/dev/publish-raw-mqtt.js",
      "--mqtt", $mqttUrl,
      "--topic", "telemetry/$DeviceId",
      "--username", $DeviceId,
      "--password", $deviceSecret,
      "--payload", "{"
    ) $publishLog
    if ($exit -ne 0) {
      throw "publish-raw-mqtt.js failed (exit=$exit). Logs: $logDir"
    }

    Write-Host "Publishing oversized payload to trigger payload_too_large..." -ForegroundColor Cyan
    Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish oversized payload --`n")
    $exit = Run-Node @(
      "scripts/dev/publish-raw-mqtt.js",
      "--mqtt", $mqttUrl,
      "--topic", "telemetry/$DeviceId",
      "--username", $DeviceId,
      "--password", $deviceSecret,
      "--payloadSize", "300000"
    ) $publishLog
    if ($exit -ne 0) {
      throw "publish-raw-mqtt.js failed (exit=$exit). Logs: $logDir"
    }

    Write-Host "Publishing telemetry with too many metrics to trigger metrics_too_many..." -ForegroundColor Cyan
    Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish too many metrics --`n")
    $exit = Run-Node @(
      "scripts/dev/publish-telemetry-many-metrics.js",
      "--mqtt", $mqttUrl,
      "--device", $DeviceId,
      "--count", "600",
      "--username", $DeviceId,
      "--password", $deviceSecret
    ) $publishLog
    if ($exit -ne 0) {
      throw "publish-telemetry-many-metrics.js failed (exit=$exit). Logs: $logDir"
    }

    Write-Host "Waiting for telemetry DLQ message to be recorded..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds(45)
    $found = $false
    $dlqId = ""
    while ((Get-Date) -lt $deadline) {
      try {
        $dlq = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/telemetry/dlq?reasonCode=invalid_json&startTime=$startTime&endTime=$endTime" -TimeoutSec 5
        if ($dlq.success -eq $true -and $dlq.data.list -and $dlq.data.list.Count -ge 1) {
          $dlqId = [string]$dlq.data.list[0].messageId
          $found = $true
          break
        }
      } catch {
        # ignore
      }
      Start-Sleep -Seconds 2
    }
    if (-not $found) {
      throw "telemetry dlq message not found within 45s. Logs: $logDir"
    }

    $detail = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/telemetry/dlq/$dlqId" -TimeoutSec 10
    if ($detail.success -ne $true -or -not $detail.data.rawPayload) {
      throw "telemetry dlq detail query failed. Logs: $logDir"
    }

    $stats = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/telemetry/dlq/stats?startTime=$startTime&endTime=$endTime" -TimeoutSec 10
    if ($stats.success -ne $true) {
      throw "telemetry dlq stats query failed. Logs: $logDir"
    }
    if ($stats.data.totals.total -lt 1) {
      throw "telemetry dlq stats total < 1. Logs: $logDir"
    }
    $hasInvalid = $false
    foreach ($x in $stats.data.byReasonCode) {
      if ($x.reasonCode -eq "invalid_json" -and $x.count -ge 1) { $hasInvalid = $true; break }
    }
    if (-not $hasInvalid) {
      throw "telemetry dlq stats missing invalid_json count. Logs: $logDir"
    }

    $hasTooLarge = $false
    $hasTooMany = $false
    foreach ($x in $stats.data.byReasonCode) {
      if ($x.reasonCode -eq "payload_too_large" -and $x.count -ge 1) { $hasTooLarge = $true }
      if ($x.reasonCode -eq "metrics_too_many" -and $x.count -ge 1) { $hasTooMany = $true }
    }
    if (-not $hasTooLarge) {
      throw "telemetry dlq stats missing payload_too_large count. Logs: $logDir"
    }
    if (-not $hasTooMany) {
      throw "telemetry dlq stats missing metrics_too_many count. Logs: $logDir"
    }
  }

  if ($TestAlerts) {
    if (-not $UseMqttAuth -or -not $CreateDevice -or -not $deviceSecret) {
      throw "TestAlerts requires -UseMqttAuth and -CreateDevice (needs device credentials)."
    }

    Write-Host "Creating an alert rule via API..." -ForegroundColor Cyan
    $dsl = @{
      dslVersion = 1
      name = "smoke displacement threshold"
      scope = @{ type = "device"; deviceId = $DeviceId }
      enabled = $true
      severity = "high"
      timeField = "received"
      missing = @{ policy = "ignore" }
      when = @{
        op = "AND"
        items = @(@{ sensorKey = "displacement_mm"; operator = ">="; value = 1.0 })
      }
      window = @{ type = "points"; points = 1 }
      cooldown = @{ minutes = 0 }
      actions = @(@{ type = "emit_alert"; titleTemplate = "smoke threshold"; messageTemplate = "device={{deviceId}} value={{value}}" })
    }

    $ruleBody = @{
      rule = @{
        ruleName = "smoke threshold"
        description = "smoke test rule"
        scope = @{ type = "device"; deviceId = $DeviceId }
        isActive = $true
      }
      dsl = $dsl
    } | ConvertTo-Json -Depth 10

    $createRule = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/alert-rules" -ContentType "application/json" -Body $ruleBody -TimeoutSec 10
    if ($createRule.success -ne $true -or -not $createRule.data.ruleId) {
      throw "create alert rule failed. Logs: $logDir"
    }
    $ruleId = [string]$createRule.data.ruleId

    $testUserId = $null
    if ($TestAlertNotifications) {
      Write-Host "Preparing alert notification subscription (PostgreSQL)..." -ForegroundColor Cyan
      $testUserId = (New-Guid).ToString()
      $username = "smoke_user_" + ($testUserId.Substring(0, 8))
      $sql = @"
INSERT INTO users (user_id, username, password_hash, status)
VALUES ('$testUserId', '$username', 'smoke_test_hash_placeholder', 'active')
ON CONFLICT (username) DO NOTHING;

INSERT INTO user_alert_subscriptions (user_id, device_id, min_severity, notify_app, is_active)
VALUES ('$testUserId', '$DeviceId', 'low', TRUE, TRUE);
"@
      docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -v ON_ERROR_STOP=1 -U $pgUser -d $pgDb -c $sql 1>$null
      Assert-LastExitCode "psql failed to create alert notification subscription"
    }

    Write-Host "Publishing telemetry to trigger alert..." -ForegroundColor Cyan
    Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish telemetry for alert --`n")
    $exit = Run-Node @(
      "scripts/dev/publish-telemetry.js",
      "--mqtt", $mqttUrl,
      "--device", $DeviceId,
      "--username", $DeviceId,
      "--password", $deviceSecret,
      "--seq", "9001"
    ) $publishLog
    if ($exit -ne 0) { throw "publish-telemetry.js failed (exit=$exit). Logs: $logDir" }

    Write-Host "Waiting for alert to appear..." -ForegroundColor Cyan
    $deadline = (Get-Date).AddSeconds(45)
    $alertId = ""
    while ((Get-Date) -lt $deadline) {
      try {
        $alerts = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/alerts?page=1&pageSize=50&deviceId=$DeviceId" -TimeoutSec 3
        if ($alerts.success -eq $true -and $alerts.data.list) {
          foreach ($a in $alerts.data.list) {
            if ($a.ruleId -eq $ruleId -and $a.status -in @("active", "acked")) { $alertId = [string]$a.alertId; break }
          }
        }
      } catch {
        # ignore
      }
      if ($alertId) { break }
      Start-Sleep -Seconds 2
    }
    if (-not $alertId) { throw "alert not found within 45s. Logs: $logDir" }

    Write-Host "Verifying alert event stream..." -ForegroundColor Cyan
    $events = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/alerts/$($alertId)/events" -TimeoutSec 10
    if ($events.success -ne $true -or -not $events.data.events -or $events.data.events.Count -lt 1) {
      throw "alert events missing. Logs: $logDir"
    }

    if ($TestAlertNotifications) {
      Write-Host "Waiting for alert notification..." -ForegroundColor Cyan
      $triggerEventId = ""
      foreach ($ev in $events.data.events) {
        if ($ev.eventType -eq "ALERT_TRIGGER") { $triggerEventId = [string]$ev.eventId; break }
      }
      if (-not $triggerEventId) { throw "ALERT_TRIGGER eventId missing. Logs: $logDir" }

      $deadline = (Get-Date).AddSeconds(30)
      $hasNotification = $false
      while ((Get-Date) -lt $deadline) {
        $count = docker compose -f $ComposeFile --env-file $EnvFile exec -T postgres psql -U $pgUser -d $pgDb -At -c "SELECT count(*) FROM alert_notifications WHERE event_id = '$triggerEventId'::uuid AND user_id = '$testUserId'::uuid AND notify_type = 'app';"
        Assert-LastExitCode "psql failed to query alert_notifications"
        if ($count.Trim() -match "^[1-9]") { $hasNotification = $true; break }
        Start-Sleep -Seconds 2
      }
      if (-not $hasNotification) {
        throw "alert notification not created within 30s (eventId=$triggerEventId). Logs: $logDir"
      }
      Write-Host "Alert notification created." -ForegroundColor Green
    }

    Write-Host "Acking alert..." -ForegroundColor Cyan
    $ackBody = @{ notes = "smoke ack" } | ConvertTo-Json -Depth 5
    $ack = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/alerts/$($alertId)/ack" -ContentType "application/json" -Body $ackBody -TimeoutSec 10
    if ($ack.success -ne $true) { throw "ack alert failed. Logs: $logDir" }

    Write-Host "Resolving alert..." -ForegroundColor Cyan
    $resolveBody = @{ notes = "smoke resolve" } | ConvertTo-Json -Depth 5
    $resolve = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/alerts/$($alertId)/resolve" -ContentType "application/json" -Body $resolveBody -TimeoutSec 10
    if ($resolve.success -ne $true) { throw "resolve alert failed. Logs: $logDir" }
  }

  if ($TestRevoke) {
    if (-not $UseMqttAuth -or -not $CreateDevice -or -not $deviceSecret) {
      throw "TestRevoke requires -UseMqttAuth and -CreateDevice (needs device credentials)."
    }

    Write-Host "Revoking device via API..." -ForegroundColor Cyan
    $revokeUrl = "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/revoke"
    $revoke = Invoke-RestMethod -Method Put -Uri $revokeUrl -TimeoutSec 10
    if (-not $revoke.success) { throw "revoke API failed. Logs: $logDir" }

    Write-Host "Verifying revoked device is immediately denied by EMQX authn..." -ForegroundColor Cyan
    $revokedDenied = $false
    for ($i = 1; $i -le 10; $i++) {
      Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- revoked attempt " + $i + " --`n")
      $exit = Run-Node @(
        "scripts/dev/publish-telemetry.js",
        "--mqtt", $mqttUrl,
        "--device", $DeviceId,
        "--username", $DeviceId,
        "--password", $deviceSecret,
        "--seq", (1000 + $i)
      ) $publishLog
      if ($exit -eq 0) {
        throw "Expected revoked device publish to be denied, but it succeeded. Check EMQX authn and devices.status revoke enforcement."
      }
      $tail = ""
      try { $tail = (Get-Content -LiteralPath $publishLog -Tail 40 | Out-String) } catch { }
      if ($tail -match "Not authorized") { $revokedDenied = $true; break }
      Start-Sleep -Seconds 2
    }
    if (-not $revokedDenied) {
      throw "Revoked device publish did not clearly fail with 'Not authorized' after retries. Logs: $logDir"
    }
  }

  if ($TestMobileMvp) {
    Write-Host "Testing patrol reports API..." -ForegroundColor Cyan
    $patrolBody = @{
      notes = "smoke patrol"
      latitude = 21.6847
      longitude = 108.3516
      attachments = @(@{ url = "https://example.com/patrol/photo-1.jpg"; type = "image"; name = "photo-1.jpg" })
    } | ConvertTo-Json -Depth 6

    $patrolResp = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/patrol/reports" -ContentType "application/json" -Body $patrolBody -TimeoutSec 10
    if ($patrolResp.success -ne $true -or -not $patrolResp.data.reportId) {
      throw "patrol report create failed. Logs: $logDir"
    }
    $reportId = [string]$patrolResp.data.reportId

    $patrolList = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/patrol/reports?page=1&pageSize=10" -TimeoutSec 10
    if ($patrolList.success -ne $true -or -not $patrolList.data.list) {
      throw "patrol report list failed. Logs: $logDir"
    }

    $patrolDetail = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/patrol/reports/$reportId" -TimeoutSec 10
    if ($patrolDetail.success -ne $true -or $patrolDetail.data.reportId -ne $reportId) {
      throw "patrol report detail failed. Logs: $logDir"
    }

    Write-Host "Testing SOS API..." -ForegroundColor Cyan
    $sosBody = @{
      latitude = 21.6849
      longitude = 108.3519
      description = "smoke sos"
      priority = "high"
    } | ConvertTo-Json -Depth 6

    $sosResp = Invoke-RestMethod -Method Post -Uri "http://$apiLocalHost`:$apiPort/api/v1/sos" -ContentType "application/json" -Body $sosBody -TimeoutSec 10
    if ($sosResp.success -ne $true -or -not $sosResp.data.sosId) {
      throw "sos create failed. Logs: $logDir"
    }
    $sosId = [string]$sosResp.data.sosId

    $sosDetail = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/sos/$sosId" -TimeoutSec 10
    if ($sosDetail.success -ne $true -or $sosDetail.data.sosId -ne $sosId) {
      throw "sos detail failed. Logs: $logDir"
    }
  }

  Write-Host "E2E smoke test passed." -ForegroundColor Green
  Write-Host "Logs: $logDir" -ForegroundColor DarkGray
} catch {
  $errText = $_ | Out-String
  Write-Host "E2E smoke test FAILED." -ForegroundColor Red
  Write-Host $errText -ForegroundColor DarkGray

  $failPath = Join-Path $logDir "failure.txt"
  $errText | Set-Content -Encoding UTF8 -NoNewline -LiteralPath $failPath

  if ($CollectEvidenceOnFailure) {
    Write-Host "Collecting evidence bundle..." -ForegroundColor Cyan

    Exec-ToFile (Join-Path $logDir "compose-ps.txt") { docker compose -f $ComposeFile --env-file $EnvFile ps }
    Exec-ToFile (Join-Path $logDir "compose-logs-emqx.txt") { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=400 emqx }
    Exec-ToFile (Join-Path $logDir "compose-logs-kafka.txt") { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=400 kafka }
    Exec-ToFile (Join-Path $logDir "compose-logs-postgres.txt") { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=400 postgres }
    Exec-ToFile (Join-Path $logDir "compose-logs-clickhouse.txt") { docker compose -f $ComposeFile --env-file $EnvFile logs --tail=400 clickhouse }

    try {
      powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/health-check.ps1
      Assert-LastExitCode "health-check.ps1 failed"
    } catch {
      # keep going
    }

    try {
      powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/collect-evidence.ps1 -EnvFile $EnvFile -ComposeFile $ComposeFile -OutDirRoot $logDir
      Assert-LastExitCode "collect-evidence.ps1 failed"
      $items = Get-ChildItem -Path $logDir -Directory | Sort-Object Name -Descending
      if ($items.Count -gt 0) { $evidenceDir = $items[0].FullName }
    } catch {
      Write-Host "WARN: evidence collection failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    if ($evidenceDir) {
      Write-Host "Evidence: $evidenceDir" -ForegroundColor Yellow
    } else {
      Write-Host "Evidence: $logDir" -ForegroundColor Yellow
    }
  }

  exit 1
} finally {
  Write-Host "Stopping services..." -ForegroundColor Cyan
  foreach ($p in @($firmwareProc, $presenceProc, $ingestProc, $writerProc, $apiProc, $cmdProc, $ackProc, $timeoutProc, $eventsProc, $notifyProc, $alertNotifyProc, $ruleProc, $dlqProc)) {
    if ($null -eq $p) { continue }
    try {
      if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    } catch {
      # ignore
    }
  }
}
