# RK3568 Alarm Actuator

`rk3568-alarm-actuator` is the RK3568 local actuator service for field sound/light alarm hardware. It is intentionally separate from telemetry ingestion and gateway supervision so alarm control cannot interfere with the field data path.

## Responsibilities

- Control the configured alarm serial device.
- Provide a small local HTTP interface for alarm actions.
- Support dry-run mode for development and CI-safe checks.
- Keep alarm state and runtime logs outside Git.

## Environment

Use `.env.example` as a local template. Common variables:

- `ALARM_DRY_RUN` - set `true` for local development without hardware.
- `ALARM_SERIAL_DEVICE` - alarm serial device on RK3568.
- `ALARM_SERIAL_BAUD_RATE` - alarm serial baud rate.
- `ALARM_HTTP_HOST` / `ALARM_HTTP_PORT` - local HTTP listener.
- `ALARM_REQUIRE_ECHO` - whether serial echo validation should block actions.

## Local Development

```bash
npm install
npm run build --workspace @lsmv2/rk3568-alarm-actuator
ALARM_DRY_RUN=true node edge/rk3568-gateway/rk3568-alarm-actuator/dist/index.js
```

## RK3568 Hardware Mode

```bash
ALARM_DRY_RUN=false \
ALARM_SERIAL_DEVICE=/dev/<alarm-serial-device> \
ALARM_REQUIRE_ECHO=false \
node edge/rk3568-gateway/rk3568-alarm-actuator/dist/index.js
```

Use local environment files or systemd environment files for real deployment values. Do not commit device-specific serial mappings, hardware acceptance logs, or local credentials.
