---
title: Local Large Files Manifest
type: report
permalink: landslide-monitoring-v2-mainline/docs/guides/repository-management/local-large-files-manifest
---

# Local Large Files Manifest

Generated at: 2026-06-02 21:04:53 +08:00

This report records large local files and directories that are managed by policy but are not meant to be blindly committed to normal Git history.

Current primary delivery target: Windows desktop client (`apps/desk/`, `apps/desk-win/`, `artifacts/desk-win/latest*`).

## Top Directory Footprint

| Directory | GB | MB | Policy |
|---|---:|---:|---|
| `.tmp` | 20.74 | 21234.7 | manifest/外部归档，不进普通 Git |
| `artifacts` | 13.81 | 14141.4 | 只保留当前桌面端交付索引和必要最终包 |
| `apps` | 1.41 | 1446.4 | 按仓库方案分批提交 |
| `.git` | 0.88 | 904.3 | 按仓库方案分批提交 |
| `.tools` | 0.84 | 861.3 | 本地工具缓存，不进 Git |
| `node_modules` | 0.81 | 831.9 | 可重装，不进 Git |
| `data` | 0.23 | 232.8 | 按仓库方案分批提交 |
| `.playwright-mcp` | 0.1 | 100.8 | 调试缓存，不进 Git |
| `.bm-state` | 0.09 | 95.8 | 本地记忆数据库，不进 Git |
| `docs` | 0.03 | 29.9 | 按仓库方案分批提交 |
| `openspec` | 0 | 0.3 | 按仓库方案分批提交 |
| `key` | 0 | 0 | 明文密钥不进 Git，只允许加密备份 |
| `memory` | 0 | 0.8 | 按仓库方案分批提交 |
| `scripts` | 0 | 3.9 | 按仓库方案分批提交 |
| `services` | 0 | 3.6 | 按仓库方案分批提交 |

## Largest Local Files Over 50 MB

