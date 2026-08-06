---
title: edge-ai-api-contract-and-cache-retry-20260806
type: decision
tags:
  - harmonyos
  - rk3568
  - hermes
  - api
  - cache
status: active
---

# Decision: Edge AI API Contract And Cache Retry

## Context

RK3568 now returns local risk-model inference, random-forest diagnosis/OOD,
resource, autonomy, safety-lease, and per-node data freshness fields. The
HarmonyOS App must consume these changes without connecting to RK3568 or
creating a second business database.

## Decision

- PostgreSQL and ClickHouse remain the only business sources of truth.
- `/api/v1/edge-ai/status` is the compatibility boundary for HarmonyOS. It
  reports `live`, `stale`, `offline`, `insufficient`, and `partial` node state,
  plus model, inference, OOD, resources, autonomy, safety, and pending-sync
  evidence.
- A risk snapshot older than 120 seconds is not reported as reachable, even if
  the RK3568 HTTP endpoint returns 200. The App may keep the last successful
  snapshot visibly marked as cached/non-live.
- `/api/v1/edge-ai/chat` accepts an App-generated `requestId`; the server stores
  it in existing `hermes_messages.metadata` JSONB and returns the existing
  conversation/task history for a retry. No new table or duplicate dispatch is
  introduced.
- HarmonyOS keeps a pending request ID through a failed send, merges retry
  responses by message/task ID, and displays that send status is unconfirmed
  rather than claiming that no task ran.
- Null resource and risk fields are valid wire values and must render as `--` or
  a waiting state, never call numeric formatting on null.

## Verification

- API edge-ai test suite: 20 passing tests.
- Targeted API lint and `git diff --check`: passed.
- Edge risk model: 6 tests; local telemetry: 3 tests; Hermes supervisor: 13
  tests; safety controller: 4 tests; ingest: 1 test; all passed.
- HarmonyOS `CompileArkTS`: passed on the synchronized ASCII-path project.
- Direct unsigned HAP packaging with DevEco `app_packing_tool.jar` and JBR 21:
  passed. Hvigor's PackageHap still requires fixing the local Java/signing
  configuration.

## Consequences

- A/B/C mixed availability is now visible instead of collapsing into “all
  offline”.
- Cached edge status remains useful during outages without being presented as
  real time.
- Repeated network retries cannot create duplicate Hermes tasks for one user
  request.
- The App remains API-only and server schema compatible.

## Follow-up

- Regenerate the expired DevEco debug certificate in Project Structure >
  Signing and install the resulting HAP in the HarmonyOS 5.0.1 emulator.
- Complete real RK3568 WAN-loss acceptance with A/B/C telemetry and alarm
  evidence before any production deployment.
