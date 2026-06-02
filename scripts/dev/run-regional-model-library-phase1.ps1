[CmdletBinding()]
param(
  [ValidateSet("threegorges", "badong", "event-inventory", "region-profile")]
  [string]$Task = "threegorges",
  [string]$RawRoot = ".tmp/regional-model-library/raw",
  [string]$OutRoot = ".tmp/regional-model-library/out",
  [string]$DatasetKey,
  [string]$WindowSpec = "6h,24h,72h",
  [string]$HorizonSpec = "1h,6h,24h",
  [string]$RegionCode,
  [string]$SlopeCode,
  [string]$StationCode,
  [string]$ScopeType,
  [switch]$DryRun,
  [switch]$SummaryOnly,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Add-StringArgument {
  param(
    [System.Collections.Generic.List[string]]$Arguments,
    [string]$Name,
    [string]$Value
  )

  if (-not [string]::IsNullOrWhiteSpace($Value)) {
    $Arguments.Add($Name) | Out-Null
    $Arguments.Add($Value) | Out-Null
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$invokeTsx = Join-Path $repoRoot "scripts/dev/invoke-tsx.ps1"
$tsFile = Join-Path $repoRoot "scripts/dev/regional-model-library/phase1-run.ts"

$argsJsonKey = "LSMV2_REGIONAL_MODEL_LIBRARY_ARGS_JSON"
$callerKey = "LSMV2_REGIONAL_MODEL_LIBRARY_CALLER"

$cliArguments = [System.Collections.Generic.List[string]]::new()
$cliArguments.Add("--task") | Out-Null
$cliArguments.Add($Task) | Out-Null
Add-StringArgument -Arguments $cliArguments -Name "--raw-root" -Value $RawRoot
Add-StringArgument -Arguments $cliArguments -Name "--out-root" -Value $OutRoot
Add-StringArgument -Arguments $cliArguments -Name "--dataset-key" -Value $DatasetKey
Add-StringArgument -Arguments $cliArguments -Name "--window-spec" -Value $WindowSpec
Add-StringArgument -Arguments $cliArguments -Name "--horizon-spec" -Value $HorizonSpec
Add-StringArgument -Arguments $cliArguments -Name "--region-code" -Value $RegionCode
Add-StringArgument -Arguments $cliArguments -Name "--slope-code" -Value $SlopeCode
Add-StringArgument -Arguments $cliArguments -Name "--station-code" -Value $StationCode
Add-StringArgument -Arguments $cliArguments -Name "--scope-type" -Value $ScopeType

if ($DryRun.IsPresent) {
  $cliArguments.Add("--dry-run") | Out-Null
}

if ($SummaryOnly.IsPresent) {
  $cliArguments.Add("--summary-only") | Out-Null
}

if ($Help.IsPresent) {
  $cliArguments.Add("--help") | Out-Null
}

$previousArgsJson = [Environment]::GetEnvironmentVariable($argsJsonKey, "Process")
$previousCaller = [Environment]::GetEnvironmentVariable($callerKey, "Process")

try {
  [Environment]::SetEnvironmentVariable(
    $argsJsonKey,
    ($cliArguments.ToArray() | ConvertTo-Json -Compress),
    "Process"
  )
  [Environment]::SetEnvironmentVariable($callerKey, "run-regional-model-library-phase1.ps1", "Process")

  & $invokeTsx -TsFile $tsFile

  if ($LASTEXITCODE -ne 0) {
    throw "regional-model-library phase-1 runner failed (exit=$LASTEXITCODE)"
  }
} finally {
  [Environment]::SetEnvironmentVariable($argsJsonKey, $previousArgsJson, "Process")
  [Environment]::SetEnvironmentVariable($callerKey, $previousCaller, "Process")
}
