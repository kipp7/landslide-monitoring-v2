---
title: use-server-planned-rk3568-allowlisted-hermes-tasks
type: note
tags:
- decision
- hermes
- rk3568
- harmonyos
status: active
permalink: landslide-monitoring-v2-mainline/memory/decisions/use-server-planned-rk3568-allowlisted-hermes-tasks
---

# Decision: use-server-planned-rk3568-allowlisted-hermes-tasks

## Context

The HarmonyOS App needs conversational task dispatch, but landslide monitoring
and physical alarms are safety-sensitive. The App must keep using the existing
PostgreSQL and ClickHouse data model instead of creating a second App database.

## Decision

- Use `HarmonyOS App -> server planner and audit -> RK3568 allowlisted executor`.
- Keep the App API-only; it must not connect directly to databases, serial, or
  MQTT control topics.
- Persist conversations, messages, and tasks in existing PostgreSQL through
  `hermes_conversations`, `hermes_messages`, and `hermes_tasks`.
- Allow only `recheck`, `collect_logs`, and `generate_report` automatic tasks.
- Keep execution serial, idempotent, bounded, authenticated, user-isolated,
  and auditable.
- Block restart, network changes, threshold changes, serial writes, device
  control, and physical alarm trigger/clear requests before board dispatch.
- Keep the rule engine and confirmed human workflow as physical alarm authority.
- Use a replaceable OpenAI-compatible planner on the server. Its local system
  prompt defines the role and JSON contract, while code-level schema and policy
  validation remain authoritative. Never give the model direct board execution.
- Keep the deterministic Chinese planner as both the no-model default and the
  automatic fallback for timeout, network, HTTP, and invalid-response failures.
- Do not queue phone messages for delayed execution. Preserve failed text for
  explicit retry. Do not replay failed RK3568 tasks after the board reconnects.

## Rationale

- The server is the correct place for authentication, user isolation,
  idempotency, planning, audit, and policy enforcement.
- RK3568 can perform low-latency bounded work near the field path without
  taking over telemetry or alarms.
- A strict allowlist limits AI failures to the sidecar path and preserves
  monitoring, maps, SSE, Push, cache, and alarms.
- Reusing PostgreSQL preserves one business truth source and lets conversations
  survive App reinstall or process restart.

## Consequences

- Hermes is a safe task agent, not an unrestricted shell or device-control bot.
- Every new automatic task requires a typed contract, permission model,
  idempotency rule, resource bound, deterministic RK3568 implementation, tests,
  and rollback plan before it enters the allowlist.
- When Hermes is unavailable, original monitoring and alarm pages must continue
  independently; only the AI sidecar may fall back to a cached snapshot.
- Conversation messages record whether planning came from the model or the
  deterministic fallback, including a non-secret fallback reason for audit.

## Follow-up

- Finish the PR #349 staged production rollout and full regression.
- Measure RK3568 CPU, memory, queue latency, and main-link health during a soak.
- Select and configure the production model provider only after checking cloud
  server resources. Keep model credentials out of Git and memory notes.
