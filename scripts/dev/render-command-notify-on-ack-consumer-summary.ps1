[CmdletBinding()]
param(
  [string]$DeskFile = "docs/unified/reports/desk-command-notify-on-ack-proof-latest.json",
  [string]$WebFile = "docs/unified/reports/web-command-notify-on-ack-proof-latest.json",
  [string]$OutFile = "docs/unified/reports/command-notify-on-ack-consumer-summary-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Read-JsonFile([string]$Path) {
  if (-not (Test-Path $Path)) {
    throw "Missing report: $Path"
  }
  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

Push-Location $repoRoot
try {
  $desk = Read-JsonFile (Join-Path $repoRoot $DeskFile)
  $web = Read-JsonFile (Join-Path $repoRoot $WebFile)

  $summary = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    allChecksOk = (
      $desk.commandNotifyOnAck.defaultNotifyOnAck -eq $false -and
      $desk.commandNotifyOnAck.optInNotifyOnAck -eq $true -and
      $web.webCommandNotifyOnAck.defaultNotifyOnAck -eq $false -and
      $web.webCommandNotifyOnAck.optInNotifyOnAck -eq $true
    )
    desk = [ordered]@{
      baseUrl = $desk.auth.baseUrl
      deviceId = $desk.commandNotifyOnAck.deviceId
      defaultCommandId = $desk.commandNotifyOnAck.defaultCommandId
      defaultNotifyOnAck = $desk.commandNotifyOnAck.defaultNotifyOnAck
      optInCommandId = $desk.commandNotifyOnAck.optInCommandId
      optInNotifyOnAck = $desk.commandNotifyOnAck.optInNotifyOnAck
      commandsLoaded = $desk.commandNotifyOnAck.commandsLoaded
    }
    web = [ordered]@{
      baseUrl = $web.auth.baseUrl
      deviceId = $web.webCommandNotifyOnAck.deviceId
      defaultCommandId = $web.webCommandNotifyOnAck.defaultCommandId
      defaultNotifyOnAck = $web.webCommandNotifyOnAck.defaultNotifyOnAck
      optInCommandId = $web.webCommandNotifyOnAck.optInCommandId
      optInNotifyOnAck = $web.webCommandNotifyOnAck.optInNotifyOnAck
      commandsLoaded = $web.webCommandNotifyOnAck.commandsLoaded
    }
    conclusion = if (
      $desk.commandNotifyOnAck.defaultNotifyOnAck -eq $false -and
      $desk.commandNotifyOnAck.optInNotifyOnAck -eq $true -and
      $web.webCommandNotifyOnAck.defaultNotifyOnAck -eq $false -and
      $web.webCommandNotifyOnAck.optInNotifyOnAck -eq $true
    ) {
      "consumer-notify-on-ack-roundtrip-stable-across-desk-and-web"
    } else {
      "consumer-notify-on-ack-roundtrip-needs-review"
    }
  }

  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  $json = $summary | ConvertTo-Json -Depth 8
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json
} finally {
  Pop-Location
}
