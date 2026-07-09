# RK2206 XL01 Field Firmware

This directory contains the stable RK2206 XL01 field-node firmware package used by the landslide monitoring system.

## Responsibilities

- Sensor acquisition and field-node data model.
- GPS and deformation data handling.
- Telemetry envelope construction.
- Device command parsing and command acknowledgement.
- Watchdog, FIFO, and board-level utility helpers.

## Upstream Build Context

The firmware is designed to be built inside a compatible OpenHarmony/RK2206 vendor tree. This directory contains the application package and documentation needed for that integration.

## Key Files

- `BUILD.gn` - OpenHarmony build target definition.
- `main/landslide_main.c` - field-node entrypoint.
- `app/` - telemetry, command, identity, and application models.
- `drivers/` - sensor and XL01 integration drivers.
- `config/app_config.h` - board/application constants.
- `PINOUT.md` and `RK2206_PINOUT_NOTES.zh-CN.md` - wiring and pinout references.
