[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ReleaseTag,

  [string]$GitHubRepository = "kipp7/landslide-monitoring-v2",
  [string]$FirmwareAssetName = "",
  [string]$SourceAssetName = ""
)

$ErrorActionPreference = "Stop"

$raw = gh release view $ReleaseTag --repo $GitHubRepository --json assets,url,isPrerelease
if ($LASTEXITCODE -ne 0 -or -not $raw) {
  throw "Unable to read GitHub Release: $ReleaseTag"
}
$release = $raw | ConvertFrom-Json
$assets = @($release.assets)

if ($FirmwareAssetName) {
  $firmwareAssets = @($assets | Where-Object name -eq $FirmwareAssetName)
} else {
  $firmwareAssets = @($assets | Where-Object { $_.name -like "RK2206-*.zip" -and $_.name -notlike "*Source*" })
}
if ($SourceAssetName) {
  $sourceAssets = @($assets | Where-Object name -eq $SourceAssetName)
} else {
  $sourceAssets = @($assets | Where-Object name -like "OpenHarmony-Source-*.zip")
}

if ($firmwareAssets.Count -ne 1) {
  throw "Expected exactly one RK2206 firmware ZIP, found $($firmwareAssets.Count)."
}
if ($sourceAssets.Count -ne 1) {
  throw "Expected exactly one OpenHarmony source ZIP, found $($sourceAssets.Count)."
}

$validated = @($firmwareAssets[0], $sourceAssets[0])
foreach ($asset in $validated) {
  if ($asset.state -ne "uploaded") { throw "Release asset is not uploaded: $($asset.name)" }
  if ([long]$asset.size -le 0) { throw "Release asset is empty: $($asset.name)" }
  if ([string]$asset.digest -notmatch '^sha256:[0-9a-f]{64}$') {
    throw "Release asset has no valid server-side SHA-256 digest: $($asset.name)"
  }
}

[ordered]@{
  releaseTag = $ReleaseTag
  url = $release.url
  isPrerelease = $release.isPrerelease
  status = "passed"
  assets = @($validated | ForEach-Object {
    [ordered]@{ name = $_.name; bytes = $_.size; digest = $_.digest }
  })
} | ConvertTo-Json -Depth 5
