[CmdletBinding()]
param(
  [ValidateSet("manual-collect", "set-report-300", "set-report-5")]
  [string]$Action = "manual-collect",
  [string]$ApiBaseUrl = "",
  [string]$ApiEnvFile = "services/api/.env",
  [string]$DeviceId = "",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Port = "COM5",
  [int]$BaudRate = 115200,
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$InterChunkDelayMs = 0,
  [int]$ReadAfterWriteSeconds = 20,
  [int]$RelayTimeoutSeconds = 60,
  [int]$PublishDelaySeconds = 10,
  [int]$CommandPollTimeoutSeconds = 30,
  [int]$FailurePassiveProbeSeconds = 4,
  [string]$LatestSuccessOutFile = ".tmp/hardware-stable-version-api-command-live-last-success.json",
  [string]$OutFile = ".tmp/hardware-stable-version-api-command-live-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = "SilentlyContinue"
. (Join-Path $PSScriptRoot "hardware-stable-version-serial-port-common.ps1")

function New-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Ensure-TempDirectory {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Write-Utf8NoBomText {
  param(
    [string]$Path,
    [string]$Value
  )

  $parent = Split-Path -Parent $Path
  if ($parent) {
    Ensure-TempDirectory -Path $parent
  }

  [System.IO.File]::WriteAllText($Path, [string]$Value, (New-Utf8NoBomEncoding))
}

function Append-Utf8NoBomLine {
  param(
    [string]$Path,
    [string]$Value
  )

  $parent = Split-Path -Parent $Path
  if ($parent) {
    Ensure-TempDirectory -Path $parent
  }

  [System.IO.File]::AppendAllText($Path, ([string]$Value + [Environment]::NewLine), (New-Utf8NoBomEncoding))
}

function Read-EnvValue {
  param(
    [string]$Path,
    [string]$Key,
    [string]$Fallback = ""
  )

  if (-not (Test-Path $Path)) {
    return $Fallback
  }

  $last = $null
  foreach ($line in (Get-Content -Encoding UTF8 $Path)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    if (-not $trimmed.StartsWith("$Key=")) { continue }
    $value = $trimmed.Substring($Key.Length + 1).Trim()
    if ($value.StartsWith('"') -and $value.EndsWith('"')) {
      $value = $value.Trim('"')
    }
    if ($value.StartsWith("'") -and $value.EndsWith("'")) {
      $value = $value.Trim("'")
    }
    $last = $value
  }

  if ($null -eq $last -or [string]::IsNullOrWhiteSpace([string]$last)) {
    return $Fallback
  }

  return [string]$last
}

function Read-JsonIfExists {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if (-not $raw -or -not $raw.Trim()) {
    return $null
  }

  try {
    return $raw.Trim() | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Read-TextIfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    return [string](Get-Content -Raw -Encoding UTF8 $Path)
  }
  return ""
}

function Get-TrimmedString {
  param($Value)

  if ($null -eq $Value) {
    return ""
  }

  return ([string]$Value).Trim()
}

function Convert-MixedJsonText {
  param([string]$Raw)

  if (-not $Raw) { return $null }
  if (-not $Raw.Trim()) { return $null }

  $lines = @($Raw -split "`r?`n")
  $jsonStart = -1
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '^\{') {
      $jsonStart = $i
      break
    }
  }

  $jsonText = if ($jsonStart -ge 0) {
    (($lines[$jsonStart..($lines.Count - 1)]) -join "`n").Trim()
  } else {
    $Raw.Trim()
  }

  try {
    return $jsonText | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-RepoRelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath)
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

  try {
    $baseUri = New-Object System.Uri(($baseFull.TrimEnd('\') + '\'))
    $targetUri = New-Object System.Uri($targetFull)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '/')
  } catch {
    return $targetFull.Replace('\', '/')
  }
}

function Get-SerialPortType {
  try {
    return [System.IO.Ports.SerialPort]
  } catch {
  }

  try {
    Add-Type -AssemblyName "System.IO.Ports" -ErrorAction Stop
    return [System.IO.Ports.SerialPort]
  } catch {
  }

  $type = [System.Type]::GetType("System.IO.Ports.SerialPort, System.IO.Ports")
  if (-not $type) {
    $type = [System.Type]::GetType("System.IO.Ports.SerialPort")
  }
  return $type
}

function Invoke-PassiveSerialProbe {
  param(
    [string]$PortName,
    [int]$PortBaudRate,
    [int]$Seconds,
    [int]$PollMs = 100
  )

  if ($Seconds -le 0) {
    return $null
  }

  $serialPortType = Get-SerialPortType
  if (-not $serialPortType) {
    return [ordered]@{
      executed = $false
      reason = "system-io-ports-unavailable"
    }
  }

  $serial = New-Object System.IO.Ports.SerialPort $PortName, $PortBaudRate, ([System.IO.Ports.Parity]::None), 8, ([System.IO.Ports.StopBits]::One)
  $serial.Handshake = [System.IO.Ports.Handshake]::None
  $serial.DtrEnable = $false
  $serial.RtsEnable = $false
  $serial.ReadTimeout = 250
  $builder = New-Object System.Text.StringBuilder
  $effectivePollMs = if ($PollMs -gt 0) { $PollMs } else { 100 }
  $start = Get-Date

  try {
    $serial.Open()
    while (((Get-Date) - $start).TotalSeconds -lt $Seconds) {
      try {
        $text = $serial.ReadExisting()
        if ($text) {
          [void]$builder.Append($text)
        }
      } catch {
      }
      Start-Sleep -Milliseconds $effectivePollMs
    }
  } catch {
    return [ordered]@{
      executed = $false
      reason = "serial-open-failed"
      message = $_.Exception.Message
      port = $PortName
      baudRate = $PortBaudRate
    }
  } finally {
    if ($serial.IsOpen) {
      $serial.Close()
    }
    $serial.Dispose()
  }

  $capturedText = $builder.ToString()
  $bytes = [System.Text.Encoding]::UTF8.GetByteCount($capturedText)
  $asciiBytes = [System.Text.Encoding]::UTF8.GetBytes($capturedText) | Where-Object { $_ -ge 0x20 -and $_ -le 0x7E } | Measure-Object | Select-Object -ExpandProperty Count
  $lineCount = @(($capturedText -split "`r?`n") | Where-Object { $_ -ne "" }).Count

  return [ordered]@{
    executed = $true
    port = $PortName
    baudRate = $PortBaudRate
    seconds = $Seconds
    pollMs = $effectivePollMs
    bytes = $bytes
    lineCount = $lineCount
    asciiByteCount = $asciiBytes
    classification = if ($bytes -eq 0) {
      "silent"
    } elseif ($asciiBytes -gt 0) {
      "contains-readable-text"
    } else {
      "binary-or-unstructured-stream"
    }
    textPreview = if ($capturedText.Length -gt 400) { $capturedText.Substring(0, 400) } else { $capturedText }
  }
}

function Get-PortOwnershipFailureClass {
  param($Ownership)

  if (-not $Ownership) {
    return ""
  }

  switch ([string]$Ownership.classification) {
    "ownership-collision-bluetooth-and-usb-serial" {
      return "serial-port-ownership-collision"
    }
    "bluetooth-owned" {
      return "serial-port-owned-by-bluetooth"
    }
    "multiple-present-usb-serial-devices" {
      return "serial-port-multiple-present-usb-serial-devices"
    }
    default {
      return ""
    }
  }
}

function Wait-ForLogMatch {
  param(
    [string]$Path,
    [string]$Pattern,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path $Path) {
      try {
        if (Select-String -Path $Path -Pattern $Pattern -Quiet) {
          return $true
        }
      } catch {
      }
    }
    Start-Sleep -Seconds 1
  }

  return $false
}

function Start-NodeWithEnv {
  param(
    [string]$WorkingDirectory,
    [hashtable]$EnvMap,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  $pairs = @()
  foreach ($key in $EnvMap.Keys) {
    $value = [string]$EnvMap[$key]
    $pairs += "`$env:$key='" + $value.Replace("'", "''") + "'"
  }

  $script = ($pairs -join "; ") + "; Set-Location '" + $WorkingDirectory.Replace("'", "''") + "'; node dist/index.js"
  return Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-Command", $script) `
    -PassThru `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath
}

function Invoke-ApiJson {
  param(
    [string]$Method,
    [string]$Url,
    $Body = $null,
    [hashtable]$Headers = @{}
  )

  if ($null -eq $Body) {
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -TimeoutSec 20
  }

  return Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 20
}

function Get-HttpStatusCodeFromException {
  param([System.Exception]$Exception)

  try {
    if ($Exception.Response -and $Exception.Response.StatusCode) {
      return [int]$Exception.Response.StatusCode
    }
  } catch {
  }

  return $null
}

function New-ActionCommandSpec {
  param([string]$ActionValue)

  switch ($ActionValue) {
    "manual-collect" {
      return [ordered]@{
        action = $ActionValue
        payloadLabel = "api_manual_collect_live"
        commandType = "manual_collect"
        payload = [ordered]@{
          source = "api-live-runtime"
        }
        baselineChanged = $false
      }
    }
    "set-report-300" {
      return [ordered]@{
        action = $ActionValue
        payloadLabel = "api_set_report_interval_300s_live"
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 300
        }
        baselineChanged = $true
      }
    }
    "set-report-5" {
      return [ordered]@{
        action = $ActionValue
        payloadLabel = "api_set_report_interval_5s_live"
        commandType = "set_config"
        payload = [ordered]@{
          sampling_s = 5
          report_interval_s = 5
        }
        baselineChanged = $false
      }
    }
    default {
      throw "Unsupported action: $ActionValue"
    }
  }
}

function Ensure-HardwareDevice {
  param(
    [string]$ApiBaseUrlValue,
    [string]$DeviceIdValue,
    [hashtable]$Headers,
    [string]$ActionValue
  )

  try {
    $existing = Invoke-ApiJson -Method "Get" -Url "$ApiBaseUrlValue/devices/$DeviceIdValue" -Headers $Headers
    return [ordered]@{
      created = $false
      response = $existing
    }
  } catch {
    $statusCode = Get-HttpStatusCodeFromException -Exception $_.Exception
    if ($statusCode -ne 404) {
      throw
    }
  }

  $created = Invoke-ApiJson -Method "Post" -Url "$ApiBaseUrlValue/devices" -Headers $Headers -Body ([ordered]@{
      deviceId = $DeviceIdValue
      deviceName = "FIELD-NODE-A"
      deviceType = "multi_sensor"
      metadata = [ordered]@{
        install_label = "FIELD-NODE-A"
        note = "hardware_stable_version_live_api_command"
        last_proof_action = $ActionValue
      }
    })

  return [ordered]@{
    created = $true
    response = $created
  }
}

function Start-DelayedApiIssueProcess {
  param(
    [string]$RepoRoot,
    [string]$ApiBaseUrlValue,
    [string]$DeviceIdValue,
    [string]$AuthorizationValue,
    [string]$RequestJson,
    [int]$DelaySeconds,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  $tmpDir = Join-Path $RepoRoot ".tmp"
  Ensure-TempDirectory -Path $tmpDir

  $runnerPath = Join-Path $tmpDir ("hardware-stable-version-api-command-live-runner-{0}.ps1" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
  $requestLiteral = $RequestJson.Replace("'", "''")
  $apiLiteral = $ApiBaseUrlValue.Replace("'", "''")
  $deviceLiteral = $DeviceIdValue.Replace("'", "''")
  $authLiteral = $AuthorizationValue.Replace("'", "''")

  $runnerLines = New-Object System.Collections.Generic.List[string]
  $runnerLines.Add('$ErrorActionPreference = ''Stop''')
  $runnerLines.Add('$ProgressPreference = ''SilentlyContinue''')
  $runnerLines.Add('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8')
  $runnerLines.Add(("Set-Location '{0}'" -f $RepoRoot.Replace("'", "''")))
  $runnerLines.Add('$headers = @{ Accept = ''application/json'' }')
  if ($AuthorizationValue) {
    $runnerLines.Add(('$headers[''Authorization''] = ''Bearer {0}''' -f $authLiteral))
  }
  $runnerLines.Add(('$body = ''{0}'' | ConvertFrom-Json' -f $requestLiteral))
  $runnerLines.Add(("Start-Sleep -Seconds {0}" -f $DelaySeconds))
  $runnerLines.Add(('$resp = Invoke-RestMethod -Method Post -Uri ''{0}/devices/{1}/commands'' -Headers $headers -ContentType ''application/json'' -Body ($body | ConvertTo-Json -Depth 12 -Compress) -TimeoutSec 20' -f $apiLiteral, $deviceLiteral))
  $runnerLines.Add('$resp | ConvertTo-Json -Depth 12')

  $runnerContent = ($runnerLines -join "`r`n") + "`r`n"
  [System.IO.File]::WriteAllText($runnerPath, $runnerContent, (New-Utf8NoBomEncoding))

  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($runnerContent))
  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded) `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -PassThru

  return [ordered]@{
    process = $process
    runnerPath = $runnerPath
  }
}

function Wait-ForApiCommandState {
  param(
    [string]$ApiBaseUrlValue,
    [string]$DeviceIdValue,
    [string]$CommandIdValue,
    [hashtable]$Headers,
    [int]$TimeoutSeconds,
    [string]$TargetStatus
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-ApiJson -Method "Get" -Url "$ApiBaseUrlValue/devices/$DeviceIdValue/commands/$CommandIdValue" -Headers $Headers
      if ([string]$response.data.status -eq $TargetStatus) {
        return $response
      }
    } catch {
    }
    Start-Sleep -Seconds 1
  }

  return $null
}

function Wait-ForCondition {
  param(
    [scriptblock]$Condition,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $result = & $Condition
    if ($result) {
      return $result
    }
    Start-Sleep -Seconds 1
  }

  return $null
}

function Test-TcpEndpoint {
  param(
    [string]$HostName,
    [int]$Port
  )

  try {
    $result = Test-NetConnection -ComputerName $HostName -Port $Port -WarningAction SilentlyContinue
    return [bool]$result.TcpTestSucceeded
  } catch {
    return $false
  }
}

function Test-UrlReachable {
  param([string]$Url)

  try {
    $uri = [System.Uri]$Url
  } catch {
    return $false
  }

  $port = if ($uri.IsDefaultPort) {
    if ($uri.Scheme -eq "https") { 443 } else { 80 }
  } else {
    $uri.Port
  }

  return Test-TcpEndpoint -HostName $uri.Host -Port $port
}

function Resolve-ApiBaseUrl {
  param(
    [string]$ExplicitApiBaseUrl,
    [string]$ApiPortFromEnv
  )

  if ($ExplicitApiBaseUrl) {
    $candidate = $ExplicitApiBaseUrl.TrimEnd("/")
    if (-not (Test-UrlReachable -Url $candidate)) {
      throw "Explicit ApiBaseUrl is not reachable: $candidate"
    }
    return $candidate
  }

  $candidates = New-Object System.Collections.Generic.List[string]
  if ($ApiPortFromEnv) {
    $candidates.Add("http://127.0.0.1:$ApiPortFromEnv/api/v1")
  }
  $candidates.Add("http://127.0.0.1:8080/api/v1")
  $candidates.Add("http://127.0.0.1:8081/api/v1")

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    if (Test-UrlReachable -Url $candidate) {
      return $candidate.TrimEnd("/")
    }
  }

  throw "API is not reachable on any candidate base URL: $($candidates -join ', ')"
}

function Resolve-ApiAuthorization {
  param(
    [string]$ApiBaseUrlValue,
    [string]$AdminApiToken
  )

  $loginError = $null
  try {
    $loginResp = Invoke-ApiJson -Method "Post" -Url "$ApiBaseUrlValue/auth/login" -Body ([ordered]@{
        username = "admin"
        password = "123456"
      })
    $jwtToken = [string]$loginResp.data.token
    if (-not [string]::IsNullOrWhiteSpace($jwtToken)) {
      return [ordered]@{
        mode = "jwt-login"
        token = $jwtToken
      }
    }
    $loginError = "auth/login did not return data.token"
  } catch {
    $loginError = $_.Exception.Message
  }

  if ($AdminApiToken) {
    return [ordered]@{
      mode = "admin-api-token"
      token = $AdminApiToken
      loginError = $loginError
    }
  }

  throw "Failed to obtain API authorization. auth/login fallback failed: $loginError"
}

function Wait-ForProcessOrFail {
  param(
    [System.Diagnostics.Process]$Process,
    [string]$Name,
    [string]$StdoutPath,
    [string]$StderrPath,
    [string]$ReadyPattern,
    [int]$TimeoutSeconds
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($Process.HasExited) {
      $stderrText = Read-TextIfExists -Path $StderrPath
      $stdoutText = Read-TextIfExists -Path $StdoutPath
      $detail = if ($stderrText.Trim()) { $stderrText.Trim() } elseif ($stdoutText.Trim()) { $stdoutText.Trim() } else { "no stdout/stderr captured" }
      throw "$Name exited early. $detail"
    }

    foreach ($path in @($StdoutPath, $StderrPath)) {
      if (-not $path) { continue }
      if (-not (Test-Path $path)) { continue }
      try {
        if (Select-String -Path $path -Pattern $ReadyPattern -Quiet) {
          return
        }
      } catch {
      }
    }

    Start-Sleep -Seconds 1
  }

  $stderrText = Read-TextIfExists -Path $StderrPath
  $stdoutText = Read-TextIfExists -Path $StdoutPath
  if ($stderrText.Trim()) {
    throw "$Name did not become ready within ${TimeoutSeconds}s. $($stderrText.Trim())"
  }
  if ($stdoutText.Trim()) {
    throw "$Name did not become ready within ${TimeoutSeconds}s. stdout=`n$($stdoutText.Trim())"
  }
  throw "$Name did not become ready within ${TimeoutSeconds}s"
}

function Stop-StaleHardwareLiveProcesses {
  $patterns = @(
    "hardware-live-command-dispatcher",
    "hardware-live-command-ack-receiver",
    "hardware-live-command-events-recorder",
    "hardware-live-command-notify-worker",
    "hardware-stable-version-api-command-live-runner",
    "hardware-stable-version-mqtt-relay-live-publish-runner"
  )

  try {
    $stale = Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object {
      $cmd = [string]$_.CommandLine
      if (-not $cmd) { return $false }
      foreach ($pattern in $patterns) {
        if ($cmd -match [regex]::Escape($pattern)) {
          return $true
        }
      }
      return $false
    }

    foreach ($proc in $stale) {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      } catch {
      }
    }
  } catch {
  }
}

