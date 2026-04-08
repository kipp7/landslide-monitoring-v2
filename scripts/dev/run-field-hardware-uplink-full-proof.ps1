[CmdletBinding()]
param(
  [string]$ApiBaseUrl = "http://127.0.0.1:8080",
  [string]$WebBaseUrl = "http://127.0.0.1:3000",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Username = "admin",
  [string]$Password = "123456",
  [string]$PayloadFile = "docs/tools/field-rehearsal/payload-samples/hf-hardware-real-20260406-seq21.json",
  [string]$ReplayOutFile = "docs/unified/reports/field-hardware-uplink-replay-latest.json",
  [string]$ProductVisibilityOutFile = "docs/unified/reports/field-hardware-uplink-product-visibility-latest.json",
  [string]$OutFile = "docs/unified/reports/field-hardware-uplink-full-proof-latest.json",
  [int]$TimeoutMs = 45000,
  [int]$PollMs = 2000
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Test-HttpOk([string]$Url) {
  try {
    $resp = Invoke-WebRequest -Uri $Url -Method Get -UseBasicParsing -TimeoutSec 8
    return [pscustomobject]@{
      ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 400)
      status = [int]$resp.StatusCode
      url = $Url
    }
  } catch {
    $status = $null
    try { $status = [int]$_.Exception.Response.StatusCode.value__ } catch {}
    return [pscustomobject]@{
      ok = $false
      status = $status
      url = $Url
      error = $_.Exception.Message
    }
  }
}

function Wait-HttpOk([string]$Url, [int]$TimeoutSeconds, [int]$PollSeconds = 2) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $checks = @()
  while ((Get-Date) -lt $deadline) {
    $check = Test-HttpOk -Url $Url
    $checks += $check
    if ($check.ok) {
      return [pscustomobject]@{
        ok = $true
        url = $Url
        checks = $checks
      }
    }
    Start-Sleep -Seconds $PollSeconds
  }
  return [pscustomobject]@{
    ok = $false
    url = $Url
    checks = $checks
  }
}

function Ensure-ComposeRuntime([string]$RepoRoot, [string]$ApiUrl, [string]$WebUrl) {
  $apiCheck = Test-HttpOk -Url ($ApiUrl.TrimEnd("/") + "/health")
  $webCheck = Test-HttpOk -Url ($WebUrl.TrimEnd("/") + "/login")

  if ($apiCheck.ok -and $webCheck.ok) {
    return [pscustomobject]@{
      changed = $false
      composeUpTriggered = $false
      apiBefore = $apiCheck
      webBefore = $webCheck
      apiAfter = $apiCheck
      webAfter = $webCheck
    }
  }

  $envFile = Join-Path $RepoRoot "infra/compose/.env"
  if (-not (Test-Path $envFile)) {
    throw "Compose env file missing: $envFile"
  }

  Push-Location $RepoRoot
  try {
    docker compose `
      -f infra/compose/docker-compose.yml `
      -f infra/compose/docker-compose.app.yml `
      --env-file infra/compose/.env `
      up -d postgres clickhouse kafka emqx api web ingest telemetry-writer | Out-Null
    if ($LASTEXITCODE -ne 0) {
      throw "docker compose up failed (exit=$LASTEXITCODE)"
    }
  } finally {
    Pop-Location
  }

  $apiAfter = Wait-HttpOk -Url ($ApiUrl.TrimEnd("/") + "/health") -TimeoutSeconds 120 -PollSeconds 3
  $webAfter = Wait-HttpOk -Url ($WebUrl.TrimEnd("/") + "/login") -TimeoutSeconds 120 -PollSeconds 3
  if (-not $apiAfter.ok) {
    throw "API did not become ready after compose up: $($ApiUrl.TrimEnd('/') + '/health')"
  }
  if (-not $webAfter.ok) {
    throw "Web did not become ready after compose up: $($WebUrl.TrimEnd('/') + '/login')"
  }

  return [pscustomobject]@{
    changed = $true
    composeUpTriggered = $true
    apiBefore = $apiCheck
    webBefore = $webCheck
    apiAfter = $apiAfter
    webAfter = $webAfter
  }
}

