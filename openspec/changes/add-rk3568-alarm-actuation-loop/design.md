## Context

YX75R control has been verified from RK3568 `/dev/ttyS7` using Modbus RTU. The earlier RK2206 path should not be used for product alarm actuation because it produced valid-looking bytes but did not reliably drive the YX75R electrical interface.

Existing platform pieces already provide most of the logical loop:

- `rule-engine-worker` evaluates telemetry and inserts/publishes alert events.
- `services/api/src/routes/alerts.ts` lists, acknowledges, and resolves alerts.
- Desktop pages can consume API state and should not talk to RK3568 or serial devices directly.

## Goals

- Trigger a physical YX75R sound-light alarm when a configured deformation/tilt alert becomes active.
- Turn off or silence the alarm when an operator acknowledges/resolves the alert or when the rule engine resolves it.
- Make the desktop page visibly critical when the active alarm is present.
- Keep all serial device paths, baud rates, volume, and command policy configurable.

## Non-Goals

- Do not move YX75R control back to RK2206.
- Do not use SMS/enterprise messaging for this step.
- Do not hardcode one specific device UUID or station UUID into UI components.
- Do not let the actuator own `/dev/ttyS3`.

## Decisions

- Decision: Use alert lifecycle as the actuation trigger.
  - Reason: Rules, alert events, acknowledgement, and resolve already exist. This avoids duplicating threshold logic in the actuator or desktop.
- Decision: Add a dedicated RK3568 alarm actuator sidecar.
  - Reason: Physical serial control is a hardware side effect and should be isolated from rule evaluation, API, and desktop rendering.
- Decision: Default YX75R startup volume to a safe demo value.
  - Reason: Manual testing showed default volume `30/30` is too loud indoors, and the YX75R software volume may reset after reboot.
- Decision: Publish API-created manual alert events into the same event stream or provide an equivalent durable polling source.
  - Reason: The physical alarm must turn off when a human review resolves an alert, not only when the rule engine auto-resolves it.

## Risks / Trade-offs

- Risk: Wind speed/direction sensor shares the same RS485 bus.
  - Mitigation: Require configurable Modbus address/baud and serialize bus access in one RK3568 process.
- Risk: Alert flapping can rapidly toggle the physical alarm.
  - Mitigation: Use severity filtering, cooldown, and minimum active duration before actuation.
- Risk: Operators need to distinguish acknowledge from resolve.
  - Mitigation: `ACK` may silence the buzzer while retaining active red state; `RESOLVE` clears red state after review.

## Migration Plan

1. Add actuation status model and sidecar service in mock/dry-run mode.
2. Enable real serial on RK3568 only after `/dev/ttyS7` smoke passes.
3. Add desktop UI state driven by API response, not direct hardware access.
4. Add tilt mutation rule using existing rule DSL and configurable thresholds.

## Open Questions

- Final threshold values for tilt mutation should be tuned from field data. Initial demo thresholds can use configurable defaults.
- Confirm wind speed/direction address and baud before adding periodic polling on the same bus.
