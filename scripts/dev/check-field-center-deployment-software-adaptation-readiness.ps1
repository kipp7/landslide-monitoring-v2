[CmdletBinding()]
param(
  [string]$CenterComposeAcceptanceFile = "docs/unified/reports/field-center-compose-acceptance-latest.json",
  [string]$OperationalRecoveryFile = "docs/unified/reports/field-rk3568-center-operational-recovery-latest.json",
  [string]$SoakFile = "docs/unified/reports/field-rk3568-center-soak-latest.json",
  [int]$ExpectedMetricsKeyCount = 14,
  [int]$ExpectedMinimumSoakRounds = 3,
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
$resolvedCenterComposeAcceptanceFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterComposeAcceptanceFile
$resolvedOperationalRecoveryFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OperationalRecoveryFile
$resolvedSoakFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $SoakFile
$resolvedOutFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutFile

$centerCompose = Read-JsonFile -Path $resolvedCenterComposeAcceptanceFile -Label "Center compose acceptance report"
$recovery = Read-JsonFile -Path $resolvedOperationalRecoveryFile -Label "Operational recovery report"
$soak = Read-JsonFile -Path $resolvedSoakFile -Label "Soak report"

$checks = @(
  [pscustomobject]@{
    key = "centerComposeAccepted"
    ok = [bool]$centerCompose.accepted
    actual = [bool]$centerCompose.accepted
    expected = $true
  },
  [pscustomobject]@{
    key = "centerComposeBoundary"
    ok = ([string]$centerCompose.readiness.currentBoundary -eq "full-path-ready")
    actual = [string]$centerCompose.readiness.currentBoundary
    expected = "full-path-ready"
  },
  [pscustomobject]@{
    key = "centerFullProofConclusion"
    ok = ([string]$centerCompose.fullProof.conclusion -eq "real-hardware-uplink-full-path-reached-platform-and-web")
    actual = [string]$centerCompose.fullProof.conclusion
    expected = "real-hardware-uplink-full-path-reached-platform-and-web"
  },
  [pscustomobject]@{
    key = "operationalRecoveryAccepted"
    ok = [bool]$recovery.accepted
    actual = [bool]$recovery.accepted
    expected = $true
  },
  [pscustomobject]@{
    key = "operationalRecoveryBoundary"
    ok = ([string]$recovery.currentBoundary -eq "rk3568-center-operational-recovery-ready")
    actual = [string]$recovery.currentBoundary
    expected = "rk3568-center-operational-recovery-ready"
  },
  [pscustomobject]@{
    key = "operationalClosureAccepted"
    ok = [bool]$recovery.closure.accepted
    actual = [bool]$recovery.closure.accepted
    expected = $true
  },
  [pscustomobject]@{
    key = "operationalAckStatus"
    ok = ([string]$recovery.closure.ackStatus -eq "acked")
    actual = [string]$recovery.closure.ackStatus
    expected = "acked"
  },
  [pscustomobject]@{
    key = "operationalNodeAApiMetricsContract"
    ok = ([int]$recovery.closure.nodeAMetricsKeyCountApi -eq $ExpectedMetricsKeyCount)
    actual = [int]$recovery.closure.nodeAMetricsKeyCountApi
    expected = $ExpectedMetricsKeyCount
  },
  [pscustomobject]@{
    key = "operationalNodeBApiMetricsContract"
    ok = ([int]$recovery.closure.nodeBMetricsKeyCountApi -eq $ExpectedMetricsKeyCount)
    actual = [int]$recovery.closure.nodeBMetricsKeyCountApi
    expected = $ExpectedMetricsKeyCount
  },
  [pscustomobject]@{
    key = "soakAccepted"
    ok = [bool]$soak.accepted
    actual = [bool]$soak.accepted
    expected = $true
  },
  [pscustomobject]@{
    key = "soakBoundary"
    ok = ([string]$soak.currentBoundary -eq "rk3568-center-soak-ready")
    actual = [string]$soak.currentBoundary
    expected = "rk3568-center-soak-ready"
  },
  [pscustomobject]@{
    key = "soakRoundsSufficient"
    ok = ([int]$soak.rounds -ge $ExpectedMinimumSoakRounds)
    actual = [int]$soak.rounds
    expected = ">=$ExpectedMinimumSoakRounds"
  },
  [pscustomobject]@{
    key = "soakAcceptedRoundsComplete"
    ok = ([int]$soak.acceptedRounds -eq [int]$soak.rounds)
    actual = [int]$soak.acceptedRounds
    expected = [int]$soak.rounds
  },
  [pscustomobject]@{
    key = "soakCleanWindowComplete"
    ok = ([int]$soak.summary.cleanWindowRounds -eq [int]$soak.rounds)
    actual = [int]$soak.summary.cleanWindowRounds
    expected = [int]$soak.rounds
  },
  [pscustomobject]@{
    key = "soakSchemaRejectedDeltaClean"
    ok = ([int]$soak.summary.maxBoardObservationSchemaRejectedDelta -eq 0)
    actual = [int]$soak.summary.maxBoardObservationSchemaRejectedDelta
    expected = 0
  },
  [pscustomobject]@{
    key = "soakAllAcked"
    ok = [bool]$soak.summary.allAcked
    actual = [bool]$soak.summary.allAcked
    expected = $true
  },
  [pscustomobject]@{
    key = "soakAllMetricsContractStable"
    ok = [bool]$soak.summary.allMetricsContractStable
    actual = [bool]$soak.summary.allMetricsContractStable
    expected = $true
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
    previousPhase = "field-proof-and-recovery"
    currentPhase = "center-deployment-and-software-adaptation"
    nodeCBlocking = $false
    nodeCReservedDeviceId = "00000000-0000-0000-0000-000000000003"
    failureKeys = $failedKeys
  }
  baselineReports = [ordered]@{
    centerComposeAcceptance = [ordered]@{
      file = $CenterComposeAcceptanceFile.Replace("\", "/")
      generatedAt = [string]$centerCompose.generatedAt
      accepted = [bool]$centerCompose.accepted
      boundary = [string]$centerCompose.readiness.currentBoundary
    }
    operationalRecovery = [ordered]@{
      file = $OperationalRecoveryFile.Replace("\", "/")
      generatedAt = [string]$recovery.generatedAt
      accepted = [bool]$recovery.accepted
      boundary = [string]$recovery.currentBoundary
      ackStatus = [string]$recovery.closure.ackStatus
    }
    soak = [ordered]@{
      file = $SoakFile.Replace("\", "/")
      generatedAt = [string]$soak.generatedAt
      accepted = [bool]$soak.accepted
      boundary = [string]$soak.currentBoundary
      rounds = [int]$soak.rounds
      acceptedRounds = [int]$soak.acceptedRounds
    }
  }
  topology = [ordered]@{
    activeFieldNodes = @(
      [ordered]@{
        nodeId = "A"
        deviceId = "00000000-0000-0000-0000-000000000001"
      },
      [ordered]@{
        nodeId = "B"
        deviceId = "00000000-0000-0000-0000-000000000002"
      }
    )
    reservedFieldNode = [ordered]@{
      nodeId = "C"
      deviceId = "00000000-0000-0000-0000-000000000003"
      status = "reserved-not-blocking"
    }
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
  workPackages = @(
    [ordered]@{
      key = "center-runtime-freeze"
      status = "next"
      objective = "freeze center compose topology, env sources, and restart/recovery procedure"
      evidence = @(
        "ingest-service and telemetry-writer stay in compose",
        "one command can validate or re-apply center acceptance"
      )
    },
    [ordered]@{
      key = "gateway-to-center-production-uplink"
      status = "next"
      objective = "bind RK3568 runtime env to the formal center deployment line and preserve current MQTT/API/Web contract"
      evidence = @(
        "real field telemetry lands in API/Web through the compose-backed chain",
        "device A/B keep exact 14 canonical metrics"
      )
    },
    [ordered]@{
      key = "product-software-adaptation"
      status = "next"
      objective = "finish software-side adaptation against the current A/B field contract without expanding the protocol"
      evidence = @(
        "API/Web reads stay aligned with the field-gateway output",
        "node C remains a reserved capacity/config slot, not a blocker"
      )
    }
  )
  checks = $checks
  nextUse = @(
    "refresh center compose baseline: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets",
    "refresh operational recovery baseline: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
    "refresh soak baseline: powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-rk3568-center-soak.ps1 -Rounds 3 -IntervalSeconds 30 -BoardPassword <password> -AllowUnsafeSecrets",
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
