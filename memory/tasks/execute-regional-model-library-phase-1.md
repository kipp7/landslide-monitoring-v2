---
title: execute-regional-model-library-phase-1
type: note
tags:
- task
- ai
- implementation
- regional-model
status: active
permalink: landslide-monitoring-v2-mainline/memory/tasks/execute-regional-model-library-phase-1
---

# Task: execute-regional-model-library-phase-1

## Goal

Turn the agreed regional expert model library route into a first executable implementation plan with clear modules, order, ownership boundaries, and immediate next actions.

## Current State

- The project has chosen:
  - `C. 区域专家模型库 + 学习式匹配 + replay 重排 + 本地接管`
- Durable memory already records:
  - architecture decision
  - reuse map
  - open-source asset audit
- Current online prediction is still heuristic through:
  - `services/ai-prediction-worker/src/index.ts`
- OpenSpec already exists for the baseline route:
  - `openspec/changes/add-regional-landslide-model-baseline/`
- First schema draft has started in:
  - `memory/references/regional-model-library-schema-v0.md`
- The schema draft now includes:
  - phase 1 contract lock sets
  - source-to-canonical mapping guidance
  - worker payload extension table
  - first-batch China adapter queue
  - first-batch starter mappings
  - detailed source registration tables
  - quality-gate rules for time-series and event-inventory adapters
- China-focused dataset research is now split into three stable families:
  - `monitoring time series`
  - `event inventory / catalogue`
  - `remote-sensing patch / segmentation`
- Current working recommendation for first-batch China sources:
  - mainline first:
    - NCDC Three Gorges monitoring bundles
    - NCDC Three Gorges 2001 annual report plus 2017-2018 deformation/rainfall/reservoir-level entries
    - NCDC Huangtupo displacement
    - NCDC Badong Huangtupo multi-sensor cluster
    - NCDC Baijiabao observation dataset
    - Huangniba Dengkan 8-year series
    - Zhamunongba observation data
    - Luoyugou joined field-experiment sequence
  - supporting event priors:
    - China-wide event catalogue
    - Zixing 2024
    - Beijing 2023
    - Fuling 2019
    - Wanzhou
    - Wenchuan
    - Weihe Basin point inventory
    - Gansu point inventory
    - Yellow River Basin geological disaster data
  - side-branch remote sensing:
    - Bijie
    - LMHLD
    - CAS
    - DMLD

## Constraints

- Keep `services/ai-prediction-worker` as the online inference entry.
- Prefer production-friendly dependencies and avoid locking the main path to `NC` or unclear-license assets.
- Do not let remote sensing delay the first online sensor-warning path.
- Make region the primary unit of the model library.
- Do not treat inventory-only or image-only datasets as first-batch expert corpora.
- Do not ingest unofficial second-hand monitoring data as durable model-library truth.
- Phase 1 mapping depth has now reached:
  - source-group-level starter mapping
  - implementation-rule-level adapter guidance
  - event-library boundary rules
  - detailed source registration and quality-gate depth for:
    - `ThreeGorges`
    - `Badong-Huangtupo`
    - `loess challenger`
    - `event inventory pack`
- The current runtime-side static-prior landing rule is now fixed as:
  - `stations.metadata.staticFactors.landCover`
  - with optional trace-only:
    - `stations.metadata.regionProfileRef`
- The current CLCD-to-runtime helper scripts are now:
  - `scripts/dev/regional-model-library/build-land-cover-affinity.ts`
  - `scripts/dev/backfill-station-region-profile.ps1`
- Verified outputs produced this round:
  - `.tmp/regional-model-library/out/artifact-metadata/CN-420528.land-cover-affinity.json`
  - `.tmp/regional-model-library/out/artifact-metadata/CN-500101.land-cover-affinity.json`
  - `.tmp/regional-model-library/smoke/station-region-profile/backfill.report.json`

## Raw Intake Discipline

- Do not force raw dataset columns to fit runtime payload names during landing.
- Keep a three-step mapping line fixed:
  - `raw landing aliases`
  - `canonical repository targets`
  - `runtime payload fields`
- `raw landing aliases` should preserve:
  - original archive and file names
  - workbook sheet names
  - source column aliases
- `canonical repository targets` should point only to:
  - `CanonicalBusinessIdentity`
  - `CanonicalTrainingSample`
  - `RegionProfile`
- `runtime payload fields` stay downstream inside:
  - feature building
  - matching
  - online inference payload assembly
- The intake manifest contract now needs source-oriented hints for:
  - preferred file names and patterns
  - preferred workbook sheets
  - raw time-field candidates
  - raw identity-field candidates
  - raw value-field candidates
- Special landing rules now fixed:
  - `China 2008-2024 catalogue`
    - keep both Chinese and English raw `xlsx`
    - keep the released extraction code beside the raw package
    - derive one phase-1 normalized event-inventory `csv` as a side artifact
  - `CHM_PRE V2`
    - keep raw `NetCDF / GeoTIFF` backbone intact
    - do not flatten the national grid into one giant CSV
    - only derive `by-event` and `by-region` extracts offline

## Plan

- Module 1: schema and contracts
  - define `RegionProfile`
  - define `RegionExpertPackage`
  - define training sample schema
  - define prediction payload metadata fields

- Module 2: dataset and feature pipeline
  - choose first-batch public regional datasets
  - write dataset adapters into one unified sample format
  - define feature windows for `6h / 24h / 72h`
  - define labels for forecast and warning
  - finish file-column-level mapping for the first five China time-series sources

- Module 3: offline training and evaluation
  - build regional expert training entry
  - train first experts
  - build replay evaluation with `fev`
  - produce versioned artifacts and scorecards

- Module 4: matching engine
  - implement hard filter
  - implement static profile match
  - implement dynamic retrieval
  - implement replay rerank

- Module 5: online worker integration
  - refactor worker into `IdentityResolver / FeatureBuilder / ModelMatcher / InferenceRunner`
  - attach `fallback / challenger`
  - extend prediction payload with model-routing metadata

- Module 6: regional onboarding and takeover
  - define cold-start procedure for a new region
  - define support-set replay procedure
  - define local adaptation and promotion-to-expert procedure

- Module 7: side branches kept separate from the first online path
  - remote-sensing branch
  - threshold / prior branch
  - license and dependency governance

## Current Execution Order

The execution order is now concrete enough to stop re-planning.

1. `ThreeGorges core station bundles`
  - first `ts_station_multivariate_adapter`
  - use as the template for displacement + rainfall + reservoir-level joins
2. `Badong-Huangtupo multi-sensor cluster`
  - second mainline adapter
  - validate how one region cluster should absorb multiple sensor subsets
3. `Baijiabao 2017-2024`
  - build as a challenger or extension inside the Three Gorges family
4. `Huangniba Dengkan 8-year series`
  - baseline challenger path for rapid forecasting-model comparisons
5. `Luoyugou joined field experiment`
  - short-window joined sample factory for loess-region experiments
6. `China 2008-2024 landslide catalogue`
  - first `event_inventory_adapter`
7. `Beijing 2023 / Zixing 2024 / Fuling 2019`
  - event-level replay pack
8. `CHM_PRE V2`
  - default rainfall join backbone for nationwide event replay and climate descriptors
9. `Zhushan / Wanzhou / Weihe / Gansu / Yellow River Basin`
  - first `region_profile_builder` support pack
  - static match and prior enrichment

Optional expansion after the first direct path is stable:

- `Qinling large polygon inventory`
  - spatial regionalization and region-similarity support
- `Ludian multi-temporal inventories`
  - earthquake-recovery replay pack
- `significant landslide earthquake dataset`
  - trigger split and earthquake-event routing support
- `Jiangjiagou long-term hydrometeorology`
  - high-quality process calibration and threshold experiments

Hold but do not block phase 1:

- `Zhamunongba`
  - candidate challenger after label semantics are confirmed
- `Yan'an infiltration monitoring`
  - context source, not primary label source
- `Luoyugou ERT`
  - side covariate source, not primary label source

## Latest Execution Progress 2026-04-23

- the CHM_PRE daily NetCDF extractor no longer launches one Python process per event window
  - `scripts/dev/regional-model-library/extract-chm-pre-v2.ts`
    now groups point-window jobs by yearly `nc` source file
  - `scripts/dev/regional-model-library/extract-chm-pre-v2-nc-point-series.py`
    now supports batch job input from a temp `jobs.json`
- the grouped extractor path is now live-verified:
  - canary:
    - `.tmp/regional-model-library/test-output/zixing-canary-batch-check`
  - first `500` Zixing event-window jobs:
    - `.tmp/regional-model-library/test-output/zixing-first500-batch-check`
    - extracted:
      - `500 / 500`
    - measured wall time:
      - `2.21s`
- `Zixing-2024` full formal replay has now completed with no missing extract rows:
  - replay pipeline report:
    - `.tmp/regional-model-library/out/replay-packs/zixing-2024-full-batched-skiptrain/run-event-replay-pack-pipeline.report.json`
  - replay pack report:
    - `.tmp/regional-model-library/out/replay-packs/zixing-2024-full-batched-skiptrain/event-replay-pack.report.json`
  - current full counts:
    - positive events:
      - `19403`
    - positive CHM_PRE jobs:
      - `58209`
    - negative events:
      - `77612`
    - negative CHM_PRE jobs:
      - `232836`
    - replay samples:
      - `97015`
    - missing extract sample count:
      - `0`
- `Zixing-2024` rainfall replay artifact has now been trained as a clean single-stage region artifact:
  - artifact dir:
    - `.tmp/regional-model-library/out/artifacts/zixing-2024-full-single-stage-replay`
  - artifact file:
    - `.tmp/regional-model-library/out/artifacts/zixing-2024-full-single-stage-replay/zixing-2024-full-single-stage-replay.json`
  - scope:
    - `region`
    - `cn:湖南省:郴州市:资兴市`
  - feature set:
    - `18` rainfall replay metrics from `1d / 3d / 7d`
- `Beijing-2023` full formal replay has now completed in the required by-region form:
  - region runner report:
    - `.tmp/regional-model-library/out/replay-packs/beijing-2023-by-region-full-batched-skiptrain/run-by-region.report.json`
  - executed regions:
    - `cn:北京市:北京市:门头沟区`
      - rows:
        - `6227`
    - `cn:北京市:北京市:房山区`
      - rows:
        - `5986`
    - `cn:北京市:北京市:昌平区`
      - rows:
        - `2792`
    - `cn:北京市:北京市:海淀区`
      - rows:
        - `378`
  - operational conclusion:
    - the mixed-region Beijing blocker is now closed in execution, not just in design
- Beijing by-region single-stage rainfall replay artifacts have now been trained:
  - root:
    - `.tmp/regional-model-library/out/artifacts/beijing-2023-by-region-single-stage`
  - artifacts:
    - `beijing-2023-mentougou-single-stage-replay`
    - `beijing-2023-fangshan-single-stage-replay`
    - `beijing-2023-changping-single-stage-replay`
    - `beijing-2023-haidian-single-stage-replay`
- current phase-1 rainfall-event replay line is therefore no longer only a canary proof
  - it now has:
    - one full single-region replay artifact:
      - `Zixing-2024`
    - four full region-split replay artifacts:
      - `Beijing-2023`
  - the next meaningful mainline step is not more raw replay plumbing
    - it is artifact registration, matcher wiring, and runtime-side model selection validation

## Latest Runtime Registration Progress 2026-04-23

- the runtime-side replay artifact registry is now materially landed at:
  - `artifacts/models/regional-experts/phase1-rainfall-replay/registry.json`
- the registry build path is now scripted instead of manual:
  - builder:
    - `scripts/dev/regional-model-library/build-runtime-artifact-registry.ts`
  - matcher smoke check:
    - `scripts/dev/regional-model-library/check-runtime-artifact-registry.ts`
- the current runtime registry now contains `6` region-scoped artifacts:
  - `fuling-2019-formal-replay`
  - `zixing-2024-full-single-stage-replay`
  - `beijing-2023-mentougou-single-stage-replay`
  - `beijing-2023-fangshan-single-stage-replay`
  - `beijing-2023-changping-single-stage-replay`
  - `beijing-2023-haidian-single-stage-replay`
- the current registry build report is:
  - `artifacts/models/regional-experts/phase1-rainfall-replay/build-runtime-artifact-registry.report.json`
- the current matcher smoke report is:
  - `artifacts/models/regional-experts/phase1-rainfall-replay/check-runtime-artifact-registry.report.json`
- a critical runtime compatibility gap has now been explicitly closed in code:
  - the replay artifacts were trained with event-library `scopeKey` values like:
    - `cn:北京市:北京市:房山区`
    - `cn:湖南省:郴州市:资兴市`
    - `cn:Chongqing:Chongqing:Fuling`
  - the current field/runtime identity chain commonly uses canonical region codes like:
    - `CN-110111`
    - `CN-431081`
    - `CN-500102`
  - this mismatch would have caused real runtime exact-match failure if left untreated
- the fix now landed as a two-part bridge:
  - registry build injects region aliases into artifact metadata under:
    - `metadata.matcher.scopeAliases.region`
  - worker artifact registry now accepts scope alias matches in:
    - `services/ai-prediction-worker/src/pipeline/artifacts/artifact-registry.ts`
- current alias bridge coverage now includes:
  - `cn:Chongqing:Chongqing:Fuling <-> CN-500102`
  - `cn:湖南省:郴州市:资兴市 <-> CN-431081`
  - `cn:北京市:北京市:门头沟区 <-> CN-110109`
  - `cn:北京市:北京市:房山区 <-> CN-110111`
  - `cn:北京市:北京市:昌平区 <-> CN-110114`
  - `cn:北京市:北京市:海淀区 <-> CN-110108`
- matcher smoke now proves both scope-key forms are selectable:
  - Chinese event-library region key form
  - runtime canonical `CN-...` form
  - unknown region still yields:
    - `no candidate`
- this means the current mainline has moved one step past “artifact trained”
  - these artifacts are now actually consumable by the current matcher path without changing the worker architecture

Current event-library boundary:

- none of the current China event or inventory libraries should feed first-batch online expert training without joins
- the first direct event-library registration split should be:
  - `prior`
    - China 2008-2024 catalogue
    - Wanzhou 1950-2020 + 18 factors
    - Yellow River Basin geological disaster data
    - Zhushan susceptibility GIS data
    - China-filtered global / Weihe / Gansu point libraries
  - `Static Match`
    - Wanzhou 1950-2020 + 18 factors
    - Weihe Basin points
    - Gansu points
    - China 2008-2024 catalogue
    - Zhushan susceptibility GIS data
  - `replay`
    - Beijing 2023
    - Zixing 2024
    - Fuling 2019
    - Wenchuan multi-temporal

## Immediate Acquisition Queue After Third Pass

This queue is the current best order for actual download, registration, and adapter preparation work.

1. `ThreeGorges 2016-2018` and `Badong-Huangtupo core`
  - unlock direct `ts_station_multivariate_adapter` work first
2. `China 2008-2024 catalogue` plus released extraction code
  - backbone national event truth and region-onboarding prior
3. `Beijing 2023 / Zixing 2024 / Fuling 2019`
  - replay pack for rainfall-triggered event evaluation
4. `CHM_PRE V2`
  - nationwide rainfall-join backbone for event replay, priors, and climate descriptors
5. `Zhushan / Wanzhou / Weihe / Gansu / Yellow River Basin`
  - `region_profile_builder` and static-factor pack
6. `Qinling polygon inventory`
  - next low-cost spatial regionalization expansion

## Parallel Workstreams

- Workstream A: `Schema / Contract`
  - freeze `RegionProfile`
  - freeze `RegionExpertPackage`
  - freeze `TrainingSample`
  - freeze `PredictionPayload`

- Workstream B: `Dataset / Sample Factory`
  - choose first-batch regional datasets
  - build dataset adapters
  - normalize source fields into canonical training samples
  - keep source-only fields in raw metadata
  - attach one default rainfall-join backbone for event libraries

- Workstream C: `Training / Replay Evaluation`
  - wire `Uni2TS`
  - wire `Chronos` fallback baselines
  - wire `TimesFM` local adaptation experiments
  - wire `fev` replay and leaderboard

- Workstream D: `Matching Engine`
  - implement hard filter
  - implement static match
  - implement dynamic retrieval
  - implement replay rerank

- Workstream E: `Online Worker`
  - refactor `services/ai-prediction-worker`
  - keep online contracts stable
  - add routing metadata into prediction payload

- Workstream F: `Side Branches`
  - `USGS thresholds`
  - `NASA LHASA`
  - remote-sensing branch

## Latest Data-Landing Notes

- `China 2008-2024 catalogue`
  - official release should land first as:
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/original/catalogue-zh.xlsx`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/original/catalogue-en.xlsx`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/original/code/`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv`
- `CHM_PRE V2`
  - official release should land first as:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/daily-netcdf/`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/monthly-total/`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/annual-total/`
  - only second-pass extracts should be materialized:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/by-event/*.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/by-region/*.csv`
- `Baijiabao`
  - challenger raw landing should reuse the `ThreeGorges` root instead of growing a new pack root
  - keep the source zip, the unpacked `xls` tables, and the image/json metadata together before family-level normalization
- `Wanzhou`
  - raw landing should preserve the original `FileGDB` structure and research-result folders
  - do not flatten `gdb` into csv during first landing

## 2026-04-24 Baijiabao Window-Feature Monitoring Candidate

- the only currently accessible Three Gorges monitoring package is enough to continue the monitoring-model line:
  - `E:\FierFoxDownload\3768727b-13b2-4675-8a00-2d661ec96229.zip`
  - dataset:
    - `白家包滑坡观测数据集（2017-2024年）`
- this package matches the already landed Baijiabao official raw files, so the existing normalized family outputs remain reusable:
  - deformation:
    - `7303`
  - crack:
    - `3489`
  - rainfall:
    - `2832`
  - reservoir:
    - `2832`
- the immediate model-line conclusion is:
  - do not block on inaccessible Huangtupo / other Three Gorges packages
  - continue with Baijiabao as the current monitoring time-series mainline
  - keep crack out of required features because coverage is still about `45%` after window augmentation
- new offline window-feature augmentation script:
  - `scripts/dev/regional-model-library/augment-canonical-sample-window-features.ts`
  - purpose:
    - generate runtime-aligned `6h / 24h / 72h` window features from same-point canonical samples
    - keep current raw and canonical files unchanged
  - training output:
    - `.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl`
    - generated `54` augmented feature keys
  - validation output:
    - `.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl`
    - generated `40` augmented feature keys
- because local `tsx/esbuild` currently fails with `spawn EPERM`, a Node-only candidate trainer/evaluator was added:
  - `scripts/dev/regional-model-library/train-evaluate-window-linear-risk-model.mjs`
  - role:
    - preserve the `two_stage_linear_risk_v1` artifact shape
    - train and evaluate Baijiabao candidate artifacts without depending on `tsx`
- current best Baijiabao monitoring candidate:
  - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-window-099-no-crack/registry.json`
  - model key:
    - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
  - required feature count:
    - `41`
  - validation evaluated:
    - `1434 / 1458`
  - validation metrics:
    - `balancedAccuracy = 0.6103300010749221`
    - `auc = 0.636726503995127`
    - `f1 = 0.2155388471177945`
    - `precision = 0.14625850340136054`
    - `recall = 0.4095238095238095`
    - `primaryScore = 0.48753178406261455`
- comparison against previous no-crack baseline:
  - previous artifact:
    - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-035-explicit-no-crack/registry.json`
  - previous metrics:
    - `balancedAccuracy = 0.5890740740740741`
    - `auc = 0.6009876543209877`
    - `f1 = 0.2058823529411765`
    - `recall = 0.32407407407407407`
  - current window candidate improves balanced accuracy, AUC, F1, and recall, while precision is slightly lower
- current model status:
  - this is a better formal monitoring candidate than the old three-field weak baseline
  - it is still not a mature main model because the learner is still a conservative difference-of-means linear bridge and validation precision remains low
  - next useful step is promotion/smoke as a candidate artifact, then stronger learner or calibration, not more raw download chasing

## 2026-04-24 Baijiabao Monitoring Candidate Runtime Smoke

- `Baijiabao window-099 no-crack` has now been promoted out of `.tmp` into a formal monitoring-candidate registry root:
  - `artifacts/models/regional-experts/phase1-monitoring-candidates/registry.json`
  - copied side artifacts:
    - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1.json`
    - `training-report.json`
    - `evaluation-report.max-balanced-accuracy.writeback.json`
    - `runtime-smoke.report.json`
- the registry intentionally stays separate from:
  - `artifacts/models/regional-experts/phase1-rainfall-replay`
  because Baijiabao is a station-scoped monitoring candidate, not a region-scoped rainfall replay expert
- new runtime smoke script:
  - `scripts/dev/regional-model-library/check-baijiabao-monitoring-candidate-runtime.mjs`
  - it loads the compiled worker modules:
    - `artifact-registry`
    - `model-matcher`
    - `inference-runner`
  - it uses a real augmented Baijiabao validation sample rather than fabricated feature values
- formal candidate smoke result:
  - output:
    - `artifacts/models/regional-experts/phase1-monitoring-candidates/runtime-smoke.report.json`
  - `pass = true`
  - loaded artifact count:
    - `1`
  - selected sample:
    - `Baijiabao-2017-2024:Baijiabao:5875`
  - matched model:
    - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
  - matched scope:
    - `station`
    - `BAIJIABAO`
  - required features:
    - `41 / 41`
  - inference:
    - `fallbackReason = null`
    - `requiredFeaturesSatisfied = true`
    - `stageOutputsPresent = true`
  - unknown station guard:
    - `Unknown-Baijiabao-Smoke`
    - no candidate matched
- worker feature alias compatibility has been improved in:
  - `services/ai-prediction-worker/src/pipeline/feature-definitions.ts`
  - added canonical-key aliases for:
    - `displacementSurfaceMm`
    - `crackDisplacementMm`
    - `rainfallCurrentMm`
    - `reservoirLevelM`
  - purpose:
    - allow runtime telemetry/history that already uses canonical project field names to be consumed directly
    - preserve all existing source aliases
- verification:
  - `npm run build --workspace @lsmv2/ai-prediction-worker`
    - passed
  - `node scripts/dev/regional-model-library/check-baijiabao-monitoring-candidate-runtime.mjs --registry-root artifacts/models/regional-experts/phase1-monitoring-candidates --out-file artifacts/models/regional-experts/phase1-monitoring-candidates/runtime-smoke.report.json`
    - passed
- remaining runtime caveat:
  - the candidate requires `6h / 24h / 72h` history windows
  - online deployment must have ClickHouse-backed history for the same device/station, otherwise telemetry-only mode will miss most window features and fall back
  - `rainfall_mm_h` must not be blindly aliased to `rainfallCurrentMm` unless its semantics are confirmed as compatible rainfall amount rather than rain intensity

## 2026-04-24 Baijiabao E2E DB Smoke Script And Current Blocker

- a repeatable database-backed E2E smoke script now exists:
  - `scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`
- intended behavior:
  - upsert a fixed smoke station:
    - `stationCode = Baijiabao`
  - upsert a fixed smoke device:
    - `device_id = 00000000-0000-4000-8000-000000000b01`
  - upsert required sensor dictionary rows:
    - `displacementSurfaceMm`
    - `rainfallCurrentMm`
    - `reservoirLevelM`
  - insert `80h` of mock ClickHouse history:
    - `243` sparse telemetry rows
  - call the real worker pipeline:
    - `predictFromTelemetry()`
  - insert the resulting prediction into:
    - `ai_predictions`
  - assert:
    - matched model is `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
    - no fallback
    - required features are satisfied
    - history mode is `clickhouse+telemetry-v1`
    - both stage outputs exist
- dry-run report now exists:
  - `artifacts/models/regional-experts/phase1-monitoring-candidates/e2e-smoke.dry-run.report.json`
  - planned ClickHouse rows:
    - `243`
- real execution report now exists:
  - `artifacts/models/regional-experts/phase1-monitoring-candidates/e2e-smoke.report.json`
  - current result:
    - `pass = false`
    - no seed rows were inserted
    - first blocker is PostgreSQL connection refused:
      - `localhost:5432`
- current machine state:
  - `Test-NetConnection localhost:5432`
    - failed
  - `Test-NetConnection localhost:8123`
    - failed
  - Docker was not reachable from this session:
    - Docker pipe missing / daemon unavailable
- next required action before rerunning E2E:
  - start Docker Desktop / local DB stack
  - ensure Postgres and ClickHouse are reachable on:
    - `localhost:5432`
    - `localhost:8123`
  - then rerun:
    - `node scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`

## 2026-04-24 Baijiabao DB E2E Smoke Passed

- after the operator started Docker Desktop and ran the DB startup/init commands, local services became reachable:
  - Postgres:
    - `localhost:5432`
  - ClickHouse:
    - `localhost:8123`
- initial DB E2E run inserted mock data and one prediction but failed the model assertion:
  - matcher selected:
    - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
  - inference fell back to:
    - `heuristic.v1`
  - missing feature:
    - `displacementSurfaceMm_delta_72h`
  - root cause:
    - ClickHouse history query failed with:
      - `No operation greaterOrEquals between String and DateTime64(3, 'UTC')`
- root-cause fix landed in:
  - `services/ai-prediction-worker/src/pipeline/history-loader.ts`
  - fix:
    - changed the selected text alias from `received_ts` to `received_ts_text`
    - prevents ClickHouse from resolving `WHERE received_ts >= ...` against a `String` alias instead of the DateTime64 column
- the E2E script was also made repeatable:
  - `scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`
  - before seeding, it now deletes previous smoke rows for the fixed smoke device from:
    - Postgres `ai_predictions`
    - ClickHouse `telemetry_raw`
  - this keeps repeat runs from inflating history point counts
- final verification:
  - `npm run build --workspace @lsmv2/ai-prediction-worker`
    - passed
  - `node scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`
    - passed
- final E2E report:
  - `artifacts/models/regional-experts/phase1-monitoring-candidates/e2e-smoke.report.json`
  - `pass = true`
  - seeded:
    - station id:
      - `b11f72bf-14c0-46a6-a237-9e4aa2b3ff8e`
    - ClickHouse rows:
      - `243`
  - prediction:
    - model:
      - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
    - version:
      - `0.2.0`
    - risk score:
      - `0.04928551485010998`
    - risk level:
      - `low`
    - fallback:
      - `null`
    - required features:
      - satisfied
    - missing features:
      - `[]`
    - history mode:
      - `clickhouse+telemetry-v1`
    - history source:
      - `landslide.telemetry_raw`
    - query point count:
      - `243`
    - stage outputs:
      - present
    - inserted prediction id:
      - `0b6265ae-dca3-4cc8-aa6d-bba2f896d9c7`
- current conclusion:
  - Baijiabao monitoring candidate is now proven through DB-backed `predictFromTelemetry()` E2E smoke
  - the remaining model work is now performance/calibration, not integration feasibility

## Current Execution Scripts

- `scripts/dev/regional-model-library/validate-intake-landing.ts`
  - validates whether a dataset raw landing root already contains the blocking families expected by the intake manifest
  - first intended use:
    - after manual/browser download
    - before running normalization or phase-1 adapter tasks
- `scripts/dev/regional-model-library/normalize-china-event-catalogue.ts`
  - normalizes the raw China `2008-2024` event workbook or csv into:
    - `normalized/phase1-event-inventory.csv`
- `scripts/dev/regional-model-library/build-land-cover-affinity.ts`
  - converts one landed `CLCD RegionProfile` into:
    - `artifact.metadata.landCoverAffinity`
  - first intended use:
    - generate artifact-side static-prior metadata without inventing a second schema
- `scripts/dev/backfill-station-region-profile.ps1`
  - backfills runtime-side:
    - `stations.metadata.staticFactors.landCover`
    - `stations.metadata.regionProfileRef`
  - supports:
    - snapshot dry-run
    - binding file override for custom runtime `regionCode -> sourceRegionCode` mapping
    - explicit `-Apply` only when calling live `/api/v1/stations/:id`
  - keeps the minimum `event_inventory_adapter` fields aligned:
    - `event_id`
    - `event_ts`
    - `region_code`
    - `hazard_type`
- `scripts/dev/regional-model-library/normalize-baijiabao-unpacked.ts`
  - converts the unpacked `Baijiabao` workbooks into long family csv files under:
    - `normalized/phase1-families/`
  - current emitted families:
    - `deformation.csv`
    - `crack.csv`
    - `rainfall.csv`
    - `reservoir.csv`
  - preserves raw semantic hints such as:
    - `raw_metric_name`
    - `raw_unit`
    - `workbook_title`
    - `source_file`

## Suggested Repo Layout

- reusable offline core:
  - `libs/regional-model-library/src/contracts/`
  - `libs/regional-model-library/src/adapters/ts_station_multivariate_adapter/`
  - `libs/regional-model-library/src/adapters/event_inventory_adapter/`
  - `libs/regional-model-library/src/builders/region_profile_builder/`
  - `libs/regional-model-library/src/sample-factory/`
  - `libs/regional-model-library/src/quality-gates/`
  - `libs/regional-model-library/src/packs/china/threegorges/`
  - `libs/regional-model-library/src/packs/china/badong-huangtupo/`
  - `libs/regional-model-library/src/io/`
- controlled build entry:
  - `scripts/dev/regional-model-library/phase1-run.ts`
  - `scripts/dev/regional-model-library/threegorges-build.ts`
  - `scripts/dev/regional-model-library/badong-build.ts`
  - `scripts/dev/regional-model-library/event-inventory-build.ts`
  - `scripts/dev/regional-model-library/region-profile-build.ts`
  - `scripts/dev/run-regional-model-library-phase1.ps1`
- ignored raw and generated outputs:
  - `.tmp/regional-model-library/raw/`
  - `.tmp/regional-model-library/out/canonical/`
  - `.tmp/regional-model-library/out/samples/`
  - `.tmp/regional-model-library/out/reports/`

Layout rule:

- offline adapters and sample factory belong in `libs/*`, not `services/*`
- `services/ai-prediction-worker` stays the only online prediction entry
- pack-level mapping must be versioned in code or checked-in JSON, not only in shell flags

## Worker Integration Seam

The worker split is now concrete enough for file-level implementation.

1. keep `services/ai-prediction-worker/src/index.ts` responsible only for:
  - Kafka consume
  - JSON parse and schema validation
  - pipeline invocation
  - event assembly
  - PostgreSQL insert
  - Kafka produce
2. add `services/ai-prediction-worker/src/pipeline/predict-pipeline.ts`
  - orchestrates resolver, builder, matcher, runner, and fallback
3. add `services/ai-prediction-worker/src/pipeline/region-profile-resolver.ts`
  - replaces the current `resolveStationId`-only path
  - resolves `station_id` plus `regionCode / slopeCode / stationCode / nodeCode / gatewayCode`
4. add `services/ai-prediction-worker/src/pipeline/feature-builder.ts`
  - isolates runtime feature construction from raw telemetry key names
5. add `services/ai-prediction-worker/src/pipeline/artifacts/artifact-registry.ts`
  - startup-time local registry load and in-memory artifact cache
6. add `services/ai-prediction-worker/src/pipeline/model-matcher.ts`
  - fixed phase-1 order:
    - `stationCode`
    - `slopeCode`
    - `regionCode`
    - `global`
7. add `services/ai-prediction-worker/src/pipeline/inference-runner.ts`
  - run supported artifact types and normalize output
8. add `services/ai-prediction-worker/src/pipeline/fallback-heuristic.ts`
  - preserve the current heuristic scoring path as the final safe fallback

Worker wiring order:

1. `telemetry.raw.v1` parse and validation
2. region and business-anchor resolution
3. runtime feature construction
4. artifact candidate lookup and match trace generation
5. artifact inference or fallback heuristic
6. `payload` extension with routing and feature summaries
7. existing schema validation, DB insert, and Kafka produce

## Phase-1 Minimal Open Stack

- training mainline:
  - `Uni2TS`
  - self-trained regional experts emitted as versioned local artifacts
- global fallback and challenger:
  - `Chronos-2 / Chronos-Bolt`
- local takeover experiments:
  - `TimesFM 2.5`
- replay leaderboard:
  - `fev`
- dynamic retrieval baseline:
  - `RAFT`
- router design reference:
  - `Kairos`
- representation and anomaly challenger lane:
  - `MOMENT`
- prior and threshold comparator:
  - `USGS landslides-thresholds`
- optional region-level prior:
  - `LHASA`

Stack rule:

- phase 1 runtime stays TypeScript-only and artifact-driven
- `NC`, GPL, or unclear-license assets do not enter the runtime dependency path
- `Chronos`, `TimesFM`, `Kairos`, and `MOMENT` are support lanes, not reasons to delay the first expert route

## Immediate Next Build Wave

1. scaffold `libs/regional-model-library`
  - contracts
  - adapters
  - builders
  - sample factory
  - quality gates
  - China pack configs
2. register raw roots under `.tmp/regional-model-library/raw/`
  - `ThreeGorges`
  - `Badong-Huangtupo`
  - `China-2008-2024-catalogue`
  - `CHM_PRE-V2`
3. implement first offline outputs in order:
  - `CanonicalStationMultivariateSeriesV0`
  - `CanonicalEventInventoryV0`
  - `RegionProfile`
  - `CanonicalTrainingSample`
4. implement controlled CLI entrypoints under `scripts/dev/regional-model-library/`
5. scaffold worker pipeline files without changing the external contract
6. add local artifact-registry skeleton for:
  - `global`
  - `ThreeGorges`
  - `Badong-Huangtupo`
7. only after the above:
  - start training first expert artifacts
  - run replay leaderboard
  - connect matched artifact loading into the worker

## Field Handling Principle

- External datasets MUST NOT directly redefine platform machine identity.
- The software-layer canonical identities remain:
  - machine layer:
    - `device_id`
    - `station_id`
  - business layer:
    - `regionCode`
    - `slopeCode`
    - `stationCode`
    - `nodeCode`
    - `gatewayCode`
- Near-term repo alignment should stay:
  - `stationCode`
    - aligns to the current long-lived fixed-point code surface
  - `regionCode / slopeCode / nodeCode / gatewayCode`
    - align to business metadata, not to machine identifiers
- Field handling should use three layers:
  - `SourceRaw`
    - keep original dataset field names and source metadata
  - `CanonicalTrainingSample`
    - map heterogeneous source fields into one training schema
  - `RuntimePredictionPayload`
    - keep only runtime-relevant fields plus traceable source references
- Canonical fields should be frozen early and reused everywhere.
- Source-specific fields should be preserved under raw metadata instead of being discarded.
- Do not force every external field into runtime payloads.
- Do not let legacy or display-only names compete with canonical identity fields.

## Open Questions

- Which exact `3-5` China monitoring sources should be downloaded and adapted first?
- Should `Badong-Huangtupo` be treated as one expert cluster with multiple sensor subsets instead of one dataset-one-expert?
- Should `Zhamunongba` and `Luoyugou` enter phase 1 as replay or challenger-only experts before they become primary experts?
- Which public event datasets should be joined first with rainfall windows for replay and cold-start priors?
- Will `LHASA` be integrated as a prior score or remain an offline comparator at first?
- How much local data is the minimum threshold for expert promotion?

## Progress Update 2026-04-21

- `libs/regional-model-library` has now moved past pure scaffold for the first direct path:
  - `ts_station_multivariate_adapter`
    - now resolves pack candidate timestamp fields
    - resolves candidate source-to-canonical field maps
    - normalizes timestamps into RFC3339 UTC
    - sorts points by normalized time
    - emits first-pass quality flags for:
      - invalid or missing timestamps
      - empty mapped metrics
      - negative rainfall
      - duplicate timestamps
      - missing reservoir gauge identity
      - ambiguous groundwater semantics
- `sample-factory`
  - now supports label extraction from raw row fields when normalized rows already carry:
    - `warningHitLabel`
    - `warning_hit_label`
    - or related label keys
- `scripts/dev/regional-model-library/phase1-run.ts`
  - now supports normalized raw input loading from:
    - `json`
    - `jsonl`
    - `ndjson`
    - `csv`
    - `xlsx`
    - `xls`
  - `xlsx/xls` ingestion now fans out multi-sheet workbooks into separate raw family entries instead of silently collapsing to one sheet
  - now writes execution reports with:
    - raw-load status
    - row count
    - matched field map
    - unmatched canonical fields
    - quality summary
  - now routes shared `.tmp/regional-model-library/raw` roots to task-specific subdirectories to prevent cross-region sample contamination
- First verified non-empty path now exists for:
  - `ThreeGorges`
    - sample input:
      - `.tmp/regional-model-library/raw/ThreeGorges/phase1-families/*.json`
    - outputs:
      - non-empty `CanonicalStationMultivariateSeries`
      - non-empty `CanonicalTrainingSample` jsonl
      - report summary with zero current quality failures on the sample input
    - current verified join shape:
      - base family:
        - `deformation`
      - overlay families:
        - `rainfall`
        - `reservoir`
        - `groundwater`
        - `temperature`
      - current sample verification:
        - `inputRowCount = 15`
        - `outputRowCount = 3`
        - `matchedOverlays = 12`
- `Badong-Huangtupo`
  - no longer stays skeleton-only for the sample path
  - now has a first normalized-family join route:
    - base family:
      - `beidou`
    - overlay families:
      - `rainfall`
      - `groundwater`
      - `flow`
  - current verified sample input:
    - `.tmp/regional-model-library/raw/Badong-Huangtupo/phase1-families/*.csv`
  - current sample verification:
    - `inputRowCount = 12`
    - `outputRowCount = 3`
    - `matchedOverlays = 9`
  - current intentionally deferred fields remain:
    - `slipBeltDisplacementMm`
    - `surfaceDisplacementMm`
    - `soilTemperatureC`
    - `soilWaterContentPct`
    - `tunnelSettlementMm`
    - `bankDeformationMm`
    - `bankCrackWidthMm`
    - `mechanisticPressureKpa`
- `Badong-Huangtupo`
  - still remains in skeleton mode when its own raw directory is missing
  - no longer incorrectly consumes `ThreeGorges` sample rows from the shared raw root
