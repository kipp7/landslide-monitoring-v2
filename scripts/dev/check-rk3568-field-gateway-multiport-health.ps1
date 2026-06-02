[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$NodeSpec,
  [string]$BoardHost = "192.168.124.179",
  [string]$User = "linaro",
  [string]$Password = "",
  [int]$SshPort = 22,
  [string]$HealthFile = "/var/lib/lsmv2/field-gateway/health/runtime-health.json",
  [switch]$AllowOffline
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Invoke-RemoteBash {
  param(
    [string]$TargetHost,
    [string]$TargetUser,
    [string]$TargetPassword,
    [int]$TargetPort,
    [string]$ScriptText
  )

  if ($TargetPassword) {
    $scriptBase64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($ScriptText))
    $pythonSnippet = @'
import base64
import sys
import paramiko

host = sys.argv[1]
user = sys.argv[2]
password = sys.argv[3]
port = int(sys.argv[4])
script = base64.b64decode(sys.argv[5]).decode("utf-8")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(hostname=host, username=user, password=password, port=port, timeout=15, banner_timeout=15, auth_timeout=15)
stdin, stdout, stderr = client.exec_command("bash -s --", timeout=120)
stdin.write(script)
stdin.flush()
stdin.channel.shutdown_write()
sys.stdout.write(stdout.read().decode("utf-8", errors="replace"))
sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
code = stdout.channel.recv_exit_status()
client.close()
raise SystemExit(code)
'@

    $pythonSnippet | & python - $TargetHost $TargetUser $TargetPassword ([string]$TargetPort) $scriptBase64
    return
  }

  $sshExe = (Get-Command ssh.exe -ErrorAction Stop).Source
  $sshArgs = @(
    "-p"
    ([string]$TargetPort)
    "-o"
    "StrictHostKeyChecking=accept-new"
    "-o"
    "ServerAliveInterval=15"
    "-o"
    "ServerAliveCountMax=3"
    ("{0}@{1}" -f $TargetUser, $TargetHost)
    "bash"
    "-s"
    "--"
  )

  $ScriptText | & $sshExe @sshArgs
}

function Convert-NodeSpecToObject {
  param([string]$Value)

  $parts = @($Value.Split('|'))
  if ($parts.Count -lt 3) {
    throw "Invalid NodeSpec '$Value'. Expected: fieldNodeId|deviceId|southboundPort|installLabel|enabled"
  }

  [guid]::Parse($parts[1].Trim()) | Out-Null

  return [ordered]@{
    fieldNodeId = $parts[0].Trim()
    deviceId = $parts[1].Trim()
    southboundPort = $parts[2].Trim()
  }
}

$expectedNodes = @($NodeSpec | ForEach-Object { Convert-NodeSpecToObject -Value $_ })
$expectedPorts = @($expectedNodes.southboundPort | Sort-Object -Unique)
$allowedStatuses = if ($AllowOffline) {
  @("configured", "online", "degraded", "offline")
} else {
  @("configured", "online", "degraded")
}

$remoteScript = @"
set -euo pipefail
cat '$HealthFile'
"@

$rawHealth = Invoke-RemoteBash -TargetHost $BoardHost -TargetUser $User -TargetPassword $Password -TargetPort $SshPort -ScriptText $remoteScript
$health = $rawHealth | ConvertFrom-Json

$checks = New-Object System.Collections.Generic.List[object]

function Add-Check {
  param(
    [string]$Name,
    [bool]$Passed,
    [object]$Detail
  )

  $checks.Add([ordered]@{
    name = $Name
    passed = $Passed
    detail = $Detail
  })
}

$routeMode = [string]$health.southbound.routeMode
Add-Check -Name "route-mode" -Passed ($routeMode -eq "configured-node-routing") -Detail $routeMode

$configuredNodes = [int]$health.southbound.configuredNodes
$configuredPorts = [int]$health.southbound.configuredPorts
Add-Check -Name "configured-nodes" -Passed ($configuredNodes -eq $expectedNodes.Count) -Detail @{
  expected = $expectedNodes.Count
  actual = $configuredNodes
}
Add-Check -Name "configured-ports" -Passed ($configuredPorts -eq $expectedPorts.Count) -Detail @{
  expected = $expectedPorts.Count
  actual = $configuredPorts
}

$runtimePorts = @($health.southbound.ports)
$runtimeNodes = @($health.southbound.nodes)

foreach ($expectedPort in $expectedPorts) {
  $matchedPort = $runtimePorts | Where-Object { $_.serialDevice -eq $expectedPort } | Select-Object -First 1
  $status = if ($matchedPort) { [string]$matchedPort.status } else { $null }
  Add-Check -Name ("port:{0}" -f $expectedPort) -Passed ($matchedPort -and $allowedStatuses -contains $status) -Detail @{
    exists = [bool]$matchedPort
    status = $status
  }
}

foreach ($expectedNode in $expectedNodes) {
  $matchedNode = $runtimeNodes | Where-Object { $_.deviceId -eq $expectedNode.deviceId } | Select-Object -First 1
  $status = if ($matchedNode) { [string]$matchedNode.status } else { $null }
  $portMatch = if ($matchedNode) { [string]$matchedNode.southboundPort -eq $expectedNode.southboundPort } else { $false }
  Add-Check -Name ("node:{0}" -f $expectedNode.deviceId) -Passed ($matchedNode -and $portMatch -and $allowedStatuses -contains $status) -Detail @{
    exists = [bool]$matchedNode
    status = $status
    expectedPort = $expectedNode.southboundPort
    actualPort = if ($matchedNode) { [string]$matchedNode.southboundPort } else { $null }
  }
}

$passed = @($checks | Where-Object { -not $_.passed }).Count -eq 0

[ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  host = $BoardHost
  healthFile = $HealthFile
  passed = $passed
  expectedNodes = $expectedNodes
  expectedPorts = $expectedPorts
  checks = $checks
  runtimeHealth = $health
} | ConvertTo-Json -Depth 8
