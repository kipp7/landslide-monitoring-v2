[CmdletBinding()]
param(
  [string]$OutFile = "docs/unified/reports/field-semantic-scorecard-latest.md"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "Missing report: $Path"
  }
  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

function Clean-Text([string]$Value) {
  if ($null -eq $Value) { return "" }
  $text = [string]$Value
  $text = $text.Replace("`r", " ").Replace("`n", " ")
  $text = $text.Replace([string][char]0x2028, " ").Replace([string][char]0x2029, " ")
  $text = [regex]::Replace($text, "\p{Cc}", " ")
  $text = $text -replace "\s+", " "
  return $text.Trim()
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $matrix = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-docker-mqtt-matrix-latest.json")
  $governance = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-docker-mqtt-governance-latest.json")
  $fullPath = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-http-full-path-latest.json")
  $oversized = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-hf-oversized-semantic-proof-latest.json")
  $sequence = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-sequence-semantic-proofs-latest.json")
  $dlq = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-dlq-reason-proofs-latest.json")
  $lfMeta = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-lf-meta-semantic-proof-latest.json")
  $missingNull = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-missing-null-semantic-proof-latest.json")
  $missingAlertPolicy = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-missing-alert-policy-proof-latest.json")
  $missingAlertRecovery = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-missing-alert-recovery-proof-latest.json")
  $alertNotification = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-alert-notification-proof-latest.json")
  $commandNotification = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-notification-proof-latest.json")
  $commandFailedNotification = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-failed-notification-proof-latest.json")
  $commandFailedReceipt = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-failed-receipt-proof-latest.json")
  $commandFailedMqttReceipt = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-failed-mqtt-receipt-proof-latest.json")
  $commandAckedMqttReceipt = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-acked-mqtt-receipt-proof-latest.json")
  $commandAckedNotification = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-acked-notification-proof-latest.json")
  $commandSuccessTypeDefault = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-success-notification-type-default-proof-latest.json")
  $commandSuccessPolicyConfig = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-success-notification-policy-config-proof-latest.json")
  $commandSuccessPolicyCustomType = Read-JsonFile (Join-Path $repoRoot "docs/unified/reports/field-command-success-notification-policy-custom-type-proof-latest.json")

  $sequenceMap = @{}
  foreach ($row in @($sequence.scenarios)) {
    $sequenceMap[[string]$row.scenario] = Clean-Text ([string]$row.conclusion)
  }

  $dlqMap = @{}
  foreach ($row in @($dlq.scenarios)) {
    $dlqMap[[string]$row.scenario] = Clean-Text ([string](($row.reasonCodes -join ", ")))
  }

  $matrixStatus = if ($matrix.allPassed) { "pass" } else { "review" }
  $governanceStatus = if ($governance.allTransportOk -and $governance.allSemanticAssertionsOk) { "pass" } else { "review" }
  $fullPathStatus = if ($fullPath.boundary -eq "full-path-ok") { "pass" } else { "review" }
  $dlqStatus = if ($dlq.allMatched) { "pass" } else { "review" }

  $lines = @(
    "# Field Semantic Scorecard",
    "",
    "- UpdatedAt: $((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))",
    "",
    "## Current Scorecard",
    "",
    "| Area | Current Result | Evidence |",
    "| --- | --- | --- |",
    "| Docker transport matrix | $matrixStatus | field-docker-mqtt-matrix-latest.json |",
    "| Transport + governance matrix | $governanceStatus | field-docker-mqtt-governance-latest.json |",
    "| Host-run HTTP full-path | $fullPathStatus | field-http-full-path-latest.json |",
    "| hf-oversized policy | $(Clean-Text ([string]$oversized.conclusion)) | field-hf-oversized-semantic-proof-latest.json |",
    "| duplicate seq policy | $(Clean-Text ([string]$sequenceMap['duplicate'])) | field-sequence-semantic-proofs-latest.json |",
    "| out-of-order seq policy | $(Clean-Text ([string]$sequenceMap['out_of_order'])) | field-sequence-semantic-proofs-latest.json |",
    "| replay seq policy | $(Clean-Text ([string]$sequenceMap['replay'])) | field-sequence-semantic-proofs-latest.json |",
    "| DLQ reason mapping | $dlqStatus | field-dlq-reason-proofs-latest.json |",
    "| lf-meta merge behavior | $(Clean-Text ([string]$lfMeta.conclusion)) | field-lf-meta-semantic-proof-latest.json |",
    "| Missing vs null behavior | $(Clean-Text ([string]$missingNull.conclusion)) | field-missing-null-semantic-proof-latest.json |",
    "| Missing alert policy | $(Clean-Text ([string]$missingAlertPolicy.conclusion)) | field-missing-alert-policy-proof-latest.json |",
    "| Missing alert recovery | $(Clean-Text ([string]$missingAlertRecovery.conclusion)) | field-missing-alert-recovery-proof-latest.json |",
    "| Alert notification API | $(Clean-Text ([string]$alertNotification.conclusion)) | field-alert-notification-proof-latest.json |",
    "| Command timeout notification | $(Clean-Text ([string]$commandNotification.conclusion)) | field-command-notification-proof-latest.json |",
    "| Command failed notification | $(Clean-Text ([string]$commandFailedNotification.conclusion)) | field-command-failed-notification-proof-latest.json |",
    "| Command failed receipt path | $(Clean-Text ([string]$commandFailedReceipt.conclusion)) | field-command-failed-receipt-proof-latest.json |",
    "| Command failed MQTT ingress | $(Clean-Text ([string]$commandFailedMqttReceipt.conclusion)) | field-command-failed-mqtt-receipt-proof-latest.json |",
    "| Command acked default behavior | $(Clean-Text ([string]$commandAckedMqttReceipt.conclusion)) | field-command-acked-mqtt-receipt-proof-latest.json |",
    "| Command acked opt-in notification | $(Clean-Text ([string]$commandAckedNotification.conclusion)) | field-command-acked-notification-proof-latest.json |",
    "| Command acked type-default notification | $(Clean-Text ([string]$commandSuccessTypeDefault.conclusion)) | field-command-success-notification-type-default-proof-latest.json |",
    "| Command success policy config control | $(Clean-Text ([string]$commandSuccessPolicyConfig.conclusion)) | field-command-success-notification-policy-config-proof-latest.json |",
    "| Command success policy custom type | $(Clean-Text ([string]$commandSuccessPolicyCustomType.conclusion)) | field-command-success-notification-policy-custom-type-proof-latest.json |",
    "",
    "## Key DLQ Reasons",
    "",
    "- hf_oversized: $(Clean-Text ([string]$dlqMap['hf_oversized']))",
    "- duplicate: $(Clean-Text ([string]$dlqMap['duplicate']))",
    "- out_of_order: $(Clean-Text ([string]$dlqMap['out_of_order']))",
    "- replay: $(Clean-Text ([string]$dlqMap['replay']))",
    "",
    "## Current Interpretation",
    "",
    "- The field rehearsal chain now has proof not only for transport, persistence, semantic guards, and DLQ reason mapping, but also for the first batch of user-consumable alert and command notification behaviors.",
    "- The command receipt domain now has a layered success-notification policy: failed/timeout notify by default, acked remains silent by default, and success notifications can now be enabled by per-command override or command-type default.",
    "- The command success-notification default table is now not only productized in system_configs, but also proven to control runtime behavior through the dedicated management API, including newly added custom command types.",
    "- The next meaningful work should move above this layer into refining the management experience or another new business domain, not more proof of the same chain.",
    "",
    "## Recommended Next Moves",
    "",
    "1. Refine the existing Desk/Web management experience for the command success-notification default table instead of adding more same-layer proofs.",
    "2. If you need another proof, prefer a user-facing/business-facing scenario rather than another transport or guard validation."
  )

  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  $md = $lines -join [Environment]::NewLine
  Set-Content -Path $fullOutFile -Value $md -Encoding UTF8
  $md
} finally {
  Pop-Location
}
