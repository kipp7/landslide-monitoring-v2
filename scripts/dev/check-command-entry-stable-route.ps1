[CmdletBinding()]
param(
  [switch]$SkipDesk,
  [switch]$SkipWeb,
  [switch]$RunHardwareLive,
  [ValidateSet("manual-collect", "set-report-300", "set-report-5")]
  [string]$HardwareAction = "manual-collect",
  [string]$DeskFile = "docs/unified/reports/desk-command-notify-on-ack-proof-latest.json",
  [string]$WebFile = "docs/unified/reports/web-command-notify-on-ack-proof-latest.json",
  [string]$HardwareFile = ".tmp/hardware-stable-version-api-command-live-latest.json",
  [string]$HardwareLastSuccessFile = ".tmp/hardware-stable-version-api-command-live-last-success.json",
  [string]$HardwarePassiveProbeFile = "docs/unified/reports/hardware-stable-version-passive-serial-probe-latest.json",
  [string]$OutFile = "docs/unified/reports/command-entry-stable-route-summary-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Ensure-Directory {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Read-JsonFile {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    throw "Missing report: $Path"
  }

  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if ($raw.Length -gt 0 -and [int][char]$raw[0] -eq 65279) {
    $raw = $raw.Substring(1)
  }
  return $raw | ConvertFrom-Json
}

function Read-TextFileSafe {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return ""
  }

  return [string](Get-Content -Raw -Encoding UTF8 $Path)
}

