---
title: field-rehearsal-phase-summary-latest
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rehearsal-phase-summary-latest
---

# Field Rehearsal Phase Summary

## Current State

- Phase: A-route software-first rehearsal
- Status: usable with a stable Docker-network success path, recovered host relay path, and recovered host Kafka access

## What Works Now

- Field telemetry sample library exists
- Sample generator exists
- Sample validator exists
- Evidence preparation exists
- Docker-network MQTT publish path is successful
- Docker-network MQTT sample matrix is successful across `hf-normal`, `hf-duplicate`, `hf-out-of-order`, `hf-replay`, `lf-meta`, `hf-oversized`
- Docker sample governance report now separates transport success from semantic budget assertions
- Docker-side API acceptance proof is successful
- Host-run HTTP full-path proof is successful through `huawei-iot-adapter -> telemetry.raw.v1 -> telemetry-writer -> ClickHouse/PostgreSQL device_state`
- `hf-oversized` semantic comparison proof is successful and now shows the sample is rejected/downgraded before persistence
- Sequence semantic proof now shows:
  - duplicate idempotency guard is present
  - out-of-order no longer overwrites latest state
  - replay no longer overwrites latest state
- DLQ reason proof now confirms:
  - `hf_oversized -> high_frequency_budget_exceeded`
  - `duplicate -> duplicate_seq`
  - `out_of_order/replay -> stale_seq`
- `lf-meta` semantic proof confirms low-frequency updates merge into `device_state` without deleting prior high-frequency tilt metrics
- missing/null semantic proof confirms:
  - omitted metrics preserve prior values
  - explicit `null` clears only the targeted metric
- missing alert policy proof confirms device sensor declaration now gates `raise_missing_alert`
- missing alert recovery proof confirms declared missing alerts resolve when the sensor resumes reporting
- alert notification proof confirms missing alerts can produce `alert_notifications` for subscribed users
- command notification proof confirms timed-out device commands can produce readable `device_command_notifications`
- command failed notification proof confirms `COMMAND_FAILED` events can produce readable `device_command_notifications`
- command failed receipt proof confirms failed command receipts can update `device_commands`, emit `COMMAND_FAILED`, and produce readable `device_command_notifications`
- command failed MQTT receipt proof confirms MQTT `cmd_ack/<device_id>` ingress can update `device_commands`, emit `COMMAND_FAILED`, and produce readable `device_command_notifications`
- command acked MQTT receipt proof confirms MQTT `cmd_ack/<device_id>` ingress can update `device_commands`, emit `COMMAND_ACKED`, and currently does not create `device_command_notifications`
- command acked notification proof confirms `notifyOnAck=true` can turn `COMMAND_ACKED` into a readable `device_command_notifications` flow
- command success-notification type default proof confirms `successNotificationPolicy=inherit` can resolve to `always_notify` through the productized `system_configs` command-type default table and produce readable `device_command_notifications`
- command success-notification policy config proof confirms the dedicated management API can change `set_config` to silent and make `COMMAND_ACKED` stop producing command notifications
- command success-notification policy custom-type proof confirms the dedicated management API can add a brand-new custom command type default and make `COMMAND_ACKED` produce command notifications for that new type
- Cleanup workflow exists and is verified
- Host-side HTTP access to `8080` / `3000` / `8123` is recovered after Docker Desktop restart + `wsl --shutdown`
- Host-side Kafka access to `127.0.0.1:9094` is recovered and can list topics
- Host-side Kafka producer path can advance `telemetry.raw.v1` offsets
- Kafka single-node consumer-group baseline is repaired (`__consumer_offsets` + replication-factor 1)
- Full-path readiness report now explicitly marks the current Docker stack boundary as `broker-and-api-selfcheck-only`

## Current Success Baseline

Recommended success path:

1. `scripts/dev/run-field-rehearsal-docker.ps1 -Sample hf-normal`
2. Check:
   - `docs/unified/reports/field-docker-mqtt-path-latest.json`
   - `docs/unified/reports/field-docker-mqtt-summary-latest.json`
3. For the current multi-sample hardening snapshot:
   - `docs/unified/reports/field-docker-mqtt-matrix-latest.json`
4. For the current transport + semantic governance snapshot:
   - `docs/unified/reports/field-docker-mqtt-governance-latest.json`
5. For the current downstream readiness boundary:
   - `docs/unified/reports/field-full-path-readiness-latest.json`
6. For the current host-run downstream full-path proof:
   - `docs/unified/reports/field-http-full-path-latest.json`
7. For the current `hf-oversized` semantic comparison proof:
   - `docs/unified/reports/field-hf-oversized-semantic-proof-latest.json`
8. For the current sequence semantic proof:
   - `docs/unified/reports/field-sequence-semantic-proofs-latest.json`
9. For the current DLQ reason proof:
   - `docs/unified/reports/field-dlq-reason-proofs-latest.json`
10. For the current `lf-meta` semantic proof:
   - `docs/unified/reports/field-lf-meta-semantic-proof-latest.json`
