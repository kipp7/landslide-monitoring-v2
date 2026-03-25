[CmdletBinding()]
param(
  [string]$OutFile = "docs/unified/reports/field-full-path-readiness-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Get-ContainerStatus([string]$Name) {
  $status = docker ps --filter "name=^$Name$" --format "{{.Status}}" 2>$null
  if ($LASTEXITCODE -ne 0) {
    return [pscustomobject]@{
      name = $Name
      running = $false
      status = $null
    }
  }

  $text = ($status | Out-String).Trim()
  return [pscustomobject]@{
    name = $Name
    running = -not [string]::IsNullOrWhiteSpace($text)
    status = if ([string]::IsNullOrWhiteSpace($text)) { $null } else { $text }
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $containers = @(
    (Get-ContainerStatus "lsmv2_api")
    (Get-ContainerStatus "lsmv2_web")
    (Get-ContainerStatus "lsmv2_emqx")
    (Get-ContainerStatus "lsmv2_kafka")
    (Get-ContainerStatus "lsmv2_clickhouse")
    (Get-ContainerStatus "lsmv2_postgres")
  )

  $hostProcesses = @(
    [pscustomobject]@{
      name = "ingest-service"
      running = [bool](Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "node" -and $_.Path -and $_.Path -like "*node*" } | Where-Object {
        try {
          ($_.Path | Out-Null); $cmd = (Get-CimInstance Win32_Process -Filter ("ProcessId = " + $_.Id) -ErrorAction SilentlyContinue).CommandLine; $cmd -like "*services\\ingest\\dist\\index.js*"
        } catch { $false }
      })
    },
    [pscustomobject]@{
      name = "telemetry-writer"
      running = [bool](Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq "node" -and $_.Path -and $_.Path -like "*node*" } | Where-Object {
        try {
          ($_.Path | Out-Null); $cmd = (Get-CimInstance Win32_Process -Filter ("ProcessId = " + $_.Id) -ErrorAction SilentlyContinue).CommandLine; $cmd -like "*services\\telemetry-writer\\dist\\index.js*"
        } catch { $false }
      })
    }
  )

  $apiCodeHasRawFix = Select-String -Path "services/api/src/routes/data.ts" -Pattern "function toClickhouseDateTime64Expr" -SimpleMatch -Quiet
  $baseAppCompose = Get-Content -Raw "infra/compose/docker-compose.app.yml"
  $composeIncludesIngest = $baseAppCompose -match "(?m)^\s+ingest:"
  $composeIncludesWriter = $baseAppCompose -match "(?m)^\s+telemetry-writer:"

  $ingestRunning = [bool]($hostProcesses | Where-Object { $_.name -eq "ingest-service" }).running
  $writerRunning = [bool]($hostProcesses | Where-Object { $_.name -eq "telemetry-writer" }).running

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    currentBoundary = if ($ingestRunning -and $writerRunning) { "full-path-ready" } else { "broker-and-api-selfcheck-only" }
    compose = [ordered]@{
      appComposeIncludesIngest = $composeIncludesIngest
      appComposeIncludesTelemetryWriter = $composeIncludesWriter
    }
    runtime = [ordered]@{
      containers = $containers
      hostProcesses = $hostProcesses
    }
    code = [ordered]@{
      apiDataRawTimeFilterFixPresent = $apiCodeHasRawFix
    }
    notes = @(
      "Current Docker app stack only proves MQTT publish + API self-check unless ingest-service and telemetry-writer are also running.",
      "A real downstream semantic proof requires telemetry to reach device_state or ClickHouse, not just successful publish output."
    )
    nextAction = if ($ingestRunning -and $writerRunning) {
      "Run a focused downstream semantic proof against device_state and /api/v1/data/raw."
    } else {
      "Start ingest-service and telemetry-writer (or add them to compose) before claiming full-path downstream proof."
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
  Pop-Location
}
