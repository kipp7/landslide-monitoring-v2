---
title: regional-model-library-schema-v0
type: note
tags:
- reference
- ai
- schema
- regional-model
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/regional-model-library-schema-v0
---

# Reference: regional-model-library-schema-v0

## Purpose

Start the first formal field design for the regional expert model library so the team can freeze contracts before training, matching, and worker integration.

## Field Handling Principle

- keep source truth in raw form
- map business semantics to canonical repository fields
- train on a unified sample schema
- expose only runtime-relevant fields online

Four layers:

- `SourceRaw`
- `CanonicalBusinessIdentity`
- `CanonicalTrainingSample`
- `RuntimePredictionPayload`

### Raw Intake Alignment Rule

- do not force `SourceRaw` field names to look like runtime payload fields during landing
- raw landing should preserve:
  - archive members
  - original file names
  - workbook sheet names
  - raw column aliases
- `canonicalTarget` in intake manifests should point only to:
  - `CanonicalBusinessIdentity`
  - `CanonicalTrainingSample`
  - `RegionProfile`
- runtime payload fields should be derived later from canonical contracts, not used as raw landing names
- when a source needs normalization, keep both:
  - `original/` as read-only source truth
  - `normalized/` or `extracts/` as derived offline artifacts
- for large gridded backbones such as `CHM_PRE V2`, keep the national raw grids intact and derive `by-event` or `by-region` extracts instead of flattening the full source into one CSV

## RegionProfile v0

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `regionCode` | string | yes | deployment partition business code |
| `slopeCode` | string | preferred | landslide body business code |
| `stationCode` | string | preferred | fixed monitoring point code |
| `nodeCode` | string/null | no | logical node role under a station |
| `gatewayCode` | string/null | no | edge aggregation unit code |
| `identityClass` | enum | yes | `formal / seed / replay / rehearsal / smoke_test / lab` |
| `countryCode` | string/null | no | country or national partition |
| `provinceCode` | string/null | no | province-level location code |
| `cityCode` | string/null | no | city-level location code |
| `areaCode` | string/null | no | county or district location code |
| `latitude` | number/null | no | representative latitude |
| `longitude` | number/null | no | representative longitude |
| `elevationM` | number/null | no | elevation in meters |
| `slopeAngleDeg` | number/null | no | slope angle |
| `slopeAspectDeg` | number/null | no | slope aspect |
| `terrainClass` | string/null | no | terrain/morphology category |
| `staticFactors.landCover` | object/null | no | land-cover prior bundle including dominant class, class distribution, source year, and raster lineage |
| `hazardType` | string | yes | current target hazard type |
| `lithology` | string/null | no | major lithology class |
| `geologyType` | string/null | no | broader geological grouping |
| `soilType` | string/null | no | soil class if available |
| `structureType` | string/null | no | structural/geotechnical type |
| `landslideTriggerStyle` | string/null | no | trigger pattern such as rainfall-driven |
| `rainfallRegime` | string/null | no | rainfall pattern / rainy-season type |
| `annualRainfallMm` | number/null | no | annual rainfall indicator |
| `seasonalityClass` | string/null | no | seasonal class |
| `antecedentRainfallSensitivity` | string/null | no | low/medium/high style sensitivity flag |
| `hydrologicProxySet` | object/null | no | soil moisture / pore pressure proxies available |
| `sensorSchema` | string | yes | canonical sensor schema key |
| `requiredSensors` | string[] | yes | sensors required by matching/training |
| `optionalSensors` | string[] | no | bonus sensors that may improve ranking |
| `samplingProfile` | object/null | no | sample interval and cadence summary |
| `reportingProfile` | object/null | no | report interval and batching summary |
| `profileVersion` | string | yes | version of the profile contract |
| `sourceDatasets` | object[] | no | source dataset references |
| `sourceRegionKeys` | object[] | no | original source region/site keys |
| `qualityFlags` | string[] | no | profile completeness and quality flags |

Minimum lock for phase 1:

- `regionCode`
- `hazardType`
- `sensorSchema`
- `requiredSensors`
- `profileVersion`
- at least one of:
  - `slopeCode`
  - `stationCode`

## RegionExpertPackage v0

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `modelKey` | string | yes | stable expert identifier |
| `modelVersion` | string | yes | versioned artifact label |
| `artifactFormat` | string | yes | artifact packaging format |
| `artifactUri` | string | yes | storage location |
| `createdAt` | datetime | yes | package creation time |
| `scopeType` | enum | yes | `region / slope / station / global` |
| `scopeKey` | string | yes | business key for routing |
| `applicableRegionProfile` | object | yes | condensed profile for eligibility matching |
| `supportedHazardTypes` | string[] | yes | supported hazard families |
| `supportedSensorSchema` | string[] | yes | compatible sensor schema keys |
| `featureSchemaVersion` | string | yes | canonical feature contract version |
| `windowSpec` | object | yes | input windows such as `6h / 24h / 72h` |
| `requiredFeatures` | string[] | yes | required input feature keys |
| `optionalFeatures` | string[] | no | optional input feature keys |
| `normalizationSpec` | object | yes | normalization parameters and strategy |
| `outputType` | enum | yes | `forecast / warning / multitask` |
| `forecastHorizons` | integer[] | no | horizon set in seconds |
| `riskLevels` | string[] | no | supported discrete risk levels |
| `calibrationSpec` | object/null | no | calibration object and thresholds |
| `trainingFramework` | string | yes | framework used to train |
| `trainingDatasetRefs` | object[] | yes | dataset lineage |
| `trainingSampleCount` | integer | yes | training sample volume |
| `labelPolicyVersion` | string | yes | label-generation policy version |
| `trainingRunId` | string | yes | reproducible run identifier |
| `validationMetrics` | object | yes | offline validation metrics |
| `replayMetrics` | object | preferred | replay metrics by target setting |
| `calibrationMetrics` | object/null | no | calibration quality indicators |
| `knownFailureModes` | string[] | no | failure notes and caveats |
| `fallbackPolicy` | object | yes | fallback and error policy |
| `resourceHints` | object/null | no | runtime resource hints |
| `notes` | string/null | no | operator notes |

Minimum lock for phase 1:

- `modelKey`
- `modelVersion`
- `scopeType`
- `scopeKey`
- `featureSchemaVersion`
- `windowSpec`
- `artifactUri`
- `validationMetrics`
- `fallbackPolicy`

## CanonicalTrainingSample v0

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `sampleId` | string | yes | stable sample identifier |
| `scopeType` | enum | yes | `region / slope / station` |
| `scopeKey` | string | yes | business scope key |
| `regionCode` | string | yes | region business code |
| `slopeCode` | string/null | no | landslide body code |
| `stationCode` | string/null | no | monitoring point code |
| `eventTs` | datetime | yes | prediction anchor time |
| `windowSpec` | object | yes | observed input windows |
| `horizonSpec` | object | yes | forecast or warning target horizon |
| `metricsNormalized` | object | yes | normalized canonical metrics |
| `derivedFeatures` | object | no | engineered features |
| `context` | object | no | static context and profile snapshot |
| `hydroclimateContext` | object | no | rainfall and hydrologic context |
| `displacementLabel` | object/null | no | regression target |
| `riskLevelLabel` | string/null | no | risk classification target |
| `warningHitLabel` | boolean/null | no | event/alert hit target |
| `qualityFlags` | string[] | no | sample quality indicators |
| `sourceDataset` | string | yes | source dataset name |
| `sourceRecordKey` | string | yes | source row/site/window key |
| `sourceFieldMap` | object | yes | mapping from source fields to canonical fields |
| `rawRef` | object | yes | raw-source pointer or storage reference |

Minimum lock for phase 1:

- `sampleId`
- `scopeType`
- `scopeKey`
- `eventTs`
- `windowSpec`
- `metricsNormalized`
- at least one label field
- `sourceDataset`
- `sourceRecordKey`

## RuntimePredictionPayload v0

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `source` | object | yes | runtime source summary |
| `windowSummary` | object | yes | runtime feature window summary |
| `matchedModelKey` | string | preferred | selected model key |
| `matchedModelVersion` | string/null | no | selected model version |
| `matchedScopeType` | string/null | no | selected scope type |
| `matchedScopeKey` | string/null | no | selected scope key |
| `matchScore` | number/null | no | final routing score |
| `fallbackReason` | string/null | no | fallback cause if not primary route |
| `featureSummary` | object | no | lightweight feature summary |
| `warningFactors` | object | no | interpretable factors or reasons |
| `traceRefs` | object | no | source and lineage references |

Phase 1 extension over current payload should at minimum add:

- `matchedModelKey`
- `matchedModelVersion`
- `matchedScopeType`
- `matchedScopeKey`
- `matchScore`
- `fallbackReason`

## Phase 1 Contract Lock

These fields should be frozen before implementation branches diverge.

### Lock Set A: RegionProfile

| Field | Why lock now |
| --- | --- |
| `regionCode` | top-level business routing anchor |
| `slopeCode` | landslide-body continuity anchor |
| `stationCode` | fixed-point continuity anchor |
| `hazardType` | hard filter and label policy depend on it |
| `sensorSchema` | model eligibility depends on it |
| `requiredSensors` | worker and matcher both need it |
| `profileVersion` | prevents silent schema drift |

