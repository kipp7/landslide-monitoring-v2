---
title: desk-win-restored-delivery-archive-2026-04-16
type: note
tags:
- checkpoint
status: active
permalink: landslide-monitoring-v2-mainline/memory/checkpoints/desk-win-restored-delivery-archive-2026-04-16
---

# Checkpoint: desk-win-restored-delivery-archive-2026-04-16

## Objective

Freeze the restored `desk-win` delivery version after rolling back the `EChart` and Vite chunk-splitting experiment, so future sessions can resume from a verified visible package instead of the white-screen branch.

## Last Confirmed State

- the temporary performance-hardening branch was explicitly rolled back:
  - deleted:
    - `apps/desk/src/components/EChart.tsx`
  - restored direct `echarts-for-react` usage in:
    - `apps/desk/src/views/AnalysisPage.tsx`
    - `apps/desk/src/views/DashboardPage.tsx`
    - `apps/desk/src/views/DeviceManagementPage.tsx`
    - `apps/desk/src/views/GpsMonitoringPage.tsx`
    - `apps/desk/src/views/GpsPage.tsx`
    - `apps/desk/src/views/SystemPage.tsx`
  - restored `apps/desk/vite.config.ts` to:
    - `cssCodeSplit = false`
    - `inlineDynamicImports = true`
- the restored frontend rebuild is verified:
  - `npm run build --workspace apps/desk`
    - passed on `2026-04-16`
  - current main JS chunk returned to:
    - `dist/assets/index-1RHwzS1I.js`
    - `3162.19 KB`
- the restored packaged desktop runtime is verified:
  - `docs/unified/reports/desk-win-package-verify-latest.json`
    - `generatedAt = 2026-04-16T01:40:49Z`
    - `readyAfterLaunch = true`
    - `runtimeErrorCount = 0`
- the full delivery archive pipeline was rerun successfully:
  - `docs/unified/reports/desk-win-delivery-pipeline-latest.json`
    - `generatedAt = 2026-04-16T01:53:23Z`
    - `ready = true`
  - current build git:
    - `shortSha = 628c350`
- the archived delivery bundle for this restored version is:
  - directory:
    - `artifacts/desk-win/delivery/desk-win-delivery-20260416-095157/`
  - zip:
    - `artifacts/desk-win/delivery/desk-win-delivery-20260416-095157.zip`
  - `fileCount = 611`
- the fixed latest delivery output now points to this same restored version:
  - `artifacts/desk-win/latest/`
  - `artifacts/desk-win/latest.zip`
  - `docs/unified/reports/desk-win-latest-delivery-latest.json`
    - `ready = true`
  - `docs/unified/reports/desk-win-latest-package-verify-latest.json`
    - `readyAfterLaunch = true`
    - `runtimeErrorCount = 0`
- current delivery hashes for the restored version are:
  - exe:
    - `3596580a69f3befbd34f37dad6fee2b96076797c4de4c6da2ab850c30c12a41c`
  - web index:
    - `269716c95f67179cfe8b3a4cd8e0d201e4eda2a5f95cbe956901938a9626f8b7`
  - bundle zip:
    - `71953412c1534433cbaad6a9787c02343c7274e38b8fe2adf2b737433adc89d0`
- current installers for the restored version are also regenerated and verified:
  - Inno installer:
    - `artifacts/desk-win/installer/LandslideDesk-Setup-win-x64-628c350.exe`
    - `verified = true`
  - custom BA installer:
    - `artifacts/desk-win/customba-installer/LandslideDesk-CustomBA-Setup-628c350-20260416-095110.exe`
    - `verified = true`

## In Progress

- continue using the restored `desk-win` delivery as the current formal visible client baseline
- avoid reintroducing the reverted `EChart` / manual chunk split path until a separate safe branch re-verifies packaged WebView2 behavior
- continue mainline business/API/page work on top of this archived baseline

## Next Actions

- if future sessions need a known-good desktop package, start from:
  - `artifacts/desk-win/latest/package/LandslideDesk.Win.exe`
  - or the archived zip:
    - `artifacts/desk-win/delivery/desk-win-delivery-20260416-095157.zip`
- treat this archive as the rollback anchor before any new desk performance or packaging experiments
- if the window is reported as "not visible" again, check:
  - WPF window placement
  - multi-monitor offset
  - tray restore behavior
  instead of reopening the old frontend white-screen diagnosis first
- continue the mainline integration work from the restored desk baseline:
  - desk pages and API alignment
  - field data flow to desktop
  - formal delivery handoff hardening

## Risks

- the current restored build still has one oversized JS bundle; this is now a tolerated follow-up item, not a delivery blocker
- if someone later reruns packaging while `LandslideDesk.Win.exe` is still open from `artifacts/desk-win/win-x64`, publish will fail on locked DLLs
- old notes about the reverted `EChart` / Vite chunk experiment can confuse later sessions unless this checkpoint is read first

## Resume Prompt

Resume from the restored `desk-win` archive baseline dated `2026-04-16`: read this checkpoint first, then verify `docs/unified/reports/desk-win-delivery-pipeline-latest.json` and `docs/unified/reports/desk-win-latest-package-verify-latest.json` before making any new claim about the desktop delivery state.
