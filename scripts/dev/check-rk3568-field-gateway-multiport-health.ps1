[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$NodeSpec,
  [string]$Host = "192.168.124.172",
  [string]$User = "linaro",
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
    [int]$TargetPort,
    [string]$ScriptText
  )

  $sshArgs = @(
    "-p", [string]$TargetPort,
    "-o", "StrictHostKeyChecking=accept-new",
    "-o", "ServerAliveInterval=15",
    "-o", "ServerAliveCountMax=3",
    "{0}@{1}" -f $TargetUser, $TargetHost,
    "bash -s --"
  )

  $ScriptText | & ssh @sshArgs
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

$rawHealth = Invoke-RemoteBash -TargetHost $Host -TargetUser $User -TargetPort $SshPort -ScriptText $remoteScript
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
  host = $Host
  healthFile = $HealthFile
  passed = $passed
  expectedNodes = $expectedNodes
  expectedPorts = $expectedPorts
  checks = $checks
  runtimeHealth = $health
} | ConvertTo-Json -Depth 8