### Lock Set B: RegionExpertPackage

| Field | Why lock now |
| --- | --- |
| `modelKey` | stable registry identity |
| `modelVersion` | versioned rollout identity |
| `scopeType` | routing semantics depend on it |
| `scopeKey` | matching and payload trace depend on it |
| `featureSchemaVersion` | ties training and runtime together |
| `windowSpec` | feature builder and replay need the same windows |
| `artifactUri` | runtime loader contract |
| `validationMetrics` | offline acceptance gate |
| `fallbackPolicy` | runtime safety contract |

### Lock Set C: CanonicalTrainingSample

| Field | Why lock now |
| --- | --- |
| `sampleId` | dedup and lineage |
| `scopeType` | training grouping semantics |
| `scopeKey` | sample-to-expert relation |
| `eventTs` | replay and horizon alignment |
| `windowSpec` | consistent feature extraction |
| `horizonSpec` | consistent target definition |
| `metricsNormalized` | core model input contract |
| `sourceDataset` | provenance and debugging |
| `sourceRecordKey` | reproducibility |
| `rawRef` | recover original source truth |

### Lock Set D: RuntimePredictionPayload

| Field | Why lock now |
| --- | --- |
| `matchedModelKey` | traceability |
| `matchedModelVersion` | traceability |
| `matchedScopeType` | explain routing choice |
| `matchedScopeKey` | explain routing choice |
| `matchScore` | ranking audit |
| `fallbackReason` | safety and debugging |

Implementation rule:

- no downstream module should invent alternative names for these fields
- extensions are allowed, renames are not

## SourceRaw To CanonicalTrainingSample Mapping Guide

This table defines the direction of travel for heterogeneous public datasets and future field datasets.

| Source concept | Canonical field | Mapping rule | Notes |
| --- | --- | --- | --- |
| source region identifier | `regionCode` | map if a stable deployment/area partition exists | else keep only in `sourceFieldMap` and `rawRef` |
| source landslide body/site group | `slopeCode` | map when the dataset has a stable monitored body or hazard body | do not fabricate if the dataset only has image tiles |
| source monitoring point / station code | `stationCode` | map when the dataset has a persistent fixed point | use source site key only if semantics are stable |
| source record timestamp | `eventTs` | convert to RFC3339 UTC | preserve original timezone in `rawRef` if needed |
| source observation window | `windowSpec` | normalize to canonical windows such as `6h / 24h / 72h` | if source cadence differs, record resampling in `sourceFieldMap` |
| source forecast horizon / warning lead | `horizonSpec` | normalize to canonical horizon object | keep source horizon labels in `rawRef` |
| displacement / deformation fields | `metricsNormalized.displacement*` | rename and normalize units | record unit conversion explicitly |
| tilt / inclination fields | `metricsNormalized.tilt*` | rename and normalize units | keep original axes in `sourceFieldMap` |
| vibration / acceleration fields | `metricsNormalized.vibration*` | normalize to canonical metric keys | preserve original sensor family in `rawRef` |
| rainfall / precipitation fields | `hydroclimateContext` and `metricsNormalized.rainfall*` | split direct measurements vs derived context | antecedent windows should be explicit |
| static geology fields | `context` and `RegionProfile` | keep business context separate from time-varying metrics | do not duplicate into every runtime payload field |
| source class labels | `riskLevelLabel` or `warningHitLabel` | map only if semantics match our label policy | otherwise keep source label and derive later |
| source continuous target | `displacementLabel` | normalize unit and horizon | keep source target key in `sourceFieldMap` |
| missing or unsupported source fields | none | preserve in `rawRef.extra` | do not invent canonical runtime keys |

Hard rules:

- public datasets without hardware identity MUST NOT invent `device_id`
- source display names MUST NOT replace canonical business keys
- source-only fields stay in `sourceFieldMap` or `rawRef`, not in runtime payloads by default
- unit conversion, resampling, and label derivation must always be explicit

## Dataset Family Routing Rule

This is the stable schema-level rule for Chinese public datasets and later regional onboarding.

### Monitoring Time Series

- default adapter:
  - `ts_station_multivariate_adapter`
- canonical destination:
  - full `CanonicalTrainingSample`
- default scope rule:
  - use `station` only when the source truly has a persistent fixed monitoring point
  - else use `slope`
- direct downstream:
  - first-batch regional expert training
  - replay evaluation
  - runtime feature-building

### Event Inventory Or Event Catalogue

- default adapter:
  - `event_inventory_adapter`
- canonical destination:
  - `RegionProfile` support
  - event truth references
  - joined sample factory after rainfall or monitoring alignment
- default scope rule:
  - prefer `region` or `slope`
  - do not fabricate `stationCode` for point-free inventory records
- direct downstream:
  - `Static Match`
  - cold-start priors
  - replay truth lookup

### Remote-Sensing Patch / Segmentation / Inventory

- default adapter:
  - `rs_patch_inventory_adapter`
- canonical destination:
  - `RegionProfile`
  - inventory refinement
  - remote-sensing side branch
- default scope rule:
  - use `region` or `slope`
  - image tiles without stable monitored points MUST NOT be mapped as `station`
- direct downstream:
  - susceptibility priors
  - visual side models
  - candidate-body enrichment

Phase 1 rule:

- only `Monitoring Time Series` should define the first-batch online expert corpus
- `Event Inventory Or Event Catalogue` joins the mainline only after windowed feature construction
- `Remote-Sensing Patch / Segmentation / Inventory` remains a side branch in phase 1

## First-Batch China Adapter Queue v0

This section turns the China-source research into an execution-facing adapter queue.

### Queue A: Monitoring Time Series

| Source group | Phase-1 role | Recommended scope rule | Primary label source | Joinable covariates | Access mode | Adapter note |
| --- | --- | --- | --- | --- | --- | --- |
| `ThreeGorges core station bundles` | primary expert cluster | default `station`; fall back to `slope` when only body-level continuity is stable | deformation / displacement / crack-change tables from station records | rainfall, reservoir water level, groundwater, air temperature, inclinometer-style deformation | official NCDC; mixed `Online / Login to Access` | best first `ts_station_multivariate_adapter` template because the feature shape already matches `deformation + rainfall + reservoir level` |
| `Badong-Huangtupo multi-sensor cluster` | primary expert cluster | mixed `station` and `slope`; prefer station-level keys where sensor point continuity is stable | surface displacement, Beidou displacement, slip-belt displacement, bank deformation | rainfall, groundwater depth and temperature, tunnel flow, settlement, cracks, soil pressure, rock-soil stress, water temperature | official NCDC; mixed public page and request-based retrieval | second mainline adapter; strongest multi-modal support-set candidate |
| `Baijiabao 2017-2024` | challenger expert or Three Gorges extension | `slope` by default, upgrade to `station` if point IDs are stable in files | GNSS displacement and surface-crack change | rainfall and reservoir water level | open NCDC entry | clean extension of the Three Gorges mechanism family |
| `Huangniba Dengkan 8-year series` | baseline challenger | `slope` by default unless stable monitoring-point IDs are confirmed | horizontal displacement | rainfall and reservoir water level | direct figshare download | fast baseline for `Chronos / TimesFM / Uni2TS` experiments |
| `Luoyugou joined field experiment` | challenger and joined-sample factory | `slope` | displacement | rainfall, water level, pore-water pressure | official NCDC entries | best short-window loess-region joined experiment for immediate sample-factory work |
| `Zhamunongba 2016-2019` | challenger or context-only until label semantics are confirmed | `slope` | no direct displacement label confirmed yet from current public summary | rainfall, soil temperature, pore-water pressure, water content, water potential, vibration | official NCDC page with request-style access path | keep out of the first primary-expert batch until a direct prediction label is confirmed |
| `Yan'an infiltration monitoring` | context-only | `region` or `slope` context | no direct displacement label | infiltration and hydrologic evolution | `Online`; `CC BY 4.0` | use for `hydroclimateContext`, not as a primary label source |
| `Luoyugou ERT` | side covariate only | `slope` | no direct displacement label | geophysical resistivity | `Login to Access` | interpretation side branch, not phase-1 primary training |

### Queue B: Event Inventory / Prior / Replay

| Source group | Primary use | Scope level | Must join before mainline training? | Notes |
| --- | --- | --- | --- | --- |
| `China 2008-2024 landslide catalogue` | `prior + Static Match + replay truth lookup` | `region` and `event` | yes | national cold-start backbone |
| `Global landslide points and areas (China filtered)` | `prior + replay reference` | `region` and `event` | yes | use only where better China-local inventory is missing |
| `Beijing 2023` | `replay + event prior` | `event` | yes | strong single-event rainfall-triggered replay set |
| `Zixing 2024` | `replay + event prior` | `event` | yes | pair with extreme-rainfall reconstruction and remote-sensing side support |
| `Fuling 2019` | `replay + Static Match` | `event` | yes | useful southwest China rainfall-triggered event case |
| `Wanzhou 1950-2020 + 18 factors` | `Static Match + prior` | `region` and `slope` | yes | strong region-profile enrichment source |
| `Wenchuan multi-temporal` | `replay + post-event prior` | `event` and `region` | yes | use after rainfall or temporal alignment |
| `Weihe Basin points` | `Static Match + prior` | `region` and `slope` | yes | northwestern basin-level background source |
| `Gansu points` | `Static Match + prior` | `region` and `slope` | yes | province-level background source |
| `Yellow River Basin geological disaster data` | `prior` | `region` | yes | broad hazard background layer |
| `Zhushan susceptibility GIS data` | `prior + reference implementation` | `region` | yes | use for susceptibility-style region profile features, not for primary expert labels |

