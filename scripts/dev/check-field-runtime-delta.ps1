[CmdletBinding()]
param(
  [string]$LocalReport = "docs/unified/reports/field-local-runtime-latest.json",
  [string]$DockerReport = "docs/unified/reports/field-docker-runtime-latest.json",
  [string]$DockerAcceptanceReport = "docs/unified/reports/field-docker-acceptance-latest.json",
  [string]$HostContextReport = "docs/unified/reports/field-host-path-context-latest.json",
  [string]$OutFile = "docs/unified/reports/field-runtime-delta-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile([string]$path) {
  if (-not (Test-Path $path)) {
    throw "Missing report: $path"
  }
  $raw = Get-Content -Raw -Encoding UTF8 $path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$local = Read-JsonFile (Join-Path $repoRoot $LocalReport)
$docker = Read-JsonFile (Join-Path $repoRoot $DockerReport)
$dockerAcceptance = Read-JsonFile (Join-Path $repoRoot $DockerAcceptanceReport)
$hostContext = Read-JsonFile (Join-Path $repoRoot $HostContextReport)

$localHttpFailures = @($local.http | Where-Object { -not $_.ok })
$hostPathFailures = if ($hostContext.summary -and $null -ne $hostContext.summary.failedHostHttpUrls) {
  @($hostContext.summary.failedHostHttpUrls)
} else {
  @($hostContext.hostHttp | Where-Object { -not $_.ok } | ForEach-Object { $_.url })
}
$hostPathFailureLookup = @{}
foreach ($url in $hostPathFailures) {
  $hostPathFailureLookup["$url"] = $true
}
$localAppProbeFailures = @($localHttpFailures | Where-Object { -not $hostPathFailureLookup.ContainsKey("$($_.url)") })
$dockerFailures = @()
foreach ($prop in $docker.containers.PSObject.Properties) {
  if (-not $prop.Value.ok) {
    $dockerFailures += $prop.Name
  }
}

$dockerAcceptanceFailures = @($dockerAcceptance.checks | Where-Object { -not $_.ok })

$summary = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  local = [ordered]@{
    tcpReachablePorts = @($local.tcp | Where-Object { $_.tcpReachable } | ForEach-Object { $_.port })
    failedHttpUrls = @($localHttpFailures | ForEach-Object { $_.url })
    appProbeFailureUrls = @($localAppProbeFailures | ForEach-Object { $_.url })
  }
  hostPath = [ordered]@{
    failedUrls = @($hostPathFailures)
  }
  docker = [ordered]@{
    failedContainers = @($dockerFailures)
  }
  dockerAcceptance = [ordered]@{
    failedUrls = @($dockerAcceptanceFailures | ForEach-Object { $_.url })
  }
  diagnosis = [ordered]@{
    hostTcpLooksOpen = (@($local.tcp | Where-Object { $_.tcpReachable }).Count -gt 0)
    hostPathHasFailures = ($hostPathFailures.Count -gt 0)
    localAppProbeHasFailures = ($localAppProbeFailures.Count -gt 0)
    dockerRuntimeHealthy = ($dockerFailures.Count -eq 0)
    dockerAcceptanceHealthy = ($dockerAcceptanceFailures.Count -eq 0)
  }
}

$summary["conclusion"] = if ($summary.diagnosis.hostPathHasFailures -and $summary.diagnosis.dockerRuntimeHealthy -and $summary.diagnosis.dockerAcceptanceHealthy) {
  "host-path-problem-container-path-ok"
} elseif ($summary.diagnosis.dockerRuntimeHealthy -eq $false) {
  "container-runtime-problem"
} elseif ($summary.diagnosis.dockerAcceptanceHealthy -eq $false) {
  "container-acceptance-problem"
} elseif ($summary.diagnosis.localAppProbeHasFailures) {
  "host-path-recovered-app-probe-gaps-remain"
} else {
  "host-path-recovered"
}

$summary["nextAction"] = switch ($summary.conclusion) {
  "host-path-problem-container-path-ok" { "Prioritize host-to-docker mapped path troubleshooting before changing the field rehearsal protocol/tooling." }
  "container-runtime-problem" { "Prioritize container service health and infra runtime recovery." }
  "container-acceptance-problem" { "Prioritize container-side auth, API, or data-path investigation." }
  "host-path-recovered-app-probe-gaps-remain" { "Treat host-to-docker relay as recovered in the current environment and investigate only the remaining local probe/auth gaps." }
  default { "Host-to-docker relay currently looks healthy; keep the current environment state and use Docker-network workflow as the main baseline." }
}

$summary["notes"] = @(
  "If both 127.0.0.1 and ::1 return empty reply/socket hang up while container-side probes are green, treat the issue as a host-to-docker relay/path problem rather than an application contract problem.",
  "Current safest rehearsal baseline remains the Docker-network path.",
  "Local probe failures that are not present in field-host-path-context should be treated as optional probe/auth/config gaps rather than host relay failures."
)

$fullOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $summary | ConvertTo-Json -Depth 8
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
