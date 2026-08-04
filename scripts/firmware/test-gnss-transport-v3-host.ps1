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
$disabledInjectionTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\gnss_rtcm_disabled_host_test.c"
$probeProtocolHeader = Join-Path $repoRoot "firmware\rk2206-xl01\app\gnss_probe_stats_protocol.h"
$probeProtocolImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\app\gnss_probe_stats_protocol.c"
$fieldLinkStatsHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\field_link_rx_stats.h"
$fieldLinkStatsImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\field_link_rx_stats.c"
$probeProtocolTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\gnss_probe_stats_protocol_host_test.c"
$fieldSensorsHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\field_sensors_rs485.h"
$modbusHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\rs485_modbus.h"
$rs485DiagnosticsHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\rs485_read_diagnostics.h"
$rs485DiagnosticsTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\rs485_read_diagnostics_host_test.c"
$rs485RetryPolicyHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\rs485_read_retry_policy.h"
$rs485RetryPolicyTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\rs485_read_retry_policy_host_test.c"
$sc16is752Header = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\sc16is752_driver.h"
$sc16is752Implementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\sc16is752_driver.c"
$sc16is752CacheTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\sc16is752_uart_cache_host_test.c"
$mockIotErrnoHeader = Join-Path $repoRoot "firmware\rk2206-xl01\tests\mocks\iot_errno.h"
$mockIotI2cHeader = Join-Path $repoRoot "firmware\rk2206-xl01\tests\mocks\iot_i2c.h"
$mockLosTaskHeader = Join-Path $repoRoot "firmware\rk2206-xl01\tests\mocks\los_task.h"
$batteryEstimatorHeader = Join-Path $repoRoot "firmware\rk2206-xl01\app\battery_estimator.h"
$batteryEstimatorImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\app\battery_estimator.c"
$batteryEstimatorTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\battery_estimator_host_test.c"
$compactBuilderHeader = Join-Path $repoRoot "firmware\rk2206-xl01\app\compact_telemetry_builder.h"
$compactBuilderImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\app\compact_telemetry_builder.c"
$compactPollHeader = Join-Path $repoRoot "firmware\rk2206-xl01\app\compact_poll_command.h"
$compactPollImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\app\compact_poll_command.c"
$sensorDataHeader = Join-Path $repoRoot "firmware\rk2206-xl01\app\sensor_data.h"
$fieldLinkFrameHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\field_link_frame.h"
$fieldLinkFrameImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\field_link_frame.c"
$simulatedFieldSensorsHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\simulated_field_sensors.h"
$simulatedFieldSensorsImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\simulated_field_sensors.c"
$simulatedGnssHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\simulated_gnss.h"
$simulatedGnssImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\simulated_gnss.c"
$compactBuilderTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\compact_telemetry_builder_host_test.c"
$gnssSolutionHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\gnss_solution_parser.h"
$gnssSolutionImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\gnss_solution_parser.c"
$gnssSolutionTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\gnss_solution_parser_host_test.c"
$gpsUartProbeHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\gps_uart_probe.h"
$gpsUartProbeImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\sensors\gps_uart_probe.c"
$gpsUartProbeTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\gps_uart_probe_host_test.c"

