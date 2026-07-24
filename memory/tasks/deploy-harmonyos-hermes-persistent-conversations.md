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

- PR #349 is merged to public `main` as `3332a19f`.
- API, queue, migration, integration, lint, and HAP build verification passed.
- App, API, PostgreSQL DDL, and RK3568 implementations remain in one repository
  architecture; no App-specific database was introduced.
- Production deployment of the complete PR #349 stack is not yet confirmed.
- Detailed evidence and artifact hash are in
  `memory/checkpoints/rk3568-hermes-app-task-reliability-2026-07-23.md`.

## Constraints

- Do not change existing monitoring, alarm, map, SSE, Push, cache, MQTT, serial,
  telemetry, or rule-engine authority paths during rollout.
- Do not store passwords, tokens, SSH keys, or production secrets in memory.
- Back up and preserve rollback evidence before every production mutation.
- Keep automatic execution limited to the three existing safe actions.

## Plan

- Verify live versions and obtain the approved production access path.
- Back up PostgreSQL and deploy the Hermes migration.
- Update only the API service required by PR #349 and smoke its four new routes.
- Update only the Hermes edge supervisor and verify health, queue, artifacts,
  resource limits, and protected-link isolation.
- Install the matching signed HAP on the NOVA 15 Ultra.
- Run conversation history, ordered tasks, context repetition, idempotency,
  protected-intent rejection, offline degradation, and full alarm regression.
- Record live commit/image/release IDs, tests, resource observations, and
  rollback results in the checkpoint.

## Open Questions

- What is the currently approved server SSH identity and deployment entrypoint?
- What is the currently reachable RK3568 address and supervisor version?
- Which server-side model, timeout budget, and fallback policy will be used for
  the later open-ended conversational planner?

## Done When

- Database, API, RK3568, and phone run one recorded compatible version.
- A logged-in user can create, continue, and restore conversations and inspect
  every task result without cross-user leakage.
- Duplicate requests do not duplicate execution, restart recovery fails closed,
  and protected instructions never reach RK3568.
- RK3568 or Hermes failure does not degrade monitoring or physical alarms.
- Phone/alarm regression evidence and rollback verification are saved to memory.
