[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$builderPath = Join-Path $repoRoot "scripts\firmware\build-xl01-compact-v3.ps1"
$builder = Get-Content -LiteralPath $builderPath -Raw

if ($builder -match 'fw-rk2206-rtk-compact-v\{0\}-rs485-diag-v5-r\d+-\d{8}') {
  throw "The firmware builder must not carry an independent hard-coded diagnostic revision"
}
foreach ($required in @(
    '$sourceFirmwareMarker = Get-QuotedMacroValue -Path $mainPath -Macro "FW_RX_DIAG_MARKER"',
    "([regex]::Matches(`$sourceFirmwareMarker, 'compact-v[34]')).Count -ne 1",
    "`$targetFirmwareMarker = `$sourceFirmwareMarker -replace 'compact-v[34]'",
    '-Value $targetFirmwareMarker'
  )) {
  if (-not $builder.Contains($required)) {
    throw "Firmware marker source-of-truth guard is missing: $required"
  }
}

Write-Host "RELEASE_MARKER_SOURCE_SAFETY_OK source=landslide_main compact_token=derived"
