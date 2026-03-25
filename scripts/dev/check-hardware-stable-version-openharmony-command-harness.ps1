$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$workspaceRoot = Split-Path -Parent $repoRoot
$hardwareRoot = Get-ChildItem -LiteralPath $workspaceRoot -Directory -Recurse -Filter "xl01_landslide_monitor_v1.0" -ErrorAction SilentlyContinue |
  Select-Object -First 1 -ExpandProperty FullName
if (-not $hardwareRoot) {
  throw "Could not locate xl01_landslide_monitor_v1.0 under $workspaceRoot"
}
$harnessRoot = Join-Path $repoRoot "scripts\dev\openharmony-harness"
$harnessC = Join-Path $harnessRoot "command_receive_harness.c"
$includeRoot = Join-Path $harnessRoot "include"
$tmpRoot = Join-Path $repoRoot ".tmp\openharmony-command-harness"
$stagedHardwareRoot = Join-Path $tmpRoot "hardware-src"
$cfgFile = Join-Path $tmpRoot ".emscripten"
$outJs = Join-Path $tmpRoot "command_receive_harness.js"
$outJson = Join-Path $repoRoot "docs\unified\reports\hardware-stable-version-openharmony-command-harness-latest.json"
$emcc = "C:\Program Files\dotnet\packs\Microsoft.NET.Runtime.Emscripten.3.1.34.Sdk.win-x64\8.0.22\tools\emscripten\emcc.bat"
$llvmRoot = "C:\Program Files\dotnet\packs\Microsoft.NET.Runtime.Emscripten.3.1.34.Sdk.win-x64\8.0.22\tools\bin"
$binaryenRoot = "C:\Program Files\dotnet\packs\Microsoft.NET.Runtime.Emscripten.3.1.34.Sdk.win-x64\8.0.22\tools"
$nodeExe = "C:\Program Files\nodejs\node.exe"

New-Item -ItemType Directory -Force -Path $tmpRoot | Out-Null
New-Item -ItemType Directory -Force -Path $stagedHardwareRoot | Out-Null

$stagedFiles = @(
  "config\app_config.h",
  "utils\fifo.h",
  "utils\fifo.c",
  "app\sensor_data.h",
  "app\device_command_parser.h",
  "app\device_command_parser.c",
  "app\device_identity.h",
  "app\device_identity.c",
  "app\command_ack_builder.h",
  "app\command_ack_builder.c",
  "drivers\xl01\xl01_driver.h",
  "drivers\xl01\xl01_driver.c"
)

foreach ($relativePath in $stagedFiles) {
  $sourcePath = Join-Path $hardwareRoot $relativePath
  $targetPath = Join-Path $stagedHardwareRoot $relativePath
  $targetDir = Split-Path -Parent $targetPath
  New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
  Copy-Item -Path $sourcePath -Destination $targetPath -Force
}

${cfgText} = @"
LLVM_ROOT = r'$llvmRoot'
NODE_JS = r'$nodeExe'
BINARYEN_ROOT = r'$binaryenRoot'
FROZEN_CACHE = False
CACHE = r'$tmpRoot\cache'
PORTS = r'$tmpRoot\ports'
COMPILER_ENGINE = NODE_JS
JS_ENGINES = [NODE_JS]
"@
[System.IO.File]::WriteAllText($cfgFile, $cfgText, [System.Text.UTF8Encoding]::new($false))

$env:EM_CONFIG = $cfgFile

$sources = @(
  $harnessC,
  (Join-Path $stagedHardwareRoot "utils\fifo.c"),
  (Join-Path $stagedHardwareRoot "app\device_command_parser.c"),
  (Join-Path $stagedHardwareRoot "app\device_identity.c"),
  (Join-Path $stagedHardwareRoot "app\command_ack_builder.c"),
  (Join-Path $stagedHardwareRoot "drivers\xl01\xl01_driver.c")
)

$args = @(
  "-I", $includeRoot,
  "-I", $stagedHardwareRoot,
  "-DEUART2_M1=2",
  "-DEUART0_M0=0",
  "-DEI2C0_M0=0",
  "-DEI2C_FRE_100K=100000",
  "-sENVIRONMENT=node",
  "-sSINGLE_FILE=1",
  "-sEXIT_RUNTIME=1",
  "-sASSERTIONS=0",
  "-o", $outJs
) + $sources

& $emcc @args
if ($LASTEXITCODE -ne 0) {
  throw "openharmony command harness compile failed (exit=$LASTEXITCODE)"
}

$output = & $nodeExe $outJs | Out-String
if ($LASTEXITCODE -ne 0) {
  throw "openharmony command harness runtime failed (exit=$LASTEXITCODE)"
}

$trimmed = $output.Trim()
Set-Content -Path $outJson -Value $trimmed -Encoding UTF8
$trimmed