function Write-LiveDebugStage {
  param(
    [string]$Path,
    [string]$Stage,
    [string]$Detail = ""
  )

  if (-not $Path) { return }
  $line = if ($Detail) {
    "[{0}] {1} :: {2}" -f ((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")), $Stage, $Detail
  } else {
    "[{0}] {1}" -f ((Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")), $Stage
  }
  Append-Utf8NoBomLine -Path $Path -Value $line
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmpDir = Join-Path $repoRoot ".tmp"
Ensure-TempDirectory -Path $tmpDir
$createKafkaTopicsScript = Join-Path $repoRoot "infra/compose/scripts/create-kafka-topics.ps1"

$sampleReport = Read-JsonIfExists -Path (Join-Path $repoRoot "docs/unified/reports/hardware-stable-version-gateway-command-samples-latest.json")
$fullApiEnvFile = Join-Path $repoRoot $ApiEnvFile

$resolvedDeviceId = if ($DeviceId) { $DeviceId } elseif ($sampleReport -and $sampleReport.hardwareDeviceId) { [string]$sampleReport.hardwareDeviceId } else { "00000000-0000-0000-0000-000000000001" }
$apiPort = Read-EnvValue -Path $fullApiEnvFile -Key "API_PORT" -Fallback "8081"
$resolvedApiBaseUrl = Resolve-ApiBaseUrl -ExplicitApiBaseUrl $ApiBaseUrl -ApiPortFromEnv $apiPort
$adminApiToken = Read-EnvValue -Path $fullApiEnvFile -Key "ADMIN_API_TOKEN" -Fallback ""
$postgresHost = Read-EnvValue -Path $fullApiEnvFile -Key "POSTGRES_HOST" -Fallback "127.0.0.1"
$postgresPort = Read-EnvValue -Path $fullApiEnvFile -Key "POSTGRES_PORT" -Fallback "5432"
$postgresUser = Read-EnvValue -Path $fullApiEnvFile -Key "POSTGRES_USER" -Fallback "landslide"
$postgresPassword = Read-EnvValue -Path $fullApiEnvFile -Key "POSTGRES_PASSWORD" -Fallback ""
$postgresDatabase = Read-EnvValue -Path $fullApiEnvFile -Key "POSTGRES_DATABASE" -Fallback "landslide_monitor"
$kafkaBrokers = Read-EnvValue -Path $fullApiEnvFile -Key "KAFKA_BROKERS" -Fallback "localhost:9094"
$mqttInternalUsername = Read-EnvValue -Path $fullApiEnvFile -Key "MQTT_INTERNAL_USERNAME" -Fallback "ingest-service"
$mqttInternalPassword = Read-EnvValue -Path $fullApiEnvFile -Key "MQTT_INTERNAL_PASSWORD" -Fallback ""
$commandSpec = New-ActionCommandSpec -ActionValue $Action

if (-not $mqttInternalPassword) {
  throw "MQTT_INTERNAL_PASSWORD is missing in $ApiEnvFile"
}

$kafkaHost = "127.0.0.1"
$kafkaPort = 9094
$mqttHost = "127.0.0.1"
$mqttPort = 1883

if (-not (Test-TcpEndpoint -HostName $mqttHost -Port $mqttPort)) {
  throw "MQTT broker is not reachable on ${mqttHost}:${mqttPort}. Start EMQX first."
}
if (-not (Test-TcpEndpoint -HostName $kafkaHost -Port $kafkaPort)) {
  throw "Kafka is not reachable on ${kafkaHost}:${kafkaPort}. Start kafka first: docker compose -f infra/compose/docker-compose.yml --env-file infra/compose/.env up -d kafka"
}

$authorization = Resolve-ApiAuthorization -ApiBaseUrlValue $resolvedApiBaseUrl -AdminApiToken $adminApiToken
$authorizationToken = [string]$authorization.token
$headers = @{ Accept = "application/json" }
if ($authorizationToken) {
  $headers["Authorization"] = "Bearer $authorizationToken"
}

$requestBody = [ordered]@{
  commandType = $commandSpec.commandType
  payload = $commandSpec.payload
  notifyOnAck = $true
}
$requestJson = $requestBody | ConvertTo-Json -Depth 12 -Compress

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dispatcherOut = Join-Path $tmpDir ("hardware-stable-version-api-command-live-dispatcher-{0}.stdout.log" -f $stamp)
$dispatcherErr = Join-Path $tmpDir ("hardware-stable-version-api-command-live-dispatcher-{0}.stderr.log" -f $stamp)
$ackOut = Join-Path $tmpDir ("hardware-stable-version-api-command-live-ack-receiver-{0}.stdout.log" -f $stamp)
$ackErr = Join-Path $tmpDir ("hardware-stable-version-api-command-live-ack-receiver-{0}.stderr.log" -f $stamp)
$eventOut = Join-Path $tmpDir ("hardware-stable-version-api-command-live-events-recorder-{0}.stdout.log" -f $stamp)
$eventErr = Join-Path $tmpDir ("hardware-stable-version-api-command-live-events-recorder-{0}.stderr.log" -f $stamp)
$notifyOut = Join-Path $tmpDir ("hardware-stable-version-api-command-live-notify-worker-{0}.stdout.log" -f $stamp)
$notifyErr = Join-Path $tmpDir ("hardware-stable-version-api-command-live-notify-worker-{0}.stderr.log" -f $stamp)
$issueOut = Join-Path $tmpDir ("hardware-stable-version-api-command-live-issue-{0}.stdout.log" -f $stamp)
$issueErr = Join-Path $tmpDir ("hardware-stable-version-api-command-live-issue-{0}.stderr.log" -f $stamp)
$relayOutFile = ".tmp/hardware-stable-version-api-command-live-relay-$stamp.json"
$debugLogFile = Join-Path $tmpDir ("hardware-stable-version-api-command-live-debug-{0}.log" -f $stamp)

$dispatcherProc = $null
$ackProc = $null
$eventProc = $null
$notifyProc = $null
$issueLaunch = $null
$issueExited = $false
$relayResult = $null
$issueResult = $null
$issueStdoutText = ""
$issueStderrText = ""
$issueExitCode = $null
$commandState = $null
$eventList = $null
$notificationList = $null
$notificationStats = $null

Push-Location $repoRoot
try {
  Write-LiveDebugStage -Path $debugLogFile -Stage "start" -Detail ("apiBaseUrl={0} authMode={1}" -f $resolvedApiBaseUrl, [string]$authorization.mode)
  Stop-StaleHardwareLiveProcesses

  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $createKafkaTopicsScript -EnvFile (Join-Path $repoRoot "infra/compose/.env") -ComposeFile (Join-Path $repoRoot "infra/compose/docker-compose.yml") | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "create-kafka-topics.ps1 failed (exit=$LASTEXITCODE)"
  }
  Write-LiveDebugStage -Path $debugLogFile -Stage "kafka-topics-ready"

  npm --workspace services/command-dispatcher run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-dispatcher" }
  npm --workspace services/command-ack-receiver run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-ack-receiver" }
  npm --workspace services/command-events-recorder run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-events-recorder" }
  npm --workspace services/command-notify-worker run build | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Failed to build services/command-notify-worker" }

  $dispatcherEnv = @{
    SERVICE_NAME = "hardware-live-command-dispatcher"
    KAFKA_BROKERS = $kafkaBrokers
    KAFKA_CLIENT_ID = "hardware-live-command-dispatcher-$stamp"
    KAFKA_GROUP_ID = "hardware-live-command-dispatcher-$stamp"
    KAFKA_TOPIC_DEVICE_COMMANDS = "device.commands.v1"
    MQTT_URL = $MqttUrl
    MQTT_USERNAME = $mqttInternalUsername
    MQTT_PASSWORD = $mqttInternalPassword
    MQTT_TOPIC_COMMAND_PREFIX = "cmd/"
    POSTGRES_HOST = $postgresHost
    POSTGRES_PORT = $postgresPort
    POSTGRES_USER = $postgresUser
    POSTGRES_PASSWORD = $postgresPassword
    POSTGRES_DATABASE = $postgresDatabase
    POSTGRES_POOL_MAX = "5"
  }
  $ackEnv = @{
    SERVICE_NAME = "hardware-live-command-ack-receiver"
    MQTT_URL = $MqttUrl
    MQTT_USERNAME = $mqttInternalUsername
    MQTT_PASSWORD = $mqttInternalPassword
    MQTT_TOPIC_ACK_PREFIX = "cmd_ack/"
    KAFKA_BROKERS = $kafkaBrokers
    KAFKA_CLIENT_ID = "hardware-live-command-ack-receiver-$stamp"
    KAFKA_GROUP_ID = "hardware-live-command-ack-receiver-$stamp"
    KAFKA_TOPIC_DEVICE_COMMAND_ACKS = "device.command_acks.v1"
    KAFKA_TOPIC_DEVICE_COMMAND_EVENTS = "device.command_events.v1"
    POSTGRES_HOST = $postgresHost
    POSTGRES_PORT = $postgresPort
    POSTGRES_USER = $postgresUser
    POSTGRES_PASSWORD = $postgresPassword
    POSTGRES_DATABASE = $postgresDatabase
    POSTGRES_POOL_MAX = "5"
  }
  $eventEnv = @{
    SERVICE_NAME = "hardware-live-command-events-recorder"
    KAFKA_BROKERS = $kafkaBrokers
    KAFKA_CLIENT_ID = "hardware-live-command-events-recorder-$stamp"
    KAFKA_GROUP_ID = "hardware-live-command-events-recorder-$stamp"
    KAFKA_TOPIC_DEVICE_COMMAND_EVENTS = "device.command_events.v1"
    POSTGRES_HOST = $postgresHost
    POSTGRES_PORT = $postgresPort
    POSTGRES_USER = $postgresUser
    POSTGRES_PASSWORD = $postgresPassword
    POSTGRES_DATABASE = $postgresDatabase
    POSTGRES_POOL_MAX = "5"
  }
  $notifyEnv = @{
    SERVICE_NAME = "hardware-live-command-notify-worker"
    KAFKA_BROKERS = $kafkaBrokers
    KAFKA_CLIENT_ID = "hardware-live-command-notify-worker-$stamp"
    KAFKA_GROUP_ID = "hardware-live-command-notify-worker-$stamp"
    KAFKA_TOPIC_DEVICE_COMMAND_EVENTS = "device.command_events.v1"
    POSTGRES_HOST = $postgresHost
    POSTGRES_PORT = $postgresPort
    POSTGRES_USER = $postgresUser
    POSTGRES_PASSWORD = $postgresPassword
    POSTGRES_DATABASE = $postgresDatabase
    POSTGRES_POOL_MAX = "5"
    NOTIFY_TYPE = "app"
  }

  $dispatcherProc = Start-NodeWithEnv -WorkingDirectory (Join-Path $repoRoot "services/command-dispatcher") -EnvMap $dispatcherEnv -StdoutPath $dispatcherOut -StderrPath $dispatcherErr
  $ackProc = Start-NodeWithEnv -WorkingDirectory (Join-Path $repoRoot "services/command-ack-receiver") -EnvMap $ackEnv -StdoutPath $ackOut -StderrPath $ackErr
  $eventProc = Start-NodeWithEnv -WorkingDirectory (Join-Path $repoRoot "services/command-events-recorder") -EnvMap $eventEnv -StdoutPath $eventOut -StderrPath $eventErr
  $notifyProc = Start-NodeWithEnv -WorkingDirectory (Join-Path $repoRoot "services/command-notify-worker") -EnvMap $notifyEnv -StdoutPath $notifyOut -StderrPath $notifyErr

  Wait-ForProcessOrFail -Process $dispatcherProc -Name "command-dispatcher" -StdoutPath $dispatcherOut -StderrPath $dispatcherErr -ReadyPattern "mqtt connected" -TimeoutSeconds 45
  Wait-ForProcessOrFail -Process $ackProc -Name "command-ack-receiver" -StdoutPath $ackOut -StderrPath $ackErr -ReadyPattern "command-ack-receiver started" -TimeoutSeconds 45
  Wait-ForProcessOrFail -Process $ackProc -Name "command-ack-receiver mqtt subscribe" -StdoutPath $ackOut -StderrPath $ackErr -ReadyPattern "mqtt subscribed" -TimeoutSeconds 45
  Wait-ForProcessOrFail -Process $notifyProc -Name "command-notify-worker" -StdoutPath $notifyOut -StderrPath $notifyErr -ReadyPattern "command-notify-worker started" -TimeoutSeconds 45
  Write-LiveDebugStage -Path $debugLogFile -Stage "service-processes-ready"
  Start-Sleep -Seconds 3

  $deviceInfo = Ensure-HardwareDevice -ApiBaseUrlValue $resolvedApiBaseUrl -DeviceIdValue $resolvedDeviceId -Headers $headers -ActionValue $Action
  Write-LiveDebugStage -Path $debugLogFile -Stage "device-ready" -Detail ("created={0}" -f [string]$deviceInfo.created)

  Write-LiveDebugStage -Path $debugLogFile -Stage "issue-launch-start"
  $issueLaunch = Start-DelayedApiIssueProcess `
    -RepoRoot $repoRoot `
    -ApiBaseUrlValue $resolvedApiBaseUrl `
    -DeviceIdValue $resolvedDeviceId `
    -AuthorizationValue $authorizationToken `
    -RequestJson $requestJson `
    -DelaySeconds $PublishDelaySeconds `
    -StdoutPath $issueOut `
    -StderrPath $issueErr
  Write-LiveDebugStage -Path $debugLogFile -Stage "issue-launch-ready" -Detail ("pid={0}" -f [string]$issueLaunch.process.Id)

  $relayArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", (Join-Path $repoRoot "scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1"),
    "-MqttUrl", $MqttUrl,
    "-Topic", "cmd/$resolvedDeviceId",
    "-Sink", "uart-com",
    "-Port", $Port,
    "-BaudRate", $BaudRate,
    "-ChunkStrategy", $ChunkStrategy,
    "-InterChunkDelayMs", $InterChunkDelayMs,
    "-ReadAfterWriteSeconds", $ReadAfterWriteSeconds,
    "-TimeoutSeconds", $RelayTimeoutSeconds,
    "-OutFile", $relayOutFile,
    "-PublishCapturedAck"
  )

  Write-LiveDebugStage -Path $debugLogFile -Stage "relay-start" -Detail ("topic=cmd/{0} timeout={1}s" -f $resolvedDeviceId, $RelayTimeoutSeconds)
  $relayRaw = & powershell.exe @relayArgs | Out-String
  Write-LiveDebugStage -Path $debugLogFile -Stage "relay-returned" -Detail ("exit={0}" -f [string]$LASTEXITCODE)
  if ($LASTEXITCODE -ne 0) {
    $relayResult = Read-JsonIfExists -Path (Join-Path $repoRoot $relayOutFile)
    if ($relayResult) {
      Write-LiveDebugStage -Path $debugLogFile -Stage "relay-result-read-after-nonzero-exit" -Detail ("commandId={0}" -f [string]$relayResult.command.commandId)
    }
    throw "start-hardware-stable-version-mqtt-uart-relay.ps1 failed (exit=$LASTEXITCODE)"
  }

  $relayResult = Convert-MixedJsonText -Raw $relayRaw
  if (-not $relayResult) {
    $relayResult = Read-JsonIfExists -Path (Join-Path $repoRoot $relayOutFile)
  }
  Write-LiveDebugStage -Path $debugLogFile -Stage "relay-result-ready" -Detail ("commandId={0} ackPublished={1}" -f [string]$relayResult.command.commandId, [string]($relayResult -and $relayResult.ackPublish -and $relayResult.ackPublish.published))

  if ($issueLaunch -and $issueLaunch.process) {
    Write-LiveDebugStage -Path $debugLogFile -Stage "issue-wait-start"
    $issueExited = $issueLaunch.process.WaitForExit(30000)
    if (-not $issueExited) {
      Write-LiveDebugStage -Path $debugLogFile -Stage "issue-process-timeout" -Detail "forcing-stop-after-30s-wait"
      try { Stop-Process -Id $issueLaunch.process.Id -Force -ErrorAction Stop } catch {}
    }
    Write-LiveDebugStage -Path $debugLogFile -Stage "issue-wait-finished" -Detail ("exited={0}" -f [string]$issueExited)
  }

  $issueStdoutText = Read-TextIfExists -Path $issueOut
  $issueStderrText = Read-TextIfExists -Path $issueErr
  if ($issueLaunch -and $issueLaunch.process -and $issueExited) {
    try {
      $issueExitCode = [int]$issueLaunch.process.ExitCode
    } catch {
      $issueExitCode = $null
    }
  }

  $issueResult = Convert-MixedJsonText -Raw $issueStdoutText
  if (-not $issueResult) {
    if ($null -ne $issueExitCode -and $issueExitCode -ne 0) {
      throw "delayed API command issue failed (exit=$issueExitCode)"
    }
    throw "Failed to parse delayed API issue result"
  }
  if ($issueResult.PSObject.Properties.Name -contains "success" -and -not [bool]$issueResult.success) {
    throw "Delayed API issue returned success=false"
  }
  Write-LiveDebugStage -Path $debugLogFile -Stage "issue-result-ready" -Detail ("exit={0}" -f $(if ($null -ne $issueExitCode) { [string]$issueExitCode } else { "unknown" }))

  $commandId = [string]$issueResult.data.commandId
  if (-not $commandId) {
    throw "Delayed API issue result did not contain data.commandId"
  }
  Write-LiveDebugStage -Path $debugLogFile -Stage "command-id-ready" -Detail $commandId

  $commandState = Wait-ForApiCommandState `
    -ApiBaseUrlValue $resolvedApiBaseUrl `
    -DeviceIdValue $resolvedDeviceId `
    -CommandIdValue $commandId `
    -Headers $headers `
    -TimeoutSeconds $CommandPollTimeoutSeconds `
    -TargetStatus "acked"

  if (-not $commandState) {
    $commandState = Invoke-ApiJson -Method "Get" -Url "$resolvedApiBaseUrl/devices/$resolvedDeviceId/commands/$commandId" -Headers $headers
  }
  Write-LiveDebugStage -Path $debugLogFile -Stage "command-state-ready" -Detail ([string]$commandState.data.status)

  $eventList = Wait-ForCondition -TimeoutSeconds 20 -Condition {
    try {
      $response = Invoke-ApiJson -Method "Get" -Url "$resolvedApiBaseUrl/devices/$resolvedDeviceId/command-events?page=1&pageSize=20&commandId=$commandId" -Headers $headers
      if (@($response.data.list | Where-Object { $_.eventType -eq "COMMAND_ACKED" -and $_.commandId -eq $commandId }).Count -ge 1) {
        return $response
      }
    } catch {
    }
    return $null
  }
  if (-not $eventList) {
    $eventList = Invoke-ApiJson -Method "Get" -Url "$resolvedApiBaseUrl/devices/$resolvedDeviceId/command-events?page=1&pageSize=20&commandId=$commandId" -Headers $headers
  }
  Write-LiveDebugStage -Path $debugLogFile -Stage "event-list-ready" -Detail ("count={0}" -f @($eventList.data.list).Count)

  $notificationList = Wait-ForCondition -TimeoutSeconds 20 -Condition {
    try {
      $response = Invoke-ApiJson -Method "Get" -Url "$resolvedApiBaseUrl/devices/$resolvedDeviceId/command-notifications?page=1&pageSize=20&commandId=$commandId" -Headers $headers
      if (@($response.data.list | Where-Object { $_.eventType -eq "COMMAND_ACKED" }).Count -ge 1) {
        return $response
      }
    } catch {
    }
    return $null
  }
  if (-not $notificationList) {
    $notificationList = Invoke-ApiJson -Method "Get" -Url "$resolvedApiBaseUrl/devices/$resolvedDeviceId/command-notifications?page=1&pageSize=20&commandId=$commandId" -Headers $headers
  }
  $notificationStats = Invoke-ApiJson -Method "Get" -Url "$resolvedApiBaseUrl/devices/$resolvedDeviceId/command-notifications/stats" -Headers $headers
  Write-LiveDebugStage -Path $debugLogFile -Stage "notification-ready" -Detail ("count={0}" -f @($notificationList.data.list).Count)

  $relayAckPublished = [bool]($relayResult -and $relayResult.ackPublish -and $relayResult.ackPublish.published)
  $relayCaptureBytes = if ($relayResult -and $relayResult.sinkResult -and $relayResult.sinkResult.capture) {
    [int]$relayResult.sinkResult.capture.bytes
  } else {
    0
  }
  $relayCaptureLines = if ($relayResult -and $relayResult.sinkResult -and $relayResult.sinkResult.capture) {
    [int]$relayResult.sinkResult.capture.lineCount
  } else {
    0
  }
  $commandAcked = [string]$commandState.data.status -eq "acked"
  $hasAckEvent = [bool](@($eventList.data.list | Where-Object { $_.eventType -eq "COMMAND_ACKED" -and $_.commandId -eq $commandId }).Count -ge 1)
  $hasAckNotification = [bool](@($notificationList.data.list | Where-Object { $_.eventType -eq "COMMAND_ACKED" }).Count -ge 1)
  $systemCloseLoop = $commandAcked -and $hasAckEvent -and $hasAckNotification
  $portOwnership = if ($Port) { Get-HardwareStableVersionSerialPortOwnership -PortName $Port } else { $null }
  $passiveProbe = if (-not $systemCloseLoop) {
    Invoke-PassiveSerialProbe -PortName $Port -PortBaudRate $BaudRate -Seconds $FailurePassiveProbeSeconds
  } else {
    $null
  }
  $portOwnershipFailureClass = Get-PortOwnershipFailureClass -Ownership $portOwnership
  $failureClass = if ($systemCloseLoop) {
    ""
  } elseif ($portOwnershipFailureClass) {
    $portOwnershipFailureClass
  } elseif ($relayResult -and $relayCaptureBytes -eq 0) {
    "uart-no-capture-after-write"
  } elseif ($relayCaptureBytes -gt 0 -and -not $relayAckPublished) {
    "uart-capture-without-standard-ack"
  } elseif ($commandAcked -and (-not $hasAckEvent -or -not $hasAckNotification)) {
    "api-acked-but-close-loop-artifacts-missing"
  } else {
    "api-command-live-needs-review"
  }

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    mode = "api-command-live-through-dispatcher-relay-and-ack-bridge"
    action = $Action
    apiBaseUrl = $resolvedApiBaseUrl
    apiAuthorizationMode = [string]$authorization.mode
    mqttUrl = $MqttUrl
    deviceId = $resolvedDeviceId
    port = $Port
    baudRate = $BaudRate
    chunkStrategy = $ChunkStrategy
    interChunkDelayMs = $InterChunkDelayMs
    readAfterWriteSeconds = $ReadAfterWriteSeconds
    relayTimeoutSeconds = $RelayTimeoutSeconds
    publishDelaySeconds = $PublishDelaySeconds
    commandPollTimeoutSeconds = $CommandPollTimeoutSeconds
    commandRequest = $requestBody
    device = $deviceInfo
    issue = [ordered]@{
      runnerFile = if ($issueLaunch) { Get-RepoRelativePath -BasePath $repoRoot -TargetPath $issueLaunch.runnerPath } else { $null }
      stdoutFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $issueOut
      stderrFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $issueErr
      stdout = Get-TrimmedString -Value $issueStdoutText
      stderr = Get-TrimmedString -Value $issueStderrText
      result = $issueResult
    }
    relay = $relayResult
    command = $commandState
    events = $eventList
    notifications = [ordered]@{
      list = $notificationList
      stats = $notificationStats
    }
    serviceLogs = [ordered]@{
      commandDispatcher = [ordered]@{
        stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $dispatcherOut
        stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $dispatcherErr
      }
      commandAckReceiver = [ordered]@{
        stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $ackOut
        stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $ackErr
      }
      commandEventsRecorder = [ordered]@{
        stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $eventOut
        stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $eventErr
      }
      commandNotifyWorker = [ordered]@{
        stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $notifyOut
        stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $notifyErr
      }
    }
    diagnostics = [ordered]@{
      latestAttemptSucceeded = $systemCloseLoop
      failureClass = $failureClass
      relayCaptureBytes = $relayCaptureBytes
      relayCaptureLines = $relayCaptureLines
      portOwnership = $portOwnership
      passiveSerialProbe = $passiveProbe
    }
  }

  $report["proof"] = [ordered]@{
    apiCommandAcked = $commandAcked
    ackEventRecorded = $hasAckEvent
    ackNotificationRecorded = $hasAckNotification
    relayPublishedCapturedAck = $relayAckPublished
    systemCloseLoop = $systemCloseLoop
  }
  $report["conclusion"] =
    if ($systemCloseLoop -and $relayAckPublished) {
      "api-command-live-proof-succeeded-with-relay-captured-ack-and-api-close-loop"
    } elseif ($systemCloseLoop) {
      "api-command-live-proof-succeeded-with-api-close-loop"
    } elseif ($commandAcked -and $hasAckEvent) {
      "api-command-live-proof-succeeded-with-api-command-and-event-proof"
    } elseif ($commandAcked) {
      "api-command-live-proof-succeeded-with-api-command-acked-only"
    } else {
      "api-command-live-proof-needs-review"
    }

  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir) {
    Ensure-TempDirectory -Path $outDir
  }

  $reportJson = $report | ConvertTo-Json -Depth 12
  Write-LiveDebugStage -Path $debugLogFile -Stage "report-json-ready"
  Write-Utf8NoBomText -Path $fullOutFile -Value $reportJson
  if ($systemCloseLoop -and $LatestSuccessOutFile) {
    $fullLatestSuccessOutFile = Join-Path $repoRoot $LatestSuccessOutFile
    $latestSuccessOutDir = Split-Path -Parent $fullLatestSuccessOutFile
    if ($latestSuccessOutDir) {
      Ensure-TempDirectory -Path $latestSuccessOutDir
    }
    Write-Utf8NoBomText -Path $fullLatestSuccessOutFile -Value $reportJson
    Write-LiveDebugStage -Path $debugLogFile -Stage "last-success-written" -Detail (Get-RepoRelativePath -BasePath $repoRoot -TargetPath $fullLatestSuccessOutFile)
  }
  Write-LiveDebugStage -Path $debugLogFile -Stage "report-written" -Detail (Get-RepoRelativePath -BasePath $repoRoot -TargetPath $fullOutFile)
  $reportJson
} catch {
  $failureMessage = $_.Exception.Message
  Write-LiveDebugStage -Path $debugLogFile -Stage "error" -Detail $failureMessage

  try {
    $fullOutFile = Join-Path $repoRoot $OutFile
    $outDir = Split-Path -Parent $fullOutFile
    if ($outDir) {
      Ensure-TempDirectory -Path $outDir
    }

    $failurePortOwnership = if ($Port) { Get-HardwareStableVersionSerialPortOwnership -PortName $Port } else { $null }
    $failureRelayCaptureBytes = if ($relayResult -and $relayResult.sinkResult -and $relayResult.sinkResult.capture) {
      [int]$relayResult.sinkResult.capture.bytes
    } else {
      0
    }
    $failureRelayCaptureLines = if ($relayResult -and $relayResult.sinkResult -and $relayResult.sinkResult.capture) {
      [int]$relayResult.sinkResult.capture.lineCount
    } else {
      0
    }
    $failureFailureClass = Get-PortOwnershipFailureClass -Ownership $failurePortOwnership
    if (-not $failureFailureClass -and $relayResult -and $failureRelayCaptureBytes -eq 0) {
      $failureFailureClass = "uart-no-capture-after-write"
    }

    $failureReport = [ordered]@{
      generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
      mode = "api-command-live-through-dispatcher-relay-and-ack-bridge"
      action = $Action
      apiBaseUrl = $resolvedApiBaseUrl
      apiAuthorizationMode = [string]$authorization.mode
      mqttUrl = $MqttUrl
      deviceId = $resolvedDeviceId
      port = $Port
      baudRate = $BaudRate
      chunkStrategy = $ChunkStrategy
      interChunkDelayMs = $InterChunkDelayMs
      readAfterWriteSeconds = $ReadAfterWriteSeconds
      relayTimeoutSeconds = $RelayTimeoutSeconds
      publishDelaySeconds = $PublishDelaySeconds
      commandPollTimeoutSeconds = $CommandPollTimeoutSeconds
      conclusion = "api-command-live-proof-failed-before-final-report"
      error = [ordered]@{
        message = $failureMessage
        script = $MyInvocation.MyCommand.Path
      }
      issue = [ordered]@{
        runnerFile = if ($issueLaunch -and $issueLaunch.runnerPath) { Get-RepoRelativePath -BasePath $repoRoot -TargetPath $issueLaunch.runnerPath } else { $null }
        stdoutFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $issueOut
        stderrFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $issueErr
        stdout = Get-TrimmedString -Value $issueStdoutText
        stderr = Get-TrimmedString -Value $issueStderrText
        result = $issueResult
      }
      relay = $relayResult
      command = $commandState
      events = $eventList
      notifications = [ordered]@{
        list = $notificationList
        stats = $notificationStats
      }
      diagnostics = [ordered]@{
        failureClass = $failureFailureClass
        relayCaptureBytes = $failureRelayCaptureBytes
        relayCaptureLines = $failureRelayCaptureLines
        portOwnership = $failurePortOwnership
      }
      serviceLogs = [ordered]@{
        commandDispatcher = [ordered]@{
          stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $dispatcherOut
          stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $dispatcherErr
        }
        commandAckReceiver = [ordered]@{
          stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $ackOut
          stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $ackErr
        }
        commandEventsRecorder = [ordered]@{
          stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $eventOut
          stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $eventErr
        }
        commandNotifyWorker = [ordered]@{
          stdout = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $notifyOut
          stderr = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $notifyErr
        }
      }
    }

    $failureJson = $failureReport | ConvertTo-Json -Depth 12
    Write-Utf8NoBomText -Path $fullOutFile -Value $failureJson
    Write-LiveDebugStage -Path $debugLogFile -Stage "failure-report-written" -Detail (Get-RepoRelativePath -BasePath $repoRoot -TargetPath $fullOutFile)
  } catch {
    Write-LiveDebugStage -Path $debugLogFile -Stage "failure-report-write-error" -Detail $_.Exception.Message
  }

  throw
} finally {
  if ($issueLaunch -and $issueLaunch.process -and -not $issueLaunch.process.HasExited) {
    try { Stop-Process -Id $issueLaunch.process.Id -Force } catch {}
  }
  if ($dispatcherProc -and -not $dispatcherProc.HasExited) {
    try { Stop-Process -Id $dispatcherProc.Id -Force } catch {}
  }
  if ($ackProc -and -not $ackProc.HasExited) {
    try { Stop-Process -Id $ackProc.Id -Force } catch {}
  }
  if ($eventProc -and -not $eventProc.HasExited) {
    try { Stop-Process -Id $eventProc.Id -Force } catch {}
  }
  if ($notifyProc -and -not $notifyProc.HasExited) {
    try { Stop-Process -Id $notifyProc.Id -Force } catch {}
  }
  Pop-Location
}
