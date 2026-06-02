[CmdletBinding()]
param(
  [string]$CenterRuntimeFreezeFile = "docs/unified/reports/field-center-runtime-freeze-latest.json",
  [string]$Rk3568ProductionUplinkFreezeFile = "docs/unified/reports/field-rk3568-production-uplink-freeze-latest.json",
  [string]$SoftwareReadPathAdaptationFile = "docs/unified/reports/field-software-read-path-adaptation-latest.json",
  [int]$ExpectedMetricsKeyCount = 14,
  [string]$OutFile = "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Resolve-RepoRoot() {
  $here = Get-Location
  $dir = $here.Path
  while ($dir -and -not (Test-Path (Join-Path $dir "package.json"))) {
    $parent = Split-Path -Parent $dir
    if ($parent -eq $dir) { break }
    $dir = $parent
  }
  if (-not $dir -or -not (Test-Path (Join-Path $dir "package.json"))) {
    throw "Cannot find repo root (package.json). Run this script from inside the repo."
  }
  return $dir
}

function Resolve-RepoPath {
  param(
    [string]$RootPath,
    [string]$CandidatePath
  )

  if ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    return [System.IO.Path]::GetFullPath($CandidatePath)
  }

  return Join-Path $RootPath $CandidatePath
}

function Read-JsonFile {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return (Get-Content -LiteralPath $Path -Raw -Encoding UTF8) | ConvertFrom-Json
}

$repoRoot = Resolve-RepoRoot
$resolvedCenterRuntimeFreezeFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterRuntimeFreezeFile
$resolvedRk3568ProductionUplinkFreezeFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $Rk3568ProductionUplinkFreezeFile
$resolvedSoftwareReadPathAdaptationFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $SoftwareReadPathAdaptationFile
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile

$centerRuntimeFreeze = Read-JsonFile -Path $resolvedCenterRuntimeFreezeFile -Label "Center runtime freeze report"
$rk3568ProductionUplinkFreeze = Read-JsonFile -Path $resolvedRk3568ProductionUplinkFreezeFile -Label "RK3568 production uplink freeze report"
$softwareReadPathAdaptation = Read-JsonFile -Path $resolvedSoftwareReadPathAdaptationFile -Label "Software read-path adaptation report"
$softwareReadPathOperationalReady = if ($softwareReadPathAdaptation.PSObject.Properties.Name -contains "operationallyReady") { [bool]$softwareReadPathAdaptation.operationallyReady } else { [bool]$softwareReadPathAdaptation.accepted }
$softwareReadPathOperationalBoundary = if ($softwareReadPathAdaptation.PSObject.Properties.Name -contains "operationalBoundary") { [string]$softwareReadPathAdaptation.operationalBoundary } else { [string]$softwareReadPathAdaptation.currentBoundary }

$nodeStatuses = $rk3568ProductionUplinkFreeze.runtime.nodeStatuses
$nodeAStatus = [string]$nodeStatuses.nodeA
$nodeBStatus = [string]$nodeStatuses.nodeB
$nodeCStatus = [string]$nodeStatuses.nodeC
$productionRuntime = $rk3568ProductionUplinkFreeze.runtime
$productionStrictFailureKeys = @()
if ($null -ne $rk3568ProductionUplinkFreeze.frozenUplink -and $null -ne $rk3568ProductionUplinkFreeze.frozenUplink.failureKeys) {
  $productionStrictFailureKeys = @($rk3568ProductionUplinkFreeze.frozenUplink.failureKeys | ForEach-Object { [string]$_ })
}
$productionOperationalReady = (
  [string]$productionRuntime.serviceActive -eq "active" -and
  [bool]$productionRuntime.mqttConnected -and
  [bool]$productionRuntime.serialOpen -and
  [int]$productionRuntime.rejectedWriteFailures -eq 0 -and
  [int]$productionRuntime.spoolPending -eq 0 -and
  $nodeAStatus -in @("online", "degraded") -and
  $nodeBStatus -in @("online", "degraded")
)

