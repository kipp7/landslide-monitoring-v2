[CmdletBinding()]
param(
  [string]$MatrixFile = "docs/unified/reports/field-docker-mqtt-matrix-latest.json",
  [string]$OutFile = "docs/unified/reports/field-docker-mqtt-governance-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    throw "Empty JSON text."
  }
  $raw = $Text
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

function Read-JsonFile([string]$Path) {
  $raw = Get-Content -Raw -Encoding UTF8 $Path
  return Read-JsonText $raw
}

function Get-SemanticDisposition([string]$SampleName, [bool]$IsHighFrequency, [bool]$IsIntentionalOversized) {
  if ($IsIntentionalOversized) { return "reject-or-downgrade-candidate" }
  if (-not $IsHighFrequency) { return "low-frequency-accepted-class" }
  if ($SampleName -like "*duplicate*") { return "dedupe-candidate" }
  if ($SampleName -like "*out-of-order*") { return "ordering-candidate" }
  if ($SampleName -like "*replay*") { return "replay-candidate" }
  return "high-frequency-accepted-class"
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $matrix = Read-JsonFile (Join-Path $repoRoot $MatrixFile)
  $sampleCheckRaw = & node "scripts/dev/check-field-rehearsal-samples.js" 2>&1 | Out-String
  $sampleCheck = Read-JsonText $sampleCheckRaw

  $sampleIndex = @{}
  foreach ($entry in $sampleCheck.samples) {
    $sampleIndex[[string]$entry.sample] = $entry
  }

  $results = [System.Collections.Generic.List[object]]::new()
  foreach ($row in $matrix.samples) {
    $sampleFile = if ([string]$row.sample -like "*.json") { [string]$row.sample } else { [string]$row.sample + ".json" }
    if (-not $sampleIndex.ContainsKey($sampleFile)) {
      throw "Missing sample validation entry for $sampleFile"
    }

    $validation = $sampleIndex[$sampleFile]
    $semanticDisposition = Get-SemanticDisposition $sampleFile ([bool]$validation.isHighFrequency) ([bool]$validation.isIntentionalOversized)
    $budgetExceeded = @($validation.warnings | Where-Object { "$_".Contains("budget exceeded") }).Count -gt 0
    $semanticAssertionOk = switch ($semanticDisposition) {
      "reject-or-downgrade-candidate" { $budgetExceeded -and [bool]$validation.isIntentionalOversized }
      default { -not $budgetExceeded }
    }
    $notes = switch ($semanticDisposition) {
      "reject-or-downgrade-candidate" { @("Transport workflow passed, but this sample still requires business-level reject/downgrade handling proof.") }
      "dedupe-candidate" { @("Transport workflow passed; downstream idempotency semantics should be asserted separately.") }
      "ordering-candidate" { @("Transport workflow passed; downstream ordering semantics should be asserted separately.") }
      "replay-candidate" { @("Transport workflow passed; downstream replay semantics should be asserted separately.") }
      default { @() }
    }

    $results.Add([ordered]@{
      sample = [string]$row.sample
      transportOk = [bool]$row.ok
      schemaValid = [bool]$validation.valid
      bytes = [int]$validation.bytes
      isHighFrequency = [bool]$validation.isHighFrequency
      budgetExceeded = $budgetExceeded
      semanticDisposition = $semanticDisposition
      semanticAssertionOk = $semanticAssertionOk
      warnings = @($validation.warnings)
      notes = @($notes)
    }) | Out-Null
  }

  $semanticFailures = @($results | Where-Object { -not $_.semanticAssertionOk } | ForEach-Object { $_.sample })
  $transportFailures = @($results | Where-Object { -not $_.transportOk } | ForEach-Object { $_.sample })

  $report = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    matrixFile = $MatrixFile
    highFrequencyBudget = $sampleCheck.highFrequencyBudget
    allTransportOk = ($transportFailures.Count -eq 0)
    allSemanticAssertionsOk = ($semanticFailures.Count -eq 0)
    transportFailures = $transportFailures
    semanticFailures = $semanticFailures
    notes = @(
      "This report combines Docker transport proof with sample-level schema/budget governance.",
      "It does not claim that reject/downgrade business handling is already implemented unless a dedicated downstream proof exists."
    )
    samples = $results
  }

  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  $json = $report | ConvertTo-Json -Depth 8
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json

  if ($transportFailures.Count -gt 0 -or $semanticFailures.Count -gt 0) {
    throw "field docker sample governance check failed"
  }
} finally {
  Pop-Location
}
