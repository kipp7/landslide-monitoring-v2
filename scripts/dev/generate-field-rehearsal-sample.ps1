[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Sample,
  [string]$OutFile = "",
  [string]$Device = "",
  [int]$Seq = -1,
  [string]$EventTs = "",
  [int]$RepeatMetrics = -1,
  [string]$PacketClass = ""
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Push-Location $repoRoot
try {
  $args = @("scripts/dev/generate-field-rehearsal-sample.js", "--sample", $Sample)
  if ($OutFile) { $args += @("--out", $OutFile) }
  if ($Device) { $args += @("--device", $Device) }
  if ($Seq -ge 0) { $args += @("--seq", "$Seq") }
  if ($EventTs) { $args += @("--eventTs", $EventTs) }
  if ($RepeatMetrics -ge 0) { $args += @("--repeatMetrics", "$RepeatMetrics") }
  if ($PacketClass) { $args += @("--packetClass", $PacketClass) }

  & node @args
  if ($LASTEXITCODE -ne 0) {
    throw "generate-field-rehearsal-sample failed (exit=$LASTEXITCODE)"
  }
} finally {
  Pop-Location
}
