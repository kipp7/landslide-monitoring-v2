[CmdletBinding()]
param(
  [string]$ContainerName = "openharmony-dev"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$containerRoot = "/tmp/lsmv2-gnss-v3-host"
$sourceHeader = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\gnss_transport_v3.h"
$sourceImplementation = Join-Path $repoRoot "firmware\rk2206-xl01\drivers\xl01\gnss_transport_v3.c"
$sourceTest = Join-Path $repoRoot "firmware\rk2206-xl01\tests\gnss_transport_v3_host_test.c"

foreach ($required in @($sourceHeader, $sourceImplementation, $sourceTest)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "Required GNSS transport source is missing: $required"
  }
}

docker inspect $ContainerName *> $null
if ($LASTEXITCODE -ne 0) {
  throw "Docker container is unavailable: $ContainerName"
}

docker exec $ContainerName mkdir -p "$containerRoot/drivers/xl01" "$containerRoot/tests"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to create the container test directory"
}

docker cp $sourceHeader "${ContainerName}:${containerRoot}/drivers/xl01/gnss_transport_v3.h"
docker cp $sourceImplementation "${ContainerName}:${containerRoot}/drivers/xl01/gnss_transport_v3.c"
docker cp $sourceTest "${ContainerName}:${containerRoot}/tests/gnss_transport_v3_host_test.c"
if ($LASTEXITCODE -ne 0) {
  throw "Failed to copy GNSS transport sources into the container"
}

$compile = @"
set -eu
cd '$containerRoot'
gcc -std=c99 -Wall -Wextra -Werror -O2 \
  drivers/xl01/gnss_transport_v3.c \
  tests/gnss_transport_v3_host_test.c \
  -o gnss_transport_v3_host_test
./gnss_transport_v3_host_test
"@

docker exec $ContainerName bash -lc $compile
if ($LASTEXITCODE -ne 0) {
  throw "GNSS transport V3 host test failed"
}
