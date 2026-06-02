# Change: Add RK3568 alarm actuation loop

## Why

The field demo now has a verified YX75R sound-light alarm connected to the RK3568 onboard RS485 bus. The product needs a clean closed loop where abnormal deformation telemetry triggers both physical alarm actuation and a visible desktop critical state, then allows an operator to silence/resolve the alarm after review.

## What Changes

- Add an RK3568 alarm actuator capability that controls the YX75R on `/dev/ttyS7` without touching the existing XL01 gateway serial `/dev/ttyS3`.
- Reuse the existing rule engine and alert lifecycle instead of hardcoding tilt checks in the desktop UI.
- Add an alert-actuation bridge that turns active high/critical alerts into YX75R `alarm_on` and alert ack/resolve events into YX75R `alarm_off`.
- Ensure manual review actions are visible to the actuation path, including API-created `ALERT_ACK` and `ALERT_RESOLVE` events.
- Surface active physical alarm state in the Windows desktop monitoring/dashboard UI so abnormal pages become a clear red event state.

## Impact

- Affected specs: `field-alarm-actuation`, `desk-frontend`
- Affected code:
  - `services/rule-engine-worker/`
  - `services/api/src/routes/alerts.ts`
  - new or extended RK3568-side actuator service under `services/`
  - `apps/desk/src/views/`
  - docs and deployment env for RK3568
- Hardware boundary:
  - YX75R: RK3568 `/dev/ttyS7`, `9600 8N1`, device address `01`
  - XL01 field gateway remains on `/dev/ttyS3`
