[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [switch]$Apply
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$deskArtifacts = Join-Path $repoRoot "artifacts\desk-win"

# Keep current desktop delivery baseline and cloud package. These are intentionally not listed here.
$targets = @(
  "delivery",
  "milestones",
  "latest-cloud-fixed-20260528-221328",
  "latest-cloud-fixed-20260528-221617",
  "win-x64-cloud-selfcontained-20260528-221328",
  "win-x64-cloud-selfcontained-20260528-221617",
  "latest-cloud-fixed-20260528-221328.zip",
  "latest-cloud-fixed-20260528-2129.zip",
  "latest-cloud-fixed-20260528-221617.zip",
  "start-cloud-fixed.cmd",
  "win-x64",
  "win-x64-selfcontained",
  "latest.rar"
)

$items = foreach ($name in $targets) {
  $path = Join-Path $deskArtifacts $name
  if (Test-Path -LiteralPath $path) {
    $item = Get-Item -LiteralPath $path
    $sum = if ($item.PSIsContainer) {
      (Get-ChildItem -LiteralPath $path -Recurse -Force -File -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    } else {
      $item.Length
    }
    [pscustomobject]@{
      RelativePath = "artifacts\desk-win\$name"
      FullPath = $path
      MB = [math]::Round($sum / 1MB, 1)
    }
  }
}

if (-not $items) {
  Write-Host "No old desk artifact targets found."
  return
}

$items | Sort-Object MB -Descending | Format-Table -AutoSize
$total = [math]::Round((($items | Measure-Object MB -Sum).Sum), 1)
Write-Host "Estimated freeable space: $total MB"
Write-Host "Kept by design: artifacts\desk-win\latest, latest-cloud, latest-cloud.zip, CURRENT-BASELINE.md, prerequisites, installer directories."

if (-not $Apply) {
  Write-Host "Dry run only. Re-run with -Apply to delete old desk artifacts."
  return
}

foreach ($item in $items) {
  if ($PSCmdlet.ShouldProcess($item.FullPath, "Remove old desk artifact")) {
    Remove-Item -LiteralPath $item.FullPath -Recurse -Force
  }
}

Write-Host "Old desk artifact cleanup complete."