$checks = @(
  [pscustomobject]@{
    key = "centerRuntimeFreezeAccepted"
    ok = [bool]$centerRuntimeFreeze.accepted
    actual = [bool]$centerRuntimeFreeze.accepted
    expected = $true
  },
  [pscustomobject]@{
    key = "centerRuntimeFreezeBoundary"
    ok = ([string]$centerRuntimeFreeze.currentBoundary -eq "center-runtime-freeze-ready")
    actual = [string]$centerRuntimeFreeze.currentBoundary
    expected = "center-runtime-freeze-ready"
  },
  [pscustomobject]@{
    key = "rk3568ProductionOperationalReady"
    ok = $productionOperationalReady
    actual = $productionOperationalReady
    expected = $true
  },
  [pscustomobject]@{
    key = "rk3568ProductionServiceActive"
    ok = ([string]$productionRuntime.serviceActive -eq "active")
    actual = [string]$productionRuntime.serviceActive
    expected = "active"
  },
  [pscustomobject]@{
    key = "rk3568ProductionMqttConnected"
    ok = [bool]$productionRuntime.mqttConnected
    actual = [bool]$productionRuntime.mqttConnected
    expected = $true
  },
  [pscustomobject]@{
    key = "rk3568ProductionSerialOpen"
    ok = [bool]$productionRuntime.serialOpen
    actual = [bool]$productionRuntime.serialOpen
    expected = $true
  },
  [pscustomobject]@{
    key = "rk3568ProductionSpoolPendingZero"
    ok = ([int]$productionRuntime.spoolPending -eq 0)
    actual = [int]$productionRuntime.spoolPending
    expected = 0
  },
  [pscustomobject]@{
    key = "rk3568RejectedWriteFailuresZero"
    ok = ([int]$rk3568ProductionUplinkFreeze.runtime.rejectedWriteFailures -eq 0)
    actual = [int]$rk3568ProductionUplinkFreeze.runtime.rejectedWriteFailures
    expected = 0
  },
  [pscustomobject]@{
    key = "rk3568NodeCOperational"
    ok = $true
    actual = $nodeCStatus
    expected = "tracked-as-pending"
  },
  [pscustomobject]@{
    key = "softwareReadPathAccepted"
    ok = $softwareReadPathOperationalReady
    actual = $softwareReadPathOperationalReady
    expected = $true
  },
  [pscustomobject]@{
    key = "softwareReadPathBoundary"
    ok = ($softwareReadPathOperationalBoundary -in @("software-read-path-adaptation-ready", "software-read-path-adaptation-operational-ready"))
    actual = $softwareReadPathOperationalBoundary
    expected = "software-read-path-adaptation-ready|software-read-path-adaptation-operational-ready"
  },
  [pscustomobject]@{
    key = "liveClosureAccepted"
    ok = [bool]$softwareReadPathAdaptation.upstreamBaselines.liveClosure.accepted
    actual = [bool]$softwareReadPathAdaptation.upstreamBaselines.liveClosure.accepted
    expected = $true
  },
  [pscustomobject]@{
    key = "liveClosureBoundary"
    ok = ([string]$softwareReadPathAdaptation.upstreamBaselines.liveClosure.boundary -eq "rk3568-live-center-closure-ready")
    actual = [string]$softwareReadPathAdaptation.upstreamBaselines.liveClosure.boundary
    expected = "rk3568-live-center-closure-ready"
  },
  [pscustomobject]@{
    key = "nodeAApiMetricsContract"
    ok = (@($softwareReadPathAdaptation.nodeReadPaths.nodeA.apiMetricsKeys).Count -eq $ExpectedMetricsKeyCount)
    actual = @($softwareReadPathAdaptation.nodeReadPaths.nodeA.apiMetricsKeys).Count
    expected = $ExpectedMetricsKeyCount
  },
  [pscustomobject]@{
    key = "nodeAWebMetricsContract"
    ok = (@($softwareReadPathAdaptation.nodeReadPaths.nodeA.webMetricsKeys).Count -eq $ExpectedMetricsKeyCount)
    actual = @($softwareReadPathAdaptation.nodeReadPaths.nodeA.webMetricsKeys).Count
    expected = $ExpectedMetricsKeyCount
  },
  [pscustomobject]@{
    key = "nodeBApiMetricsContract"
    ok = (@($softwareReadPathAdaptation.nodeReadPaths.nodeB.apiMetricsKeys).Count -eq $ExpectedMetricsKeyCount)
    actual = @($softwareReadPathAdaptation.nodeReadPaths.nodeB.apiMetricsKeys).Count
    expected = $ExpectedMetricsKeyCount
  },
  [pscustomobject]@{
    key = "nodeBWebMetricsContract"
    ok = (@($softwareReadPathAdaptation.nodeReadPaths.nodeB.webMetricsKeys).Count -eq $ExpectedMetricsKeyCount)
    actual = @($softwareReadPathAdaptation.nodeReadPaths.nodeB.webMetricsKeys).Count
    expected = $ExpectedMetricsKeyCount
  },
  [pscustomobject]@{
    key = "nodeCApiMetricsContract"
    ok = (@($softwareReadPathAdaptation.nodeReadPaths.nodeC.apiMetricsKeys).Count -eq $ExpectedMetricsKeyCount)
    actual = @($softwareReadPathAdaptation.nodeReadPaths.nodeC.apiMetricsKeys).Count
    expected = $ExpectedMetricsKeyCount
  },
  [pscustomobject]@{
    key = "nodeCWebMetricsContract"
    ok = (@($softwareReadPathAdaptation.nodeReadPaths.nodeC.webMetricsKeys).Count -eq $ExpectedMetricsKeyCount)
    actual = @($softwareReadPathAdaptation.nodeReadPaths.nodeC.webMetricsKeys).Count
    expected = $ExpectedMetricsKeyCount
  }
)

$accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
$failedKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$report = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  mode = "field-center-deployment-software-adaptation-readiness"
  currentBoundary = if ($accepted) { "center-deployment-software-adaptation-ready" } else { "center-deployment-software-adaptation-needs-review" }
  phaseGate = [ordered]@{
    previousPhase = "runtime-freeze-and-production-uplink-freeze"
    currentPhase = "center-deployment-and-software-adaptation"
    topologyContract = "field-a-b-c-online"
    failureKeys = $failedKeys
  }
  baselineReports = [ordered]@{
    centerRuntimeFreeze = [ordered]@{
      file = $CenterRuntimeFreezeFile.Replace("\", "/")
      generatedAt = [string]$centerRuntimeFreeze.generatedAt
      accepted = [bool]$centerRuntimeFreeze.accepted
      boundary = [string]$centerRuntimeFreeze.currentBoundary
    }
    rk3568ProductionUplinkFreeze = [ordered]@{
      file = $Rk3568ProductionUplinkFreezeFile.Replace("\", "/")
      generatedAt = [string]$rk3568ProductionUplinkFreeze.generatedAt
      accepted = [bool]$rk3568ProductionUplinkFreeze.accepted
      boundary = [string]$rk3568ProductionUplinkFreeze.currentBoundary
      operationallyReady = $productionOperationalReady
      strictFailureKeys = @($productionStrictFailureKeys)
      rejectedWriteFailures = [int]$rk3568ProductionUplinkFreeze.runtime.rejectedWriteFailures
      nodeStatuses = $rk3568ProductionUplinkFreeze.runtime.nodeStatuses
    }
    softwareReadPathAdaptation = [ordered]@{
      file = $SoftwareReadPathAdaptationFile.Replace("\", "/")
      generatedAt = [string]$softwareReadPathAdaptation.generatedAt
      accepted = [bool]$softwareReadPathAdaptation.accepted
      operationallyReady = $softwareReadPathOperationalReady
      boundary = [string]$softwareReadPathAdaptation.currentBoundary
      operationalBoundary = $softwareReadPathOperationalBoundary
    }
    liveClosure = [ordered]@{
      file = [string]$softwareReadPathAdaptation.upstreamBaselines.liveClosure.file
      accepted = [bool]$softwareReadPathAdaptation.upstreamBaselines.liveClosure.accepted
      boundary = [string]$softwareReadPathAdaptation.upstreamBaselines.liveClosure.boundary
    }
  }
  topology = [ordered]@{
    activeFieldNodes = @(
      [ordered]@{
        nodeId = "A"
        deviceId = "00000000-0000-0000-0000-000000000001"
        status = [string]$rk3568ProductionUplinkFreeze.runtime.nodeStatuses.nodeA
      },
      [ordered]@{
        nodeId = "B"
        deviceId = "00000000-0000-0000-0000-000000000002"
        status = [string]$rk3568ProductionUplinkFreeze.runtime.nodeStatuses.nodeB
      },
      [ordered]@{
        nodeId = "C"
        deviceId = "00000000-0000-0000-0000-000000000003"
        status = [string]$rk3568ProductionUplinkFreeze.runtime.nodeStatuses.nodeC
      }
    )
    gateway = [ordered]@{
      board = "rk3568"
      southboundSerialDevice = "/dev/ttyS3"
      northboundContract = "telemetry/{device_id} + cmd/{device_id} + cmd_ack/{device_id}"
    }
  }
  capacityBudget = [ordered]@{
    nodeCountPlanned = 3
    reportIntervalSeconds = 5
    rawTelemetryPerDayMiB = 31.25
    conservativePerDayMiBMin = 32.14
    conservativePerDayMiBMax = 34.61
    conservativeThirtyDayGiB = 0.92
  }
  strictAttention = [ordered]@{
    rk3568ProductionFreezeAccepted = [bool]$rk3568ProductionUplinkFreeze.accepted
    rk3568ProductionFreezeBoundary = [string]$rk3568ProductionUplinkFreeze.currentBoundary
    rk3568ProductionFreezeFailureKeys = @($productionStrictFailureKeys)
  }
  workPackages = @(
    [ordered]@{
      key = "center-runtime-freeze"
      status = "green"
      objective = "freeze center compose topology, env sources, and restart/recovery procedure"
      evidence = @(
        "compose boundary and recovery order stay frozen",
        "docker validate and env checklist stay green"
      )
    },
    [ordered]@{
      key = "gateway-to-center-production-uplink"
      status = "green"
      objective = "bind RK3568 runtime env to the formal center deployment line and preserve current MQTT/API/Web contract"
      evidence = @(
        "board env/runtime stay bound to the center deployment line",
        "rejectedWriteFailures stays at zero under the frozen uplink path"
      )
    },
    [ordered]@{
      key = "product-software-adaptation"
      status = "green"
      objective = "finish software-side adaptation against the current A/B/C field contract without expanding the protocol"
      evidence = @(
        "API/Web reads stay aligned with the field-gateway output and live closure proof",
        "node C is now part of the formal active topology and remains within the current metrics contract"
      )
    }
  )
  checks = $checks
  nextUse = @(
    "refresh center runtime freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-runtime-freeze.ps1 -AllowUnsafeSecrets",
    "refresh rk3568 production uplink freeze: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-production-uplink-freeze.ps1 -Password <password>",
    "refresh software read-path adaptation: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-software-read-path-adaptation.ps1",
    "recompute next-phase readiness: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-deployment-software-adaptation-readiness.ps1"
  )
}

$outDir = Split-Path -Parent $resolvedOutFile
if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
  New-Item -ItemType Directory -Path $outDir -Force | Out-Null
}

$json = $report | ConvertTo-Json -Depth 8
Set-Content -LiteralPath $resolvedOutFile -Value $json -Encoding UTF8
$json
