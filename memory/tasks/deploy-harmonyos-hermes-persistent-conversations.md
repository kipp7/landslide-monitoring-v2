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
- PR #355 advanced public `main` to `1e04268`; PR #356 merged the chat-first
  HarmonyOS UI into public `main` as `0f6300c`.
- PR [#357](https://github.com/kipp7/landslide-monitoring-v2/pull/357)
  carries the reachability baseline plus server-model planner implementation
  commit `7a0e0462bf8219ccef12f9b86508cf8e2413981a`.
  It separates RK3568 reachability from risk-data availability and preserves
  task order after conversation restoration.
- The API now has a replaceable OpenAI-compatible Hermes planner with a strict
  JSON schema, the same three-action allowlist, protected-intent precheck,
  bounded history, timeout/retry, a 30-second failure circuit, audit metadata,
  and deterministic fallback. No model endpoint, model name, or credential is
  committed, so production behavior remains deterministic until explicitly
  configured.
- The App labels replies as `模型规划` or `规则保障`. A phone-to-server send
  failure keeps the intent in an explicit retry panel and states that no task
  ran; it is not queued for delayed execution.
- PostgreSQL migration `23-hermes-agent.sql`, the cloud API, and RK3568
  release `hermes-edge-supervisor-3332a19f` are production-live.
- The previous production API baseline image, retained for rollback, is
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
  The follow-up now correctly shows `RK3568 在线 · 等待节点数据` when Hermes is
  reachable but A/B/C data is insufficient; it does not claim those nodes are
  online. No task allowlist, audit, or RK3568 dispatch contract changed.
- Production API image
  `sha256:6a89be41abbd83ed9474fbd333bf7147426bfd7ebc888edf40ee2603003d25c2`
  runs revision `a07460a` with restart count `0`. The rollout changed only the
  API container; every non-API container retained its ID and restart count.
- The latest signed emulator HAP SHA256 is
  `B5592A5937CCCF5E6756095DB4096B370969FD1202E75FE3882D27F6587B789D`.
  It was built from a hash-verified ASCII-path copy, installed, and launched on
  the HarmonyOS `5.0.1(13)` emulator.
  It passed single-task, ordered three-task, protected-intent, history restore,
  station map, device detail, alert/map, and foreground alert-SSE regression.
- Detailed evidence and rollback identifiers are in
  `memory/checkpoints/rk3568-hermes-app-task-reliability-2026-07-23.md`.
- PR #357 now also carries the HarmonyOS field-situation UI pass. It replaces
  the equal-weight overview metric grid with risk and node-operability
  hierarchy, improves Stations and device evidence scanning, adds three
  contextual safe-task starters to the chat-first Hermes surface, and unifies
  My, alerts, login, charts, typography, spacing, semantic colors, and touch
  targets without changing API or execution contracts.
- `apps/harmonyos/DESIGN.md` is now the App visual source of truth using the
  official Google Labs alpha format. It replaces the root `.impeccable.md`,
  records exact HarmonyOS tokens and operational hierarchy, and passes
  `designmd 0.4.0` lint with `0` errors and `0` warnings.
- The evidence-focused follow-up no longer claims a stable or live device state
  while A/B/C are offline. Overview routes communication loss to Stations;
  Stations derives the selected site status from actual node connectivity;
  device detail distinguishes recent retained data from live data. Upload
  counts use grouping separators, 24-hour trend labels include dates, and
  midnight freshness now renders as `00:xx` instead of `24:xx`.
- The final UI passed a bounded `1260x2720` HarmonyOS `5.0.1(13)` emulator
  review for Overview, Stations, and device detail. Source/build-copy SHA256
  values are `A3CBDFEE70A6DD4D89C48A7025DE83B4D22459A83F0978972AEF975584382BBF`
  for `Index.ets` and
  `C0AEF2247B81A167ADCF152CE25BB59F0F3B28C9FD21BEC5A3BAB2E0A1D7A6F1`
  for `Types.ets`. The locally signed and verified HAP SHA256 is
  `CBCF0F4A0027CB272DBCBC3D01D70666E5B490462E80EC5CD7EA45F2D5557486`.
  Normal DevEco signing is pending certificate renewal; the checked HAP used
  only an SDK simulator certificate in `E:/codex-build`.

## Constraints

- Do not change existing monitoring, alarm, map, SSE, Push, cache, MQTT, serial,
  telemetry, or rule-engine authority paths during rollout.
- Do not store passwords, tokens, SSH keys, or production secrets in memory.
- Back up and preserve rollback evidence before every production mutation.
- Keep automatic execution limited to the three existing safe actions.

## Plan

- Review and merge PR #357, retaining the signed emulator and production
  rollback evidence.
- Renew the DevEco debug certificate and install the HarmonyOS 6.1.1 Pura 90
  emulator image before a separate API 24 visual acceptance pass.
- Select an OpenAI-compatible provider after checking production server
  resources. If no suitable local runtime exists, use a cloud API; keep the
  provider secret only in the production environment. The available local SSH
  identities did not authenticate to the cloud host during this checkpoint, so
  no unverified local model was installed and no production service was changed.
- Complete an explicit forced-offline cache test when the emulator permits
  network control; its shell currently rejects `ifconfig eth0 down`. Normal
  force-stop/relaunch restoration passed with the network available.
- Treat physical vibration, real GPS, vendor Push, and background survival as
  hardware-specific gaps; the emulator cannot prove them.
- Power-cycle RK3568 and verify that the corrected clock persists; UDP NTP is
  currently unreachable from all tested public servers.
- Keep A/B/C as `configured` until serial replies resume; do not fabricate
  node-online or fresh telemetry values.

## Open Questions

- Which server-side model, timeout budget, and fallback policy will be used for
  production? Code defaults are 6-second attempts, at most two attempts, and a
  30-second circuit cooldown; provider/model selection and credentials remain
  intentionally unconfigured.
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