foreach ($required in @(
  $sourceHeader, $sourceImplementation, $injectionHeader, $injectionImplementation,
  $appConfig, $sourceTest, $disabledInjectionTest, $probeProtocolHeader, $probeProtocolImplementation,
  $fieldLinkStatsHeader, $fieldLinkStatsImplementation, $probeProtocolTest,
  $fieldSensorsHeader, $modbusHeader, $rs485DiagnosticsHeader, $rs485DiagnosticsTest,
  $rs485RetryPolicyHeader, $rs485RetryPolicyTest, $sc16is752Header, $sc16is752Implementation,
  $sc16is752CacheTest, $mockIotErrnoHeader, $mockIotI2cHeader, $mockLosTaskHeader,
  $batteryEstimatorHeader, $batteryEstimatorImplementation, $batteryEstimatorTest,
  $compactBuilderHeader, $compactBuilderImplementation, $compactPollHeader,
  $compactPollImplementation, $sensorDataHeader, $fieldLinkFrameHeader,
  $fieldLinkFrameImplementation, $simulatedFieldSensorsHeader,
  $simulatedFieldSensorsImplementation, $simulatedGnssHeader,
  $simulatedGnssImplementation, $compactBuilderTest,
  $gnssSolutionHeader, $gnssSolutionImplementation, $gnssSolutionTest,
  $gpsUartProbeHeader, $gpsUartProbeImplementation, $gpsUartProbeTest
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
docker cp $disabledInjectionTest "${ContainerName}:${containerRoot}/tests/gnss_rtcm_disabled_host_test.c"
docker cp $probeProtocolHeader "${ContainerName}:${containerRoot}/app/gnss_probe_stats_protocol.h"
docker cp $probeProtocolImplementation "${ContainerName}:${containerRoot}/app/gnss_probe_stats_protocol.c"
docker cp $fieldLinkStatsHeader "${ContainerName}:${containerRoot}/drivers/xl01/field_link_rx_stats.h"
docker cp $fieldLinkStatsImplementation "${ContainerName}:${containerRoot}/drivers/xl01/field_link_rx_stats.c"
docker cp $probeProtocolTest "${ContainerName}:${containerRoot}/tests/gnss_probe_stats_protocol_host_test.c"
docker cp $fieldSensorsHeader "${ContainerName}:${containerRoot}/drivers/sensors/field_sensors_rs485.h"
docker cp $modbusHeader "${ContainerName}:${containerRoot}/drivers/sensors/rs485_modbus.h"
docker cp $rs485DiagnosticsHeader "${ContainerName}:${containerRoot}/drivers/sensors/rs485_read_diagnostics.h"
docker cp $rs485DiagnosticsTest "${ContainerName}:${containerRoot}/tests/rs485_read_diagnostics_host_test.c"
docker cp $rs485RetryPolicyHeader "${ContainerName}:${containerRoot}/drivers/sensors/rs485_read_retry_policy.h"
docker cp $rs485RetryPolicyTest "${ContainerName}:${containerRoot}/tests/rs485_read_retry_policy_host_test.c"
docker cp $sc16is752Header "${ContainerName}:${containerRoot}/drivers/sensors/sc16is752_driver.h"
docker cp $sc16is752Implementation "${ContainerName}:${containerRoot}/drivers/sensors/sc16is752_driver.c"
docker exec $ContainerName mkdir -p "${containerRoot}/tests/mocks"
docker cp $sc16is752CacheTest "${ContainerName}:${containerRoot}/tests/sc16is752_uart_cache_host_test.c"
docker cp $mockIotErrnoHeader "${ContainerName}:${containerRoot}/tests/mocks/iot_errno.h"
docker cp $mockIotI2cHeader "${ContainerName}:${containerRoot}/tests/mocks/iot_i2c.h"
docker cp $mockLosTaskHeader "${ContainerName}:${containerRoot}/tests/mocks/los_task.h"
docker cp $batteryEstimatorHeader "${ContainerName}:${containerRoot}/app/battery_estimator.h"
docker cp $batteryEstimatorImplementation "${ContainerName}:${containerRoot}/app/battery_estimator.c"
docker cp $batteryEstimatorTest "${ContainerName}:${containerRoot}/tests/battery_estimator_host_test.c"
docker cp $compactBuilderHeader "${ContainerName}:${containerRoot}/app/compact_telemetry_builder.h"
docker cp $compactBuilderImplementation "${ContainerName}:${containerRoot}/app/compact_telemetry_builder.c"
docker cp $compactPollHeader "${ContainerName}:${containerRoot}/app/compact_poll_command.h"
docker cp $compactPollImplementation "${ContainerName}:${containerRoot}/app/compact_poll_command.c"
docker cp $sensorDataHeader "${ContainerName}:${containerRoot}/app/sensor_data.h"
docker cp $fieldLinkFrameHeader "${ContainerName}:${containerRoot}/drivers/xl01/field_link_frame.h"
docker cp $fieldLinkFrameImplementation "${ContainerName}:${containerRoot}/drivers/xl01/field_link_frame.c"
docker cp $simulatedFieldSensorsHeader "${ContainerName}:${containerRoot}/drivers/sensors/simulated_field_sensors.h"
docker cp $simulatedFieldSensorsImplementation "${ContainerName}:${containerRoot}/drivers/sensors/simulated_field_sensors.c"
docker cp $simulatedGnssHeader "${ContainerName}:${containerRoot}/drivers/sensors/simulated_gnss.h"
docker cp $simulatedGnssImplementation "${ContainerName}:${containerRoot}/drivers/sensors/simulated_gnss.c"
docker cp $compactBuilderTest "${ContainerName}:${containerRoot}/tests/compact_telemetry_builder_host_test.c"
docker cp $gnssSolutionHeader "${ContainerName}:${containerRoot}/drivers/sensors/gnss_solution_parser.h"
docker cp $gnssSolutionImplementation "${ContainerName}:${containerRoot}/drivers/sensors/gnss_solution_parser.c"
docker cp $gnssSolutionTest "${ContainerName}:${containerRoot}/tests/gnss_solution_parser_host_test.c"
docker cp $gpsUartProbeHeader "${ContainerName}:${containerRoot}/drivers/sensors/gps_uart_probe.h"
docker cp $gpsUartProbeImplementation "${ContainerName}:${containerRoot}/drivers/sensors/gps_uart_probe.c"
docker cp $gpsUartProbeTest "${ContainerName}:${containerRoot}/tests/gps_uart_probe_host_test.c"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy GNSS transport sources into the container"
}

$compile = @"
set -eu
cd '$containerRoot'
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  -DGNSS_RTCM_INJECTION_HOST_TEST=1 \
  -DGNSS_RTCM_INJECTION_CAPABILITY=GNSS_RTCM_INJECTION_LIVE \
  drivers/xl01/gnss_transport_v3.c \
  drivers/xl01/gnss_rtcm_injection.c \
  tests/gnss_transport_v3_host_test.c \
  -o gnss_transport_v3_host_test
./gnss_transport_v3_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  -DGNSS_RTCM_INJECTION_HOST_TEST=1 \
  -DGNSS_SOURCE=GNSS_SOURCE_SIMULATED \
  -DGNSS_RTCM_INJECTION_MODE=GNSS_RTCM_INJECTION_DISABLED \
  -DGNSS_RTCM_INJECTION_CAPABILITY=GNSS_RTCM_INJECTION_DISABLED \
  drivers/xl01/gnss_rtcm_injection.c \
  tests/gnss_rtcm_disabled_host_test.c \
  -o gnss_rtcm_disabled_host_test
./gnss_rtcm_disabled_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  -DGNSS_RTCM_INJECTION_MODE=GNSS_RTCM_INJECTION_PROBE \
  drivers/xl01/field_link_rx_stats.c \
  drivers/xl01/field_link_frame.c \
  app/gnss_probe_stats_protocol.c \
  tests/gnss_probe_stats_protocol_host_test.c \
  -o gnss_probe_stats_protocol_host_test
./gnss_probe_stats_protocol_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  tests/rs485_read_retry_policy_host_test.c \
  -o rs485_read_retry_policy_host_test
./rs485_read_retry_policy_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  tests/rs485_read_diagnostics_host_test.c \
  -o rs485_read_diagnostics_host_test
./rs485_read_diagnostics_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 -Itests/mocks \
  drivers/sensors/sc16is752_driver.c \
  tests/sc16is752_uart_cache_host_test.c \
  -o sc16is752_uart_cache_host_test
./sc16is752_uart_cache_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  app/battery_estimator.c \
  tests/battery_estimator_host_test.c \
  -o battery_estimator_host_test
./battery_estimator_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  app/compact_telemetry_builder.c \
  app/compact_poll_command.c \
  drivers/xl01/field_link_frame.c \
  drivers/sensors/simulated_field_sensors.c \
  drivers/sensors/simulated_gnss.c \
  tests/compact_telemetry_builder_host_test.c \
  -o compact_telemetry_builder_host_test
./compact_telemetry_builder_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  drivers/sensors/gnss_solution_parser.c \
  tests/gnss_solution_parser_host_test.c \
  -o gnss_solution_parser_host_test
./gnss_solution_parser_host_test
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  drivers/sensors/gps_uart_probe.c \
  tests/gps_uart_probe_host_test.c \
  -o gps_uart_probe_host_test
./gps_uart_probe_host_test
"@

docker exec $ContainerName bash -lc $compile
if ($LASTEXITCODE -ne 0) {
  throw "GNSS transport V3 host test failed"
}
