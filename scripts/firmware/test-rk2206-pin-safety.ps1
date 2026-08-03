[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony",
  [string]$FirmwareRoot = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($FirmwareRoot)) {
  $FirmwareRoot = Join-Path $repoRoot "firmware\rk2206-xl01"
}
$FirmwareRoot = (Resolve-Path -LiteralPath $FirmwareRoot).Path
$config = Get-Content -LiteralPath (Join-Path $firmwareRoot "config\app_config.h") -Raw
$main = Get-Content -LiteralPath (Join-Path $firmwareRoot "main\landslide_main.c") -Raw
$battery = Get-Content -LiteralPath (Join-Path $firmwareRoot "drivers\sensors\battery_monitor.c") -Raw
$simulator = Get-Content -LiteralPath (Join-Path $firmwareRoot "drivers\sensors\simulated_field_sensors.c") -Raw
$gnssSimulator = Get-Content -LiteralPath (Join-Path $firmwareRoot "drivers\sensors\simulated_gnss.c") -Raw
$gpsDriver = Get-Content -LiteralPath (Join-Path $firmwareRoot "drivers\sensors\gps_driver.c") -Raw
$build = Get-Content -LiteralPath (Join-Path $firmwareRoot "BUILD.gn") -Raw

function Assert-Matches {
  param([string]$Text, [string]$Pattern, [string]$Message)
  if ($Text -notmatch $Pattern) {
    throw $Message
  }
}

function Assert-NotMatches {
  param([string]$Text, [string]$Pattern, [string]$Message)
  if ($Text -match $Pattern) {
    throw $Message
  }
}

function Get-IndexedInitializerBlock {
  param(
    [string]$Text,
    [string]$Index,
    [string]$SourceName
  )

  $escapedIndex = [regex]::Escape($Index)
  $match = [regex]::Match(
    $Text,
    "(?ms)^\s*\[$escapedIndex\]\s*=\s*\{(?<body>.*?)(?=^\s*\[[A-Za-z0-9_]+\]\s*=|\z)"
  )
  if (-not $match.Success) {
    throw "$SourceName does not contain an indexed initializer for $Index"
  }
  return $match.Groups["body"].Value
}

function Assert-UartRoute {
  param(
    [string]$Hal,
    [string]$Index,
    [string]$RxPin,
    [string]$TxPin,
    [string]$Mux,
    [string]$FunctionId,
    [string]$Mode
  )

  $block = Get-IndexedInitializerBlock -Text $Hal -Index $Index -SourceName "RK2206 UART HAL"
  Assert-Matches $block "(?s)\.rx\s*=\s*\{.*?\.gpio\s*=\s*$RxPin.*?\.func\s*=\s*$Mux.*?\.dir\s*=\s*LZGPIO_DIR_KEEP" `
    "$Index RX route is no longer $RxPin/$Mux/direction-keep"
  Assert-Matches $block "(?s)\.tx\s*=\s*\{.*?\.gpio\s*=\s*$TxPin.*?\.func\s*=\s*$Mux.*?\.dir\s*=\s*LZGPIO_DIR_KEEP" `
    "$Index TX route is no longer $TxPin/$Mux/direction-keep"
  Assert-Matches $block "\.id\s*=\s*$FunctionId\s*," `
    "$Index hardware function id is no longer $FunctionId"
  Assert-Matches $block "\.mode\s*=\s*$Mode\s*," `
    "$Index hardware mode is no longer $Mode"
}

function Assert-I2cRoute {
  param([string]$Hal)

  $block = Get-IndexedInitializerBlock -Text $Hal -Index "EI2C0_M0" -SourceName "RK2206 I2C HAL"
  Assert-Matches $block '(?s)\.scl\s*=\s*\{.*?\.gpio\s*=\s*GPIO0_PB5.*?\.func\s*=\s*MUX_FUNC4.*?\.dir\s*=\s*LZGPIO_DIR_KEEP' `
    "EI2C0_M0 SCL route is no longer PB5/MUX_FUNC4/direction-keep"
  Assert-Matches $block '(?s)\.sda\s*=\s*\{.*?\.gpio\s*=\s*GPIO0_PB4.*?\.func\s*=\s*MUX_FUNC4.*?\.dir\s*=\s*LZGPIO_DIR_KEEP' `
    "EI2C0_M0 SDA route is no longer PB4/MUX_FUNC4/direction-keep"
  Assert-Matches $block '\.id\s*=\s*FUNC_ID_I2C0\s*,' `
    "EI2C0_M0 hardware function id is no longer FUNC_ID_I2C0"
  Assert-Matches $block '\.mode\s*=\s*FUNC_MODE_M0\s*,' `
    "EI2C0_M0 hardware mode is no longer FUNC_MODE_M0"
}