### Current Build Order

1. `ThreeGorges core station bundles`
2. `Badong-Huangtupo multi-sensor cluster`
3. `Baijiabao 2017-2024`
4. `Huangniba Dengkan 8-year series`
5. `Luoyugou joined field experiment`
6. `China 2008-2024 landslide catalogue`
7. `Beijing 2023 / Zixing 2024 / Fuling 2019`

Current hold list:

- `Zhamunongba`
  - wait until direct prediction-label semantics are confirmed
- `Yan'an infiltration monitoring`
  - context only
- `Luoyugou ERT`
  - side covariate only

## First-Batch Starter Mapping v0

These are starter mappings for implementation. They are still dataset-group level, not final file-column maps.

### Starter A: ThreeGorges Core Station Bundles

- source family:
  - `ThreeGorges core station bundles`
- recommended `scopeType`:
  - `station` when stable monitoring-point IDs exist
  - otherwise `slope`
- canonical anchors:
  - `regionCode`
    - normalize to the Three Gorges deployment partition
  - `slopeCode`
    - normalize from source site names such as `Shuping / Xintan / Baishuihe / Bazimen`
  - `stationCode`
    - use source monitoring-point IDs when stable
- `eventTs`
  - source observation timestamp
- `metricsNormalized`
  - displacement / deformation
  - crack displacement when present
  - groundwater level
  - rainfall
  - reservoir water level
  - air temperature
  - inclinometer-style deformation when present
- `hydroclimateContext`
  - antecedent rainfall windows
  - reservoir rise/fall summaries
  - wet-season flags
- primary label path:
  - `displacementLabel`
    - future displacement delta or cumulative displacement target
- output:
  - first primary `ts_station_multivariate_adapter`

#### ThreeGorges Source-Group Mapping

| Source group | Main label candidate | Joinable covariates | Access mode | Suggested scope | Adapter role |
| --- | --- | --- | --- | --- | --- |
| `Three Gorges release hub` | none directly | rainfall, air temperature, surface and groundwater water-level lines exposed as data families | `Online` | `region` | metadata only |
| `2001 annual report` | surface GPS displacement first; borehole inclinometer only as auxiliary label candidate | groundwater level, rainfall, Yangtze water level, air temperature | mixed report-style access | start as `region`, split to `station` after table extraction | metadata and field-template source before direct training use |
| `2006 station pages` | surface GPS displacement | groundwater when present, rainfall, Yangtze water level, air temperature, monthly summaries | mixed `Online / Login to Access` by page | `station` | direct mainline adapter input after file-level verification |
| `2007-2012 deformation pages` | surface GPS displacement | rainfall, Yangtze water level, air temperature, monthly summaries, groundwater on compatible pages | mostly `Login to Access` | `station` | direct mainline adapter input for long-window training and replay |
| `2007-2012 basic-feature pages` | none directly | monitoring-network layout, slope geometry, instrumentation summary | request-style or metadata access | `slope` | metadata only |
| `2016-2018 deformation + rainfall + reservoir-level pages` | surface GPS displacement | rainfall and reservoir level first; groundwater and air temperature when exposed | mixed request or login flow | `station` | best first-tranche direct adapter sources |
| `annual report compilations` | none directly | monitoring-network layout, anomaly explanations, station-to-slope relations | document-style access | `region` or `slope` | metadata and replay explanation only |
| `Baijiabao 2017-2024` | GNSS displacement; crack deformation as auxiliary task | rainfall and reservoir water level | open NCDC entry | default `slope`, upgrade to `station` if point IDs are stable | challenger or Three Gorges extension |

#### ThreeGorges Implementation Rule

- first direct adapter tranche:
  - `2016-2018` station pages for:
    - `Shuping`
    - `Xintan`
    - `Baishuihe`
    - `Bazimen`
- second tranche:
  - `2007-2012` deformation pages
- third tranche:
  - `2006` station pages
- `2001 annual report`, `basic-feature pages`, and `annual report compilations` should not be used as first-pass training tables
  - use them to backfill:
    - station registry
    - slope metadata
    - monitoring-network layout
    - replay explanation
- default label rule for phase 1:
  - use only `surface GPS displacement` as the main prediction label
- default first covariate join rule:
  - join `rainfall + reservoir water level` first
  - add `groundwater + air temperature` only when the page or file explicitly supports them
- default join key rule:
  - prefer `stationCode + eventTs`
  - fall back to `slopeCode + monitoring-point ID + eventTs` when station identity is not already normalized
- default time-grid rule:
  - preserve original cadence in `rawRef`
  - normalize adapter output to the canonical feature windows over:
    - `6h`
    - `24h`
    - `72h`

#### ThreeGorges File-Family Mapping v0

| File family | Likely raw column family | Canonical destination | Join / identity rule | Adapter action | Validation rule |
| --- | --- | --- | --- | --- | --- |
| `surface GPS / deformation tables` | `obs_time`, `point_id`, `cumulative_displacement_mm`, `increment_displacement_mm`, axis-style displacement columns | `metricsNormalized.displacementSurfaceMm`, `displacementLabel`, `sourceFieldMap.labelSource` | prefer `stationCode + eventTs`; fall back to `slopeCode + point_id + eventTs` | keep cumulative and delta semantics explicit; derive delta only when the raw file is cumulative-only | timestamps must be monotonic per point; one unit convention per file; no duplicate `point_id + timestamp` rows |
| `rainfall tables` | `obs_time`, `rainfall_mm`, `daily_rainfall_mm`, `cum_rainfall_mm`, `gauge_id` | `metricsNormalized.rainfallCurrentMm`, `hydroclimateContext.antecedentRainfall` | join by local gauge first; if gauge is slope-level only, keep `gauge_id` in `rawRef` and join on `slopeCode + eventTs` | preserve raw cadence; derive `6h / 24h / 72h` rainfall windows in the adapter | rainfall must be non-negative unless flagged; keep gauge identity; missing spans must raise quality flags |
| `reservoir / Yangtze water-level tables` | `obs_time`, `water_level_m`, `change_rate_m`, `rise_fall_flag`, `gauge_id` | `metricsNormalized.reservoirLevelM`, `hydroclimateContext.reservoirRiseFall` | join on `slopeCode + eventTs`; preserve reservoir gauge identity in `rawRef` | align nearest valid reading or aggregate within the canonical window; keep reference datum explicit | do not mix multiple gauges without `gauge_id`; preserve datum and unit metadata |
| `groundwater tables` | `obs_time`, `groundwater_level_m`, `groundwater_depth_m`, `well_id` | `metricsNormalized.groundwaterLevelM` or `metricsNormalized.groundwaterDepthM`, `hydroclimateContext.groundwaterState` | join on `stationCode` when the well belongs to one monitoring point; otherwise `slopeCode + well_id + eventTs` | normalize `level` versus `depth` semantics without losing the original sign convention | every file must declare whether it is `level` or `depth`; do not invert signs silently |
| `air-temperature tables` | `obs_time`, `temperature_c` | `metricsNormalized.airTemperatureC`, optional `hydroclimateContext.temperatureSummary` | join by `stationCode + eventTs` or slope-level weather-source key when station-level is absent | pass through native cadence and derive rolling summaries only in canonical features | reject implausible ranges unless explicitly marked; keep weather-source ID when not station-local |
| `crack deformation tables` | `obs_time`, `crack_id`, `crack_width_mm`, `crack_displacement_mm` | `metricsNormalized.crackDisplacementMm`, optional auxiliary label only | join on `slopeCode + crack_id + eventTs` | keep as auxiliary task support, not the phase-1 main label | crack IDs must be stable; do not merge crack and surface-GPS labels into one raw series |
| `inclinometer / borehole tables` | `obs_time`, `borehole_id`, `depth_m`, `displacement_mm` | `rawRef`, optional advanced covariates later | join only after the depth axis is normalized; default keep outside first-pass canonical metrics | preserve full depth profile; do not collapse into a single scalar in phase 1 | depth coordinate must remain explicit; mixed depth schemas require separate raw registrations |
| `basic-feature / annual-report tables` | `station_name`, `slope_name`, `coordinates`, `instrument_list`, `geology`, `monitoring_network` | `RegionProfile`, `sourceRegionKeys`, `rawRef.metadataBackfill` | map to `regionCode / slopeCode / stationCode` only after names are normalized | metadata only; no direct `CanonicalTrainingSample` rows from report summaries | document-derived summaries must not be promoted into training samples without underlying tables |

### Starter B: Badong-Huangtupo Multi-Sensor Cluster

- source family:
  - `Badong-Huangtupo multi-sensor cluster`
- recommended `scopeType`:
  - mixed `station` and `slope`
- canonical anchors:
  - `regionCode`
    - normalize to the Badong-Huangtupo deployment partition
  - `slopeCode`
    - normalize to the Huangtupo body or sub-body
  - `stationCode`
    - use monitoring-point or sensor-position IDs when stable