| MB | Relative Path | Policy |
|---:|---|---|
| 7712.1 | `.tmp\regional-model-library\raw\Zixing-2024\source\downloads\zixing-2024-dataset.zip` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 780.7 | `.tmp\regional-model-library\raw\CLCD-1985-2025\source\downloads\CLCD_v01_2025_albert_province.zip` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 690.3 | `.tmp\regional-model-library\raw\CHM_PRE-V2\original\monthly-total\CHM_PRE_V2_monthly.tif` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 643.4 | `.tmp\regional-model-library\raw\CHM_PRE-V2\original\daily-netcdf\CHM_PRE_V2_daily_2024.nc` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 641.6 | `.tmp\regional-model-library\raw\CHM_PRE-V2\original\daily-netcdf\CHM_PRE_V2_daily_2019.nc` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 641.6 | `.tmp\regional-model-library\raw\CHM_PRE-V2\original\daily-netcdf\CHM_PRE_V2_daily_2023.nc` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 461.8 | `.tmp\regional-model-library\out\replay-packs\zixing-2024-full-batched-skiptrain\event-replay-pack.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 399.2 | `.tmp\regional-model-library\raw\Beijing-2023\unpacked\shapefiles-rar\RLBJ_v1.0_shapefiles\Terrain.tif` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 313 | `.tmp\regional-model-library\raw\Beijing-2023\source\downloads\beijing-2023-dataset.zip` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 300 | `.tmp\regional-model-library\out\replay-packs\zixing-2024-full-batched-skiptrain\event-replay-pack.samples.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 285.7 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-005632.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 285.7 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-014304.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 285.7 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-013706.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 285.7 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-013131.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 285.7 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-005229.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 258.3 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v33-2026-05-06T07-17-50-853Z\baijiabao-displacement-v33-training.report.json` | 历史产物；优先归档/清理，不进普通 Git |
| 258.3 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v31-dev-gated-state-protected-production\baijiabao-displacement-state-protected-production.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 252.8 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T20-18-46-947Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 241.8 | `artifacts\desk-win\delivery\desk-win-delivery-20260416-095157.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 219.5 | `artifacts\desk-win\latest.zip` | 桌面端当前交付包；按需保留最新版 |
| 219.5 | `artifacts\desk-win\delivery\desk-win-delivery-20260521-194008.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 215.6 | `artifacts\desk-win\delivery\desk-win-delivery-20260512-174210.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 199.1 | `.tmp\regional-model-library\out\artifacts\badong-huangtupo-context-enriched-v5\badong-huangtupo-core.train.context-enriched-v5.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 198.5 | `.tmp\regional-model-library\raw\Beijing-2023\unpacked\dataset-archive\RLBJ_v1.0.mpk` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 197.5 | `artifacts\desk-win\delivery\desk-win-delivery-20260414-154356.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 194.9 | `artifacts\desk-win\delivery\desk-win-delivery-20260414-131905.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 194 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-26T07-59-37-085Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 194 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\baijiabao-displacement-prediction-card.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 183 | `artifacts\desk-win\latest.rar` | 桌面端当前交付包；按需保留最新版 |
| 173.3 | `.tmp\regional-model-library\out\artifacts\badong-huangtupo-hgb-support-guarded-production-v4\badong-huangtupo-core.train.runtime-window-features.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 173.3 | `.tmp\regional-model-library\out\artifacts\badong-huangtupo-hgb-displacement-challenger\badong-huangtupo-core.train.runtime-window-features.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 168.3 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-013706\deliverables\latest.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 168.3 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-005632\deliverables\latest.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 168.3 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-013131\deliverables\latest.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 168.3 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-014304\deliverables\latest.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 168.3 | `artifacts\desk-win\milestones\desk-win-milestone-20260324-005229\deliverables\latest.zip` | 历史产物；优先归档/清理，不进普通 Git |
| 164.9 | `artifacts\desk-win\latest-cloud-fixed-20260528-221328.zip` | 桌面端当前交付包；按需保留最新版 |
| 162.4 | `artifacts\desk-win\latest-cloud-fixed-20260528-2129.zip` | 桌面端当前交付包；按需保留最新版 |
| 147.7 | `.tmp\regional-model-library\out\replay-packs\beijing-2023-by-region-full-batched-skiptrain\cn-北京市-北京市-门头沟区\event-replay-pack.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 143.1 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-26T06-54-25-398Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 142.6 | `.tmp\regional-model-library\out\replay-packs\beijing-2023-by-region-full-batched-skiptrain\cn-北京市-北京市-房山区\event-replay-pack.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 141.6 | `node_modules\@next\swc-win32-x64-msvc\next-swc.win32-x64-msvc.node` | 依赖缓存；可重装 |
| 140.2 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T22-53-21-501Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 139.9 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T22-05-04-734Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 139.9 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T21-23-05-494Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 139.9 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T20-42-35-734Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 137.5 | `.tmp\regional-model-library\raw\Beijing-2023\unpacked\shapefiles-rar\RLBJ_v1.0_shapefiles\Terrain.tif.ovr` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 133.9 | `.tools\mempalace\palace\chroma.sqlite3` | 本地缓存；可备份后清理 |
| 113.1 | `.tmp\regional-model-library\out\badong-huangtupo\core-samples\badong-huangtupo-core.samples.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 112.4 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T17-55-14-486Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 112.1 | `.tools\mempalace\palace-corrupt-20260414-0015\chroma.sqlite3` | 本地缓存；可备份后清理 |
| 111.6 | `.tmp\regional-model-library\out\badong-huangtupo\core-samples\badong-huangtupo-core.labeled.samples.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 110.6 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T19-16-36-363Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 108.7 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-prediction-card\history\baijiabao-displacement-prediction-card.2026-04-25T18-51-59-762Z.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 100.7 | `.playwright-mcp\console-2026-04-21T07-18-44-248Z.log` | 本地缓存；可备份后清理 |
| 99.6 | `.tmp\regional-model-library\out\replay-packs\beijing-2023-by-region-full-batched-skiptrain\cn-北京市-北京市-门头沟区\event-replay-pack.samples.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 95.7 | `.tmp\regional-model-library\out\replay-packs\beijing-2023-by-region-full-batched-skiptrain\cn-北京市-北京市-房山区\event-replay-pack.samples.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 95.2 | `.bm-state\config\memory.db` | 本地缓存；可备份后清理 |
| 95 | `.tmp\regional-model-library\raw\Beijing-2023\unpacked\mpk-package\v10\default1.gdb\a0000000c.gdbtable` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 95 | `.tmp\regional-model-library\raw\Beijing-2023\unpacked\mpk-package\v108\default1.gdb\a0000000c.gdbtable` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 89 | `.tmp\regional-model-library\out\badong-huangtupo\core-samples\splits\badong-huangtupo-core.train.jsonl` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 84.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v31-2026-05-06T07-07-55-089Z\baijiabao-displacement-v31-training.report.json` | 历史产物；优先归档/清理，不进普通 Git |
| 84.2 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v30-layer-tail-guarded-calibration-production\baijiabao-displacement-state-protected-production.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 84.1 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v28-layer-tail-guarded-production\baijiabao-displacement-state-protected-production.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 84.1 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v28-layer-tail-guarded-calibration-production\baijiabao-displacement-state-protected-production.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 84.1 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v30-2026-05-06T03-33-41-918Z\baijiabao-displacement-v30-training.report.json` | 历史产物；优先归档/清理，不进普通 Git |
| 84.1 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v31-layer-tail-guarded-calibration-production\baijiabao-displacement-state-protected-production.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 83.9 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-tail-guarded-production\baijiabao-displacement-state-protected-production.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 83.6 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-22-20-594Z\baijiabao-displacement-state-protected-production.report.json` | 历史产物；优先归档/清理，不进普通 Git |
| 83.3 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-27-33-876Z\baijiabao-displacement-state-protected-production.report.json` | 历史产物；优先归档/清理，不进普通 Git |
| 83.3 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-31-08-417Z\baijiabao-displacement-state-protected-production.report.json` | 历史产物；优先归档/清理，不进普通 Git |
| 83.3 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-state-protected-production\baijiabao-displacement-state-protected-production.report.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 82.8 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v33-2026-05-06T07-17-50-853Z\baijiabao-displacement-v33.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 82.8 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\current-production-main-2026-05-06T09-57-11-762Z\baijiabao-displacement-v33.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 82.8 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v31-dev-gated-state-protected-production\baijiabao-displacement-v33-v31-dev-gated-state-protected.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 82.8 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\current-production-main-2026-05-06T09-15-39-513Z\baijiabao-displacement-v33.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 82.8 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\current-production-main-2026-05-06T09-26-36-812Z\baijiabao-displacement-v33.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 82.8 | `artifacts\models\regional-experts\phase1-displacement-forecast\baijiabao-displacement-v33.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 82.8 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\current-production-main-2026-05-06T09-14-58-436Z\baijiabao-displacement-v33.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 82.8 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v31-layer-tail-guarded-calibration-production\baijiabao-displacement-v32-v31-layer-tail-guarded-calibration.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 81.9 | `.tmp\regional-model-library\raw\CHM_PRE-V2\plans\zixing-2024-full-batched-skiptrain-negatives\by-event.jobs.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 79.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\baijiabao-displacement-v31.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 79.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v31-2026-05-06T07-07-55-089Z\baijiabao-displacement-v31.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 79.2 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v30-layer-tail-guarded-calibration-production\baijiabao-displacement-v31-v30-layer-tail-guarded-calibration.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 79.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v33-2026-05-06T07-17-50-853Z\baijiabao-displacement-v31.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 79.2 | `data\postgres\base\16384\16917` | 人工复核是否需要 LFS/外部归档 |
| 75.7 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v28-layer-tail-guarded-production\baijiabao-displacement-v30-v28-layer-tail-guarded.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 75.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\baijiabao-displacement-v30.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 75.7 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-v28-layer-tail-guarded-calibration-production\baijiabao-displacement-v30-v28-layer-tail-guarded-calibration.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 75.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v33-2026-05-06T07-17-50-853Z\baijiabao-displacement-v30.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 75.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v30-2026-05-06T03-33-41-918Z\baijiabao-displacement-v30.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 75.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v31-2026-05-06T07-07-55-089Z\baijiabao-displacement-v30.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 74.3 | `artifacts\desk-win\latest-cloud.zip` | 桌面端当前交付包；按需保留最新版 |
| 72.4 | `artifacts\desk-win\latest-cloud-fixed-20260528-221617.zip` | 桌面端当前交付包；按需保留最新版 |
| 72.2 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-tail-guarded-production\baijiabao-displacement-v29-tail-guarded.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 72.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\baijiabao-displacement-v28.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 72.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v33-2026-05-06T07-17-50-853Z\baijiabao-displacement-v28.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 72.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v30-2026-05-06T03-33-41-918Z\baijiabao-displacement-v28.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 72.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v31-2026-05-06T07-07-55-089Z\baijiabao-displacement-v28.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 72.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-31-08-417Z\baijiabao-displacement-v28.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 72.2 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-state-protected-production\baijiabao-displacement-v28-state-protected.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 72.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-27-33-876Z\baijiabao-displacement-v28.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 72.2 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-22-20-594Z\baijiabao-displacement-v28.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-postcalibration-challengers\baijiabao-displacement-v21-thresholdSafe.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v23-2026-05-05T13-01-25-310Z\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-27-33-876Z\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-22-20-594Z\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-support-calibrated-production\baijiabao-displacement-v23-support-guarded.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-31-08-417Z\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v30-2026-05-06T03-33-41-918Z\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v31-2026-05-06T07-07-55-089Z\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v33-2026-05-06T07-17-50-853Z\baijiabao-displacement-v23.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `.tmp\regional-model-library\out\artifacts\baijiabao-displacement-support-calibrated-production\baijiabao-displacement-v22-support-calibrated.prediction-regression-v1.json` | 不进 Git；生成来源清单后外部归档/按需清理 |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\baijiabao-displacement-v22.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v31-2026-05-06T07-07-55-089Z\baijiabao-displacement-v22.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v22-2026-05-05T10-10-41-084Z\baijiabao-displacement-v22.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v33-2026-05-06T07-17-50-853Z\baijiabao-displacement-v22.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v23-2026-05-05T13-01-25-310Z\baijiabao-displacement-v22.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |
| 68.7 | `artifacts\models\regional-experts\phase1-displacement-forecast\backups\pre-v28-2026-05-05T14-31-08-417Z\baijiabao-displacement-v22.prediction-regression-v1.json` | 历史产物；优先归档/清理，不进普通 Git |

## Notes

- Do not use `git add .` until `.gitignore` and staged large-file checks pass.
- Keep raw regional-model data outside normal Git. Commit manifests, scripts, and reproducible experiment notes instead.
- Keep plaintext secrets outside Git. Commit only encrypted secret backups and recovery notes.