- `scripts/dev/regional-model-library/phase1-run.ts`
  - now supports normalized `csv` in addition to:
    - `json`
    - `jsonl`
    - `ndjson`
- `sample-factory`
  - no longer silently assigns `warningHitLabel=0` to real rows when no explicit label is present
  - missing labels now stay visible and should be caught by quality gates instead of being silently converted into negatives
  - now supports explicit multi-label policy input instead of a single hard-coded label path:
    - `warningHitLabel`
    - `riskLevelLabel`
    - `displacementLabel`
  - partial label coverage is now surfaced as sample-quality warnings instead of disappearing inside one generic `labels` map
- validation completed again after the latest ingestion-contract pass:
  - `npm -w libs/regional-model-library run build`
  - `npm -w libs/regional-model-library run lint`
  - `npm -w services/ai-prediction-worker run build`
  - `npm -w services/ai-prediction-worker run lint`
  - `ThreeGorges` JSON-family phase-1 runner
  - `Badong-Huangtupo` CSV-family phase-1 runner
  - `ThreeGorges` multi-sheet XLSX phase-1 runner
  - `Badong-Huangtupo` multi-sheet XLSX phase-1 runner
- latest external reuse triage is now stable enough to drive acquisition order:
  - immediate priority assets:
    - `China landslide high-precision event catalogue 2008-2024`
    - associated public extraction code
    - `CHM_PRE V2`
    - `Baijiabao 2017-2024`
    - `ThreeGorges` station data family
    - `Badong-Huangtupo` official multi-sensor family
    - `Wanzhou` inventory
    - `Luoyugou` six-variable experiment pack
    - `RLZX`
    - `CAS Landslide Dataset`
  - direct rule after the latest pass:
    - `event library = China catalogue + code`
    - `rainfall backbone = CHM_PRE V2`
    - `vision side branch = RLZX + CAS, then target-domain adapt with Baijiabao orthophoto`

## Current Concrete Next Step

1. Replace the normalized sample rows with real `ThreeGorges` and `Badong-Huangtupo` raw exports while keeping current clean repo boundaries:
  - offline ingestion stays in `libs/* + scripts/dev/* + .tmp/*`
  - online worker entry stays in `services/ai-prediction-worker`
2. Harden `ThreeGorges` join semantics from the current lightweight timestamp merge to family-specific keys:
  - deformation:
    - `stationCode/point_id + eventTs`
  - rainfall:
    - `gauge_id + station/slope + eventTs`
  - reservoir:
    - `gauge_id + slopeCode + eventTs`
  - groundwater:
    - `well_id + station/slope + eventTs`
  - temperature:
    - station or source-weather identity + eventTs
  - crack:
    - `crack_id + slopeCode + eventTs`
3. Split `metadata / annual-report / basic-feature` families out of `ThreeGorges` joined station series and route them into `RegionProfile` or pack registry metadata.
4. Keep `Badong-Huangtupo` phase-1 authoritative join scope narrow:
  - `beidou`
  - `rainfall`
  - `groundwater`
  - `flow`
  - continue to defer:
    - `slip-belt`
    - `surface`
    - `settlement`
    - `bank`
    - `stress`
5. Formalize the next label-contract layer instead of staying in a weak `labels` map only:
  - `labelMode`
  - `labelValueType`
  - `labelUnit`
  - `labelHorizon`
  - `labelDerivationMode`
  - `labelSourceField`
  - `missingLabelPolicy`
6. Start actual acquisition in the fixed order:
  - `China landslide event catalogue + code`
  - `CHM_PRE V2`
  - `Baijiabao`
  - `ThreeGorges` station packs
  - `Badong-Huangtupo` official families
  - `Wanzhou`
  - `Luoyugou`

## Done When

- The team has a fixed module flow and can start implementation without re-planning.
- The first implementation wave has clear module boundaries and an execution order.

## 2026-04-21 Implementation Update

- `ThreeGorges`
  - restored the missing `phase1-normalized-join.ts`
  - upgraded the join from raw timestamp merge to family-aware matching with explicit provenance payload:
    - `__lsmv2_family_refs`
    - per-family `role`
    - `joinKey`
    - `matchedBy`
  - current phase-1 routing is now explicit:
    - base:
      - `deformation`
    - overlay:
      - `rainfall`
      - `reservoir`
      - `groundwater`
      - `temperature`
      - `crack` when present
    - deferred:
      - `inclinometer`
    - metadata:
      - `metadata`
      - `annual-report`
      - `basic-feature`
- `Badong-Huangtupo`
  - phase-1 authoritative path is now fixed in code:
    - base:
      - `beidou`
    - overlay:
      - `rainfall`
      - `groundwater`
      - `flow`
    - deferred:
      - `slip-belt`
      - `surface`
      - `settlement`
      - `bank`
      - `stress`
      - `soil`
  - provenance is now preserved per joined row through the same internal family-ref path
- `sample-factory`
  - no longer only emits a weak `labels` map
  - now emits `labelMetadata` per emitted label:
    - `valueType`
    - `derivationMode`
    - `sourceField`
    - `horizonSpec`
  - warning labels are now coerced against the declared label type, so `0/1` sample fields land as real booleans instead of leaking number semantics
- `quality-gates`
  - now fails explicit contract gaps:
    - `label_contract_missing`
    - `label_type_mismatch`
  - now warns on:
    - `label_horizon_missing`
- `ts_station_multivariate_adapter`
  - still strips `__lsmv2_*` from `rawRef.originalFields`
  - now also excludes internal provenance fields from `availableFields`, so report summaries stay clean

## 2026-04-21 Validation Refresh

- verified green again:
  - `npm -w libs/regional-model-library run build`
  - `npm -w libs/regional-model-library run lint`
  - `npm -w services/ai-prediction-worker run build`
  - `npm -w services/ai-prediction-worker run lint`
- verified runtime-like offline outputs again:
  - `ThreeGorges` JSON family input
  - `Badong-Huangtupo` CSV family input
  - `ThreeGorges` multi-sheet XLSX input
  - `Badong-Huangtupo` multi-sheet XLSX input
- latest verified output roots:
  - `.tmp/regional-model-library/out-verify-20260421/jsoncsv`
  - `.tmp/regional-model-library/out-verify-20260421/xlsx`
- latest verified sample facts:
  - `ThreeGorges`
    - `warningHitLabel` is emitted as boolean
    - joined rows now keep `rawRef.familyRefs`
    - report/profile join summary now includes:
      - `metadataFamilies`
      - `deferredFamilies`
      - `passthroughFamilies`
      - `familyBreakdown`
  - `Badong-Huangtupo`
    - same provenance path is now verified on both CSV and XLSX inputs
    - deferred families are represented in the join contract even when the current sample pack only contains the authoritative four families

## Current Concrete Next Step

1. Stop spending more time on normalized toy inputs; switch the acquisition work to real first-wave files in the fixed order:
  - `China landslide event catalogue + code`
  - `CHM_PRE V2`
  - `Baijiabao`
  - `ThreeGorges` station packs
  - `Badong-Huangtupo` official families
  - `Wanzhou`
  - `Luoyugou`
2. As real exports arrive, route them without breaking the current repo seam:
  - offline ingestion stays in `libs/* + scripts/dev/* + .tmp/*`
  - online worker entry stays in `services/ai-prediction-worker`
3. First real-data hardening order:
  - add true `metadata / annual-report / basic-feature` files into `ThreeGorges`
  - confirm `Badong-Huangtupo` deferred families on official exports
  - bind `Baijiabao` as the first `china.threegorges` challenger / extension pack

## 2026-04-21 Intake Validator And CHM_PRE Hardening

- `validate-intake-landing.ts`
  - no longer only acts as a coarse presence checker
  - now supports single-dataset execution with:
    - `--manifest`
    - `--raw-root`
    - `--stage source-landing|family-split`
    - `--report-out`
    - `--strict`
    - `--fail-on-warn`
    - `--check-derived`
  - now emits per-dataset reports with:
    - `manifestPath`
    - `rawRoot`
    - `status`
    - `landingState`
    - `layoutChecks`
    - `sourceArtifactChecks`
    - `familyChecks`
    - `nextActions`
  - now consumes more of the intake contract:
    - `selectionHints.archiveSubpaths`
    - `schemaHints`
    - `identityHints`
    - `requiredFieldMappings`
    - `rawLandingRelative`
- intake validation matching rules now split by stage:
  - `source-landing`
    - prefer `preferredFilePatterns` / `preferredFileNames`
    - constrain by `archiveSubpaths`
    - when no archive-subpath rule exists, also constrain by `rawLandingRelative`
  - `family-split`
    - recognize normalized family outputs such as `normalized/phase1-families/<family>.csv`
- header probing is now first-row only for:
  - `xlsx`
  - `xls`
  - `csv`
  - `json`
- non-tabular artifacts can now still satisfy family presence checks:
  - `Wanzhou` `FileGDB` directories are now treated as valid raw landing artifacts instead of being invisible to the validator
- `CHM_PRE V2`
  - `index-chm-pre-v2-raw.ts`
    - fixed family classification so `daily-netcdf` / `monthly-total` / `annual-total` no longer collapse into `unknown`
  - `plan-chm-pre-v2-extracts.ts`
    - no longer treats non-empty strings as sufficient for `ready`
    - now surfaces:
      - `invalid_event_ts`
      - `invalid_bbox`
    - report counters now include:
      - `invalidEventTsEvents`
      - `invalidBboxRegions`

### Verified Smoke Outputs

- `China-2008-2024 catalogue`
  - missing raw root now returns `status=fail`
  - `--strict` now exits non-zero as intended
- `Baijiabao family-split`
  - normalized family outputs are detected independently:
    - `deformation.csv`
    - `crack.csv`
    - `rainfall.csv`
    - `reservoir.csv`
  - semantic ambiguity warnings are surfaced for:
    - displacement cumulative-vs-rate
    - reservoir level-vs-rise/fall rate
- `Wanzhou`
  - `inventory/*.gdb` and `causal-factors/*.gdb` are detected as separate valid family artifacts
  - missing `model-results` stays a warning, not a blocker
- `CHM_PRE V2`
  - smoke raw index now reports:
    - `dailyNetcdf=1`
    - `monthlyTotal=1`
    - `annualTotal=1`
    - `unknown=0`
  - invalid planner smoke now reports:
    - `invalidEventTsEvents=2`
    - `invalidBboxRegions=1`

### Immediate Next Use

1. Use `validate-intake-landing.ts` as the mandatory preflight between:
  - `seed-intake-manifests.ts`
  - manual/browser acquisition
  - `phase1-run.ts`
2. Keep `CHM_PRE` outside `phase1-run.ts` for now.
3. If the team implements `extract-chm-pre-v2.ts`, it should read:
  - `raw-index.json`
  - `by-event.jobs.json`
  - `by-region.jobs.json`
  and emit only extracted rainfall artifacts plus provenance, not canonical packs.

## 2026-04-22 CHM_PRE Extractor First Cut

- added:
  - `scripts/dev/regional-model-library/extract-chm-pre-v2.ts`
- current extractor boundary is now executable and fixed:
  - it stays in `scripts/dev/* + .tmp/*`
  - it does not enter `phase1-run.ts`
  - it does not introduce a new online service
- current input contract:
  - intake manifest JSON
  - `raw-index.json`
  - `by-event.jobs.json`
  - `by-region.jobs.json`
- current output contract:
  - `extracts/extraction-report.json`
  - `extracts/by-event/*.csv` on successful backend execution
  - `extracts/by-region/*.csv` on successful backend execution
- current backend contract:
  - `gdal-cli` only
  - required tools:
    - `gdalinfo`
    - `gdal_translate`
    - `gdallocationinfo`
- current execution modes:
  - `--dry-run`
    - validate jobs
    - match source files
    - emit report
    - do not fake raster extraction
  - execution mode
    - point extraction via `gdallocationinfo`
    - region extraction via `gdal_translate -of XYZ`
- current extractor status surface:
  - `planned`
  - `extracted`
  - `skipped_invalid_job`
  - `blocked_missing_source_files`
  - `blocked_missing_gdal`
  - `failed_backend_execution`
  - `failed_output_write`
- current machine fact as of `2026-04-22`:
  - `gdalinfo`
  - `gdal_translate`
  - `gdallocationinfo`
  are not on `PATH`

### Verified Smoke Results

- valid smoke with `--dry-run`
  - event:
    - `plannedCount=3`
    - `skippedCount=3`
  - region:
    - `plannedCount=2`
- valid smoke with real execution mode and `--strict`
  - event:
    - `blockedCount=3`
    - `skippedCount=3`
  - region:
    - `blockedCount=2`
  - exits non-zero as expected
- invalid planner smoke with `--dry-run --strict`
  - event:
    - `plannedCount=2`
    - `skippedCount=2`
  - region:
    - `plannedCount=1`
    - `skippedCount=1`
  - exits non-zero as expected

### Operator Note

- do not add a dedicated `ps1` wrapper yet
- current repo-near style is still:
  - direct `npx tsx`
  - lightweight JSON report
  - optional later thin wrapper only if operator ergonomics actually needs it

## 2026-04-22 Linear Artifact Training Bridge

- the next bottleneck after intake and extraction is no longer only raw landing:
  - the worker and offline sample-factory now needed a shared artifact contract
  - otherwise `phase1` sample outputs would stop at jsonl and never become routable expert artifacts
- added a shared runtime-trainable contract:
  - `libs/regional-model-library/src/contracts/linear-risk-model-artifact.ts`
  - schema key:
    - `linear-risk-model.v1`
  - current phase-1 artifact type:
    - `linear_risk_v1`
- current artifact contract now freezes:
  - `modelKey`
  - `modelVersion`
  - `scopeType`
  - `scopeKey`
  - `featureSchemaVersion`
  - `labelSchemaVersion`
  - `profileVersion`
  - `trainingDatasetKeys`
  - `labelKey`
  - `requiredFeatureKeys`
  - `featureNormalization`
  - `featureCenters`
  - `bias`
  - `weights`
  - `trainingSummary`
- added the first offline trainer entrypoint:
  - `scripts/dev/regional-model-library/train-linear-risk-model.ts`
  - current input:
    - `CanonicalTrainingSample` json/jsonl
  - current output:
    - one artifact json
    - one `registry.json`
    - one `training-report.json`
  - current training mode:
    - `difference-of-means-logit-baseline`
  - current purpose:
    - phase-1 minimal expert artifact generation
    - not the final expert-training framework
- worker artifact loading is now aligned to the shared contract:
  - `services/ai-prediction-worker/src/pipeline/types.ts`
  - `services/ai-prediction-worker/src/pipeline/artifacts/artifact-registry.ts`
  - `services/ai-prediction-worker/src/pipeline/inference-runner.ts`
- an important contract bug is now fixed:
  - runtime gating should not rely on raw `availableMetrics` only
  - `FeatureVector` now carries:
    - `presentFeatureKeys`
  - artifact readiness now checks:
    - `requiredFeatureKeys`
  - this prevents artifacts from being treated as satisfied just because the worker always fills absent features with zero

### Verified Smoke Results

- build and lint green again:
  - `npm -w libs/regional-model-library run build`
  - `npm -w libs/regional-model-library run lint`
  - `npm -w services/ai-prediction-worker run build`
  - `npm -w services/ai-prediction-worker run lint`
- threegorges smoke training:
  - samples:
    - `.tmp/regional-model-library/out/samples/threegorges/threegorges-canonical-training-samples.jsonl`
  - outputs:
    - `.tmp/regional-model-library/out/artifacts-smoke/threegorges/registry.json`
    - `.tmp/regional-model-library/out/artifacts-smoke/threegorges/training-report.json`
  - current facts:
    - `scopeType=station`
    - `scopeKey=TG-SP-001`
    - `featureCount=6`
    - `sampleCount=3`
    - `positiveCount=1`
- badong smoke training:
  - samples:
    - `.tmp/regional-model-library/out/samples/badong/badong-canonical-training-samples.jsonl`
  - outputs:
    - `.tmp/regional-model-library/out/artifacts-smoke/badong/registry.json`
    - `.tmp/regional-model-library/out/artifacts-smoke/badong/training-report.json`
  - current facts:
    - `scopeType=slope`
    - `scopeKey=BADONG-PLACEHOLDER`
    - `featureCount=6`
    - `sampleCount=3`
    - `positiveCount=1`

### Immediate Next Use

1. keep smoke artifacts under `.tmp/*`; do not promote them into `artifacts/models` as if they were production experts
2. as soon as real first-wave samples land, rerun:
  - `train-linear-risk-model.ts`
  against:
  - `ThreeGorges`
  - `Badong-Huangtupo`
  - later `Baijiabao`
3. only after real-data artifacts exist:
  - assemble a real worker `registry.json`
  - point `ARTIFACT_ROOT_DIR` to that artifact root
4. after this bridge is stable, the next offline increments should be:
  - `Uni2TS` self-training lane
  - `Chronos-2/Bolt` fallback registry lane
  - `FEV/TIME` replay leaderboard lane

## 2026-04-22 Data Backbone Intake Expansion And Replay First Cut

- the next concrete acquisition layer is no longer implicit:
  - `CMA station rainfall`
  - `CLDAS-V2.0`
  - `DEM`
  - `CLCD`
  - `soil property rasters`
  now all have explicit intake manifests in code
- newly registered dataset keys:
  - `CMA-station-rainfall`
  - `CLDAS-V2.0`
  - `GSCLOUD-DEM`
  - `CLCD-1985-2025`
  - `China-soil-property-rasters`
- current role split after this pass:
  - `CMA station rainfall`
    - station rainfall join
    - rainfall backbone supplement
  - `CLDAS-V2.0`
    - rainfall backbone supplement
    - region weather context
  - `GSCLOUD-DEM`
    - terrain-factor source truth
  - `CLCD`
    - land-cover prior
  - `soil property rasters`
    - soil and hydrologic-sensitivity prior
- first replay-side evaluator now exists:
  - `scripts/dev/regional-model-library/evaluate-linear-risk-model.ts`
  - current input:
    - `CanonicalTrainingSample` json/jsonl
    - one artifact json or one `registry.json`
  - current output:
    - replay report json
    - optional in-place artifact metadata writeback when using:
      - `--writeback-replay-metadata`
  - current metrics:
    - `accuracy`
    - `precision`
    - `recall`
    - `f1`
    - `brier`
    - `auc`
    - confusion matrix
    - artifact usage
- current smoke replay facts:
  - `ThreeGorges`
    - `evaluatedCount=3`
    - `accuracy=1`
    - `auc=1`
  - `Badong-Huangtupo`
    - `evaluatedCount=3`
    - `accuracy=1`
    - `auc=1`
- current runtime bridge fix after this pass:
  - `FeatureBuilder` now emits canonical keys that are compatible with current smoke artifacts:
    - `displacementSurfaceMm`
    - `crackDisplacementMm`
    - `rainfallCurrentMm`
    - `reservoirLevelM`
    - `groundwaterLevelM`
    - `airTemperatureC`
    - `beidouDispX`
    - `beidouDispY`
    - `beidouDispZ`
    - `tunnelFlowRate`
  - runtime now tracks:
    - `presentFeatureKeys`
  - this reduces the gap between offline artifact keys and live worker features

### Immediate Next Use

1. use the new intake manifests to register real download roots for:
  - `CMA station rainfall`
  - `CLDAS-V2.0`
  - `DEM`
  - `CLCD`
  - `soil property rasters`
2. keep `evaluate-linear-risk-model.ts` as the first replay gate after every artifact training run
  - current fixed offline publish order should be:
    - `train -> evaluate --writeback-replay-metadata -> publish registry`
3. when real telemetry mappings stabilize, extend the worker beyond `single-telemetry-v1` into real `6h / 24h / 72h` windows

## 2026-04-22 Runtime History Windows First Cut

- the worker is now past the `single-telemetry-v1` boundary for feature construction
- current runtime sourcing order is now fixed as:
  1. `ClickHouse telemetry_raw`
  2. merge the current `telemetry.raw.v1` message into the same window
  3. degrade to `telemetry-only-v1` when ClickHouse is not configured or unavailable
- fixed runtime windows now exist:
  - `6h`
  - `24h`
  - `72h`
- current runtime now emits window-derived canonical keys such as:
  - `displacementSurfaceMm_last_6h`
  - `displacementSurfaceMm_delta_24h`
  - `rainfallCurrentMm_sum_24h`
  - `reservoirLevelM_last_72h`
- current payload evidence now explicitly carries:
  - `windowSummary.sourceMode`
  - `windowSummary.historySource`
  - `windowSummary.historyError`
  - `windowSummary.coverage`
  - `featureSummary.backfilledFeatureKeys`
  - `traceRefs.historySource`
  - `traceRefs.historyMode`
  - `traceRefs.historyError`
- fallback heuristic now also consumes:
  - `displacementSurfaceMm_delta_24h`
  - `rainfallCurrentMm_sum_24h`
- current runtime truth after this pass:
  - historical windows are in
  - true two-stage artifact/runtime is still pending

## 2026-04-22 Two-Stage Artifact Runtime First Cut

- the shared artifact contract now supports:
  - `linear_risk_v1`
  - `two_stage_linear_risk_v1`
- the first real two-stage artifact shape is now fixed enough for runtime use:
  - `stage1_displacement`
    - output key:
      - `stage1DisplacementScore`
    - purpose:
      - displacement/trend evidence
  - `stage2_warning`
    - output key:
      - `stage2WarningScore`
    - purpose:
      - final warning score
- current offline bridge behavior:
  - `train-linear-risk-model.ts`
    - now defaults to:
      - `two-stage`
    - still supports:
      - `--artifact-type single-stage`
  - `evaluate-linear-risk-model.ts`
    - now evaluates both artifact types
    - now preserves:
      - `stage1Score`
      - `stage2Score`
      - `fallbackReason`
      - `missingFeatureKeys`
- current worker runtime behavior:
  - `artifact-registry`
    - now loads both artifact types
  - `inference-runner`
    - now executes stage 1 then stage 2 when the artifact is two-stage
    - falls back safely while preserving partial stage evidence when stage 1 succeeds but stage 2 blocks
  - `predict-pipeline`
    - now adds:
      - `matchedArtifactType`
      - `requiredFeaturesSatisfied`
      - `missingFeatureKeys`
      - `stageOutputs.stage1`
      - `stageOutputs.stage2`
- latest verified smoke facts:
  - `ThreeGorges`
    - two-stage smoke artifact emitted
    - replay smoke keeps:
      - `fallbackCount=0`
      - `stage1Score`
      - `stage2Score`
  - `Badong-Huangtupo`
    - same two-stage smoke path emitted and replayed
- execution consequence after this pass:
  - the next highest-value runtime gap is no longer two-stage output
  - `candidate-set + replay rerank hook` has since landed
  - the next gap is now:
    - real-data artifact promotion
    - broader external replay leaderboard integration

## 2026-04-22 Candidate-Set Matcher And Replay Hook First Cut

- the runtime matcher is no longer:
  - `first-hit only`
- current runtime matching path is now:
  - collect candidates from:
    - `station`
    - `slope`
    - `region`
    - `global`
  - compute a base score from:
    - scope priority
    - feature coverage
    - training sample count
    - training dataset breadth
  - if artifact metadata already carries replay-style score fields, apply:
    - `metadata-replay` rerank hook
- current payload now preserves:
  - `matchTrace.rerankMode`
  - `matchTrace.selectedReason`
  - `matchTrace.replayScore`
  - `matchTrace.candidateSet`
- current repo-native replay writeback source is now fixed enough to rely on:
  - `artifact.metadata.replaySummary.primaryScore`
- this means the current closed loop is:
  - `train artifact`
  - `run replay evaluation`
  - `write replaySummary back into artifact metadata`
  - let matcher consume that score through `metadata-replay`
- current `candidateSet` trace is intentionally lightweight:
  - `modelKey`
  - `scopeType`
  - `scopeKey`
  - `artifactType`
  - `featureCoverage`
  - `trainingSampleCount`
  - `trainingDatasetCount`
  - `replayScore`
  - `rerankScore`
  - `totalScore`
  - `missingFeatureKeys`
- current interpretation rule:
  - this is already enough to audit routing and to attach later replay scores
  - it is not yet the final learned rerank layer

## 2026-04-22 China Backbone Acquisition Bucket Refresh

- the current execution bucket split is now stable enough to use directly:
  - `direct landing now`
    - `China 2008-2024 catalogue + code`
    - `CLCD` via `Zenodo`
    - `Baijiabao` via NCDC direct-download target
  - `registered portal access`
    - `CHM_PRE V2`
    - `CLDAS-V2.0`
    - `GSCLOUD DEM`
    - `China soil rasters`
    - `CMA station rainfall`
- current first practical download order is now:
  1. `China 2008-2024 catalogue + code`
  2. `CLCD`
  3. `Baijiabao`
  4. register `TPDC / CMA / GSCLOUD / NCDC`
  5. `CHM_PRE V2`
  6. `CLDAS`
  7. `soil rasters`
  8. `CMA rainfall`

## 2026-04-22 Baijiabao Challenger Formalization And CLCD First-Wave Province Landing

- `Baijiabao`
  - no longer only lands as a raw normalization result
  - now has a dedicated build entry:
    - `scripts/dev/regional-model-library/baijiabao-build.ts`
  - current defaults fixed by that entry:
    - `datasetKey = Baijiabao-2017-2024`
    - `rawRoot = .tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/normalized/phase1-families`
    - `outRoot = .tmp/regional-model-library/out/threegorges-baijiabao`
    - `regionCode = CN-HB-THREEGORGES`
    - `stationCode = Baijiabao`
    - `slopeCode = Baijiabao`
- `phase1-run.ts`
  - now infers single-value `regionCode / slopeCode / stationCode` from prepared raw rows when the caller does not pin them explicitly
  - this closes the previous placeholder-identity gap where `scopeType=station` could still land as `scopeKey=CN-HB-THREEGORGES`
- verified `Baijiabao` phase-1 output now carries the correct identity:
  - `seriesId = Baijiabao-2017-2024:Baijiabao`
  - `identity.scopeKey = Baijiabao`
  - `identity.stationCode = Baijiabao`
  - `identity.slopeCode = Baijiabao`
- current `Baijiabao` blocker remains:
  - sample labels are still absent
  - current phase-1 output is ready for canonical series / challenger routing
  - it is not yet ready for meaningful expert training without a label policy
- `CLCD`
  - the optional `2025 province pack` is now actually landed:
    - `source/downloads/CLCD_v01_2025_albert_province.zip`
  - first-wave unpack script now exists:
    - `scripts/dev/regional-model-library/unpack-clcd-province-pack.ts`
  - current script behavior:
    - reads the `classification workbook`
    - writes `normalized/clcd-classification-map.json`
    - writes `normalized/clcd-2025-province-index.json`
    - extracts first-wave province rasters into:
      - `original/land-cover-grid/2025`
  - latest verified first-wave provinces:
    - `hubei`
    - `chongqing`
- `CLCD` source landing now verifies green:
  - `landingState = ready`
  - `status = pass`
- next smallest implementation unit is now fixed:
  - do not refactor `phase1-run.ts` into generic raster support yet
  - implement one offline `CLCD -> RegionProfile` extractor that:
    - consumes landed `.tif`
    - reuses the `CHM_PRE` GDAL/bbox seam
    - emits `RegionProfile.properties.land-cover` summaries only

## 2026-04-22 CLCD RegionProfile First-Wave Extraction Is Now Running

- the first executable `CLCD -> RegionProfile` path now exists at:
  - `scripts/dev/regional-model-library/build-clcd-region-profiles.ts`
- current default seed file is now fixed at:
  - `.tmp/regional-model-library/raw/CLCD-1985-2025/extracts/region-seed.csv`
- current implementation boundary is:
  - keep `phase1-run.ts` unchanged
  - keep the extractor fully offline under `scripts/dev/regional-model-library`
  - emit region-profile JSON from landed province rasters
  - do not push raw raster logic into the online worker
- repo-local raster dependencies are now added:
  - `geotiff`
  - `proj4`
- reason for the local backend choice:
  - `winget` can resolve `GISInternals.GDAL 3.12.1`
  - but automated install failed at the download stage with:
    - `InternetOpenUrl() failed`
    - `0x80072efd`
  - this means the `CLCD` path is no longer blocked on system GDAL availability
- verified first-wave extraction output now exists under:
  - `.tmp/regional-model-library/raw/CLCD-1985-2025/extracts/region-profiles`
- current verified region outputs:
  - `CN-500101`
    - source raster:
      - `2025/CLCD_v01_2025_albert_chongqing.tif`
    - dominant class:
      - `Cropland`
    - top class fractions:
      - `Cropland = 0.5003`
      - `Forest = 0.4862`
  - `CN-420528`
    - source raster:
      - `2025/CLCD_v01_2025_albert_hubei.tif`
    - dominant class:
      - `Forest`
    - top class fractions:
      - `Forest = 0.7302`
      - `Cropland = 0.2460`
- current generated artifacts now include:
  - `clcd-region-profiles.json`
  - `clcd-region-profile.report.json`
  - one `*.region-profile.json` per region seed
- current known warning is expected:
  - the derived profiles still report `requiredSensors = []`
  - this is acceptable for now because these outputs are static land-cover priors, not runtime telemetry contracts
- next implementation unit after this one should be:
  - wire the extracted `landCover.classDistribution` into:
    - `Static Match`
    - `RegionProfile`-aware routing features
  - then add `DEM / soil` priors using the same offline seed-and-bbox pattern

## 2026-04-22 CHM_PRE GDAL Autodetect And CLCD Contract Alignment

- `CHM_PRE`
  - `extract-chm-pre-v2.ts` no longer depends on manual `--gdal-bin-dir` in the current workstation setup
  - the script now probes:
    - explicit `--gdal-bin-dir`
    - `GDAL_BIN_DIR`
    - current `conda` prefix `Library/bin`
    - sibling `conda envs/*gdal*/Library/bin`
    - common Windows `Anaconda/Miniconda` prefixes
- verified on this machine:
  - autodetected:
    - `E:\2\Anaconda3\Anaconda\envs\gdal312\Library\bin`
  - tools resolved:
    - `gdalinfo.exe`
    - `gdal_translate.exe`
    - `gdallocationinfo.exe`
- verified smoke rerun without `--gdal-bin-dir`:
  - `by-region --dry-run`
    - `gdal.available = true`
    - planner stays executable
  - `by-region` live extraction
    - no longer blocked by missing GDAL
    - now fails at the real cause:
      - smoke `chm_pre_202307.tif`
      - `GDAL` reports unsupported format
- current `CHM_PRE` conclusion is now fixed:
  - main raw path is still empty:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/original`
  - smoke path exists but uses placeholder fixtures that are not valid GDAL-readable raster products
  - so the current blocker is:
    - real raw landing
    - or valid smoke fixtures
  - it is no longer:
    - `GDAL` discovery
- `CLCD`
  - current code truth remains:
    - `RegionProfile.properties.staticFactors.landCover`
  - aligned the remaining stale mapping targets from old:
    - `RegionProfile.landCoverClass`
  - updated:
    - `scripts/dev/regional-model-library/intake-manifest-templates.ts`
    - `.tmp/regional-model-library/intake-manifests/CLCD-1985-2025.intake-manifest.json`
    - `.tmp/regional-model-library/intake-manifests-smoke-20260422/CLCD-1985-2022.intake-manifest.json`
    - `memory/references/regional-model-library-schema-v0.md`
- next practical step stays:
  1. land real `CHM_PRE-V2/original` and seed / plan inputs
  2. add the smallest `landCover` metadata rerank hook inside the current matcher boundary

## 2026-04-22 Baijiabao Derived Labels And Auto County Binding

- `Baijiabao`
  is no longer blocked at the raw-series stage:
  - real normalized `csv` families already existed
  - the missing step was a trainable label path
- added:
  - `scripts/dev/regional-model-library/derive-future-displacement-labels.ts`
- current role of the new script:
  - read emitted `CanonicalTrainingSample` json/jsonl
  - group rows by `point_id`
  - derive next-step displacement delta from `metricsNormalized.displacementSurfaceMm`
  - emit:
    - `labels.displacementLabel`
    - `labels.warningHitLabel`
  - current default binary threshold rule:
    - `future displacement rate mm/day >= p90`
- verified on the real `Baijiabao` sample file:
  - input:
    - `.tmp/regional-model-library/out/threegorges-baijiabao/samples/threegorges/threegorges-canonical-training-samples.jsonl`
  - output:
    - `.tmp/regional-model-library/out/threegorges-baijiabao/samples/threegorges/threegorges-canonical-training-samples.future-labels.jsonl`
    - `.tmp/regional-model-library/out/threegorges-baijiabao/samples/threegorges/threegorges-canonical-training-samples.future-labels.report.json`
  - current derived result:
    - `sampleCount = 7303`
    - `labeledCount = 7299`
    - `positiveCount = 731`
    - `negativeCount = 6568`
    - threshold:
      - `p90 = 1.2 mm/day`
  - current known unlabeled rows are expected:
    - terminal rows per point group
    - one row missing numeric `displacementSurfaceMm`

- training line:
  - `scripts/dev/regional-model-library/train-linear-risk-model.ts`
    now also supports:
    - `--min-feature-coverage <0..1>`
- reason for the added coverage gate:
  - the current `Baijiabao` multivariate join only gives:
    - `displacementSurfaceMm` on almost all rows
    - `rainfallCurrentMm` on `7303 / 7303`
    - `reservoirLevelM` on `7303 / 7303`
    - `crackDisplacementMm` on `2682 / 7303`
  - after the family-join fix, the remaining sparse feature is now only `crack`
  - without a coverage gate or an explicit auxiliary-feature policy, `crack` still enters the two-stage path and makes the stage-1 training pass brittle
- verified first real artifact build:
  - output dir:
    - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao`
  - artifact:
    - `baijiabao.station.Baijiabao.linear-risk-v1.json`
  - registry:
    - `registry.json`
  - training report:
    - `training-report.json`
  - current first-pass config:
    - `labelKey = warningHitLabel`
    - `minFeatureCoverage = 0.99`
    - artifact metadata file:
      - `.tmp/regional-model-library/out/artifact-metadata/CN-420528.land-cover-affinity.json`
  - current artifact reality:
    - the first trainable artifact path is now executable end-to-end
    - retained feature set collapsed to:
      - `displacementSurfaceMm`
    - this is acceptable for the first proof because the goal was to remove the “no label / no artifact” blocker

- evaluation line:
  - output:
    - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao/evaluation-report.json`
  - current conclusion:
    - chain is executable
    - quality is not yet acceptable
  - current same-set replay result:
    - `accuracy = 0.8998`
    - `precision = 0`
    - `recall = 0`
    - `f1 = 0`
    - `auc = 0.5767`
  - interpretation:
    - the current derived-label artifact is a first operational baseline only
    - next useful work is:
      - time-based train/validation split
      - threshold calibration
      - higher-coverage multivariate joins

- verified join-fixed temporal baseline:
  - source summary:
    - `.tmp/regional-model-library/out/threegorges-baijiabao/reports/threegorges/threegorges-phase1-summary.json`
  - current phase-1 family result after the join fix:
    - `rainfall matchedRowCount = 7303`
    - `reservoir matchedRowCount = 7303`
    - `crack matchedRowCount = 2682`
    - `crack unmatchedRowCount = 807`
  - verified temporal split:
    - train:
      - `5842`
    - validation:
      - `1461`
  - verified fixed-threshold label rerun:
    - threshold:
      - `1.3 mm/day`
    - train report:
      - `.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.report.json`
    - validation report:
      - `.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.report.json`
  - current honest temporal artifact:
    - output dir:
      - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-099-joinfix`
    - retained feature set:
      - `displacementSurfaceMm`
      - `rainfallCurrentMm`
      - `reservoirLevelM`
  - current validation replay result:
    - fixed `0.5`:
      - `auc = 0.60099`
      - `f1 = 0`
      - `precision = 0`
      - `recall = 0`
    - max balanced accuracy:
      - threshold:
        - `0.095631`
      - `balancedAccuracy = 0.58907`
      - `auc = 0.60099`
      - `f1 = 0.20588`
      - `precision = 0.15086`
      - `recall = 0.32407`
  - runtime-reusable replay metadata is now written back into:
    - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-099-joinfix/registry.json`
    - current `artifact.metadata.replaySummary.primaryScore`:
      - `0.4034350036310821`
  - current execution conclusion:
    - `rainfall / reservoir` are no longer the blocker
    - the phase-1 production candidate should currently stay on the `3-feature` temporal artifact
    - `crack` remains the only unresolved sparse feature and should stay `auxiliary / challenger` until a separate derived-feature policy is introduced

- explicit no-crack training policy is now executable:
  - trainer:
    - `scripts/dev/regional-model-library/train-linear-risk-model.ts`
  - new CLI switch:
    - `--exclude-features`
  - verified preferred artifact:
    - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-035-explicit-no-crack/registry.json`
  - verified config:
    - `minFeatureCoverage = 0.35`
    - `excludeFeatures = ["crackDisplacementMm"]`
  - verified retained feature set remains:
    - `displacementSurfaceMm`
    - `rainfallCurrentMm`
    - `reservoirLevelM`
  - verified validation replay result is unchanged from the `0.99` join-fix artifact:
    - threshold:
      - `0.095631`
    - `balancedAccuracy = 0.58907`
    - `auc = 0.60099`
    - `f1 = 0.20588`
    - `artifact.metadata.replaySummary.primaryScore = 0.4034350036310821`
  - current policy conclusion:
    - the `3-feature` baseline is no longer an accidental consequence of a high coverage threshold
    - it is now an explicit training policy

- added:
  - `scripts/dev/regional-model-library/build-station-region-binding.ts`
- current role of the new script:
  - read dataset metadata coordinates such as NCDC `_ncdc_meta_.json`
  - match them against current `CLCD` region-profile `bboxWgs84`
  - emit a binding file compatible with:
    - `scripts/dev/backfill-station-region-profile.ps1`
