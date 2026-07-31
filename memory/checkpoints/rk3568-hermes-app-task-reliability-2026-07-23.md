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

- PR [#349](https://github.com/kipp7/landslide-monitoring-v2/pull/349) is merged
  as `3332a19f58c42c55c6e490e7f40b7150a38475e8`; PR #351 advanced public
  `main` to `e3b36473b959f550f2007efddb0d52705433db13` with rollout memory only.
- PR [#354](https://github.com/kipp7/landslide-monitoring-v2/pull/354)
  merged the rollout follow-up fixes and current production checkpoint into
  public `main` as `36cb444679f6f4a2e9b4b257fba7bf36c21a0778`.
- PostgreSQL 16 has `hermes_conversations`, `hermes_messages`, and
  `hermes_tasks` plus four indexes. PostgreSQL and ClickHouse remain the only
  server business sources; no App-specific database was introduced.
- The production API image is
  `sha256:ca3522dff1151651e07cbefba0184a749fe697194bd16262a28ecd74b883efbd`,
  labelled revision `60ee7b76136477c0bf4ca0a3ad2554e5829afa64`, with restart count `0`.
  All non-API containers retained their existing uptime during the API switch.
- Cloud rollback data is under
  `/opt/lsmv2-production/backups/hermes-pr349-20260731-150457`; the original
  PostgreSQL dump SHA256 is
  `72c78d6b5d56aeee42be216d6e67c0d7a1331e02110ec174d63f92ae7a568259`.
  API rollback tags are `pre-hermes-pr349-20260731-150457` and
  `pre-hermes-followup-20260731`.
- RK3568 runs immutable release
  `/opt/lsmv2/releases/hermes-edge-supervisor-3332a19f`; its deployment archive
  SHA256 is
  `df1a19843edb6060c756471bafc90cc2e95d207702e9b21d7282f6b1c5d58410`.
- RK3568 rollback data is under
  `/opt/lsmv2/backups/hermes-pr349-20260731-150457`, with the previous release
  retained at `/opt/lsmv2/releases/hermes-edge-supervisor-adba15c3`.
- RK3568 passed `10/10` queue/risk tests, `/healthz`, supervision, capacity
  `16`, all three actions, duplicate request reuse, conflict HTTP `409`,
  `0640` artifacts, and a credential-pattern redaction scan.
- Production multi-step chat executed
  `collect_logs -> recheck -> generate_report`, repeated the audited plan with
  `按刚才的再来一次`, restored `4` messages and `6` tasks, and polled every
  task as `succeeded`. Protected restart/network/physical-alarm intent created
  no task.
- A rollout phrase that initially matched only `generate_report` is now covered:
  `先检查当前链路，再收集诊断日志，然后生成报告` maps to
  `collect_logs -> generate_report`; repeat/history verification passed. All
  rollout-only conversations were deleted afterwards.
- The field gateway, field-link monitor, physical alarm actuator, and reverse
  tunnel kept PIDs `158686`, `1954`, `1370`, and `138145`; their restart counts
  did not change. Hermes runs as PID `178203`, restart count `0`, with
  `CPUQuota=50%`, `MemoryMax=384M`, and `TasksMax=64`.
- The guardian deadlock cause was a synchronous service restart combined with
  reverse ordering. Production uses non-blocking `try-restart` and a 75-second
  timeout; the corresponding source fix is commit `60ee7b7`.
- RK3568 time was corrected from 2026-07-26 to Beijing time on 2026-07-31.
  Aliyun, Tencent, Ubuntu, and pool NTP all timed out over UDP/123, so
  `System clock synchronized` remains `no`; verify time retention after a power
  cycle instead of claiming network NTP is fixed.
- A/B/C currently have no serial replies. The serial port is open and MQTT is
  connected, but all nodes must remain `configured`, not falsely online.
- Latest confirmed signed HAP SHA256 remains
  `94B0731DD7D977C70954E1CC15281720616B94DCA8D78A7930F18C0950E94BA9`.
  The NOVA 15 Ultra runs HarmonyOS `6.1.0.125 SP10`, but this HAP is not
  installed because `hdc list targets` returns `[Empty]`.
- The signed HAP rollback copy is
  `_private-production-backup/hermes-pr349-20260731-150457/entry-default-pr349-signed.hap`.

## In Progress

- PostgreSQL, API, RK3568, conversations, and bounded task execution are
  production-live. The latest signed HAP and phone-originated full regression
  remain pending on a connected and authorized HDC target.

## Next Actions

- Connect the NOVA 15 Ultra through HDC and install the matching HAP.
- Run phone-originated single-task, ordered multi-task, context repetition,
  retry idempotency, restart recovery, protected-intent rejection, and full
  monitoring/alarm regression.
- Power-cycle RK3568 and confirm time retention, reverse tunnel, supervisor,
  and protected-service recovery.

## Risks

- Phone version alignment and alarm regression are not proven until HDC sees
  the NOVA 15 Ultra.
- RK3568 receives no NTP replies; a long power loss may re-create timestamp
  drift if the corrected clock is not retained.
- A/B/C serial silence is a field-link condition, not evidence that Hermes is
  consuming CPU or that fresh telemetry exists.
- Full API lint reports 74 pre-existing errors outside the changed Hermes
  files; targeted lint and all 10 Hermes API tests pass.
- A future LLM must produce a structured allowlisted plan through the server;
  direct shell, serial, MQTT control, device control, or alarm authority is
  prohibited.

## Resume Prompt

Merge the follow-up branch, connect the NOVA 15 Ultra through HDC, install the
signed PR #349 HAP, and run phone-originated Hermes plus alarm/map/SSE/Push/cache
regression. Then power-cycle RK3568 to verify time retention. Do not add
unrestricted device control or claim A/B/C online without serial evidence.