11. For the current missing/null semantic proof:
   - `docs/unified/reports/field-missing-null-semantic-proof-latest.json`
12. For the current missing alert policy proof:
   - `docs/unified/reports/field-missing-alert-policy-proof-latest.json`
13. For the current missing alert recovery proof:
   - `docs/unified/reports/field-missing-alert-recovery-proof-latest.json`
14. For the current alert notification proof:
   - `docs/unified/reports/field-alert-notification-proof-latest.json`
15. For the current command notification proof:
   - `docs/unified/reports/field-command-notification-proof-latest.json`
16. For the current command failed notification proof:
   - `docs/unified/reports/field-command-failed-notification-proof-latest.json`
17. For the current command failed receipt proof:
   - `docs/unified/reports/field-command-failed-receipt-proof-latest.json`
18. For the current command failed MQTT receipt proof:
   - `docs/unified/reports/field-command-failed-mqtt-receipt-proof-latest.json`
19. For the current command acked MQTT receipt proof:
   - `docs/unified/reports/field-command-acked-mqtt-receipt-proof-latest.json`
20. For the current command acked notification proof:
   - `docs/unified/reports/field-command-acked-notification-proof-latest.json`
21. For the current command success-notification type default proof:
   - `docs/unified/reports/field-command-success-notification-type-default-proof-latest.json`
22. For the current command success-notification policy config proof:
   - `docs/unified/reports/field-command-success-notification-policy-config-proof-latest.json`
23. For the current command success-notification policy custom-type proof:
   - `docs/unified/reports/field-command-success-notification-policy-custom-type-proof-latest.json`
24. For the current semantic scorecard:
   - `docs/unified/reports/field-semantic-scorecard-latest.md`

## Current Blockers

- No confirmed host-path, host-Kafka, or downstream persistence blocker remains for the current host-run HTTP full-path proof
- No confirmed transport, persistence, high-frequency budget, sequence-semantics, DLQ-reason, low-frequency merge, missing/null, missing-alert-policy, missing-alert-recovery, alert-notification, command-timeout-notification, command-failed-notification, command-failed-receipt, command-failed-mqtt-receipt, command-acked-mqtt-receipt, command-acked-notification, command-success-type-default-notification, command-success-policy-config, or command-success-policy-custom-type blocker remains in the current proof set

## Recommended Priority

### Priority 1

Keep using the Docker-network success path as the current rehearsal baseline.

### Priority 2

Keep the recovered host-path relay as a working baseline and only re-open environment governance if relay regressions return.

## Recommended Next Choices

1. Keep regression probes ready
   - Keep `scripts/dev/check-host-kafka-connectivity.ps1` as a quick regression probe
   - Keep `docs/unified/reports/field-host-kafka-consumer-path-latest.json` as the current host consumer-path truth
   - Keep host relay work closed unless `field-host-path-context` regresses

2. Continue rehearsal hardening
   - Keep new work above the base chain and current notification proofs
   - Prefer the next user-facing behavior, for example refining the existing default-table management experience or another deeper notification policy

## Current Best Entry Points

- `docs/guides/testing/field-software-rehearsal.md`
- `docs/guides/testing/field-host-path-troubleshooting.md`
- `docs/unified/reports/field-host-remediation-plan-latest.md`
- `docs/unified/reports/field-host-kafka-consumer-path-latest.json`
- `docs/unified/reports/field-docker-mqtt-matrix-latest.json`
- `docs/unified/reports/field-docker-mqtt-governance-latest.json`
- `docs/unified/reports/field-full-path-readiness-latest.json`
- `docs/unified/reports/field-http-full-path-latest.json`
- `docs/unified/reports/field-hf-oversized-semantic-proof-latest.json`
- `docs/unified/reports/field-sequence-semantic-proofs-latest.json`
- `docs/unified/reports/field-dlq-reason-proofs-latest.json`
- `docs/unified/reports/field-lf-meta-semantic-proof-latest.json`
- `docs/unified/reports/field-missing-null-semantic-proof-latest.json`
- `docs/unified/reports/field-missing-alert-policy-proof-latest.json`
- `docs/unified/reports/field-missing-alert-recovery-proof-latest.json`
- `docs/unified/reports/field-alert-notification-proof-latest.json`
- `docs/unified/reports/field-command-notification-proof-latest.json`
- `docs/unified/reports/field-command-failed-notification-proof-latest.json`
- `docs/unified/reports/field-command-failed-receipt-proof-latest.json`
- `docs/unified/reports/field-command-failed-mqtt-receipt-proof-latest.json`
- `docs/unified/reports/field-command-acked-mqtt-receipt-proof-latest.json`
- `docs/unified/reports/field-command-acked-notification-proof-latest.json`
- `docs/unified/reports/field-command-success-notification-type-default-proof-latest.json`
- `docs/unified/reports/field-command-success-notification-policy-config-proof-latest.json`
- `docs/unified/reports/field-command-success-notification-policy-custom-type-proof-latest.json`
- `docs/unified/reports/field-semantic-scorecard-latest.md`
- `docs/unified/reports/field-hardware-gateway-architecture-eval.md`