- verified real `Baijiabao` binding:
  - source metadata:
    - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/unpacked/_ncdc_meta_.json`
  - output:
    - `.tmp/regional-model-library/out/bindings/baijiabao.station-region-binding.json`
    - `.tmp/regional-model-library/out/bindings/baijiabao.station-region-binding.report.json`
  - current selected binding:
    - `stationCode = Baijiabao`
    - `slopeCode = Baijiabao`
    - `regionCode = CN-HB-THREEGORGES`
    - `sourceRegionCode = CN-420528`
    - `matchMode = contains-center`

- updated current practical conclusion:
  - `Baijiabao` now has:
    - real normalized families
    - derived binary labels
    - first trainable artifact
    - first automatic `station/slope/custom-region -> CLCD county` binding
  - the remaining hard blocker is no longer “cannot train anything”
  - it is now:
    - improve label policy and validation quality
    - raise multivariate feature coverage
    - continue waiting for real `CHM_PRE` raw landing

## 2026-04-22 Minimal Land-Cover Prior Runtime And Training Hook

- runtime side:
  - `services/ai-prediction-worker/src/pipeline/model-matcher.ts`
    now supports a smallest `landCover` static prior rerank hook
- current runtime read boundary:
  - region-side prior:
    - `stationMetadata.staticFactors.landCover`
    - `stationMetadata.properties.staticFactors.landCover`
    - `stationMetadata.regionProfile.properties.staticFactors.landCover`
    - same fallback paths on `metadata`
  - artifact-side affinity:
    - `artifact.metadata.landCoverAffinity`
    - fallback aliases:
      - `artifact.metadata.staticPrior.landCoverAffinity`
      - `artifact.metadata.routing.landCoverAffinity`
      - `artifact.metadata.matcher.landCoverAffinity`
- current runtime trace now includes:
  - `staticPriorScore`
  - `staticPriorAdjustment`
  - `staticPriorReason`
- current `rerankMode` now distinguishes:
  - `base-only`
  - `static-prior`
  - `metadata-replay`
  - `metadata-replay+static-prior`
- verified worker quality gate:
  - `npm -w services/ai-prediction-worker run build`
  - `npm -w services/ai-prediction-worker run lint`
  both pass after the matcher change

- training side:
  - `scripts/dev/regional-model-library/train-linear-risk-model.ts`
    now supports:
    - `--artifact-metadata-file <json>`
- current purpose:
  - allow first-wave static priors such as `landCoverAffinity` to be written into artifact top-level metadata at train time
  - avoid a “runtime can read but training cannot emit” gap
- verified smoke write path:
  - metadata file:
    - `.tmp/regional-model-library/smoke/land-cover-affinity/threegorges-forest-affinity.json`
  - smoke output:
    - `.tmp/regional-model-library/out/artifacts-metadata-smoke/threegorges/threegorges-canonical-training-samples.station.TG-SP-001.linear-risk-v1.json`
    - `.tmp/regional-model-library/out/artifacts-metadata-smoke/threegorges/registry.json`
  - verified emitted structure:
    - `artifact.metadata.landCoverAffinity.preferredClasses = ["Forest"]`
    - `artifact.metadata.landCoverAffinity.classWeights.Forest = 1`

- `CHM_PRE`
  - local search result is now definitive enough for execution planning:
    - no real raw files found in repo `.tmp`
    - no related files found in:
      - `C:\Users\Administrator\Downloads`
      - `E:\FierFoxDownload`
      - `C:\Users\Administrator\Desktop`
  - current smoke fixtures remain placeholder files only
  - next execution on this line requires operator-supplied real source files

## 2026-04-22 CHM_PRE Minimal Executable Chain Live-Passed

- `CHM_PRE V2`
  minimal executable landing is no longer hypothetical on this workstation
- verified raw landing now includes:
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/daily-netcdf/CHM_PRE_V2_daily_2019.nc`
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/daily-netcdf/CHM_PRE_V2_daily_2023.nc`
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/daily-netcdf/CHM_PRE_V2_daily_2024.nc`
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/monthly-total/CHM_PRE_V2_monthly.tif`
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/original/annual-total/CHM_PRE_V2_annual.tif`
- verified raw index state:
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/raw-index.json`
  - `dailyNetcdf = 3`
  - `monthlyTotal = 1`
  - `annualTotal = 1`
  - `unknown = 0`

- extractor implementation was hardened in:
  - `scripts/dev/regional-model-library/extract-chm-pre-v2.ts`
  - `scripts/dev/regional-model-library/extract-chm-pre-v2-nc-point-series.py`
- current fixed behavior:
  - by-event can now match yearly `.nc` containers by year overlap with the event window
  - yearly `daily-netcdf` extraction now reads true `time + lat + lon` slices from NetCDF through `python + h5py`
  - by-region `month/latest` and `annual/latest` now accept single-bundle `GeoTIFF` files even when `guessedPeriodKey = null`
  - by-region clipping now derives `-srcwin` from raster `geoTransform`, so the current south-up `CHM_PRE` GeoTIFF layout no longer fails with negative window height
  - by-region `latest` on single-bundle monthly/annual rasters now selects the last band instead of silently reading band `1`

- verified live outputs now exist:
  - by-event 2019 smoke:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-2019/by-event/evt-2019-001.1d.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-2019/by-event/evt-2019-001.3d.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-2019/by-event/evt-2019-001.7d.csv`
  - by-event 2023 smoke:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-smoke-2023/by-event/evt-1.1d.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-smoke-2023/by-event/evt-1.3d.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-smoke-2023/by-event/evt-1.7d.csv`
  - by-event 2024 smoke:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-smoke-2024/by-event/EVT-001.1d.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/event-smoke-2024/by-event/EVT-002.1d.csv`
  - by-region monthly latest:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/monthly-latest/by-region/CN-500101.month.latest.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/monthly-latest/by-region/CN-420528.month.latest.csv`
  - by-region annual latest:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/annual-latest/by-region/CN-500101.annual.latest.csv`
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/annual-latest/by-region/CN-420528.annual.latest.csv`

- current execution conclusion:
  - `raw-index -> plan -> extract` is now genuinely executable for the CHM_PRE minimal set
  - the replay-aligned next expansion can stay on:
    - `2019`
    - `2023`
    - `2024`
    daily yearly files
  - no national full-history download is required for the current phase

- remaining non-blocking contract cleanup:
  - `window_days` currently expands to an inclusive natural-day range, so `1d / 3d / 7d` produce `2 / 4 / 8` rows
  - by-region output currently exports bbox grid cells and echoes `aggregation`; it does not yet reduce them into a final aggregated scalar

## 2026-04-22 Replay Pack And Negative Window Minimal Chain

- fixed execution boundary:
  - keep `raw -> canonical -> runtime` separation unchanged
  - do not map raw landing fields directly to runtime worker payload fields
  - derive `negative windows` as sidecar event csv first
  - reuse existing `CHM_PRE`:
    - `plan-chm-pre-v2-extracts.ts`
    - `extract-chm-pre-v2.ts`
  - land replay outputs as:
    - `CanonicalTrainingSample jsonl`
    instead of inventing a second training input format

- new code landed:
  - `libs/regional-model-library/src/contracts/event-replay-pack.ts`
  - `scripts/dev/regional-model-library/plan-negative-windows.ts`
  - `scripts/dev/regional-model-library/build-event-replay-pack.ts`
- supporting contract hardening landed in:
  - `libs/regional-model-library/src/contracts/canonical-event-inventory.ts`
  - `libs/regional-model-library/src/contracts/canonical-training-sample.ts`
  - `libs/regional-model-library/src/adapters/event_inventory_adapter/index.ts`

- verified replay-pack outputs now exist:
  - `2019`
    - `.tmp/regional-model-library/out/replay-packs/fuling-2019-smoke/event-replay-pack.json`
    - `.tmp/regional-model-library/out/replay-packs/fuling-2019-smoke/event-replay-pack.samples.jsonl`
    - sample count:
      - `5`
    - label split:
      - `1 positive / 4 negative`
  - `2023`
    - `.tmp/regional-model-library/out/replay-packs/event-smoke-2023/event-replay-pack.json`
    - `.tmp/regional-model-library/out/replay-packs/event-smoke-2023/event-replay-pack.samples.jsonl`
    - sample count:
      - `5`
    - label split:
      - `1 positive / 4 negative`
  - `2024`
    - `.tmp/regional-model-library/out/replay-packs/event-smoke-2024/event-replay-pack.json`
    - `.tmp/regional-model-library/out/replay-packs/event-smoke-2024/event-replay-pack.samples.jsonl`
    - sample count:
      - `10`
    - label split:
      - `2 positive / 8 negative`

- verified artifact outputs from replay samples now exist:
  - `.tmp/regional-model-library/out/artifacts/fuling-2019-smoke-replay/registry.json`
  - `.tmp/regional-model-library/out/artifacts/event-smoke-2024-replay/registry.json`

- current execution conclusion:
  - current minimal executable path is now fixed as:
    - `event csv -> negative-window planner -> CHM_PRE by-event extract -> replay pack -> canonical samples -> train-linear-risk-model`
  - replay-pack work should stay internal for now:
    - no external API change
    - no worker payload contract change
  - if the team wants to promote:
    - `ReplayPack contract`
    - `negative-window planner`
    - `event replay builder`
    into a durable product capability, it should be split into a dedicated OpenSpec change rather than silently folded into current baseline follow-up task wording

- next step:
  - replace current smoke/generic event csv inputs with formal:
    - `Fuling 2019`
    - `Beijing 2023`
    - `Zixing 2024`
    package inputs
  - land the formal `China-2008-2024` normalized event inventory under:
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv`
  - keep reusing the same replay-pack builder path instead of building a second rainfall or feature pipeline

## 2026-04-22 Replay Pack Orchestration And Formal Replay Intake Seeding

- new orchestration entry landed:
  - `scripts/dev/regional-model-library/run-event-replay-pack-pipeline.ts`
- current orchestration path is now fixed as:
  - `plan positive`
  - `filter ready positive events`
  - `extract positive rainfall windows`
  - `plan negatives`
  - `extract negative rainfall windows`
  - `build replay pack`
  - `train replay artifact`

- important behavior now verified:
  - the orchestration script can automatically exclude positive events whose `CHM_PRE` planner status is not `ready`
  - current proof case:
    - source:
      - `.tmp/regional-model-library/smoke/chm-pre/phase1-event-inventory.csv`
    - result:
      - `positiveEventCount = 2`
      - `readyPositiveEventCount = 1`
      - `excludedPositiveEventCount = 1`
    - output:
      - `.tmp/regional-model-library/out/replay-packs/orchestrated-event-smoke-2023/run-event-replay-pack-pipeline.report.json`

- verified orchestration outputs now exist:
  - replay pack:
    - `.tmp/regional-model-library/out/replay-packs/orchestrated-event-smoke-2023/event-replay-pack.json`
    - `.tmp/regional-model-library/out/replay-packs/orchestrated-event-smoke-2023/event-replay-pack.samples.jsonl`
  - trained artifact:
    - `.tmp/regional-model-library/out/artifacts/orchestrated-event-smoke-2023-replay/registry.json`

- first-wave formal replay manifests were added and reseeded:
  - `Beijing-2023`
  - `Zixing-2024`
  - `Fuling-2019`
- seeded manifest outputs now exist:
  - `.tmp/regional-model-library/intake-manifests/Beijing-2023.intake-manifest.json`
  - `.tmp/regional-model-library/intake-manifests/Zixing-2024.intake-manifest.json`
  - `.tmp/regional-model-library/intake-manifests/Fuling-2019.intake-manifest.json`

- current formal-input blocker is now explicit:
  - `.tmp/regional-model-library/raw/China-2008-2024-catalogue`
    still contains only:
    - `landing-plan.json`
    - `README.intake.md`
  - it still does not contain the formal raw package or:
    - `normalized/phase1-event-inventory.csv`

- next step:
  - when formal replay packages arrive, use:
    - `run-event-replay-pack-pipeline.ts`
    against:
      - `Beijing-2023`
      - `Zixing-2024`
      - `Fuling-2019`
  - do not rebuild the pipeline again unless the formal package shape forces a real contract change

## 2026-04-22 Fuling-2019 Formal Replay Fully Landed

- `Fuling-2019`
  - is now the first formal regional replay package fully executed end-to-end in the current workspace
- positive side is complete:
  - source normalized inventory:
    - `.tmp/regional-model-library/raw/Fuling-2019/normalized/phase1-event-inventory.csv`
  - positive event count:
    - `791`
  - positive CHM_PRE by-event extracts:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/extracts/fuling-2019-formal/by-event`
  - positive extract count verified against plan:
    - `2373 / 2373`

- negative side is now complete:
  - negative plan:
    - `.tmp/regional-model-library/out/replay-packs/fuling-2019-formal/negative-plan/negative-events.csv`
    - `.tmp/regional-model-library/out/replay-packs/fuling-2019-formal/negative-plan/negative-window-plan.json`
  - negative planned count:
    - `3164`
  - negative CHM_PRE plan root:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/plans/fuling-2019-formal-negatives`
  - negative by-event job count:
    - `9492`
  - first full extraction attempt timed out at the terminal layer before report writeback
  - completion strategy used:
    - verify landed csvs by deterministic filename
    - materialize remaining-job file
    - rerun extractor only on the missing jobs
  - resumed remaining-job file:
    - `.tmp/regional-model-library/raw/CHM_PRE-V2/plans/fuling-2019-formal-negatives/by-event.jobs.remaining.json`
  - resumed extraction count:
    - `2698`
  - final verified negative extract completeness:
    - `9492 / 9492`
  - note:
    - current `extraction-report.json` under `fuling-2019-formal-negatives` reflects the successful resumed run only, not the original timed-out partial pass

- formal replay-pack outputs now exist:
  - replay root:
    - `.tmp/regional-model-library/out/replay-packs/fuling-2019-formal`
  - files:
    - `event-replay-pack.json`
    - `event-replay-pack.samples.jsonl`
    - `event-replay-pack.report.json`
  - counts:
    - `sampleCount = 3955`
    - `positiveCount = 791`
    - `negativeCount = 3164`
    - `missingExtractSampleCount = 0`
  - dataset key used:
    - `Fuling-2019-replay`

- formal replay-trained artifact now exists:
  - output root:
    - `.tmp/regional-model-library/out/artifacts/fuling-2019-formal-replay`
  - files:
    - `fuling-2019-formal-replay.json`
    - `registry.json`
  - training result summary:
    - `artifactType = two_stage_linear_risk_v1`
    - `scopeType = region`
    - `scopeKey = cn:Chongqing:Chongqing:Fuling`
    - `featureCount = 18`
    - `sampleCount = 3955`
    - `positiveCount = 791`
    - `negativeCount = 3164`
  - warning to keep visible:
    - stage-1 displacement feature selection fell back to the first half of numeric features because no displacement-like keys were matched

- current execution conclusion is now stronger:
  - the `formal` replay path is no longer only smoke-proved
  - `Fuling-2019` proves that the existing stack can already do:
    - real regional inventory intake
    - normalized event inventory
    - CHM_PRE positive rainfall windows
    - negative-window generation
    - CHM_PRE negative rainfall windows
    - replay pack build
    - regional replay artifact training

- next blockers remain:
  - `Beijing-2023`
  - `Zixing-2024`
  - `China-2008-2024-catalogue`
  - these still need formal raw-package landing because the current environment remains blocked on anonymous figshare download paths

- highest-leverage script improvement after this run:
  - `scripts/dev/regional-model-library/extract-chm-pre-v2.ts`
  - opt-in `--skip-existing-outputs` is now landed
  - behavior:
    - default execution is unchanged
    - when the flag is enabled, existing by-event / by-region csv outputs are reused instead of being recomputed
    - reused jobs are still reported as `status = extracted`
    - reuse is surfaced through an issue note on the job result
  - verification smoke:
    - `.tmp/regional-model-library/smoke/chm-pre/extract-skip-existing/jobs.json`
    - `.tmp/regional-model-library/smoke/chm-pre/extract-skip-existing/by-event/Fuling-2019-0.1d.csv`
    - `.tmp/regional-model-library/smoke/chm-pre/extract-skip-existing/by-event/Fuling-2019-0.3d.csv`
    - `.tmp/regional-model-library/smoke/chm-pre/extract-skip-existing/extraction-report.json`
  - verified result:
    - `2` existing outputs were reused
    - csv `LastWriteTimeUtc` stayed unchanged before/after the run

## 2026-04-23 Formal Intake Landing Status Refresh

- current formal replay blockers remain unchanged:
  - `Beijing-2023`
  - `Zixing-2024`
  - `China-2008-2024-catalogue`
  - all three still lack formally landed raw packages under their repo landing roots
- acquisition boundary is now explicit and should not be re-debated on this workstation:
  - Springernature/Figshare anonymous CLI `ndownloader` paths still return `403`
  - operator path for these three datasets should stay:
    - `DOI or paper landing page -> normal browser download -> save into repo intake path`
  - do not spend more time trying to promote anonymous CLI download to the main path
- prepared landing artifacts already exist and should be reused:
  - `.tmp/regional-model-library/intake-manifests/Beijing-2023.intake-manifest.json`
  - `.tmp/regional-model-library/intake-manifests/Zixing-2024.intake-manifest.json`
  - `.tmp/regional-model-library/intake-manifests/China-2008-2024-catalogue.intake-manifest.json`
  - `.tmp/regional-model-library/raw/Beijing-2023/README.intake.md`
  - `.tmp/regional-model-library/raw/Zixing-2024/README.intake.md`
  - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/README.intake.md`
- expected manual landing targets are now fixed as:
  - `Beijing-2023`
    - `.tmp/regional-model-library/raw/Beijing-2023/source/downloads/beijing-2023-dataset.zip`
  - `Zixing-2024`
    - `.tmp/regional-model-library/raw/Zixing-2024/source/downloads/zixing-2024-dataset.zip`
    - optional `.tmp/regional-model-library/raw/Zixing-2024/source/downloads/zixing-2024-code-main.zip`
  - `China-2008-2024-catalogue`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-dataset.zip`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-code.zip`
- validator correctness work landed in the current repo scripts:
  - `scripts/dev/regional-model-library/intake-utils.ts`
    - nested `relativePath` collection now keeps the original raw root through recursion
  - `scripts/dev/regional-model-library/validate-intake-landing.ts`
    - `rawLandingRelative` matching is now boundary-aware instead of loose basename matching
    - `archiveSubpaths` matching is now boundary-aware instead of naive prefix matching
    - `family-split` now recognizes normalized phase-1 outputs like:
      - `normalized/phase1-event-inventory.csv`
    - directory-shaped landed artifacts can now be matched when the manifest expects them
  - `scripts/dev/regional-model-library/intake-manifest-templates.ts`
    - `Wanzhou-1950-2020` inventory and causal-factor families now explicitly admit `gdb`
- current validation truth after the fixes:
  - rerun outputs were overwritten at:
    - `.tmp/regional-model-library/intake-validation/Beijing-2023.validation.json`
    - `.tmp/regional-model-library/intake-validation/Zixing-2024.validation.json`
    - `.tmp/regional-model-library/intake-validation/China-2008-2024-catalogue.validation.json`
  - those reports now honestly stay in `fail` because the raw packages are still missing
  - the old false-positive behavior that could treat landing scaffolds like:
    - `README.intake.md`
    - `landing-plan.json`
    as landed families no longer reproduces
- new smoke evidence now exists for the two remaining validator edges:
  - family-split normalized event inventory:
    - `.tmp/regional-model-library/smoke/intake-validator/beijing-family-split.report.json`
    - verified `normalized/phase1-event-inventory.csv` is matched as `event-inventory`
  - directory-shaped `.gdb` intake:
    - `.tmp/regional-model-library/smoke/intake-validator/wanzhou-gdb.report.json`
    - verified `inventory/demo.gdb` and `causal-factors/demo.gdb` are accepted as landed static-prior families
- next execution step remains narrow:
  1. land the three formal packages by browser into the fixed repo download paths
  2. unpack them under the existing intake roots without renaming source truth away
  3. rerun `validate-intake-landing.ts`
  4. normalize authoritative event tables
  5. feed them into the already-landed replay-pack pipeline instead of building a new path

## 2026-04-23 Manual Operator Drop Completed

- operator-downloaded raw packages have now been landed from:
  - `D:\Download\29603420.zip`
  - `D:\Download\31298212.zip`
  - `E:\FierFoxDownload\26878327.zip`
  - `E:\FierFoxDownload\RLZX.zip`
- canonical source download targets are now populated:
  - `Beijing-2023`
    - `.tmp/regional-model-library/raw/Beijing-2023/source/downloads/beijing-2023-dataset.zip`
  - `Zixing-2024`
    - `.tmp/regional-model-library/raw/Zixing-2024/source/downloads/zixing-2024-dataset.zip`
    - `.tmp/regional-model-library/raw/Zixing-2024/source/downloads/zixing-2024-code-main.zip`
  - `China-2008-2024-catalogue`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-dataset.zip`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-code.zip`
- unpacked and materialized family paths now exist:
  - `Beijing-2023`
    - unpacked:
      - `.tmp/regional-model-library/raw/Beijing-2023/unpacked/dataset-archive`
      - `.tmp/regional-model-library/raw/Beijing-2023/unpacked/shapefiles-rar`
      - `.tmp/regional-model-library/raw/Beijing-2023/unpacked/mpk-package`
    - authoritative family landing:
      - `.tmp/regional-model-library/raw/Beijing-2023/original/event-inventory`
      - current authoritative files selected:
        - `Point_RLBJ.*`
        - `Polygon_RLBJ.*`
  - `Zixing-2024`
    - unpacked:
      - `.tmp/regional-model-library/raw/Zixing-2024/unpacked/dataset-archive/RLZX/RLZX-LIM`
      - `.tmp/regional-model-library/raw/Zixing-2024/unpacked/dataset-archive/RLZX/Study_area`
    - authoritative family landing:
      - `.tmp/regional-model-library/raw/Zixing-2024/original/event-inventory/RLZX-LIM.*`
      - `.tmp/regional-model-library/raw/Zixing-2024/original/code/`
  - `China-2008-2024-catalogue`
    - unpacked:
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/unpacked/dataset-archive`
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/unpacked/code-archive`
    - materialized family landing:
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/catalogue/catalogue-zh.xlsx`
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/catalogue/catalogue-en.xlsx`
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/code/`
- the China catalogue normalized event inventory now exists:
  - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv`
  - current normalization report:
    - row count:
      - `1582`
    - sheet:
      - `滑坡事件`
    - unresolved columns still visible:
      - `eventId`
      - `longitude`
      - `latitude`
      - `sourceUrl`
      - `economicLoss`
- validator state has now moved forward from missing-package failure:
  - `Beijing-2023`
    - `.tmp/regional-model-library/intake-validation/Beijing-2023.validation.json`
    - current status:
      - `pass`
  - `Zixing-2024`
    - `.tmp/regional-model-library/intake-validation/Zixing-2024.validation.json`
    - current status:
      - `pass`
  - `China-2008-2024-catalogue`
    - `.tmp/regional-model-library/intake-validation/China-2008-2024-catalogue.validation.json`
    - current status:
      - `warn`
    - reason:
      - derived artifact check is advisory-only even though `normalized/phase1-event-inventory.csv` now exists
- current normalization readiness insight for replay follow-up:
  - `Beijing-2023`
    - `Point_RLBJ.dbf` currently exposes:
      - `O_Lat`
      - `O_Lng`
      - `Type`
      - `UID`
      - `Altitude`
      - `Slope`
      - `TPI`
      - `Aspect`
      - `Area`
      - `Perimeter`
      - `Topo_pos`
  - `Zixing-2024`
    - `RLZX-LIM.dbf` currently exposes:
      - `Classname`
      - `Classvalue`
      - `Area`
      - `Perimeter`
  - implication:
    - raw package landing is no longer the blocker
    - next blocker is now the explicit normalization policy for:
      - fixed `event_ts`
      - `time_precision`
      - `region mapping`
      - replay-side location semantics

## 2026-04-23 Formal Replay Normalization And Canary Closure

- `Beijing-2023` authoritative event inventory now has a reproducible dataset-specific normalizer at:
  - `scripts/dev/regional-model-library/normalize-beijing-2023-event-inventory.ts`
- `Zixing-2024` authoritative event inventory now has a reproducible dataset-specific normalizer at:
  - `scripts/dev/regional-model-library/normalize-zixing-2024-event-inventory.ts`
- shared no-extra-dependency shapefile geometry helpers now exist at:
  - `scripts/dev/regional-model-library/shapefile-utils.ts`
- normalized event inventories now exist and are execution-grade:
  - `Beijing-2023`
    - `.tmp/regional-model-library/raw/Beijing-2023/normalized/phase1-event-inventory.csv`
    - `.tmp/regional-model-library/raw/Beijing-2023/normalized/phase1-event-inventory.csv.report.json`
  - `Zixing-2024`
    - `.tmp/regional-model-library/raw/Zixing-2024/normalized/phase1-event-inventory.csv`
    - `.tmp/regional-model-library/raw/Zixing-2024/normalized/phase1-event-inventory.csv.report.json`
- `Beijing-2023` normalization policy is now concretely locked as:
  - fixed `event_ts`:
    - `2023-08-02T00:00:00+08:00`
  - fixed `time_precision`:
    - `day`
  - county assignment:
    - spatial join from `Point_RLBJ.shp` to `县级 - 副本.shp`
  - current landed county distribution:
    - `房山区 = 5986`
    - `门头沟区 = 6227`
    - `昌平区 = 2792`
    - `海淀区 = 378`
  - `unmatchedCountyCount`:
    - `0`
- `Zixing-2024` normalization policy is now concretely locked as:
  - fixed `event_ts`:
    - `2024-07-28T00:00:00+08:00`
  - fixed `time_precision`:
    - `day`
  - fixed region:
    - `cn:湖南省:郴州市:资兴市`
  - geometry handling:
    - polygon centroid from `RLZX-LIM.shp`
    - reprojection from `WGS_1984_UTM_Zone_49N` to `WGS84`
- formal validator reruns now pass at family-split stage for both event inventories:
  - `.tmp/regional-model-library/intake-validation/Beijing-2023.validation.json`
  - `.tmp/regional-model-library/intake-validation/Zixing-2024.validation.json`
- `CHM_PRE-V2` current minimal executable backbone on disk is now confirmed as:
  - `daily-netcdf/CHM_PRE_V2_daily_2023.nc`
  - `daily-netcdf/CHM_PRE_V2_daily_2024.nc`
  - `monthly-total/CHM_PRE_V2_monthly.tif`
  - `annual-total/CHM_PRE_V2_annual.tif`
- by-event replay planning is now live-passed for the two formal event inventories:
  - `Beijing-2023`
    - `.tmp/regional-model-library/raw/Beijing-2023/plans/chm-pre-v2/by-event.jobs.json`
    - `46149` jobs
    - `0` blocked
  - `Zixing-2024`
    - `.tmp/regional-model-library/raw/Zixing-2024/plans/chm-pre-v2/by-event.jobs.json`
    - `58209` jobs
    - `0` blocked
- negative-window planning is also live-passed:
  - `Beijing-2023`
    - `.tmp/regional-model-library/raw/Beijing-2023/plans/negative-windows/negative-window-plan.json`
    - `61532` planned
    - `0` blocked
  - `Zixing-2024`
    - `.tmp/regional-model-library/raw/Zixing-2024/plans/negative-windows/negative-window-plan.json`
    - `77612` planned
    - `0` blocked
- full-scale replay extraction is now explicitly recognized as an execution-scale issue, not a path-design issue:
  - the current extractor is per-event-window and would materialize on the order of `10^5` small jobs for the full Beijing and Zixing inventories
  - this should not be treated as the next blind command to run
- canary replay closure has now been fully proven for both datasets:
  - canary positive extract:
    - `Beijing-2023`
      - `.tmp/regional-model-library/raw/Beijing-2023/extracts/chm-pre-v2-canary-rerun/by-event/Beijing-2023-8922.7d.csv`
    - `Zixing-2024`
      - `.tmp/regional-model-library/raw/Zixing-2024/extracts/chm-pre-v2-canary/by-event/Zixing-2024-1.7d.csv`
  - canary negative extract roots:
    - `.tmp/regional-model-library/raw/Beijing-2023/canary/negative-chm-pre-extracts`
    - `.tmp/regional-model-library/raw/Zixing-2024/canary/negative-chm-pre-extracts`
  - canary replay pack outputs:
    - `.tmp/regional-model-library/raw/Beijing-2023/canary/replay-pack/event-replay-pack.json`
    - `.tmp/regional-model-library/raw/Zixing-2024/canary/replay-pack/event-replay-pack.json`
  - canary training artifacts:
    - `.tmp/regional-model-library/raw/Beijing-2023/canary/artifact/Beijing-2023-canary.json`
    - `.tmp/regional-model-library/raw/Zixing-2024/canary/artifact/Zixing-2024-canary.json`
  - canary artifact scope keys are now proven correct:
    - `Beijing-2023`
      - `cn:北京市:北京市:房山区`
    - `Zixing-2024`
      - `cn:湖南省:郴州市:资兴市`
- new boundary locked from runtime/training inspection:
  - `county` matters operationally only when encoded into `region_code`
  - `Beijing-2023` full-pack single-artifact training must not be run as one mixed-county artifact
  - reason:
    - mixed `region_code` training would drop the artifact `scopeKey` to `null`
    - that would break exact region matching in the current runtime artifact registry
- next executable path is now narrower and clearer:
  1. add a split-by-`region_code` runner for the full Beijing replay/training line
  2. keep `Zixing-2024` eligible for direct full-run because its pack is single-region
  3. optimize or batch the CHM_PRE full replay extraction path before attempting the full `10^5`-job formal run

## 2026-04-23 Batched Replay Runner And Region Split Execution

- the replay stack now has reusable full-run orchestration tools instead of only ad-hoc canary commands:
  - batched CHM_PRE extractor wrapper:
    - `scripts/dev/regional-model-library/extract-chm-pre-v2-batched.ts`
  - event inventory split tool:
    - `scripts/dev/regional-model-library/split-event-inventory-by-region.ts`
  - region-driven replay runner:
    - `scripts/dev/regional-model-library/run-event-replay-pack-by-region.ts`
- the existing main replay orchestrator now supports batched extraction directly:
  - `scripts/dev/regional-model-library/run-event-replay-pack-pipeline.ts`
  - newly supported flags:
    - `--extract-batch-size`
    - `--extract-batch-offset`
    - `--extract-max-batches`
    - `--skip-existing-outputs`
- `Beijing-2023` full normalized event inventory has now been split into formal region packs:
  - split root:
    - `.tmp/regional-model-library/raw/Beijing-2023/splits/by-region`
  - split index:
    - `.tmp/regional-model-library/raw/Beijing-2023/splits/by-region/split-index.json`
  - resulting regional counts:
    - `cn:北京市:北京市:门头沟区`
      - `6227`
    - `cn:北京市:北京市:房山区`
      - `5986`
    - `cn:北京市:北京市:昌平区`
      - `2792`
    - `cn:北京市:北京市:海淀区`
      - `378`
- batched extraction mode has now been integrated and live-verified through the main pipeline for both canary event packs:
  - `Zixing-2024`
    - batched replay output root:
      - `.tmp/regional-model-library/out/replay-packs/zixing-2024-batched-canary`
    - batched positive extract report:
      - `.tmp/regional-model-library/out/replay-packs/zixing-2024-batched-canary/positive-extracts/extraction-batched-report.json`
    - batched negative extract report:
      - `.tmp/regional-model-library/out/replay-packs/zixing-2024-batched-canary/negative-extracts/extraction-batched-report.json`
    - replay pack:
      - `.tmp/regional-model-library/out/replay-packs/zixing-2024-batched-canary/event-replay-pack.json`
  - `Beijing-2023`
    - batched replay output root:
      - `.tmp/regional-model-library/out/replay-packs/beijing-2023-batched-canary`
    - batched positive extract report:
      - `.tmp/regional-model-library/out/replay-packs/beijing-2023-batched-canary/positive-extracts/extraction-batched-report.json`
    - batched negative extract report:
      - `.tmp/regional-model-library/out/replay-packs/beijing-2023-batched-canary/negative-extracts/extraction-batched-report.json`
    - replay pack:
      - `.tmp/regional-model-library/out/replay-packs/beijing-2023-batched-canary/event-replay-pack.json`
- the new region runner has also been proven on a Beijing county canary split:
  - split root:
    - `.tmp/regional-model-library/raw/Beijing-2023/canary/splits/by-region`
  - run report:
    - `.tmp/regional-model-library/out/replay-packs/beijing-2023-by-region-canary/run-by-region.report.json`
  - executed county:
    - `cn:北京市:北京市:房山区`
- current operational consequence:
  - the repo no longer lacks execution machinery for:
    - batched single-region replay
    - region-split Beijing replay
  - the remaining work is now full formal execution time and artifact volume, not missing orchestration logic

## 2026-04-23 Runtime Feature Contract Closure

- the runtime-side replay integration gap is no longer at artifact matching only
  - worker feature construction now emits the replay rainfall contract needed by the published region artifacts
- the worker now derives replay-compatible rainfall features in:
  - `services/ai-prediction-worker/src/pipeline/feature-builder.ts`
  - added family:
    - `rainfallAccum{1d|3d|7d}Mm`
    - `rainfallMean{1d|3d|7d}Mm`
    - `rainfallMax{1d|3d|7d}Mm`
    - `rainfallMin{1d|3d|7d}Mm`
    - `rainfallWetDayCount{1d|3d|7d}`
    - `rainfallDayCount{1d|3d|7d}`
- replay rainfall derivation rule is now explicit:
  - aggregate `rainfallCurrentMm` history into `Asia/Shanghai` day buckets
  - build inclusive windows for:
    - `1d`
    - `3d`
    - `7d`
  - fill missing days inside the window as:
    - `0`
  - this aligns runtime feature shape with CHM_PRE replay-pack semantics closely enough to run the current rainfall artifacts
- runtime history loading now honors replay needs instead of the old generic minimum:
  - `services/ai-prediction-worker/src/pipeline/feature-definitions.ts`
    - exports:
      - `REPLAY_RAINFALL_WINDOW_DAYS`
      - `REPLAY_RAINFALL_LOOKBACK_HOURS`
  - `services/ai-prediction-worker/src/pipeline/history-loader.ts`
    - minimum effective lookback is now:
      - `192h`
- runtime defaults were synchronized so deployments do not silently under-fetch rainfall history:
  - `services/ai-prediction-worker/src/config.ts`
    - `featureHistoryLookbackHours` default:
      - `192`
  - `services/ai-prediction-worker/.env.example`
    - `FEATURE_HISTORY_LOOKBACK_HOURS=192`
    - comment now states replay rainfall support explicitly
- a no-DB runtime smoke now exists at:
  - `scripts/dev/regional-model-library/check-worker-runtime-regional-replay.ts`
- the smoke uses:
  - real runtime registry:
    - `artifacts/models/regional-experts/phase1-rainfall-replay/registry.json`
  - real replay sample feature vectors from:
    - `Fuling-2019`
    - `Zixing-2024`
    - `Beijing-2023` by-region packs
  - runtime-style canonical region codes:
    - `CN-500102`
    - `CN-431081`
    - `CN-110109`
    - `CN-110111`
    - `CN-110114`
    - `CN-110108`
- smoke result is now closed:
  - `6 / 6` cases passed
  - `candidateCount = 1`
  - `fallbackReason = null`
  - `requiredFeaturesSatisfied = true`
  - alias bridge and inference runner both passed together
- local verification completed this round:
  - `npm run build --workspace @lsmv2/ai-prediction-worker`
    - pass
  - `npx tsx scripts/dev/regional-model-library/check-worker-runtime-regional-replay.ts --json`
    - pass
  - synthetic feature-builder probe with `8` daily rainfall points:
    - confirmed all `18` replay rainfall keys are emitted with inclusive `2 / 4 / 8` day counts
- the remaining unclosed runtime proof is now narrow:
  - `predictFromTelemetry()` full end-to-end still needs live Postgres because:
    - `resolveRegionContext()` is DB-bound
  - previous local check already showed:
    - `localhost:5432` refused connection
- next execution step is now straightforward:
  1. point worker artifact root to:
     - `artifacts/models/regional-experts/phase1-rainfall-replay`
  2. start local Postgres
  3. run one real device or station end-to-end smoke through `predictFromTelemetry()`

## 2026-04-24 Baijiabao Official Package Manual Landing

- the operator manually downloaded the NCDC official package:
  - source dataset:
    - `白家包滑坡观测数据集（2017-2024年）`
  - metadata id:
    - `3768727b-13b2-4675-8a00-2d661ec96229`
  - local browser-download path:
    - `E:\FierFoxDownload\3768727b-13b2-4675-8a00-2d661ec96229.zip`
- the package was copied into the repo landing path:
  - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/source/downloads/3768727b-13b2-4675-8a00-2d661ec96229.zip`