Assert-Matches $config '(?m)^#define\s+XL01_UART_ID\s+EUART2_M1\s*$' `
  "XLS1 must stay on EUART2_M1 / PB2-PB3"
Assert-Matches $config '(?m)^#define\s+GPS_UART_ID\s+EUART0_M0\b' `
  "UM220 GNSS must stay on EUART0_M0 / PB6-PB7"
Assert-Matches $config '(?m)^#define\s+BATTERY_ADC_CHANNEL\s+0U\s*$' `
  "Battery sampling must stay on PC0 / ADC channel 0"
Assert-Matches $config '(?m)^#define\s+BATTERY_CALIBRATION_VERIFIED\s+0\s*$' `
  "Repository default battery calibration must remain unverified"
Assert-Matches $config '(?m)^#define\s+FIELD_SENSOR_SOURCE\s+FIELD_SENSOR_SOURCE_HARDWARE\s*$' `
  "Repository default must remain hardware so tomorrow's build cannot inherit simulation"
Assert-Matches $config '(?m)^#define\s+GNSS_SOURCE\s+GNSS_SOURCE_HARDWARE\s*$' `
  "Repository default GNSS source must remain hardware"
Assert-Matches $config '(?m)^#define\s+ENABLE_GPS\s+\(GNSS_SOURCE\s+==\s+GNSS_SOURCE_HARDWARE\)\s*$' `
  "UM220 enablement must be derived from the GNSS source"
Assert-Matches $config '(?m)^#define\s+ENABLE_SIMULATED_GNSS\s+\(GNSS_SOURCE\s+==\s+GNSS_SOURCE_SIMULATED\)\s*$' `
  "Simulated GNSS enablement must be derived from the GNSS source"
Assert-Matches $config '(?s)#if\s+GNSS_RTCM_INJECTION_CAPABILITY\s*==\s*GNSS_RTCM_INJECTION_DISABLED.*?capability=DISABLED.*?#elif\s+GNSS_RTCM_INJECTION_CAPABILITY\s*==\s*GNSS_RTCM_INJECTION_PROBE.*?capability=PROBE.*?#elif\s+GNSS_RTCM_INJECTION_CAPABILITY\s*==\s*GNSS_RTCM_INJECTION_LIVE.*?capability=LIVE' `
  "RTCM boot marker must reflect the compiled capability"
Assert-Matches $config '(?m)^#define\s+ENABLE_RS485_BUS\s+\(FIELD_SENSOR_SOURCE\s+==\s+FIELD_SENSOR_SOURCE_HARDWARE\)\s*$' `
  "RS485 enablement must be derived from the field sensor source"
Assert-Matches $config '(?s)#if\s+ENABLE_RS485_BUS.*?#define\s+I2C_IDX\s+EI2C0_M0' `
  "PB4-PB5 EI2C0 must remain guarded by ENABLE_RS485_BUS"

Assert-Matches $battery 'IoTAdcInit\s*\(\s*BATTERY_ADC_CHANNEL\s*\)' `
  "Battery monitor must initialize the BSP ADC route"
Assert-Matches $battery 'IoTAdcGetVal\s*\(\s*BATTERY_ADC_CHANNEL\s*,' `
  "Battery monitor must read the configured ADC channel"
Assert-Matches $battery 'BATTERY_CALIBRATION_VERIFIED\s*\?' `
  "Battery telemetry quality must use the explicit calibration verification flag"
Assert-NotMatches $battery '\b(?:IoTGpio|LzGpio|IoTPwm|IoTI2c|IoTUart|IoTSpi)[A-Za-z0-9_]*\s*\(' `
  "Battery monitor contains a non-ADC hardware call and could drive PC0 incorrectly"
Assert-NotMatches $simulator '\b(?:IoT|Lz)[A-Za-z0-9_]*\s*\(' `
  "Simulated field sensors must not call any hardware API"
Assert-NotMatches $gnssSimulator '\b(?:IoT|Lz)[A-Za-z0-9_]*\s*\(' `
  "Simulated GNSS must not call any hardware API"
Assert-Matches $gpsDriver '(?s)#if\s+ENABLE_GPS.*?int\s+GPS_Init\s*\(' `
  "The UM220 UART implementation must remain behind ENABLE_GPS"

Assert-Matches $main '(?s)#if\s+ENABLE_SIMULATED_FIELD_SENSORS\s+SimulatedFieldSensors_Read\s*\(' `
  "Simulated RS485 data must remain behind its build-time guard"
Assert-Matches $main '(?s)#if\s+ENABLE_SIMULATED_GNSS\s+SimulatedGnss_Read\s*\(' `
  "Simulated GNSS data must remain behind its build-time guard"
