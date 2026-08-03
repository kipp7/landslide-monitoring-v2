[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourcePath = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\xl01_driver.c"
$source = Get-Content -LiteralPath $sourcePath -Raw

function Get-SourceSection {
  param(
    [Parameter(Mandatory = $true)][string]$Source,
    [Parameter(Mandatory = $true)][string]$StartMarker,
    [Parameter(Mandatory = $true)][string]$EndMarker
  )

  $start = $Source.IndexOf($StartMarker, [System.StringComparison]::Ordinal)
  if ($start -lt 0) {
    throw "Missing source marker: $StartMarker"
  }
  $end = $Source.IndexOf($EndMarker, $start + $StartMarker.Length, [System.StringComparison]::Ordinal)
  if ($end -lt 0) {
    throw "Missing source marker: $EndMarker"
  }
  return $Source.Substring($start, $end - $start)
}

$sendSection = Get-SourceSection `
  -Source $source `
  -StartMarker "static int XL01_SendTypedPayload(" `
  -EndMarker "static void PrintRxChunkPreview("

$lockIndex = $sendSection.IndexOf("XL01_TxLock();", [System.StringComparison]::Ordinal)
$sequenceIndex = $sendSection.IndexOf("XL01_NextFieldLinkTxSequence();", [System.StringComparison]::Ordinal)
$encodeIndex = $sendSection.IndexOf("FieldLinkFrame_Encode(", [System.StringComparison]::Ordinal)
$writeIndex = $sendSection.IndexOf("XL01_WriteChunkedUnlocked(encoded", [System.StringComparison]::Ordinal)
$unlockIndex = $sendSection.LastIndexOf("XL01_TxUnlock();", [System.StringComparison]::Ordinal)

if ($lockIndex -lt 0 -or $sequenceIndex -le $lockIndex -or $encodeIndex -le $sequenceIndex -or
    $writeIndex -le $encodeIndex -or $unlockIndex -le $writeIndex) {
  throw "Typed field-link frames must allocate sequence, encode and write under one TX lock"
}
if ($sendSection.Contains("XL01_WriteChunked(encoded")) {
  throw "Typed field-link send would recursively acquire the TX mutex"
}
if ($sendSection -notmatch '(?s)if \(encoded_len <= 0\).*?XL01_TxUnlock\(\);.*?return -1;') {
  throw "Field-link encode failure must release the TX mutex"
}

Write-Host "FIELD_LINK_TX_ORDER_SAFETY_OK sequence_encode_write=single-lock encode_failure=unlocked"
