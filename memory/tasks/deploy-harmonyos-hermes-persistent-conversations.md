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
the cloud API, RK3568, and the HarmonyOS App, using the DevEco Studio phone
emulator for App acceptance while retaining the accepted PR #348 reliability
and alarm-isolation baseline.

## Current State

- PR #349 is merged as `3332a19f`; PR #351 advanced public `main` to
  `e3b36473` with the original rollout memory.
- PR #354 merged the production follow-up fixes and this checkpoint into
  public `main` as `36cb444`.
- PR #355 advanced public `main` to `1e04268` with the completed rollout
  memory. PR #356 is the open chat-first HarmonyOS UI follow-up at
  `aa07995977e2b1929e2181ba7a89fbbc6306d04a`.
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
- The acceptance target is the DevEco Studio phone emulator, not a physical
  phone. HarmonyOS `5.0.1(13)` is connected at `127.0.0.1:5555`; the signed
  PR #356 HAP was built, installed, and launched successfully. Its SHA256 is
  `4131E34BF2A4C2EB7D8CBDF6803DA0320217F75EF46258E7598EF8A8741EC540`.
- The chat-first Hermes screen, history empty state, fixed composer, and
  software-keyboard layout were visually verified with emulator screenshots.
  No API, task allowlist, audit, or RK3568 dispatch contract changed.
- Detailed evidence and rollback identifiers are in
  `memory/checkpoints/rk3568-hermes-app-task-reliability-2026-07-23.md`.

## Constraints

- Do not change existing monitoring, alarm, map, SSE, Push, cache, MQTT, serial,
  telemetry, or rule-engine authority paths during rollout.
- Do not store passwords, tokens, SSH keys, or production secrets in memory.
- Back up and preserve rollback evidence before every production mutation.
- Keep automatic execution limited to the three existing safe actions.

## Plan

- Merge PR #356 after review and retain the signed emulator build evidence.
- Run emulator-originated conversation history, ordered tasks, map jump, SSE,
  cache, offline degradation, and in-App alarm regression when the App reports
  RK3568 available again.
- Treat physical vibration, real GPS, vendor Push, and background survival as
  hardware-specific gaps; the emulator cannot prove them.
- Power-cycle RK3568 and verify that the corrected clock persists; UDP NTP is
  currently unreachable from all tested public servers.
- Keep A/B/C as `configured` until serial replies resume; do not fabricate
  node-online or fresh telemetry values.

## Open Questions

- Why did the emulator session report `RK3568 暂时离线` during the PR #356
  visual pass even though the production Hermes rollout previously passed?
- Which server-side model, timeout budget, and fallback policy will be used for
  the later open-ended conversational planner?
- Why do A/B/C currently provide no serial replies even though the port is open
  and MQTT is connected?

## Done When

- Database, API, RK3568, and the emulator App run one recorded compatible
  version; hardware-only behaviors remain explicitly outside emulator proof.
- A logged-in user can create, continue, and restore conversations and inspect
  every task result without cross-user leakage.
- Duplicate requests do not duplicate execution, restart recovery fails closed,
  and protected instructions never reach RK3568.
- RK3568 or Hermes failure does not degrade monitoring or physical alarms.
- Emulator App/alarm regression evidence and rollback verification are saved to
  memory without claiming real GPS, vibration, vendor Push, or background proof.
