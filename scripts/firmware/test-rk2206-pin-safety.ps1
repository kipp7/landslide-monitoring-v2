[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$firmwareRoot = Join-Path $repoRoot "firmware\rk2206-xl01"
$config = Get-Content -LiteralPath (Join-Path $firmwareRoot "config\app_config.h") -Raw
$main = Get-Content -LiteralPath (Join-Path $firmwareRoot "main\landslide_main.c") -Raw
$battery = Get-Content -LiteralPath (Join-Path $firmwareRoot "drivers\sensors\battery_monitor.c") -Raw
$simulator = Get-Content -LiteralPath (Join-Path $firmwareRoot "drivers\sensors\simulated_field_sensors.c") -Raw

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

Assert-Matches $config '(?m)^#define\s+XL01_UART_ID\s+EUART2_M1\s*$' `
  "XLS1 must stay on EUART2_M1 / PB2-PB3"
Assert-Matches $config '(?m)^#define\s+GPS_UART_ID\s+EUART0_M0\b' `
  "UM220 GNSS must stay on EUART0_M0 / PB6-PB7"
Assert-Matches $config '(?m)^#define\s+BATTERY_ADC_CHANNEL\s+0U\s*$' `
  "Battery sampling must stay on PC0 / ADC channel 0"
Assert-Matches $config '(?m)^#define\s+FIELD_SENSOR_SOURCE\s+FIELD_SENSOR_SOURCE_HARDWARE\s*$' `
  "Repository default must remain hardware so tomorrow's build cannot inherit simulation"
Assert-Matches $config '(?m)^#define\s+ENABLE_RS485_BUS\s+\(FIELD_SENSOR_SOURCE\s+==\s+FIELD_SENSOR_SOURCE_HARDWARE\)\s*$' `
  "RS485 enablement must be derived from the field sensor source"
Assert-Matches $config '(?s)#if\s+ENABLE_RS485_BUS.*?#define\s+I2C_IDX\s+EI2C0_M0' `
  "PB4-PB5 EI2C0 must remain guarded by ENABLE_RS485_BUS"

Assert-Matches $battery 'IoTAdcInit\s*\(\s*BATTERY_ADC_CHANNEL\s*\)' `
  "Battery monitor must initialize the BSP ADC route"
Assert-Matches $battery 'IoTAdcGetVal\s*\(\s*BATTERY_ADC_CHANNEL\s*,' `
  "Battery monitor must read the configured ADC channel"
Assert-NotMatches $battery '\b(?:IoTGpio|LzGpio|IoTPwm|IoTI2c|IoTUart|IoTSpi)[A-Za-z0-9_]*\s*\(' `
  "Battery monitor contains a non-ADC hardware call and could drive PC0 incorrectly"
Assert-NotMatches $simulator '\b(?:IoT|Lz)[A-Za-z0-9_]*\s*\(' `
  "Simulated field sensors must not call any hardware API"

Assert-Matches $main '(?s)#if\s+ENABLE_SIMULATED_FIELD_SENSORS\s+SimulatedFieldSensors_Read\s*\(' `
  "Simulated RS485 data must remain behind its build-time guard"
Assert-Matches $main '(?s)#if\s+ENABLE_RS485_BUS\s+if\s*\(\s*FieldRs485_Init\s*\(' `
  "RS485 initialization must remain behind ENABLE_RS485_BUS"
Assert-NotMatches $main '(?s)GPIO0_PC0.*?(?:DIR_OUT|SetOutput|SetDir)' `
  "Application source appears to configure PC0 as an output"

$adcHalPath = Join-Path $SdkRoot "device\rockchip\rk2206\adapter\hals\iot_hardware\wifiiot_lite\hal_iot_adc.c"
if (-not (Test-Path -LiteralPath $adcHalPath -PathType Leaf)) {
  throw "RK2206 ADC HAL is missing; cannot prove PC0 direction: $adcHalPath"
}
$adcHal = Get-Content -LiteralPath $adcHalPath -Raw
Assert-Matches $adcHal '(?s)\.gpio\s*=\s*GPIO0_PC0.*?\.func\s*=\s*MUX_FUNC1.*?\.dir\s*=\s*LZGPIO_DIR_IN' `
  "RK2206 BSP no longer proves ADC channel 0 configures PC0 as analog input"
Assert-Matches $adcHal 'm_adcKey\.ctrl1\.gpio\s*=\s*GPIO0_PC0\s*\+\s*id' `
  "RK2206 ADC channel-to-PC pin mapping changed"

Write-Host "PIN_SAFETY_OK XLS1=PB2/PB3 GPS=PB6/PB7 BATTERY=PC0-input RS485=PB4/PB5-hardware-only"
