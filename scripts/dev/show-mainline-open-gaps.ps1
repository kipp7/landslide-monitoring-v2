[CmdletBinding()]
param(
  [string]$OutFile = "docs/unified/reports/mainline-open-gaps-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$fullOutFile = Join-Path $repoRoot $OutFile

$targets = @(
  "apps/desk/src/views/AnalysisPage.tsx",
  "apps/desk/src/views/DeviceManagementPage.tsx",
  "apps/desk/src/views/GpsMonitoringPage.tsx",
  "apps/desk/src/views/HomePage.tsx",
  "apps/desk/src/views/StationManagementPanel.tsx",
  "apps/desk/src/views/StationsPage.tsx",
  "apps/desk/src/views/DevicesPage.tsx",
  "apps/desk/src/views/BaselinesPanel.tsx",
  "apps/desk/src/views/BaselinesPage.tsx",
  "apps/desk/src/views/GpsPage.tsx",
  "apps/desk/src/views/DashboardPage.tsx"
)

$patterns = @(
  "(Mock)",
  "UI Mock",
  "Mock 模式",
  "后续"
)

$items = New-Object System.Collections.Generic.List[psobject]

foreach ($relativePath in $targets) {
  $fullPath = Join-Path $repoRoot $relativePath
  if (-not (Test-Path $fullPath)) { continue }

  $lineNo = 0
  foreach ($line in Get-Content $fullPath -Encoding UTF8) {
    $lineNo += 1
    foreach ($pattern in $patterns) {
      if ($line.Contains($pattern)) {
        $items.Add([pscustomobject]@{
          file = $relativePath
          line = $lineNo
          pattern = $pattern
          text = $line.Trim()
        })
        break
      }
    }
  }
}

$groupedMap = @{}
foreach ($item in $items) {
  if (-not $groupedMap.ContainsKey($item.file)) {
    $groupedMap[$item.file] = New-Object System.Collections.Generic.List[psobject]
  }
  $groupedMap[$item.file].Add($item)
}

$grouped = @(
  foreach ($file in ($groupedMap.Keys | Sort-Object)) {
    [ordered]@{
      file = $file
      count = $groupedMap[$file].Count
      items = @($groupedMap[$file])
    }
  }
)

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  totalFiles = @($grouped).Count
  totalItems = $items.Count
  files = @($grouped)
}

$json = $result | ConvertTo-Json -Depth 20
$outDir = Split-Path -Parent $fullOutFile
if ($outDir -and -not (Test-Path $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}
Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
$json