- `eventTs`
  - source observation timestamp
- `metricsNormalized`
  - surface displacement
  - Beidou 3D displacement
  - slip-belt displacement
  - bank deformation
  - crack displacement when present
  - tunnel settlement
- `hydroclimateContext`
  - rainfall
  - groundwater depth and temperature
  - water temperature
  - tunnel flow
- `context`
  - soil pressure
  - rock-soil stress
  - sensor-family subset identifiers
- primary label path:
  - `displacementLabel`
    - future deformation or displacement delta
- output:
  - second primary `ts_station_multivariate_adapter`

#### Badong And Loess Source-Group Mapping

| Source group | Main label candidate | Joinable covariates | Suggested scope | Phase-1 role | Adapter note |
| --- | --- | --- | --- | --- | --- |
| `Huangtupo surface displacement 2018-2019` | surface displacement delta or cumulative displacement | rainfall, groundwater depth and temperature, reservoir-level or cave-water context when available | `station` first, `slope` fallback | primary | core label source for `Badong-Huangtupo` |
| `Huangtupo 3D Beidou displacement 2018-2025` | 3D displacement or projected displacement targets | rainfall, groundwater, temperature, tunnel-flow context | `station` | primary | strongest long-window displacement source in the cluster |
| `cave slip-belt displacement 2017-2025` | slip-belt displacement | rainfall, water temperature, tunnel flow, stress context | `station` or `slope` depending on sensor-position continuity | primary or auxiliary label source | use only after sensor-position IDs are normalized |
| `bank deformation 2023-2025` | bank deformation | rainfall, cracks, stress, temperature | `station` or `slope` | primary or auxiliary label source | useful subfamily inside the Badong cluster |
| `tunnel settlement 2017-2025` | settlement change | rainfall, flow, stress, temperature | `station` | auxiliary label or challenger task | keep separate from the first main displacement label until task unification is validated |
| `bank cracks / cave cracks` | crack deformation | rainfall, deformation, temperature | `station` | auxiliary task only | explanation and multitask support, not first-pass main label |
| `cave rainfall` | none directly | rainfall totals and antecedent windows | `station` or `slope` | covariate | default first hydroclimate join inside the Badong cluster |
| `groundwater depth and temperature` | none directly | groundwater and thermal context | `station` or `slope` | covariate | high-value hydroclimate support |
| `water temperature / tunnel flow` | none directly | hydrologic response context | `station` or `slope` | covariate | useful for lag features and explanation |
| `soil pressure / rock-soil stress` | none directly | mechanistic context | `station` or `slope` | context or advanced covariate | add only after the core displacement adapter is stable |
| `Luoyugou joined field experiment` | displacement | rainfall, water level, pore-water pressure | `slope` | challenger | clean loess-region joined experiment for short-window sample factory |
| `Zhamunongba` | no direct displacement label confirmed yet | rainfall, soil temperature, pore-water pressure, water content, water potential, vibration | `slope` | hold or challenger-only | wait for direct label semantics before promotion |
| `Yan'an infiltration monitoring` | none directly | infiltration and hydrologic evolution | `region` or `slope` | context only | use for `hydroclimateContext` templates in loess regions |
| `Luoyugou ERT` | none directly | resistivity-style geophysical context | `slope` | side covariate only | interpretation side branch only |

#### Badong And Loess Implementation Rule

- first primary label for the Badong cluster:
  - displacement only
- do not mix:
  - settlement
  - crack change
  - stress
  into the first-pass primary label definition
- default first covariate join order:
  1. rainfall
  2. groundwater depth and temperature
  3. water temperature or tunnel flow
  4. stress or pressure context
- default scope rule:
  - use `station` for stable sensor-position series
  - use `slope` for field-experiment aggregates such as `Luoyugou`
- phase-1 role split:
  - `Badong-Huangtupo`
    - primary
  - `Luoyugou`
    - challenger
  - `Zhamunongba`
    - hold until label semantics are confirmed
  - `Yan'an infiltration`
    - context only
  - `Luoyugou ERT`
    - side covariate only

#### Badong And Loess Detailed Source Registration

| Source | Registration type | Access mode | Typical cadence | Format | Implementation role | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| `Huangtupo surface displacement 2018-2019` | main label | request-style plus web or FTP flow | hourly | `csv` | phase-1 primary backfill and cross-sensor alignment | short but useful for warm start and sensor alignment |
| `Huangtupo 3D Beidou displacement 2018-2025` | main label | direct-download style page plus FTP or web flow | hourly | `csv` | phase-1 primary | strongest long-window Badong label source |
| `cave slip-belt displacement 2017-2025` | main label | direct-download style page plus FTP or web flow | hourly | `csv` | phase-1 primary | closest to internal sliding-mechanism behavior |
| `cave rainfall 2017-2025` | covariate | request or direct-download style page depending on page flow | hourly | `csv` | phase-1 primary covariate | should be the first hydroclimate join |
| `tunnel flow 2017-2025` | covariate | direct-download style page plus FTP or web flow | minute-level raw, aggregate as needed | `csv` | phase-1 primary covariate | strong hydrologic-response signal |
| `slip-belt temperature and water content` | covariate | direct-download style page plus FTP or web flow | hourly | `csv` | phase-1 primary covariate | use for moisture-state support; validate page-level time metadata on download |
| `groundwater depth and temperature` | covariate | page flow listed from related Badong registrations | likely hourly or daily depending on file | expected structured table | phase-1 primary covariate when retrieved | high-value groundwater support |
| `tunnel settlement 2017-2025` | auxiliary label or covariate | direct-download style page plus FTP or web flow | minute-level raw | `csv` | challenger | keep outside the first unified displacement label |
| `water temperature` | covariate | direct-download style page plus FTP or web flow | hourly | `csv` | challenger | useful for mechanism interpretation |
| `bank deformation 2023-2025` | local label | request-style plus web or FTP flow | minute-level raw | `csv` | local challenger | suitable for bank sub-expert rather than first general expert |
| `bank cracks 2023-2025` | local label | request-style plus web or FTP flow | minute-level raw | `csv` | local challenger | better for replay or local takeover than for first general expert |
| `soil pressure 2023` | covariate | request-style plus web or FTP flow | minute-level raw | `excel` | challenger | short-window mechanistic covariate |
| `rock-soil stress 2022-2023` | covariate | request-style plus web or FTP flow | minute-level raw | `csv` | challenger | short-window mechanistic covariate |
| `Luoyugou displacement` | main label | request-style plus web or FTP flow | event-window scale | `excel` | loess challenger | primary loess displacement source |
| `Luoyugou rainfall / water level / pore-water pressure` | covariate pack | request-style plus web or FTP flow | event-window scale | structured tables | loess challenger | should be joined as one pack, not as isolated tables |
| `Yan'an infiltration monitoring` | context | direct download style page | second-level raw | `txt` | context only | hydrologic-context source only |
| `Zhamunongba observation data` | context | request-style page | daily in current public summary | `excel` | context only | no direct phase-1 supervision label confirmed |
| `Luoyugou ERT` | side covariate | login or gated access flow | campaign-style | structured table | side branch only | geophysical interpretation source |

#### Badong And Loess Quality Gates

- keep `Huangtupo 3D Beidou displacement` and `cave slip-belt displacement` as separate raw tables until their coordinate frames and sensor-point continuity are confirmed
- when a page exposes both short-window and long-window sources, prefer the long-window source as the primary label source and use the short-window source for alignment or challenger work
- any minute-level source must keep the native cadence in `rawRef` and explicitly record resampling before the canonical `6h / 24h / 72h` windows are derived
- if a page-level date range conflicts with the title-level date range:
  - keep both in `rawRef`
  - treat the file content as authoritative after download
- do not promote `Zhamunongba` above `context only` until a direct displacement or comparable supervised label is confirmed

#### Badong-Huangtupo File-Family Mapping v0

