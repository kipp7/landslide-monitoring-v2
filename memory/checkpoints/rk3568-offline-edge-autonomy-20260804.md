---
title: rk3568-offline-edge-autonomy-20260804
type: checkpoint
tags:
- rk3568
- hermes
- offline
- safety
status: code-complete-hardware-pending
---

# Checkpoint: RK3568 Offline Edge Autonomy

## Objective

Keep A/B/C telemetry, two edge models, deterministic local safety rules,
Tongxiao alarm ownership, and the three bounded Hermes tasks operational during
WAN loss, then synchronize stable events idempotently after recovery.

## Last Confirmed State

- Branch: `feat/rk3568-offline-edge-autonomy-20260804` at base `fb46ea3`.
- Implementation, deployment assets, schemas, API/client surfaces, and local
  automated tests are complete in the working tree.
- No commit, GitHub push, RK3568 deployment, or production change was made.
- All focused tests/builds/lint passed. Desktop Playwright checks passed at
  1440x1000 and 390x844 with no horizontal overflow. HarmonyOS debug HAP built
  successfully from the ASCII-path temporary copy using DevEco JBR 21.
- HarmonyOS/API adaptation follow-up completed on 2026-08-06: API edge status
  now distinguishes live/stale/offline/insufficient nodes, rejects old risk
  snapshots as unreachable, forwards diagnosis OOD/inference/resource fields,
  and Hermes chat retries are idempotent by requestId without new tables.
- Edge AI API regression coverage is now 20 passing tests, including B/C live +
  A offline partial status, direct and fallback stale snapshots, nullable
  resource/OOD payloads, and duplicate chat retry behavior.
- The complete ArkTS source was synchronized to `E:\landslide-monitoring-harmonyos`.
  CompileArkTS succeeds there; unsigned HAP packaging succeeds when invoking
  `app_packing_tool.jar` with DevEco JBR 21. The stock Hvigor PackageHap task
  still resolves the broken system Java 8 path and cannot sign/package directly.
- Final desktop screenshots are under `output/playwright/` and are verification
  artifacts, not product source.

## In Progress

- None in local code. The remaining gates are real RK3568 hardware acceptance
  and DevEco debug signing configuration.

## Next Actions

1. Provision the production signing key material, signed rules, local actuator
   token, and MQTT topics outside Git.
2. Restore A/B/C serial traffic and record pre-test PID/restart counters.
3. Disconnect RK3568 WAN physically or at the uplink boundary, not merely by
   stopping an API.
4. Capture local telemetry growth, both inference timestamps, rule-triggered
   Tongxiao output, App cache/offline labeling, and resource/latency evidence.
5. Restore WAN and verify stable event IDs and inference results synchronize
   without duplicate PostgreSQL rows.
6. Confirm protected process IDs/restart counts remain unchanged and server
   clears cannot remove an active local lease.
7. In DevEco Studio, regenerate the expired debug signing certificate, then
   rebuild/install the synchronized ASCII-path project on the HarmonyOS 5.0.1
   emulator.

## Risks And Blockers

- Last known production evidence had silent A/B/C nodes; offline acceptance is
  blocked until real serial telemetry is restored.
- Production Ed25519 public key and signed rule-distribution topic are not yet
  provisioned. The controller intentionally fails closed without them.
- Existing desktop bundle-size warning, seven dependency audit findings, and
  pre-existing HarmonyOS warnings remain; none were introduced as runtime
  failures by this task.
- Hvigor `PackageHap` on this machine uses `C:\Program Files\Java\jre-1.8`
  despite `JAVA_HOME`; direct unsigned packaging is verified, but signing still
  requires the DevEco Project Structure signing setup.

## Resume Prompt

Resume `rk3568-offline-edge-autonomy-20260804` from this checkpoint. Read the
task note and current diff, do not redeploy or claim production completion, then
coordinate the real RK3568 WAN-isolation acceptance and preserve all evidence.
