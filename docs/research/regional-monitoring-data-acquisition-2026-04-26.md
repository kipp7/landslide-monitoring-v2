# Regional Monitoring Data Acquisition Pass - 2026-04-26

## Purpose

This pass extends the regional expert model library beyond the current Baijiabao-only displacement model line by landing more official monitoring data for the Badong-Huangtupo / Three Gorges family.

The execution rule remains unchanged:

- keep source archives and extracted files under `.tmp/regional-model-library/raw/`
- keep derived normalized tables under `normalized/phase1-families/`
- do not force raw source columns into runtime payload fields
- map later through `raw landing aliases -> canonical training fields -> runtime payload summaries`

## Newly Landed Badong-Huangtupo Open-Access Packs

Raw downloads:

- `.tmp/regional-model-library/raw/Badong-Huangtupo/source/downloads/9249c3ce-d96a-40a2-b9b9-ec0b31bab32b.zip`
- `.tmp/regional-model-library/raw/Badong-Huangtupo/source/downloads/c6586768-6071-4fa6-805e-d4ef5c97d3dc.zip`
- `.tmp/regional-model-library/raw/Badong-Huangtupo/source/downloads/f79afeb9-8239-4e23-ac2a-c0c5e132a354.zip`
- `.tmp/regional-model-library/raw/Badong-Huangtupo/source/downloads/7a3f6751-d758-4639-9686-0b1da4ff3ed5.zip`

Extracted roots:

- `.tmp/regional-model-library/raw/Badong-Huangtupo/original/9249c3ce-d96a-40a2-b9b9-ec0b31bab32b/`
- `.tmp/regional-model-library/raw/Badong-Huangtupo/original/c6586768-6071-4fa6-805e-d4ef5c97d3dc/`
- `.tmp/regional-model-library/raw/Badong-Huangtupo/original/f79afeb9-8239-4e23-ac2a-c0c5e132a354/`
- `.tmp/regional-model-library/raw/Badong-Huangtupo/original/7a3f6751-d758-4639-9686-0b1da4ff3ed5/`

| NCDC metadata ID | Official title | Normalized family | Rows | Main reuse |
| --- | --- | --- | ---: | --- |
| `9249c3ce-d96a-40a2-b9b9-ec0b31bab32b` | 湖北巴东试验场地下孔隙水压力（2017-2024年） | `pore-pressure` | 17269 | hydrologic / pore-pressure covariate |
| `c6586768-6071-4fa6-805e-d4ef5c97d3dc` | 湖北巴东试验场洞内裂缝监测数据集（2017-2025年） | `cave-crack` | 11600 | crack / deformation auxiliary label or covariate |
| `f79afeb9-8239-4e23-ac2a-c0c5e132a354` | 湖北巴东试验场气象观测仪数据集（2018-2025年） | `weather-rainfall` | 3783 | local rainfall covariate, fallback until requested cave rainfall is granted |
| `7a3f6751-d758-4639-9686-0b1da4ff3ed5` | 湖北省巴东县黄土坡地下水埋深、温度数据集（2019-2024年） | `groundwater-depth` | 974 | groundwater covariate |
| `7a3f6751-d758-4639-9686-0b1da4ff3ed5` | 湖北省巴东县黄土坡地下水埋深、温度数据集（2019-2024年） | `groundwater-temperature` | 975 | groundwater temperature covariate |

Normalization script updated:

- `scripts/dev/regional-model-library/normalize-badong-huangtupo-open-pack.py`

Current normalized outputs:

- root: `.tmp/regional-model-library/raw/Badong-Huangtupo/normalized/phase1-families/`
- report: `.tmp/regional-model-library/raw/Badong-Huangtupo/normalized/phase1-families/badong-huangtupo-open-pack-normalization-report.json`
- total normalized family outputs: `12`
- total normalized rows: `144642`

## Existing Official Data Still Usable

### Three Gorges / Baijiabao

The usable Three Gorges monitoring package remains:

- NCDC ID: `3768727b-13b2-4675-8a00-2d661ec96229`
- title: `三峡库区白家包滑坡观测数据集（2017-2024年）`
- source zip: `.tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024/source/downloads/3768727b-13b2-4675-8a00-2d661ec96229.zip`

Normalized families:

- deformation: `7303`
- crack: `3489`
- rainfall: `2832`
- reservoir: `2832`

### Badong-Huangtupo

Before this pass, seven open-access Huangtupo packs were already landed and normalized:

- Beidou 3D displacement: `8397`
- fault-zone Beidou 3D displacement: `10985`
- cave slip-belt displacement: `32851`
- tunnel settlement: `11390`
- tunnel flow: `24796`
- slip-belt temperature / water content: `13220`
- cave-water temperature: `8402`