| File family | Likely raw column family | Canonical destination | Join / identity rule | Adapter action | Validation rule |
| --- | --- | --- | --- | --- | --- |
| `3D Beidou displacement tables` | `obs_time`, `point_id`, `dx`, `dy`, `dz`, projected displacement columns | `metricsNormalized.beidouDispX`, `metricsNormalized.beidouDispY`, `metricsNormalized.beidouDispZ`, optional scalar `displacementMagnitudeMm`, `displacementLabel` | require stable `stationCode` or `point_id`; keep coordinate frame in `rawRef` | preserve full 3D coordinates first; derive scalar magnitude only as an additional feature | one coordinate frame per file; point continuity must be explicit across batches |
| `cave slip-belt displacement tables` | `obs_time`, `sensor_id`, `displacement_mm` | `metricsNormalized.slipBeltDisplacementMm`, local `displacementLabel` | join on `stationCode + sensor_id + eventTs` when sensor continuity is stable; else `slopeCode + sensor_id + eventTs` | keep separate from Beidou raw series until alignment is proven | sensor IDs must be stable; no implicit alignment to surface or Beidou coordinates |
| `surface displacement 2018-2019 tables` | `obs_time`, `point_id`, `displacement_mm`, cumulative or incremental displacement columns | `metricsNormalized.surfaceDisplacementMm`, auxiliary `displacementLabel` | join on `stationCode + eventTs` | use for warm start, backfill, and cross-sensor alignment rather than the long-window default label source | do not let the short window silently override the longer Beidou or slip-belt label line |
| `cave rainfall tables` | `obs_time`, `rainfall_mm`, `gauge_id` | `metricsNormalized.rainfallCurrentMm`, `hydroclimateContext.antecedentRainfall` | join on local gauge first; keep gauge identity in `rawRef` when only slope-level is known | derive rainfall windows before any displacement join | rainfall must be non-negative; gaps and gauge switches must be flagged |
| `tunnel flow tables` | `obs_time`, `flow_rate`, `flow_total`, channel or tunnel identifiers | `metricsNormalized.tunnelFlowRate`, `hydroclimateContext.flowResponse` | join on the tunnel or channel key plus `eventTs` | preserve minute-level cadence in `rawRef`; aggregate only into canonical windows | units must be explicit; negative flow values require source-level explanation |
| `temperature / water-content tables` | `obs_time`, `temperature_c`, `water_content_pct`, sensor_position | `metricsNormalized.soilTemperatureC`, `metricsNormalized.soilWaterContentPct`, `hydroclimateContext.moistureState` | join on stable sensor-position identity | keep moisture-state variables as first-wave covariates, not labels | percent or volumetric semantics must stay explicit; sensor-position drift must be flagged |
| `groundwater / water-temperature tables` | `obs_time`, `groundwater_level_m`, `groundwater_depth_m`, `water_temperature_c` | `hydroclimateContext.groundwaterState`, `hydroclimateContext.waterTemperatureC` | join on well or sensor-position ID plus `eventTs` | normalize `level` versus `depth` semantics; keep the original convention in `sourceFieldMap` | do not mix `level` and `depth` files without an explicit conversion note |
| `tunnel settlement tables` | `obs_time`, `point_id`, `settlement_mm` | `metricsNormalized.tunnelSettlementMm`, auxiliary task label only | join on `stationCode + point_id + eventTs` | keep outside the first unified displacement target | settlement must not be merged into the main displacement label without a separate task policy |
| `bank deformation / bank crack tables` | `obs_time`, `bank_id`, `deformation_mm`, `crack_width_mm` | `metricsNormalized.bankDeformationMm`, `metricsNormalized.bankCrackWidthMm`, local challenger labels | join on `slopeCode + bank_id + eventTs` | register as local sub-expert sources, not the general Badong phase-1 expert | bank IDs and bank-body continuity must be stable before promotion |
| `soil pressure / rock-soil stress tables` | `obs_time`, `sensor_id`, `pressure_kpa`, `stress_kpa` | `context.mechanisticCovariates`, optional advanced canonical metrics later | join on `stationCode + sensor_id + eventTs` | keep as advanced covariates only after the core adapter is stable | units and sensor axes must be explicit; short-window files stay challenger-only in phase 1 |

### Starter C: Baijiabao 2017-2024

- source family:
  - `Baijiabao observation dataset`
- recommended `scopeType`:
  - `slope`
  - upgrade to `station` if point IDs are stable inside files
- canonical anchors:
  - `regionCode`
    - Three Gorges partition
  - `slopeCode`
    - Baijiabao
- `metricsNormalized`
  - GNSS displacement
  - crack displacement
  - reservoir water level
  - rainfall
- primary label path:
  - `displacementLabel`
- output:
  - Three Gorges family challenger or extension

### Starter D: Huangniba Dengkan 8-Year Series

- source family:
  - `Huangniba Dengkan 8-year series`
- recommended `scopeType`:
  - `slope` by default
- canonical anchors:
  - `regionCode`
    - Three Gorges partition
  - `slopeCode`
    - Huangniba-Dengkan
- `metricsNormalized`
  - horizontal displacement
  - rainfall
  - reservoir water level
- primary label path:
  - `displacementLabel`
- output:
  - baseline challenger and fast forecasting benchmark source

### Starter E: Luoyugou Joined Field Experiment

- source family:
  - `Luoyugou joined field experiment`
- recommended `scopeType`:
  - `slope`
- canonical anchors:
  - `regionCode`
    - Tianshui-Luoyugou loess partition
  - `slopeCode`
    - Luoyugou field-experiment body
- `metricsNormalized`
  - displacement
  - rainfall
  - water level
  - pore-water pressure
- `hydroclimateContext`
  - short-window antecedent rainfall
  - hydrologic response lag
- primary label path:
  - `displacementLabel`
- output:
  - short-window challenger and joined-sample-factory source

#### Baijiabao / Huangniba / Luoyugou File-Family Mapping v0

| Source file family | Likely raw column family | Canonical destination | Phase-1 role | Validation rule |
| --- | --- | --- | --- | --- |
| `Baijiabao GNSS displacement tables` | `obs_time`, `point_id`, `displacement_mm` | `metricsNormalized.gnssDisplacementMm`, `displacementLabel` | Three Gorges challenger or extension | confirm whether point IDs are stable enough to promote from `slope` to `station` scope |
| `Baijiabao crack tables` | `obs_time`, `crack_id`, `crack_width_mm`, `crack_displacement_mm` | `metricsNormalized.crackDisplacementMm`, auxiliary local label | Three Gorges auxiliary task | keep crack and GNSS label paths separate in phase 1 |
| `Baijiabao rainfall / reservoir tables` | `obs_time`, `rainfall_mm`, `reservoir_level_m` | `metricsNormalized.rainfallCurrentMm`, `metricsNormalized.reservoirLevelM`, `hydroclimateContext` | Three Gorges extension covariates | preserve gauge or reservoir source identifiers when not point-local |
| `Huangniba Dengkan multivariate series` | `obs_time`, `horizontal_displacement_mm`, `rainfall_mm`, `reservoir_level_m` | `metricsNormalized.horizontalDisplacementMm`, `metricsNormalized.rainfallCurrentMm`, `metricsNormalized.reservoirLevelM`, `displacementLabel` | baseline challenger | one raw file must not silently mix cumulative and incremental displacement semantics |
| `Luoyugou displacement tables` | `obs_time`, `displacement_mm`, field-experiment point or body identifiers | `metricsNormalized.surfaceDisplacementMm`, `displacementLabel` | loess challenger main label | preserve event-window cadence and raw experiment identifiers |
| `Luoyugou rainfall / water-level / pore-pressure pack` | `obs_time`, `rainfall_mm`, `water_level_m`, `pore_pressure_kpa` | `metricsNormalized.rainfallCurrentMm`, `metricsNormalized.waterLevelM`, `metricsNormalized.porePressureKpa`, `hydroclimateContext` | loess joined-sample factory | join the pack as one synchronized bundle rather than three isolated covariates |
| `Yan'an infiltration tables` | `obs_time`, infiltration or moisture-response variables | `hydroclimateContext`, optional `RegionProfile.hydrologicProxySet` | context only | do not fabricate `displacementLabel` from infiltration-only files |
| `Zhamunongba context tables` | `obs_time`, rainfall, soil temperature, pore-water pressure, water content, water potential, vibration | `hydroclimateContext`, `context`, optional future `RegionProfile.hydrologicProxySet` | hold or context only | no promotion above `context only` until a direct supervised label is confirmed |

Baijiabao verified phase-1 join note:

- `rainfall`
  - current verified reusable join mode:
    - shared `station+slope+eventTs`
  - current verified backward lag tolerance:
    - `1d`
- `reservoir`
  - current verified reusable join mode:
    - shared `slopeCode+eventTs`
  - current verified backward lag tolerance:
    - `7d`
- `crack`
  - still has only `crack_id`, not a verified `point_id <-> crack_id` mapping
  - monitoring also stops years earlier than the `2017-2024` GNSS line
  - therefore it should stay:
    - `optional auxiliary`
    - or a later derived aggregate / challenger feature
  - it should not be promoted into the current long-horizon phase-1 `requiredFeatureKeys`

### Starter F: Event Inventory Adapter Pack

- source family:
  - `China 2008-2024 catalogue`
  - `Beijing 2023`
  - `Zixing 2024`
  - `Fuling 2019`
  - `Wanzhou`
  - `Wenchuan`
  - `Weihe Basin`
  - `Gansu points`
  - `Yellow River Basin geological disaster data`
- recommended `scopeType`:
  - `region` or `slope`
- canonical anchors:
  - `regionCode`
    - normalize from province / basin / event region
  - `slopeCode`
    - use stable body IDs only when the source truly has them
- `eventTs`
  - use event date or event timestamp
- `context`
  - inventory geometry
  - topography or factor tables when present
  - trigger summaries when present
- primary label path:
  - `warningHitLabel`
    - true for joined event windows after rainfall or monitoring alignment
- output:
  - `event_inventory_adapter`
  - cold-start priors
  - `Static Match`
  - replay event truth

#### Event Inventory Source-Group Mapping

