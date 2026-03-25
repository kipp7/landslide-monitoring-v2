[CmdletBinding()]
param(
  [int]$HttpPortBase = 18091,
  [string]$OutFile = "docs/unified/reports/field-hf-oversized-semantic-proof-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile([string]$Path) {
  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

function Read-TextFileIfExists([string]$Path) {
  if (-not (Test-Path $Path)) {
    return ""
  }
  return Get-Content -Raw -Encoding UTF8 $Path
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $normalOutFile = "docs/unified/reports/field-http-full-path-hf-normal-latest.json"
  $oversizedOutFile = "docs/unified/reports/field-http-full-path-hf-oversized-latest.json"

  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/check-field-http-full-path.ps1" -Sample "hf-normal" -HttpPort $HttpPortBase -OutFile $normalOutFile | Out-Null
  powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/dev/check-field-http-full-path.ps1" -Sample "hf-oversized" -HttpPort ($HttpPortBase + 1) -OutFile $oversizedOutFile | Out-Null

  $normal = Read-JsonFile (Join-Path $repoRoot $normalOutFile)
  $oversized = Read-JsonFile (Join-Path $repoRoot $oversizedOutFile)
  $governance = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-docker-mqtt-governance-latest.json")
  $oversizedGovernance = @($governance.samples | Where-Object { $_.sample -eq "hf-oversized" })[0]
  $normalGovernance = @($governance.samples | Where-Object { $_.sample -eq "hf-normal" })[0]
  $oversizedWriterLog = Read-TextFileIfExists $oversized.logs.writerStdout
  $oversizedDlqObserved = $oversizedWriterLog.Contains("high-frequency packet exceeded semantic budget (dlq)")

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    baseline = [ordered]@{
      acceptedSample = "hf-normal"
      candidateSample = "hf-oversized"
    }
    governance = [ordered]@{
      hfNormal = [ordered]@{
        budgetExceeded = [bool]$normalGovernance.budgetExceeded
        semanticDisposition = [string]$normalGovernance.semanticDisposition
      }
      hfOversized = [ordered]@{
        budgetExceeded = [bool]$oversizedGovernance.budgetExceeded
        semanticDisposition = [string]$oversizedGovernance.semanticDisposition
        warnings = @($oversizedGovernance.warnings)
      }
    }
    fullPath = [ordered]@{
      hfNormal = [ordered]@{
        boundary = [string]$normal.boundary
        clickhouseObserved = [bool]$normal.clickhouseObserved
        postgresShadowObserved = [bool]$normal.postgresShadowObserved
      }
      hfOversized = [ordered]@{
         boundary = [string]$oversized.boundary
         clickhouseObserved = [bool]$oversized.clickhouseObserved
         postgresShadowObserved = [bool]$oversized.postgresShadowObserved
         dlqObserved = $oversizedDlqObserved
      }
    }
    conclusion = if (
      $oversizedGovernance.budgetExceeded -and
      $oversizedGovernance.semanticDisposition -eq "reject-or-downgrade-candidate" -and
      -not $oversized.clickhouseObserved -and
      -not $oversized.postgresShadowObserved -and
      $oversizedDlqObserved
    ) {
      "hf-oversized-now-rejected-or-downgraded-before-persistence"
    } elseif (
      $oversizedGovernance.budgetExceeded -and
      $oversizedGovernance.semanticDisposition -eq "reject-or-downgrade-candidate" -and
      $oversized.clickhouseObserved -and
      $oversized.postgresShadowObserved
    ) {
      "hf-oversized-currently-persists-without-reject-or-downgrade"
    } else {
      "hf-oversized-behavior-needs-review"
    }
    notes = @(
      "hf-normal is used as the accepted-class baseline.",
      "hf-oversized is expected to be a reject-or-downgrade candidate at the semantic layer.",
      "If hf-oversized still reaches ClickHouse and device_state, the current stack has not yet implemented downstream reject/downgrade behavior.",
      "If hf-oversized no longer reaches ClickHouse/device_state and writer logs show DLQ routing, the downstream reject/downgrade path is considered implemented."
    )
    artifacts = [ordered]@{
      normalFullPath = $normalOutFile
      oversizedFullPath = $oversizedOutFile
      governance = "docs/unified/reports/field-docker-mqtt-governance-latest.json"
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
