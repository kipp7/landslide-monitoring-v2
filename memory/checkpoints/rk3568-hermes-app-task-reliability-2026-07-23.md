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
- PR #355 advanced public `main` to
  `1e04268b3a39a2658409c637738cc57f58aa7b54`; PR #356 merged the HarmonyOS
  chat-first UI as `0f6300c`. PR
  [#357](https://github.com/kipp7/landslide-monitoring-v2/pull/357) carries
  reachability code revision `a07460ac2f423251ff925b8bb65a7cebd0e37729`.
- PostgreSQL 16 has `hermes_conversations`, `hermes_messages`, and
  `hermes_tasks` plus four indexes. PostgreSQL and ClickHouse remain the only
  server business sources; no App-specific database was introduced.
- The previous production API baseline image, retained for rollback, is
  `sha256:ca3522dff1151651e07cbefba0184a749fe697194bd16262a28ecd74b883efbd`,
  labelled revision `60ee7b76136477c0bf4ca0a3ad2554e5829afa64`.
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
- App acceptance now targets the DevEco Studio phone emulator rather than a
  physical phone. HarmonyOS `5.0.1(13)` is connected through HDC at
  `127.0.0.1:5555`.
- The latest signed PR #356 HAP built at
  `E:/codex-build/hermes-chat-ui-20260731/entry/build/default/outputs/default/entry-default-signed.hap`
  has SHA256
  `8F2D815CAABEE5BEBD4FD4DAD7FE59FC11DAB2E40F2674678810718200EA726D`.
  It installed and launched successfully on the emulator.
- The second UI pass replaces the three-button header with history, centered
  connection state, and new conversation; hides quick tasks behind the composer
  tool button; removes the unrelated global task result from chat; keeps user
  bubbles content-sized; and removes repeated assistant labels and timestamps.
- The chat screen, content-sized short-message bubbles, hidden and expanded task
  tools, fixed composer, and software-keyboard layout passed HarmonyOS 5.0.1(13)
  simulator inspection. The clean system snapshot is
  `E:/codex-build/hermes-chat-ui-20260731/hermes-chat-final-v2.jpeg` with SHA256
  `C8A3E493B02C184486995A8DF53768B67E33184DAF4628D6C957EC323E5716DD`.
- The first rebuild attempt exposed a stale-HAP hazard: the source copy command
  had timed out before copying, while Hvigor reported old packaging tasks as
  `UP-TO-DATE`. Future out-of-tree builds must verify source and build-copy
  SHA256 values, then run `hvigorw clean` before `assembleHap`.
- The previous signed HAP remains the rollback copy at
  `_private-production-backup/hermes-pr349-20260731-150457/entry-default-pr349-signed.hap`.
- Production checks confirmed that reverse tunnels `22079`, `28081`, `28082`,
  and `28087`, Hermes `/healthz`, supervision, MQTT, and the bounded task API
  are reachable. `/v1/edge-risk` reports `available=false` because node data
  is insufficient, not because RK3568 is disconnected.
- `/api/v1/edge-ai/status` now returns `reachable` separately from `available`.
  Production API image
  `sha256:6a89be41abbd83ed9474fbd333bf7147426bfd7ebc888edf40ee2603003d25c2`
  runs revision `a07460a` with restart count `0`.
- API rollback evidence is under
  `/opt/lsmv2-production/backups/hermes-reachability-20260731-183317` and
  `/opt/lsmv2-production/backups/hermes-history-order-20260731-184909`.
  Rollback tags retain both the original `60ee7b7` API and the intermediate
  `8e51d76` reachability image. All non-API container IDs and restart counts
  remained unchanged during both switches.
- The signed follow-up HAP at
  `E:/codex-build/hermes-reachability-20260731/entry/build/default/outputs/default/entry-default-signed.hap`
  has SHA256
  `C892754ED0DDFB849DA6BE8DAF66F90C7AB4766DFB96041D9DA143090E6E093B`
  and is installed on HarmonyOS `5.0.1(13)` at `127.0.0.1:5555`.
- Emulator acceptance passed `RK3568 在线 · 等待节点数据`, one safe task,
  ordered `collect_logs -> recheck -> generate_report`, protected restart and
  threshold rejection, history restoration with stable task order, station
  map, device detail, alert empty state, Tianditu map, and persistent alert SSE.
  The SSE connection was observed inside the API container network namespace.
- Commit `7a0e0462bf8219ccef12f9b86508cf8e2413981a` adds the replaceable
  server-side OpenAI-compatible planner. Model plans are accepted only after a
  strict JSON schema and the existing three-action allowlist. Protected intents
  are rejected before the model call. Network, timeout, HTTP, or invalid output
  falls back to deterministic Chinese planning; a 30-second circuit prevents
  repeated delay while the model is down.
- All 15 Hermes API tests, targeted ESLint, API TypeScript build, Compose config,
  and `git diff --check` pass. Tests cover valid model planning, invalid action
  rejection, two-attempt network fallback, circuit-open fast fallback, and
  protected intent without any model or RK3568 call.
- The signed HAP at
  `E:/codex-build/hermes-llm-planner-20260731/entry/build/default/outputs/default/entry-default-signed.hap`
  has SHA256
  `B5592A5937CCCF5E6756095DB4096B370969FD1202E75FE3882D27F6587B789D`.
  It clean-built, installed, launched, and restored the existing monitoring
  overview on the HarmonyOS `5.0.1(13)` emulator.
- The PR #357 HarmonyOS flagship UI pass uses
  `apps/harmonyos/DESIGN.md` as its Google Labs alpha-format visual source of
  truth: risk before volume metrics, visible data provenance, quiet normal
  states, outdoor-readable type, and 44 vp controls. The previous root
  `.impeccable.md` was removed to avoid conflicting authorities. The document
  passes `designmd 0.4.0` lint with `0` errors and `0` warnings.
- Overview now prioritizes active risk and node availability, Stations shows
  map -> region -> node evidence, Hermes keeps a chat-first surface with three
  contextual safe-task starters, and My groups alert, location, cache, server,
  version, and logout operations. The follow-up derives selected-site status
  from actual node connectivity, distinguishes offline-device snapshots from
  live data, formats upload counts, date-qualifies 24-hour trends, and avoids
  the locale midnight `24:xx` rendering.
- Login, Overview, Stations, Hermes history, Hermes new conversation, My,
  alert empty state, and device detail were visually inspected at `1260x2720`
  on the HarmonyOS `5.0.1(13)` phone emulator. Screenshots are under
  `E:/codex-build/hermes-ui-polish-20260803/screenshots`; no overlap, clipping,
  bottom-navigation obstruction, or map-node loss was observed.
- Source and ASCII build-copy SHA256 values both equal
  `A3CBDFEE70A6DD4D89C48A7025DE83B4D22459A83F0978972AEF975584382BBF`
  for `Index.ets` and
  `C0AEF2247B81A167ADCF152CE25BB59F0F3B28C9FD21BEC5A3BAB2E0A1D7A6F1`
  for `Types.ets`. A clean Hvigor run completed type checking, ArkTS
  compilation, and packaging after putting the DevEco JBR first in the local
  build PATH and clearing the stale Java 8 CLASSPATH. The DevEco debug
  certificate expired at `2026-08-03 17:52 CST`, so the resulting unsigned HAP
  was signed only in the temporary build directory with the SDK OpenHarmony
  simulator certificate and then verified successfully. The local signed HAP is
  `E:/codex-build/hermes-ui-polish-20260803/entry/build/default/outputs/default/entry-default-local-signed.hap`,
  SHA256 `CBCF0F4A0027CB272DBCBC3D01D70666E5B490462E80EC5CD7EA45F2D5557486`.
- Final screenshot SHA256 values are
  `FF9F91D8E5F0CEC92CD8EEA1D4125D34B63BA4F1EA1B50BEC025C268CF1EBAFE`
  for Overview,
  `38F9F91A6818F4EBF6CA28BC5F3145F930A017502D59C479A1D314DA54F1BEDD`
  for Stations, and
  `011A09A2338D46A2733F4CC316371C41108D8F1835F1F019EF92A1D82528687C`
  for device detail. They remain local under
  `E:/codex-build/hermes-ui-polish-20260803/screenshots` and show no clipping,
  overlap, map-node loss, false green offline state, or `24:xx` timestamp.

## In Progress

- PostgreSQL, API, RK3568, conversations, and bounded task execution are
  production-live. The corrected signed HAP is installed on the emulator and
  the App no longer equates insufficient node data with RK3568 disconnection.
- Explicit forced-offline cache proof remains pending because the emulator
  shell rejects interface changes. Normal force-stop/relaunch restoration and
  the reachable-but-unavailable cache code path are verified without changing
  production services.
- Model integration is code-complete but intentionally inactive in production:
  no model endpoint/name/credential is configured. Available local SSH keys did
  not authenticate to the cloud server for the planned read-only resource
  check, so no production container, environment, or model runtime changed.
- The UI refinement is code-complete on PR #357 and changes only presentation,
  shared date formatting, and the repository design source in
  `apps/harmonyos`. Monitoring, cache, map, SSE, Push, alarm, and Hermes API or
  execution contracts remain unchanged.

## Next Actions

- Review and merge PR #357.
- Choose a production OpenAI-compatible provider, restore authorized cloud-host
  access, inspect CPU/RAM/GPU, and then configure the API environment. Prefer a
  cloud model when the host cannot run a local model without affecting the
  monitoring stack.
- Run an explicit forced-offline cache acceptance when emulator network control
  is available; do not stop production API merely to simulate this condition.
- Renew DevEco automatic debug signing before the next normal IDE build. Keep
  SDK test certificates outside Git and use them only for local simulator HAPs.
- Download or repair the `Pura 90 / HarmonyOS 6.1.1(24)` emulator system image
  before claiming runtime acceptance on API 24. The instance currently contains
  configuration only and cannot boot; the App remains forward-compatible from
  its declared `compatibleSdkVersion` `5.0.0(12)` but API 24 visual proof is
  still pending.
- Keep physical vibration, real GPS, vendor Push, and background survival out
  of emulator acceptance; verify them only when hardware testing is requested.
- Power-cycle RK3568 and confirm time retention, reverse tunnel, supervisor,
  and protected-service recovery.

## Risks

- Emulator installation and UI alignment are proven. Physical vibration, real
  GPS, vendor Push, and background survival are not provable on the emulator.
- RK3568 receives no NTP replies; a long power loss may re-create timestamp
  drift if the corrected clock is not retained.
- A/B/C serial silence is a field-link condition, not evidence that Hermes is
  consuming CPU or that fresh telemetry exists.
- The emulator does not grant permission for `ifconfig eth0 down`, so this run
  does not claim a forced-network-loss cache test.
- Full API lint reports 74 pre-existing errors outside the changed Hermes
  files; targeted lint and all 11 Hermes API tests pass.
- A future LLM must produce a structured allowlisted plan through the server;
  direct shell, serial, MQTT control, device control, or alarm authority is
  prohibited.
- HarmonyOS `6.1.1(24)` runtime acceptance is not yet proven on this machine.
  The configured Pura 90 instance lacks downloaded runtime image files; do not
  confuse source compatibility with an executed high-version simulator test.
- The first request during a model outage can spend up to two 6-second attempts
  before deterministic fallback. The following requests use the 30-second fast
  fallback circuit. Provider latency must be measured before production enablement.

## Resume Prompt

Review and merge PR #357, including commit `7a0e046` and the HarmonyOS UI pass.
Renew DevEco debug signing and download the Pura 90 API 24 emulator image before
high-version runtime acceptance. Select the model provider only after an
authorized production resource check; then configure and canary the server
planner while preserving deterministic fallback. Preserve the API and HAP
rollback evidence, then run a forced-offline cache check when simulator network
control is available. Treat real GPS, physical vibration, vendor Push, and
background survival as hardware-only gaps. Power-cycle RK3568 to verify time
retention. Do not add unrestricted device control or claim A/B/C online without
serial evidence.