Assert-Matches $main '(?s)GNSS:\s+SIMULATED.*?GNSS_RTCM_CAPABILITY_MARKER' `
  "Simulated GNSS boot summary must expose the compiled RTCM capability"
Assert-Matches $main '(?s)#if\s+ENABLE_GPS\s+if\s*\(\s*GPS_Init\s*\(' `
  "UM220 initialization must remain behind ENABLE_GPS"
Assert-Matches $main '(?s)#if\s+ENABLE_RS485_BUS\s+if\s*\(\s*FieldRs485_Init\s*\(' `
  "RS485 initialization must remain behind ENABLE_RS485_BUS"
Assert-Matches $main 'BATTERY_CALIBRATION_VERIFIED\s*\?\s*"field"\s*:\s*"default"' `
  "Battery startup status must use the explicit calibration verification flag"
Assert-NotMatches $main '(?s)GPIO0_PC0.*?(?:DIR_OUT|SetOutput|SetDir)' `
  "Application source appears to configure PC0 as an output"

$sourceMatches = [regex]::Matches($build, '(?m)^\s*"(?<path>[^"]+\.c)"\s*,?\s*$')
if ($sourceMatches.Count -eq 0) {
  throw "BUILD.gn does not contain a parseable C source set"
}
$compiledSources = @($sourceMatches | ForEach-Object { $_.Groups["path"].Value.Replace("/", "\") })
$forbiddenSources = @(
  "drivers\sensors\mpu6050_driver.c",
  "drivers\sensors\sht30_driver.c",
  "drivers\sensors\gps_module.c",
  "drivers\sensors\sensors.c"
)
foreach ($forbiddenSource in $forbiddenSources) {
  if ($compiledSources -contains $forbiddenSource) {
    throw "BUILD.gn compiles retired sensor source: $forbiddenSource"
  }
}

$reservedPinPattern = '\bGPIO0_(?:PB[2-7]|PC0)\b'
$directPeripheralPattern = '\b(?:IoTGpio|LzGpio|IoTPwm|LzPwm|IoTSpi|LzSpi)[A-Za-z0-9_]*\s*\('
foreach ($relativeSource in $compiledSources) {
  $sourcePath = Join-Path $firmwareRoot $relativeSource
  if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "BUILD.gn source is missing: $relativeSource"
  }
  $sourceText = Get-Content -LiteralPath $sourcePath -Raw
  if ($sourceText -match $reservedPinPattern -and $sourceText -match $directPeripheralPattern) {
    throw "Compiled source directly controls a reserved pin outside the BSP route: $relativeSource"
  }
}

$uartHalPath = Join-Path $SdkRoot "device\rockchip\rk2206\adapter\hals\iot_hardware\wifiiot_lite\hal_iot_uart.c"
$i2cHalPath = Join-Path $SdkRoot "device\rockchip\rk2206\adapter\hals\iot_hardware\wifiiot_lite\hal_iot_i2c.c"
$adcHalPath = Join-Path $SdkRoot "device\rockchip\rk2206\adapter\hals\iot_hardware\wifiiot_lite\hal_iot_adc.c"
foreach ($halPath in @($uartHalPath, $i2cHalPath, $adcHalPath)) {
  if (-not (Test-Path -LiteralPath $halPath -PathType Leaf)) {
    throw "Required RK2206 HAL is missing; cannot prove the production pin route: $halPath"
  }
}

$uartHal = Get-Content -LiteralPath $uartHalPath -Raw
$i2cHal = Get-Content -LiteralPath $i2cHalPath -Raw
$adcHal = Get-Content -LiteralPath $adcHalPath -Raw
Assert-UartRoute -Hal $uartHal -Index "EUART2_M1" -RxPin "GPIO0_PB2" -TxPin "GPIO0_PB3" `
  -Mux "MUX_FUNC3" -FunctionId "FUNC_ID_UART2" -Mode "FUNC_MODE_M1"
Assert-UartRoute -Hal $uartHal -Index "EUART0_M0" -RxPin "GPIO0_PB6" -TxPin "GPIO0_PB7" `
  -Mux "MUX_FUNC2" -FunctionId "FUNC_ID_UART0" -Mode "FUNC_MODE_M0"
Assert-I2cRoute -Hal $i2cHal
Assert-Matches $adcHal '(?s)\.gpio\s*=\s*GPIO0_PC0.*?\.func\s*=\s*MUX_FUNC1.*?\.dir\s*=\s*LZGPIO_DIR_IN' `
  "RK2206 BSP no longer proves ADC channel 0 configures PC0 as analog input"
Assert-Matches $adcHal 'm_adcKey\.ctrl1\.gpio\s*=\s*GPIO0_PC0\s*\+\s*id' `
  "RK2206 ADC channel-to-PC pin mapping changed"

Write-Host "PIN_SAFETY_OK sources=$($compiledSources.Count) XLS1=PB2/PB3 GNSS=PB6/PB7-hardware-only BATTERY=PC0-input RS485=PB4/PB5-hardware-only"
