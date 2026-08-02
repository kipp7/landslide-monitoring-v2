[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [object[]]$RemainingArguments
)

$ErrorActionPreference = "Stop"
$builder = Join-Path $PSScriptRoot "build-xl01-compact-v3.ps1"
& $builder -CompactVersion 4 @RemainingArguments
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