| Source group | Truth role | Profile role | Recommended scope | Must join before mainline training | Phase-1 placement |
| --- | --- | --- | --- | --- | --- |
| `China 2008-2024 catalogue` | national event truth | region onboarding prior | `event` first, aggregate to `region` | rainfall windows, region codes, terrain factors, negative windows | `prior + Static Match + light replay` |
| `Beijing 2023` | event truth | event-region prior | `event` | continuous rainfall or radar-rainfall windows, negative slopes or non-event windows | `replay` |
| `Zixing 2024` | event truth | event-region prior | `event` | continuous rainfall windows, static factors, negative windows | `replay` |
| `Fuling 2019` | event truth | local prior | `event` | rainfall windows, terrain factors, negative windows | `replay` |
| `Wanzhou 1950-2020 + 18 factors` | weak event truth unless time-sliced carefully | strong region profile | `region` and `slope` | time slicing, rainfall or monitoring alignment, negative windows | `Static Match + prior` |
| `Wenchuan multi-temporal` | multi-period event truth | post-event regional prior | `event` and `region` | temporal alignment, earthquake-recovery-stage covariates, negative windows | `replay + prior` |
| `Weihe Basin points` | point truth after cleaning | basin profile | `event` then aggregate to `region` | rainfall windows, basin partition, terrain factors, negative windows | `Static Match + prior` |
| `Gansu points` | point truth after cleaning | province profile | `event` then aggregate to `region` | rainfall windows, province partition, terrain factors, negative windows | `Static Match + prior` |
| `Yellow River Basin geological disaster data` | weak event truth | broad regional profile | `region` | finer event timing and spatial localization if used beyond prior | `prior` |
| `Zhushan susceptibility GIS data` | not event truth | strong profile template | `region` | real events or monitoring plus negative windows | `prior + Static Match template` |

#### Event Inventory Implementation Rule

- split raw event or inventory fields into two destinations:
  - `event truth`
    - event timestamp
    - geometry
    - trigger summary
    - source event identifier
  - `region profile`
    - topography
    - lithology
    - land use
    - basin or province partition
    - susceptibility factors
- no event or inventory source enters `CanonicalTrainingSample` by itself
- required joins before mainline training:
  1. align event geometry to:
    - region
    - slope
    - or station business anchors
  2. attach rainfall or monitoring windows around `eventTs`
  3. attach static factors where missing
  4. construct explicit non-event windows or negative samples
- default negative-sample rule:
  - build negatives from:
    - same region and same season without recorded event
    - nearby slope units without event in the same rainfall episode
    - temporally shifted non-event windows outside the event impact span

#### Event Inventory Adapter Mapping v0

| Raw field family | Canonical destination | Join stage | Output role | Validation rule |
| --- | --- | --- | --- | --- |
| `source event id / title / report id` | `sourceRecordKey`, `rawRef.originalEventId`, `rawRef.title` | raw registration | dedup, lineage, cross-source merge | original event identifiers must never be dropped after cross-source dedup |
| `event date / event timestamp / reported time precision` | `eventTs`, `rawRef.timePrecision` | event truth build | replay anchor, rainfall join anchor | if time precision is only `date`, carry a precision flag and do not pretend to have hour-level truth |
| `longitude / latitude / point / polygon / bounding box` | `rawRef.geometry`, candidate `RegionProfile.latitude/longitude` after aggregation | geometry normalization | event truth, spatial join, profile lookup | geometry CRS must be explicit; do not degrade polygon sources to a point without keeping the polygon |
| `province / city / county / basin / region name` | `regionCode`, `context.adminHierarchy`, `RegionProfile.provinceCode/cityCode/areaCode` after builder stage | business-anchor normalization | `prior`, `Static Match`, replay filtering | business region normalization must preserve the original names and codes in `rawRef` |
| `trigger summary / rainfall notes / earthquake notes` | `context.triggerSummary`, candidate joined `warningHitLabel` only after rainfall or monitoring alignment | post-join | trigger-aware routing and replay explanation | trigger text must not become `warningHitLabel` without an explicit label policy |
| `landslide type / scale / area / volume / casualties` | `context.eventMorphology`, `context.lossSummary` | event enrichment | match features, replay explanation | units and categorical vocabularies must be normalized explicitly |
| `slope-unit id / susceptibility factors / terrain-factor tables` | `RegionProfile` candidate fields, `context.staticFactors` | profile build and static join | `Static Match`, prior, region profile | factor tables do not enter `CanonicalTrainingSample` until they are aligned to region or slope anchors |
| `inventory-only raster / polygon attachments` | `rawRef.attachments`, optional remote-sensing branch inputs | side branch or profile build | inventory refinement, replay evidence | raster and vector attachments must keep file lineage and projection metadata |
| `negative-window definitions` | derived outside raw source; stored in sample-factory lineage | joined sample factory | supervised training only after joins | negatives must be reproducible from rules, not handwaved in adapter output |

#### Event Inventory Detailed Registration

| Source | Primary placement | Scope | Hard joins before training use | Access or license boundary | Implementation note |
| --- | --- | --- | --- | --- | --- |
| `China 2008-2024 catalogue` | `prior`, then `Static Match`, then light replay | event first, aggregate to region | rainfall windows, region coding, terrain factors, negative windows | figshare data item is directly downloadable; keep dataset license separate from article license | backbone national prior source |
| `Global landslide points and areas (China filtered)` | `prior` and secondary `Static Match` | event first, aggregate to region | China filter, dedup against China-local catalogues, rainfall windows, terrain factors, negative windows | page is public but file retrieval has login or service-flow boundary | use only where no stronger China-local source exists |
| `Weihe Basin points` | `Static Match`, then `prior` | event and region | basin partition, rainfall windows, terrain factors, negative windows | login or service-flow retrieval on NCDC | basin-level regionalization source |
| `Gansu points` | `Static Match`, then `prior` | event and region | province partition, rainfall windows, terrain factors, negative windows | login or service-flow retrieval on NCDC | province-level regionalization source |
| `Yellow River Basin geological disaster data` | `prior` | region | finer event timing and location if used beyond profile | login or service-flow retrieval on NCDC | broad hazard background layer only |
| `Beijing 2023` | `replay`, then `prior` | event | continuous rainfall or radar rainfall, negative slopes or non-event windows | direct download style figshare dataset | best current event-level replay pack |
| `Zixing 2024` | `replay`, then `prior` | event | rainfall windows, static factors, negative windows | confirm final open mirror before automated ingestion | keep source mirror explicit in lineage |
| `Fuling 2019` | `replay` | event | rainfall windows, terrain factors, negative windows | direct-download Mendeley Data item | southwest rainfall-triggered replay case |
| `Wanzhou 1950-2020 + 18 factors` | `Static Match`, then `prior` | region and slope | fine-grained timing, rainfall or monitoring alignment, negative windows | direct-download Mendeley Data item | strong region-profile source rather than direct event-window source |
| `Wenchuan multi-temporal` | `replay`, then `prior` | event and region | recovery-stage covariates, temporal alignment, negative windows | open Zenodo record | keep earthquake-recovery stage explicit |
| `Zhushan susceptibility GIS data` | `prior` and `Static Match` template | region | real events or monitoring plus negative windows | open Zenodo record | use as feature-template source, not as event truth |

#### Event Inventory Quality Gates

- any source without explicit event time precision finer than date must carry a time-precision flag in `rawRef`
- do not create `stationCode` from point inventories that lack true monitoring-point semantics
- for multi-hazard libraries, filter to landslide-relevant records before they enter any landslide-specific matching path
- all replay packs must explicitly define:
  - event window
  - pre-event window
  - exclusion buffer
  - non-event comparison windows
- when combining multiple China catalogues:
  - keep original source event IDs
  - keep a cross-source dedup key
  - never collapse records without preserving lineage

#### Region Profile Builder Mapping v0

| Source family | Candidate raw fields | `RegionProfile` target | Build rule | Validation rule |
| --- | --- | --- | --- | --- |
| `monitoring-site metadata` | site name, slope name, monitoring-point name, local IDs | `regionCode`, `slopeCode`, `stationCode`, `sourceRegionKeys` | normalize business anchors first; keep source names and IDs in `sourceRegionKeys` | do not invent `stationCode` for sources that only describe a slope or event region |
| `coordinates and elevation` | longitude, latitude, elevation, reference point metadata | `longitude`, `latitude`, `elevationM` | keep representative coordinates plus reference-point notes in lineage | CRS and datum must be explicit; representative points must not replace richer geometry stored elsewhere |
| `topography / morphology factors` | slope angle, aspect, curvature, relief, terrain class | `slopeAngleDeg`, `slopeAspectDeg`, `terrainClass` | aggregate or select the representative factor scale per region or slope | factor scale and derivation source must be recorded in `qualityFlags` or lineage |
| `lithology / geology / soil factors` | lithology class, geology group, soil class, structure type | `lithology`, `geologyType`, `soilType`, `structureType` | map into stable controlled vocabularies while retaining source labels | source labels must remain recoverable for later recoding |
| `land cover / land use factors` | land-cover class, vegetation, anthropogenic-use class | `properties.staticFactors.landCover` | build one stable land-cover prior bundle per profile version, including dominant class and coverage ratios | if multiple years exist, keep the profile date or source year explicit |
| `rainfall climatology and seasonality` | annual rainfall, monthly rainfall, rainy-season month, antecedent-rainfall thresholds | `annualRainfallMm`, `rainfallRegime`, `seasonalityClass`, `antecedentRainfallSensitivity` | use climatology or long-window rainfall products such as CHM_PRE-style joins as profile descriptors | climatology sources must be versioned; do not confuse event rainfall with climate descriptors |
| `sensor inventory and cadence` | sensor family list, sampling interval, report interval, data completeness | `sensorSchema`, `requiredSensors`, `optionalSensors`, `samplingProfile`, `reportingProfile` | derive the profile from actually available sensors, not only advertised sensors | profile eligibility must fail closed when required sensors are missing |
| `hydrologic proxy availability` | groundwater, pore pressure, soil water content, infiltration, vibration availability | `hydrologicProxySet` | register availability and rough cadence, not full raw series | hydrologic proxies belong to profile capability, not runtime payload by default |
| `dataset lineage and access flags` | dataset name, access mode, license, time span, quality notes | `sourceDatasets`, `qualityFlags` | keep every profile claim traceable to one or more source datasets | access and license boundaries must remain attached to the profile lineage |