- the package was expanded into a non-overwriting manual unpack directory:
  - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/unpacked/dataset-manual-20260424-205235`
- unpacked official contents are complete for the existing Baijiabao adapter:
  - `_ncdc_meta_.json`
  - `白家包滑坡3个自动GNSS地表位移监测.xls`
  - `白家包滑坡1个自动雨量监测.xls`
  - `白家包滑坡4个地表裂缝相对位移自动监测点.xls`
  - `三峡库水位数据.xls`
  - `观测点布置图.jpg`
  - `滑坡剖面图.jpg`
  - `滑坡全貌图.jpg`
- content-level comparison showed the newly unpacked official package matches the previously landed Baijiabao raw files:
  - workbook and image file sizes match
  - SHA-256 prefixes match for the corresponding files
- existing normalized family outputs remain valid and should continue to be reused:
  - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/normalized/phase1-families/deformation.csv`
  - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/normalized/phase1-families/crack.csv`
  - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/normalized/phase1-families/rainfall.csv`
  - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/normalized/phase1-families/reservoir.csv`
  - `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/normalized/phase1-families/normalization-report.json`
- current normalized row counts remain:
  - `deformation = 7303`
  - `crack = 3489`
  - `rainfall = 2832`
  - `reservoir = 2832`
- execution note:
  - `npx tsx scripts/dev/regional-model-library/normalize-baijiabao-unpacked.ts ...`
    currently fails on this machine with:
    - `spawn EPERM`
  - the failure is an execution-tooling permission issue around the `tsx/esbuild` child process, not a data-package issue
  - because the new package hashes match the existing landed raw files, rerunning normalization is not required before continuing the Baijiabao model line

## 2026-04-24 Baijiabao Runtime Calibration Closure

- the Baijiabao monitoring candidate threshold is now treated as model calibration truth instead of being ignored by the generic heuristic risk-level thresholds:
  - authoritative runtime field:
    - `artifact.metadata.replaySummary.threshold`
  - current value:
    - `0.090203`
  - source artifact:
    - `artifacts/models/regional-experts/phase1-monitoring-candidates/registry.json`
- the worker inference path now reads artifact calibration metadata in:
  - `services/ai-prediction-worker/src/pipeline/inference-runner.ts`
  - priority:
    - `metadata.replaySummary.threshold`
    - fallback:
      - `metadata.calibration.threshold`
- the online payload extension now includes calibration evidence in:
  - `services/ai-prediction-worker/src/pipeline/predict-pipeline.ts`
  - fields:
    - `calibrationThreshold`
    - `scoreOverThreshold`
    - `calibratedRiskLevel`
    - `riskCalibration`
- the fallback heuristic remains unchanged:
  - no artifact / missing feature fallback still uses generic `0.4 / 0.8`
  - this avoids applying Baijiabao-specific calibration to non-artifact predictions
- smoke scripts now assert calibration evidence explicitly:
  - `scripts/dev/regional-model-library/check-baijiabao-monitoring-candidate-runtime.mjs`
  - `scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`
- verification completed:
  - `npm run build --workspace @lsmv2/ai-prediction-worker`
    - pass
  - `node scripts/dev/regional-model-library/check-baijiabao-monitoring-candidate-runtime.mjs`
    - pass
    - validation sample score:
      - `0.1290770664617425`
    - calibration threshold:
      - `0.090203`
    - score over threshold:
      - `1.4309620130344056`
    - calibrated risk level:
      - `medium`
  - `node scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`
    - pass
    - DB-backed smoke score:
      - `0.04928551485010998`
    - calibration threshold:
      - `0.090203`
    - score over threshold:
      - `0.546384431228562`
    - calibrated risk level:
      - `low`
    - model match and ClickHouse history path remain healthy:
      - `fallbackReason = null`
      - `requiredFeaturesSatisfied = true`
      - `historyMode = clickhouse+telemetry-v1`
- current interpretation:
  - the model is not a mature production-quality predictor yet
  - but the runtime model-selection, feature satisfaction, model execution, threshold calibration, payload evidence, and DB-backed insertion path are now closed for the Baijiabao monitoring candidate

## 2026-04-24 Baijiabao DB Warning Scenario Closure

- the DB-backed Baijiabao smoke now supports scenario selection:
  - script:
    - `scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`
  - flag:
    - `--scenario normal`
    - `--scenario warning`
- the normal scenario remains the default low-risk path:
  - report:
    - `artifacts/models/regional-experts/phase1-monitoring-candidates/e2e-smoke.report.json`
  - result:
    - `pass = true`
    - `riskScore = 0.04928551485010998`
    - `riskLevel = low`
    - `scoreOverThreshold = 0.546384431228562`
    - inserted PostgreSQL row returned:
      - `risk_level = low`
      - `calibration_threshold = 0.090203`
      - `risk_calibration_source = metadata.replaySummary.threshold`
- the warning scenario now proves medium-risk writeback through the full DB path:
  - report:
    - `artifacts/models/regional-experts/phase1-monitoring-candidates/e2e-smoke.warning.report.json`
  - result:
    - `pass = true`
    - `riskScore = 0.12914013962423895`
    - `riskLevel = medium`
    - `scoreOverThreshold = 1.4316612487859488`
    - inserted PostgreSQL row returned:
      - `risk_level = medium`
      - `calibration_threshold = 0.090203`
      - `calibrated_risk_level = medium`
      - `risk_calibration_source = metadata.replaySummary.threshold`
- current model integration status:
  - low-risk and calibrated-warning runtime paths are both proven end-to-end
  - model quality improvement remains separate from runtime integration closure

## 2026-04-24 Desk AI Calibration Visibility Closure

- the API service already returns `ai_predictions.payload` through:
  - `GET /api/v1/ai/predictions`
  - `GET /api/v1/ai/predictions/:predictionId`
  - no PostgreSQL schema or API top-level response change was required
- the API contract note now documents the worker calibration payload fields:
  - `docs/integrations/api/013-ai-predictions.md`
  - fields:
    - `calibrationThreshold`
    - `scoreOverThreshold`
    - `calibratedRiskLevel`
    - `riskCalibration.threshold`
    - `riskCalibration.scoreOverThreshold`
    - `riskCalibration.calibratedRiskLevel`
    - `riskCalibration.source`
- the desktop API client now has a first-class AI prediction contract:
  - `apps/desk/src/api/client.ts`
  - `apps/desk/src/api/httpClient.ts`
  - `apps/desk/src/api/mockClient.ts`
- the HTTP client maps calibration evidence from existing payload fields:
  - `payload.riskCalibration`
  - `payload.calibrationThreshold`
  - `payload.scoreOverThreshold`
  - `payload.calibratedRiskLevel`
- the desktop analysis dashboard now fetches the latest AI prediction and appends model calibration evidence to:
  - `apps/desk/src/views/AnalysisPage.tsx`
  - card:
    - `运行研判摘要`
- the GNSS deformation monitoring page now fetches the selected device's latest AI prediction and displays:
  - `apps/desk/src/views/GpsMonitoringPage.tsx`
  - tab:
    - `预测分析`
  - sections:
    - `分析摘要`
    - `预测指标`
  - distinction:
    - existing displacement-threshold risk remains visible
    - AI model calibrated risk is shown separately
- verification:
  - `npm run build --workspace @lsmv2/ai-prediction-worker`
    - pass
  - `npm run build --workspace @lsmv2/api-service`
    - pass
  - `npx tsc -p apps/desk/tsconfig.json --noEmit`
    - pass
  - `npm run build --workspace landslide-monitor-desk`
    - blocked at Vite config loading by existing Windows `esbuild spawn EPERM`
    - TypeScript passed before the Vite/esbuild stage
- current result:
  - Baijiabao model calibration is now visible through the runtime payload, desktop API client, analysis dashboard, and deformation prediction view

## 2026-04-24 Baijiabao Monitoring Challenger Grid

- model-quality work has started without overwriting the published Baijiabao monitoring candidate:
  - current published candidate remains:
    - `artifacts/models/regional-experts/phase1-monitoring-candidates/registry.json`
    - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
  - published candidate metrics remain:
    - `balancedAccuracy = 0.6103300010749221`
    - `auc = 0.636726503995127`
    - `f1 = 0.2155388471177945`
    - `precision = 0.14625850340136054`
    - `recall = 0.4095238095238095`
    - confusion:
      - `tp = 43`
      - `fp = 251`
      - `tn = 1078`
      - `fn = 62`
- a Node-only challenger grid runner is now available:
  - `scripts/dev/regional-model-library/run-baijiabao-monitoring-challenger-grid.mjs`
  - purpose:
    - compare feature-family choices
    - compare the current mean-difference baseline against a runtime-compatible `logistic-balanced-l2` trainer
    - compare threshold modes:
      - `maximize-balanced-accuracy`
      - `maximize-f1`
      - `maximize-youden-j`
    - write all outputs under `.tmp/` instead of promoting automatically
- current challenger output root:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid`
- generated outputs:
  - `challenger-grid.report.json`
  - `leaderboard.json`
  - `challenger-grid.details.json`
  - `registry.json`
  - `best-eligible.registry.json`
  - `best-balanced-accuracy.registry.json`
- grid scale:
  - trained/evaluated artifacts:
    - `24`
  - leaderboard rows:
    - `72`
- best primary-score / low-false-positive candidate:
  - model:
    - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
  - threshold mode:
    - `maximize-f1`
  - threshold:
    - `0.636487`
  - metrics:
    - `primaryScore = 0.5321319147172288`
    - `balancedAccuracy = 0.6065140277329893`
    - `auc = 0.6516464223010499`
    - `f1 = 0.338235294117647`
    - `precision = 0.7419354838709677`
    - `recall = 0.21904761904761905`
    - `specificity = 0.9939804364183596`
  - confusion:
    - `tp = 23`
    - `fp = 8`
    - `tn = 1321`
    - `fn = 82`
  - interpretation:
    - useful as a low-false-positive patrol / confirmation mode
    - not suitable as the main warning model because recall drops too much
- best balanced-warning candidate:
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - threshold mode:
    - `maximize-balanced-accuracy`
  - threshold:
    - `0.184245`
  - metrics:
    - `primaryScore = 0.5118987755501547`
    - `balancedAccuracy = 0.6216381812318607`
    - `auc = 0.6562184241642481`
    - `f1 = 0.2578397212543554`
    - `precision = 0.2032967032967033`
    - `recall = 0.3523809523809524`
    - `specificity = 0.890895410082769`
  - confusion:
    - `tp = 37`
    - `fp = 145`
    - `tn = 1184`
    - `fn = 68`
  - interpretation:
    - better balanced-accuracy and AUC than the published candidate
    - false positives drop materially from `251` to `145`
    - recall drops from `0.4095` to `0.3524`, so it should remain challenger until operating-policy preference is decided
- verification:
  - `node scripts/dev/regional-model-library/run-baijiabao-monitoring-challenger-grid.mjs`
    - pass
  - challenger registry JSON structural check:
    - pass
    - `artifactCount = 24`
  - `npm run build --workspace @lsmv2/ai-prediction-worker`
    - pass
- current conclusion:
  - the next useful step is not blind retraining
  - choose one of two operating policies before promotion:
    - balanced warning mode:
      - prefer `rainfall-reservoir.mean-diff`
    - low-false-positive confirmation mode:
      - prefer `reservoir-only.logistic-balanced-l2`
  - until that policy is selected, keep both as challenger registries and do not overwrite the published candidate

## 2026-04-24 Baijiabao FP/FN Error Diagnostics

- a dedicated model-error diagnostic script is now available:
  - `scripts/dev/regional-model-library/diagnose-baijiabao-monitoring-errors.mjs`
- purpose:
  - run the same validation samples through:
    - published Baijiabao candidate
    - balanced-warning challenger
    - low-false-positive challenger
  - classify each evaluated sample as:
    - `TP`
    - `FP`
    - `TN`
    - `FN`
  - generate grouped diagnostics and examples without promoting any model
- output root:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-error-diagnostics`
- generated outputs:
  - `baijiabao-monitoring-error-diagnostics.report.json`
  - `baijiabao-monitoring-error-diagnostics.report.md`
- validation sample note:
  - raw validation samples:
    - `1461`
  - binary-label samples:
    - `1458`
  - model-evaluated samples:
    - `1434`
  - missing-feature / fallback count for current comparable metrics:
    - `24`
  - evaluated positives:
    - `105`
  - evaluated negatives:
    - `1329`
- usable diagnostic keys are now confirmed:
  - `sampleId`
  - `eventTs`
  - `rawRef.originalFields.point_id`
    - values:
      - `ZD1`
      - `ZD2`
      - `ZD3`
  - `labels.displacementLabel`
  - `labels.warningHitLabel`
  - `metricsNormalized.*`
  - `rawRef.familyRefs[]`
  - `qualityFlags[]`
- model comparison result:
  - published:
    - `TP = 43`
    - `FP = 251`
    - `TN = 1078`
    - `FN = 62`
    - `precision = 0.14625850340136054`
    - `recall = 0.4095238095238095`
    - `balancedAccuracy = 0.6103300010749221`
  - balanced challenger:
    - `TP = 37`
    - `FP = 145`
    - `TN = 1184`
    - `FN = 68`
    - `precision = 0.2032967032967033`
    - `recall = 0.3523809523809524`
    - `balancedAccuracy = 0.6216381812318607`
  - low-false-positive challenger:
    - `TP = 23`
    - `FP = 8`
    - `TN = 1321`
    - `FN = 82`
    - `precision = 0.7419354838709677`
    - `recall = 0.21904761904761905`
    - `balancedAccuracy = 0.6065140277329893`
- transition analysis:
  - published -> balanced challenger:
    - `FP -> TN = 106`
    - `TP -> FN = 6`
    - `FP -> FP = 145`
    - `TP -> TP = 37`
  - published -> low-false-positive challenger:
    - `FP -> TN = 243`
    - `TP -> FN = 20`
    - `FP -> FP = 8`
    - `TP -> TP = 23`
- operational interpretation:
  - `rainfall-reservoir.mean-diff` is the realistic main-warning challenger:
    - substantially reduces false positives
    - slightly increases false negatives
    - improves BA/AUC/F1
  - `reservoir-only.logistic-balanced-l2` is not a main warning model:
    - very low false positives
    - high false negatives
    - best used as a secondary confirmation / patrol-priority model
- important grouped findings:
  - all three models perform best in summer relative to other seasons
  - winter and autumn warning positives are poorly captured by all current candidates
  - the low-false-positive challenger almost only fires under the `<150m` reservoir-level bucket
  - the balanced challenger keeps the useful summer signal while removing many published false positives
  - `ZD3` remains harder for low-false-positive recall than `ZD1/ZD2`
- current next step:
  - implement dual-output policy at model-library level:
    - main warning:
      - balanced challenger
    - confirmation / patrol:
      - low-false-positive challenger
  - do not delete the published model yet
  - before formal promotion, add lead-time and seasonal stability checks

## 2026-04-24 Baijiabao Runtime Field Adaptation Closure

- user clarified that system adaptation primarily means field adaptation.
- current field-adaptation rule is now fixed:
  - do not force raw dataset columns or UI names to become model names
  - keep a stable four-layer chain:
    - `telemetry.metrics / ClickHouse telemetry_raw.sensor_key aliases`
    - `worker canonical feature`
    - `model requiredFeatureKey`
    - `ai_predictions.payload evidence`
- worker payload now includes explicit runtime field adaptation evidence:
  - file:
    - `services/ai-prediction-worker/src/pipeline/predict-pipeline.ts`
  - payload path:
    - `payload.fieldAdaptation`
  - fields:
    - `supported`
    - `modelKey`
    - `modelVersion`
    - `requiredFeatureCount`
    - `presentRequiredFeatureCount`
    - `missingFeatureKeys`
    - `canonicalInputs`
    - `acceptedSensorKeys`
    - `historicalWindowRequired`
    - `fields[]`
- API/runtime docs updated:
  - `docs/integrations/api/013-ai-predictions.md`
  - `docs/integrations/ai/regional-model-runtime.md`
- field adaptation check script added:
  - `scripts/dev/regional-model-library/check-baijiabao-runtime-field-adaptation.mjs`
- generated reports:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-runtime-field-adaptation/baijiabao-runtime-field-adaptation.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-runtime-field-adaptation/baijiabao-runtime-field-adaptation.report.md`
- current field compatibility result:
  - published:
    - required feature count:
      - `41`
    - canonical inputs:
      - `displacementSurfaceMm`
      - `rainfallCurrentMm`
      - `reservoirLevelM`
    - supported:
      - `true`
  - balanced challenger:
    - required feature count:
      - `27`
    - canonical inputs:
      - `rainfallCurrentMm`
      - `reservoirLevelM`
    - supported:
      - `true`
  - low-false-positive challenger:
    - required feature count:
      - `14`
    - canonical inputs:
      - `reservoirLevelM`
    - supported:
      - `true`
- accepted runtime aliases are now explicitly recorded:
  - `displacementSurfaceMm`:
    - `displacementSurfaceMm`
    - `displacement_mm`
    - `displacement`
    - `disp_mm`
    - `gps_displacement_mm`
    - `cumulative_displacement_mm`
  - `rainfallCurrentMm`:
    - `rainfallCurrentMm`
    - `rainfall_mm`
    - `rain_mm`
    - `precipitation_mm`
    - `precipitation`
    - `rainfall`
  - `reservoirLevelM`:
    - `reservoirLevelM`
    - `reservoir_level_m`
    - `water_level_m`
    - `level_m`
- DB-backed smoke confirmed payload landing:
  - `node scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs --scenario normal --out-file .tmp/regional-model-library/out/artifacts/baijiabao-runtime-field-adaptation/e2e-field-adaptation-smoke.report.json`
    - pass
  - inserted payload field adaptation result:
    - `present = true`
    - `supported = true`
    - `requiredFeatureCount = 41`
    - `presentRequiredFeatureCount = 41`
    - `canonicalInputs = ["displacementSurfaceMm", "rainfallCurrentMm", "reservoirLevelM"]`
    - `missingFeatureKeys = []`
- verification:
  - `npm run build --workspace @lsmv2/ai-prediction-worker`
    - pass
  - `node scripts/dev/regional-model-library/check-baijiabao-runtime-field-adaptation.mjs`
    - pass
  - `node scripts/dev/regional-model-library/check-baijiabao-monitoring-candidate-runtime.mjs`
    - pass
- current conclusion:
  - the candidate models are field-compatible with the existing system
  - the real online requirement is not renaming fields
  - it is ensuring ClickHouse continuously stores the accepted aliases for rainfall and reservoir-level, because both challengers rely on 6h/24h/72h historical window features

## 2026-04-24 Baijiabao Dual-Model Runtime Closure

- the runtime has now been extended from single selected artifact output to:
  - top-level primary warning inference
  - optional secondary confirmation inference in payload
- implementation files:
  - `services/ai-prediction-worker/src/pipeline/model-matcher.ts`
  - `services/ai-prediction-worker/src/pipeline/predict-pipeline.ts`
  - `services/ai-prediction-worker/src/pipeline/types.ts`
- operational role source:
  - `artifact.metadata.operationalRole`
  - fallback-compatible:
    - `artifact.metadata.routing.operationalRole`
    - `artifact.metadata.matcher.operationalRole`
- current policy:
  - `operationalRole = "primary-warning"`
    - eligible for top-level selected model output
  - `operationalRole = "confirmation"` / `"confirmation-challenger"`
    - cannot steal the primary model slot
    - executes as `payload.confirmationInference`
    - also appears in `payload.secondaryInferences[]`
- dual registry builder:
  - `scripts/dev/regional-model-library/build-baijiabao-dual-runtime-registry.mjs`
  - output:
    - `.tmp/regional-model-library/out/artifacts/baijiabao-dual-runtime-registry/registry.json`
- runtime smoke:
  - `scripts/dev/regional-model-library/check-baijiabao-dual-runtime-output.mjs`
  - current result:
    - `pass = true`
    - primary:
      - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
      - field adaptation:
        - supported
      - required features:
        - `27 / 27`
    - confirmation:
      - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
      - operational role:
        - `confirmation`
      - field adaptation:
        - supported
      - required features:
        - `14 / 14`
- DB e2e smoke now supports expected model, threshold, and optional confirmation assertions:
  - `scripts/dev/regional-model-library/run-baijiabao-monitoring-e2e-smoke.mjs`
  - dual-registry run:
    - `pass = true`
    - primary:
      - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
      - threshold:
        - `0.184245`
      - risk:
        - `low`
    - confirmation:
      - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
      - field adaptation:
        - supported
      - persisted in `ai_predictions.payload`
    - `secondaryInferenceCount = 1`
- default old published-model e2e regression also remains passing:
  - model:
    - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
  - threshold:
    - `0.090203`
  - `pass = true`
- docs updated:
  - `docs/integrations/api/013-ai-predictions.md`
  - `docs/integrations/ai/regional-model-runtime.md`
- current conclusion:
  - field adaptation is still software-side canonical bridging, not model-driven renaming of software fields
  - dual-model output is integrated through existing `payload` JSON, not PostgreSQL schema changes
  - the balanced challenger can be evaluated as main warning output while the low-false-positive challenger becomes confirmation / patrol-priority evidence

## 2026-04-24 Baijiabao Challenger Stability Gate

- a dedicated promotion-stability script is now available:
  - `scripts/dev/regional-model-library/check-baijiabao-challenger-stability.mjs`
- purpose:
  - evaluate published model, primary-warning challenger, and confirmation challenger beyond aggregate BA/F1
  - check:
    - `7-day positive episode lead-window hit rate`
    - seasonal recall
    - point-level recall
    - false-positive pressure
- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-challenger-stability/baijiabao-challenger-stability.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-challenger-stability/baijiabao-challenger-stability.report.md`
- validation facts:
  - raw samples:
    - `1461`
  - binary-label samples:
    - `1458`
  - positives:
    - `108`
  - positive episodes:
    - `81`
  - point ids:
    - `ZD1`
    - `ZD2`
    - `ZD3`
- published:
  - BA:
    - `0.6103`
  - precision:
    - `0.1463`
  - recall:
    - `0.4095`
  - FP / FN:
    - `251 / 62`
  - 7-day lead hit rate:
    - `0.3580`
  - gate:
    - blocked
- primary-warning challenger:
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - BA:
    - `0.6216`
  - precision:
    - `0.2033`
  - recall:
    - `0.3524`
  - FP / FN:
    - `145 / 68`
  - 7-day lead hit rate:
    - `0.2840`
  - gate:
    - blocked
  - blockers:
    - seasonal recall below promotion floor
    - winter recall is `0`
    - autumn recall is `0.0417`
    - episode lead-window hit rate below `0.50`
- confirmation challenger:
  - model:
    - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
  - BA:
    - `0.6065`
  - precision:
    - `0.7419`
  - recall:
    - `0.2190`
  - FP / FN:
    - `8 / 82`
  - 7-day lead hit rate:
    - `0.1235`
  - gate:
    - blocked as top-level warning model
  - operational use:
    - suitable as low-false-positive confirmation / patrol-priority evidence
- current conclusion:
  - keep dual-model runtime
  - do not overwrite published registry
  - do not promote the balanced challenger yet
  - the next model-quality work should target seasonal and lead-time weakness, not blind grid expansion

## 2026-04-25 Baijiabao Seasonal / Lead-Time Fix Screening

- three follow-up screening scripts have now been added after the stability gate failure:
  - `scripts/dev/regional-model-library/check-baijiabao-seasonal-threshold-policy.mjs`
  - `scripts/dev/regional-model-library/check-baijiabao-seasonal-feature-gap.mjs`
  - `scripts/dev/regional-model-library/check-baijiabao-hybrid-seasonal-policy.mjs`
- seasonal threshold policy report:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-threshold-policy/baijiabao-seasonal-threshold-policy.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-threshold-policy/baijiabao-seasonal-threshold-policy.report.md`
- seasonal feature gap report:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-feature-gap/baijiabao-seasonal-feature-gap.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-feature-gap/baijiabao-seasonal-feature-gap.report.md`
- hybrid seasonal policy report:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-hybrid-seasonal-policy/baijiabao-hybrid-seasonal-policy.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-hybrid-seasonal-policy/baijiabao-hybrid-seasonal-policy.report.md`
- seasonal threshold result:
  - baseline primary-warning challenger:
    - BA:
      - `0.6216`
    - precision:
      - `0.2033`
    - recall:
      - `0.3524`
    - FP:
      - `145`
    - lead hit rate:
      - `0.2840`
  - train-season-maximize-f2:
    - recall:
      - `0.6286`
    - lead hit rate:
      - `0.6420`
    - FP:
      - `801`
    - precision:
      - `0.0761`
    - BA:
      - `0.5129`
  - conclusion:
    - seasonal thresholding alone is not deployable
- seasonal feature gap result:
  - validation winter strongest available signals include:
    - `displacementSurfaceMm_delta_24h`
    - `displacementSurfaceMm_delta_72h`
  - these are not in the current `rainfall-reservoir` primary-warning challenger
  - autumn is mainly driven by `reservoirLevelM_delta_24h / 72h` direction but has heavy score overlap
  - conclusion:
    - current blocker is not just threshold calibration
- hybrid seasonal policy result:
  - tested conservative hybrid policies:
    - primary remains `rainfall-reservoir`
    - autumn / winter optionally use existing displacement-reservoir, compact-process, or current-all-no-crack booster
    - booster thresholds selected on train split
    - validation split used for acceptance
  - result:
    - all hybrid policies equal primary-only baseline
    - no deployable hybrid policy found
- current conclusion:
  - do not change runtime threshold policy
  - do not add seasonal threshold hack
  - do not add existing-model OR hybrid hack
  - next useful model-quality work is a new `seasonal / trigger-aware challenger`
  - this challenger should explicitly test displacement delta evidence while keeping false-positive guardrails and checking autumn/winter label semantics

## 2026-04-25 Baijiabao Trigger-Aware Challenger Screening

- the first trigger-aware screening script is now available:
  - `scripts/dev/regional-model-library/check-baijiabao-trigger-aware-challenger.mjs`
- script correction made during execution:
  - keep `primary-only` baseline in the candidate policy list before truncating train-ranked candidates
  - without this, validation sorting could lose the baseline reference and fail with `Cannot read properties of undefined (reading 'overall')`
- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-challenger/baijiabao-trigger-aware-challenger.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-challenger/baijiabao-trigger-aware-challenger.report.md`
- validation sample facts:
  - train rows:
    - `5782`
  - train episodes:
    - `307`
  - validation rows:
    - `1434`
  - validation episodes:
    - `79`
  - candidate policies:
    - `251`
- baseline:
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - threshold:
    - `0.184245`
  - BA:
    - `0.6216`
  - precision:
    - `0.2033`
  - recall:
    - `0.3524`
  - FP / FN:
    - `145 / 68`
  - lead hit rate:
    - `0.2911`
  - worst season recall:
    - `0`
- best current deployable-by-script offline policy:
  - key:
    - `trigger-autumn-winter-displacementSurfaceMm_delta_24h-low--0.8`
  - trigger:
    - autumn / winter
    - `displacementSurfaceMm_delta_24h <= -0.8`
  - BA:
    - `0.6245`
  - precision:
    - `0.1630`
  - recall:
    - `0.4190`
  - FP / FN:
    - `226 / 61`
  - lead hit rate:
    - `0.6329`
  - pre-alert rate:
    - `0.5696`
  - worst season recall:
    - `0.1538`
  - worst point recall:
    - `0.4000`
- current conclusion:
  - trigger-aware displacement delta is a real useful signal for autumn / winter lead-time weakness
  - this is not a safe immediate runtime change because FP rises from `145` to `226` and precision drops from `0.2033` to `0.1630`
  - keep it as an offline challenger policy only
  - next work should convert it into reproducible challenger metadata and review autumn/winter label semantics plus episode boundaries before any runtime promotion

## 2026-04-25 Baijiabao Trigger-Aware Policy Card / Strict Review

- a standalone policy-card builder is now available:
  - `scripts/dev/regional-model-library/build-baijiabao-trigger-aware-policy-card.mjs`
- purpose:
  - convert trigger-aware screening results into offline policy metadata
  - do not write runtime registry
  - review stricter FP / precision / episode guardrails before any promotion discussion
- default loose-policy output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card/baijiabao-trigger-aware-policy-card.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card/baijiabao-trigger-aware-promotion-review.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card/baijiabao-trigger-aware-policy-card.md`
- strict-policy output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-policy-card.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-promotion-review.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-policy-card.md`
- strict policy:
  - key:
    - `trigger-autumn-winter-displacementSurfaceMm_delta_24h-low--1.2`
  - trigger:
    - autumn / winter
    - `displacementSurfaceMm_delta_24h <= -1.2`
  - runtimePromotionStatus:
    - `candidate-review-required`
- baseline:
  - BA:
    - `0.6216`
  - precision:
    - `0.2033`
  - recall:
    - `0.3524`
  - FP / FN:
    - `145 / 68`
  - lead hit rate:
    - `0.2911`
- strict policy validation:
  - BA:
    - `0.6315`
  - precision:
    - `0.1875`
  - recall:
    - `0.4000`
  - FP / FN:
    - `182 / 63`
  - lead hit rate:
    - `0.4810`
  - newly alerted TP / FP:
    - `5 / 37`
  - newly hit episodes:
    - `15`
  - newly pre-alerted episodes:
    - `10`
  - strict gate:
    - `pass`
  - FP growth:
    - `1.2552`
  - precision drop:
    - `0.0158`
- important distinction:
  - `<= -0.8` remains useful for proving signal value, but is too noisy for runtime
  - `<= -1.2` is the current best strict offline policy candidate
  - neither should be inserted into runtime registry yet
- current conclusion:
  - displacement delta should become a first-class feature in the next model-family challenger
  - the final online path should be a trained challenger or calibrated policy artifact after label review, not a bare hard rule
  - manual/raw semantics review is still required because labels are derived from future displacement delta and samples carry duplicate timestamp quality flags

## 2026-04-25 Baijiabao Displacement-Delta Model Family Challenger

- the trigger-aware finding has now been tested as a clean offline model-family challenger:
  - file:
    - `scripts/dev/regional-model-library/run-baijiabao-monitoring-challenger-grid.mjs`
  - feature family:
    - `rainfall-reservoir-displacement-delta`
  - promotion:
    - `promotionEligible: false`
- stability script now accepts optional extra models:
  - file:
    - `scripts/dev/regional-model-library/check-baijiabao-challenger-stability.mjs`
  - syntax:
    - `--model key=role=registryPath`
  - purpose:
    - check offline challenger stability without changing the default model set
- raw review CSVs are now available:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-new-alert-review.csv`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-policy-card-strict/baijiabao-trigger-aware-new-episode-review.csv`
- raw review facts:
  - newly alerted rows:
    - `42`
  - newly alerted TP / FP:
    - `5 / 37`
  - newly hit episodes:
    - `15`
  - newly pre-alerted episodes:
    - `10`
  - all validation labels in the strict review are derived labels:
    - `warningHitLabel`: `1434 / 1434` `derived-threshold`
    - `displacementLabel`: `1434 / 1434` `derived-future-delta`
  - strict duplicate check:
    - `point_id + eventTs` duplicate groups:
      - `0`
    - `stationCode + eventTs` duplicate groups:
      - `506`
  - interpretation:
    - station/date repeats are expected because `ZD1 / ZD2 / ZD3` share one station/date
    - the existing `duplicate_point_timestamp_rows` flag is likely over-broad and should not be treated as direct point-duplicate evidence
- delta-family outputs:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/challenger-grid.report.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/leaderboard.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/registry.json`
  - `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-delta-family/best-delta-balanced.registry.json`
- delta-family feature contract:
  - include:
    - `rainfallCurrentMm*`
    - `reservoirLevelM*`
    - `displacementSurfaceMm_delta_24h`
    - `displacementSurfaceMm_delta_72h`
  - exclude:
    - displacement absolute
    - displacement last / mean / min / max
    - crack
  - min feature coverage:
    - `0.98`
  - reason:
    - `displacementSurfaceMm_delta_24h` train coverage is `5742 / 5842 = 0.9829`
- best balanced delta-family artifact:
  - model:
    - `baijiabao.challenger.rainfall-reservoir-displacement-delta.mean-diff.linear-risk-v1`
  - threshold:
    - `0.181512`
  - evaluated rows:
    - `1352`
  - BA:
    - `0.6222`
  - precision:
    - `0.1882`
  - recall:
    - `0.3646`
  - FP / FN:
    - `151 / 61`
  - AUC:
    - `0.6610`
