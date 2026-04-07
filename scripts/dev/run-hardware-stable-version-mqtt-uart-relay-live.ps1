[CmdletBinding()]
param(
  [string]$Sample = "",
  [string]$PayloadFile = "",
  [string]$PayloadLabel = "",
  [string]$MqttUrl = "mqtt://127.0.0.1:1883",
  [string]$Topic = "",
  [string]$Port = "COM9",
  [int]$BaudRate = 115200,
  [ValidateSet("suggested", "whole", "fixed")]
  [string]$ChunkStrategy = "whole",
  [int]$ChunkSize = 0,
  [int]$InterChunkDelayMs = 0,
  [int]$ReadAfterWriteSeconds = 20,
  [switch]$PublishCapturedAck,
  [int]$TimeoutSeconds = 60,
  [int]$PublishDelaySeconds = 3,
  [string]$OutFile = ".tmp/hardware-stable-version-mqtt-uart-relay-live-once.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = "SilentlyContinue"

function New-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Ensure-TempDirectory {
  param([string]$Path)
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function Convert-MixedJsonText {
  param(
    [string]$Raw
  )

  if (-not $Raw) {
    return $null
  }

  if (-not $Raw.Trim()) {
    return $null
  }

  $lines = @($Raw -split "`r?`n")
  $jsonStart = -1
  for ($i = $lines.Count - 1; $i -ge 0; $i--) {
    if ($lines[$i] -match '^\{') {
      $jsonStart = $i
      break
    }
  }

  $jsonText = if ($jsonStart -ge 0) {
    (($lines[$jsonStart..($lines.Count - 1)]) -join "`n").Trim()
  } else {
    $Raw.Trim()
  }

  return $jsonText | ConvertFrom-Json
}

function Start-DelayedPublishProcess {
  param(
    [string]$RepoRoot,
    [string]$InjectScript,
    [string]$MqttUrlValue,
    [string]$SampleValue,
    [string]$PayloadFileValue,
    [string]$PayloadLabelValue,
    [string]$TopicValue,
    [int]$DelaySeconds,
    [string]$StdoutPath,
    [string]$StderrPath
  )

  $runnerPath = Join-Path (Join-Path $RepoRoot ".tmp") ("hardware-stable-version-mqtt-relay-live-publish-runner-{0}.ps1" -f (Get-Date -Format "yyyyMMdd-HHmmss-fff"))
  $runnerLines = New-Object System.Collections.Generic.List[string]
  $runnerLines.Add('$ErrorActionPreference = ''Stop''')
  $runnerLines.Add('$ProgressPreference = ''SilentlyContinue''')
  $runnerLines.Add('[Console]::OutputEncoding = [System.Text.Encoding]::UTF8')
  $runnerLines.Add(("Set-Location '{0}'" -f $RepoRoot.Replace("'", "''")))
  $runnerLines.Add('$params = @{}')
  $runnerLines.Add('$params[''Mode''] = ''mqtt''')
  $runnerLines.Add(('$params[''MqttUrl''] = ''{0}''' -f $MqttUrlValue.Replace("'", "''")))
  if ($TopicValue) {
    $runnerLines.Add(('$params[''Topic''] = ''{0}''' -f $TopicValue.Replace("'", "''")))
  }
  if ($PayloadFileValue) {
    $runnerLines.Add(('$params[''PayloadFile''] = ''{0}''' -f $PayloadFileValue.Replace("'", "''")))
    if ($PayloadLabelValue) {
      $runnerLines.Add(('$params[''PayloadLabel''] = ''{0}''' -f $PayloadLabelValue.Replace("'", "''")))
    }
  } elseif ($SampleValue) {
    $runnerLines.Add(('$params[''Sample''] = ''{0}''' -f $SampleValue.Replace("'", "''")))
  } else {
    throw "Either -Sample or -PayloadFile is required."
  }
  $runnerLines.Add(("Start-Sleep -Seconds {0}" -f $DelaySeconds))
  $runnerLines.Add(("& '{0}' @params" -f $InjectScript.Replace("'", "''")))

  $runnerContent = ($runnerLines -join "`r`n") + "`r`n"
  [System.IO.File]::WriteAllText($runnerPath, $runnerContent, (New-Utf8NoBomEncoding))

  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::Unicode.GetBytes($runnerContent))

  $process = Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", $encoded) `
    -WorkingDirectory $RepoRoot `
    -RedirectStandardOutput $StdoutPath `
    -RedirectStandardError $StderrPath `
    -PassThru

  return [ordered]@{
    process = $process
    runnerPath = $runnerPath
  }
}

function Read-TextIfExists {
  param([string]$Path)
  if (Test-Path $Path) {
    return [string](Get-Content -Raw -Encoding UTF8 $Path)
  }
  return ""
}

function Read-JsonIfExists {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return $null
  }

  $raw = Get-Content -Raw -Encoding UTF8 $Path
  if (-not $raw) {
    return $null
  }

  $trimmed = $raw.Trim()
  if (-not $trimmed) {
    return $null
  }

  try {
    return $trimmed | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Get-RepoRelativePath {
  param(
    [string]$BasePath,
    [string]$TargetPath
  )

  $baseFull = [System.IO.Path]::GetFullPath($BasePath)
  $targetFull = [System.IO.Path]::GetFullPath($TargetPath)

  try {
    $baseUri = New-Object System.Uri(($baseFull.TrimEnd('\') + '\'))
    $targetUri = New-Object System.Uri($targetFull)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace('/', '/')
  } catch {
    return $targetFull.Replace('\', '/')
  }
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$injectScript = Join-Path $repoRoot "scripts/dev/inject-hardware-stable-version-command.ps1"
$relayScript = Join-Path $repoRoot "scripts/dev/start-hardware-stable-version-mqtt-uart-relay.ps1"
$tmpDir = Join-Path $repoRoot ".tmp"
Ensure-TempDirectory -Path $tmpDir

$planParams = @{
  Mode = "uart-plan"
  ChunkStrategy = $ChunkStrategy
  InterChunkDelayMs = $InterChunkDelayMs
}

if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
  $planParams["ChunkSize"] = $ChunkSize
}

if ($Topic) {
  $planParams["Topic"] = $Topic
}

if ($PayloadFile) {
  $planParams["PayloadFile"] = $PayloadFile
  if ($PayloadLabel) {
    $planParams["PayloadLabel"] = $PayloadLabel
  }
} elseif ($Sample) {
  $planParams["Sample"] = $Sample
} else {
  throw "Either -Sample or -PayloadFile is required."
}

$planProcessArgs = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", $injectScript,
  "-Mode", "uart-plan",
  "-ChunkStrategy", $ChunkStrategy,
  "-InterChunkDelayMs", $InterChunkDelayMs
)

if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) {
  $planProcessArgs += @("-ChunkSize", $ChunkSize)
}

if ($Topic) {
  $planProcessArgs += @("-Topic", $Topic)
}

if ($PayloadFile) {
  $planProcessArgs += @("-PayloadFile", $PayloadFile)
  if ($PayloadLabel) {
    $planProcessArgs += @("-PayloadLabel", $PayloadLabel)
  }
} elseif ($Sample) {
  $planProcessArgs += @("-Sample", $Sample)
}

$planRaw = & powershell.exe @planProcessArgs | Out-String
if ($LASTEXITCODE -ne 0) {
  throw "inject-hardware-stable-version-command.ps1 uart-plan failed (exit=$LASTEXITCODE)"
}

$plan = Convert-MixedJsonText -Raw $planRaw
if (-not $plan) {
  throw "Failed to build relay plan."
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$publishStdout = Join-Path $tmpDir ("hardware-stable-version-mqtt-relay-live-publish-{0}.stdout.log" -f $stamp)
$publishStderr = Join-Path $tmpDir ("hardware-stable-version-mqtt-relay-live-publish-{0}.stderr.log" -f $stamp)

$publishLaunch = $null
$relayResult = $null
try {
  $publishLaunch = Start-DelayedPublishProcess `
    -RepoRoot $repoRoot `
    -InjectScript $injectScript `
    -MqttUrlValue $MqttUrl `
    -SampleValue $Sample `
    -PayloadFileValue $PayloadFile `
    -PayloadLabelValue $PayloadLabel `
    -TopicValue ([string]$plan.topic) `
    -DelaySeconds $PublishDelaySeconds `
    -StdoutPath $publishStdout `
    -StderrPath $publishStderr

  $relayParams = @{
    MqttUrl = $MqttUrl
    Topic = [string]$plan.topic
    Sink = "uart-com"
    Port = $Port
    BaudRate = $BaudRate
    ChunkStrategy = $ChunkStrategy
    InterChunkDelayMs = $InterChunkDelayMs
    ReadAfterWriteSeconds = $ReadAfterWriteSeconds
    PublishCapturedAck = [bool]$PublishCapturedAck
    TimeoutSeconds = $TimeoutSeconds
    OutFile = $OutFile
  }

  $relayProcessArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $relayScript,
    "-MqttUrl", $MqttUrl,
    "-Topic", [string]$plan.topic,
    "-Sink", "uart-com",
    "-Port", $Port,
    "-BaudRate", $BaudRate,
    "-ChunkStrategy", $ChunkStrategy,
    "-InterChunkDelayMs", $InterChunkDelayMs,
    "-ReadAfterWriteSeconds", $ReadAfterWriteSeconds,
    "-TimeoutSeconds", $TimeoutSeconds,
    "-OutFile", $OutFile
  )

  if ($PublishCapturedAck) {
    $relayProcessArgs += @("-PublishCapturedAck")
  }

  $relayRaw = & powershell.exe @relayProcessArgs | Out-String
  if ($LASTEXITCODE -ne 0) {
    throw "start-hardware-stable-version-mqtt-uart-relay.ps1 failed (exit=$LASTEXITCODE)"
  }
  $relayResult = Convert-MixedJsonText -Raw $relayRaw
  if (-not $relayResult) {
    $relayResult = Read-JsonIfExists -Path (Join-Path $repoRoot $OutFile)
  }
} finally {
  if ($publishLaunch -and $publishLaunch.process) {
    $null = $publishLaunch.process.WaitForExit(30000)
  }
}

$publishStdoutText = Read-TextIfExists -Path $publishStdout
$publishStderrText = Read-TextIfExists -Path $publishStderr
$publishJson = $null
if ($publishStdoutText.Trim()) {
  try {
    $publishJson = $publishStdoutText | ConvertFrom-Json
  } catch {
  }
}

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  mode = "foreground-relay-with-delayed-mqtt-publish"
  mqttUrl = $MqttUrl
  port = $Port
  baudRate = $BaudRate
  topic = [string]$plan.topic
  publishDelaySeconds = $PublishDelaySeconds
  chunkStrategy = $ChunkStrategy
  chunkSize = if ($ChunkStrategy -eq "fixed" -and $ChunkSize -gt 0) { $ChunkSize } else { $null }
  interChunkDelayMs = $InterChunkDelayMs
  readAfterWriteSeconds = $ReadAfterWriteSeconds
  publishCapturedAck = [bool]$PublishCapturedAck
  timeoutSeconds = $TimeoutSeconds
  plan = $plan
  publish = [ordered]@{
    processId = if ($publishLaunch -and $publishLaunch.process) { $publishLaunch.process.Id } else { $null }
    exitCode = if ($publishLaunch -and $publishLaunch.process -and $publishLaunch.process.HasExited) { $publishLaunch.process.ExitCode } else { $null }
    runnerFile = if ($publishLaunch) { Get-RepoRelativePath -BasePath $repoRoot -TargetPath $publishLaunch.runnerPath } else { $null }
    stdoutFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $publishStdout
    stderrFile = Get-RepoRelativePath -BasePath $repoRoot -TargetPath $publishStderr
    result = $publishJson
    stdout = $publishStdoutText.Trim()
    stderr = $publishStderrText.Trim()
  }
  relay = $relayResult
}

$fullOutFile = Join-Path $repoRoot $OutFile
$outDir = Split-Path -Parent $fullOutFile
if ($outDir) {
  Ensure-TempDirectory -Path $outDir
}

$resultJson = $result | ConvertTo-Json -Depth 10
Set-Content -Path $fullOutFile -Value $resultJson -Encoding (New-Utf8NoBomEncoding)
$resultJson
