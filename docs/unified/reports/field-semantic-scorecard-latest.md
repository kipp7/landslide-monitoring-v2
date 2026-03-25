# Field Semantic Scorecard

- UpdatedAt: 2026-03-25T10:58:39Z

## Current Scorecard

| Area | Current Result | Evidence |
| --- | --- | --- |
| Docker transport matrix | pass | field-docker-mqtt-matrix-latest.json |
| Transport + governance matrix | pass | field-docker-mqtt-governance-latest.json |
| Host-run HTTP full-path | pass | field-http-full-path-latest.json |
| hf-oversized policy | hf-oversized-now-rejected-or-downgraded-before-persistence | field-hf-oversized-semantic-proof-latest.json |
| duplicate seq policy | duplicate-idempotency-guard-present | field-sequence-semantic-proofs-latest.json |
| out-of-order seq policy | ordering-guard-present | field-sequence-semantic-proofs-latest.json |
| replay seq policy | replay-guard-present | field-sequence-semantic-proofs-latest.json |
| DLQ reason mapping | pass | field-dlq-reason-proofs-latest.json |
| lf-meta merge behavior | lf-meta-merges-without-overwriting-high-frequency-state | field-lf-meta-semantic-proof-latest.json |
| Missing vs null behavior | missing-fields-preserve-state-and-null-fields-clear-only-targeted-metric | field-missing-null-semantic-proof-latest.json |
| Missing alert policy | missing-policy-now-respects-device-sensor-declaration | field-missing-alert-policy-proof-latest.json |
| Missing alert recovery | missing-alert-now-resolves-when-sensor-recovers | field-missing-alert-recovery-proof-latest.json |
| Alert notification API | missing-alert-now-produces-readable-alert-notification | field-alert-notification-proof-latest.json |
| Command timeout notification | command-timeout-now-produces-readable-command-notification | field-command-notification-proof-latest.json |
| Command failed notification | command-failed-now-produces-readable-command-notification | field-command-failed-notification-proof-latest.json |
| Command failed receipt path | command-failed-receipt-now-produces-readable-command-notification | field-command-failed-receipt-proof-latest.json |
| Command failed MQTT ingress | mqtt-command-failed-receipt-now-produces-readable-command-notification | field-command-failed-mqtt-receipt-proof-latest.json |
| Command acked default behavior | mqtt-command-acked-receipt-updates-command-and-event-without-command-notification | field-command-acked-mqtt-receipt-proof-latest.json |
| Command acked opt-in notification | command-acked-notify-on-ack-now-produces-readable-command-notification | field-command-acked-notification-proof-latest.json |
| Command acked type-default notification | command-type-default-success-notification-now-produces-readable-command-notification | field-command-success-notification-type-default-proof-latest.json |
| Command success policy config control | command-success-notification-policy-config-now-controls-runtime-behavior | field-command-success-notification-policy-config-proof-latest.json |
| Command success policy custom type | command-success-notification-policy-custom-type-now-controls-runtime-behavior | field-command-success-notification-policy-custom-type-proof-latest.json |

## Key DLQ Reasons

- hf_oversized: high_frequency_budget_exceeded
- duplicate: duplicate_seq
- out_of_order: stale_seq
- replay: stale_seq

## Current Interpretation

- The field rehearsal chain now has proof not only for transport, persistence, semantic guards, and DLQ reason mapping, but also for the first batch of user-consumable alert and command notification behaviors.
- The command receipt domain now has a layered success-notification policy: failed/timeout notify by default, acked remains silent by default, and success notifications can now be enabled by per-command override or command-type default.
- The command success-notification default table is now not only productized in system_configs, but also proven to control runtime behavior through the dedicated management API, including newly added custom command types.
- The next meaningful work should move above this layer into refining the management experience or another new business domain, not more proof of the same chain.

## Recommended Next Moves

1. Refine the existing Desk/Web management experience for the command success-notification default table instead of adding more same-layer proofs.
2. If you need another proof, prefer a user-facing/business-facing scenario rather than another transport or guard validation.
