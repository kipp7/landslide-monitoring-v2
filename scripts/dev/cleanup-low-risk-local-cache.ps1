[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$targets = @(
  "node_modules",
  "apps\desk\node_modules",
  "apps\web\node_modules",
  "apps\mobile\node_modules",
  "apps\promo-demo\node_modules",
  "apps\desk\dist.backup-20260528-221600",
  ".playwright-mcp"
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
  Write-Host "No low-risk cache targets found."
  return
}

$items | Sort-Object MB -Descending | Format-Table -AutoSize
$total = [math]::Round((($items | Measure-Object MB -Sum).Sum), 1)
Write-Host "Estimated freeable space: $total MB"

if (-not $Apply) {
  Write-Host "Dry run only. Re-run with -Apply to delete these low-risk generated directories."
  return
}

foreach ($item in $items) {
  if ($PSCmdlet.ShouldProcess($item.FullPath, "Remove generated/cache directory")) {
    Remove-Item -LiteralPath $item.FullPath -Recurse -Force
  }
}

Write-Host "Cleanup complete."
