---
title: rk3568-hermes-app-task-reliability-2026-07-23
type: note
tags:
- checkpoint
- rk3568
- hermes
- harmonyos
status: active
permalink: landslide-monitoring-v2-mainline/memory/checkpoints/rk3568-hermes-app-task-reliability-2026-07-23
---

# Checkpoint: RK3568 Hermes App Task Reliability

## Objective

Keep the App -> cloud API -> RK3568 Hermes path reliable for retries,
concurrent use, persistent conversations, and bounded automatic tasks without
changing or blocking monitoring, map, SSE, Push, cache, MQTT, serial,
telemetry, rule-engine, or physical alarm authority.

## Last Confirmed State

- PR [#348](https://github.com/kipp7/landslide-monitoring-v2/pull/348) was
  deployed and accepted as `adba15c3`; the persisted serial queue, stable
  `requestId` idempotency, capacity `16`, and
  `queued -> running -> completed/failed` behavior were proven without
  restarting or degrading protected field and alarm paths.
- PR [#349](https://github.com/kipp7/landslide-monitoring-v2/pull/349) was
  merged into public `main` on 2026-07-23 as
  `3332a19f58c42c55c6e490e7f40b7150a38475e8`.
- PR #349 adds PostgreSQL tables `hermes_conversations`, `hermes_messages`,
  and `hermes_tasks`; no App-specific business database was introduced.
- New APIs are:
  - `POST /api/v1/edge-ai/chat`
  - `GET /api/v1/edge-ai/conversations`
  - `GET /api/v1/edge-ai/conversations/{conversationId}/messages`
  - `GET /api/v1/edge-ai/tasks/{taskId}`
- Conversations and task history are isolated by authenticated user. Ordered
  multi-step tasks and context repetition such as `按刚才的再来一次` work.
- HarmonyOS renders real user/Hermes messages, server plans, task status,
  report Markdown, and expandable diagnostic evidence instead of presenting
  action logs as chat history.
- RK3568 still accepts only `recheck`, `collect_logs`, and `generate_report`.
  Diagnostics are bounded and redacted; reports are real Markdown artifacts.
- Restart, network or threshold changes, serial writes, device control, and
  physical alarm trigger/clear requests remain blocked before RK3568 is called.
- PR #349 verification passed:
  - API tests: `9`
  - RK3568/Hermes queue tests: `10`
  - targeted TypeScript ESLint
  - full PostgreSQL 16 migration
  - queued polling, multi-step tasks, context repetition, and integration tests
  - DevEco Studio 6.1 / SDK `6.1.1.125` `assembleHap`
- Latest confirmed signed HAP SHA256:
  `94B0731DD7D977C70954E1CC15281720616B94DCA8D78A7930F18C0950E94BA9`.
- The NOVA 15 Ultra runs HarmonyOS `6.1.0.125 SP10`; an installed App build
  completed a real in-App alarm test. The newest PR #349 Hermes HAP was not
  installed in the final PR session because `hdc list targets` was empty.

## In Progress

- PR #348 reliability behavior is the last production-confirmed Hermes baseline.
- PR #349 is merged and locally verified, but its PostgreSQL migration, API,
  RK3568 supervisor, and latest HAP are not yet confirmed deployed as one
  production version.
- Do not describe persistent conversations as production-live until staged
  deployment and smoke tests finish.

## Next Actions

- Confirm live server and RK3568 versions and preserve rollback points.
- Back up PostgreSQL, apply
  `docs/integrations/storage/postgres/tables/23-hermes-agent.sql`, and verify the
  three tables, constraints, and indexes.
- Deploy only required `lsmv2_api` changes and verify authentication, user
  isolation, API envelopes, and task polling.
- Locate the reachable RK3568, deploy `lsmv2-hermes-edge-supervisor`, and verify
  `/healthz`, queue persistence, artifacts permissions, resource limits, and
  main-link isolation.
- Connect the NOVA 15 Ultra through HDC and install the matching HAP.
- Run phone-originated single-task, ordered multi-task, context repetition,
  retry idempotency, restart recovery, protected-intent rejection, and full
  monitoring/alarm regression.

## Risks

- No production SSH identity was available in the PR #349 session.
- Previously known RK3568 LAN addresses were unreachable; rediscover the
  current address instead of assuming the board is offline or overloaded.
- Code merged to `main` is not proof that database, API, supervisor, and phone
  run the same build.
- A future LLM must produce a structured allowlisted plan through the server;
  direct shell, serial, MQTT control, device control, or alarm authority is
  prohibited.

## Resume Prompt

Verify live versions first, then deploy PR #349 in the order PostgreSQL
migration -> API -> RK3568 supervisor -> HAP. Prove conversation/task behavior
and monitoring/alarm isolation. Do not add unrestricted device control.