After this pass, all `11` currently confirmed Badong-Huangtupo open-access related metadata entries are downloaded, extracted, and normalized into `12` family outputs.

## Access-State Scan Results

Three Gorges station / organization scan:

- candidate UUIDs found from official NCDC pages: `81`
- `open-access`: `1`
- `login-access`: `29`
- `apply-access`: `35`
- `ERR / non-metadata / server error`: `16`
- conclusion: the only directly downloadable monitoring package in this scan is still Baijiabao; older station reports and station bundles require login or application.

Badong-Huangtupo related-page scan:

- related UUIDs found from official NCDC pages: `35`
- `open-access`: `11`
- `apply-access`: `15`
- `ERR / non-metadata / server error`: `9`
- conclusion: all open-access Badong-Huangtupo monitoring packages found in this pass have now been landed; the remaining important packs require formal application.

Critical application-gated packs probed by direct POST and confirmed `403` without permission:

- `f267a98f-a2f0-4db1-89db-2f9458473991` - 湖北巴东试验场洞口降雨量数据集（2017-2025年）
- `0c3020e1-d792-4dd1-a820-2dd48dfde62f` - 湖北巴东试验场黄土坡地表位移监测数据集（2018-2019年）
- `8b610f07-addf-478c-b288-18df4f205fd0` - 长江三峡库区秭归县白水河滑坡变形、降雨及库水位监测资料(2018年)
- `a5651f2a-bccc-4de4-aeb2-4db70bf76a2e` - 长江三峡库区秭归县八字门滑坡变形、降雨及库水位监测资料(2018年)
- `0aaf6e26-fce1-4d3b-a160-777827d94cd4` - 2017年长江三峡库区秭归县新滩滑坡变形、降雨及库水位监测资料

## Other-Region Status

Other-region monitoring sources remain useful but were not landed automatically in this pass:

- Luoyugou displacement / rainfall / water-level / pore-pressure entries are `apply-access`.
- Zhamunongba observation data is `apply-access`.
- Yan'an loess infiltration monitoring is `login-access`.
- Huangniba Dengkan Figshare data remains a useful manual-browser candidate; CLI download returned a Figshare `403` stub on this workstation, and the invalid local stub was removed.

## Modeling Implication

The Badong-Huangtupo cluster is now no longer only a displacement example. It has enough official covariate diversity to support region-pack onboarding, but the phase-1 product-aligned model should stay narrow:

- required family: displacement
- optional context families: weather rainfall, cave crack
- deferred from phase-1 required features: pore pressure, groundwater depth, groundwater temperature, tunnel settlement, tunnel flow, cave water temperature, slip-belt temperature / water content

Do not claim full 2017-2025 coverage yet. The downloaded open-access files are explicitly example slices for selected sensors and years. The current correct modeling posture is to use the Badong-Huangtupo open-access slice as a regional support-set and sample-factory proof, not as the main high-metric displacement model.

## Core Sample Factory And Baseline

Generated core sample factory:

- script: `scripts/dev/regional-model-library/build-badong-huangtupo-core-samples.py`
- report: `.tmp/regional-model-library/out/badong-huangtupo/core-samples/badong-huangtupo-core-sample-factory.report.json`
- samples: `52233`
- labeled samples: `51467`
- train / validation: `41173 / 10294`
- required feature coverage: `displacementObservedMm = 52233 / 52233`
- optional context coverage:
  - `rainfallCurrentMm_sum_24h = 8352 / 52233`
  - `rainfallCurrentMm_sum_72h = 8352 / 52233`
  - `caveCrackMm = 10632 / 52233`

Generated baseline:

- script: `scripts/dev/regional-model-library/train-badong-huangtupo-core-displacement-baseline.py`
- report: `.tmp/regional-model-library/out/artifacts/badong-huangtupo-core-displacement-baseline/badong-huangtupo-core-displacement-baseline.report.json`
- best validation model: `zero-delta-persistence`
- MAE: `0.522670 mm`
- RMSE: `1.395786 mm`
- R2: `-0.000014`
- Within 1mm: `85.88%`
- Direction Accuracy: `26.66%`

This baseline is useful as a reproducible expansion proof, but it should not replace the Baijiabao v14 displacement model in paper or competition wording.

## Next Execution

1. Keep `f267a98f-a2f0-4db1-89db-2f9458473991` and `0c3020e1-d792-4dd1-a820-2dd48dfde62f` as the next highest-value manual NCDC application targets.
2. Register or integrate the current Baijiabao v14 displacement model first if the goal is product-side push.
3. Treat groundwater, pore pressure, tunnel settlement, tunnel flow, temperature, and water-content families as future ablation or explanation branches.
4. Do not spend more time retrying unauthenticated downloads for the apply-access Three Gorges station packs; use manual login/application when those datasets become necessary.
