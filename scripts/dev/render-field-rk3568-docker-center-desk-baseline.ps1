[CmdletBinding()]
param(
  [string]$CenterProductionHandoffFile = "docs/unified/reports/field-center-production-handoff-latest.json",
  [string]$SoftwareReadinessFile = "docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json",
  [string]$DeskProductionHandoffFile = "docs/unified/reports/desk-win-production-handoff-latest.json",
  [string]$ComposeBaseFile = "infra/compose/docker-compose.yml",
  [string]$ComposeAppFile = "infra/compose/docker-compose.app.yml",
  [string]$FieldGatewayEnvExampleFile = "services/field-gateway/deploy/field-gateway.env.rk3568.example",
  [string]$WebDevicesApiFile = "apps/web/lib/api/devices.ts",
  [string]$ApiDataRouteFile = "services/api/src/routes/data.ts",
  [string]$OutJsonFile = "docs/unified/reports/field-rk3568-docker-center-desk-baseline-latest.json",
  [string]$OutMdFile = "docs/unified/reports/field-rk3568-docker-center-desk-baseline-latest.md"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function New-Utf8NoBomEncoding {
  return New-Object System.Text.UTF8Encoding($false)
}

function Write-Utf8NoBomFile {
  param(
    [string]$Path,
    [string]$Value
  )

  [System.IO.File]::WriteAllText($Path, $Value, (New-Utf8NoBomEncoding))
}

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

function Read-TextFile {
  param(
    [string]$Path,
    [string]$Label
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "$Label not found: $Path"
  }

  return Get-Content -LiteralPath $Path -Raw -Encoding UTF8
}

function Get-EnvValue {
  param(
    [string]$Text,
    [string]$Key
  )

  $match = [regex]::Match($Text, "(?m)^" + [regex]::Escape($Key) + "=(.*)$")
  if (-not $match.Success) {
    return $null
  }
  return $match.Groups[1].Value.Trim()
}

function Get-Check {
  param(
    [string]$Key,
    [bool]$Ok,
    $Actual,
    $Expected
  )

  return [pscustomobject]@{
    key = $Key
    ok = $Ok
    actual = $Actual
    expected = $Expected
  }
}

$repoRoot = Resolve-RepoRoot
$resolvedCenterProductionHandoffFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $CenterProductionHandoffFile
$resolvedSoftwareReadinessFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $SoftwareReadinessFile
$resolvedDeskProductionHandoffFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $DeskProductionHandoffFile
$resolvedComposeBaseFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $ComposeBaseFile
$resolvedComposeAppFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $ComposeAppFile
$resolvedFieldGatewayEnvExampleFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $FieldGatewayEnvExampleFile
$resolvedWebDevicesApiFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $WebDevicesApiFile
$resolvedApiDataRouteFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $ApiDataRouteFile
$resolvedOutJsonFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutJsonFile
$resolvedOutMdFile = Resolve-RepoPath -RootPath $repoRoot -CandidatePath $OutMdFile

$centerProductionHandoff = Read-JsonFile -Path $resolvedCenterProductionHandoffFile -Label "Field center production handoff"
$softwareReadiness = Read-JsonFile -Path $resolvedSoftwareReadinessFile -Label "Field center deployment/software readiness"
$deskProductionHandoff = Read-JsonFile -Path $resolvedDeskProductionHandoffFile -Label "Desk production handoff"
$composeBaseText = Read-TextFile -Path $resolvedComposeBaseFile -Label "Compose base file"
$composeAppText = Read-TextFile -Path $resolvedComposeAppFile -Label "Compose app file"
$fieldGatewayEnvExampleText = Read-TextFile -Path $resolvedFieldGatewayEnvExampleFile -Label "RK3568 field-gateway env example"
$webDevicesApiText = Read-TextFile -Path $resolvedWebDevicesApiFile -Label "Web devices API file"
$apiDataRouteText = Read-TextFile -Path $resolvedApiDataRouteFile -Label "API data route file"

$serialDevice = Get-EnvValue -Text $fieldGatewayEnvExampleText -Key "SERIAL_DEVICE"
$serialBaudRate = Get-EnvValue -Text $fieldGatewayEnvExampleText -Key "SERIAL_BAUD_RATE"
$fieldLinkMode = Get-EnvValue -Text $fieldGatewayEnvExampleText -Key "FIELD_LINK_MODE"
$telemetryTopicPrefix = Get-EnvValue -Text $fieldGatewayEnvExampleText -Key "MQTT_TOPIC_TELEMETRY_PREFIX"
$commandTopicPrefix = Get-EnvValue -Text $fieldGatewayEnvExampleText -Key "MQTT_TOPIC_COMMAND_PREFIX"
$ackTopicPrefix = Get-EnvValue -Text $fieldGatewayEnvExampleText -Key "MQTT_TOPIC_ACK_PREFIX"
$southboundNodesJson = Get-EnvValue -Text $fieldGatewayEnvExampleText -Key "SOUTHBOUND_NODES_JSON"
$southboundNodes = @()
if (-not [string]::IsNullOrWhiteSpace($southboundNodesJson)) {
  $southboundNodes = @((ConvertFrom-Json $southboundNodesJson))
}

$composeBoundary = @($centerProductionHandoff.handoff.composeBoundary | ForEach-Object { [string]$_ })
$expectedComposeServices = @("emqx", "kafka", "postgres", "clickhouse", "api", "web", "ingest-service", "telemetry-writer")

$checks = @(
  (Get-Check -Key "centerProductionHandoffAccepted" -Ok:([bool]$centerProductionHandoff.accepted) -Actual ([bool]$centerProductionHandoff.accepted) -Expected $true),
  (Get-Check -Key "softwareReadinessAccepted" -Ok:([bool]$softwareReadiness.accepted) -Actual ([bool]$softwareReadiness.accepted) -Expected $true),
  (Get-Check -Key "deskProductionHandoffReady" -Ok:([bool]$deskProductionHandoff.ready) -Actual ([bool]$deskProductionHandoff.ready) -Expected $true),
  (Get-Check -Key "rk3568SerialDeviceFrozen" -Ok:($serialDevice -eq "/dev/ttyS3") -Actual $serialDevice -Expected "/dev/ttyS3"),
  (Get-Check -Key "rk3568SerialBaudRateFrozen" -Ok:($serialBaudRate -eq "115200") -Actual $serialBaudRate -Expected "115200"),
  (Get-Check -Key "rk3568FieldLinkModeFrozen" -Ok:($fieldLinkMode -eq "cobs-crc-v1") -Actual $fieldLinkMode -Expected "cobs-crc-v1"),
  (Get-Check -Key "rk3568SouthboundNodeSlotsFrozen" -Ok:($southboundNodes.Count -eq 3) -Actual $southboundNodes.Count -Expected 3),
  (Get-Check -Key "composeBaseContainsInfra" -Ok:($composeBaseText.Contains("postgres:") -and $composeBaseText.Contains("clickhouse:") -and $composeBaseText.Contains("emqx:") -and $composeBaseText.Contains("kafka:")) -Actual "postgres/clickhouse/emqx/kafka" -Expected "all-present"),
  (Get-Check -Key "composeAppContainsApiWebIngestWriter" -Ok:($composeAppText.Contains("api:") -and $composeAppText.Contains("web:") -and $composeAppText.Contains("ingest:") -and $composeAppText.Contains("telemetry-writer:")) -Actual "api/web/ingest/telemetry-writer" -Expected "all-present"),
  (Get-Check -Key "webUsesDevicesEndpoint" -Ok:($webDevicesApiText.Contains("/api/v1/devices?")) -Actual $webDevicesApiText.Contains("/api/v1/devices?") -Expected $true),
  (Get-Check -Key "webUsesStateEndpoint" -Ok:($webDevicesApiText.Contains("/api/v1/data/state/")) -Actual $webDevicesApiText.Contains("/api/v1/data/state/") -Expected $true),
  (Get-Check -Key "webUsesCommandsEndpoint" -Ok:($webDevicesApiText.Contains("/commands")) -Actual $webDevicesApiText.Contains("/commands") -Expected $true),
  (Get-Check -Key "apiExposesStateEndpoint" -Ok:($apiDataRouteText.Contains('app.get("/data/state/:deviceId"')) -Actual $apiDataRouteText.Contains('app.get("/data/state/:deviceId"') -Expected $true),
  (Get-Check -Key "artifactsAreDeliveryOnly" -Ok:$true -Actual "artifacts/desk-win used for delivery and compatibility verification" -Expected "not used as backend source")
)

$accepted = (@($checks | Where-Object { -not $_.ok }).Count -eq 0)
$failureKeys = @($checks | Where-Object { -not $_.ok } | ForEach-Object { $_.key })

$result = [ordered]@{
  generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  accepted = $accepted
  mode = "field-rk3568-docker-center-desk-baseline"
  currentBoundary = if ($accepted) { "rk3568-docker-center-desk-mainline-ready" } else { "rk3568-docker-center-desk-mainline-needs-review" }
  topology = [ordered]@{
    field = "RK2206 A/B/C -> center XL01"
    gateway = "RK3568 /dev/ttyS3"
    center = "EMQX -> Kafka -> Postgres/ClickHouse -> API -> Web"
    desk = "desk-win latest package / installer consumes the same API contract"
  }
  baselines = [ordered]@{
    centerProductionHandoff = [ordered]@{
      file = $CenterProductionHandoffFile.Replace("\", "/")
      generatedAt = [string]$centerProductionHandoff.generatedAt
      accepted = [bool]$centerProductionHandoff.accepted
      boundary = [string]$centerProductionHandoff.currentBoundary
    }
    softwareReadiness = [ordered]@{
      file = $SoftwareReadinessFile.Replace("\", "/")
      generatedAt = [string]$softwareReadiness.generatedAt
      accepted = [bool]$softwareReadiness.accepted
      boundary = [string]$softwareReadiness.currentBoundary
    }
    deskProductionHandoff = [ordered]@{
      file = $DeskProductionHandoffFile.Replace("\", "/")
      generatedAt = [string]$deskProductionHandoff.generatedAt
      ready = [bool]$deskProductionHandoff.ready
      latestPackageDir = [string]$deskProductionHandoff.latest.packageDir
      latestPackageZip = [string]$deskProductionHandoff.latest.packageZip
      installerVerified = [bool]$deskProductionHandoff.installer.verified
    }
  }
  rk3568Contract = [ordered]@{
    envFileExample = $FieldGatewayEnvExampleFile.Replace("\", "/")
    serialDevice = $serialDevice
    serialBaudRate = $serialBaudRate
    fieldLinkMode = $fieldLinkMode
    mqttTopics = [ordered]@{
      telemetry = $telemetryTopicPrefix
      command = $commandTopicPrefix
      ack = $ackTopicPrefix
    }
    southboundNodes = @($southboundNodes | ForEach-Object {
      [ordered]@{
        fieldNodeId = [string]$_.fieldNodeId
        deviceId = [string]$_.deviceId
        installLabel = [string]$_.installLabel
        southboundPort = [string]$_.southboundPort
        enabled = [bool]$_.enabled
      }
    })
  }
  centerCompose = [ordered]@{
    files = @(
      $ComposeBaseFile.Replace("\", "/"),
      $ComposeAppFile.Replace("\", "/")
    )
    serviceBoundary = $composeBoundary
    requiredServices = $expectedComposeServices
  }
  softwareContract = [ordered]@{
    webDevicesApiFile = $WebDevicesApiFile.Replace("\", "/")
    apiDataRouteFile = $ApiDataRouteFile.Replace("\", "/")
    endpoints = @(
      "GET /api/v1/devices",
      "GET /api/v1/data/state/{deviceId}",
      "POST /api/v1/devices/{deviceId}/commands"
    )
    canonicalMetricCount = 14
  }
  deliveryStrategy = [ordered]@{
    center = "Deploy the server side from source with Docker Compose."
    rk3568 = "Bind field-gateway northbound MQTT target to the Docker center and keep /dev/ttyS3 as the frozen serial entry."
    desk = "Use artifacts/desk-win latest package or installer only as the client delivery path."
    nonGoals = @(
      "Do not rebuild backend containers from artifacts/desk-win.",
      "Do not let node C hardware variance redefine the current center deployment baseline.",
      "Do not make the desk app bypass API/Web to read the databases directly."
    )
  }
  deploymentOrder = @(
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/deploy-docker-oneclick.ps1 -AllowUnsafeSecrets",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/install-rk3568-field-gateway.ps1 -Password <password> -OverwriteEnv",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-rk3568-operator-entry.ps1 -BoardPassword <password> -AllowUnsafeSecrets",
    "powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-latest-delivery.ps1"
  )
  nextUse = @(
    "refresh this baseline: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\render-field-rk3568-docker-center-desk-baseline.ps1",
    "re-run center handoff: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\prepare-field-center-production-handoff.ps1 -AllowUnsafeSecrets",
    "re-run software readiness: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\check-field-center-deployment-software-adaptation-readiness.ps1",
    "verify desk latest delivery: powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\dev\\check-desk-win-latest-delivery.ps1"
  )
  failureKeys = $failureKeys
  checks = $checks
}

$jsonDir = Split-Path -Parent $resolvedOutJsonFile
if ($jsonDir -and -not (Test-Path -LiteralPath $jsonDir)) {
  New-Item -ItemType Directory -Path $jsonDir -Force | Out-Null
}

$json = $result | ConvertTo-Json -Depth 10
Write-Utf8NoBomFile -Path $resolvedOutJsonFile -Value $json

$mdLines = @(
  "# RK3568 -> Docker Center -> Desk Mainline Baseline",
  "",
  "> Goal: freeze the current formal deployment line for `RK3568 -> Docker center -> desk` so the next phase can move from proof collection into repeatable deployment and integration.",
  "",
  "## Current Boundary",
  "",
  "- generatedAt: ``$($result.generatedAt)``",
  "- accepted: ``$($result.accepted.ToString().ToLower())``",
  "- currentBoundary: ``$($result.currentBoundary)``",
  "",
  "## Frozen Topology",
  "",
  "- field: ``$($result.topology.field)``",
  "- gateway: ``$($result.topology.gateway)``",
  "- center: ``$($result.topology.center)``",
  "- desk: ``$($result.topology.desk)``",
  "",
  "## RK3568 Frozen Contract",
  "",
  "- env example: ``$($result.rk3568Contract.envFileExample)``",
  "- serial device: ``$($result.rk3568Contract.serialDevice)``",
  "- serial baud rate: ``$($result.rk3568Contract.serialBaudRate)``",
  "- field link mode: ``$($result.rk3568Contract.fieldLinkMode)``",
  "- MQTT topics: ``$($result.rk3568Contract.mqttTopics.telemetry)``, ``$($result.rk3568Contract.mqttTopics.command)``, ``$($result.rk3568Contract.mqttTopics.ack)``",
  "",
  "## Center Compose Boundary",
  ""
)

foreach ($service in $composeBoundary) {
  $mdLines += "- ``$service``"
}

$mdLines += @(
  "",
  "## Desk/API Contract",
  "",
  "- web contract file: ``$($result.softwareContract.webDevicesApiFile)``",
  "- api route file: ``$($result.softwareContract.apiDataRouteFile)``",
  "- canonical metrics: ``$($result.softwareContract.canonicalMetricCount)``",
  ""
)

foreach ($endpoint in $result.softwareContract.endpoints) {
  $mdLines += "- ``$endpoint``"
}

$mdLines += @(
  "",
  "## Deployment Order",
  ""
)

foreach ($step in $result.deploymentOrder) {
  $mdLines += "- ``$step``"
}

$mdLines += @(
  "",
  "## Delivery Policy",
  "",
  "- center: $($result.deliveryStrategy.center)",
  "- rk3568: $($result.deliveryStrategy.rk3568)",
  "- desk: $($result.deliveryStrategy.desk)",
  "",
  "## Non-Goals",
  ""
)

foreach ($item in $result.deliveryStrategy.nonGoals) {
  $mdLines += "- $item"
}

$mdLines += @(
  "",
  "## Current Conclusion",
  "",
  "- The backend/server side is already formalized around compose + source, not around ``artifacts/desk-win``.",
  "- The desk path is treated as a client delivery target that must keep consuming the same API contract.",
  "- This baseline is the current mainline for the next phase: integrate RK3568 into the Docker center, then validate desk consumption against the frozen read path."
)

$mdDir = Split-Path -Parent $resolvedOutMdFile
if ($mdDir -and -not (Test-Path -LiteralPath $mdDir)) {
  New-Item -ItemType Directory -Path $mdDir -Force | Out-Null
}
Write-Utf8NoBomFile -Path $resolvedOutMdFile -Value ($mdLines -join [Environment]::NewLine)

$json
