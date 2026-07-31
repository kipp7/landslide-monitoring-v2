---
title: deploy-harmonyos-hermes-persistent-conversations
type: note
tags:
- task
- hermes
- harmonyos
- deployment
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/deploy-harmonyos-hermes-persistent-conversations
---

# Task: deploy-harmonyos-hermes-persistent-conversations

## Goal

Deploy PR #349 persistent conversations and ordered safe tasks to PostgreSQL,
the cloud API, RK3568, and the NOVA 15 Ultra while retaining the accepted PR
#348 reliability and alarm-isolation baseline.

## Current State

- PR #349 is merged as `3332a19f`; PR #351 advanced public `main` to
  `e3b36473` with the original rollout memory.
- PR #354 merged the production follow-up fixes and this checkpoint into
  public `main` as `36cb444`.
- PostgreSQL migration `23-hermes-agent.sql`, the cloud API, and RK3568
  release `hermes-edge-supervisor-3332a19f` are production-live.
- The production API follow-up image is
  `sha256:ca3522dff1151651e07cbefba0184a749fe697194bd16262a28ecd74b883efbd`
  from `60ee7b7`; it covers the natural Chinese variants observed during
  rollout while retaining the deterministic safety boundary.
- App, API, PostgreSQL DDL, and RK3568 remain in one repository architecture;
  no App-specific database was introduced.
- Ordered tasks, history restore, task polling, repeat-context behavior,
  idempotency, HTTP `409` conflicts, protected-intent rejection, artifact
  permissions, redaction, and user isolation have production evidence.
- The signed PR #349 HAP is built but not installed on the NOVA 15 Ultra in
  this rollout because `hdc list targets` still returns `[Empty]`.
- Detailed evidence and rollback identifiers are in
  `memory/checkpoints/rk3568-hermes-app-task-reliability-2026-07-23.md`.

## Constraints

- Do not change existing monitoring, alarm, map, SSE, Push, cache, MQTT, serial,
  telemetry, or rule-engine authority paths during rollout.
- Do not store passwords, tokens, SSH keys, or production secrets in memory.
- Back up and preserve rollback evidence before every production mutation.
- Keep automatic execution limited to the three existing safe actions.

## Plan

- Install the matching signed HAP on the NOVA 15 Ultra.
- Run phone-originated conversation history, ordered tasks, alert sound,
  vibration, map jump, SSE, Push, cache, offline degradation, and physical
  alarm isolation regression.
- Power-cycle RK3568 and verify that the corrected clock persists; UDP NTP is
  currently unreachable from all tested public servers.
- Keep A/B/C as `configured` until serial replies resume; do not fabricate
  node-online or fresh telemetry values.

## Open Questions

- When will the NOVA 15 Ultra be connected with USB debugging authorization so
  the signed HAP and full phone alarm regression can be completed?
- Which server-side model, timeout budget, and fallback policy will be used for
  the later open-ended conversational planner?
- Why do A/B/C currently provide no serial replies even though the port is open
  and MQTT is connected?

## Done When

- Database, API, RK3568, and phone run one recorded compatible version; phone
  alignment remains the only unconfirmed deployment item.
- A logged-in user can create, continue, and restore conversations and inspect
  every task result without cross-user leakage.
- Duplicate requests do not duplicate execution, restart recovery fails closed,
  and protected instructions never reach RK3568.
- RK3568 or Hermes failure does not degrade monitoring or physical alarms.
- Phone/alarm regression evidence and rollback verification are saved to memory.