## Worker Payload Extension Table

This table describes the minimum payload growth needed to move from heuristic output to routed regional experts without breaking the existing outer contract.

| Field | Producer | Purpose | Phase 1 status |
| --- | --- | --- | --- |
| `source` | worker | retain current source summary | keep |
| `windowSummary` | `FeatureBuilder` | summarize runtime windows used for inference | add |
| `matchedModelKey` | `ModelMatcher` | selected expert identity | add |
| `matchedModelVersion` | `ModelMatcher` | selected expert version | add |
| `matchedScopeType` | `ModelMatcher` | whether match is `region / slope / station / global` | add |
| `matchedScopeKey` | `ModelMatcher` | matched business scope key | add |
| `matchScore` | `ModelMatcher` | final rank score | add |
| `fallbackReason` | `InferenceRunner` | explain heuristic/global fallback | add |
| `featureSummary` | `FeatureBuilder` | lightweight feature subset for audit | add |
| `warningFactors` | `InferenceRunner` | explain factors for risk decision | add |
| `traceRefs` | worker | link back to sample lineage, profile, and artifact refs | add |

Phase 1 payload rule:

- prefer summaries and references over full raw feature dumps
- keep payload human-auditable and replay-friendly
- do not duplicate the full raw telemetry body if it already exists elsewhere in storage

## Phase-1 Repo Implementation Seams v0

### Offline Data And Sample Factory Layout

| Concern | Suggested path | Why here | Boundary rule |
| --- | --- | --- | --- |
| core contracts and reusable logic | `libs/regional-model-library/src/contracts/` | align with current `libs/*` role for reusable code | do not bury canonical contracts inside one service |
| monitoring adapters | `libs/regional-model-library/src/adapters/ts_station_multivariate_adapter/` | keep `ThreeGorges / Badong-Huangtupo / Baijiabao / Huangniba / Luoyugou` adapters reusable across training and replay | adapter logic normalizes source data; it does not publish runtime events |
| event adapters | `libs/regional-model-library/src/adapters/event_inventory_adapter/` | keep catalogue and event replay logic separated from station time series | event libraries must stay join-first, not direct online expert truth |
| profile builders | `libs/regional-model-library/src/builders/region_profile_builder/` | centralize static-factor and business-anchor construction | builder emits `RegionProfile`; it does not invent telemetry machine IDs |
| sample factory | `libs/regional-model-library/src/sample-factory/` | isolate window slicing, label policy, join logic, and jsonl emission | keep source mapping separate from label policy |
| quality gates | `libs/regional-model-library/src/quality-gates/` | make adapter rules executable and replayable | every gate must produce explicit reportable failures |
| pack configuration | `libs/regional-model-library/src/packs/china/<pack>/` | version file-family mapping and build rules in code-reviewed configs | do not scatter mapping rules only in CLI flags |
| controlled CLI entry | `scripts/dev/regional-model-library/*.ts` and `scripts/dev/run-regional-model-library-phase1.ps1` | follow current `scripts/dev` controlled-entry style | keep offline ingestion behind scripts, not service startup |
| raw data and intermediate outputs | `.tmp/regional-model-library/raw/`, `.tmp/regional-model-library/out/canonical/`, `.tmp/regional-model-library/out/samples/`, `.tmp/regional-model-library/out/reports/` | matches current ignored workspace pattern | do not place external raw data under `artifacts/desk-win/latest/` or runtime service directories |

### Online Worker Pipeline Layout

| Module | Suggested file path | Dependency direction | Phase-1 role |
| --- | --- | --- | --- |
| pipeline orchestrator | `services/ai-prediction-worker/src/pipeline/predict-pipeline.ts` | `index.ts -> predict-pipeline.ts -> resolver/builder/matcher/runner` | keep message handler thin and testable |
| region and business identity resolver | `services/ai-prediction-worker/src/pipeline/region-profile-resolver.ts` | `predict-pipeline.ts -> region-profile-resolver.ts -> pg` | extend current `device_id -> station_id` resolution to business keys and metadata |
| feature builder | `services/ai-prediction-worker/src/pipeline/feature-builder.ts` | `predict-pipeline.ts -> feature-builder.ts` | isolate runtime feature-space construction from raw telemetry key names |
| artifact registry and loader | `services/ai-prediction-worker/src/pipeline/artifacts/artifact-registry.ts` | `index.ts -> artifact-registry.ts`, `model-matcher.ts -> artifact-registry.ts` | startup-time registry load and in-memory candidate access |
| model matcher | `services/ai-prediction-worker/src/pipeline/model-matcher.ts` | `predict-pipeline.ts -> model-matcher.ts -> artifact-registry.ts` | select `station -> slope -> region -> global` candidates and emit trace |
| inference runner | `services/ai-prediction-worker/src/pipeline/inference-runner.ts` | `predict-pipeline.ts -> inference-runner.ts` | run supported artifact types and normalize score output |
| fallback heuristic | `services/ai-prediction-worker/src/pipeline/fallback-heuristic.ts` | `inference-runner.ts -> fallback-heuristic.ts` | preserve current heuristic as the final safe path |

Worker split rule:

- keep `services/ai-prediction-worker/src/index.ts` responsible only for:
  - Kafka consume
  - JSON parse and schema validation
  - prediction-pipeline invocation
  - event assembly
  - PostgreSQL insert
  - Kafka produce
- keep artifact IO and routing state out of the Kafka handler body
- keep runtime-compatible feature summaries in payload, not full foreign source schemas

### Phase-1 Worker Call Order

1. parse and validate `telemetry.raw.v1`
2. resolve `device_id -> station_id + business anchors + metadata-derived region context`
3. build `FeatureVector` from runtime telemetry plus optional resolved profile context
4. load candidate artifacts from registry and run `station -> slope -> region -> global` match
5. execute supported artifact type or fall back to heuristic when missing, invalid, or unsupported
6. extend `payload` with:
  - `windowSummary`
  - `featureSummary`
  - `matchedModelKey`
  - `matchedModelVersion`
  - `matchedScopeType`
  - `matchedScopeKey`
  - `matchScore`
  - `fallbackReason`
  - `traceRefs`
7. keep current top-level `ai.predictions.v1` contract stable and rely on `payload` for expansion

## Notes

- `device_id` is machine identity and stays in runtime/platform data.
- public datasets without real device context must not invent `device_id`.
- use `regionCode / slopeCode / stationCode` as business continuity anchors when possible.
- `station_id` remains a platform entity identifier and should not replace `stationCode`.
- source-specific fields belong in `rawRef` or `sourceFieldMap`, not in the runtime payload by default.
- current repo alignment rule:
  - `stationCode` should align to the current long-lived fixed-point business code surface, not to `device_id`
  - the current repo resolves `stationCode` from the station-code surface first, then from metadata fallbacks when needed
  - `regionCode / slopeCode / nodeCode / gatewayCode` should align to the business hierarchy already defined in the repo standards and metadata flow
  - the current repo carries `regionCode / slopeCode / nodeCode / gatewayCode` mainly through station or device metadata plus server-side derivation and validation
  - `station_id` is still useful for internal joins in the current software stack, but it is not the external dataset continuity key
- near-term implementation rule for external adapters:
  - if a source has a stable fixed monitoring point, map it to `stationCode`
  - if a source only has a stable landslide body or slope body, map it to `slopeCode`
  - if a source is only region or event scoped, map it to `regionCode` and keep finer source detail in `rawRef`
- runtime payload rule:
  - keep routing trace and feature summaries only
  - do not mirror full foreign source schemas into `RuntimePredictionPayload`

## 2026-04-21 Intake Gate Semantics Update

- the phase-1 preflight between `seed-intake-manifests` and `phase1-run` is now explicitly:
  - generate manifest
  - land raw files manually/browser-first
  - run `validate-intake-landing.ts`
  - only then continue into normalization/build
- intake validation semantics are now split by stage:
  - `source-landing`
    - validate source/original/unpacked discipline
    - validate archive subpaths and raw landing path hints
    - validate source-family presence before normalization
  - `family-split`
    - validate normalized family outputs independently
    - surface schema/header matches and semantic ambiguity warnings
- validator report shape is now intended to be operational, not advisory-only:
  - `status`
  - `landingState`
  - `layoutChecks`
  - `sourceArtifactChecks`
  - `familyChecks`
  - `nextActions`
- intake family validation now recognizes non-tabular source artifacts when needed:
  - directories such as `.gdb` can satisfy raw landing presence for static-prior packs