function Invoke-PowershellFile {
  param(
    [string]$RepoRoot,
    [string]$ScriptPath,
    [string[]]$Arguments = @(),
    [string]$Name,
    [int]$TimeoutSeconds = 900
  )

  $tmpDir = Join-Path $RepoRoot ".tmp"
  Ensure-Directory -Path $tmpDir

  $stamp = Get-Date -Format "yyyyMMdd-HHmmss-fff"
  $stdoutFile = Join-Path $tmpDir ("check-command-entry-stable-route-{0}-{1}.stdout.log" -f $Name, $stamp)
  $stderrFile = Join-Path $tmpDir ("check-command-entry-stable-route-{0}-{1}.stderr.log" -f $Name, $stamp)
  $quotedScriptPath = "'" + $ScriptPath.Replace("'", "''") + "'"
  $quotedRepoRoot = "'" + $RepoRoot.Replace("'", "''") + "'"
  $quotedArguments = @($Arguments | ForEach-Object {
      $text = [string]$_
      if ($text -match '^-[A-Za-z]') {
        $text
      } else {
        "'" + $text.Replace("'", "''") + "'"
      }
    })
  $invokeScript = if ($quotedArguments.Count -gt 0) {
    "& $quotedScriptPath $($quotedArguments -join ' ')"
  } else {
    "& $quotedScriptPath"
  }
  $runner = @(
    '$ErrorActionPreference = ''Stop'''
    '$ProgressPreference = ''SilentlyContinue'''
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8'
    "Set-Location $quotedRepoRoot"
    $invokeScript
  ) -join "`r`n"
  $encodedCommand = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($runner))

  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encodedCommand) `
    -WorkingDirectory $RepoRoot `
    -PassThru `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile

  $exited = $process.WaitForExit($TimeoutSeconds * 1000)
  if (-not $exited) {
    try { Stop-Process -Id $process.Id -Force -ErrorAction Stop } catch {}
    throw "$Name timed out after ${TimeoutSeconds}s. stdout=$stdoutFile stderr=$stderrFile"
  }
  $process.WaitForExit()

  $stdoutRaw = Read-TextFileSafe -Path $stdoutFile
  $stderrRaw = Read-TextFileSafe -Path $stderrFile
  $stdoutText = if ($null -ne $stdoutRaw) { ([string]$stdoutRaw).Trim() } else { "" }
  $stderrText = if ($null -ne $stderrRaw) { ([string]$stderrRaw).Trim() } else { "" }
  $exitCode = 0
  try {
    $process.Refresh()
    if ($null -ne $process.ExitCode) {
      $exitCode = [int]$process.ExitCode
    }
  } catch {
    $exitCode = 0
  }

  if ($exitCode -ne 0) {
    $detail = if ($stderrText) {
      $stderrText
    } elseif ($stdoutText) {
      $stdoutText
    } else {
      "no stdout/stderr captured"
    }
    throw "$Name failed (exit=$exitCode). stdout=$stdoutFile stderr=$stderrFile`n$detail"
  }

  return [ordered]@{
    exitCode = $exitCode
    stdoutFile = $stdoutFile
    stderrFile = $stderrFile
    stdout = $stdoutText
    stderr = $stderrText
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$deskScript = Join-Path $repoRoot "scripts/dev/check-desk-command-notify-on-ack.ps1"
$webScript = Join-Path $repoRoot "scripts/dev/check-web-command-notify-on-ack.ps1"
$hardwareScript = Join-Path $repoRoot "scripts/dev/run-hardware-stable-version-api-command-live.ps1"

Push-Location $repoRoot
try {
  if (-not $SkipDesk) {
    Invoke-PowershellFile -RepoRoot $repoRoot -ScriptPath $deskScript -Name "desk-command-notify-on-ack" | Out-Null
  }

  if (-not $SkipWeb) {
    Invoke-PowershellFile -RepoRoot $repoRoot -ScriptPath $webScript -Name "web-command-notify-on-ack" | Out-Null
  }

  if ($RunHardwareLive) {
    Invoke-PowershellFile -RepoRoot $repoRoot -ScriptPath $hardwareScript -Arguments @("-Action", $HardwareAction) -Name "hardware-api-command-live" | Out-Null
  }

  $desk = Read-JsonFile (Join-Path $repoRoot $DeskFile)
  $web = Read-JsonFile (Join-Path $repoRoot $WebFile)
  $hardware = Read-JsonFile (Join-Path $repoRoot $HardwareFile)
  $hardwareLastSuccessPath = Join-Path $repoRoot $HardwareLastSuccessFile
  $hardwareLastSuccess = if (Test-Path $hardwareLastSuccessPath) { Read-JsonFile $hardwareLastSuccessPath } else { $null }
  $hardwarePassiveProbePath = Join-Path $repoRoot $HardwarePassiveProbeFile
  $hardwarePassiveProbe = if (Test-Path $hardwarePassiveProbePath) { Read-JsonFile $hardwarePassiveProbePath } else { $null }

  $deskOk = (
    $desk.commandNotifyOnAck.defaultNotifyOnAck -eq $false -and
    $desk.commandNotifyOnAck.optInNotifyOnAck -eq $true -and
    $desk.commandNotifyOnAck.defaultSuccessNotificationPolicy -eq "silent" -and
    $desk.commandNotifyOnAck.optInSuccessNotificationPolicy -eq "always_notify"
  )

  $webOk = (
    $web.webCommandNotifyOnAck.defaultNotifyOnAck -eq $false -and
    $web.webCommandNotifyOnAck.optInNotifyOnAck -eq $true -and
    $web.webCommandNotifyOnAck.defaultSuccessNotificationPolicy -eq "silent" -and
    $web.webCommandNotifyOnAck.optInSuccessNotificationPolicy -eq "always_notify"
  )

  $hardwareCloseLoopOk = [bool](
    $hardware.proof -and
    $hardware.proof.apiCommandAcked -eq $true -and
    $hardware.proof.ackEventRecorded -eq $true -and
    $hardware.proof.ackNotificationRecorded -eq $true -and
    $hardware.proof.systemCloseLoop -eq $true
  )

  $summary = [ordered]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    officialRoute = [ordered]@{
      sourceOfTruth = "api-v1-device-commands"
      endpoint = "/api/v1/devices/{deviceId}/commands"
      frozenHardwareBaseline = [ordered]@{
        port = "COM5"
        xl01Mode = "transparent USR"
        chunkStrategy = "whole"
        reportIntervalSeconds = 5
      }
      quickCommandGate = "powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\run-hardware-stable-version-api-command-live.ps1 -Action manual-collect"
      summaryScript = "powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\check-command-entry-stable-route.ps1"
    }
    checks = [ordered]@{
      deskClientContract = [ordered]@{
        ok = $deskOk
        baseUrl = $desk.auth.baseUrl
        deviceId = $desk.commandNotifyOnAck.deviceId
        defaultCommandId = $desk.commandNotifyOnAck.defaultCommandId
        optInCommandId = $desk.commandNotifyOnAck.optInCommandId
        reportFile = $DeskFile
      }
      webClientContract = [ordered]@{
        ok = $webOk
        baseUrl = $web.auth.baseUrl
        deviceId = $web.webCommandNotifyOnAck.deviceId
        defaultCommandId = $web.webCommandNotifyOnAck.defaultCommandId
        optInCommandId = $web.webCommandNotifyOnAck.optInCommandId
        reportFile = $WebFile
      }
      hardwareApiLive = [ordered]@{
        ok = $hardwareCloseLoopOk
        generatedAt = $hardware.generatedAt
        action = $hardware.action
        apiBaseUrl = $hardware.apiBaseUrl
        commandId = $hardware.command.data.commandId
        commandStatus = $hardware.command.data.status
        relayConclusion = if ($hardware.relay) { [string]$hardware.relay.conclusion } else { "" }
        relayPublishedCapturedAck = if ($hardware.proof) { [bool]$hardware.proof.relayPublishedCapturedAck } else { $false }
        relayCaptureBytes = if ($hardware.relay -and $hardware.relay.sinkResult -and $hardware.relay.sinkResult.capture) { [int]$hardware.relay.sinkResult.capture.bytes } else { 0 }
        relayCaptureLines = if ($hardware.relay -and $hardware.relay.sinkResult -and $hardware.relay.sinkResult.capture) { [int]$hardware.relay.sinkResult.capture.lineCount } else { 0 }
        failureClass = if ($hardware.diagnostics) { [string]$hardware.diagnostics.failureClass } else { "" }
        portOwnershipClassification = if ($hardware.diagnostics -and $hardware.diagnostics.portOwnership) { [string]$hardware.diagnostics.portOwnership.classification } else { "" }
        portOwnershipStable = if ($hardware.diagnostics -and $hardware.diagnostics.portOwnership) { [bool]$hardware.diagnostics.portOwnership.ownershipStable } else { $false }
        portOwnership = if ($hardware.diagnostics) { $hardware.diagnostics.portOwnership } else { $null }
        passiveSerialProbe = if ($hardware.diagnostics) { $hardware.diagnostics.passiveSerialProbe } else { $null }
        reportFile = $HardwareFile
        conclusion = $hardware.conclusion
      }
      hardwareApiLiveLastSuccess = if ($hardwareLastSuccess) {
        [ordered]@{
          available = $true
          generatedAt = $hardwareLastSuccess.generatedAt
          action = $hardwareLastSuccess.action
          apiBaseUrl = $hardwareLastSuccess.apiBaseUrl
          commandId = $hardwareLastSuccess.command.data.commandId
          commandStatus = $hardwareLastSuccess.command.data.status
          reportFile = $HardwareLastSuccessFile
          conclusion = $hardwareLastSuccess.conclusion
        }
      } else {
        [ordered]@{
          available = $false
          reportFile = $HardwareLastSuccessFile
        }
      }
      hardwarePassiveProbe = if ($hardwarePassiveProbe) {
        [ordered]@{
          available = $true
          generatedAt = $hardwarePassiveProbe.generatedAt
          port = $hardwarePassiveProbe.port
          anyTrafficObserved = [bool]$hardwarePassiveProbe.checks.anyTrafficObserved
          anyReadableAsciiObserved = [bool]$hardwarePassiveProbe.checks.anyReadableAsciiObserved
          likelyCause = [string]$hardwarePassiveProbe.likelyCause
          dominantClassification = if ($hardwarePassiveProbe.probes -and @($hardwarePassiveProbe.probes).Count -gt 0) { [string]@($hardwarePassiveProbe.probes)[0].classification } else { "" }
          reportFile = $HardwarePassiveProbeFile
        }
      } else {
        [ordered]@{
          available = $false
          reportFile = $HardwarePassiveProbeFile
        }
      }
    }
    allChecksOk = ($deskOk -and $webOk -and $hardwareCloseLoopOk)
    conclusion = if ($deskOk -and $webOk -and $hardwareCloseLoopOk) {
      "command-entry-stable-route-verified-across-desk-web-and-hardware-api-live"
    } elseif ($deskOk -and $webOk -and $hardwareLastSuccess) {
      "client-entry-contracts-verified-but-latest-hardware-api-live-regressed-from-last-known-good"
    } elseif ($deskOk -and $webOk) {
      "client-entry-contracts-verified-but-hardware-api-live-needs-refresh"
    } else {
      "command-entry-stable-route-needs-review"
    }
    nextUse = @(
      "Use Desk/Web only through /api/v1/devices/{deviceId}/commands for formal command entry",
      "Use run-hardware-stable-version-api-command-live.ps1 as the hardware gate before field changes",
      "Do not reopen UART route debugging while the frozen baseline remains COM5 + transparent USR + whole + 5s"
    )
  }

  $fullOutFile = Join-Path $repoRoot $OutFile
  $outDir = Split-Path -Parent $fullOutFile
  if ($outDir -and -not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir -Force | Out-Null
  }

  $json = $summary | ConvertTo-Json -Depth 8
  Set-Content -Path $fullOutFile -Value $json -Encoding UTF8
  $json

  if (-not $summary.allChecksOk) {
    throw "command-entry-stable-route check failed"
  }
} finally {
  Pop-Location
}
