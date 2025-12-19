param(
  [string]$EnvFile = "infra/compose/.env",
  [string]$ComposeFile = "infra/compose/docker-compose.yml",
  [string]$DeviceId = "",
  [switch]$UseMqttAuth,
  [switch]$CreateDevice,
  [switch]$ConfigureEmqx,
  [switch]$TestCommands,
  [switch]$TestCommandAcks,
  [switch]$TestRevoke,
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
$waitCmdOut = Join-Path $logDir "wait-command.stdout.log"
$waitCmdErr = Join-Path $logDir "wait-command.stderr.log"
$publishLog = Join-Path $logDir "publish-telemetry.log"

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

try {
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

    Write-EnvIfMissingOrForced "services/ingest/.env" @(
      "SERVICE_NAME=ingest-service",
      "",
      "MQTT_URL=$mqttUrl",
      "MQTT_USERNAME=$(if ($UseMqttAuth) { 'ingest-service' } else { '' })",
      "MQTT_PASSWORD=$(if ($UseMqttAuth) { $internalPassword } else { '' })",
      "MQTT_TOPIC_TELEMETRY=telemetry/+",
      "",
      "KAFKA_BROKERS=$kafkaBrokers",
      "KAFKA_CLIENT_ID=ingest-service",
      "KAFKA_TOPIC_TELEMETRY_RAW=telemetry.raw.v1",
      "KAFKA_TOPIC_TELEMETRY_DLQ=telemetry.dlq.v1"
    ) -force:$ForceWriteServiceEnv

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
      "BATCH_MAX_ROWS=2000",
      "BATCH_FLUSH_INTERVAL_MS=1000"
    ) -force:$ForceWriteServiceEnv

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
    ) -force:$ForceWriteServiceEnv

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
      "",
      "POSTGRES_HOST=$pgHost",
      "POSTGRES_PORT=$pgPort",
      "POSTGRES_USER=$pgUser",
      "POSTGRES_PASSWORD=$pgPassword",
      "POSTGRES_DATABASE=$pgDb",
      "POSTGRES_POOL_MAX=5"
    ) -force:$ForceWriteServiceEnv

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
    ) -force:$ForceWriteServiceEnv
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

  Write-Host "Starting services..." -ForegroundColor Cyan

  $ingestProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/ingest" -PassThru -RedirectStandardOutput $ingestOut -RedirectStandardError $ingestErr
  $writerProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/telemetry-writer" -PassThru -RedirectStandardOutput $writerOut -RedirectStandardError $writerErr
  $apiProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/api" -PassThru -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr
  $cmdProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-dispatcher" -PassThru -RedirectStandardOutput $cmdOut -RedirectStandardError $cmdErr
  $ackProc = Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "services/command-ack-receiver" -PassThru -RedirectStandardOutput $ackOut -RedirectStandardError $ackErr

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
    if ($TestCommandAcks -and (-not $TestCommands)) {
      throw "TestCommandAcks requires -TestCommands (needs commandId)."
    }

    Write-Host "Subscribing to device command topic..." -ForegroundColor Cyan
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

    if (-not $waitProc.WaitForExit(60000)) {
      try { Stop-Process -Id $waitProc.Id -Force } catch { }
      throw "Timed out waiting for MQTT command delivery. Logs: $logDir"
    }
    if ($waitProc.ExitCode -ne 0) {
      throw "Device did not receive command (wait-for-command.js exit=$($waitProc.ExitCode)). Logs: $logDir"
    }

    if ($TestCommandAcks) {
      Write-Host "Publishing command ack from device..." -ForegroundColor Cyan
      Add-Content -Encoding UTF8 -LiteralPath $publishLog -Value ("-- publish command ack --`n")
      $ackExit = Run-Node @(
        "scripts/dev/publish-command-ack.js",
        "--mqtt", $mqttUrl,
        "--device", $DeviceId,
        "--commandId", $cmdResp.data.commandId,
        "--username", $DeviceId,
        "--password", $deviceSecret,
        "--status", "acked"
      ) $publishLog
      if ($ackExit -ne 0) {
        throw "publish-command-ack.js failed (exit=$ackExit). Logs: $logDir"
      }

      Write-Host "Waiting for command status to become acked..." -ForegroundColor Cyan
      $cmdId = [string]$cmdResp.data.commandId
      $deadline = (Get-Date).AddSeconds(45)
      $status = ""
      while ((Get-Date) -lt $deadline) {
        try {
          $cmd = Invoke-RestMethod -Uri "http://$apiLocalHost`:$apiPort/api/v1/devices/$($DeviceId)/commands/$cmdId" -TimeoutSec 3
          if ($cmd.success -eq $true -and $cmd.data.status) { $status = [string]$cmd.data.status }
        } catch {
          # ignore transient failures
        }
        if ($status -eq "acked") { break }
        Start-Sleep -Seconds 2
      }
      if ($status -ne "acked") {
        throw "command did not become acked within 45s (status='$status'). Logs: $logDir"
      }
    }
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
  foreach ($p in @($ingestProc, $writerProc, $apiProc, $cmdProc, $ackProc)) {
    if ($null -eq $p) { continue }
    try {
      if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    } catch {
      # ignore
    }
  }
}
