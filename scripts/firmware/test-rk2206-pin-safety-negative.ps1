[CmdletBinding()]
param(
  [string]$SdkRoot = "F:\2\openharmony\txsmartropenharmony"
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$sourceFirmwareRoot = Join-Path $repoRoot "firmware\rk2206-xl01"
$pinSafetyScript = Join-Path $PSScriptRoot "test-rk2206-pin-safety.ps1"
$halRelativeRoot = "device\rockchip\rk2206\adapter\hals\iot_hardware\wifiiot_lite"
$temporaryRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("rk2206-pin-safety-" + [guid]::NewGuid().ToString("N"))
$temporaryFirmwareRoot = Join-Path $temporaryRoot "firmware"
$temporarySdkRoot = Join-Path $temporaryRoot "sdk"
$temporaryHalRoot = Join-Path $temporarySdkRoot $halRelativeRoot
$tempBase = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$resolvedTemporaryRoot = [System.IO.Path]::GetFullPath($temporaryRoot)
if (-not $resolvedTemporaryRoot.StartsWith($tempBase, [System.StringComparison]::OrdinalIgnoreCase) -or
    -not ([System.IO.Path]::GetFileName($resolvedTemporaryRoot).StartsWith("rk2206-pin-safety-"))) {
  throw "Refusing to use an unsafe temporary test root: $resolvedTemporaryRoot"
}

function Set-FileText {
  param([string]$Path, [string]$Text)
  [System.IO.File]::WriteAllText($Path, $Text, [System.Text.UTF8Encoding]::new($false))
}

function Invoke-ExpectedFailure {
  param(
    [string]$Name,
    [scriptblock]$Mutate,
    [string]$ExpectedMessage
  )

  Remove-Item -LiteralPath $temporaryFirmwareRoot -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temporarySdkRoot -Recurse -Force -ErrorAction SilentlyContinue
  Copy-Item -LiteralPath $sourceFirmwareRoot -Destination $temporaryFirmwareRoot -Recurse
  New-Item -ItemType Directory -Path $temporaryHalRoot -Force | Out-Null
  foreach ($halName in @("hal_iot_uart.c", "hal_iot_i2c.c", "hal_iot_adc.c")) {
    Copy-Item -LiteralPath (Join-Path (Join-Path $SdkRoot $halRelativeRoot) $halName) `
      -Destination (Join-Path $temporaryHalRoot $halName)
  }

  & $Mutate
  $output = & pwsh -NoProfile -File $pinSafetyScript -SdkRoot $temporarySdkRoot `
    -FirmwareRoot $temporaryFirmwareRoot 2>&1 | Out-String
  if ($LASTEXITCODE -eq 0) {
    throw "$Name mutation unexpectedly passed the pin-safety gate"
  }
  if ($output -notmatch [regex]::Escape($ExpectedMessage)) {
    throw "$Name failed for the wrong reason. Expected '$ExpectedMessage'. Output: $output"
  }
  Write-Host "NEGATIVE_OK $Name"
}

try {
  Invoke-ExpectedFailure -Name "wrong-uart-pin" -ExpectedMessage "EUART2_M1 RX route is no longer" -Mutate {
    $path = Join-Path $temporaryHalRoot "hal_iot_uart.c"
    Set-FileText -Path $path -Text ((Get-Content -LiteralPath $path -Raw).Replace("GPIO0_PB2", "GPIO0_PA2"))
  }

  Invoke-ExpectedFailure -Name "wrong-i2c-mux" -ExpectedMessage "EI2C0_M0 SCL route is no longer" -Mutate {
    $path = Join-Path $temporaryHalRoot "hal_iot_i2c.c"
    Set-FileText -Path $path -Text ((Get-Content -LiteralPath $path -Raw).Replace("MUX_FUNC4", "MUX_FUNC3"))
  }

  Invoke-ExpectedFailure -Name "retired-mpu6050-source" -ExpectedMessage "BUILD.gn compiles retired sensor source" -Mutate {
    $path = Join-Path $temporaryFirmwareRoot "BUILD.gn"
    $text = Get-Content -LiteralPath $path -Raw
    Set-FileText -Path $path -Text ($text.Replace(
      '        "drivers/sensors/battery_monitor.c",',
      "        `"drivers/sensors/battery_monitor.c`",`r`n        `"drivers/sensors/mpu6050_driver.c`","))
  }

  Write-Host "PIN_SAFETY_NEGATIVE_TESTS_OK cases=3"
}
finally {
  Remove-Item -LiteralPath $temporaryRoot -Recurse -Force -ErrorAction SilentlyContinue
}
