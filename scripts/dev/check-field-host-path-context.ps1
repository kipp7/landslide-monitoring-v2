[CmdletBinding()]
param(
  [string]$OutFile = "docs/unified/reports/field-host-path-context-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Normalize-CommandOutput([string]$Text) {
  if ($null -eq $Text) {
    return ""
  }

  $normalized = $Text.Replace("`0", "")
  if ($normalized.Length -gt 0 -and [int][char]$normalized[0] -eq 65279) {
    $normalized = $normalized.Substring(1)
  }

  $normalized = [regex]::Replace($normalized, "[\x00-\x08\x0B\x0C\x0E-\x1F]", "")
  return $normalized.Trim()
}

function Run-CommandText([scriptblock]$Action) {
  try {
    $out = & $Action 2>&1 | Out-String
    return [pscustomobject]@{
      ok = $true
      output = (Normalize-CommandOutput $out)
    }
  } catch {
    return [pscustomobject]@{
      ok = $false
      output = (Normalize-CommandOutput ($_ | Out-String))
    }
  }
}

function Test-HttpRaw([string]$Url) {
  try {
    $resp = Invoke-WebRequest $Url -UseBasicParsing -TimeoutSec 5
    return [pscustomobject]@{
      url = $Url
      ok = $true
      statusCode = $resp.StatusCode
      body = ($resp.Content | Out-String).Trim()
    }
  } catch {
    return [pscustomobject]@{
      url = $Url
      ok = $false
      error = $_.Exception.Message
    }
  }
}

function Get-PortOwners([int[]]$Ports) {
  $results = @()
  foreach ($p in $Ports) {
    $conns = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
      $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($c.OwningProcess)" -ErrorAction SilentlyContinue
      $results += [pscustomobject]@{
        port = $p
        pid = $c.OwningProcess
        localAddress = $c.LocalAddress
        processName = if ($proc) { $proc.Name } else { $null }
        commandLine = if ($proc) { $proc.CommandLine } else { $null }
      }
    }
  }
  return $results
}

function Get-VersionMatches([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return @()
  }

  $matches = [regex]::Matches($Text, "\d+(?:\.\d+)+")
  if ($matches.Count -eq 0) {
    return @()
  }

  return @($matches | ForEach-Object { $_.Value } | Select-Object -Unique)
}

function Parse-DockerVersionInfo([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  try {
    return $Text | ConvertFrom-Json
  } catch {
    return $null
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

$dockerVersion = Run-CommandText { docker version --format "{{json .}}" }
$wslStatus = Run-CommandText { wsl.exe --status }
$wslVersion = Run-CommandText { wsl.exe --version }
$portOwners = @(Get-PortOwners @(1883, 3000, 5432, 6379, 8080, 8081, 8123, 9000, 9094))
$hostHttp = @(
  (Test-HttpRaw "http://127.0.0.1:8080/health"),
  (Test-HttpRaw "http://127.0.0.1:3000"),
  (Test-HttpRaw "http://127.0.0.1:8123/ping"),
  (Test-HttpRaw "http://[::1]:8080/health"),
  (Test-HttpRaw "http://[::1]:3000"),
  (Test-HttpRaw "http://[::1]:8123/ping")
)

$dockerInfo = Parse-DockerVersionInfo $dockerVersion.output
$hostHttpFailures = @($hostHttp | Where-Object { -not $_.ok } | ForEach-Object { $_.url })
$wslRelayPorts = @($portOwners | Where-Object { $_.processName -eq "wslrelay.exe" } | ForEach-Object { $_.port } | Sort-Object -Unique)
$dockerBackendPorts = @($portOwners | Where-Object { $_.processName -eq "com.docker.backend.exe" } | ForEach-Object { $_.port } | Sort-Object -Unique)

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  dockerVersion = $dockerVersion
  wslStatus = $wslStatus
  wslVersion = $wslVersion
  summary = [ordered]@{
    dockerDesktopVersion = if ($dockerInfo) { $dockerInfo.Server.Platform.Name } else { $null }
    dockerClientVersion = if ($dockerInfo) { $dockerInfo.Client.Version } else { $null }
    dockerServerVersion = if ($dockerInfo) { $dockerInfo.Server.Version } else { $null }
    dockerContext = if ($dockerInfo) { $dockerInfo.Client.Context } else { $null }
    dockerKernelVersion = if ($dockerInfo) { $dockerInfo.Server.KernelVersion } else { $null }
    wslStatusVersionHints = @(Get-VersionMatches $wslStatus.output)
    wslVersionHints = @(Get-VersionMatches $wslVersion.output)
    relay = [ordered]@{
      hasWslRelay = ($wslRelayPorts.Count -gt 0)
      wslRelayPorts = $wslRelayPorts
      hasDockerBackend = ($dockerBackendPorts.Count -gt 0)
      dockerBackendPorts = $dockerBackendPorts
    }
    hostHttpFailureCount = $hostHttpFailures.Count
    failedHostHttpUrls = $hostHttpFailures
  }
  portOwners = $portOwners
  hostHttp = $hostHttp
}

$fullOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $result | ConvertTo-Json -Depth 8
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
