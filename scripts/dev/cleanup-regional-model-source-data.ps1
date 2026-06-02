[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$targets = @(
  ".tmp\regional-model-library\raw",
  ".tmp\regional-model-library\raw-xlsx-tests",
  ".tmp\regional-model-library\out",
  ".tmp\regional-model-library\out-baijiabao-smoke",
  ".tmp\regional-model-library\out-baijiabao-generic-infer",
  ".tmp\regional-model-library\out-xlsx-tests",
  ".tmp\regional-model-library\out-verify-20260421",
  ".tmp\regional-model-library\test-output"
)

$items = foreach ($rel in $targets) {
  $path = Join-Path $repoRoot $rel
  if (Test-Path -LiteralPath $path) {
    $sum = (Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    [pscustomobject]@{
      RelativePath = $rel
      FullPath = $path
      MB = [math]::Round($sum / 1MB, 1)
    }
  }
}

if (-not $items) {
  Write-Host "No regional-model source/intermediate data targets found."
  return
}

$items | Sort-Object MB -Descending | Format-Table -AutoSize
$total = [math]::Round((($items | Measure-Object MB -Sum).Sum), 1)
Write-Host "Estimated freeable space: $total MB"
Write-Host "Kept by design: scripts, docs, manifests, artifacts/models, artifacts/desk-win/latest*, and key/."

if (-not $Apply) {
  Write-Host "Dry run only. Re-run with -Apply to delete these source/intermediate data directories."
  return
}

foreach ($item in $items) {
  if ($PSCmdlet.ShouldProcess($item.FullPath, "Remove regional-model source/intermediate data")) {
    Remove-Item -LiteralPath $item.FullPath -Recurse -Force
  }
}

Write-Host "Regional-model source/intermediate data cleanup complete."