function Read-JsonProjectionWithNode([string]$JsonPath, [string]$ProjectionScript) {
  $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "lsmv2-node-json-projection"
  if (-not (Test-Path $tempDir)) {
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
  }
  $tempFile = Join-Path $tempDir ("projection-" + [guid]::NewGuid().ToString() + ".js")
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($tempFile, $ProjectionScript, $utf8NoBom)
    $nodeOutput = & node $tempFile $JsonPath
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to project JSON via node: $JsonPath"
    }
    $jsonText = ($nodeOutput | Out-String).Trim()
    if ([string]::IsNullOrWhiteSpace($jsonText)) {
      throw "Node projection returned empty JSON: $JsonPath"
    }
    return $jsonText | ConvertFrom-Json
  } finally {
    if (Test-Path $tempFile) {
      Remove-Item -LiteralPath $tempFile -Force -ErrorAction SilentlyContinue
    }
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$resolvedReplayOutFile = Join-Path $repoRoot $ReplayOutFile
$resolvedProductOutFile = Join-Path $repoRoot $ProductVisibilityOutFile
$resolvedOutFile = Join-Path $repoRoot $OutFile
$resolvedPayloadFile = Join-Path $repoRoot $PayloadFile

Push-Location $repoRoot
try {
  if (-not (Test-Path $resolvedPayloadFile)) {
    throw "Payload file not found: $resolvedPayloadFile"
  }

  $runtime = Ensure-ComposeRuntime -RepoRoot $repoRoot -ApiUrl $ApiBaseUrl -WebUrl $WebBaseUrl

  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-field-hardware-uplink-replay-full-path.ps1" `
    -ApiBaseUrl $ApiBaseUrl `
    -MqttUrl $MqttUrl `
    -Username $Username `
    -Password $Password `
    -PayloadFile $PayloadFile `
    -OutFile $ReplayOutFile `
    -TimeoutMs $TimeoutMs `
    -PollMs $PollMs
  if ($LASTEXITCODE -ne 0) {
    throw "run-field-hardware-uplink-replay-full-path.ps1 failed (exit=$LASTEXITCODE)"
  }

  if (-not (Test-Path $resolvedReplayOutFile)) {
    throw "Replay proof report missing: $resolvedReplayOutFile"
  }
  $replay = Read-JsonProjectionWithNode -JsonPath $resolvedReplayOutFile -ProjectionScript @'
const fs = require("fs");
const p = process.argv[2];
const doc = JSON.parse(fs.readFileSync(p, "utf8"));
process.stdout.write(JSON.stringify({
  conclusion: doc.conclusion,
  replayDevice: doc.replayDevice,
  publish: doc.publish,
  statePoll: { success: doc.statePoll && doc.statePoll.success }
}));
'@
  $deviceId = [string]$replay.replayDevice.deviceId
  if ([string]::IsNullOrWhiteSpace($deviceId)) {
    throw "Replay proof did not expose replayDevice.deviceId"
  }

  powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\dev\run-field-hardware-uplink-product-visibility.ps1" `
    -WebBaseUrl $WebBaseUrl `
    -ReplayReport $ReplayOutFile `
    -OutFile $ProductVisibilityOutFile `
    -Username $Username `
    -Password $Password `
    -DeviceId $deviceId
  if ($LASTEXITCODE -ne 0) {
    throw "run-field-hardware-uplink-product-visibility.ps1 failed (exit=$LASTEXITCODE)"
  }

  if (-not (Test-Path $resolvedProductOutFile)) {
    throw "Product visibility proof report missing: $resolvedProductOutFile"
  }
  $product = Read-JsonProjectionWithNode -JsonPath $resolvedProductOutFile -ProjectionScript @'
const fs = require("fs");
const p = process.argv[2];
const doc = JSON.parse(fs.readFileSync(p, "utf8"));
process.stdout.write(JSON.stringify({
  conclusion: doc.conclusion,
  proxyReadPath: doc.proxyReadPath,
  webClientReadPath: doc.webClientReadPath
}));
'@

  $reportDir = Split-Path -Parent $resolvedOutFile
  if ($reportDir -and -not (Test-Path $reportDir)) {
    New-Item -ItemType Directory -Path $reportDir -Force | Out-Null
  }

  $summary = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    mode = "field-hardware-uplink-full-proof"
    payloadFile = $PayloadFile.Replace("\", "/")
    runtimeBootstrap = [ordered]@{
      composeUpTriggered = [bool]$runtime.composeUpTriggered
      apiReady = [bool]$runtime.apiAfter.ok
      webReady = [bool]$runtime.webAfter.ok
      apiBaseUrl = $ApiBaseUrl
      webBaseUrl = $WebBaseUrl
    }
    replayProof = [ordered]@{
      report = $ReplayOutFile.Replace("\", "/")
      conclusion = [string]$replay.conclusion
      deviceId = $deviceId
      installLabel = [string]$replay.replayDevice.installLabel
      publishTopic = [string]$replay.publish.topic
      statePollSuccess = [bool]$replay.statePoll.success
    }
    productVisibilityProof = [ordered]@{
      report = $ProductVisibilityOutFile.Replace("\", "/")
      conclusion = [string]$product.conclusion
      proxyStateUrl = [string]$product.proxyReadPath.stateUrl
      deviceFound = [bool]$product.webClientReadPath.deviceFound
      metricsKeys = @($product.webClientReadPath.metricsKeys)
      metricsPreview = $product.webClientReadPath.metricsPreview
    }
    nextUse = @(
      "primary rerun command: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-hardware-uplink-full-proof.ps1",
      "this proof line now expects ingest-service and telemetry-writer to be available through the compose-managed center runtime"
    )
    conclusion = if (
      [string]$replay.conclusion -eq "real-hardware-uplink-replay-reached-platform-api-state" -and
      [string]$product.conclusion -eq "real-hardware-uplink-visible-through-web-product-read-path"
    ) {
      "real-hardware-uplink-full-path-reached-platform-and-web"
    } else {
      "full-path-proof-finished-with-nonstandard-conclusion"
    }
  }

  $json = $summary | ConvertTo-Json -Depth 8
  Set-Content -Path $resolvedOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
