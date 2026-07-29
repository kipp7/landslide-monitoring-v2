[CmdletBinding()]
param(
  [string]$ContainerName = "openharmony-dev"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$containerRoot = "/tmp/lsmv2-gnss-v3-host"
$sourceHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\gnss_transport_v3.h"
$sourceImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\gnss_transport_v3.c"
$injectionHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\gnss_rtcm_injection.h"
$injectionImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\gnss_rtcm_injection.c"
$appConfig = Join-Path $repoRoot "firmware\rk2206-xl01\config\app_config.h"
$sourceTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\gnss_transport_v3_host_test.c"
$probeProtocolHeader = Join-Path $repoRoot "firmware\rk2206-xl01\app\gnss_probe_stats_protocol.h"
$probeProtocolImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\app\gnss_probe_stats_protocol.c"
$fieldLinkStatsHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\field_link_rx_stats.h"
$fieldLinkStatsImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\field_link_rx_stats.c"
$probeProtocolTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\gnss_probe_stats_protocol_host_test.c"
$fieldSensorsHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\field_sensors_rs485.h"
$modbusHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\rs485_modbus.h"
$sc16is752Header = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\sc16is752_driver.h"

foreach ($required in @(
  $sourceHeader, $sourceImplementation, $injectionHeader, $injectionImplementation,
  $appConfig, $sourceTest, $probeProtocolHeader, $probeProtocolImplementation,
  $fieldLinkStatsHeader, $fieldLinkStatsImplementation, $probeProtocolTest,
  $fieldSensorsHeader, $modbusHeader, $sc16is752Header
)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required GNSS transport source is missing: $required"
  }
}

docker inspect $ContainerName *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker container is unavailable: $ContainerName"
}

docker exec $ContainerName mkdir -p "$containerRoot/drivers/xl01" "$containerRoot/drivers/sensors" "$containerRoot/config" "$containerRoot/app" "$containerRoot/tests"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create the container test directory"
}

docker cp $sourceHeader "${ContainerName}:${containerRoot}/drivers/xl01/gnss_transport_v3.h"
docker cp $sourceImplementation "${ContainerName}:${containerRoot}/drivers/xl01/gnss_transport_v3.c"
docker cp $injectionHeader "${ContainerName}:${containerRoot}/drivers/xl01/gnss_rtcm_injection.h"
docker cp $injectionImplementation "${ContainerName}:${containerRoot}/drivers/xl01/gnss_rtcm_injection.c"
docker cp $appConfig "${ContainerName}:${containerRoot}/config/app_config.h"
docker cp $sourceTest "${ContainerName}:${containerRoot}/tests/gnss_transport_v3_host_test.c"
docker cp $probeProtocolHeader "${ContainerName}:${containerRoot}/app/gnss_probe_stats_protocol.h"
docker cp $probeProtocolImplementation "${ContainerName}:${containerRoot}/app/gnss_probe_stats_protocol.c"
docker cp $fieldLinkStatsHeader "${ContainerName}:${containerRoot}/drivers/xl01/field_link_rx_stats.h"
docker cp $fieldLinkStatsImplementation "${ContainerName}:${containerRoot}/drivers/xl01/field_link_rx_stats.c"
docker cp $probeProtocolTest "${ContainerName}:${containerRoot}/tests/gnss_probe_stats_protocol_host_test.c"
docker cp $fieldSensorsHeader "${ContainerName}:${containerRoot}/drivers/sensors/field_sensors_rs485.h"
docker cp $modbusHeader "${ContainerName}:${containerRoot}/drivers/sensors/rs485_modbus.h"
docker cp $sc16is752Header "${ContainerName}:${containerRoot}/drivers/sensors/sc16is752_driver.h"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy GNSS transport sources into the container"
}

$compile = @"
set -eu
cd '$containerRoot'
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  -DGNSS_RTCM_INJECTION_HOST_TEST=1 \
  -DGNSS_RTCM_INJECTION_MODE=GNSS_RTCM_INJECTION_PROBE \
  drivers/xl01/gnss_transport_v3.c \
  drivers/xl01/gnss_rtcm_injection.c \
  tests/gnss_transport_v3_host_test.c \
  -o gnss_transport_v3_host_test
./gnss_transport_v3_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  -DGNSS_RTCM_INJECTION_MODE=GNSS_RTCM_INJECTION_PROBE \
  drivers/xl01/field_link_rx_stats.c \
  app/gnss_probe_stats_protocol.c \
  tests/gnss_probe_stats_protocol_host_test.c \
  -o gnss_probe_stats_protocol_host_test
./gnss_probe_stats_protocol_host_test
"@

docker exec $ContainerName bash -lc $compile
if ($LASTEXITCODE -ne 0) {
  throw "GNSS transport V3 host test failed"
}