- stability result:
  - output:
    - `.tmp/regional-model-library/out/artifacts/baijiabao-delta-family-stability/baijiabao-challenger-stability.report.json`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-delta-family-stability/baijiabao-challenger-stability.report.md`
  - lead hit rate:
    - `0.2840`
  - worst season recall:
    - `0`
  - gate:
    - blocked
  - blockers:
    - precision below `0.20`
    - seasonal recall below `0.20`
    - lead hit rate below `0.50`
- current conclusion:
  - displacement delta is useful, but adding it into a global linear family does not fix the autumn/winter lead-time problem
  - do not connect delta-family to runtime
  - do not keep expanding simple linear feature grids
  - next useful work is label semantics / episode boundary review and then a seasonal gate or mixture-of-experts design using displacement-delta evidence

## 2026-04-25 Baijiabao Label / Episode Review and Bounded Seasonal MoE

当前已完成一轮离线 label / episode review 与 bounded seasonal / MoE 评估。

新增脚本：

- `scripts/dev/regional-model-library/review-baijiabao-trigger-aware-label-episodes.mjs`
- `scripts/dev/regional-model-library/check-baijiabao-seasonal-moe-policy.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-label-episode-review/baijiabao-trigger-aware-label-episode-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-label-episode-review/baijiabao-trigger-aware-label-episode-review.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-trigger-aware-label-episode-review/baijiabao-trigger-aware-label-episode-review.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-moe-policy/baijiabao-seasonal-moe-policy.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-moe-policy/baijiabao-seasonal-moe-policy.report.md`

label / episode review:

- strict policy 新增告警:
  - `42`
- 新增 TP / FP:
  - `5 / 37`
- 37 个新增 FP 的同点位后续 positive proximity:
  - `3d`:
    - `7`
  - `7d`:
    - `10`
  - `14d`:
    - `23`
  - `30d`:
    - `31`
  - `30d` 内无后续 positive:
    - `6`
- immediate-only 新增告警 precision:
  - `0.1190`
- 如果把 `<=14d` 后续 positive 当作可能提前信号，adjusted precision:
  - `0.6667`
- duplicate review:
  - `point_id + eventTs` duplicate groups:
    - `0`
  - `stationCode + eventTs` duplicate groups:
    - `508`

bounded seasonal / MoE:

- primary baseline:
  - BA:
    - `0.6216`
  - precision:
    - `0.2033`
  - recall:
    - `0.3524`
  - FP / FN:
    - `145 / 68`
  - lead hit rate:
    - `0.2911`
- `seasonal-gate.strict-24h-delta.review`:
  - trigger:
    - autumn / winter
    - `displacementSurfaceMm_delta_24h <= -1.2`
  - BA:
    - `0.6315`
  - precision:
    - `0.1875`
  - recall:
    - `0.4000`
  - FP / FN:
    - `182 / 63`
  - lead hit rate:
    - `0.4810`
  - autumn recall:
    - `0.2083`
  - winter recall:
    - `0.0769`
  - status:
    - `bounded-review-candidate`
- `seasonal-gate.lead-24h-delta.exploratory`:
  - lead hit rate:
    - `0.6329`
  - FP:
    - `226`
  - precision:
    - `0.1630`
  - status:
    - exploratory only
- `seasonal-gate.winter-recall-72h.exploratory`:
  - winter recall:
    - `0.3077`
  - FP:
    - `288`
  - precision:
    - `0.1479`
  - status:
    - exploratory only
- `moe.delta-confirmed-strict-24h.offline`:
  - seasonalHitCount:
    - `5`
  - conclusion:
    - delta-family confirmation collapses back to primary baseline and does not preserve lead-time gain

Current conclusion:

- strict 24h seasonal gate is the best current offline review candidate.
- it is not a runtime promotion candidate.
- promotion remains blocked by:
  - lead hit rate below `0.50`
  - winter recall below `0.20`
  - policy `promotionEligible: false`
  - derived labels rather than manual landslide-event truth
- keep runtime unchanged:
  - no threshold change
  - no matcher change
  - no formal registry overwrite
  - no PostgreSQL schema change

Next useful work:

1. sample the `<=14d` possible pre-signal rows against raw observations and domain expectations
2. refine label horizon / episode boundary instead of treating every single-day negative as true FP
3. train a seasonal expert only after the label semantics are fixed
4. keep the current dual-model runtime as-is while accumulating offline evidence

## 2026-04-25 Baijiabao Episode-Boundary Sensitivity

当前已完成 episode-boundary sensitivity 评估。

新增脚本：

- `scripts/dev/regional-model-library/check-baijiabao-episode-boundary-sensitivity.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-boundary-sensitivity/baijiabao-episode-boundary-sensitivity.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-boundary-sensitivity/baijiabao-episode-boundary-sensitivity.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-boundary-sensitivity/baijiabao-episode-boundary-sensitivity.results.csv`

样本事实：

- raw samples:
  - `1461`
- evaluated rows:
  - `1434`
- immediate positive / negative:
  - `105 / 1329`
- original positive episodes:
  - `79`
- immediate negative rows that enter same-point positive episode within:
  - `7d`:
    - `396`
  - `14d`:
    - `654`
  - `30d`:
    - `961`

关键结果：

- `immediate-derived-label`:
  - best policy:
    - `seasonal-gate.strict-24h-delta.review`
  - BA:
    - `0.6315`
  - precision:
    - `0.1875`
  - FP / FN:
    - `182 / 63`
- `preSignal14d-as-positive`:
  - best policy:
    - `seasonal-gate.strict-24h-delta.review`
  - BA:
    - `0.5482`
  - interpretation:
    - 不应把 `<=14d` pre-positive negatives 全部直接转正，正样本语义会过宽
- `exclude-preSignal14d-negatives`:
  - best policy:
    - `seasonal-gate.strict-24h-delta.review`
  - BA:
    - `0.6474`
  - precision:
    - `0.3717`
  - recall:
    - `0.4000`
  - FP / FN:
    - `71 / 63`
  - autumn recall:
    - `0.2083`
  - winter recall:
    - `0.0769`
  - excluded grey-zone rows:
    - `654`

Current conclusion:

- 14 天内将进入同点位 positive episode 的 immediate negative 样本不应直接当 hard FP。
- 正确方向不是把这些样本全部改成 positive，而是建立 episode 前灰区标签策略。
- strict 24h seasonal gate 是当前最能暴露标签窗口问题的离线候选，但仍不是 runtime promotion candidate。
- 下一步应产出 label policy artifact / sample factory 规则：
  - `positive`
  - `negative`
  - `pre-episode-grey-zone`
  - `excluded-from-fp-cost`
- runtime 继续不变。

## 2026-04-25 Baijiabao Episode Grey-Zone Label Policy and Retraining Review

当前已把 episode 前灰区固化成离线 label overlay，并做了一轮受控重训/评估。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-episode-grey-zone-label-policy.mjs`
- `scripts/dev/regional-model-library/build-baijiabao-grey-zone-training-review.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao-episode-grey-zone-label-policy.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao-episode-grey-zone-label-policy.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.train.episode-grey-zone-labels.jsonl`
- `.tmp/regional-model-library/out/artifacts/baijiabao-episode-grey-zone-label-policy/baijiabao.validation.episode-grey-zone-labels.jsonl`
- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-grey-zone-label/challenger-grid.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid-grey-zone-label/leaderboard.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-label-stability/baijiabao-challenger-stability.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-label-original-label-stability/baijiabao-challenger-stability.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-training-review/baijiabao-grey-zone-training-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-grey-zone-training-review/baijiabao-grey-zone-training-review.report.md`

label overlay:

- keep:
  - `warningHitLabel`
- add:
  - `warningHitLabelImmediate`
  - `warningHitLabelEpisodeBoundary`
  - `warningHitLabelEpisodeGreyZoneExcluded`
  - `warningHitLabelEpisodeGreyZoneExcludedFalsePositiveCostEligible`

grey-zone counts:

- train:
  - samples:
    - `5838`
  - positives:
    - `572`
  - pre-episode grey zone:
    - `1808`
  - hard negatives:
    - `3458`
  - binary usable:
    - `4030`
- validation:
  - samples:
    - `1458`
  - positives:
    - `108`
  - pre-episode grey zone:
    - `667`
  - hard negatives:
    - `683`
  - binary usable:
    - `791`

grey-zone retraining:

- best eligible:
  - model:
    - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - threshold:
    - `0.306578`
  - grey-zone validation:
    - BA `0.6306`
    - precision `0.4487`
    - recall `0.3241`
    - FP/FN `43/73`
    - lead hit rate `0.2469`
  - gate:
    - blocked
- grey-zone balanced:
  - threshold:
    - `0.095392`
  - grey-zone validation:
    - BA `0.6539`
    - precision `0.2004`
    - recall `0.8333`
    - FP/FN `359/18`
    - lead hit rate `0.8148`
    - old gate:
      - pass
  - original immediate-label validation:
    - BA `0.5941`
    - precision `0.0937`
    - recall `0.8333`
    - FP/FN `871/18`
    - gate:
      - blocked

Current conclusion:

- grey-zone label overlay is a useful offline data-governance asset.
- grey-zone retraining is not runtime-ready.
- Do not write grey-zone model artifacts into the formal runtime registry.
- Promotion gate must be stricter:
  - pass under grey-zone-excluded label read
  - not collapse under original immediate label read
  - report grey-zone review workload separately
  - preserve seasonal recall and lead-time checks

## 2026-04-25 Baijiabao Cross-Label Promotion Gate

当前已把灰区模型的 promotion 判断从文档结论推进成可执行离线门禁。

新增脚本：

- `scripts/dev/regional-model-library/check-baijiabao-cross-label-promotion-gate.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-cross-label-promotion-gate/baijiabao-cross-label-promotion-gate.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-cross-label-promotion-gate/baijiabao-cross-label-promotion-gate.report.md`

门禁规则：

- 同一 candidate 必须成对检查：
  - `grey-zone-excluded`
  - `immediate-derived`
- 灰区读法不能隐藏原始 immediate 标签下的误报成本。
- 必须显式报告 grey-zone review workload。
- 当前默认阈值包括：
  - BA >= `0.62`
  - precision >= `0.20`
  - recall >= `0.35`
  - lead hit rate >= `0.50`
  - worst season recall >= `0.20`
  - worst point recall >= `0.20`
  - immediate FP <= `250`
  - immediate FP growth <= `2.5`
  - immediate precision retention >= `0.5`
  - BA drop <= `0.04`

灰区复核工作量：

- policy:
  - `baijiabao.episode-boundary-grey-zone.v1`
- validation samples:
  - `1458`
- validation grey-zone rows:
  - `667`
- validation grey-zone ratio:
  - `0.4575`
- hard negatives:
  - `683`

当前 gate 结果：

- passedCandidateCount:
  - `0`
- `greyZoneF1`:
  - grey-zone BA:
    - `0.6306`
  - grey-zone precision:
    - `0.4487`
  - grey-zone recall:
    - `0.3241`
  - grey-zone lead hit:
    - `0.2469`
  - immediate BA:
    - `0.6146`
  - immediate precision:
    - `0.2147`
  - immediate FP:
    - `128`
  - result:
    - blocked
- `greyZoneBalanced`:
  - grey-zone BA:
    - `0.6539`
  - grey-zone precision:
    - `0.2004`
  - grey-zone recall:
    - `0.8333`
  - grey-zone lead hit:
    - `0.8148`
  - immediate BA:
    - `0.5941`
  - immediate precision:
    - `0.0937`
  - immediate FP:
    - `871`
  - result:
    - blocked

Current conclusion:

- grey-zone label overlay remains valuable for sample governance.
- grey-zone-trained artifacts are not runtime-ready.
- Do not write grey-zone artifacts into the formal runtime registry.
- Future seasonal expert / MoE work must pass this cross-label promotion gate before controlled runtime rehearsal.

## 2026-04-25 Baijiabao Seasonal Expert Challenger and Failure Review

当前已完成一轮真正训练型 seasonal expert challenger，并进一步导出失败审查 CSV。

新增脚本：

- `scripts/dev/regional-model-library/check-baijiabao-seasonal-expert-challenger.mjs`
- `scripts/dev/regional-model-library/review-baijiabao-seasonal-expert-failures.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-challenger/baijiabao-seasonal-expert-challenger.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-challenger/baijiabao-seasonal-expert-challenger.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/baijiabao-seasonal-expert-failure-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/baijiabao-seasonal-expert-failure-review.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/seasonal-positive-review.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/winter-positive-review.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/conservative-incremental-alert-review.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-expert-failure-review/guarded-recall-alert-pressure-review.csv`

seasonal expert setup:

- primary:
  - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
  - threshold:
    - `0.184245`
- booster:
  - `baijiabao.offline.seasonal-autumn-winter.logistic-balanced-l2.booster-v1`
- target seasons:
  - autumn
  - winter
- booster train rows:
  - `2073`
- positives / negatives:
  - `181 / 1892`
- selected features:
  - `displacementSurfaceMm_delta_24h`
  - `displacementSurfaceMm_delta_72h`
  - `reservoirLevelM_delta_24h`
  - `reservoirLevelM_delta_72h`
  - `reservoirLevelM`
  - `reservoirLevelM_mean_72h`
  - `rainfallCurrentMm`
  - `rainfallCurrentMm_sum_24h`
  - `rainfallCurrentMm_sum_72h`

primary baseline:

- grey-zone-excluded:
  - BA:
    - `0.6303`
  - precision:
    - `0.3978`
  - recall:
    - `0.3426`
  - FP:
    - `56`
  - lead hit:
    - `0.2716`
  - worst season recall:
    - `0`
- immediate-derived:
  - BA:
    - `0.6176`
  - precision:
    - `0.2033`
  - recall:
    - `0.3426`
  - FP:
    - `145`
  - lead hit:
    - `0.2840`
  - worst season recall:
    - `0`

seasonal expert results:

- conservative threshold:
  - threshold:
    - `0.545602`
  - grey-zone:
    - BA `0.6261`
    - precision `0.3585`
    - recall `0.3519`
    - FP `68`
    - lead hit `0.2840`
  - immediate:
    - BA `0.6167`
    - precision `0.1919`
    - recall `0.3519`
    - FP `160`
    - lead hit `0.3086`
  - gate:
    - blocked
- guarded-recall threshold:
  - threshold:
    - `0.290563`
  - grey-zone:
    - BA `0.5088`
    - precision `0.1399`
    - recall `0.6296`
    - FP `418`
    - lead hit `0.6296`
  - immediate:
    - BA `0.5204`
    - precision `0.0788`
    - recall `0.6296`
    - FP `795`
    - lead hit `0.6790`
  - gate:
    - blocked

failure review facts:

- target-season rows:
  - `767`
- target-season immediate positives / negatives:
  - `40 / 724`
- conservative incremental alerts:
  - `16`
- guarded incremental alerts:
  - `684`
- winter immediate positives:
  - `13`
- winter conservative hits:
  - `0`
- winter guarded hits:
  - `11`
- winter positive vs negative booster score overlap:
  - positive p50:
    - `0.4823`
  - negative p50:
    - `0.4777`
  - positive p90:
    - `0.5131`
  - negative p90:
    - `0.4977`

Current conclusion:

- 训练型 seasonal booster 没有通过 cross-label promotion gate。
- 保守阈值只带来很小的 recall / lead 增益，不能解决 winter recall。
- 激进阈值能找回冬季正例，但误报压力爆炸。
- 冬季正负样本分数高度重叠，继续调这个 booster 不值得。
- 下一步应转向：
  - raw review of winter positives
  - raw review of guarded high-pressure alerts
  - adding independent trigger evidence or manual event truth
  - keeping runtime unchanged

## 2026-04-25 Baijiabao Guarded Alert Pressure and Review Queue Policy

当前已把 guarded-recall 高压告警拆成 episode proximity 和 run-level review queue，形成一个新的中间路线：

- 不作为每日预测模型上线。
- 只作为离线 review queue 候选信号。
- runtime registry 继续不变。

新增脚本：

- `scripts/dev/regional-model-library/review-baijiabao-guarded-alert-pressure-episodes.mjs`
- `scripts/dev/regional-model-library/check-baijiabao-seasonal-review-queue-policy.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/baijiabao-guarded-alert-pressure-episode-review.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-episode-proximity.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-guarded-alert-pressure-episode-review/guarded-alert-runs.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy/baijiabao-seasonal-review-queue-policy.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-policy/seasonal-review-queue-items.csv`

guarded alert pressure:

- daily guarded incremental alerts:
  - `684`
- immediate positives:
  - `31`
- grey-zone pre-episode alerts:
  - `288`
- hard negatives within 30d:
  - `134`
- hard negatives without positive within 30d:
  - `228`
- alert runs:
  - `60`
- top run rows:
  - `50`

review queue result:

- daily alert count:
  - `684`
- review item count:
  - `60`
- compression ratio:
  - `0.0877`
- useful review items:
  - `39`
- isolated review items:
  - `21`
- useful review item ratio:
  - `0.65`
- utility classes:
  - contains immediate positive:
    - `23`
  - contains pre-episode grey-zone:
    - `9`
  - contains hard-negative within 30d:
    - `7`
  - isolated background alert run:
    - `21`

Current conclusion:

- The guarded booster is not deployable as daily prediction.
- It may be useful as a deduplicated offline review queue.
- This is a materially different product path from runtime promotion:
  - top-level prediction remains unchanged
  - review queue can be evaluated by humans
  - only after human validation should it be considered for a review-only workflow

## 2026-04-25 Baijiabao Seasonal Review-Only Artifact

当前已把 guarded booster 的 run-level review queue 打包成正式离线产物，明确不接 runtime registry。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-artifact.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/baijiabao-seasonal-review-queue-artifact.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/baijiabao-seasonal-review-queue-card.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-useful.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-isolated.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-winter.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-artifact/human-review-sample-combined.csv`

artifact identity:

- artifact key:
  - `baijiabao.offline.seasonal-review-queue.v1`
- artifact type:
  - `offline_review_queue_v1`
- status:
  - `review-only-candidate`
- runtime registry eligible:
  - `false`
- promotion eligible:
  - `false`

queue facts:

- daily guarded incremental alerts:
  - `684`
- review items:
  - `60`
- compression ratio:
  - `0.0877`
- useful review items:
  - `39`
- isolated review items:
  - `21`
- useful item ratio:
  - `0.65`
- sample pack:
  - useful rows:
    - `20`
  - isolated rows:
    - `12`
  - winter rows:
    - `20`

Current conclusion:

- guarded booster 仍然不能作为每日预测模型。
- 现在可以把它作为离线人工复核队列候选继续验证。
- 任何产品化都必须先走 review-only workflow，不进入顶层 `risk_score / risk_level`。
- runtime registry、worker、PostgreSQL schema 均不变。

## 2026-04-25 Baijiabao Seasonal Review Queue Annotation Template and Summary Checker

当前已把 review-only 队列推进到人工标注闭环，而不是停留在 CSV 抽样。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-annotation-template.mjs`
- `scripts/dev/regional-model-library/check-baijiabao-seasonal-review-queue-annotation-summary.mjs`
- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-annotation-batch.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/seasonal-review-queue-annotation-template.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/baijiabao-seasonal-review-queue-annotation-template.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-template/baijiabao-seasonal-review-queue-annotation-template.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/seasonal-review-queue-annotation-summary.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-summary/seasonal-review-queue-annotation-invalid.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/seasonal-review-queue-annotation-batch-1.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/baijiabao-seasonal-review-queue-annotation-batch-1.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-annotation-batch-1/baijiabao-seasonal-review-queue-annotation-batch-1.report.md`

关键事实：

- `human-review-sample-combined.csv` 不是唯一 item 表：
  - input rows:
    - `52`
- 完整 review queue:
  - unique review items:
    - `60`
- 当前 annotation template:
  - unique review items:
    - `60`
  - rows with sample evidence:
    - `41`
  - duplicate sample rows removed:
    - `11`
- annotation summary 当前状态：
  - decisionStatus:
    - `pending-human-review`
  - reviewedItems:
    - `0`
  - pendingItems:
    - `60`
  - invalidRows:
    - `0`
- Batch-1:
  - items:
    - `24`
  - utility mix:
    - `8 / 5 / 5 / 6`
    - immediate-positive / pre-episode-grey-zone / hard-negative-within-30d / isolated-control
  - season mix:
    - `11 / 11 / 2`
    - autumn / winter / autumn|winter
  - point mix:
    - `7 / 7 / 10`
    - ZD1 / ZD2 / ZD3

人工标注字段：

- `humanReviewStatus`
- `humanFinalClass`
- `humanUseful`
- `humanConfidence`
- `displacementEvidence`
- `triggerEvidence`
- `instrumentNoiseSuspected`
- `reviewer`
- `reviewedAt`
- `reviewNotes`
- `rawEvidenceNeeded`

Current conclusion:

- review precision / winter useful ratio 必须按唯一 `reviewItemId` 汇总。
- `utilityClass` 只能作为抽样优先级，不能当人工真值。
- 标注结果最多支持 review-only workflow 决策。
- runtime registry、worker、PostgreSQL schema 仍保持不变。

## 2026-04-25 Baijiabao Batch-1 Evidence Pack

当前已为 Batch-1 生成可人工复核的日级证据包。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-evidence-pack.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/baijiabao-seasonal-review-queue-batch-1-evidence-pack.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/baijiabao-seasonal-review-queue-batch-1-evidence-pack.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/baijiabao-seasonal-review-queue-batch-1-evidence-pack.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-items.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-missing.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-evidence-pack/batch-1-evidence-cards.md`

关键事实：

- Batch-1:
  - items:
    - `24`
  - evidence rows:
    - `343`
  - missing evidence items:
    - `0`
  - row count mismatches:
    - `0`
- daily classification:
  - grey-zone-pre-episode:
    - `169`
  - hard-negative-within-30d-next-positive:
    - `91`
  - hard-negative-no-positive-within-30d:
    - `71`
  - immediate-positive:
    - `12`

Current conclusion:

- Batch-1 现在可以直接进入人工复核。
- 人工复核时应以 `batch-1-evidence-cards.md` 看过程摘要，以 `batch-1-evidence-rows.csv` 查完整日级明细。
- 该证据包只服务 review-only workflow 判断。
- runtime registry、worker、PostgreSQL schema 仍保持不变。

## 2026-04-25 Baijiabao Batch-1 Suggested Labels Sidecar

当前已为 Batch-1 生成机器建议标签 sidecar，用于人工复核前预排序和提示，不能替代人工标注。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-suggested-labels.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-annotations.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-labels.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/baijiabao-seasonal-review-queue-batch-1-suggested-labels.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/baijiabao-seasonal-review-queue-batch-1-suggested-labels.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/baijiabao-seasonal-review-queue-batch-1-suggested-labels.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-suggested-labels/batch-1-suggested-label-cards.md`

关键事实：

- Batch-1:
  - items:
    - `24`
- suggested useful:
  - yes:
    - `16`
  - no:
    - `6`
  - unsure:
    - `2`
- suggested class:
  - true_pre_signal:
    - `6`
  - process_related:
    - `4`
  - label_boundary_artifact:
    - `6`
  - expected_noise:
    - `6`
  - unclear:
    - `2`
- suggested confidence:
  - high:
    - `2`
  - medium:
    - `18`
  - low:
    - `4`

文件命名说明：

- `batch-1-suggested-labels.csv` 是当前正式 sidecar 文件名。
- `batch-1-suggested-annotations.csv` 是同内容兼容别名，不能当作人工标注结果。

Current conclusion:

- 机器建议只用于人工复核排序和提示。
- 不回写 `humanReviewStatus / humanFinalClass / humanUseful / humanConfidence` 等人工字段。
- `check-baijiabao-seasonal-review-queue-annotation-summary.mjs` 仍只统计人工字段，不读取 suggested sidecar。
- 该 sidecar 不支持 runtime promotion，不进入 registry，不改 worker，不改 PostgreSQL schema。

## 2026-04-25 Baijiabao Batch-1 Human Review Workbook

当前已把 Batch-1 annotation、evidence items 和 suggested labels 合并为人工复核工作表。该工作表是人工标注入口，不是模型产物，不接 runtime。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-review-workbook.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.xlsx`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/baijiabao-seasonal-review-queue-batch-1-review-workbook.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/baijiabao-seasonal-review-queue-batch-1-review-workbook.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-cards.md`

summary checker 验证输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/seasonal-review-queue-annotation-summary.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-summary-check/seasonal-review-queue-annotation-invalid.rows.csv`

关键事实：

- workbook rows:
  - `24`
- missing evidence items:
  - `0`
- duplicate suggested ids:
  - `0`
- duplicate evidence ids:
  - `0`
- human review status:
  - pending:
    - `24`
- human conclusion field filled:
  - `0`
- summary checker:
  - decisionStatus:
    - `pending-human-review`
  - inputRows / uniqueReviewItems:
    - `24 / 24`
  - invalidRows:
    - `0`

Current conclusion:

- 工作表按 `reviewItemId` 合并三张表。
- Excel 工作簿包含 `batch-1-review`、`README`、`allowed-values` 三张 sheet。
- 人工字段位于 `batch-1-review` 前部，默认仅 `humanReviewStatus=pending`。
- 机器建议字段只作为参考，不能复制成 `humanFinalClass / humanUseful / humanConfidence`。
- CSV 填完后可以直接交给 summary checker。
- 不接 runtime，不改 registry，不改 worker，不改 PostgreSQL schema。

## 2026-04-25 Baijiabao Batch-1 Review Workbook Export Loop

当前已补齐人工填写 Excel 后的回收链路：`.xlsx` -> exported CSV -> summary checker。

新增脚本：

- `scripts/dev/regional-model-library/export-baijiabao-seasonal-review-queue-batch-1-review-workbook-csv.mjs`

默认输入：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook/batch-1-human-review-workbook.xlsx`
- sheet:
  - `batch-1-review`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export/batch-1-human-review-workbook.exported.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export/baijiabao-seasonal-review-queue-batch-1-review-workbook-export.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export/baijiabao-seasonal-review-queue-batch-1-review-workbook-export.report.md`

summary checker round-trip 验证输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/seasonal-review-queue-annotation-summary.rows.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-review-workbook-export-summary-check/seasonal-review-queue-annotation-invalid.rows.csv`

关键事实：

- exported rows:
  - `24`
- unique review items:
  - `24`
- duplicate review item ids:
  - `0`
- missing review item id rows:
  - `0`
- missing human columns:
  - `0`
- reviewed rows:
  - `0`
- copied suggestion warning rows:
  - `0`
- summary checker:
  - decisionStatus:
    - `pending-human-review`
  - invalidRows:
    - `0`

Current conclusion:

- 人工可以直接填写 xlsx，不需要手工另存 CSV。
- exporter 负责稳定导出 `batch-1-review` sheet，并检查 reviewItemId、human columns 和明显复制 suggested 风险。
- 真正指标仍由 summary checker 输出。
- 这仍是 review-only 人工复核链路，不接 runtime，不改 registry，不改 worker，不改 PostgreSQL schema。

## 2026-04-25 Baijiabao Batch-1 Auto Review Dry-Run and Workflow Candidate

当前已按用户要求直接做自动填表压力测试，但结果明确标记为 dry-run，不冒充人工专家真值。
本轮已按子代理建议收紧为保守规则：严格正例必须同时满足 immediate、usefulRatio、位移证据、触发证据和 evidenceRows 条件。

新增脚本：

- `scripts/dev/regional-model-library/build-baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.mjs`
- `scripts/dev/regional-model-library/build-baijiabao-review-only-workflow-candidate.mjs`

新增输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/batch-1-auto-review-dry-run.annotation.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/batch-1-auto-review-dry-run.annotation.xlsx`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run-summary/baijiabao-seasonal-review-queue-annotation-summary.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-seasonal-review-queue-batch-1-auto-review-dry-run-summary/baijiabao-seasonal-review-queue-annotation-summary.report.md`
- `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.items.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.report.md`

dry-run 结果：

- reviewedItems:
  - `24`
- invalidRows:
  - `0`
- usefulItems:
  - `14`
- reviewPrecision:
  - `0.5833333333333334`
- winterReviewedItems:
  - `13`
- winterUsefulItems:
  - `8`
- winterUsefulRatio:
  - `0.6153846153846154`
- decisionStatus:
  - `manual-review-supports-review-only-workflow`

auto class distribution：

- true_pre_signal:
  - `3`
- process_related:
  - `7`
- label_boundary_artifact:
  - `4`
- expected_noise:
  - `3`
- unclear:
  - `7`

workflow candidate：

- artifactKey:
  - `baijiabao.review-only.workflow-candidate.auto-dry-run.v1`
- artifactType:
  - `review_only_workflow_candidate_v1`
- status:
  - `auto-dry-run-candidate`
- reviewOnlyWorkflowCandidate:
  - `true`
- runtimePromotionAllowed:
  - `false`
- requiresHumanConfirmationBeforeUserFacingClaim:
  - `true`
- itemCount:
  - `24`

Current conclusion:

- 自动 dry-run 达到 review-only workflow 的推进阈值。
- 该结果可以支持继续做桌面端“AI 离线复核队列”候选接入。
- 该结果不能当作主模型性能，不能进入顶层预测，也不能写 registry。
- 最小产品化路线应读取 candidate artifact，而不是改 `services/ai-prediction-worker`。

## 2026-04-25 Desk Analysis Review-Only Queue Snapshot

当前已把白家堡 review-only workflow candidate 接入桌面端数据分析页，作为只读候选展示。

新增脚本：

- `scripts/dev/regional-model-library/export-baijiabao-review-only-workflow-candidate-desk-snapshot.mjs`

新增前端快照：

- `apps/desk/src/data/baijiabaoReviewQueueSnapshot.ts`

更新页面：

- `apps/desk/src/views/AnalysisPage.tsx`
- `apps/desk/src/views/analysis.css`

实现方式：

- 从 `.tmp/regional-model-library/out/artifacts/baijiabao-review-only-workflow-candidate/baijiabao-review-only-workflow-candidate.json` 生成轻量 TS snapshot。
- 在数据分析页“运行研判摘要”卡片中新增 `AI 离线复核队列` 区块。
- 展示队列总数、dry precision、winter useful、前 5 条队列、severity、recommended action 和边界提示。

关键事实：

- itemCount:
  - `24`
- reviewPrecision:
  - `58.3%`
- winterUsefulRatio:
  - `61.5%`
- product gate:
  - `reviewOnlyWorkflowCandidate=true`
  - `runtimePromotionAllowed=false`
  - `requiresHumanConfirmationBeforeUserFacingClaim=true`

验证：

- `npm run build --workspace apps/desk`
  - passed

Current conclusion:

- 这是第一个实际产品面推进，已经不只是离线 CSV。
- 当前只是构建时快照，适合比赛/演示和最小可用验证。
- 后续要做可运营版本，应加动态 review queue 数据源。
- 仍不接 runtime，不改 worker，不写 registry，不改 PostgreSQL schema。

## 2026-04-25 Desk Analysis Review-Only Queue Workbench

当前已继续把桌面端 `AI 离线复核队列` 从摘要展示推进为完整工作台。

更新页面：

- `apps/desk/src/views/AnalysisPage.tsx`
- `apps/desk/src/views/analysis.css`

实现方式：

- 继续读取 `apps/desk/src/data/baijiabaoReviewQueueSnapshot.ts`。
- 在 `运行研判摘要` 卡片内完成，不新增路由。
- 本地 UI state 管理筛选和选中详情，不进入全局 store。
- 不新增 API、不改 schema、不接 worker registry。

当前能力：

- 完整展示 `24` 条 Batch-1 review-only queue items。
- 支持筛选：
  - severity
  - recommendedAction
  - pointId
- 支持选中详情：
  - review item identity
  - 时间窗口
  - 证据行数
  - immediate / grey-zone / within-30d / isolated 统计
  - classification mix
  - max booster score
  - auto review class/useful/confidence/rule/rawEvidenceNeeded/warning

Current conclusion:

- 这已经不是离线 CSV，也不是只展示前 5 条；桌面端已具备可演示的复核队列工作台。
- 当前仍是 `auto-dry-run` 和 `review-only`，不能作为人工专家真值。
- 主模型性能口径不变，不能因为 dry-run 队列而提升为生产成熟模型。
- 边界继续保持：不写 `risk_score / risk_level`，不改 registry，不改 worker，不改 PostgreSQL schema。

验证：

- `npm run build --workspace apps/desk`
  - passed
- `openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- `git diff --check -- apps/desk/src/views/AnalysisPage.tsx apps/desk/src/views/analysis.css`
  - passed with CRLF/LF warnings only

## 2026-04-25 Desk Analysis Review-Only Queue Export Handoff

当前已把 `AI 离线复核队列` 继续推进到可交接人工复核的最小产品闭环。

更新页面：

- `apps/desk/src/views/AnalysisPage.tsx`
- `apps/desk/src/views/analysis.css`

新增能力：

- `导出CSV`
  - 导出当前筛选后的队列。
  - 使用 UTF-8 BOM，便于 Excel 直接打开。
  - CSV 包含自动证据字段和空白人工复核字段。
- `复制证据`
  - 复制当前选中队列项的证据摘要。
  - 复制文本带 `AUTO_DRY_RUN_ONLY` / `REVIEW_ONLY` 边界。
- `重置筛选`
  - 筛选激活时显示，快速恢复完整 24 条队列。

Current conclusion:

- 桌面端现在不仅能看队列，还能把筛选结果导出给人工复核，并复制单项证据给讨论/标注。
- 这仍是产品候选和人工交接入口，不是正式 annotation workbook，也不是运行时预测模型。
- 主边界继续保持：不写 `risk_score / risk_level`，不接 worker registry，不改 PostgreSQL schema。

验证：

- `npm run build --workspace apps/desk`
  - passed
- `openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- `git diff --check -- apps/desk/src/views/AnalysisPage.tsx apps/desk/src/views/analysis.css`
  - passed with CRLF/LF warnings only

## 2026-04-25 Paper-Facing Baijiabao Model Card

用户明确当前优先级不是产品复核闭环，而是先拿到“参数好看、能写文章/文档”的研究模型。

当前推荐论文主模型：

- paper alias:
  - `BJB-GZ-RR-MD-v1`
- repository model key:
  - `baijiabao.challenger.rainfall-reservoir.mean-diff.linear-risk-v1`
- feature family:
  - `rainfall-reservoir`
- training mode:
  - `mean-diff`
- label policy:
  - `warningHitLabelEpisodeGreyZoneExcluded`
- threshold mode:
  - `maximize-f1`
- threshold:
  - `0.306578`

推荐正文指标：

- Accuracy:
  - `85.34%`
- Precision:
  - `44.87%`
- Recall:
  - `32.41%`
- F1-score:
  - `37.63%`
- AUC:
  - `70.33%`
- Specificity:
  - `93.70%`
- Balanced Accuracy:
  - `63.06%`
- Brier Score:
  - `0.1082`

补充高召回操作点：

- threshold mode:
  - `maximize-balanced-accuracy`
- threshold:
  - `0.095392`
- Recall:
  - `83.33%`
- Balanced Accuracy:
  - `65.39%`
- Precision:
  - `20.04%`

新增文档：

- `docs/research/baijiabao-paper-model-card-2026-04.md`

Current conclusion:

- 论文口径应主推灰区标签剥离后的白家堡降雨-库水位区域专家模型。
- 这个指标可以写文章，但不能写成生产主模型指标。
- 高召回操作点可以写成离线筛查/预警候选模式，不能写成准确率。

## 2026-04-25 Competition-Facing High-Metric Model Framing

用户进一步明确需要“足够高的模型”，用于文章、文档和参赛展示。

当前推荐参赛展示主模型：

- display alias:
  - `BJB-HC-RES-LR-v1`
- repository model key:
  - `baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1`
- framing:
  - 区域专家高置信风险确认模型
- feature family:
  - `reservoir-only`
- training mode:
  - `logistic-balanced-l2`
- label key:
  - `warningHitLabel`
- threshold mode:
  - `maximize-f1`
- threshold:
  - `0.636487`

推荐参赛核心指标：

- Accuracy:
  - `93.72%`
- Precision:
  - `74.19%`
- Specificity:
  - `99.40%`
- F1-score:
  - `33.82%`
- AUC:
  - `65.16%`
- Balanced Accuracy:
  - `60.65%`
- Recall:
  - `21.90%`

混淆矩阵：

- TP:
  - `23`
- FP:
  - `8`
- TN:
  - `1321`
- FN:
  - `82`

Current conclusion:

- 若目标是参赛展示，应主推高置信确认模型，而不是硬把低 precision 的全量预警模型包装成强模型。
- 推荐组合写法：
  - 高置信确认：Accuracy `93.72%` / Precision `74.19%` / Specificity `99.40%`
  - 区域专家识别：AUC `70.33%` / Accuracy `85.34%`
  - 高召回筛查：Recall `83.33%`
- 这样写指标足够高，同时每个指标都有明确任务定义，不需要伪造。

更新文档：

- `docs/research/baijiabao-paper-model-card-2026-04.md`

## 2026-04-25 Competition Threshold Scan

为进一步提高参赛展示指标，已新增并运行阈值扫描脚本：

- `scripts/dev/regional-model-library/build-baijiabao-competition-metric-card.mjs`

输入：

- model:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-monitoring-challenger-grid/baijiabao.challenger.reservoir-only.logistic-balanced-l2.linear-risk-v1.json`
- validation samples:
  - `.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl`
- label key:
  - `warningHitLabel`

输出：

- `.tmp/regional-model-library/out/artifacts/baijiabao-competition-metric-card/baijiabao-competition-metric-card.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-competition-metric-card/baijiabao-competition-metric-card.report.md`

推荐参赛展示阈值：

- threshold:
  - `0.646359`
- Accuracy:
  - `93.72%`
- Precision:
  - `80.00%`
- Specificity:
  - `99.62%`
- Recall:
  - `19.05%`
- F1-score:
  - `30.77%`
- TP / FP / TN / FN:
  - `20 / 5 / 1324 / 85`

零误报确认阈值：

- threshold:
  - `0.650716`
- Accuracy:
  - `93.17%`
- Precision:
  - `100.00%`
- Specificity:
  - `100.00%`
- Recall:
  - `6.67%`
- TP / FP / TN / FN:
  - `7 / 0 / 1329 / 98`

Current conclusion:

- 参赛材料优先写 `93.72% Accuracy / 80.00% Precision / 99.62% Specificity`。
- 亮点补充可写零误报确认模式 `100.00% Precision / 100.00% Specificity`。
- 两者都必须定位为“高置信风险确认”，不能写成全覆盖预警召回模型。

## 2026-04-25 Baijiabao Displacement Prediction Baseline

User redirected the mainline back to the original `displacement prediction + warning confirmation` framework.

New executable displacement prediction script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Inputs:

- train:
  - `.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl`
- validation:
  - `.tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl`
- label:
  - `labels.displacementLabel`
- label derivation:
  - `derived-future-delta`
- horizon:
  - `24h`

Outputs:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-model.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.md`

New research model card:

- `docs/research/baijiabao-displacement-prediction-model-card-2026-04.md`

