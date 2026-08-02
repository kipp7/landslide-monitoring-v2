# RK2206 PC0 Battery Calibration

This procedure calibrates the assembled PC0 divider and ADC path independently for nodes A, B and C. It improves pack-voltage accuracy; it does not turn voltage-only state of charge into coulomb counting.

## Preconditions

- Run neutral firmware with `BATTERY_CALIBRATION_GAIN_PPM=1000000`, offset `0` and calibration quality `default-calibration`.
- Let every node run for at least one minute so the PC0 IIR filter settles.
- Keep the load stable during capture.
- Measure the same rail that feeds the divider while the RK3568 report is being collected. On the R1.3 carrier this is `VBAT_SW`: use `TP_VBAT_SW`, the switched pack terminals, or an MP1584 `IN+` measured against `GND/IN-`.
- Do not use an MP1584 `OUT+` or the PC0 pin as the pack-voltage reference. The two regulator outputs should be about 5.00 V and 3.30 V; PC0 should be about `VBAT_SW * 27 / 127` and must remain below the ADC input limit.
- Treat `3S2P / 5000 mAh` as provisional until the pack label confirms that 5000 mAh is the complete-pack capacity.

Generate a calibration file from a strict RK3568 report and the three simultaneous multimeter readings:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/new-rk2206-battery-calibration.ps1 `
  -ReportPath C:\path\to\xls1-three-node-batch-poll.json `
  -MeasuredAMv 12184 `
  -MeasuredBMv 12137 `
  -MeasuredCMv 12206 `
  -OutputPath C:\path\to\battery-calibration.json
```

When the nodes must be measured one at a time, bind each measurement to its own strict capture instead of reusing a report from another time window:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/new-rk2206-battery-calibration.ps1 `
  -ReportPathA C:\path\to\battery-A-window.json `
  -ReportPathB C:\path\to\battery-B-window.json `
  -ReportPathC C:\path\to\battery-C-window.json `
  -MeasuredAMv 12184 `
  -MeasuredBMv 12137 `
  -MeasuredCMv 12206 `
  -OutputPath C:\path\to\battery-calibration.json
```

Every per-node report must independently pass the strict gate. The output records the absolute path and SHA-256 of the report used for each node so a reading cannot silently move between capture windows.

The generator refuses reports that failed the strict communication gate, contain fewer than 30 battery samples per node, were already calibrated, lack a voltage median, or changed by more than 150 mV during capture. It uses a one-point multiplicative correction:

```text
gain_ppm = round(measured_pack_mv / reported_pack_mv * 1000000)
offset_mv = 0
```

Build all three node-specific images with that file:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/build-xl01-compact-broadcast-v2.ps1 `
  -FieldSensorMode simulated `
  -GnssRtcmInjectionMode disabled `
  -BatteryCalibrationFile C:\path\to\battery-calibration.json `
  -ArtifactDirectory C:\path\to\calibrated-firmware
```

The builder applies A/B/C independently, embeds `BATTERY_CALIBRATION_VERIFIED=1`, records each gain and offset in `manifest.json`, and copies the source calibration file into the artifact directory. Flash only the image matching the physical node label.

After flashing, repeat the strict report while measuring all three packs again. Accept the voltage calibration only when every reported median is within 60 mV of its simultaneous multimeter reading and `estimateQuality` is `field-calibrated`. Battery percentage remains an OCV estimate affected by load, temperature, chemistry and aging; do not present it as measured remaining mAh or runtime.

After the SC16IS752/RS485 parts are physically installed, create the quarantined hardware profile from a clean worktree with the same calibration file:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/prepare-xl01-rs485-hardware-preflight-release.ps1 `
  -ArtifactDirectory F:\2\openharmony\rk2206_firmware_releases\xls1_rs485_hardware_preflight_calibrated_20260802 `
  -BatteryCalibrationFile C:\path\to\battery-calibration.json
```

The hardware preflight script forces `FieldSensorMode=hardware`, RTCM injection disabled and field-calibrated A/B/C values, then runs the release safety verifier and writes `DO-NOT-FLASH-UNTIL-RS485-INSTALLED.txt`. Follow that file's power-off and first-power gates before flashing; a successful build is not permission to energize an incomplete interface.
