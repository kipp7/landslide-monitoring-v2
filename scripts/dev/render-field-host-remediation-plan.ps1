[CmdletBinding()]
param(
  [string]$DeltaFile = "docs/unified/reports/field-runtime-delta-latest.json",
  [string]$ContextFile = "docs/unified/reports/field-host-path-context-latest.json",
  [string]$OutFile = "docs/unified/reports/field-host-remediation-plan-latest.md"
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

function Get-ValueOrUnknown($Value) {
  if ($null -eq $Value) {
    return "unknown"
  }

  $text = "$Value".Trim()
  if ([string]::IsNullOrWhiteSpace($text)) {
    return "unknown"
  }

  return $text
}

function Join-Values($Values) {
  if ($null -eq $Values) {
    return "none"
  }

  $items = @($Values | Where-Object { -not [string]::IsNullOrWhiteSpace("$($_)") } | ForEach-Object { "$_".Trim() })
  if ($items.Count -eq 0) {
    return "none"
  }

  return ($items -join ", ")
}

function Parse-JsonText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  try {
    return $Text | ConvertFrom-Json
  } catch {
    return $null
  }
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

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$delta = Read-JsonFile (Join-Path $repoRoot $DeltaFile)
$context = Read-JsonFile (Join-Path $repoRoot $ContextFile)

$summary = $context.summary
$dockerInfo = Parse-JsonText $context.dockerVersion.output
$portOwners = @($context.portOwners)
$hostHttp = @($context.hostHttp)

$fallbackWslRelayPorts = @($portOwners | Where-Object { $_.processName -eq "wslrelay.exe" } | ForEach-Object { $_.port } | Sort-Object -Unique)
$fallbackDockerBackendPorts = @($portOwners | Where-Object { $_.processName -eq "com.docker.backend.exe" } | ForEach-Object { $_.port } | Sort-Object -Unique)
$fallbackFailedUrls = @($hostHttp | Where-Object { -not $_.ok } | ForEach-Object { $_.url })

$dockerDesktopVersion = if ($summary -and $summary.dockerDesktopVersion) { $summary.dockerDesktopVersion } elseif ($dockerInfo) { $dockerInfo.Server.Platform.Name } else { $null }
$dockerClientVersion = if ($summary -and $summary.dockerClientVersion) { $summary.dockerClientVersion } elseif ($dockerInfo) { $dockerInfo.Client.Version } else { $null }
$dockerServerVersion = if ($summary -and $summary.dockerServerVersion) { $summary.dockerServerVersion } elseif ($dockerInfo) { $dockerInfo.Server.Version } else { $null }
$dockerContext = if ($summary -and $summary.dockerContext) { $summary.dockerContext } elseif ($dockerInfo) { $dockerInfo.Client.Context } else { $null }
$dockerKernelVersion = if ($summary -and $summary.dockerKernelVersion) { $summary.dockerKernelVersion } elseif ($dockerInfo) { $dockerInfo.Server.KernelVersion } else { $null }
$wslStatusHints = if ($summary -and $summary.wslStatusVersionHints) { Join-Values $summary.wslStatusVersionHints } else { Join-Values (Get-VersionMatches $context.wslStatus.output) }
$wslVersionHints = if ($summary -and $summary.wslVersionHints) { Join-Values $summary.wslVersionHints } else { Join-Values (Get-VersionMatches $context.wslVersion.output) }
$wslRelayPorts = if ($summary -and $summary.relay -and $summary.relay.wslRelayPorts) { Join-Values $summary.relay.wslRelayPorts } else { Join-Values $fallbackWslRelayPorts }
$dockerBackendPorts = if ($summary -and $summary.relay -and $summary.relay.dockerBackendPorts) { Join-Values $summary.relay.dockerBackendPorts } else { Join-Values $fallbackDockerBackendPorts }
$failedHostHttpUrls = if ($summary -and $summary.failedHostHttpUrls) { Join-Values $summary.failedHostHttpUrls } else { Join-Values $fallbackFailedUrls }
$dockerDesktopVersion = Get-ValueOrUnknown $dockerDesktopVersion
$dockerClientVersion = Get-ValueOrUnknown $dockerClientVersion
$dockerServerVersion = Get-ValueOrUnknown $dockerServerVersion
$dockerContext = Get-ValueOrUnknown $dockerContext
$dockerKernelVersion = Get-ValueOrUnknown $dockerKernelVersion
$hostPathRecovered = @("host-path-recovered", "host-path-recovered-app-probe-gaps-remain") -contains "$($delta.conclusion)"
$localAppProbeHasFailures = [bool]$delta.diagnosis.localAppProbeHasFailures
$readingLines = if ($hostPathRecovered -and $localAppProbeHasFailures) {
  @(
    "- Host-to-docker relay currently looks recovered in this environment.",
    "- Remaining local probe failures should be treated as app probe/auth/config gaps unless they also appear in host-path-context."
  )
} elseif ($hostPathRecovered) {
  @(
    "- Host-to-docker relay currently looks recovered in this environment.",
    "- Local runtime probes are also green in the current session, so this environment no longer shows a host relay blocker."
  )
} else {
  @(
    "- When Docker runtime and container-side acceptance are healthy but host-side HTTP still fails, treat this as a host-to-docker relay/path problem first.",
    "- Do not change field telemetry profile, gateway responsibilities, or platform probe definitions before the host-path problem is ruled out."
  )
}

$recommendedOrderLines = if ($hostPathRecovered -and $localAppProbeHasFailures) {
  @(
    "1. Keep the current Docker Desktop state as the working baseline; do not repeat environment reset unless the relay regression returns.",
    "2. Continue using the Docker-network MQTT workflow as the main functional baseline.",
    "3. Investigate only the remaining local probe/auth/config gaps.",
    "4. If host-path regressions return, re-run the low-risk recovery block and re-check field-host-path-context."
  )
} elseif ($hostPathRecovered) {
  @(
    "1. Keep the current Docker Desktop state as the working baseline; do not repeat environment reset unless the relay regression returns.",
    "2. Continue using the Docker-network MQTT workflow as the main functional baseline.",
    "3. Keep host relay governance closed and move attention to the next non-relay rehearsal goal.",
    "4. If host-path regressions return, re-run the low-risk recovery block and re-check field-host-path-context."
  )
} else {
  @(
    "1. Keep the Docker-network MQTT workflow as the current functional baseline.",
    "2. Treat host-path repair as environment governance, not business logic debugging.",
    "3. Apply low-risk environment recovery steps first, then re-run the field probes.",
    "4. Only if host-path recovery fails repeatedly should you freeze it as an external environment blocker."
  )
}

$lowRiskRecoveryLines = if ($hostPathRecovered) {
  @(
    "- Already exercised in the current session and relay recovery succeeded.",
    "- Reuse this block only if 127.0.0.1 / ::1 host-path failures reappear."
  )
} else {
  @(
    "1. Close Docker Desktop cleanly.",
    "2. Run `wsl --shutdown`.",
    "3. Start Docker Desktop and wait until it reports healthy.",
    "4. Re-run:",
    "   - scripts/dev/check-field-local-runtime.ps1",
    "   - scripts/dev/check-field-host-path-context.ps1",
    "   - scripts/dev/check-field-runtime-delta.ps1",
    "   - scripts/dev/render-field-host-remediation-plan.ps1",
    "5. If the delta still says `host-path-problem-container-path-ok`, move to the next block."
  )
}

$safeFallbackLines = if ($hostPathRecovered -and $localAppProbeHasFailures) {
  @(
    "- Host-path relay currently works again, but `scripts/dev/run-field-rehearsal-docker.ps1` remains the safest rehearsal baseline.",
    "- Keep the Docker-network path as the supported route until optional local probe gaps are separately cleaned up."
  )
} elseif ($hostPathRecovered) {
  @(
    "- Host-path relay currently works again and local runtime probes are green.",
    "- Keep `scripts/dev/run-field-rehearsal-docker.ps1` as the safest rehearsal baseline while moving on to the next non-relay blocker."
  )
} else {
  @(
    "- If host-path remains broken, continue using `scripts/dev/run-field-rehearsal-docker.ps1`.",
    "- This path is already validated and should remain the current project baseline."
  )
}

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Field Host Remediation Plan")
$lines.Add("")
$lines.Add("- GeneratedAt: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))")
$lines.Add("- DeltaConclusion: $($delta.conclusion)")
$lines.Add("- DockerRuntimeHealthy: $([string]$delta.diagnosis.dockerRuntimeHealthy)")
$lines.Add("- DockerAcceptanceHealthy: $([string]$delta.diagnosis.dockerAcceptanceHealthy)")
$lines.Add("- HostPathHasFailures: $([string]$delta.diagnosis.hostPathHasFailures)")
$lines.Add("- LocalAppProbeHasFailures: $([string]$delta.diagnosis.localAppProbeHasFailures)")
$lines.Add("")
$lines.Add("## Current Reading")
$lines.Add("")
foreach ($line in $readingLines) { $lines.Add($line) }
$lines.Add("")
$lines.Add("## Evidence Inputs")
$lines.Add("")
$lines.Add("- Delta report: $DeltaFile")
$lines.Add("- Host context report: $ContextFile")
$lines.Add("")
$lines.Add("## Environment Snapshot")
$lines.Add("")
$lines.Add("- Docker Desktop: $dockerDesktopVersion")
$lines.Add("- Docker client: $dockerClientVersion")
$lines.Add("- Docker server: $dockerServerVersion")
$lines.Add("- Docker context: $dockerContext")
$lines.Add("- Docker kernel: $dockerKernelVersion")
$lines.Add("- WSL status hints: $wslStatusHints")
$lines.Add("- WSL version hints: $wslVersionHints")
$lines.Add("")
$lines.Add("## Relay Indicators")
$lines.Add("")
$lines.Add("- `wslrelay.exe` observed on ports: $wslRelayPorts")
$lines.Add("- `com.docker.backend.exe` observed on ports: $dockerBackendPorts")
$lines.Add("- Host HTTP failures currently observed on: $failedHostHttpUrls")
$lines.Add("")
$lines.Add("## Recommended Order")
$lines.Add("")
foreach ($line in $recommendedOrderLines) { $lines.Add($line) }
$lines.Add("")
$lines.Add("## Low-Risk Recovery Steps")
$lines.Add("")
foreach ($line in $lowRiskRecoveryLines) { $lines.Add($line) }
$lines.Add("")
$lines.Add("## Configuration Review Steps")
$lines.Add("")
$lines.Add("1. Check Docker Desktop WSL integration is enabled for the active distro.")
$lines.Add("2. Check Docker Desktop networking settings related to localhost forwarding / host networking.")
$lines.Add("3. Check whether a VPN, local proxy, or endpoint security product is interfering with Docker port forwarding.")
$lines.Add("4. Re-run the host-path triage bundle after any setting change.")
$lines.Add("")
$lines.Add("## Advanced Experiment Steps")
$lines.Add("")
$lines.Add("1. Evaluate Docker Desktop host networking if your version and policy allow it.")
$lines.Add("2. Evaluate WSL mirrored networking / hostAddressLoopback if you explicitly want to troubleshoot WSL localhost behavior.")
$lines.Add("3. Treat both as environment experiments, not as architecture changes.")
$lines.Add("")
$lines.Add("## Safe Fallback")
$lines.Add("")
foreach ($line in $safeFallbackLines) { $lines.Add($line) }
$lines.Add("")
$lines.Add("## Exit Criteria")
$lines.Add("")
$lines.Add("- Host-path can return a non-empty, protocol-correct response on published ports; or")
$lines.Add("- The team explicitly accepts host-path as an environment blocker and keeps Docker-network workflow as the supported route for the current phase.")

$fullOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$md = $lines -join [Environment]::NewLine
Set-Content -Path $fullOutFile -Value $md -Encoding UTF8
$md
