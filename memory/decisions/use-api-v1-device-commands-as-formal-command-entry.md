---
title: use-api-v1-device-commands-as-formal-command-entry
type: note
tags:
- decision
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/use-api-v1-device-commands-as-formal-command-entry
---

# Decision: use-api-v1-device-commands-as-formal-command-entry

## Context

The repository now has multiple command-proof layers:

- direct UART injection
- MQTT relay proof
- API live proof
- Desk and Web command clients

After the first real API close loop succeeded on `2026-04-06`, the main risk became architectural drift: operators could start treating relay/debug scripts as business entrypoints instead of the product API.

## Decision

Formal command entry is frozen to:

- `POST /api/v1/devices/{deviceId}/commands`

This applies to both:

- `Desk`
- `Web`

Hardware live scripts remain gates and diagnostics only:

- `scripts/dev/run-hardware-stable-version-api-command-live.ps1`
- `scripts/dev/check-command-entry-stable-route.ps1`

The tied field baseline stays:

- `COM5`
- transparent `USR`
- `ChunkStrategy=whole`
- `report_interval_s=5`

## Rationale

This is the best tradeoff right now because:

- `Desk` and `Web` already converge on the same API route
- a real API-entry proof already closed API state, `COMMAND_ACKED`, and command notification
- relay/UART tooling is still necessary, but only as a field gate for the same product route

## Consequences

What gets easier:

- one auditable command-creation contract
- one backend path for notify and success-notification policy behavior
- cleaner separation between product entry and field debugging

What gets harder or deferred:

- a fresh hardware gate can still fail even when `Desk` and `Web` contracts are correct
- that failure must now be treated as a field/runtime problem, not as justification for a new command side-path

Concrete example from `2026-04-07`:

- the unified route check still passed for `Desk` and `Web`
- a fresh API live rerun issued `command_id=4507a1ff-d76d-4163-a3b3-882888aeeaf7`
- the command remained `status=sent`
- relay capture stayed at `0` bytes with no ack

## Follow-up

- keep `scripts/dev/check-command-entry-stable-route.ps1` as the unified route-health gate
- before field-facing command changes, rerun the API live gate with `manual-collect`
- if the fresh gate fails with `sent + relayCaptureBytes=0`, inspect the current `COM5` field state instead of inventing a new business entry route
