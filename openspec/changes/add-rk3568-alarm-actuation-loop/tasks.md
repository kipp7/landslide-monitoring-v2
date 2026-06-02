## 1. Specification And Configuration

- [x] 1.1 Define RK3568 alarm actuator env contract: serial device, baud, Modbus address, demo volume, dry-run flag.
- [x] 1.2 Define alarm policy: severity filter, ack behavior, resolve behavior, cooldown, and minimum active duration.

## 2. Backend Event Loop

- [x] 2.1 Ensure API-created `ALERT_ACK` and `ALERT_RESOLVE` events reach the same actuation source as rule-engine events.
- [x] 2.2 Add or extend a sidecar service that consumes alert lifecycle state and produces actuator commands.
- [ ] 2.3 Persist actuator state/result so API can report whether the physical alarm is armed, active, silenced, failed, or stale.
- [x] 2.4 Add a tilt mutation alert rule seed using existing telemetry fields such as `tilt_x_deg`, `tilt_y_deg`, and `tilt_z_deg`.

## 3. RK3568 Actuator

- [x] 3.1 Implement YX75R Modbus RTU commands for volume initialization, alarm on, alarm off, and status query.
- [x] 3.2 Guard `/dev/ttyS7` access with a single writer and never touch `/dev/ttyS3`.
- [x] 3.3 Add RK3568 deployment/env example and systemd notes.
- [x] 3.4 Smoke-test on RK3568 with dry-run and real serial modes.

## 4. Desktop Product UI

- [x] 4.1 Add active physical alarm state to existing API client types.
- [x] 4.2 Update monitoring/dashboard surfaces to show a red critical event state when an active unsilenced alarm exists.
- [x] 4.3 Add review actions using existing alert ack/resolve endpoints; `ack` silences, `resolve` clears after review.
- [x] 4.4 Avoid hardcoded station/node names; derive display labels from region/device identity data.

## 5. Verification And Records

- [x] 5.1 Add a mock end-to-end replay: tilt anomaly -> alert active -> actuator command queued -> UI red state.
- [ ] 5.2 Add RK3568 hardware smoke evidence: alarm on/off on `/dev/ttyS7`.
- [x] 5.3 Update journal and memory references with final results.