- header probing boundary remains intentionally shallow:
  - read only first-row headers from `xlsx/xls/csv/json`
  - do not parse full payload tables during intake validation
- current CHM_PRE contract is now effectively fixed as:
  - `original/*` stays untouched national raw backbone
  - `raw-index.json` inventories raw raster artifacts
  - `by-event.jobs.json` and `by-region.jobs.json` describe extraction intent
  - later extractor should consume those artifacts without forcing CHM_PRE into the existing `phase1-run.ts` task enum

## 2026-04-22 CHM_PRE Extractor Boundary Update

- first executable extractor boundary now exists at:
  - `scripts/dev/regional-model-library/extract-chm-pre-v2.ts`
- current extracted csv hard constraints remain:
  - raw backbone stays under:
    - `original/daily-netcdf`
    - `original/monthly-total`
    - `original/annual-total`
  - extracted outputs stay under:
    - `extracts/by-event/*.csv`
    - `extracts/by-region/*.csv`
  - do not flatten the whole national raster archive into one table
- current minimum extracted rainfall fields that must remain recoverable:
  - `event_ts`
  - `grid_id`
  - `lon`
  - `lat`
  - `rainfall_mm`
  - `source_version`
- provenance minimum remains aligned to existing schema language:
  - `sourceDataset`
  - `sourceRecordKey`
  - `rawRef`
  - extractor-specific report should also be able to point back to:
    - `raw-index.json`
    - `by-event.jobs.json`
    - `by-region.jobs.json`
- current backend rule is explicit:
  - local `gdal-cli` boundary only
  - no online Python service
  - no in-repo JS raster parser
- current machine fact as of `2026-04-22`:
  - `gdalinfo`
  - `gdal_translate`
  - `gdallocationinfo`
  were not found on `PATH`

## 2026-04-22 Linear Risk Artifact Contract Update

- the first shared trainable artifact contract is now explicit:
  - `linear-risk-model.v1`
  - file:
    - `libs/regional-model-library/src/contracts/linear-risk-model-artifact.ts`
- current purpose:
  - bridge `CanonicalTrainingSample`
  - into a minimal routable worker artifact
  - without introducing a new online Python service
- current phase-1 artifact fields that should now be treated as fixed:
  - `modelKey`
  - `modelVersion`
  - `scopeType`
  - `scopeKey`
  - `artifactType`
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
- current worker-side meaning:
  - `requiredFeatureKeys`
    - features that must actually be observed at runtime
  - `featureNormalization`
    - min-max scaling rule used before inference
  - `featureCenters`
    - midpoint used to center normalized values
  - `bias + weights`
    - current `linear_risk_v1` scoring parameters
- current registry shape is now effectively:
  - `registry.json`
    - `artifacts: RegionalModelArtifact[]`
- runtime feature contract is now slightly stricter:
  - `FeatureVector` must carry:
    - `values`
    - `presentFeatureKeys`
    - `availableMetrics`
- important rule after this pass:
  - artifact-readiness must not be inferred from zero-filled derived features alone
  - runtime must distinguish:
    - feature key exists because it was observed
    - feature key exists only because missing values were backfilled with zero
- current offline trainer entrypoint that emits this contract:
  - `scripts/dev/regional-model-library/train-linear-risk-model.ts`
- current trainer emits:
  - one artifact json
  - one `registry.json`
  - one `training-report.json`
- current trainer mode is intentionally conservative:
  - `difference-of-means-logit-baseline`
  - use it as the phase-1 bridge, not the long-term final expert-training method

## 2026-04-22 Replay Evaluation And Runtime Feature Alignment Update

- the first minimal replay-evaluation contract now exists at:
  - `scripts/dev/regional-model-library/evaluate-linear-risk-model.ts`
- current replay-evaluation input contract:
  - `CanonicalTrainingSample` json/jsonl
  - one artifact json or one `registry.json`
- current replay-evaluation output contract:
  - one report json with:
    - `accuracy`
    - `precision`
    - `recall`
    - `f1`
    - `brier`
    - `auc`
    - confusion matrix
    - artifact usage
  - optional in-place writeback to top-level artifact metadata when using:
    - `--writeback-replay-metadata`
  - current canonical writeback shape is:
    - `artifact.metadata.replaySummary.updatedAt`
    - `artifact.metadata.replaySummary.sampleCount`
    - `artifact.metadata.replaySummary.accuracy`
    - `artifact.metadata.replaySummary.precision`
    - `artifact.metadata.replaySummary.recall`
    - `artifact.metadata.replaySummary.f1`
    - `artifact.metadata.replaySummary.brier`
    - `artifact.metadata.replaySummary.auc`
    - `artifact.metadata.replaySummary.primaryScore`
- current intended role:
  - first local replay gate after artifact training
  - not the final multi-model leaderboard layer
- current runtime feature bridge is now tighter:
  - `FeatureVector.values` should carry canonical feature keys, not only generic abs metrics
  - currently expected runtime-canonical keys include:
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
    - plus generic:
      - `displacement_abs_mm`
      - `tilt_abs_deg`
      - `vibration_abs_g`
- runtime availability semantics now require both:
  - `availableMetrics`
    - raw telemetry keys seen on the message
  - `presentFeatureKeys`
    - canonical feature keys that were actually materialized from real observations
- important boundary:
  - the worker is still `single-telemetry-v1`
  - this pass only narrows the canonical naming gap
  - true `6h / 24h / 72h` window history is still a later step

## 2026-04-22 Runtime Window Contract Update

- the worker runtime feature contract now effectively supports two sourcing modes:
  - `clickhouse+telemetry-v1`
  - `telemetry-only-v1`
- `FeatureVector.windowSummary` should now be treated as carrying:
  - `sourceMode`
  - `anchorTs`
  - `historySource`
  - `historyError`
  - `queryWindowHours`
  - `queryPointCount`
  - `requestedWindows`
  - `coverage`
  - `backfilledFeatureKeys`
- `FeatureVector.featureSummary` now effectively carries:
  - `backfilledFeatureKeys`
  - `displacementDelta24h`
  - `rainfallSum24h`
  - `rainfallSum72h`
  - `historyMode`
  - `historyError`
- current window-derived feature naming rule is now:
  - `<canonicalKey>_last_<Nh>`
  - `<canonicalKey>_delta_<Nh>`
  - `<canonicalKey>_mean_<Nh>`
  - `<canonicalKey>_min_<Nh>`
  - `<canonicalKey>_max_<Nh>`
  - rainfall additionally:
    - `rainfallCurrentMm_sum_<Nh>`
- important interpretation rule:
  - a base canonical feature can now be satisfied either:
    - directly from the current telemetry message
    - or by recent-history backfill from ClickHouse
  - any such backfill must remain visible through:
    - `backfilledFeatureKeys`

## 2026-04-22 Two-Stage Linear Artifact Contract Update

- the current shared trainable artifact contract now has two executable shapes:
  - `linear_risk_v1`
  - `two_stage_linear_risk_v1`
- `two_stage_linear_risk_v1` now fixes two stage blocks:
  - `stage1`
    - `stageKey`
      - `stage1_displacement`
    - `outputKey`
      - `stage1DisplacementScore`
    - `requiredFeatureKeys`
    - `featureNormalization`
    - `featureCenters`
    - `bias`
    - `weights`
    - `trainingSummary`
  - `stage2`
    - `stageKey`
      - `stage2_warning`
    - `outputKey`
      - `stage2WarningScore`
    - same parameter fields as stage 1
- top-level `requiredFeatureKeys` on a two-stage artifact should now be interpreted as:
  - runtime-observed base features only
  - not the internal stage-1 output key
- current runtime payload extension should now treat these fields as fixed enough:
  - `matchedArtifactType`
  - `requiredFeaturesSatisfied`
  - `missingFeatureKeys`
  - `stageOutputs.stage1`
  - `stageOutputs.stage2`
- current interpretation rule:
  - stage 1 is displacement/trend evidence
  - stage 2 is final warning scoring
  - stage 1 may still be emitted even when the runtime falls back before stage 2 completes

## 2026-04-22 Candidate-Set Match Trace Update

- the runtime match trace should now be treated as carrying:
  - `rerankMode`
  - `selectedReason`
  - `replayScore`
  - `candidateSet`
- current `candidateSet` trace fields are:
  - `modelKey`
  - `modelVersion`
  - `artifactType`
  - `scopeType`
  - `scopeKey`
  - `baseScopeScore`
  - `featureCoverage`
  - `trainingSampleCount`
  - `trainingDatasetCount`
  - `replayScore`
  - `rerankScore`
  - `totalScore`
  - `requiredFeatureCount`
  - `presentRequiredFeatureCount`
  - `missingFeatureKeys`
  - `selected`
- current rerank interpretation rule:
  - `base-only`
    - use scope priority + readiness + artifact strength only
  - `metadata-replay`
    - use the same base score and fuse in replay score carried by artifact metadata
- current canonical replay-score source for matcher is:
  - `artifact.metadata.replaySummary.primaryScore`
- `payload.matchTrace.replayScore` should be interpreted as:
  - the selected candidate's resolved runtime replay score
  - not the full replay report object
- current contract consequence:
  - later `FEV / TIME / local leaderboard` outputs do not need to rewrite the worker contract
  - they mainly need to write replay summary back into artifact metadata