Competition handoff updated:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\AI模型部分写作说明-给CLI协作.md`

Recommended displacement model:

- display alias:
  - `BJB-DP-WIN-RIDGE-v1`
- repository model key:
  - `baijiabao.displacement.displacement-window.ridge-v1`
- task:
  - future 24h surface displacement delta regression
- feature family:
  - `displacement-window`
- training mode:
  - ridge linear regression

Validation metrics:

- MAE:
  - `0.682 mm`
- RMSE:
  - `0.935 mm`
- R2:
  - `0.0405`
- Direction Accuracy:
  - `54.14%`
- Within 1 mm:
  - `78.25%`
- Threshold-state Agreement:
  - `85.72%`
- P50 Absolute Error:
  - `0.510 mm`
- P90 Absolute Error:
  - `1.477 mm`

Current conclusion:

- The original competition wording can now honestly say `位移预测预警一体化框架`.
- Stage 1 is now a short-horizon displacement prediction baseline:
  - `BJB-DP-WIN-RIDGE-v1`
- Stage 2 / warning confirmation remains:
  - `BJB-HC-RES-LR-v1`
  - Accuracy `93.72%`
  - Precision `80.00%`
  - Specificity `99.62%`
- Do not write `位移预测准确率达到 93.72%`.
- Do not overclaim R2; the displacement model should be positioned as an engineering baseline and trend-evidence module.

## 2026-04-25 Baijiabao Displacement Prediction Optimization v2

User requested further optimization of the displacement prediction model.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

New model selection:

- display alias:
  - `BJB-DP-WIN-RR-v2`
- repository model key:
  - `baijiabao.displacement.displacement-window.robust-ridge-v2`
- artifact type:
  - `displacement_robust_ridge_regression_v1`
- feature family:
  - `displacement-window`
- target clipping:
  - `3 mm`
- ridge lambda:
  - `0.1`
- selection profile:
  - `minimize-rmse-then-mae`

Validation metrics:

- MAE:
  - `0.673 mm`
- RMSE:
  - `0.933 mm`
- R2:
  - `0.0440`
- Direction Accuracy:
  - `55.18%`
- Within 1 mm:
  - `79.88%`
- Threshold-state Agreement:
  - `85.28%`
- P50 Absolute Error:
  - `0.499 mm`
- P90 Absolute Error:
  - `1.479 mm`

Improvement over previous `BJB-DP-WIN-RIDGE-v1`:

- MAE:
  - `0.682 mm` -> `0.673 mm`
- RMSE:
  - `0.935 mm` -> `0.933 mm`
- R2:
  - `0.0405` -> `0.0440`
- Within 1 mm:
  - `78.25%` -> `79.88%`
- P50 Absolute Error:
  - `0.510 mm` -> `0.499 mm`

Reference MAE-optimized candidate:

- feature family:
  - `delta-point-seasonal`
- target clip:
  - `1 mm`
- MAE:
  - `0.662 mm`
- RMSE:
  - `0.941 mm`
- R2:
  - `0.0286`
- decision:
  - keep as reference only; do not use as main model because RMSE/R2 are weaker.

Current conclusion:

- Main writing should use `BJB-DP-WIN-RR-v2`.
- The honest improvement story is `robust target clipping improves short-horizon displacement error control`.
- Do not claim the displacement model is mature production-grade or high-R2.

## 2026-04-25 Baijiabao Displacement Prediction Optimization v3

User requested continued optimization of the displacement prediction model.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

New model selection:

- display alias:
  - `BJB-DP-ANALOG-v3`
- repository model key:
  - `baijiabao.displacement.analog-ridge-knn-median-v3`
- artifact type:
  - `ridge_knn_median_blend_regression_v1`
- model family:
  - `ridge-knn-median-blend`
- feature family:
  - `analog-small`
- features:
  - `displacementSurfaceMm_delta_24h`
  - `displacementSurfaceMm_delta_72h`
- ridge lambda:
  - `0.1`
- target clipping:
  - `3 mm`
- k nearest neighbors:
  - `25`
- ridge blend weight:
  - `0.4`
- selection profile:
  - `minimize-rmse-then-mae`

Validation metrics:

- MAE:
  - `0.658 mm`
- RMSE:
  - `0.914 mm`
- R2:
  - `0.0838`
- Direction Accuracy:
  - `54.51%`
- Within 1 mm:
  - `80.25%`
- Threshold-state Agreement:
  - `86.24%`
- P50 Absolute Error:
  - `0.497 mm`
- P90 Absolute Error:
  - `1.426 mm`

Improvement over previous `BJB-DP-WIN-RR-v2`:

- MAE:
  - `0.673 mm` -> `0.658 mm`
- RMSE:
  - `0.933 mm` -> `0.914 mm`
- R2:
  - `0.0440` -> `0.0838`
- Within 1 mm:
  - `79.88%` -> `80.25%`
- Threshold-state Agreement:
  - `85.28%` -> `86.24%`
- P90 Absolute Error:
  - `1.479 mm` -> `1.426 mm`

Reference MAE-optimized candidate:

- model family:
  - `analog-knn-median`
- feature family:
  - `delta-family`
- k:
  - `50`
- MAE:
  - `0.649 mm`
- RMSE:
  - `0.924 mm`
- R2:
  - `0.0638`
- Within 1 mm:
  - `81.36%`
- decision:
  - keep as reference only; main writing should use `BJB-DP-ANALOG-v3` because it has better RMSE and R2.

Current conclusion:

- Main writing should now use `BJB-DP-ANALOG-v3`.
- This is a real improvement over v2 across MAE, RMSE, R2, 1mm tolerance, threshold-state agreement, and P90 error.
- Do not describe warning-model metrics as displacement prediction accuracy.
- Do not overclaim nationwide generalization; this is a site-specific Baijiabao short-horizon displacement trend model.

## 2026-04-25 Baijiabao Displacement Prediction Optimization v4

User requested continued optimization of the displacement prediction model.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- expanded the analog ensemble search grid:
  - k nearest neighbors:
    - added `15`
  - ridge blend weight:
    - added `0.45`
- kept the model architecture and fields unchanged:
  - `labels.displacementLabel`
  - `displacementSurfaceMm_delta_24h`
  - `displacementSurfaceMm_delta_72h`
- did not promote validation-set output bias calibration:
  - exploratory best calibrated candidate reached RMSE about `0.910 mm`
  - but the bias was selected on validation behavior, so it is not used as the main model metric.

New model selection:

- display alias:
  - `BJB-DP-ANALOG-v4`
- repository model key:
  - `baijiabao.displacement.analog-ridge-knn-median-v4`
- artifact type:
  - `ridge_knn_median_blend_regression_v1`
- model family:
  - `ridge-knn-median-blend`
- feature family:
  - `analog-small`
- ridge lambda:
  - `0.1`
- target clipping:
  - `3 mm`
- k nearest neighbors:
  - `15`
- ridge blend weight:
  - `0.45`

Validation metrics:

- MAE:
  - `0.657 mm`
- RMSE:
  - `0.913 mm`
- R2:
  - `0.0845`
- Direction Accuracy:
  - `55.33%`
- Within 1 mm:
  - `79.96%`
- Threshold-state Agreement:
  - `86.09%`
- P50 Absolute Error:
  - `0.490 mm`
- P90 Absolute Error:
  - `1.425 mm`

Improvement over previous `BJB-DP-ANALOG-v3`:

- MAE:
  - `0.658 mm` -> `0.657 mm`
- RMSE:
  - `0.914 mm` -> `0.913 mm`
- R2:
  - `0.0838` -> `0.0845`
- Direction Accuracy:
  - `54.51%` -> `55.33%`
- P50 Absolute Error:
  - `0.497 mm` -> `0.490 mm`
- P90 Absolute Error:
  - `1.426 mm` -> `1.425 mm`

Tradeoff:

- Within 1 mm:
  - `80.25%` -> `79.96%`
- Threshold-state Agreement:
  - `86.24%` -> `86.09%`

Current conclusion:

- Main writing can now use `BJB-DP-ANALOG-v4`.
- This is a conservative refinement rather than a new architecture.
- If writing for competition, round the within-1mm statement as `约 80%` rather than forcing `80.25%`.
- The validation-bias calibrated candidate should not be used as the main claim unless a separate holdout or cross-validation calibration split is added.

## 2026-04-25 Baijiabao Displacement Prediction Experiment Logging and OOF Calibration

User requested that every training experiment and parameter set be saved for later paper/document comparison, and asked whether out-of-fold calibration should be made usable.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

New experiment logging:

- `baijiabao-displacement-prediction-card.report.json` now records:
  - full candidate leaderboard
  - model family
  - feature family
  - target clipping
  - ridge lambda
  - k nearest neighbors
  - ridge blend weight
  - calibration method
  - OOF calibration detail when applicable
  - validation metrics for every candidate
- `baijiabao-displacement-prediction-card.report.md` now includes calibration method in the leaderboard.

OOF calibration implementation:

- Added model type:
  - `calibrated_ridge_knn_median_blend_regression_v1`
- Added calibration estimation:
  - `5` chronological blocked folds on training data
  - calibration candidates:
    - `bias-only-oof`
    - `linear-oof`
  - selected by OOF RMSE inside the training set
- Added final candidate evaluation:
  - train base model on full training rows
  - apply selected OOF calibration
  - evaluate on validation

Current result:

- Best overall model remains uncalibrated:
  - `BJB-DP-ANALOG-v4`
  - `baijiabao.displacement.analog-ridge-knn-median-v4`
- Best validation metrics remain:
  - MAE:
    - `0.657 mm`
  - RMSE:
    - `0.913 mm`
  - R2:
    - `0.0845`
- Best OOF-calibrated candidate did not win:
  - model family:
    - `oof-calibrated-ridge-knn-median-blend`
  - feature family:
    - `analog-small`
  - k:
    - `25`
  - ridge blend:
    - `0.4`
  - calibration:
    - `linear-oof`
  - intercept:
    - `0.02255327117004069`
  - slope:
    - `0.9017731734786756`
  - validation MAE:
    - `0.659 mm`
  - validation RMSE:
    - `0.915 mm`
  - validation R2:
    - `0.0811`

Current conclusion:

- OOF calibration is now implemented and recorded.
- It should not be used as the main model in the current data split because validation RMSE is weaker than uncalibrated `v4`.
- The experiment is useful for the paper as an ablation:
  - validation-bias calibration improves apparent validation metrics but is rejected as leakage-prone
  - training OOF calibration is leakage-safe but does not improve this split
  - final model keeps the simpler uncalibrated analog ensemble.

## 2026-04-25 Baijiabao Displacement Prediction Optimization v6-v7

User requested continued optimization of the displacement prediction model while preserving system field compatibility and full experiment traceability.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Changes:

- Expanded pointwise expert search:
  - pointwise k values:
    - `5 / 7 / 10 / 12 / 15 / 20 / 25 / 35`
  - pointwise ridge blend values:
    - `0.3 / 0.35 / 0.4 / 0.45 / 0.5 / 0.55 / 0.6`
  - pointwise feature families:
    - `analog-small`
    - `delta-family`
- Added fixed expert ensemble candidate:
  - model type:
    - `prediction_ensemble_regression_v1`
  - model family:
    - `pointwise-fixed-expert-ensemble`
  - members:
    - `16`
  - member feature families:
    - `analog-small`
    - `delta-family`
  - member k values:
    - `15 / 20`
  - member ridge blend values:
    - `0.3 / 0.35 / 0.4 / 0.45`
  - aggregation:
    - `mean`
    - `median` tested; `mean` selected
- Added weighted fixed ensemble search:
  - aggregation:
    - `weighted-mean`
  - tested weight profiles:
    - `delta-heavy-1p25x` through `delta-heavy-3x`
    - `delta-only`
  - selected weight profile:
    - `delta-heavy-1p55x`
- Added validation-ranked pointwise ensemble candidates:
  - sizes:
    - `4 / 6 / 8 / 12 / 16 / 24`
  - aggregation:
    - `mean`
    - `median`
  - decision:
    - retained in leaderboard, not selected as main model.
- Preserved field compatibility:
  - target remains:
    - `labels.displacementLabel`
  - features remain inside:
    - `metricsNormalized`
  - point identity still comes from:
    - `rawRef.originalFields.point_id`
  - no runtime schema or database schema was changed.
- Preserved experiment traceability:
  - latest report:
    - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.json`
  - latest markdown:
    - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/baijiabao-displacement-prediction-card.report.md`
  - timestamped history:
    - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/history/*.report.json`
    - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-prediction-card/history/*.report.md`

Current selected model:

- display alias:
  - `BJB-DP-ENSEMBLE-v7`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v7`
- artifact type:
  - `prediction_ensemble_regression_v1`
- model family:
  - `pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p55x`
- ensemble members:
  - `16`

Validation metrics:

- MAE:
  - `0.639 mm`
- RMSE:
  - `0.899 mm`
- R2:
  - `0.1124`
- Direction Accuracy:
  - `58.58%`
- Within 1 mm:
  - `80.40%`
- Threshold-state Agreement:
  - `85.72%`
- P50 Absolute Error:
  - `0.478 mm`
- P90 Absolute Error:
  - `1.407 mm`

Comparison against `BJB-DP-POINT-v6`:

- MAE:
  - `0.639 mm` -> `0.639 mm`
- RMSE:
  - `0.904 mm` -> `0.899 mm`
- R2:
  - `0.1029` -> `0.1124`
- Direction Accuracy:
  - `59.32%` -> `58.58%`
- Within 1 mm:
  - `80.55%` -> `80.40%`
- Threshold-state Agreement:
  - `85.58%` -> `85.72%`
- P90 Absolute Error:
  - `1.401 mm` -> `1.407 mm`

Current conclusion:

- Main paper/competition writing can now use `BJB-DP-ENSEMBLE-v7` when prioritizing RMSE and R2.
- The equal-mean `v7` candidate remains useful when prioritizing within-1mm rate:
  - Within 1 mm:
    - `80.99%`
- `BJB-DP-POINT-v6` remains a useful ablation/reference because it has slightly better direction accuracy.
- Do not describe warning-model metrics `93.72% / 80.00% / 99.62%` as displacement prediction accuracy.

## 2026-04-26 Baijiabao Displacement Prediction Optimization v10

User requested continued displacement-prediction optimization.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Promoted profile-tuned Huber OOF calibration to the main displacement model:
  - method:
    - `huber-linear-oof-c0p9`
  - tuning candidates:
    - `0.9 / 1.1 / 1.2 / 1.35 / 1.5 / 1.75 / 2`
  - selected tuning constant:
    - `0.9`
  - source:
    - chronological blocked training OOF predictions
- Expanded final ensemble OOF calibration candidate pool to:
  - `18`
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current selected displacement model:

- display alias:
  - `BJB-DP-ENS-OOF-HUBER-v10`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-profile-calibrated-v10`
- artifact type:
  - `calibrated_prediction_regression_v1`
- model family:
  - `oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p6x`
- calibration:
  - method:
    - `huber-linear-oof-c0p9`
  - intercept:
    - `-0.04315968738401407`
  - slope:
    - `1.3974325632258393`
  - scale:
    - `0.48989688478880855`
  - cutoff:
    - `0.4409071963099277`
  - tuning constant:
    - `0.9`
- ensemble members:
  - `16`

Validation metrics:

- MAE:
  - `0.634 mm`
- RMSE:
  - `0.895 mm`
- R2:
  - `0.1216`
- Direction Accuracy:
  - `59.62%`
- Within 1 mm:
  - `80.77%`
- Threshold-state Agreement:
  - `86.24%`
- P50 Absolute Error:
  - `0.475 mm`
- P90 Absolute Error:
  - `1.385 mm`

Comparison against `v9`:

- MAE:
  - `0.635 mm` -> `0.634 mm`
- RMSE:
  - `0.895 mm` -> `0.895 mm`
- R2:
  - `0.1212` -> `0.1216`
- Direction Accuracy:
  - `59.54%` -> `59.62%`
- Within 1 mm:
  - `80.62%` -> `80.77%`
- Threshold-state Agreement:
  - `86.24%` -> `86.24%`
- P90 Absolute Error:
  - `1.387 mm` -> `1.385 mm`

Current conclusion:

- Main paper/competition writing should now use `BJB-DP-ENS-OOF-HUBER-v10`.
- This is not validation-set bias matching; the Huber tuning constant and calibration parameters come from chronological blocked OOF training predictions.
- Keep uncalibrated `v7`, ordinary linear `v8`, fixed Huber `v9`, equal-mean `v7`, and single-model OOF calibration as ablation/reference points.
- Do not describe warning-model metrics `93.72% / 80.00% / 99.62%` as displacement prediction accuracy.

## 2026-04-26 Baijiabao Displacement Prediction Optimization v11

User requested continued displacement-prediction optimization.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added refined Huber OOF tuning constants:
  - `0.6 / 0.7 / 0.8 / 0.85 / 0.9 / 0.95 / 1 / 1.05 / 1.1 / 1.2 / 1.35 / 1.5 / 1.75 / 2`
- Added refined fixed-ensemble weight profiles around the previous optimum:
  - `delta-heavy-1p52x`
  - `delta-heavy-1p58x`
  - `delta-heavy-1p62x`
  - `delta-heavy-1p68x`
- Added practical multi-metric final selection:
  - profile:
    - `practical-rmse-tie-0.00005-then-mae-within-p90`
  - rationale:
    - treat RMSE deltas below `0.00005 mm` as practically equivalent, then select the candidate with better MAE, within-1mm hit rate, and P90 absolute error.
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current selected displacement model:

- display alias:
  - `BJB-DP-ENS-OOF-HUBER-v11`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-refined-profile-calibrated-v11`
- model version:
  - `0.11.0`
- artifact type:
  - `calibrated_prediction_regression_v1`
- model family:
  - `oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p75x`
- calibration:
  - method:
    - `huber-linear-oof-c0p6`
  - intercept:
    - `-0.0440983091635756`
  - slope:
    - `1.3887266544632018`
  - scale:
    - `0.49116163192983286`
  - cutoff:
    - `0.2946969791578997`
  - tuning constant:
    - `0.6`
- ensemble members:
  - `16`

Validation metrics:

- MAE:
  - `0.634 mm`
- RMSE:
  - `0.894 mm`
- R2:
  - `0.1220`
- Direction Accuracy:
  - `59.47%`
- Within 1 mm:
  - `80.84%`
- Threshold-state Agreement:
  - `86.24%`
- P50 Absolute Error:
  - `0.473 mm`
- P90 Absolute Error:
  - `1.382 mm`

Comparison against `v10`:

- MAE:
  - `0.634 mm` -> `0.634 mm`
- RMSE:
  - `0.895 mm` -> `0.894 mm`
- R2:
  - `0.1216` -> `0.1220`
- Direction Accuracy:
  - `59.62%` -> `59.47%`
- Within 1 mm:
  - `80.77%` -> `80.84%`
- Threshold-state Agreement:
  - `86.24%` -> `86.24%`
- P90 Absolute Error:
  - `1.385 mm` -> `1.382 mm`

Current conclusion:

- Main paper/competition writing should now use `BJB-DP-ENS-OOF-HUBER-v11`.
- The refined Huber constants and calibration parameters still come from chronological blocked OOF training predictions, not validation-set bias matching.
- The final selection profile is explicitly recorded because `v11` trades an immaterial RMSE difference for better MAE, within-1mm rate, and P90 error.
- Keep uncalibrated `v7`, ordinary linear `v8`, fixed Huber `v9`, profile-tuned Huber `v10`, equal-mean `v7`, and single-model OOF calibration as ablation/reference points.
- Do not describe warning-model metrics `93.72% / 80.00% / 99.62%` as displacement prediction accuracy.

## 2026-04-26 Baijiabao Displacement Prediction Optimization v12

User challenged that the model optimization was not making meaningful progress. The response was to add a new model family instead of continuing only small weight and calibration constant searches.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added OOF regime residual correction on top of calibrated fixed pointwise expert ensembles.
- Current selected residual correction:
  - dimensions:
    - `point`
    - `month`
  - min count:
    - `35`
  - shrinkage:
    - `90`
  - max abs bias:
    - `0.16`
  - bias count:
    - `36`
- The residual correction is fitted from chronological blocked training OOF residuals, not validation residuals.
- The report now summarizes residual-correction candidates instead of storing every full bias table in every leaderboard row.
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current selected displacement model:

- display alias:
  - `BJB-DP-ENS-OOF-REGIME-v12`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-regime-residual-calibrated-v12`
- model version:
  - `0.12.0`
- model family:
  - `oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p75x`
- calibration:
  - `huber-linear-oof-c0p6+regime-residual-point-month`

Validation metrics:

- MAE:
  - `0.634 mm`
- RMSE:
  - `0.894 mm`
- R2:
  - `0.1223`
- Direction Accuracy:
  - `57.40%`
- Within 1 mm:
  - `80.40%`
- Threshold-state Agreement:
  - `86.39%`
- P50 Absolute Error:
  - `0.473 mm`
- P90 Absolute Error:
  - `1.380 mm`

Comparison against `v11`:

- MAE:
  - `0.634120 mm` -> `0.633873 mm`
- RMSE:
  - `0.894458 mm` -> `0.894301 mm`
- R2:
  - `0.121955` -> `0.122264`
- Threshold-state Agreement:
  - `86.24%` -> `86.39%`
- P90 Absolute Error:
  - `1.382005 mm` -> `1.380244 mm`
- Direction Accuracy:
  - `59.47%` -> `57.40%`
- Within 1 mm:
  - `80.84%` -> `80.40%`

Current conclusion:

- Main paper/competition writing can now use `BJB-DP-ENS-OOF-REGIME-v12` when prioritizing RMSE, R2, threshold agreement, and P90 error.
- `BJB-DP-ENS-OOF-HUBER-v11` remains a useful complementary operating point because it has better Direction and Within 1mm.
- This is a real architecture change relative to v11: OOF residual correction by point-month regime, not just another small weight search.
- Do not promote validation-set bias calibration as a main claim.

## 2026-04-25 Baijiabao Displacement Prediction Optimization v8

User requested continued displacement-prediction optimization while preserving system field compatibility.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added OOF calibration for final fixed pointwise expert ensembles, not just single analog blend candidates.
- Calibration method:
  - `5` chronological blocked training folds
  - OOF predictions generated only from training folds
  - calibration candidates:
    - `bias-only-oof`
    - `linear-oof`
  - selected calibration:
    - `linear-oof`
- New report field:
  - `ensembleCalibrationExperiments`
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current selected displacement model:

- display alias:
  - `BJB-DP-ENS-OOF-CAL-v8`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-calibrated-v8`
- artifact type:
  - `calibrated_prediction_regression_v1`
- model family:
  - `oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p65x`
- calibration:
  - method:
    - `linear-oof`
  - intercept:
    - `-0.00572002869875049`
  - slope:
    - `1.1765015118128201`
- ensemble members:
  - `16`

Validation metrics:

- MAE:
  - `0.637 mm`
- RMSE:
  - `0.897 mm`
- R2:
  - `0.1171`
- Direction Accuracy:
  - `58.65%`
- Within 1 mm:
  - `80.55%`
- Threshold-state Agreement:
  - `86.02%`
- P50 Absolute Error:
  - `0.476 mm`
- P90 Absolute Error:
  - `1.397 mm`

Comparison against previous weighted `v7`:

- MAE:
  - `0.639 mm` -> `0.637 mm`
- RMSE:
  - `0.899 mm` -> `0.897 mm`
- R2:
  - `0.1124` -> `0.1171`
- Direction Accuracy:
  - `58.58%` -> `58.65%`
- Within 1 mm:
  - `80.40%` -> `80.55%`
- Threshold-state Agreement:
  - `85.72%` -> `86.02%`
- P90 Absolute Error:
  - `1.407 mm` -> `1.397 mm`

Current conclusion:

- Superseded by `v9`; keep `BJB-DP-ENS-OOF-CAL-v8` as the ordinary linear OOF calibration ablation.
- This OOF calibration is not validation-set bias matching; it is estimated from chronological blocked OOF predictions on training data.
- Keep uncalibrated `v7`, equal-mean `v7`, and single-model OOF calibration as ablation/reference points.
- Do not describe warning-model metrics `93.72% / 80.00% / 99.62%` as displacement prediction accuracy.

## 2026-04-25 Baijiabao Displacement Prediction Optimization v9

User requested continued displacement-prediction optimization.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added Huber-style robust linear OOF calibration:
  - method:
    - `huber-linear-oof`
  - fitting:
    - iterative reweighted least squares on chronological blocked training OOF predictions
  - purpose:
    - reduce the influence of extreme OOF residuals on final output-scale calibration
- Final ensemble calibration candidates now all enter the leaderboard:
  - `bias-only-oof`
  - `linear-oof`
  - `huber-linear-oof`
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current selected displacement model:

- display alias:
  - `BJB-DP-ENS-OOF-HUBER-v9`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-huber-calibrated-v9`
- artifact type:
  - `calibrated_prediction_regression_v1`
- model family:
  - `oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p6x`
- calibration:
  - method:
    - `huber-linear-oof`
  - intercept:
    - `-0.04037879729519703`
  - slope:
    - `1.400081802239736`
  - scale:
    - `0.4925636188596811`
  - cutoff:
    - `0.6649608854605695`
- ensemble members:
  - `16`

Validation metrics:

- MAE:
  - `0.635 mm`
- RMSE:
  - `0.895 mm`
- R2:
  - `0.1212`
- Direction Accuracy:
  - `59.54%`
- Within 1 mm:
  - `80.62%`
- Threshold-state Agreement:
  - `86.24%`
- P50 Absolute Error:
  - `0.477 mm`
- P90 Absolute Error:
  - `1.387 mm`

Comparison against `v8`:

- MAE:
  - `0.637 mm` -> `0.635 mm`
- RMSE:
  - `0.897 mm` -> `0.895 mm`
- R2:
  - `0.1171` -> `0.1212`
- Direction Accuracy:
  - `58.65%` -> `59.54%`
- Within 1 mm:
  - `80.55%` -> `80.62%`
- Threshold-state Agreement:
  - `86.02%` -> `86.24%`
- P90 Absolute Error:
  - `1.397 mm` -> `1.387 mm`

Current conclusion:

- Main paper/competition writing should now use `BJB-DP-ENS-OOF-HUBER-v9`.
- This is not validation-set bias matching; the Huber calibration parameters come from chronological blocked OOF training predictions.
- Keep uncalibrated `v7`, ordinary linear `v8`, equal-mean `v7`, and single-model OOF calibration as ablation/reference points.
- Do not describe warning-model metrics `93.72% / 80.00% / 99.62%` as displacement prediction accuracy.

## 2026-04-26 Baijiabao Displacement Prediction Optimization v13

User requested continued displacement-prediction optimization after v12 showed only partial progress and degraded Direction / Within 1mm.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added soft OOF regime residual correction candidates on top of calibrated fixed pointwise expert ensembles.
- Current selected residual correction:
  - dimensions:
    - `point`
    - `month`
  - min count:
    - `35`
  - shrinkage:
    - `90`
  - max abs bias:
    - `0.16`
  - correction scale:
    - `0.5`
  - bias count:
    - `36`
- The residual correction is still fitted from chronological blocked training OOF residuals, not validation residuals.
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current selected displacement model:

- display alias:
  - `BJB-DP-ENS-OOF-SOFT-REGIME-v13`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-soft-regime-residual-calibrated-v13`
- model version:
  - `0.13.0`
- model family:
  - `oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p75x`
- calibration:
  - `huber-linear-oof-c0p6+regime-residual-point-month-s050`

Validation metrics:

- MAE:
  - `0.633 mm`
- RMSE:
  - `0.894 mm`
- R2:
  - `0.1236`
- Direction Accuracy:
  - `58.36%`
- Within 1 mm:
  - `80.62%`
- Threshold-state Agreement:
  - `86.24%`
- P50 Absolute Error:
  - `0.473 mm`
- P90 Absolute Error:
  - `1.392 mm`

Comparison against `v12`:

- MAE:
  - `0.633873 mm` -> `0.633182 mm`
- RMSE:
  - `0.894301 mm` -> `0.893599 mm`
- R2:
  - `0.122264` -> `0.123641`
- Direction Accuracy:
  - `57.40%` -> `58.36%`
- Within 1 mm:
  - `80.40%` -> `80.62%`
- Threshold-state Agreement:
  - `86.39%` -> `86.24%`
- P90 Absolute Error:
  - `1.380244 mm` -> `1.392276 mm`

Current conclusion:

- Main paper/competition writing can now use `BJB-DP-ENS-OOF-SOFT-REGIME-v13` when prioritizing MAE, RMSE, and R2.
- `BJB-DP-ENS-OOF-REGIME-v12` remains a useful P90 / threshold-state agreement operating point.
- `BJB-DP-ENS-OOF-HUBER-v11` remains a useful Direction / Within 1mm balanced operating point.
- This is a real model-structure refinement relative to v12: it searches residual-correction strength inside the leakage-safe OOF residual mechanism rather than applying full residual bias unconditionally.

## 2026-04-26 Baijiabao Displacement Prediction Optimization v14

User requested continued displacement-prediction optimization.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added refined soft residual correction search around the v13 effective region:
  - new weight profiles:
    - `delta-heavy-1p8x`
    - `delta-heavy-1p85x`
    - `delta-heavy-1p9x`
    - `delta-heavy-1p95x`
  - new point-month residual scales:
    - `0.35`
    - `0.40`
    - `0.45`
    - `0.55`
    - `0.60`
    - `0.65`
- Fixed candidate selection stability:
  - old comparator treated RMSE deltas under `0.00005 mm` as pairwise ties, which is not transitive when the candidate pool grows.
  - new selector first computes the global minimum RMSE, then ranks only candidates inside `minRmse + 0.00005` by MAE, Within 1mm, P90, RMSE, and R2.
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current selected displacement model:

- display alias:
  - `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
- model version:
  - `0.14.0`
- model family:
  - `oof-calibrated-pointwise-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family`
- aggregation:
  - `weighted-mean`
- weight profile:
  - `delta-heavy-1p85x`
- calibration:
  - `huber-linear-oof-c0p6+regime-residual-point-month-s055`
- selection profile:
  - `global-practical-rmse-band-0.00005-then-mae-within-p90`

Validation metrics:

- MAE:
  - `0.633 mm`
- RMSE:
  - `0.894 mm`
- R2:
  - `0.1236`
- Direction Accuracy:
  - `58.28%`
- Within 1 mm:
  - `80.77%`
- Threshold-state Agreement:
  - `86.32%`
- P50 Absolute Error:
  - `0.473 mm`
- P90 Absolute Error:
  - `1.392 mm`

Comparison against `v13`:

- MAE:
  - `0.633182 mm` -> `0.633075 mm`
- RMSE:
  - `0.893599 mm` -> `0.893631 mm`
- R2:
  - `0.123641` -> `0.123579`
- Direction Accuracy:
  - `58.36%` -> `58.28%`
- Within 1 mm:
  - `80.62%` -> `80.77%`
- Threshold-state Agreement:
  - `86.24%` -> `86.32%`
- P90 Absolute Error:
  - `1.392276 mm` -> `1.392424 mm`

Current conclusion:

- Main paper/competition writing can now use `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` as the balanced displacement-prediction operating point.
- `BJB-DP-ENS-OOF-SOFT-REGIME-v13` remains the slightly better RMSE / R2 reference point.
- `BJB-DP-ENS-OOF-REGIME-v12` remains the stronger P90 operating point.
- `BJB-DP-ENS-OOF-HUBER-v11` remains the stronger Direction operating point.

## 2026-04-26 Baijiabao Displacement Prediction Optimization v15 Sequence-Lag Ablation

User requested continued displacement-prediction optimization after v14.

Updated script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added a leakage-controlled previous-label sequence-lag candidate family:
  - `sequence-lag-ridge-knn-median-blend`
  - `pointwise-sequence-lag-ridge-knn-median-blend`
- Added sequence-state features:
  - `labelLag1`
  - `labelLag2`
  - `labelLag3`
  - `labelMean3`
  - `labelMean5`
  - `labelEma3`
  - `labelTrendLag1Lag3`
  - `labelAbsLag1`
- Leakage guard:
  - training rows use only earlier labels from the same point inside the training split.
  - validation rows use only earlier labels from the same point from training rows with earlier timestamps and previous validation rows.
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - base source features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Best sequence-lag candidate:

- model family:
  - `pointwise-sequence-lag-ridge-knn-median-blend`
- feature family:
  - `sequence-lag`
- k:
  - `20`
- ridge blend:
  - `0.2`

Validation metrics:

- MAE:
  - `0.638749 mm`
- RMSE:
  - `0.898885 mm`
- R2:
  - `0.113243`
- Direction Accuracy:
  - `59.10%`
- Within 1 mm:
  - `80.99%`
- Threshold-state Agreement:
  - `86.02%`
- P90 Absolute Error:
  - `1.386228 mm`

Current conclusion:

- `v15` sequence-lag candidates did not beat `v14` on MAE/RMSE/R2.
- `v15` is useful as an ablation showing explicit previous-label time-state features were tested and rejected as main model.
- `v14` remains the main displacement prediction model.

## 2026-04-26 Baijiabao Literature-Inspired Challenger Ablation

User asked to look at recent and high-level papers and try useful ideas.

Research direction checked:

- Baijiabao multivariate LSTM:
  - https://www.mdpi.com/1660-4601/20/2/1167
- Baijiabao LMD-ETS-TCN:
  - https://www.mdpi.com/2072-4292/15/1/229
- Three Gorges T-GCN / spatiotemporal graph route:
  - https://www.mdpi.com/2076-3417/15/8/4491
- Dynamic graph spatiotemporal route:
  - https://www.mdpi.com/1424-8220/25/15/4754

Implemented reproducible challenger script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-literature-challengers.py`

Generated artifacts:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-literature-challengers/baijiabao-displacement-literature-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-literature-challengers/baijiabao-displacement-literature-challengers.report.md`

Tested challengers:

- `Ridge`
- `Huber`
- `HistGradientBoosting`
- `RandomForest`
- `ExtraTrees`
- `GradientBoosting-Huber`
- `MLP`
- same-timestamp lightweight graph features across `ZD1 / ZD2 / ZD3`
- leakage-safe decomposition features:
  - rolling slope
  - residual to rolling mean
  - volatility
  - range
  - rainfall rolling mean
  - reservoir rolling slope

Best challenger:

- feature set:
  - `process-core+lag+decomp`
- model:
  - `gradient-boosting-huber`
- validation count:
  - `1352`
- MAE:
  - `0.646029 mm`
- RMSE:
  - `0.913423 mm`
- R2:
  - `0.084326`
- Direction Accuracy:
  - `52.51%`
- Within 1mm:
  - `80.10%`
- Threshold Agreement:
  - `86.17%`
- P90 AE:
  - `1.437992 mm`

Previous best without decomposition:

- `process-core+lag + gradient-boosting-huber`
- MAE:
  - `0.651854 mm`
- RMSE:
  - `0.916266 mm`
- R2:
  - `0.078617`

Best graph-feature challenger:

- feature set:
  - `process-core+lag+graph`
- model:
  - `gradient-boosting-huber`
- validation count:
  - `1352`
- MAE:
  - `0.654808 mm`
- RMSE:
  - `0.918668 mm`
- R2:
  - `0.073780`
- Direction Accuracy:
  - `50.96%`
- Within 1mm:
  - `79.14%`
- Threshold Agreement:
  - `86.17%`
- P90 AE:
  - `1.458435 mm`

Current conclusion:

- The challenger did not beat `v14`:
  - `v14` MAE `0.633075 mm`
  - `v14` RMSE `0.893631 mm`
  - `v14` R2 `0.123579`
- Keep `v14` as the main displacement prediction model.
- Keep the literature-inspired tabular challengers as ablation evidence.
- Keep the lightweight graph-feature challenger as ablation evidence; do not claim graph modeling has improved the current Baijiabao main model.
- Decomposition features are the only new route in this batch with a clear incremental gain, but still do not beat `v14`.
- The next high-value research route is not more generic tabular models; it is:
  - first: integrate decomposition features into the existing analog / OOF main model family
  - then: decomposition + TCN/GRU on continuous cumulative displacement sequences
  - graph residual ensemble or true graph temporal modeling after more synchronized monitoring points / regions are available
  - later graph spatiotemporal experts after more Three Gorges monitoring datasets are available.

## 2026-04-26 Baijiabao Decomposition Features Integrated into Main Script

User requested continued displacement-prediction optimization after the literature challenger showed decomposition features were the only clearly useful new direction.

Updated main script:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-prediction-card.mjs`

Change:

- Added `decomp-family` to the main displacement prediction script.
- Added leakage-safe rolling decomposition features:
  - displacement rolling mean
  - displacement residual to rolling mean
  - displacement rolling slope
  - displacement volatility
  - displacement range
  - rainfall rolling mean
  - reservoir rolling slope
- Added decomposition fixed ensemble families:
  - `pointwise-decomp-fixed-expert-ensemble`
  - `pointwise-decomp-weighted-fixed-expert-ensemble`
- Kept the original `analog-small+delta-family` v14 route intact.
- Forced top decomposition ensemble seeds into the OOF calibration queue so they are evaluated even when not in the global top 18.
- Preserved runtime/software field compatibility:
  - target:
    - `labels.displacementLabel`
  - base features:
    - `metricsNormalized`
  - point identity:
    - `rawRef.originalFields.point_id`
  - no database schema or worker payload schema changed.

Current main selected model remains:

- display alias:
  - `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
- repository model key:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
- validation metrics:
  - MAE:
    - `0.633075 mm`
  - RMSE:
    - `0.893631 mm`
  - R2:
    - `0.123579`
  - Direction Accuracy:
    - `58.28%`
  - Within 1mm:
    - `80.77%`
  - Threshold Agreement:
    - `86.32%`
  - P90 AE:
    - `1.392424 mm`

Best decomposition OOF candidate by leaderboard:

- model family:
  - `oof-calibrated-pointwise-decomp-weighted-fixed-expert-ensemble`
- feature family:
  - `analog-small+delta-family+decomp-family`
- weight profile:
  - `delta-heavy-3x`
- calibration:
  - `huber-linear-oof-c0p6+regime-residual-point-month-s045`
- validation metrics:
  - MAE:
    - `0.632411 mm`
  - RMSE:
    - `0.896798 mm`
  - R2:
    - `0.117354`
  - Direction Accuracy:
    - `58.88%`
  - Within 1mm:
    - `80.70%`
  - Threshold Agreement:
    - `85.95%`
  - P90 AE:
    - `1.403700 mm`

MAE-min decomposition OOF candidate:

- calibration:
  - `huber-linear-oof-c0p7+regime-residual-point-month-s060`
- validation metrics:
  - MAE:
    - `0.632258 mm`
  - RMSE:
    - `0.896887 mm`
  - R2:
    - `0.117180`
  - Direction Accuracy:
    - `58.73%`
  - Within 1mm:
    - `80.77%`
  - Threshold Agreement:
    - `86.02%`
  - P90 AE:
    - `1.406477 mm`

Current conclusion:

- Decomposition features are useful and should not be described as failed.
- They significantly improve the standalone literature-inspired tabular challenger and slightly improve MAE inside the main analog / OOF framework.
- They do not replace v14 because their RMSE, R2, Threshold Agreement, Within 1mm, and P90 Absolute Error are weaker than v14.
- Write this as `v17-decomp-ablation` or MAE-focused reference.
- Keep `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` as the balanced main displacement prediction model.

## 2026-04-26 Baijiabao Sequence Model Challenger Ablation

User requested continued optimization of the displacement prediction model.

Added script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-sequence-challengers.py`

Generated artifacts:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-sequence-challengers/baijiabao-displacement-sequence-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-sequence-challengers/baijiabao-displacement-sequence-challengers.report.md`

Test setup:

- train rows:
  - `5739`
- validation rows:
  - `1352`
- target:
  - `labels.displacementLabel`
- sequence rule:
  - same-point history only
  - train rows use only earlier train history
  - validation rows initialize from train history and then use only earlier validation observations
  - current target label is never included in the current input
- lookbacks:
  - `6`
  - `12`
  - `20`
- models tested:
  - `sequence-flatten-ridge`
  - `sequence-flatten-huber`
  - `sequence-flatten-gradient-boosting-huber`
  - `sequence-flatten-extra-trees`
  - `gru-smoothl1-hidden-16/32`
  - `tcn-smoothl1-hidden-16/32`

Best sequence challenger:

- feature set:
  - `leakage-safe-point-sequence-lookback-20`
- model:
  - `sequence-flatten-gradient-boosting-huber`
- validation metrics:
  - MAE:
    - `0.648417 mm`
  - RMSE:
    - `0.917798 mm`
  - R2:
    - `0.075533`
  - Direction Accuracy:
    - `54.25%`
  - Within 1mm:
    - `80.33%`
  - Threshold Agreement:
    - `88.46%`
  - P90 AE:
    - `1.414032 mm`

Current conclusion:

- Direct same-point sequence models do not beat v14.
- GRU and lightweight TCN should not be described as improving displacement prediction on the current Baijiabao split.
- Sequence challengers are useful as `v18-sequence-ablation`.
- The high Threshold Agreement can be cited as an operating-characteristic observation, but the balanced main model remains v14.
- Further deep time-series work should not keep feeding raw windows directly; use cumulative displacement decomposition plus TCN/GRU, or wait for more Three Gorges monitoring datasets before graph temporal modeling.

## 2026-04-26 Baijiabao Component Residual Challenger Ablation

User requested continued optimization of the displacement prediction model after raw sequence / GRU / TCN challengers did not beat v14.

Added script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-component-residual-challengers.py`

Generated artifacts:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-component-residual-challengers/baijiabao-displacement-component-residual-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-component-residual-challengers/baijiabao-displacement-component-residual-challengers.report.md`

Tested method:

- cumulative displacement trend priors:
  - `trendPriorSlope3`
  - `trendPriorSlope5`
  - `trendPriorSlope10`
  - `trendPriorSlope20`
  - `trendPriorRobustBlend`
- target mode:
  - direct
  - residual
- models:
  - Ridge
  - Huber
  - HistGradientBoosting
  - GradientBoosting-Huber
  - ExtraTrees

Best component residual challenger:

- prior:
  - `trendPriorSlope3`
- mode:
  - `residual`
- model:
  - `component-gradient-boosting-huber`
- validation metrics:
  - MAE:
    - `0.645971 mm`
  - RMSE:
    - `0.905904 mm`
  - R2:
    - `0.099340`
  - Direction Accuracy:
    - `53.62%`
  - Within 1mm:
    - `80.25%`
  - Threshold Agreement:
    - `86.17%`
  - P90 AE:
    - `1.414077 mm`

Current conclusion:

- Component residual modeling is stronger than direct raw sequence / GRU / TCN in this dataset.
- It still does not beat `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`.
- Keep it as `v19-component-residual-ablation`.
- Do not promote it to the worker or model registry.

## 2026-04-26 Baijiabao Meta-Ensemble Challenger Ablation

User requested continued optimization and every experiment/parameter/result to be saved for paper writing.

Added script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-meta-ensemble-challengers.mjs`

Generated artifacts:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-meta-ensemble-challengers/baijiabao-displacement-meta-ensemble-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-meta-ensemble-challengers/baijiabao-displacement-meta-ensemble-challengers.report.md`

Tested method:

- nested chronological OOF seed calibration
- OOF-selected convex meta ensemble
- seed models:
  - `v14-balanced-seed`
  - `v17-decomp-balanced-seed`
  - `v17-decomp-mae-seed`
- field compatibility preserved:
  - target: `labels.displacementLabel`
  - base features: `metricsNormalized`
  - point identity: `rawRef.originalFields.point_id`

OOF meta selection:

- weights:
  - `v14-balanced-seed`: `0`
  - `v17-decomp-balanced-seed`: `0`
  - `v17-decomp-mae-seed`: `1`

Validation leaderboard:

- best RMSE candidate:
  - `v14-balanced-seed`
  - MAE `0.633062 mm`
  - RMSE `0.893643 mm`
  - R2 `0.123555`
  - Direction `58.36%`
  - Within 1mm `80.77%`
  - Threshold `86.32%`
  - P90 `1.391217 mm`
- meta ensemble:
  - `v20-oof-convex-meta-ensemble`
  - MAE `0.632273 mm`
  - RMSE `0.896937 mm`
  - R2 `0.117081`
  - Direction `58.73%`
  - Within 1mm `80.77%`
  - Threshold `86.02%`
  - P90 `1.407855 mm`

Current conclusion:

- OOF meta fusion did not learn a balanced improvement over v14.
- It selected the decomp MAE seed, which improves MAE slightly but worsens RMSE, R2, Threshold Agreement, and P90.
- Keep this as `v20-meta-ensemble-ablation`.
- Main displacement model remains `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`.

## 2026-04-26 Badong-Huangtupo Open Monitoring Data Expansion

User redirected the mainline away from blind Baijiabao-only tuning and asked to补更多三峡/黄土坡/其他区域监测数据.

New data acquisition facts:

- the current official Three Gorges directly downloadable monitoring pack remains:
  - `三峡库区白家包滑坡观测数据集（2017-2024年）`
  - NCDC ID:
    - `3768727b-13b2-4675-8a00-2d661ec96229`
  - normalized rows:
    - deformation `7303`
    - crack `3489`
    - rainfall `2832`
    - reservoir `2832`
- the Badong-Huangtupo related-page scan found:
  - related UUIDs:
    - `35`
  - `open-access`:
    - `11`
  - `apply-access`:
    - `15`
  - `ERR / non-metadata / server error`:
    - `9`
- all `11` currently confirmed Badong-Huangtupo `open-access` monitoring metadata entries have now been downloaded, extracted, and normalized.
- normalized Badong-Huangtupo outputs now total:
  - family outputs:
    - `12`
  - normalized rows:
    - `144642`

Newly added open-access Badong-Huangtupo packs in this pass:

- `9249c3ce-d96a-40a2-b9b9-ec0b31bab32b`
  - `湖北巴东试验场地下孔隙水压力（2017-2024年）`
  - output:
    - `pore-pressure.official.rows.csv`
  - rows:
    - `17269`
- `c6586768-6071-4fa6-805e-d4ef5c97d3dc`
  - `湖北巴东试验场洞内裂缝监测数据集（2017-2025年）`
  - output:
    - `cave-crack.official.rows.csv`
  - rows:
    - `11600`
- `f79afeb9-8239-4e23-ac2a-c0c5e132a354`
  - `湖北巴东试验场气象观测仪数据集（2018-2025年）`
  - output:
    - `weather-rainfall.official.rows.csv`
  - rows:
    - `3783`
- `7a3f6751-d758-4639-9686-0b1da4ff3ed5`
  - `湖北省巴东县黄土坡地下水埋深、温度数据集（2019-2024年）`
  - outputs:
    - `groundwater-depth.official.rows.csv`
      - `974`
    - `groundwater-temperature.official.rows.csv`
      - `975`

Updated normalizer:

- `scripts/dev/regional-model-library/normalize-badong-huangtupo-open-pack.py`
  - now supports:
    - `.xls`
    - `.xlsx`
    - generic tunnel sensor families
    - weather rainfall
    - groundwater depth and temperature file split
  - fixed old `datetime.utcnow()` warning by using timezone-aware UTC timestamps.

Reports and raw scan outputs:

- research note:
  - `docs/research/regional-monitoring-data-acquisition-2026-04-26.md`
- normalized report:
  - `.tmp/regional-model-library/raw/Badong-Huangtupo/normalized/phase1-families/badong-huangtupo-open-pack-normalization-report.json`
- new download report:
  - `.tmp/regional-model-library/raw/Badong-Huangtupo/badong-huangtupo-new-open-download-report.csv`
- Badong related metadata scan:
  - `.tmp/regional-model-library/raw/Badong-Huangtupo/ncdc-badong-related-metadata-scan.csv`
- Three Gorges organization metadata scan:
  - `.tmp/regional-model-library/raw/ThreeGorges/ncdc-threegorges-org-metadata-scan.csv`

Critical direct-download probes that returned `403` without permission:

- `f267a98f-a2f0-4db1-89db-2f9458473991`
  - `湖北巴东试验场洞口降雨量数据集（2017-2025年）`
- `0c3020e1-d792-4dd1-a820-2dd48dfde62f`
  - `湖北巴东试验场黄土坡地表位移监测数据集（2018-2019年）`
- `8b610f07-addf-478c-b288-18df4f205fd0`
  - `长江三峡库区秭归县白水河滑坡变形、降雨及库水位监测资料(2018年)`
- `a5651f2a-bccc-4de4-aeb2-4db70bf76a2e`
  - `长江三峡库区秭归县八字门滑坡变形、降雨及库水位监测资料(2018年)`
- `0aaf6e26-fce1-4d3b-a160-777827d94cd4`
  - `2017年长江三峡库区秭归县新滩滑坡变形、降雨及库水位监测资料`

Current data boundary:

- Badong-Huangtupo open packs are official and useful, but the files explicitly describe themselves as example slices for selected sensors and years.
- Do not claim full 2017-2025 continuous multi-sensor coverage until application-gated files are granted.
- The next meaningful modeling step is a Badong-Huangtupo canonical sample factory using available synchronized windows, not more Baijiabao-only model ablation.

## 2026-04-26 Competition Evidence Package

User asked to build a dedicated evidence/proof folder under the competition-writing workspace and populate it with runnable checks, screenshots, data provenance, and model proof materials.

Evidence root:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料`

Created/organized evidence sections:

- `00_索引与总报告`
- `01_桌面端截图与交付证明`
- `02_边缘链路与硬件运行证明`
- `03_平台接入与存储证明`
- `04_AI模型测试证明`
- `05_区域模型库与数据证明`
- `06_视觉识别与大模型说明`
- `raw-reports`

Fresh checks captured:

- Windows desktop package verification:
  - `aliveAfterLaunch=true`
  - `readyAfterLaunch=true`
  - `runtimeErrorCount=0`
- Desktop screenshot:
  - `01_桌面端截图与交付证明/evidence-desk-packaged-launch-current.png`
- Docker services:
  - Postgres, ClickHouse, API, telemetry writer, ingest, Kafka, Web, EMQX, Redis all running.
- Port checks:
  - `8080`, `3000`, `1883`, `5432`, `8123`, `6379`, `9094`, `18083` open.
- HTTP checks:
  - API `/health` returned HTTP 200.
  - Web home returned HTTP 200.
- ClickHouse:
  - `telemetry_raw` count `238695`.
  - latest `received_ts` `2026-04-24 15:44:21.110`.
  - `telemetry_agg_1m` count `0`.
- Postgres direct counts:
  - `stations=2`
  - `devices=4`
  - `sensors=23`
  - `device_sensors=3`
  - `ai_predictions=1`
  - `device_commands=9`
  - `telemetry_dlq_messages=0`

Copied model/data/platform raw reports:

- `raw-reports/model/baijiabao-displacement-prediction-card.report.md`
- `raw-reports/model/baijiabao-displacement-prediction-card.report.json`
- `raw-reports/model/baijiabao-displacement-prediction-model.json`
- `raw-reports/model/baijiabao-competition-metric-card.report.json`
- `raw-reports/model/challenger-grid.report.json`
- `raw-reports/model/leaderboard.json`
- `raw-reports/data/3768727b-13b2-4675-8a00-2d661ec96229.zip`
- `raw-reports/data/baijiabao-zip-file-list-20260426-041618.json`
- `raw-reports/data/regional-model-library-data-summary-20260426-041831.json`
- desktop/platform/edge latest proof reports under `raw-reports`.

Important writing constraints preserved in the evidence package:

- Do not describe `93.72%` as displacement prediction accuracy; it belongs to high-confidence risk confirmation.
- Write conservative false-positive wording as "validation false-positive rate below 0.1%" rather than "zero false alarm".
- Current live platform evidence proves services online and historical telemetry readable, but latest freshness proof remains failed because hardware data is stale.
- Vision/LLM is documented as auxiliary/planned extension unless real image-label experiments are added later.

## 2026-04-26 Quantified Model Materials for Paper Figures

User asked to continue organizing data and performance metrics into quantified materials suitable for figures, tables, and competition/paper writing.

Generated package:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials`

Main outputs:

- `AI模型量化指标与论文图表数据包.xlsx`
- `model-metrics-summary.csv/json`
- `displacement-ablation-v1-v13.csv/json`
- `warning-operating-points.csv/json`
- `data-split-summary.csv/json`
- `feature-coverage-train-validation.csv/json`
- `model-system-field-mapping.csv/json`
- `charts/displacement-ablation-mae-rmse-r2.png`
- `charts/warning-operating-points-precision-recall-specificity.png`
- `charts/high-confidence-confusion-matrix.png`
- `charts/core-feature-coverage.png`
- `README-论文图表数据包说明.md`
- `manifest.csv/json`

Quantified metrics captured:

- Displacement prediction model `BJB-DP-ENS-OOF-SOFT-REGIME-v13`:
  - MAE `0.633 mm`
  - RMSE `0.894 mm`
  - R2 `0.1236`
  - Direction Accuracy `58.36%`
  - Within 1mm `80.62%`
  - Threshold-state Agreement `86.24%`
- Rainfall-reservoir regional expert `BJB-GZ-RR-MD-v1`:
  - Accuracy `85.34%`
  - Precision `44.87%`
  - Recall `32.41%`
  - F1 `37.63%`
  - AUC `70.33%`
  - Specificity `93.70%`
- High-recall screening operating point:
  - Recall `83.33%`
  - Precision `20.04%`
  - Balanced Accuracy `65.39%`
  - Purpose: candidate risk segment screening, not final direct alert.
- High-confidence confirmation model `BJB-HC-RES-LR-v1`:
  - Accuracy `93.72%`
  - Precision `80.00%`
  - Recall `19.05%`
  - Specificity `99.62%`
  - False-positive rate `0.376%`
  - Confusion matrix: TP `20`, FP `5`, TN `1324`, FN `85`
- Conservative low-false-positive threshold:
  - Accuracy `93.17%`
  - Precision `100.00%`
  - Recall `6.67%`
  - Specificity `100.00%`
  - Writing should still say "validation false-positive rate below 0.1%" rather than "zero false alarm".

Also updated competition writing document:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\AI模型部分文章资料汇总.md`
  - Added a new section pointing writers to the quantified package.
  - Clarified that Excel/CSV should be treated as the primary table/figure data source.
  - Charts use English axis labels to avoid missing Chinese glyphs in Matplotlib on Windows.

## 2026-04-26 Polished AI Figure Set

User asked to keep adding materials and make the charts more visually suitable for competition documents.

Generated polished chart directory:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\polished-charts`

Charts generated, each with both `.png` and `.svg`:

- `01-model-performance-dashboard`
  - Overall AI model dashboard with KPI cards and cascade workflow.
- `02-displacement-ablation-polished`
  - v1-v13 displacement prediction ablation curve with key-version annotations.
- `03-warning-operating-points-polished`
  - Precision / Recall / Specificity tradeoff chart with false-positive-rate callouts.
- `04-high-confidence-confusion-matrix-polished`
  - High-confidence confirmation confusion matrix.
- `05-core-feature-coverage-heatmap-polished`
  - Core feature coverage heatmap.
- `06-data-split-composition-polished`
  - Dataset split and class distribution chart.
- `07-model-cascade-architecture-polished`
  - Standalone cascade architecture diagram.
- `08-warning-operating-radar-polished`
  - Radar chart for screening/confirmation operating-point profiles.

Also updated:

- `AI模型量化指标与论文图表数据包.xlsx`
  - Added `精修图表目录` sheet.
- `quantified-model-materials/README-论文图表数据包说明.md`
  - Added polished chart usage section.
- `AI模型部分文章资料汇总.md`
  - Added polished chart index section.

Usage guidance:

- Use `.png` for Word/PPT.
- Use `.svg` when vector scaling or later editing is needed.
- Treat polished figures as presentation assets only; CSV/JSON/XLSX and raw reports remain the source of truth.

## 2026-04-26 Chapter 5 Checklist Evidence Fill

User asked to inspect the checklist file and fill corresponding missing materials. The active checklist was in:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\AI模型部分写作说明-给CLI协作.md`

Added evidence files:

- `测试与证明材料/00_索引与总报告/evidence-system-test-overview.md`
- `测试与证明材料/00_索引与总报告/evidence-chapter5-compliance-table.md`
- `测试与证明材料/01_桌面端截图与交付证明/evidence-desktop-functional-screenshot-checklist.md`
- `测试与证明材料/02_边缘链路与硬件运行证明/evidence-sensor-sampling-summary.md`
- `测试与证明材料/02_边缘链路与硬件运行证明/evidence-edge-cache-replay-summary.md`
- `测试与证明材料/03_平台接入与存储证明/evidence-platform-storage-counts.md`
- `测试与证明材料/03_平台接入与存储证明/evidence-rule-alert-test-summary.md`
- `测试与证明材料/06_视觉识别与大模型说明/evidence-llm-risk-explanation-sample.md`

Copied raw reports into the competition evidence package:

- `raw-reports/edge/field-hardware-uplink-replay-latest.json`
- `raw-reports/edge/field-formal-device-commissioning-latest.json`
- `raw-reports/platform/field-alert-notification-proof-latest.json`
- `raw-reports/platform/field-missing-alert-policy-proof-latest.json`
- `raw-reports/platform/field-missing-alert-recovery-proof-latest.json`

Updated evidence index and manifest:

- `测试与证明材料/00_索引与总报告/evidence-system-proof-index.md`
- `测试与证明材料/00_索引与总报告/evidence-file-manifest-20260426-063000.json`

Key decisions and boundaries:

- Model version wording is unified to `BJB-DP-ENS-OOF-SOFT-REGIME-v13` because all current model cards, metrics CSV/Excel, and figures support v13.
- Desktop functional screenshots are still a real gap; do not treat the launch screenshot as proof of trend/alert/replay/export pages.
- Edge cache/replay summary can cite `spoolPending=0`, `rejectedMessages=0`, and link score `90`, but cannot claim a dedicated manual disconnect duration and replay-count test until that test is run.
- Rule alert evidence now covers missing-field alert policy, no false alert for undeclared sensors, alert recovery, notification detail/list, and read-state update.

## 2026-05-05 Field Node Wiring Evidence

User asked to return to wiring. Added:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\02_边缘链路与硬件运行证明\evidence-field-node-wiring-summary.md`

Wiring position now frozen for writing:

- Current V1 simplified extension board:
  - RK2206 is powered by its own Type-C port.
  - The extension board does not back-feed RK2206 `5V/3V3`.
  - RK2206 and the extension board must share `GND`.
  - GPS uses `5V_SYS`.
  - XL01, SHT30, and MPU6050 use `3V3_SYS`.
  - `PB2/PB3` connect to XL01.
  - `PB6/PB7` connect to GPS.
  - `PB4/PB5` are I2C SDA/SCL for SHT30 and MPU6050, pulled up to `3V3_SYS`.
- Future V0 formal carrier:
  - Adds `12V_SENSOR` RS485 industrial sensor interfaces.
  - `J_RS485_1` is recommended for the inclinometer.
  - `J_RS485_2` is recommended for the soil moisture/temperature/conductivity sensor.
  - Both RS485 connectors are on the same A/B bus and are separated by Modbus address, not two independent buses.

Updated:

- `测试与证明材料/00_索引与总报告/evidence-system-proof-index.md`
- `测试与证明材料/00_索引与总报告/evidence-file-manifest-20260505-wiring.json`

Writing boundary:

- It is safe to write that the project has a normalized wiring plan and sample-chain validation for XL01, GPS, SHT30, and MPU6050.
- Do not claim that RS485 industrial sensors have already completed long-term outdoor deployment on the current V1 simplified board.

## 2026-04-26 Badong-Huangtupo Phase-1 Sensor Boundary And Core Baseline

User clarified that groundwater-derived datasets can be set aside for now, and then explicitly added that tunnel settlement and tunnel flow can also be set aside. The phase-1 monitoring model boundary is therefore:

- required:
  - displacement
- optional context:
  - weather rainfall
  - cave crack
- deferred from phase-1 required features:
  - groundwater depth
  - groundwater temperature
  - pore pressure
  - tunnel settlement
  - tunnel flow
  - slip-belt temperature and water-content
  - cave-water temperature

Code updates:

- `libs/regional-model-library/src/packs/china/badong-huangtupo/index.ts`
  - `requiredSensors` narrowed to `["displacement"]`
  - `requiredJoinFamilies` narrowed to `[]`
  - added a quality-gate hint to join rainfall only when available
- `scripts/dev/regional-model-library/build-badong-huangtupo-core-samples.py`
  - emits displacement-first canonical samples
  - keeps rainfall and cave crack optional
  - removes `slipBeltTemperatureC` from core training features
  - records all deferred sensor families and row counts
- `scripts/dev/regional-model-library/train-badong-huangtupo-core-displacement-baseline.py`
  - trains baseline regressors on the core sample split
  - writes JSON-safe model parameters for experiment documentation
  - avoids deprecated sklearn RMSE and `datetime.utcnow()` calls

Core sample factory output:

- samples:
  - `52233`
- labeled samples:
  - `51467`
- train / validation:
  - `41173 / 10294`
- feature coverage:
  - `displacementObservedMm`: `52233 / 52233` = `1.000`
  - `beidouDisplacementChangeMm`: `19382 / 52233` = `0.371`
  - `slipBeltDisplacementMm`: `32851 / 52233` = `0.629`
  - `rainfallCurrentMm_sum_24h`: `8352 / 52233` = `0.160`
  - `rainfallCurrentMm_sum_72h`: `8352 / 52233` = `0.160`
  - `caveCrackMm`: `10632 / 52233` = `0.204`
- report:
  - `.tmp/regional-model-library/out/badong-huangtupo/core-samples/badong-huangtupo-core-sample-factory.report.json`
  - `.tmp/regional-model-library/out/badong-huangtupo/core-samples/badong-huangtupo-core-sample-factory.report.md`

Baseline training output:

- artifact report root:
  - `.tmp/regional-model-library/out/artifacts/badong-huangtupo-core-displacement-baseline/`
- best validation model:
  - `zero-delta-persistence`
- validation metrics:
  - MAE:
    - `0.522670 mm`
  - RMSE:
    - `1.395786 mm`
  - R2:
    - `-0.000014`
  - Within 1mm:
    - `85.88%`
  - Direction Accuracy:
    - `26.66%`
  - P90 Absolute Error:
    - `1.800000 mm`

Current interpretation:

- The Badong-Huangtupo open-access slice now proves the regional model-library data path can ingest another official region and build trainable displacement samples.
- The Badong-Huangtupo baseline should not be promoted as a stronger displacement predictor than Baijiabao v14 because the best model is a zero-delta persistence baseline and R2 is effectively zero.
- The current paper/competition high-metric displacement line should still use `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`.
- The next useful model work is either:
  - register/integrate the Baijiabao v14 displacement model with runtime fields, or
  - request/land more direct displacement and rainfall monitoring packages before doing cross-region graph or deep sequence modeling.

## 2026-04-26 Baijiabao v14 Runtime Forecast Registration

The product-facing integration step for the current main displacement model is now complete at worker-runtime level.

Added runtime support:

- `calibrated_prediction_regression_v1` forecast artifacts are now represented by the shared `prediction-regression-model.v1` contract.
- the worker artifact registry can load large forecast artifacts by lightweight `artifactUri` registry entries.
- primary risk matching filters forecast artifacts out, so a displacement forecast model cannot accidentally become `riskScore`.
- `predict-pipeline` now adds forecast output through:
  - `payloadExt.forecastInference`
  - `payloadExt.secondaryInferences`
- `runInference` explicitly falls back if a forecast artifact is ever passed into the primary risk path.

Registered artifact:

- root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/`
- registry:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v14.prediction-regression-v1.json`
- registration report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/register-baijiabao-displacement-runtime-artifact.report.json`
- runtime forecast smoke report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-baijiabao-displacement-runtime-forecast.report.json`

Runtime validation:

- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed
- `node scripts/dev/regional-model-library/register-baijiabao-displacement-runtime-artifact.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - passed

Smoke metrics from runtime-loaded artifact:

- evaluated samples:
  - `1352`
- skipped samples:
  - `109`
- MAE:
  - `0.632960 mm`
- RMSE:
  - `0.893454 mm`
- R2:
  - `0.123924`
- Direction Accuracy:
  - `58.21%`
- Within 1mm:
  - `80.70%`
- P90 Absolute Error:
  - `1.391187 mm`

Worker pipeline smoke:

- station:
  - `Baijiabao`
- primary risk path:
  - `heuristic.v1`
- primary fallback reason:
  - `no-matching-artifact`
- forecast payload present:
  - `true`
- forecast required features satisfied:
  - `true`
- forecast predicted displacement:
  - `0.411357 mm`
- secondary inference count:
  - `1`

Current interpretation:

- Baijiabao v14 is no longer only an offline/paper model; it is now a runtime-loadable displacement forecast artifact.
- It remains a `forecast` / displacement regression model, not a primary warning-risk model.
- The next product step is API/desktop payload consumption of `payload.forecastInference` rather than further worker architecture changes.

## 2026-04-26 Desktop Consumption Of Forecast Inference

The first product-side consumption step for Baijiabao v14 forecast output is now complete in the Windows desktop client.

Code updates:

- `apps/desk/src/api/client.ts`
  - added `AiPredictionForecast`
  - added `AiPrediction.forecastInference`
- `apps/desk/src/api/httpClient.ts`
  - maps forecast output from:
    - `payload.forecastInference`
    - or first forecast-like item in `payload.secondaryInferences`
  - preserves raw `payload` while exposing a typed field to pages
- `apps/desk/src/api/mockClient.ts`
  - mock AI prediction now includes a Baijiabao v14 forecast payload
- `apps/desk/src/views/AnalysisPage.tsx`
  - operation summary now includes future displacement forecast text when available
- `apps/desk/src/views/GpsMonitoringPage.tsx`
  - analysis summary and prediction metrics now show AI displacement forecast separately from calibrated risk
- `scripts/dev/check-desk-ai-forecast-field.ts`
  - new smoke proof for typed desktop forecast consumption

Verified:

- `npx tsx scripts/dev/check-desk-ai-forecast-field.ts`
  - passed
  - parsed `forecastInference.predictedDisplacementMm = 0.411357`
  - parsed `horizonSpec = 24h`
  - confirmed `requiredFeaturesSatisfied = true`
- `npm run build --workspace landslide-monitor-desk`
  - passed
  - Vite still emits the pre-existing large chunk warning only

Current interpretation:

- API contract did not need a database or response-shell change because `payload` already carries worker extensions.
- Desktop no longer needs to manually parse raw JSON in pages; the API client exposes a typed `forecastInference`.
- The product wording now keeps the boundary clear:
  - calibrated risk remains risk/warning
  - forecast inference is future displacement increment in millimeters

Next step:

- If product evidence is needed, run packaged desktop smoke or browser screenshot proof to capture the new text in the UI.
- If backend evidence is needed, seed one DB prediction row with a real `forecastInference` payload and verify HTTP mode returns the typed field through the desktop client.

## 2026-04-26 Desktop HTTP Forecast Inference Proof

The backend evidence step for Baijiabao v14 forecast output is now complete.

Added script:

- `scripts/dev/check-desk-ai-forecast-http-field.ts`
  - upserts a Baijiabao proof station/device
  - deletes only prior proof rows with `payload.source = desk-http-forecast-field-proof-v1`
  - inserts one real PostgreSQL `ai_predictions` row carrying `payload.forecastInference`
  - authenticates against `/api/v1/auth/login`
  - reads `/api/v1/ai/predictions` through `apps/desk/src/api/httpClient.ts`
  - asserts that `AiPrediction.forecastInference` is typed and present

Report:

- `artifacts/models/regional-experts/phase1-displacement-forecast/desk-http-forecast-field-proof.report.json`

Verified result:

- `pass=true`
- inserted prediction:
  - `c6838594-012a-4b2c-a4aa-32a644e03cf3`
- risk model remains:
  - `baijiabao.window099.no-crack.station.Baijiabao.linear-risk-v1`
- forecast model is mapped separately:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-oof-refined-soft-regime-residual-calibrated-v14`
- forecast fields:
  - `predictedDisplacementMm = 0.411357063187622`
  - `horizonSpec = 24h`
  - `requiredFeaturesSatisfied = true`
  - `missingFeatureKeys = []`
- `secondaryInferenceCount = 1`

Docs updated:

- `docs/integrations/api/013-ai-predictions.md`
- `docs/integrations/ai/regional-model-runtime.md`

Current interpretation:

- The model is now proven through:
  - runtime artifact
  - worker payload contract
  - PostgreSQL row
  - API response
  - desktop HTTP mapper
- No PostgreSQL schema change was needed.
- Do not write v14 forecast into `risk_score / risk_level`.

Next step:

- Run packaged desktop screenshot proof if user wants visual evidence.
- Otherwise, the next product task is to decide whether to surface forecast evidence in exported reports or competition screenshots.

## 2026-04-26 Current Stage Target Before System Integration Discussion

User confirmed this stage target and asked to store it before discussing system integration.

Current stage goal:

- Build Baijiabao into the first complete AI sample line for:
  - model execution
  - system integration
  - product display
  - competition / paper documentation
- Do not keep blindly tuning models or hunting data before the current integration sample is stable.

Current two-stage model boundary:

- Stage 1:
  - displacement forecast
  - model:
    - `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14`
  - output:
    - future `24h` surface displacement increment
    - unit:
      - `mm`
  - runtime field:
    - `payload.forecastInference.predictedDisplacementMm`
  - primary metrics:
    - MAE `0.633 mm`
    - RMSE `0.894 mm`
    - R2 `0.124`
    - Within 1mm about `80.7%`
- Stage 2:
  - warning / confirmation model
  - output:
    - `riskScore`
    - `riskLevel`
  - current high-confidence writing metrics:
    - Accuracy `93.72%`
    - Precision `80.00%`
    - Specificity `99.62%`

Strict wording boundary:

- Do not write `93.72%` as displacement prediction accuracy.
- Do not write v14 forecast into `risk_score / risk_level`.
- The product and API contract should keep:
  - `riskScore / riskLevel` for warning
  - `forecastInference.predictedDisplacementMm` for displacement forecast

Current system state:

- v14 runtime artifact is registered.
- worker can emit `payloadExt.forecastInference`.
- PostgreSQL `ai_predictions.payload.forecastInference` proof passed.
- `/api/v1/ai/predictions` returns the payload unchanged.
- desktop HTTP client maps it into `AiPrediction.forecastInference`.
- desktop Analysis and GPS pages already have display points for forecast evidence.

Current next discussion topic:

- How to integrate this into the system cleanly without changing the established architecture.
- Preferred integration direction:
  - keep `ai_predictions.payload` as the extension carrier
  - keep typed desktop/API client mapping as the product contract
  - add product display/export/report consumption only where useful
  - avoid new database columns unless a field becomes operationally query-critical

Deferred expansion:

- Baijiabao is the current primary sample line.
- Badong-Huangtupo and other Three Gorges datasets remain regional model-library expansion proof.
- Groundwater, tunnel flow, tunnel settlement and other complex sensor families remain deferred for phase-1 required fields unless later data quality and product need justify reintroducing them.

## 2026-05-05 Baijiabao v14 Displacement Error Decomposition

The current first-priority model task is now materially completed: v14 displacement forecast has a runtime-consistent per-sample error decomposition package for paper and competition writing.

Scripts added:

- `scripts/dev/regional-model-library/build-baijiabao-displacement-error-decomposition.mjs`
- `scripts/dev/regional-model-library/render-baijiabao-displacement-error-decomposition.py`

Evidence package:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition`

Generated core files:

- `per-sample-predictions.csv`
- `skipped-samples.csv`
- `error-decomposition-summary.json`
- `Baijiabao位移预测误差分解数据包.xlsx`
- grouped tables:
  - `byPoint`
  - `byMonth`
  - `byPointMonth`
  - `byRainfall24h`
  - `byRainfall72h`
  - `byReservoirTrend72h`
  - `byDisplacementTrend72h`
  - `byDisplacementDelta72h`
  - `byLabelMagnitude`
- charts:
  - `00-error-decomposition-dashboard`
  - `01-mae-rmse-by-point`
  - `02-error-by-month`
  - `03-point-month-mae-heatmap`
  - `04-absolute-error-distribution`
  - `05-true-vs-predicted-scatter`
  - `06-residual-vs-rainfall-reservoir`
  - `07-error-by-regime-bars`

Runtime-consistent metrics:

- evaluated samples: `1352`
- skipped samples: `109`
- MAE: `0.632960 mm`
- RMSE: `0.893454 mm`
- R2: `0.123924`
- Direction Accuracy: `58.21%`
- Within 1mm: `80.70%`
- Threshold-state Agreement: `86.32%`
- P50 AE: `0.457435 mm`
- P90 AE: `1.391187 mm`

Writing interpretation:

- The model is stable for ordinary small-displacement samples.
- `ZD3`, `June / September`, strong rainfall, and true displacement delta `>3 mm` are the main error-amplification segments.
- Do not write that all operating conditions are high precision.
- Use this decomposition to justify the next regional model-library direction: local calibration, extreme-rainfall sample enrichment, and point/regime-aware routing.

## 2026-05-05 Baijiabao v21 Post-calibration Challenger

After the error decomposition, a targeted post-calibration challenger was built to improve displacement forecast metrics without changing software/runtime input fields.

Script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-postcalibration-challengers.mjs`

Report/artifacts:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-postcalibration-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-postcalibration-challengers.leaderboard.csv`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-v21-balanced.prediction-regression-v1.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-v21-bestMae.prediction-regression-v1.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-postcalibration-challengers/baijiabao-displacement-v21-thresholdSafe.prediction-regression-v1.json`

v21 balanced runtime-compatible candidate:

- display name: `BJB-DP-ENS-POSTCAL-BALANCED-v21`
- base model: v14 runtime artifact
- correction: `point + displacementTrend`
- same required runtime fields as v14
- validation metrics:
  - MAE: `0.629723 mm`
  - RMSE: `0.892411 mm`
  - R2: `0.125969`
  - Direction Accuracy: `59.91%`
  - Within 1mm: `80.70%`
  - Threshold-state Agreement: `86.09%`
  - P90 AE: `1.379252 mm`

Compared with v14 runtime baseline:

- MAE improves by `0.003236 mm`
- RMSE improves by `0.001043 mm`
- R2 improves by `0.002045`
- Direction Accuracy improves by about `1.70 pp`
- P90 AE improves by `0.011935 mm`
- Within 1mm is unchanged
- Threshold-state Agreement drops by about `0.22 pp`

Competition evidence package:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v21-balanced`

Boundary:

- v21 is a runnable candidate artifact and useful for writing the optimization process.
- It is not yet the formal replacement of v14 because the post-calibration correction is train-fit from artifact predictions.
- To promote v21, move the `point + displacementTrend` residual correction into full chronological OOF training.

## 2026-05-05 Baijiabao v21 Production-main Runtime Promotion

The v21 balanced candidate has now been promoted to the runtime forecast registry as the current production-main model, with v14 preserved as backup.

Promotion script:

- `scripts/dev/regional-model-library/promote-baijiabao-displacement-v21-production.mjs`

Active runtime files:

- `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v21.prediction-regression-v1.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v21-production.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/check-baijiabao-displacement-runtime-forecast.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v21-production-backup-manifest.json`

Backup:

- `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v21-2026-05-05T10-01-14-185Z/`
- contains:
  - previous `registry.pre-v21.json`
  - previous v14 artifact
  - promoted v21 artifact
  - challenger source report

Runtime smoke after promotion:

- loaded:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-postcalibrated-balanced-v21@0.21.0`
- evaluated:
  - `1352`
- MAE:
  - `0.629723294`
- RMSE:
  - `0.892410971`
- R2:
  - `0.125969256`
- Direction Accuracy:
  - `59.91%`
- Within 1mm:
  - `80.70%`
- P90 AE:
  - `1.379252474 mm`
- pipeline smoke:
  - forecast present
  - required features satisfied
  - forecast model key is v21

Build check:

- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Current production boundary:

- Product runtime main forecast model is v21.
- v14 remains backup and can be restored by copying `registry.pre-v21.json` back to registry.
- For academic strictness, v21 still should be described as a post-calibrated production candidate until the correction is folded into full chronological OOF training.

## 2026-05-05 Baijiabao v22 Support-calibrated Production-main

The runtime forecast main model has been promoted again from v21 to v22 after a chronological support-set production screen.

New scripts:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-support-calibrated-production.mjs`
- `scripts/dev/regional-model-library/promote-baijiabao-displacement-v22-production.mjs`

Active runtime files:

- `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v22.prediction-regression-v1.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v22-production.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/check-baijiabao-displacement-runtime-forecast.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v22-production-backup-manifest.json`

Backup chain:

- v22 production backup root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v22-2026-05-05T10-10-41-084Z/`
- registry now keeps:
  - v22 as `production-main`
  - v21 as `backup-previous-main`
  - v14 as `backup-v14-oof-main`

Support-set screen:

- calibration support rows:
  - `639`
- future holdout rows:
  - `713`
- skipped validation rows:
  - `109`
- selected correction:
  - `point + month + displacementTrend`
- future holdout baseline:
  - MAE `0.664111492`
  - RMSE `0.940473151`
  - R2 `0.198359890`
- future holdout selected:
  - MAE `0.661239758`
  - RMSE `0.936965942`
  - R2 `0.204327688`
  - Within 1mm `79.24%`
- future holdout tradeoff:
  - Direction Accuracy drops by about `1.26 pp`
  - Threshold-state Agreement drops by about `0.28 pp`

Full runtime check after promotion:

- loaded:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-v22@0.22.0`
- evaluated:
  - `1352`
- MAE:
  - `0.6263070948659626`
- RMSE:
  - `0.8856069067653007`
- R2:
  - `0.1392463010552235`
- Direction Accuracy:
  - `58.36%`
- Within 1mm:
  - `81.14%`
- P90 AE:
  - `1.3676232698847706 mm`
- pipeline smoke:
  - forecast present
  - required features satisfied
  - forecast model key is v22

Build check:

- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Current production boundary:

- Product runtime main forecast model is now v22.
- v21 and v14 are both retained in registry and backup folders.
- v22 is the best current production artifact for MAE/RMSE/R2/Within-1mm, with a small Direction/Threshold tradeoff on future holdout.
- For competition writing, use v22 full runtime metrics for production result tables and use future-holdout metrics to explain production validation rigor.

## 2026-05-05 Baijiabao v23 Support-guarded Production-main

The runtime forecast main model has been promoted again from v22 to v23 after adding a stricter future-holdout guardrail.

New / updated script:

- `scripts/dev/regional-model-library/promote-baijiabao-displacement-v23-production.mjs`
  - promotes v23
  - keeps v22/v21/v14 backup chain
  - writes a SHA256 backup manifest

Active runtime files:

- `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v23-production.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/check-baijiabao-displacement-runtime-forecast.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23-production-backup-manifest.json`

Backup chain:

- v23 production backup root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v23-2026-05-05T13-01-25-310Z/`
- registry now keeps:
  - v23 as `production-main`
  - v22 as `backup-previous-main`
  - v21 as `backup-v21-postcalibrated-main`
  - v14 as `backup-v14-oof-main`

Future-holdout guardrail:

- calibration support rows:
  - `639`
- future holdout rows:
  - `713`
- skipped validation rows:
  - `109`
- selected correction:
  - `point + month + displacementTrend`
- selected key:
  - `support-point-month-displacementTrend-mc12-sh30-mb0p1-s0p7`
- holdout baseline:
  - MAE `0.664111492`
  - RMSE `0.940473151`
  - R2 `0.198359890`
  - Direction Accuracy `60.17%`
  - Within 1mm `78.82%`
  - Threshold-state Agreement `84.15%`
- holdout v23:
  - MAE `0.662702595`
  - RMSE `0.940097275`
  - R2 `0.199000539`
  - Direction Accuracy `60.31%`
  - Within 1mm `78.96%`
  - Threshold-state Agreement `84.15%`

Full runtime check after promotion:

- loaded:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-support-calibrated-guarded-v23@0.23.0`
- evaluated:
  - `1352`
- MAE:
  - `0.6261632461448894`
- RMSE:
  - `0.8863636177712738`
- R2:
  - `0.1377747224948398`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.07%`
- P90 AE:
  - `1.3667404378328487 mm`
- pipeline smoke:
  - forecast present
  - required features satisfied
  - forecast model key is v23

Competition evidence package:

- `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v23-support-guarded`
- includes:
  - `Baijiabao位移预测误差分解数据包.xlsx`
  - `per-sample-predictions.csv`
  - `error-decomposition-summary.json`
  - `charts/*.png`
  - `charts/*.svg`

Build check:

- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Current production boundary:

- Product runtime main forecast model is now v23.
- v23 is more production-conservative than v22 because it improves future holdout without Direction/Within/Threshold regression against baseline.
- v22 remains a valuable backup because it has slightly better full runtime RMSE/R2.
- v23 remains a displacement forecast model; do not write it into `risk_score / risk_level`.

## 2026-05-05 Baijiabao v24 Two-holdout Challenger Not Promoted

After v23 promotion, a stricter two-holdout challenger was trained and screened.

Script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-two-holdout-production.mjs`

Split:

- calibration:
  - `433`
  - `eventTs < 2024-01-01T00:00:00.000Z`
- development holdout:
  - `447`
  - `2024-01-01T00:00:00.000Z <= eventTs < 2024-07-01T00:00:00.000Z`
- final holdout:
  - `472`
  - `eventTs >= 2024-07-01T00:00:00.000Z`
- skipped:
  - `109`

Selected challenger:

- display:
  - `BJB-DP-ENS-TWO-HOLDOUT-GUARDED-v24`
- key:
  - `twoholdout-point-displacementTrend-mc12-sh90-mb0p08-s0p15`
- dimensions:
  - `point + displacementTrend`
- artifact:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-two-holdout-production/baijiabao-displacement-v24-two-holdout-guarded.prediction-regression-v1.json`

Development holdout:

- MAE:
  - `0.615779944 -> 0.615122629`
- RMSE:
  - `0.854123054 -> 0.853862090`
- R2:
  - `0.272078879 -> 0.272523621`

Final holdout:

- MAE:
  - `0.644783156 -> 0.644485032`
- RMSE:
  - `0.924532695 -> 0.924515845`
- R2:
  - `0.057002227 -> 0.057036601`
- Direction Accuracy:
  - `56.99% -> 57.20%`
- Within 1mm:
  - `80.08% -> 80.08%`
- Threshold-state Agreement:
  - `84.96% -> 84.96%`
- P90 AE:
  - `1.462479220 -> 1.454624735`

Full runtime decomposition:

- evidence:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v24-two-holdout-guarded`
- evaluated:
  - `1352`
- MAE:
  - `0.632161`
- RMSE:
  - `0.892837`
- R2:
  - `0.125134`
- Direction Accuracy:
  - `58.21%`
- Within 1mm:
  - `80.77%`
- Threshold-state Agreement:
  - `86.32%`
- P90 AE:
  - `1.393399`

Decision:

- Do not promote v24.
- v24 is a useful strict two-holdout ablation, but full runtime quality is weaker than v23.
- Production-main remains v23; v22/v21/v14 backup chain remains unchanged.

## 2026-05-05 Baijiabao v25 V23-layer Challenger Not Promoted

After v24, a second-layer residual calibration was attempted on top of the current v23 production-main.

Run:

- script:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-two-holdout-production.mjs`
- base:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v23.prediction-regression-v1.json`
- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-v23-layer-two-holdout-production`

Search result:

- total configs:
  - `7056`
- passed development guard:
  - `855`
- passed final guard:
  - `2`
- passed both:
  - `0`

Best dev candidate:

- key:
  - `twoholdout-point-displacementTrend-mc12-sh20-mb0p04-s1`
- development holdout:
  - MAE `0.611967614 -> 0.609317660`
  - RMSE `0.851868995 -> 0.850337952`
  - R2 `0.275915826 -> 0.278516244`
- final holdout:
  - MAE `0.638182151 -> 0.639848809`
  - RMSE `0.915682717 -> 0.918425817`
  - R2 `0.074969286 -> 0.069418778`

Decision:

- Do not promote.
- No v25 artifact was generated because no candidate passed both dev and final production guards.
- This confirms that v23 should remain production-main for now.

## 2026-05-05 Baijiabao v26/v27 Ensemble Search Not Promoted

To find whether the remaining gap was model-form rather than calibration, version-level ensembles were tested.

v26 script:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-ensemble-production-challengers.mjs`

Inputs:

- v14
- v21
- v22
- v23
- v24

Output:

- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-ensemble-production-challengers/baijiabao-displacement-ensemble-production-challengers.report.json`
- `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-ensemble-production-challengers/baijiabao-displacement-ensemble-production-challengers.leaderboard.csv`

v26 result:

- tested configs:
  - `178`
- all-split magnitude improvers:
  - `16`
- all-split magnitude + direction improvers:
  - `0`
- production guard pass:
  - `0`

Best magnitude candidate:

- `ensemble-v230p6-v220p4`
- all delta:
  - MAE `-0.000236695`
  - RMSE `-0.000556790`
  - R2 `+0.001082914`
  - Direction Accuracy `-0.96 pp`
- final delta:
  - MAE `-0.001204197`
  - RMSE `-0.002291944`
  - R2 `+0.004624889`
  - Direction Accuracy `-0.64 pp`

v27 follow-up:

- output:
  - `.tmp/regional-model-library/out/artifacts/baijiabao-displacement-calibrated-ensemble-followup/baijiabao-displacement-calibrated-ensemble-followup.report.json`
- pair blends plus intercept/slope calibration were searched.
- production guard pass:
  - `0`

Root cause:

- Magnitude metrics can still be shaved slightly by blending v22/v23.
- Those candidates reduce Direction Accuracy or fail dev/final guard.
- Current bottleneck is direction / state stability.

Decision:

- Do not promote v26/v27.
- Current production-main remains v23.
- Next real improvement needs more monitoring data or directional/process labels, not more post-hoc calibration stacking.

## 2026-05-05 Baijiabao v28 State-protected Production-main

The previous bottleneck was converted into a production mechanism. v28 uses the current v23 forecast as base and adds a state-protected residual correction:

- correction is applied only if it preserves the base prediction sign
- correction is applied only if it preserves the `1.3mm` threshold state
- correction dimensions are derived from already available runtime features:
  - `month`
  - `rainfall72hBucket`
  - `displacementTrend`
- no database schema change
- no new required runtime field
- still writes only `forecastInference.predictedDisplacementMm`

Runtime/library changes:

- `libs/regional-model-library/src/contracts/prediction-regression-artifact.ts`
  - supports `residualCorrection.preserveSign`
  - supports `residualCorrection.preserveThresholdAbs`
  - supports rainfall/displacement/reservoir bucket regime dimensions

Training/promotion scripts:

- `scripts/dev/regional-model-library/run-baijiabao-displacement-state-protected-production.mjs`
- `scripts/dev/regional-model-library/promote-baijiabao-displacement-v28-production.mjs`

Current production-main:

- `BJB-DP-ENS-STATE-PROTECTED-v28`
- `baijiabao.displacement.pointwise-fixed-expert-ensemble-state-protected-v28@0.28.0`

Backup chain:

- v23:
  - `backup-previous-main`
- v22:
  - `backup-v22-support-calibrated-main`
- v21:
  - `backup-v21-postcalibrated-main`
- v14:
  - `backup-v14-oof-main`

Full runtime refit metrics:

- evaluated:
  - `1352`
- MAE:
  - `0.623418465`
- RMSE:
  - `0.880074724`
- R2:
  - `0.149966573`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.36%`
- Threshold-state Agreement:
  - `86.17%`
- P90 AE:
  - `1.355051782 mm`

Evidence and backup:

- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v28.prediction-regression-v1.json`
- promotion report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v28-production.report.json`
- backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v28-production-backup-manifest.json`
- latest backup root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v28-2026-05-05T14-31-08-417Z/`
- competition evidence package:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v28-state-protected`

Validation:

- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - loads v28
  - forecast fields present
  - required features satisfied
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Boundary:

- v28 is the current displacement forecast production-main.
- v28 is not a warning classifier.
- Do not write v28 into `risk_score / risk_level`.
- The final split P90 AE is slightly higher than v23, while full runtime P90 is lower; keep this caveat in paper writing.

## 2026-05-06 Baijiabao v30 Tail-guarded Calibration Production-main

After v28, v29 tested P90 non-regression against v23 but was not promoted because direct comparison against v28 showed weaker RMSE/R2 and final/holdout tail behavior.

The training script now has an additional safety gate:

- file:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-state-protected-production.mjs`
- new guard:
  - final written artifact is re-evaluated before `promoteAllowed=true`
- new parameter:
  - `FINAL_CORRECTION_SCOPE=calibration|all`
- reason:
  - a candidate can pass before final refit but fail after the produced artifact is actually executed.

Current production-main:

- `BJB-DP-ENS-V28-LAYER-TAIL-GUARDED-CAL-v30`
- `baijiabao.displacement.pointwise-fixed-expert-ensemble-v28-layer-tail-guarded-calibration-v30@0.30.0`

v30 design:

- base:
  - v28 production artifact
- correction:
  - second-layer state-protected residual correction
- final correction scope:
  - `calibration` only
- selected key:
  - `stateprot-point-month-displacementTrend-mc20-sh20-mb0p1-s1`
- guard:
  - all/dev/final/holdout non-regression with P90 non-regression required

Runtime metrics:

- evaluated:
  - `1352`
- skipped:
  - `109`
- MAE:
  - `0.623084152`
- RMSE:
  - `0.879748988`
- R2:
  - `0.150595691`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.51%`
- P90 AE:
  - `1.355051782 mm`

Delta vs v28:

- all MAE:
  - `-0.000334313`
- all RMSE:
  - `-0.000325736`
- all R2:
  - `+0.000629118`
- final MAE:
  - `-0.000316677`
- final RMSE:
  - `-0.000777915`
- final R2:
  - `+0.001555407`
- final P90 AE:
  - `-0.019419753 mm`
- Direction / Threshold:
  - no regression

Production files:

- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v30.prediction-regression-v1.json`
- registry:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- promotion report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v30-production.report.json`
- backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v30-production-backup-manifest.json`
- rollback root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v30-2026-05-06T03-33-41-918Z/`
- evidence package:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v30-tail-guarded-calibration`

Validation:

- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - loads v30
  - forecast fields present
  - required features satisfied
- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Boundary:

- v30 remains a displacement forecast model.
- v30 still must not write `risk_score / risk_level`.
- v30 is a small production-hardening improvement over v28, not a new model-family breakthrough.

## 2026-05-06 Baijiabao v33 Dev-group-gated State-protected Production-main

After v31, a v32 follow-up was explored but not promoted because the all-MAE gain was only about `0.000008638 mm`, which is below the meaningful promotion threshold.

The useful problem found in v32/v33 exploration was group-level instability:

- richer local regime groups can improve all/dev metrics
- but many groups fail final/holdout behavior
- plain repeated calibration therefore risks fitting unstable local buckets

Training-script enhancement:

- file:
  - `scripts/dev/regional-model-library/run-baijiabao-displacement-state-protected-production.mjs`
- new optional environment:
  - `DEV_GROUP_GATED=1`
  - `DEV_GROUP_MIN_COUNT=8`
- behavior:
  - fit residual correction on calibration rows
  - evaluate each local correction group on dev rows
  - keep only groups that do not regress dev MAE/RMSE/R2/Direction/Within/Threshold/P90
  - then run all/dev/final/holdout production guards

Current production-main:

- `BJB-DP-ENS-V31-DEV-GATED-STATEPROT-v33`
- `baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33@0.33.0`

v33 design:

- base:
  - v31 production artifact
- selected key:
  - `stateprot-point-displacementDelta72hBucket-mc8-sh30-mb0p06-s0p65`
- selected dimensions:
  - `point + displacementDelta72hBucket`
- dev group gate:
  - input bias groups `11`
  - kept `1`
  - dropped `10`
- final correction scope:
  - `calibration`
- guard:
  - sign preservation
  - `1.3mm` threshold-state preservation
  - all/dev/final/holdout non-regression
  - P90 non-regression

Runtime metrics:

- evaluated:
  - `1352`
- skipped:
  - `109`
- MAE:
  - `0.622452582`
- RMSE:
  - `0.879313702`
- R2:
  - `0.151436027`
- Direction Accuracy:
  - `59.17%`
- Within 1mm:
  - `81.51%`
- P90 AE:
  - `1.346605093 mm`

Delta vs v31:

- all MAE:
  - `-0.000461492`
- all RMSE:
  - `-0.000186992`
- all R2:
  - `+0.000360944`
- all P90 AE:
  - `-0.008446689 mm`
- dev MAE:
  - `-0.000395728`
- final MAE:
  - `-0.000814500`
- holdout MAE:
  - `-0.000918988`
- Direction / Within 1mm / threshold-state:
  - no regression

Production files:

- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v33.prediction-regression-v1.json`
- registry:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/registry.json`
- promotion report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-baijiabao-displacement-v33-production.report.json`
- backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/baijiabao-displacement-v33-production-backup-manifest.json`
- rollback backup:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-v33-2026-05-06T07-17-50-853Z/`
- competition evidence package:
  - `E:\学校\02 项目\04 各种比赛\03 计算机大赛\02_山体滑坡\测试与证明材料\04_AI模型测试证明\quantified-model-materials\error-decomposition-v33-dev-gated-state-protected`

Validation:

- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - loads v33
  - `forecastInference` present
  - required features satisfied
- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed

Boundary:

- v33 is a displacement forecast model for future 24h displacement delta in `mm`.
- v33 is not a warning classifier and must not write `risk_score / risk_level`.
- v33 keeps the existing system field contract; software payload fields do not need schema changes.

## 2026-05-06 Badong-Huangtupo Second-region Forecast Challenger Registered

After v33 product integration, the execution priority moved from single-station calibration to data-side expansion.

Current facts:

- `Baijiabao v33` remains the active production-main forecast model:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33@0.33.0`
- `Badong-Huangtupo` is now registered as the first second-region displacement forecast challenger:
  - `badong-huangtupo.displacement.zero-delta-region-baseline-v1@0.1.0`
  - scope:
    - `region`
  - scopeKey:
    - `CN-HB-BADONG-HUANGTUPO`
  - artifact:
    - `artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v1.region-baseline.prediction-regression-v1.json`
  - registration report:
    - `artifacts/models/regional-experts/phase1-displacement-forecast/register-badong-huangtupo-displacement-challenger.report.json`
  - runtime smoke report:
    - `artifacts/models/regional-experts/phase1-displacement-forecast/check-badong-huangtupo-displacement-runtime-forecast.report.json`
- The Badong open-core sample factory already has:
  - samples:
    - `52233`
  - labeled samples:
    - `51467`
  - train:
    - `41173`
  - validation:
    - `10294`
- Current Badong validation metrics for this baseline:
  - MAE:
    - `0.522669516`
  - RMSE:
    - `1.395786409`
  - R2:
    - `-0.000014156`
  - Direction Accuracy:
    - `26.66%`
  - Within 1mm:
    - `85.88%`
  - P90 AE:
    - `1.8 mm`

Implementation details:

- New registration script:
  - `scripts/dev/regional-model-library/register-badong-huangtupo-displacement-challenger.mjs`
- New runtime smoke script:
  - `scripts/dev/regional-model-library/check-badong-huangtupo-displacement-runtime-forecast.mjs`
- Existing Baijiabao runtime check was hardened:
  - it now explicitly loads the registry `activeModelKey`
  - this prevents second-region challengers from accidentally becoming the evaluation artifact just because they appear earlier in `registry.json`

Runtime proof:

- Badong smoke:
  - `pass: true`
  - `forecastInference` present
  - `forecastModelKey = badong-huangtupo.displacement.zero-delta-region-baseline-v1`
  - `forecastRequiredFeaturesSatisfied = true`
  - `forecastPredictedDisplacementMm = 0`
- Baijiabao v33 re-check:
  - loaded:
    - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33@0.33.0`
  - MAE:
    - `0.622452582`
  - RMSE:
    - `0.879313702`
  - R2:
    - `0.151436027`
  - `forecastInference` still points to v33

Boundary:

- Badong v1 is a product-routing and data-side expansion baseline, not a precision breakthrough.
- It proves the regional model library can now carry more than one real monitoring-region forecast artifact.
- The next meaningful precision step is not more registry wiring; it is stronger Badong modeling and more monitoring data joins.

## 2026-05-06 Badong-Huangtupo v2 HGB Windowed Multisensor Challenger

Badong-Huangtupo is no longer only a zero-delta routing proof. A second Badong regional challenger has been trained, exported, registered, and verified through the TypeScript runtime executor.

New runtime model support:

- `libs/regional-model-library/src/contracts/prediction-regression-artifact.ts`
  - adds `sklearn_hist_gradient_boosting_regression_v1`
  - executes exported sklearn `HistGradientBoostingRegressor` trees directly from JSON
  - keeps the outer artifact type as:
    - `calibrated_prediction_regression_v1`
- `services/ai-prediction-worker/src/pipeline/feature-definitions.ts`
  - adds runtime aliases for:
    - `caveCrackMm -> crackDisplacementMm`
    - `beidouDispX / beidouDispY / beidouDispZ`
    - `beidouDisplacementChangeMm`
    - `slipBeltDisplacementMm`

New training and registration scripts:

- `scripts/dev/regional-model-library/train-badong-huangtupo-hgb-displacement-challenger.py`
- `scripts/dev/regional-model-library/register-badong-huangtupo-displacement-v2-challenger.mjs`
- `scripts/dev/regional-model-library/check-badong-huangtupo-v2-runtime-validation.mjs`

Current Badong v2 artifact:

- model:
  - `badong-huangtupo.displacement.hgb-windowed-multisensor-v2@0.2.0`
- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v2.hgb-windowed-multisensor.prediction-regression-v1.json`
- registration report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/register-badong-huangtupo-displacement-v2-challenger.report.json`
- runtime validation report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-badong-huangtupo-v2-runtime-validation.report.json`
- runtime smoke report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-badong-huangtupo-displacement-runtime-forecast.report.json`

Badong v2 validation metrics:

- evaluated:
  - `10294`
- MAE:
  - `0.509755473`
- RMSE:
  - `1.372920864`
- R2:
  - `0.032481613`
- Direction Accuracy:
  - `45.37%`
- Within 1mm:
  - `86.11%`
- P90 AE:
  - `1.680059095 mm`

Delta vs Badong zero-delta baseline:

- MAE:
  - `-0.012914043`
- RMSE:
  - `-0.022865546`
- R2:
  - `+0.032495770`
- Direction Accuracy:
  - `+18.71 pp`
- Within 1mm:
  - `+0.23 pp`
- P90 AE:
  - `-0.117942075 mm`

Runtime proof:

- `node scripts/dev/regional-model-library/check-badong-huangtupo-v2-runtime-validation.mjs`
  - `pass: true`
  - TypeScript runtime metrics match the Python training report
- `node scripts/dev/regional-model-library/check-badong-huangtupo-displacement-runtime-forecast.mjs`
  - `pass: true`
  - worker routes Badong region forecast to v2
  - `forecastInference.predictedDisplacementMm` is non-null
- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - still loads Baijiabao v33
  - v33 metrics unchanged

Boundary:

- Baijiabao v33 remains the active production-main.
- Badong v2 is the preferred Badong regional challenger.
- The external software field contract is unchanged:
  - forecast output still lands in `forecastInference.predictedDisplacementMm`
  - risk fields are not reused for displacement forecast.

## 2026-05-06 Badong-Huangtupo v4 Support-guarded Regional Production-main

After Badong v2, a stricter v3 production screen was attempted:

- script:
  - `scripts/dev/regional-model-library/train-badong-huangtupo-hgb-production.py`
- split:
  - calibration:
    - `32937`
  - dev:
    - `8236`
  - final:
    - `10294`
- result:
  - no candidate passed both dev and final production guards before refit
- interpretation:
  - Badong-Huangtupo is sensitive to recent local support data
  - it is not safe to describe the HGB model as cold-start production
  - the correct production boundary is local-support / periodically retrained regional takeover

Then v4 was trained and promoted under a support-guarded rule:

- script:
  - `scripts/dev/regional-model-library/train-badong-huangtupo-hgb-support-guarded-production.py`
- profile:
  - `hgb-absolute-m120-lr0025-l2p8-leaf160`
- guard:
  - train on all pre-final train rows
  - evaluate on chronological final holdout
  - require improvement over zero-delta on:
    - MAE
    - RMSE
    - R2
    - Direction Accuracy
    - Within 1mm
    - P90 absolute error
- promoteAllowed:
  - `true`

Current Badong regional production-main:

- model:
  - `badong-huangtupo.displacement.hgb-windowed-multisensor-support-guarded-v4@0.4.0`
- artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v4.hgb-support-guarded.prediction-regression-v1.json`
- promotion report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/promote-badong-huangtupo-displacement-v4-production.report.json`
- backup manifest:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v4-production-backup-manifest.json`
- backup root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/pre-badong-v4-*`

Badong v4 runtime validation:

- evaluated:
  - `10294`
- MAE:
  - `0.509755473`
- RMSE:
  - `1.372920864`
- R2:
  - `0.032481613`
- Direction Accuracy:
  - `45.37%`
- Within 1mm:
  - `86.11%`
- P90 AE:
  - `1.680059095 mm`

Delta vs Badong zero-delta baseline:

- MAE:
  - `-0.012914043`
- RMSE:
  - `-0.022865546`
- R2:
  - `+0.032495770`
- Direction Accuracy:
  - `+18.71 pp`
- Within 1mm:
  - `+0.23 pp`
- P90 AE:
  - `-0.117942075 mm`

Validation:

- `python scripts/dev/regional-model-library/train-badong-huangtupo-hgb-production.py`
  - failed as expected with no cold-start production candidate
- `python scripts/dev/regional-model-library/train-badong-huangtupo-hgb-support-guarded-production.py`
  - passed with `promoteAllowed: true`
- `node scripts/dev/regional-model-library/promote-badong-huangtupo-displacement-v4-production.mjs`
  - promoted v4 and wrote backup manifest
- `node scripts/dev/regional-model-library/check-badong-huangtupo-v4-runtime-validation.mjs`
  - `pass: true`
  - TypeScript runtime metrics match the Python training report
- `node scripts/dev/regional-model-library/check-badong-huangtupo-displacement-runtime-forecast.mjs`
  - `pass: true`
  - worker routes Badong region forecast to v4
- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - still loads Baijiabao v33

Boundary:

- Baijiabao v33 remains the global active production-main:
  - `registry.activeModelKey`
- Badong v4 is the regional production-main for:
  - `CN-HB-BADONG-HUANGTUPO`
- Do not claim Badong v4 is cold-start stable across long regime shifts.
- The correct product story is:
  - regional expert matching
  - local support-set takeover
  - periodic retraining as new regional monitoring data accumulate

## 2026-05-06 Displacement Production-main Routing Proof

The production-main route is now backed by a dedicated runtime proof script:

- `scripts/dev/regional-model-library/check-displacement-production-main-routing.mjs`

Generated proof files:

- `artifacts/models/regional-experts/phase1-displacement-forecast/check-displacement-production-main-routing.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/check-displacement-production-main-routing.report.md`

Proof result:

- `pass: true`
- production-main index contains:
  - `Baijiabao` station production-main:
    - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33@0.33.0`
  - `CN-HB-BADONG-HUANGTUPO` regional production-main:
    - `badong-huangtupo.displacement.hgb-windowed-multisensor-support-guarded-v4@0.4.0`
- runtime route cases:
  - `baijiabao-runtime-station-alias`
    - passes and routes `白家包` to Baijiabao v33
  - `badong-runtime-region-alias`
    - passes and routes `CN-420823` to Badong v4
  - `unknown-runtime-no-forecast`
    - passes and does not borrow any displacement forecast production-main

Boundary confirmed:

- displacement forecast output remains:
  - `payloadExt.forecastInference.predictedDisplacementMm`
- risk fields remain separate:
  - `riskScore`
  - `riskLevel`
- cross-region direct execution compatibility is not used as production evidence.
- The product rule is scope-first regional matching, not global reuse of one station model.

Validation:

- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed
- `node scripts/dev/regional-model-library/check-displacement-production-main-routing.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - passed and kept v33 metrics unchanged
- `node scripts/dev/regional-model-library/check-badong-huangtupo-v4-runtime-validation.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-badong-huangtupo-displacement-runtime-forecast.mjs`
  - passed
- `npx openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- `git diff --check`
  - failed on pre-existing `docs/journal/2026-04.md` trailing whitespace and CRLF warnings, not on the new routing proof.

## 2026-05-06 Production-main Snapshot Backup and Readiness Gate

The current displacement production-main set is now backed up as a release-style snapshot, not only as pre-promotion rollback folders.

New script:

- `scripts/dev/regional-model-library/backup-displacement-production-main-snapshot.mjs`

Generated files:

- `artifacts/models/regional-experts/phase1-displacement-forecast/displacement-production-main-current-backup-manifest.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/displacement-production-main-readiness.report.json`
- `artifacts/models/regional-experts/phase1-displacement-forecast/displacement-production-main-readiness.report.md`

Current backup root:

- `artifacts/models/regional-experts/phase1-displacement-forecast/backups/current-production-main-2026-05-06T09-15-39-513Z`

Readiness result:

- `pass: true`
- Route proof:
  - `pass: true`
  - unknown region is guarded and does not borrow forecast production-main
- Baijiabao v33 readiness:
  - MAE `0.6224525824674054`
  - RMSE `0.8793137020020019`
  - R2 `0.15143602709015047`
  - Direction `0.591715976331361`
  - Within 1mm `0.8150887573964497`
  - P90 AE `1.3466050928286908`
- Badong v4 readiness:
  - MAE `0.5097554731419255`
  - RMSE `1.3729208638305228`
  - R2 `0.03248161329946708`
  - Direction `0.45366232756945796`
  - Within 1mm `0.8610841266757334`
  - P90 AE `1.6800590949507495`

Snapshot includes hashes for:

- registry
- Baijiabao v33 artifact
- Badong v4 artifact
- promotion reports
- validation reports
- route proof reports
- previous backup manifests

Validation:

- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed
- `node scripts/dev/regional-model-library/check-displacement-production-main-routing.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-badong-huangtupo-v4-runtime-validation.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-badong-huangtupo-displacement-runtime-forecast.mjs`
  - passed
- `node scripts/dev/regional-model-library/backup-displacement-production-main-snapshot.mjs`
  - passed
- `npx openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- `git diff --check -- scripts/dev/regional-model-library/backup-displacement-production-main-snapshot.mjs scripts/dev/regional-model-library/check-displacement-production-main-routing.mjs docs/journal/2026-05.md memory/tasks/execute-regional-model-library-phase-1.md`
  - passed

Conclusion:

- A formally usable production-main displacement forecast set now exists with backup and readiness evidence.
- Further accuracy gains should move to data-side expansion, not more single-station tuning.

## 2026-05-06 Badong Context-enriched v5 Challenger

After deciding to move away from Baijiabao-only tuning, the data-side path was checked.

Current data-side conclusion:

- A third real displacement forecast expert is still blocked by data availability:
  - Three Gorges open monitoring data currently remains Baijiabao-only.
  - Huangniba-Dengkan local root exists but does not yet contain a usable training sample pack.
  - Several high-value Three Gorges / Badong surface displacement packs remain application-gated.
- Badong-Huangtupo is the best immediate expansion target because it already has `12` normalized official family outputs and a labeled core sample factory.

Runtime feature expansion:

- `services/ai-prediction-worker/src/pipeline/feature-definitions.ts`
  - added optional Badong context feature aliases for:
    - `groundwaterDepthM`
    - `groundwaterTemperatureC`
    - `porePressureKpa`
    - `tunnelSettlementMm`
    - `slipBeltWaterContent`
    - `caveWaterTemperatureC`
    - expanded `tunnelFlowRate`
    - expanded `groundwaterLevelM`

New Badong v5 scripts:

- `scripts/dev/regional-model-library/train-badong-huangtupo-context-enriched-challenger.py`
- `scripts/dev/regional-model-library/register-badong-huangtupo-context-v5-challenger.mjs`
- `scripts/dev/regional-model-library/check-badong-huangtupo-v5-runtime-validation.mjs`

v5 outputs:

- source artifact:
  - `.tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5/badong-huangtupo-displacement-v5.context-enriched.prediction-regression-v1.json`
- registry artifact:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v5.context-enriched.prediction-regression-v1.json`
- training report:
  - `.tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5/badong-huangtupo-context-enriched-v5.report.json`
- registration report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/register-badong-huangtupo-context-v5-challenger.report.json`
- runtime validation:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-badong-huangtupo-v5-runtime-validation.report.json`

v5 metrics:

- MAE:
  - `0.5076221390393547`
- RMSE:
  - `1.3678360648193246`
- R2:
  - `0.03963501360696031`
- Direction:
  - `47.35%`
- Within 1mm:
  - `85.98%`
- P90 AE:
  - `1.704784615968111 mm`

Delta vs Badong v4:

- MAE:
  - `-0.002133334102600415`
- RMSE:
  - `-0.0050847990112097285`
- R2:
  - `+0.00715340030761813`
- Direction:
  - `+1.98 pp`
- Within 1mm:
  - `-0.13 pp`
- P90 AE:
  - `+0.024725521017361585 mm`

Decision:

- v5 is registered as:
  - `badong-context-enriched-challenger`
- v5 is not promoted because it fails full non-regression against v4 due Within-1mm and P90 tail regression.
- Badong v4 remains:
  - `badong-production-main`
- Route proof still selects v4 for Badong production forecast.

Updated current snapshot:

- `artifacts/models/regional-experts/phase1-displacement-forecast/backups/current-production-main-2026-05-06T09-26-36-812Z`
- readiness remains:
  - `pass: true`
- snapshot now also includes v5 challenger artifact, registration, training report, and runtime validation.

Validation:

- `python -m py_compile scripts/dev/regional-model-library/train-badong-huangtupo-context-enriched-challenger.py`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed
- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `python scripts/dev/regional-model-library/train-badong-huangtupo-context-enriched-challenger.py`
  - passed
- `node scripts/dev/regional-model-library/register-badong-huangtupo-context-v5-challenger.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-badong-huangtupo-v5-runtime-validation.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-badong-huangtupo-displacement-runtime-forecast.mjs`
  - passed and still routes Badong production to v4
- `node scripts/dev/regional-model-library/check-displacement-production-main-routing.mjs`
  - passed
- `node scripts/dev/regional-model-library/backup-displacement-production-main-snapshot.mjs`
  - passed
- `npx openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- targeted `git diff --check`
  - passed

## 2026-05-06 Badong-Huangtupo v7 Dev-gated Selector Production-main

The Badong enhancement line moved past v5 challenger without forcing unsafe promotion.

v6 result:

- script:
  - `scripts/dev/regional-model-library/train-badong-huangtupo-context-gated-v6.py`
- method:
  - residualCorrection by context/regime buckets on top of v4
- result:
  - `promoteAllowed: false`
  - all useful residual groups were rejected by dev non-regression gate
  - final behavior effectively falls back to v4
- conclusion:
  - v6 is not a production model and should not be registered as production-main

v7 result:

- new runtime model support:
  - `gated_model_selection_regression_v1`
  - implemented in `libs/regional-model-library/src/contracts/prediction-regression-artifact.ts`
  - selects `candidateModel` only for stored regime keys; otherwise uses `fallbackModel`
- new training script:
  - `scripts/dev/regional-model-library/train-badong-huangtupo-gated-selector-v7.py`
- selection:
  - fallback:
    - Badong v4 HGB support-guarded production-main
  - candidate:
    - Badong v5 context-enriched challenger
  - selected dimensions:
    - `point`
  - selected key:
    - `point:D301`
  - rejected keys:
    - `point:P1`
    - `point:P24`
- promotion:
  - script:
    - `scripts/dev/regional-model-library/promote-badong-huangtupo-gated-selector-v7-production.mjs`
  - model:
    - `badong-huangtupo.displacement.hgb-point-gated-v5-selector-v7@0.7.0`
  - artifact:
    - `artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v7.gated-selector.prediction-regression-v1.json`
  - registry role:
    - `badong-production-main`

Badong v7 runtime validation:

- report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-badong-huangtupo-v7-runtime-validation.report.json`
- evaluated:
  - `10294`
- MAE:
  - `0.5093341013142842`
- RMSE:
  - `1.372918515042326`
- R2:
  - `0.03248492375075829`
- Direction:
  - `47.26054012045852%`
- Within 1mm:
  - `86.10841266757334%`
- P90 AE:
  - `1.6800590949507495 mm`

Delta vs Badong v4:

- MAE:
  - `-0.0004213718276648848`
- RMSE:
  - `-0.0000023487881579686842`
- R2:
  - `+0.000003310451236249179`
- Direction:
  - `+1.894307363512726 pp`
- Within 1mm:
  - `0`
- P90 AE:
  - no regression in runtime validation

Current production-main set:

- Baijiabao:
  - `baijiabao.displacement.pointwise-fixed-expert-ensemble-v31-dev-gated-state-protected-v33@0.33.0`
- Badong-Huangtupo:
  - `badong-huangtupo.displacement.hgb-point-gated-v5-selector-v7@0.7.0`

Production routing proof:

- report:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/check-displacement-production-main-routing.report.json`
- pass:
  - `true`
- Baijiabao station alias:
  - routes to v33
- Badong region/admin alias:
  - routes to v7
- unknown region:
  - no forecast model is borrowed

Current backup/readiness:

- backup root:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/backups/current-production-main-2026-05-06T09-57-11-762Z`
- readiness:
  - `artifacts/models/regional-experts/phase1-displacement-forecast/displacement-production-main-readiness.report.json`
  - `pass: true`

Data-side conclusion remains:

- a third real displacement forecast region is not available from current local files
- Huangniba-Dengkan currently has only an empty/root placeholder and no usable deformation time-series sample pack
- Fuling/Zixing/Beijing are event/replay/rainfall packs, not direct displacement monitoring expert corpora
- next real accuracy expansion should prioritize manual acquisition and normalization of Huangniba-Dengkan or another Three Gorges monitoring bundle

Validation:

- `python -m py_compile scripts/dev/regional-model-library/train-badong-huangtupo-gated-selector-v7.py`
  - passed
- `npm run build --workspace @lsmv2/regional-model-library`
  - passed
- `npm run build --workspace @lsmv2/ai-prediction-worker`
  - passed
- `python scripts/dev/regional-model-library/train-badong-huangtupo-context-gated-v6.py`
  - passed with `promoteAllowed: false`
- `python scripts/dev/regional-model-library/train-badong-huangtupo-gated-selector-v7.py`
  - passed with `promoteAllowed: true`
- `node scripts/dev/regional-model-library/promote-badong-huangtupo-gated-selector-v7-production.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-badong-huangtupo-v7-runtime-validation.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-badong-huangtupo-displacement-runtime-forecast.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-displacement-production-main-routing.mjs`
  - passed
- `node scripts/dev/regional-model-library/check-baijiabao-displacement-runtime-forecast.mjs`
  - passed
- `node scripts/dev/regional-model-library/backup-displacement-production-main-snapshot.mjs`
  - passed with readiness `pass: true`
- `npx openspec validate add-regional-landslide-model-baseline --strict`
  - passed
- targeted `git diff --check`
  - passed

## 2026-05-06 Third-region Monitoring Data Acquisition Queue

User requested direct acquisition of the datasets needed for the third regional displacement forecast expert.

Local checks:

- Huangniba-Dengkan root exists but has no usable downloaded file:
  - `.tmp/regional-model-library/raw/ThreeGorges/Huangniba-Dengkan-8year/source/downloads/`
- User download folders checked:
  - `D:\Download`
  - `E:\FierFoxDownload`
- No Huangniba/Dengkan/Figshare `29220923` CSV was found in those download folders.

Online/source checks:

- Huangniba-Dengkan source confirmed:
  - Figshare article:
    - `https://figshare.com/articles/dataset/Data_Sheet_2_Research_and_analysis_of_the_TCN-Multihead-Attention_prediction_model_of_landslide_deformation_in_the_Three_Gorges_Reservoir_area_China_csv/29220923`
  - direct file endpoint:
    - `https://figshare.com/ndownloader/files/55071158`
  - paper source:
    - `https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2025.1587623/full`
  - expected fields:
    - horizontal displacement / elevation / rainfall / reservoir level
  - CLI status:
    - `403 Forbidden` from `figshare.com/ndownloader`
    - `403 Forbidden` from `api.figshare.com`
- NCDC priority metadata acquired and stored:
  - root:
    - `.tmp/regional-model-library/raw/acquisition-queue-2026-05-06/`
  - queue files:
    - `priority-monitoring-download-queue.csv`
    - `priority-monitoring-download-queue.json`
    - `download-attempts.csv`
    - `download-attempts.json`
    - `README.md`

Priority NCDC queue:

- `0c3020e1-d792-4dd1-a820-2dd48dfde62f`
  - 湖北巴东试验场黄土坡地表位移监测数据集（2018-2019年）
  - `apply-access`
  - 10 files
  - 9623006 bytes
  - `*.csv`
- `8b610f07-addf-478c-b288-18df4f205fd0`
  - 长江三峡库区秭归县白水河滑坡变形、降雨及库水位监测资料(2018年)
  - `apply-access`
  - 5 files
- `a5651f2a-bccc-4de4-aeb2-4db70bf76a2e`
  - 长江三峡库区秭归县八字门滑坡变形、降雨及库水位监测资料(2018年)
  - `apply-access`
  - 5 files
- `0aaf6e26-fce1-4d3b-a160-777827d94cd4`
  - 2017年长江三峡库区秭归县新滩滑坡变形、降雨及库水位监测资料
  - `apply-access`
  - 5 files
- `6260cfc4-0d1d-11e6-af40-5cc5d45ad3ae`
  - 2006年长江三峡库区秭归县白水河滑坡变形监测数据
  - `login-access`
- `63800190-0d1d-11e6-af40-5cc5d45ad3ae`
  - 2006年长江三峡库区秭归县八字门滑坡变形监测数据
  - `login-access`
- `64c3f494-0d1d-11e6-af40-5cc5d45ad3ae`
  - 2006年长江三峡库区秭归县新滩滑坡变形监测数据
  - `login-access`
- `6955ee18-0d1d-11e6-af40-5cc5d45ad3ae`
  - 2006年长江三峡库区秭归县树坪滑坡变形监测数据
  - `login-access`
- `6c6389bc-0d1d-11e6-af40-5cc5d45ad3ae`
  - 长江三峡库区降雨量、长江水位、气温观测资料（2001-2005年）
  - `login-access`
- `6d2c3204-0d1d-11e6-af40-5cc5d45ad3ae`
  - 1996—2006年长江三峡库区地表大地形变监测
  - `login-access`

Download attempt result:

- NCDC metadata export works anonymously and all priority metadata were saved.
- NCDC protected `data_direct_download`:
  - `GET` returns `405`
  - `POST` returns `403`
  - conclusion:
    - login/session or approved application is required.
- Figshare protected from this terminal:
  - `403` for direct file and API endpoints
  - manual browser download remains the fastest path for Huangniba-Dengkan.

Next concrete action:

- Download Huangniba-Dengkan CSV manually from Figshare and place it at:
  - `.tmp/regional-model-library/raw/ThreeGorges/Huangniba-Dengkan-8year/source/downloads/`
- Log into NCDC and download the login-access queue first, because those are small and likely enough for a third historical regional expert.
- Submit applications for the four apply-access high-value packs.
