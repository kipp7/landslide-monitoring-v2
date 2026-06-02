---
title: regional-model-library-research-and-reuse-map
type: note
tags:
- reference
- ai
- landslide
- time-series
- regional-model
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/regional-model-library-research-and-reuse-map
---

# Reference: regional-model-library-research-and-reuse-map

## Purpose

Store the stable research conclusions, reusable open-source assets, licensing caveats, and repo integration mapping for the regional expert model library line so later sessions do not need to reconstruct the same due diligence from chat logs and monthly journals.

## Adopted Direction

- Chosen architecture:
  - `C. 区域专家模型库 + 学习式匹配 + replay 重排 + 本地接管`
- Stable design premise:
  - `区域不是适配标签，而是模型库的主单位`
- Matching should use three spaces:
  - `静态区域空间`
  - `动态响应空间`
  - `模型表现空间`

## China-Focused Execution Position

- first-wave China implementation should prioritize:
  - `监测时序`
  - not `遥感分割`
  - not standalone `事件清单`
- first-wave expert clusters should currently be treated as:
  - `ThreeGorges-Reservoir-Rainfall`
  - `Badong-Huangtupo`
- data-family routing should stay fixed:
  - `监测时序`
    - goes into `CanonicalTrainingSample`
    - can directly become first-batch regional experts
  - `事件清单 / 事件目录`
    - goes into `Static Match`
    - goes into cold-start priors
    - becomes mainline training data only after joining with rainfall or monitoring windows
  - `遥感分割 / patch / inventory`
    - goes into `RegionProfile`
    - goes into inventory refinement and priors
    - stays on the side branch for phase 1

## China Dataset Acquisition Map

### A. Public or directly downloadable now

| Source | Region | Family | Access status | Main reuse position | Notes |
| --- | --- | --- | --- | --- | --- |
| [NCDC Three Gorges monitoring collections](https://www.ncdc.ac.cn/portal/metadata/6d2c3204-0d1d-11e6-af40-5cc5d45ad3ae) plus station-level pages such as [Shuping](https://www.ncdc.ac.cn/portal/metadata/6955ee18-0d1d-11e6-af40-5cc5d45ad3ae), [Xintan](https://www.ncdc.ac.cn/portal/metadata/64c3f494-0d1d-11e6-af40-5cc5d45ad3ae), and [Baishuihe](https://www.ncdc.ac.cn/portal/metadata/6260cfc4-0d1d-11e6-af40-5cc5d45ad3ae) | Three Gorges Reservoir | monitoring time series | public NCDC entry; some sub-items require login | first-batch `ts_station_multivariate_adapter`; first expert cluster | best currently known open China monitoring line for the online warning main path |
| [Three Gorges field-observation release hub](https://www.ncdc.ac.cn/portal/news/detail/6d599d6c-61c0-437e-8ec2-2f6ff4811343) and [Three Gorges monitoring annual report 2001](https://www.ncdc.ac.cn/portal/metadata/fade59d3-3f10-4670-9c86-f61d89917a35) | Three Gorges Reservoir | monitoring time series / annual report | official NCDC news and metadata hub | template source for `ts_station_multivariate_adapter` and historical feature completion | the 2001 report explicitly bundles surface displacement, borehole inclinometer, groundwater, rainfall, Yangtze water level, and air temperature |
| [Three Gorges 2007-2012 follow-up station series](https://www.ncdc.ac.cn/portal/metadata/e8611111-e41e-48ee-9b86-c67848953f35), [Xintan 2007-2012](https://www.ncdc.ac.cn/portal/metadata/6d3b5b13-c8b6-42ba-b105-93b115506ce1), and [Bazimen 2007-2012](https://www.ncdc.ac.cn/portal/metadata/66fad1a6-0d1d-11e6-af40-5cc5d45ad3ae) | Three Gorges Reservoir | monitoring time series | official NCDC entries | long-horizon continuation for the first expert cluster | confirms Three Gorges is not a single-year sample but a multi-period public monitoring line |
| [Three Gorges monitoring annual reports 2010](https://www.ncdc.ac.cn/portal/metadata/29489f53-90f6-49e7-a139-ec38fbb09029), [2011](https://www.ncdc.ac.cn/portal/metadata/53578b7c-0afb-4844-a11a-0c9cdd1fd821), [2016](https://www.ncdc.ac.cn/portal/metadata/18f1b58c-1198-4fbd-ad23-8ce96cdcc39b), and [2017](https://www.ncdc.ac.cn/portal/metadata/eb970951-4721-4371-a56f-02ef79ce0a93) | Three Gorges Reservoir | annual monitoring reports | official NCDC entries | metadata completion, quality checks, and auxiliary feature recovery | useful for adapter backfilling when per-sensor tables are incomplete |
| [Baishuihe 2018 deformation, rainfall, and reservoir-water monitoring](https://www.ncdc.ac.cn/portal/metadata/8b610f07-addf-478c-b288-18df4f205fd0), [Bazimen 2018](https://www.ncdc.ac.cn/portal/metadata/a5651f2a-bccc-4de4-aeb2-4db70bf76a2e), and [Xintan 2017](https://www.ncdc.ac.cn/portal/metadata/0aaf6e26-fce1-4d3b-a160-777827d94cd4) | Three Gorges Reservoir | monitoring time series | official NCDC entries | direct multivariate window construction for phase 1 | these are closer to the intended `deformation + rainfall + reservoir level` runtime feature shape |
| [Baijiabao observation dataset 2017-2024](https://www.ncdc.ac.cn/portal/metadata/3768727b-13b2-4675-8a00-2d661ec96229) | Three Gorges Reservoir | monitoring time series | official NCDC entry; anonymous HTTP direct download is workable when the metadata-page `Referer` is present | challenger expert or extension of the Three Gorges cluster | includes GNSS displacement, surface cracks, reservoir water level, rainfall, and three context images |
| [NCDC Huangtupo surface displacement 2018-2019](https://www.ncdc.ac.cn/portal/metadata/0c3020e1-d792-4dd1-a820-2dd48dfde62f) | Badong, Hubei | monitoring time series | public NCDC entry | first-batch `ts_station_multivariate_adapter`; second expert cluster | strong fit for `stationCode / slopeCode` style mapping |
| [Badong Huangtupo 3D Beidou displacement 2018-2025](https://www.ncdc.ac.cn/portal/metadata/afda81fe-f260-4da0-8627-7311c792b979), [cave slip-belt displacement 2017-2025](https://www.ncdc.ac.cn/portal/metadata/a1fdce07-86b6-4a6b-b665-776e821768e3), [tunnel settlement 2017-2025](https://www.ncdc.ac.cn/portal/metadata/d23a09fc-fcf0-4fa5-9637-bde3f7d968a5), [tunnel flow 2017-2025](https://www.ncdc.ac.cn/portal/metadata/ca1fbf48-a050-4ae3-86f2-3b0000f2ee00), [fault-zone 3D displacement 2021-2025](https://www.ncdc.ac.cn/portal/metadata/394ea9b2-4e41-400c-b975-54e82c5eb382), [bank deformation 2023-2025](https://www.ncdc.ac.cn/portal/metadata/d94fda0d-6115-40fc-9eac-d7fa2c439c66), and [bank cracks 2023-2025](https://www.ncdc.ac.cn/portal/metadata/aafa4320-275e-4d3f-b5c8-6fb26dd644ba) | Badong, Hubei | multi-sensor monitoring cluster | official NCDC entries; pages audited show `CC BY 4.0` | second expert cluster; multi-modal support-set and local takeover | this is a full regional observation cluster, not just one surface-displacement dataset |
| [Badong cave rainfall 2017-2025](https://www.ncdc.ac.cn/portal/metadata/f267a98f-a2f0-4db1-89db-2f9458473991), [slip-belt temperature and water content 2017-2025](https://www.ncdc.ac.cn/portal/metadata/3a31fe7f-d817-4945-895b-345dc96bb84f), [cave-water temperature 2017-2025](https://www.ncdc.ac.cn/portal/metadata/a03e3c52-c67f-486a-989d-8ec2980a5f96), [soil pressure 2023](https://www.ncdc.ac.cn/portal/metadata/78cbcbbd-56de-44d0-b8aa-22a7609fa1a9), and [rock-soil stress 2022-2023](https://www.ncdc.ac.cn/portal/metadata/10f55e68-743e-45c5-9cc3-aef7c1106c61) | Badong, Hubei | auxiliary monitoring covariates | official NCDC entries | `hydroclimateContext`, mechanistic covariates, and explanation support | these fill the covariate side of the Badong cluster beyond pure displacement |
| [Huangniba Dengkan 8-year series on Figshare](https://figshare.com/articles/dataset/Data_Sheet_2_Research_and_analysis_of_the_TCN-Multihead-Attention_prediction_model_of_landslide_deformation_in_the_Three_Gorges_Reservoir_area_China_csv/29220923) | Three Gorges Reservoir | monitoring time series | direct download | multivariate baseline and challenger data | useful for immediate `Chronos / TimesFM / Uni2TS` adapter tests |
| [Zhamunongba observation data 2016-2019](https://www.ncdc.ac.cn/portal/metadata/80c9d9d4-5a1c-4f76-826c-161c17389431) | Southeastern Tibet | monitoring time series | official NCDC page; access mode needs confirmation per page flow | cross-geomorphology transfer and heterogeneous-region validation | couples rainfall, soil temperature, pore-water pressure, water content, water potential, and vibration |
| [Luoyugou displacement 2020-07-16 to 2020-08-14](https://www.ncdc.ac.cn/portal/metadata/61f27a07-e5fa-4409-aad5-7347b9453000), [rainfall](https://www.ncdc.ac.cn/portal/metadata/e5e9e00c-30e5-425c-810e-b82655376d7e), [water level](https://www.ncdc.ac.cn/portal/metadata/e730c037-65b9-4258-ab3f-a64162447c32), and [pore-water pressure](https://www.ncdc.ac.cn/portal/metadata/572f4fe9-1b85-4fb2-8f55-e723938a7782) | Luoyugou, Tianshui, Gansu | short-window field experiment | official NCDC entries | clean short-horizon sample factory and joined event-window experiments | strong loess-region candidate for fast joined-sample experiments |
| [Yan'an loess-slope infiltration monitoring 2017-2020](https://www.ncdc.ac.cn/portal/metadata/77f34832-6af6-4631-8ece-f5206b0f78c3) | Yan'an, Shaanxi | long-term infiltration monitoring | `Online`; `CC BY 4.0` | hydroclimate priors and loess-region context | not a direct displacement label source, but high-value for `hydroclimateContext` |
| [Luoyugou ERT monitoring 2020-08](https://www.ncdc.ac.cn/portal/metadata/b5e37cf9-4969-49d5-8ea2-0c93a5a0e16b) | Luoyugou, Tianshui, Gansu | geophysical monitoring | `Login to Access` | side covariate branch and interpretability support | keep as a side input, not a phase-1 primary label source |
| [A high-precision catalogue of landslide events in China based on news text mining with large language model](https://www.nature.com/articles/s41597-026-07066-w) with dataset DOI [10.6084/m9.figshare.29603420](https://doi.org/10.6084/m9.figshare.29603420) and code DOI [10.6084/m9.figshare.31298212](https://doi.org/10.6084/m9.figshare.31298212) | Mainland China | event catalogue | paper verifies figshare dataset and code availability | nationwide cold-start prior; region onboarding; replay truth lookup | use as `event_inventory_adapter`, not as a standalone first-batch expert corpus |
| [Global landslide points and landslide-area dataset 1915-2021](https://www.ncdc.ac.cn/portal/metadata/c92f774a-f368-4ad0-b99d-48007d3e6dc6) | global, filterable to China | point and polygon inventory | open NCDC entry; page shows `CC BY 4.0` | China cold-start prior and cross-library replay reference | broad but useful when a region has no stronger local inventory yet |
| [Records of shallow landslides triggered by extreme rainfall in July 2024 in Zixing, China](https://www.nature.com/articles/s41597-025-05670-w) with code repo [RLZX-landslide-inventory-and-landslide-detection-datasets](https://github.com/klaus2023/RLZX-landslide-inventory-and-landslide-detection-datasets) | Zixing, Hunan | event inventory plus detection support | paper states the data files are openly available and code is on GitHub | single-event regional expert support; event truth; remote-sensing side support | good for replay and extreme-rainfall event reconstruction |
| [Inventory of shallow landslides triggered by extreme precipitation in July 2023 in Beijing, China](https://springernature.figshare.com/articles/dataset/Inventory_of_shallow_landslides_triggered_by_extreme_precipitation_in_July_2023_in_Beijing_China/26878327) | Beijing | event inventory | direct figshare entry | event-anchor dataset for rainfall-triggered northern China cases | useful for one-event region onboarding and validation |
| [Fuling District heavy-rainfall-induced landslide database in June 2019](https://data.mendeley.com/datasets/5j5b7wyrjp/1) | Fuling, Chongqing | single-event database | direct Mendeley Data entry | event-level `replay`, `Static Match`, and trigger reconstruction | valuable southwest China rainfall-triggered event set |
| [Wanzhou 1950-2020 multi-temporal inventory plus 18 factors](https://data.mendeley.com/datasets/xr3wrvm393/1) | Wanzhou, Chongqing | event inventory / susceptibility | direct Mendeley Data entry | `RegionProfile` enrichment; `Static Match`; auxiliary replay truth | not a primary online expert dataset by itself |
| [Wenchuan multi-temporal landslide and debris-flow inventory with rainfall support](https://zenodo.org/records/1405490) | Wenchuan, Sichuan | event inventory / trigger support | direct Zenodo record | event join, threshold support, post-event evolution replay | useful after joining with rainfall windows |
| [Weihe Basin landslide points 1915-2021](https://www.ncdc.ac.cn/portal/metadata/8613bb38-db11-4517-95ae-abba4425fa39) | Weihe Basin | landslide point inventory | open NCDC entry; page shows `CC BY 4.0` | basin-scale `Static Match`, inventory prior, and background regionalization | useful for northwestern China regional priors |
| [Gansu landslide points 2008-2014](https://www.ncdc.ac.cn/portal/metadata/29331d95-40b6-47ff-83c8-4abed8b7e198) | Gansu Province | landslide point inventory | open NCDC entry; page shows `CC BY 4.0` | province-scale `Static Match`, prior, and sample-region lookup | low-cost way to add northwest regional coverage |
| [Yellow River Basin geological disaster data 2015-2019](https://www.ncdc.ac.cn/portal/metadata/13f63fe0-9bc4-4d4e-aa24-fb21ed0ef26d) | Yellow River Basin | basin-scale disaster inventory | open NCDC entry | wide-area prior and regional profile support | useful as a broad regional hazard background layer |
| [Bijie Landslide Dataset](https://gpcv.whu.edu.cn/data/Bijie_pages.html) | Bijie, Guizhou | remote-sensing patch dataset | direct open download page | remote-sensing side branch; inventory refinement | WHU page is open, but the page does not clearly expose a separate reuse license; verify before production reuse |

### B. Public but phase-1 side branch or license-constrained

| Source | Region | Family | Constraint | Reuse position |
| --- | --- | --- | --- | --- |
| [LMHLD](https://zenodo.org/records/11519933) | includes Wenchuan / Jiuzhaigou related China samples | remote sensing | open dataset line, but still a remote-sensing branch for phase 1 | cross-region visual pretraining and inventory refinement |
| [CAS Landslide Dataset](https://zenodo.org/records/10294997) | includes Jiuzhaigou / Longxihe / Wenchuan / Moxi | remote sensing | `CC BY-NC 4.0`; do not anchor the production mainline on it | research-only remote-sensing support |
| [DMLD-Dataset](https://github.com/ChenjieCSU/DMLD-Dataset) | Southwest China | remote sensing | repository download path exists but license status should be confirmed before reuse | remote-sensing baseline only |
| [NCDC loess landslide project release](https://www.ncdc.ac.cn/portal/news/detail/c6c63402-b779-4598-b792-5a9d672be048) | Loess Plateau multi-region | mixed monitoring / infiltration / radar inversion | high value and official, but needs another pass over the released sub-datasets one by one | second-batch geomorphology expansion |
| [Gansu topographic factor dataset 2009](https://www.ncdc.ac.cn/portal/metadata/bb2bff61-2339-4a01-8d02-e607be580f8e) | Gansu Province | factor rasters | page is public; file access path may require login or service flow | region-profile and `Static Match` enrichment only |
| [Gansu geological-hazard points](https://www.ncdc.ac.cn/portal/metadata/2e826759-eee2-44b0-b4e2-521c6007df8e) | Gansu Province | multi-hazard points including landslides | public page; page indicates FTP or web retrieval; reported `CC BY 4.0` by source audit | broad prior layer; filter to landslide subset before use |
| [Weihe River Basin geohazard sites](https://www.ncdc.ac.cn/portal/metadata/e2afe285-f4ff-4a67-b053-795a0f2ea228) | Weihe Basin | multi-hazard sites including landslides | public page; file path may require service flow | broad prior layer and basin profile support |
| [LandslideSusceptibilityMappingData](https://doi.org/10.5281/zenodo.14214486) | Zhushan, Hubei | susceptibility GIS database | open Zenodo record | prior and `Static Match` reference implementation, not mainline training data |

### C. High-value papers and datasets that require formal request

| Source | Region | Verified access status | Why it matters |
| --- | --- | --- | --- |
| [Zhamunongba observation data 2016-2019](https://www.ncdc.ac.cn/portal/metadata/80c9d9d4-5a1c-4f76-826c-161c17389431) | Bomi, Tibet | official NCDC page exposes the dataset, but the entry labels access as `离线申请`; the metadata page shows 10-minute acquisition collapsed to daily rainfall, soil temperature, pore-water pressure, water content, water potential, and vibration | rare official China slope-observation series outside the Three Gorges and Badong clusters; valuable for high-relief alpine hazard transfer experiments |
| [Analysis of rainfall response and graded warning for landslides](https://www.nature.com/articles/s41598-026-42802-7) | Zigui, Hubei / Three Gorges | paper states displacement data are sensitive and not public; metadata and derived tables are available upon reasonable request with data-owner approval; contact `xyin0320@163.com` | best current lead for China monitoring time series that directly match graded warning and region-expert design |
| [A comparative study of regional rainfall-induced landslide early warning models based on RF, CNN and MLP algorithms](https://www.frontiersin.org/journals/earth-science/articles/10.3389/feart.2024.1419421/full) | Fujian Province | paper states the data cannot be fully shared for departmental reasons and should be requested from the authors | province-scale sample factory that is very close to `CanonicalTrainingSample` construction |
| [Interpretable machine learning incorporating major lithology for regional landslide warning in northern and eastern Guangdong](https://www.nature.com/articles/s44304-025-00146-8) | Northern and eastern Guangdong | paper states the data are available upon reasonable request | best current lithology-first expert partition reference in South China |
| [Establishing radar-derived rainfall thresholds for a landslide early warning system: a case study in the Sichuan Basin, Southwest China](https://www.nature.com/articles/s41598-025-10464-6) | Sichuan Basin | paper states the data are available from the corresponding author, Qiang Xu, upon reasonable request | high-value bridge between government event inventories and radar rainfall |
| [Regional dynamic hazard assessment of rainfall-induced landslide guided by geographic similarity](https://link.springer.com/article/10.1007/s10064-024-04001-4) | Yunnan Province | article states the data are available from the corresponding author upon reasonable request | close to our `Static Match` and similarity-routing line |
| [Regional early warning model for rainfall induced landslide based on slope unit in Chongqing, China](https://doi.org/10.1016/j.enggeo.2024.107464) | Chongqing | method and sample scale are highly relevant; data-availability wording needs a separate verification pass | near-neighbor route to our region-first design |
| [A systematic assessment of regional landslide risk under typhoon rainfall: a case study of Taishun, Zhejiang, China in September 2016](https://www.nature.com/articles/s41598-026-46166-w) | Taishun, Zhejiang | paper reports availability upon reasonable request | useful for typhoon-event expert variants and event-driven region onboarding |

### D. Do not treat as mainline production inputs

- do not buy or ingest unofficial second-hand monitoring tables as model-library truth
  - use those channels only to discover project names, institutions, or contact leads if necessary
- do not equate article license with dataset license
  - always verify the dataset item terms on figshare, Zenodo, Mendeley Data, or NCDC before promoting the source into production assets
- do not pull `NC` or unclear-license remote-sensing sets into the online production dependency path
- do not force inventory-only datasets into first-batch expert training without a joined rainfall or monitoring window factory

## Event Inventory Boundary Rule

- no current China event catalogue or inventory source should enter the first-batch online expert corpus without joins
- before an event or inventory source can feed `CanonicalTrainingSample`, it must be paired with:
  - aligned rainfall or monitoring windows
  - static terrain or geology context when missing
  - explicit negative windows or non-event samples
- default role split for the current China white list:
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

## China Adapter Families

- `ts_station_multivariate_adapter`
  - first-batch mainline adapter
  - target sources:
    - Three Gorges monitoring bundles
    - Huangtupo displacement
    - Badong Huangtupo multi-sensor cluster
    - Baijiabao observation dataset
    - Huangniba Dengkan
- `event_inventory_adapter`
  - target sources:
    - China-wide catalogue
    - Zixing 2024
    - Beijing 2023
    - Fuling 2019
    - Wanzhou
    - Wenchuan
    - Weihe Basin
    - Gansu point inventory
    - Yellow River Basin geological disaster data
  - output role:
    - event priors
    - static match support
    - replay event truth
- `rs_patch_inventory_adapter`
  - target sources:
    - Bijie
    - LMHLD
    - CAS
    - DMLD
  - output role:
    - `RegionProfile` enrichment
    - inventory refinement
    - remote-sensing side branch

## China Mainline View After Second Pass

- `ThreeGorges-Reservoir-Rainfall` is now clearly a public long-horizon monitoring cluster:
  - 2006 station pages
  - 2007-2012 continuation pages
  - 2001 annual report template
  - annual monitoring reports
  - 2017-2018 deformation + rainfall + reservoir-level entries
  - Baijiabao 2017-2024 extension
- `Badong-Huangtupo` is now clearly a public multi-sensor cluster:
  - surface displacement
  - 3D Beidou displacement
  - slip-belt displacement
  - tunnel settlement
  - tunnel flow
  - bank deformation and cracks
- `Zhamunongba` is now the strongest officially surfaced non-Three-Gorges mountainous monitoring line
- `Luoyugou` is now the cleanest short-window loess-region joined experiment set
- `Yan'an` gives long-term loess hydrologic context even without direct displacement labels
- because of this, the first-wave China implementation no longer depends on a single narrow public source
- the public-data baseline is already strong enough to start:
  - adapter development
  - sample-factory development
  - first replay evaluation

## China Expansion Candidates After Third Pass

These are not replacements for the current phase-1 core, but they are strong expansion candidates discovered in the latest 2024-2026 pass.

| Source | Region | Family | Access status | Main reuse position | Phase-1 recommendation |
| --- | --- | --- | --- | --- | --- |
| [CHM_PRE V2 China daily precipitation grid 1960-2023](https://essd.copernicus.org/articles/17/3987/2025/essd-17-3987-2025.html) with dataset DOI [10.11888/Atmos.tpdc.300523](https://doi.org/10.11888/Atmos.tpdc.300523) | Mainland China | rainfall grid time series | paper says freely accessible; TPDC page flow may require interactive download | default rainfall-join backbone for nationwide event replay and region climate descriptors | add immediately as the default rainfall join source for event libraries |
| [Significant landslide earthquake dataset in mainland China 2000-2023](https://data.earthquake.cn/tuxw/info/2024/334672553.html) | Mainland China | trigger event catalogue | national earthquake data portal; page exposes download entry but actual retrieval requires login | split earthquake-triggered versus rainfall-triggered routing and replay truth support | parallel acquisition; do not block rainfall path |
| [Jiangjiagou long-term hydrometeorology and debris-flow observation dataset](https://essd.copernicus.org/articles/17/7331/2025/essd-17-7331-2025.html) with example DOI [10.12072/ncdc.ddfors.db6803.2025](https://doi.org/10.12072/ncdc.ddfors.db6803.2025) | Dongchuan, Yunnan | high-frequency monitoring time series | NCDC journal-data pages expose open download or FTP style access | high-quality process-level covariate and threshold reference for southwest mountain channels | phase `1.5 / 2`; valuable calibration line, not core phase-1 expert source |
| [Large-scale Qinling landslide boundary vector dataset](https://data.4tu.nl/datasets/6baa0d9d-f57c-4de4-8599-2064312bc8f2) | Qinling Mountains | polygon inventory | direct download; `CC0` | spatial regionalization, `Static Match`, and region-similarity descriptors in central China | good low-cost expansion after the current event pack |
| [Duku Corridor landslide volume and distribution dataset 2000-2024](https://doi.org/10.1594/PANGAEA.973115) | Tianshan, Xinjiang | regional inventory | direct PANGAEA download | dry or high-relief northwestern region coverage and cross-geomorphology matching | optional expansion after current loess and reservoir lines |
| [Ludian earthquake multi-temporal landslide inventories 2014-2022](https://zenodo.org/records/15654526) | Ludian, Yunnan | multi-temporal event inventory | direct Zenodo record | earthquake-recovery replay and time-drift validation | strong replay-side expansion, not first phase-1 blocker |
| [Zhushan susceptibility data and code](https://zenodo.org/records/14214486) | Zhushan, Hubei | susceptibility GIS database | direct Zenodo record | `region_profile_builder` template and county-scale reproducible prior pipeline | add early as the template source for `RegionProfile` static-factor mapping |

## Latest Acquisition Priority 2026-04-21

This pass should be treated as the current concrete download and reuse order, not as a generic research backlog.

| Asset | Type | Source | Access / license status | Main reuse position | Main risk |
| --- | --- | --- | --- | --- | --- |
| [China landslide high-precision event catalogue 2008-2024](https://doi.org/10.6084/m9.figshare.29603420) with paper [Scientific Data 2026](https://www.nature.com/articles/s41597-026-07066-w) | event library | official paper + figshare | public; paper and dataset surfaced as open reuse | national event prior, replay truth, region onboarding | news-derived events still need geocoding QA and reporting-bias checks |
| [China landslide event-catalogue extraction code](https://doi.org/10.6084/m9.figshare.31298212) | code | official figshare code release | public | reuse the extraction, dedup, and geocoding pipeline instead of rebuilding from zero | paper-grade prototype; production hardening still required |
| [CHM_PRE V2](https://doi.org/10.11888/Atmos.tpdc.300523) with paper [ESSD 2025](https://essd.copernicus.org/articles/17/3987/2025/essd-17-3987-2025.html) | rainfall backbone | official TPDC + ESSD paper | paper says freely accessible; TPDC flow may require account login | unified rainfall backbone for replay, priors, and region climate descriptors | 0.1° grid is coarse for a single slope and still needs local bias correction when a real rain gauge exists |
| [NCDC Three Gorges station family](https://www.ncdc.ac.cn/portal/metadata?current_page=1&org=%E9%95%BF%E6%B1%9F%E4%B8%89%E5%B3%A1%E6%BB%91%E5%9D%A1%E8%A7%82%E6%B5%8B%E7%AB%99) | monitoring time series family | official NCDC station hub | mixed public / login / request by sub-item | `ThreeGorges` expert packs, multivariate joins, long-horizon continuation | fragmented by station and year; needs field-family normalization before model use |
| [Baijiabao observation dataset 2017-2024](https://www.ncdc.ac.cn/portal/metadata/3768727b-13b2-4675-8a00-2d661ec96229) | monitoring time series | official NCDC | official entry visible; actual file flow may require login or request | strongest current `ThreeGorges` challenger or extension pack | acquisition path is less frictionless than the metadata page suggests |
| [Baijiabao orthophoto 2016](https://www.ncdc.ac.cn/portal/metadata/6f68f634-3620-478a-845c-70c8ec498752) | orthophoto / remote sensing support | official NCDC | page shows web / FTP style retrieval | target-domain adaptation for the vision side branch and replay evidence | single-time orthophoto, not a temporal monitoring source |
| [Badong-Huangtupo surface displacement 2018-2019](https://www.ncdc.ac.cn/portal/metadata/0c3020e1-d792-4dd1-a820-2dd48dfde62f) plus the Huangtupo related family pages already indexed in this note | monitoring time series family | official NCDC | official pages visible; mixed request-style acquisition | `Badong-Huangtupo` primary expert pack | must be joined with rainfall / groundwater / flow and sensor IDs normalized |
| [Wanzhou 1950-2020 inventory + 18 factors](https://data.mendeley.com/datasets/xr3wrvm393/1) | inventory / static factors | Mendeley Data | direct download | `ThreeGorges` static prior, `Static Match`, profile enrichment | not a direct online time-series expert source |
| [Luoyugou field experiment pack](https://www.ncdc.ac.cn/portal/metadata?current_page=1&pj=%E9%BB%84%E5%9C%9F%E6%BB%91%E5%9D%A1%E5%A4%B1%E7%A8%B3%E6%9C%BA%E7%90%86%E3%80%81%E9%98%B2%E6%8E%A7%E6%96%B9%E6%B3%95%E7%A0%94%E7%A9%B6%E4%B8%8E%E9%98%B2%E6%B2%BB%E7%A4%BA%E8%8C%83&title_cn_like=) | joined short-window experiment | official NCDC project aggregation | mixed login / request by item | `loess challenger`, rainfall-triggered mechanism pack, joined short-window sample factory | short experimental horizon, not a long-running operational station |
| [RLZX 2024 Zixing inventory and detection dataset](https://doi.org/10.6084/m9.figshare.27960762) with code [GitHub](https://github.com/klaus2023/RLZX-landslide-inventory-and-landslide-detection-datasets) | vision / event replay support | figshare + GitHub | public data and public code | Chinese extreme-rainfall vision branch, replay evidence, detector pretraining | not time-series monitoring data; code license should still be rechecked before productization |
| [CAS Landslide Dataset](https://doi.org/10.5281/zenodo.10294997) with production code [GitHub](https://github.com/Aizu0/CAS-Landslide-Dataset-production-code) | vision pretraining | Zenodo + GitHub | public but dataset is `CC BY-NC 4.0` | Chinese landslide segmentation pretraining and patch-generation reference | `NC` makes it unsuitable for the production mainline dependency path |

## Raw Landing And Field Alignment Rule

- do not push raw columns directly onto runtime payload names
- keep the translation line fixed as:
  - `raw file / sheet / column alias`
  - `canonical target`
  - `runtime payload field`
- `canonical target` is the only place where raw-source semantics should be mapped into repo contracts
- `runtime payload fields` stay downstream and should be produced only from canonical contracts

### Current fixed landing layouts

- `China 2008-2024 catalogue`
  - landing should preserve:
    - Chinese raw `xlsx`
    - English raw `xlsx`
    - released extraction-code archive
  - phase-1 should additionally derive:
    - one normalized `event_inventory_adapter`-ready `csv`
  - first-pass minimum mapping should lock:
    - `event_id`
    - `event_ts`
    - `region_code`
    - `hazard_type`
  - keep remaining event attributes as passthrough metadata
- `CHM_PRE V2`
  - landing should preserve raw national `NetCDF / GeoTIFF`
  - do not flatten the full grid into a single nationwide CSV
  - derive only:
    - `by-event` rainfall extracts
    - `by-region` climate extracts
  - first-pass backbone fields should lock:
    - `event_ts`
    - `grid_id`
    - `lon`
    - `lat`
    - `rainfall_mm`
    - `source_version`
- `Baijiabao`
  - page advertises `直接下载 / FTP下载`, and the current direct HTTP landing is workable with the metadata-page `Referer`
  - keep browser landing as operator fallback, but the current repo can script the direct download target
  - current raw package is one zip containing:
    - `_ncdc_meta_.json`
    - 4 `xls` tables
    - 3 `jpg` context images
  - keep it under the `ThreeGorges` root as a challenger extension, not as a new primary pack
  - raw table semantics still need careful preservation:
    - page summary and workbook titles disagree on whether displacement is `mm/d` or cumulative `mm`
    - page summary and workbook columns disagree on whether reservoir information is `m/d` or water level `m`
- `Wanzhou`
  - verified as anonymous direct download
  - raw package preserves:
    - `FileGDB` inventory
    - `FileGDB` causal factors
    - research scripts
    - results directory
  - use it for:
    - `RegionProfile` enrichment
    - `Static Match`
    - `prior`
  - do not treat it as an online time-series expert pack
  - license needs one more manual check because:
    - Mendeley page shows `CC BY 4.0`
    - inner package text says `CC-BY-NC`

### Stable Reuse Rule After Latest Pass

- `event library`
  - adopt:
    - China high-precision event catalogue 2008-2024
    - its public extraction code
- `rainfall backbone`
  - adopt:
    - `CHM_PRE V2`
- `ThreeGorges first-wave packs`
  - prioritize:
    - `Baijiabao`
    - Three Gorges official station families
    - `Wanzhou` inventory as the static prior layer
- `Badong-Huangtupo first-wave pack`
  - prioritize:
    - surface displacement

## Supplementary Verified Assets 2026-04-22

- `soil prior`
  - [CSDLv2 ESSD 2025](https://essd.copernicus.org/articles/17/517/2025/index.html)
  - [dataset DOI](https://doi.org/10.11888/Terre.tpdc.301235)
  - current reuse role:
    - `RegionProfile` soil and hydrologic prior
    - regional expert differentiation beyond rainfall and land cover
- `time-series MoE skeleton`
  - [Time-MoE official GitHub](https://github.com/Time-MoE/Time-MoE)
  - current reuse role:
    - open MoE backbone for `regional expert head + routing` experiments
    - benchmark-only or replay-only lane first, not the default online dependency
- `spatiotemporal graph skeleton`
  - [PyTorch Geometric Temporal](https://github.com/benedekrozemberczki/pytorch_geometric_temporal)
  - current reuse role:
    - multi-station graph experiments
    - rainfall-neighbor and slope-neighbor message passing for side experiments
- `remote-sensing regional embedding`
  - [Prithvi-EO-2.0](https://github.com/NASA-IMPACT/Prithvi-EO-2.0)
  - current reuse role:
    - remote-sensing side-branch feature extractor
    - region embedding support for future matcher enrichment
    - 3D Beidou
    - rainfall
    - groundwater
    - tunnel flow
- `Luoyugou`
  - treat as:
    - a short-window loess challenger with six-variable joined experiment inputs
- `vision side branch`
  - start with:
    - `RLZX`
    - `CAS`
  - then target-domain adapt with:
    - `Baijiabao` orthophoto and local station metadata

## Directly Reusable Assets

### Green: directly reusable now

- `amazon-science/chronos-forecasting`
  - repo license:
    - `Apache-2.0`
  - model cards checked:
    - `amazon/chronos-bolt-base`
    - `amazon/chronos-2`
  - model card license:
    - `Apache-2.0`
  - best use here:
    - `global fallback`
    - `cold-start challenger`
    - zero-shot baseline

- `SalesforceAIResearch/uni2ts`
  - repo license:
    - `Apache-2.0`
  - provides:
    - `Moirai`
    - `Moirai-MoE`
    - unified training / finetune / eval flow
  - caveat:
    - checked model card `Salesforce/moirai-1.1-R-large` is `cc-by-nc-4.0`
  - best use here:
    - training framework
    - shared encoder experiments
    - self-trained regional experts

- `google-research/timesfm`
  - repo license:
    - `Apache-2.0`
  - checked model cards:
    - `google/timesfm-2.0-500m-pytorch`
    - `google/timesfm-2.5-200m-pytorch`
  - model card license:
    - `Apache-2.0`
  - repo now includes:
    - LoRA / PEFT finetuning example
  - best use here:
    - `local adaptation`
    - few-shot takeover experiments

- `Time-MoE/Time-MoE`
  - repo license:
    - `Apache-2.0`
  - checked model cards:
    - `Maple728/TimeMoE-50M`
    - `Maple728/TimeMoE-200M`
  - checked dataset:
    - `Maple728/Time-300B`
  - both model and dataset card license:
    - `Apache-2.0`
  - caveat:
    - official README TODO still includes `Add covariate support`
  - best use here:
    - research backup
    - MoE structure reference

- `moment-timeseries-foundation-model/moment`
  - repo license:
    - `MIT`
  - provides:
    - multi-task time-series foundation modeling
    - forecasting, classification, anomaly detection, imputation support
  - best use here:
    - `representation backbone`
    - `matching embedding`
    - anomaly-oriented challenger lane

- `autogluon/fev`
  - repo license:
    - `Apache-2.0`
  - purpose:
    - lightweight forecasting benchmark / evaluation library
    - rolling evaluation windows
    - point / probabilistic metrics
    - covariate-aware evaluation
  - best use here:
    - `Replay Rerank`
    - offline leaderboard

- `archon159/RAFT`
  - repo license:
    - `MIT`
  - purpose:
    - retrieval-augmented forecasting
    - nearest-history retrieval before prediction
  - best use here:
    - `dynamic retrieval` baseline
    - simple first implementation of `retrieve then forecast`
    - replay-side similarity experiments

- `paulhoehn/Sen12Landslides`
  - dataset card license:
    - `CC-BY-4.0`
  - repo contains:
    - configs
    - experiments
    - setup.py
    - requirements.txt
    - tests
  - caveat:
    - repo root does not expose a separate `LICENSE` file in the audited snapshot
  - best use here:
    - remote-sensing side branch
    - landslide inventory refinement
    - region profile enrichment

- `usgs/landslides-thresholds`
  - license status:
    - USGS public domain notice in repo license file
  - purpose:
    - rainfall threshold tracking
    - intensity-duration and antecedent-rainfall threshold analysis
  - best use here:
    - threshold prior
    - rule-based comparator
    - safety fallback alongside ML experts

### Yellow: reusable with constraints

- `nasa/LHASA`
  - repo contains:
    - `lhasa.py`
    - `lhasa.sh`
    - `lhasa.yml`
    - `model.json`
    - `LICENSE.pdf`
  - audited license file:
    - `NASA Open Source Agreement 1.3`
  - best use here:
    - regional hazard prior
    - offline comparison
    - rainfall-triggered global nowcast reference
  - constraint:
    - treat as a separate prior generator or reference implementation first

- `HydroPML/Dataset4LandslideNets`
  - repo README points dataset DOI to Zenodo
  - audited Zenodo license:
    - `CC BY-NC 4.0`
  - repo root does not expose a separate `LICENSE` file in the audited snapshot
  - best use here:
    - remote-sensing supplement dataset
  - constraint:
    - non-commercial data terms
    - code reuse status unclear

- `WRHGroup/PyLandslide`
  - repo license:
    - `GPL`
  - best use here:
    - susceptibility mapping reference
    - preprocessing / map-prior experiments
  - constraint:
    - not ideal as an embedded dependency for the main production stack

- `foundation-model-research/Kairos`
  - repo license:
    - `Apache-2.0`
  - best use here:
    - router and granularity-selection reference
    - expert-routing mechanism reference
  - constraint:
    - better as a matcher or router design reference than as the first production forecasting dependency

- `SalesforceAIResearch/gift-eval`
  - repo license:
    - `Apache-2.0`
  - best use here:
    - cross-model benchmark and replay reference
    - evaluation protocol reference for multi-domain forecasting
  - constraint:
    - upstream README frames it as research-oriented evaluation tooling; use as benchmark infrastructure, not as product logic

### Reference-only or method-first

- `2024 Yunnan geographic similarity`
  - use for:
    - region partitioning
    - geographic similarity scoring
    - sample construction
    - `FNR / FPR` business metrics

- `2025 Guangdong lithology-specific warning`
  - use for:
    - lithology-first expert partition
    - rainfall + geology + geotechnical feature set
    - explainability pattern
    - `hit rate / false alarm rate` reporting

- `2026 Zigui graded warning`
  - use for:
    - graded warning label policy
    - rainfall plus reservoir-response explanation
    - warning-level calibration reference
  - caveat:
    - monitoring data are sensitive or request-based rather than openly downloadable

- `2025 Sichuan radar-derived rainfall thresholds`
  - use for:
    - radar-rainfall prior features
    - threshold plus event-window construction reference
    - negative-window design reference
  - caveat:
    - supporting data are author-request rather than open download

- `2026 compound temporal precipitation patterns`
  - use for:
    - richer rainfall sequence descriptors
    - region-sensitive precipitation feature engineering
    - dynamic trigger-pattern features for matching and replay
  - caveat:
    - method and feature reference first; not a direct open dataset stack

- `2025 China coastal cross-region transfer`
  - use for:
    - source-target region transfer
    - domain-adaptation baseline for expert routing
    - cross-region susceptibility transfer reference

- `2026 soft-gating MoE spatial partition workflow`
  - use for:
    - learnable router design
    - expert partition training reference
    - gating-feature selection reference

- `seunghan96/cross-rag`
  - caveat:
    - repository license was not clearly surfaced in the audited pass
  - use for:
    - cross-attention retrieval fusion reference only
    - research comparison against simpler `RAFT` style retrieval

- `lorenzonava96/Landslide-Displacement-Forecasting-using-seven-Deep-Learning-architectures-and-monitoring-data`
  - audited repo contains:
    - code
    - sample `Data/df.csv`
  - caveat:
    - no explicit repo `LICENSE` file found in audited snapshot
  - use for:
    - feature layout reference
    - seven-model ablation reference
    - sample data schema reference

- `xupine/LandslideNet`
  - referenced by `Dataset4LandslideNets`
  - caveat:
    - no explicit repo `LICENSE` file found in the audited snapshot
  - use for:
    - architecture reference only

## Additional Mature OSS Worth Reusing

- `awslabs/gluonts`
  - license:
    - `Apache-2.0`
  - use:
    - probabilistic forecasting baselines
    - dataset schema / backtesting ideas

- `Nixtla/neuralforecast`
  - license:
    - `Apache License`
  - use:
    - fast local baselines
    - ablation over TCN / TFT / PatchTST / NHITS / NBEATSx

- `sktime/pytorch-forecasting`
  - license:
    - `MIT`
  - use:
    - quick TFT / DeepAR / NHiTS style baselines

- `unit8co/darts`
  - license:
    - `Apache License`
  - use:
    - rapid local experiments when we want one unified API

- `microsoft/torchgeo`
  - license:
    - `MIT`
  - use:
    - geospatial datasets
    - samplers
    - remote-sensing patch pipelines

- `IBM/terratorch`
  - license:
    - `Apache License`
  - use:
    - geospatial foundation-model fine-tuning framework
  - caution from upstream README:
    - users must verify external model licenses themselves

- `metarank/ltrlib`
  - use:
    - learning-to-rank reference for replay rerank
    - LambdaMART-style reranking logic
    - unbiased evaluation reference for candidate-set rerank
  - caution:
    - verify the exact repo license before taking it into the main production dependency path

## Integration Map To Current Repo

- online inference entry:
  - `services/ai-prediction-worker/src/index.ts`
- current OpenSpec line:
  - `openspec/changes/add-regional-landslide-model-baseline/`
- canonical routing identity:
  - `regionCode`
  - `slopeCode`
  - `stationCode`

## Current Offline Execution Scripts

- `validate-intake-landing.ts`
  - checks whether a raw landing root already satisfies the blocking family expectations from the intake manifest
  - should be the first gate after browser/manual download
- `normalize-china-event-catalogue.ts`
  - converts the raw China `2008-2024` release into a phase-1 `event_inventory_adapter` csv
  - keeps passthrough event fields while forcing only the minimal canonical inventory keys
- `normalize-baijiabao-unpacked.ts`
  - converts the unpacked `Baijiabao` package into long family csv files
  - keeps raw semantic hints so the displacement and reservoir semantics are not over-frozen too early

Recommended mapping:

- `Chronos-2 / Chronos-Bolt`
  - attach as `fallback` and `challenger`
- `Uni2TS / self-trained regional experts`
  - primary training / model-packaging path
  - use the framework, not the official `Moirai` non-commercial weights
- `TimesFM 2.5`
  - local small-sample adaptation lane
- `MOMENT`
  - representation and matching-embedding lane
- `IBM Granite TinyTimeMixer`
  - conditional low-resource challenger lane
- `fev`
  - offline replay rerank engine
- `RAFT`
  - first dynamic-retrieval baseline
- `Kairos`
  - matcher-router design reference
- `gift-eval`
  - secondary replay benchmark layer
- `USGS thresholds`
  - rule-based rainfall threshold comparator
- `LHASA`
  - region-level hazard prior generator
- `Sen12Landslides`
  - remote-sensing inventory and profile enrichment branch

## Phase-1 Minimal Open Stack Recommendation

| Lane | Primary choice | Repo role | Phase-1 rule |
| --- | --- | --- | --- |
| expert training mainline | `SalesforceAIResearch/uni2ts` | offline regional-expert training and artifact emission | use as the main self-trained expert lane, but ship only versioned artifacts into runtime |
| global fallback and challenger | `amazon-science/chronos-forecasting` with `Chronos-2 / Chronos-Bolt` | offline benchmark first, optional online global fallback later | do not let `Chronos` become the only main expert story |
| local takeover experiments | `google-research/timesfm` with `TimesFM 2.5` | small-sample local adaptation and challenger lane | useful, but must not block the first production route |
| low-resource challenger | `ibm-granite/granite-tsfm` with `Granite TinyTimeMixer` | optional low-resource regional package lane | use only as a pinned challenger because upstream maintenance commitment is weak |
| replay evaluation | `autogluon/fev` | rolling replay, leaderboard, and candidate comparison | make this the first replay metric surface before complex rerank logic |
| dynamic retrieval baseline | `archon159/RAFT` | first retrieval-style replay and similarity baseline | treat as simple dynamic retrieval reference, not as an immediate production dependency |
| routing and expert-selection design | `foundation-model-research/Kairos` | router and granularity-selection reference | reuse the routing ideas, not the whole stack |
| representation and embedding lane | `moment-timeseries-foundation-model/moment` | matching embedding and anomaly challenger reference | keep as a representation lane, not as the only phase-1 predictor |
| rule-based prior | `usgs/landslides-thresholds` | rainfall-threshold comparator and prior feature source | use as prior and safety comparator, not as the main predictor |
| region-level hazard prior | `nasa/LHASA` | offline regional hazard prior | keep as optional offline prior until license and dependency boundaries are rechecked |
| replay rerank reference | `SalesforceAIResearch/gift-eval` | secondary benchmark and evaluation-protocol reference | benchmark-only in phase 1 |

Phase-1 stack freeze:

- online runtime must continue to use local artifacts and TypeScript worker logic only
- do not introduce a new online Python inference service in phase 1
- self-trained regional experts plus explicit artifact metadata remain the primary route
- latest model-role freeze is:
  - `Chronos-2 / Chronos-Bolt` for `global fallback`
  - `Uni2TS` for the self-trained regional-expert training framework
  - `TimesFM 2.5` for local takeover and challenger work
  - `MOMENT` for retrieval embeddings and rerank-side representation
  - `Time-MoE / Kairos / Timer family` for benchmark or replay-only lanes, not as the main runtime dependency
- heuristic remains the final fallback even if global models are added
- any `NC`, GPL, or unclear-license asset stays outside the production runtime dependency set

## Avoided Detours

- Do not make `Chronos` the main expert library.
- Do not use `Moirai` non-commercial weights as the production final dependency without a licensing decision.
- Do not wait for `Retrieval-Augmented Forecasting`, `ICF`, or `Wasserstein dataset similarity` to become turnkey products.
- Do not anchor the first production path on remote-sensing foundation models.
- Do not pull unlicensed research repos directly into production code.

## Files

- `services/ai-prediction-worker/src/index.ts`
  - current online prediction entry
- `openspec/changes/add-regional-landslide-model-baseline/proposal.md`
  - baseline regional model route
- `openspec/changes/add-regional-landslide-model-baseline/design.md`
  - current design context
- `docs/journal/2026-04.md`
  - chronological research history

## Notes

- Update this note instead of creating a second near-duplicate regional model research note.
- Treat this note as the stable entry point for:
  - open-source due diligence
  - licensing caveats
  - direct reuse decisions
  - region-model-library technical references

## 2026-04-21 Acquisition Action Freeze

This is the current execution-grade acquisition order. It is no longer a vague research backlog.

| Priority | Asset | Current access mode | Immediate action | Canonical landing path | Repo role |
| --- | --- | --- | --- | --- | --- |
| 1 | `China landslide high-precision event catalogue 2008-2024` + extraction code | paper + DOI public, browser download still needs manual confirmation | open the paper DOI targets in a normal browser and pull both dataset and code packages | `.tmp/regional-model-library/raw/China-2008-2024-catalogue` | `event_inventory_adapter`, `Static Match`, replay truth |
| 2 | `CHM_PRE V2` | official paper says free access; TPDC likely interactive/login-gated | open DOI from the paper, register TPDC if required, then download the daily precipitation archive | `.tmp/regional-model-library/raw/CHM_PRE-V2` | rainfall backbone for nationwide replay and profile climate descriptors |
| 3 | `Baijiabao 2017-2024` | page advertises `直接下载 / FTP下载`, and the current direct HTTP endpoint is scriptable with the correct `Referer` | land the source zip first, then extract the Excel tables for displacement, crack, rainfall, and reservoir level | `china.threegorges` extension raw families | first practical `ThreeGorges` challenger / extension pack |
| 4 | `ThreeGorges station family` | mixed: `申请获取 / 登录获取 / 开放获取` | register NCDC, then request/download `白水河 / 八字门 / 树坪 / 新滩 / 链子崖` in the order `deformation -> rainfall -> reservoir -> groundwater -> temperature` | `.tmp/regional-model-library/raw/ThreeGorges/*` | primary long-horizon regional expert family |
| 5 | `Badong-Huangtupo official family` | mixed, with `申请获取` as the main path | register NCDC, submit the request from the surface-displacement seed page, then pull Beidou, rainfall, groundwater, and flow first | `.tmp/regional-model-library/raw/Badong-Huangtupo/*` | primary multi-sensor expert cluster with deferred side families |
| 6 | `Wanzhou 1950-2020 inventory + 18 factors` | direct download | download and unpack the zip immediately | `.tmp/regional-model-library/raw/Wanzhou` | static prior and profile enrichment for the `ThreeGorges` lane |
| 7 | `Luoyugou` | official `申请获取` | register NCDC and request displacement, rainfall, water level, and pore-pressure first | `.tmp/regional-model-library/raw/Luoyugou` | loess-region challenger and short-window joined experiment pack |

## 2026-04-21 Current Reuse Boundary

- runtime still must not depend on remote Python services
- runtime entry remains:
  - `services/ai-prediction-worker/src/index.ts`
- offline ingestion and canonicalization remain:
  - `libs/regional-model-library/*`
  - `scripts/dev/regional-model-library/*`
  - `.tmp/regional-model-library/*`
- immediate reusable open assets are now split by role:
  - event library:
    - `China landslide event catalogue + code`
  - rainfall backbone:
    - `CHM_PRE V2`
  - first-wave regional packs:
    - `ThreeGorges`
    - `Baijiabao`
    - `Badong-Huangtupo`
    - `Luoyugou`
  - static-prior side pack:
    - `Wanzhou`
  - vision side branch only:
    - `RLZX`
    - `CAS`

## 2026-04-21 Code Reuse Status

- `phase1-run.ts`
  - already supports:
    - `json`
    - `jsonl`
    - `ndjson`
    - `csv`
    - `xlsx`
    - `xls`
  - already fans out multi-sheet workbooks into family-level entries
- `ThreeGorges` and `Badong-Huangtupo`
  - now both preserve per-row family provenance through:
    - `rawRef.familyRefs`
    - per-family `role`
    - `joinKey`
    - `matchedBy`
  - now both emit `familyBreakdown` into the phase-1 summary and `RegionProfile.properties.join`
- `CanonicalTrainingSample`
  - now effectively carries label contract metadata through:
    - `labelMetadata.valueType`
    - `labelMetadata.derivationMode`
    - `labelMetadata.sourceField`
    - `labelMetadata.horizonSpec`

## 2026-04-21 CHM_PRE Execution Hardening

- current CHM_PRE implementation status is now executable rather than only conceptual:
  - `index-chm-pre-v2-raw.ts`
    - inventories `nc/tif/tiff/hdf`
    - classifies:
      - `daily-netcdf`
      - `monthly-total`
      - `annual-total`
  - `plan-chm-pre-v2-extracts.ts`
    - emits:
      - `by-event.jobs.json`
      - `by-region.jobs.json`
      - `extract-plan.report.json`
    - now distinguishes:
      - `missing_coordinates`
      - `invalid_event_ts`
      - `missing_bbox`
      - `invalid_bbox`
- smoke-tested facts now fixed:
  - CHM_PRE sample raw index:
    - `dailyNetcdf=1`
    - `monthlyTotal=1`
    - `annualTotal=1`
    - `unknown=0`
  - invalid extract-plan sample:
    - `invalidEventTsEvents=2`
    - `invalidBboxRegions=1`
- reuse boundary stays unchanged:
  - do not fold CHM_PRE into `phase1-run.ts`
  - do not flatten national grids into a single CSV
  - keep extractor as a later single-purpose offline script
- the best next reusable implementation unit remains:
  - `extract-chm-pre-v2.ts`
    - input:
      - `raw-index.json`
      - `by-event.jobs.json`
      - `by-region.jobs.json`
    - output:
      - extracted rainfall csv artifacts
      - extraction provenance report

## 2026-04-22 CHM_PRE Extractor Status

- `extract-chm-pre-v2.ts` is now present as the first executable `CHM_PRE` extraction orchestrator.
- the chosen reuse direction remains correct:
  - keep it as a single-purpose offline script
  - do not route it through `phase1-run.ts`
  - do not add a dedicated wrapper yet
- current script style stays aligned with the nearest repo templates:
  - `plan-chm-pre-v2-extracts.ts`
  - `index-chm-pre-v2-raw.ts`
  - `normalize-china-event-catalogue.ts`
- current environment blocker is now explicit instead of implicit:
  - dry-run can validate source selection and job quality
  - real execution is blocked cleanly when GDAL is absent
  - invalid planner jobs are reported separately from backend failures
- this means the next blocker is environment readiness, not script shape:
  - install GDAL on the extraction host
  - or pass a stable `--gdal-bin-dir`

## 2026-04-22 Latest Model And Data Refresh

### Model Reuse Refresh

- latest direct-reuse mainline freeze is now:
  - `Chronos-2 / Chronos-Bolt`
    - `global fallback`
  - `TimesFM 2.5`
    - `local takeover challenger`
  - `Uni2TS`
    - self-trained regional-expert framework only
  - `MOMENT`
    - embedding and retrieval representation
  - `FEV`
    - lightweight replay evaluation
  - `TIME`
    - newer task-centric replay or leaderboard workflow
- latest reference-only additions worth watching:
  - `TS-RAG`
    - retrieval-augmented routing or replay-side similarity ideas
  - `Kairos`
    - adaptive granularity router ideas
  - `Time-MoE`
    - MoE training and gating reference
  - `ProbTS`
    - heavier offline benchmark stack
- latest hard exclusion remains:
  - official `Moirai 2.0` pretrained weights
    - current blocker is still `cc-by-nc-4.0`
    - keep using `Uni2TS` framework, not those weights, on the production mainline

### China Data Reuse Refresh

- the best immediately reusable China-side external combination is still:
  - `China landslide catalogue 2008-2024`
  - `CHM_PRE V2`
- this pair now has an even clearer role split:
  - `China landslide catalogue 2008-2024`
    - `event_inventory_adapter`
    - replay truth
    - region onboarding prior
  - `CHM_PRE V2`
    - rainfall backbone
    - event join
    - climate descriptor support
- latest high-value public or login-gated support pack just below that pair:
  - `CMA` station rainfall
    - best station-level rainfall补强
  - `CLDAS-V2.0`
    - grid rainfall plus soil moisture and near-surface meteorology support
  - `DEM`
    - derive slope/aspect/relief locally
  - `CLCD`
    - static land-cover prior
  - `WISE30sec` China soil grids
    - static soil-property prior
- latest high-value request-only monitoring lead remains:
  - `Baijiabao`
    - still the most target-shaped external monitoring dataset for the current runtime structure
    - strongest non-public candidate because it is close to:
      - rainfall
      - reservoir level
      - GNSS displacement
      - station or point continuity
- latest caution update:
  - national-detail geohazard records from the `地质云` route should not be treated as near-term downloadable inputs
  - the official public reply now says the related data service is under maintenance with no fixed restore date

### Execution Consequence

- current acquisition and build priority now tightens further to:
  1. `China-2008-2024 catalogue`
  2. `CHM_PRE V2`
  3. `CMA rainfall / CLDAS`
  4. `DEM + CLCD + soil`
  5. request `Baijiabao`
- remote-sensing and event-only benchmark assets remain useful, but they still belong to:
  - `prior`
  - `replay`
  - side-branch inventory refinement
  not the first online expert path

## 2026-04-22 Backbone Intake Priority Refresh

- after the latest pass, the next five China-side data backbones are now formalized in code, not only in notes:
  - `CMA-station-rainfall`
  - `CLDAS-V2.0`
  - `GSCLOUD-DEM`
  - `CLCD-1985-2025`
  - `China-soil-property-rasters`
- their current repo roles should stay fixed:
  - `CMA-station-rainfall`
    - highest-priority station rainfall supplement
  - `CLDAS-V2.0`
    - grid weather and soil-moisture context backbone
  - `GSCLOUD-DEM`
    - source truth for elevation and terrain derivatives
  - `CLCD`
    - land-cover prior
  - `soil property rasters`
    - soil and hydrologic-sensitivity prior
- this means the current China-side acquisition order is effectively:
  1. `China-2008-2024 catalogue`
  2. `CHM_PRE V2`
  3. `CMA-station-rainfall`
  4. `CLDAS-V2.0`
  5. `DEM`
  6. `CLCD`
  7. `soil property rasters`
  8. request `Baijiabao`

## 2026-04-22 Replay Stack First Cut

- the current minimal replay stack is now more concrete:
  - train:
    - `train-linear-risk-model.ts`
  - evaluate:
    - `evaluate-linear-risk-model.ts`
      - can now optionally write replay summary back into:
        - `artifact.metadata.replaySummary`
  - later broader leaderboard:
    - `FEV`
    - `TIME`
- direct implication:
  - `FEV / TIME` are still the right next benchmark targets
  - but the repo no longer needs to wait for them before validating first local artifacts
- current best use split therefore stays:
  - local bridge now:
    - repo-native train/eval scripts
  - broader replay later:
    - `FEV`
    - `TIME`

## 2026-04-22 Runtime Integration Update

- the current highest-value runtime implementation gap is no longer the artifact bridge itself
- after this pass, the worker now has a first real historical-window base:
  - `6h`
  - `24h`
  - `72h`
- current runtime sourcing rule:
  - prefer `ClickHouse telemetry_raw`
  - merge the current message into the same window
  - degrade to `telemetry-only-v1` without breaking payload shape
- practical consequence:
  - next replay and model work should assume the runtime can now provide window evidence
  - the next real runtime bottleneck has shifted to:
    - true two-stage artifact/runtime
    - real-data artifact promotion

## 2026-04-22 Official-Source Reuse Refresh

### Model-side conclusion

- best immediate external reuse order after official-source verification is now:
  1. `FEV`
  2. `Chronos-Bolt`
  3. `Chronos-2`
  4. `TimesFM 2.5`
  5. `Uni2TS` framework only
  6. `MOMENT` embedding lane
  7. `TIME`
- latest official-source license conclusion:
  - `Chronos-2 / Chronos-Bolt`
    - `Apache-2.0`
  - `TimesFM 2.5`
    - `Apache-2.0`
  - `Uni2TS` framework
    - `Apache-2.0`
  - official `Moirai 2.0` weights
    - `CC-BY-NC-4.0`
    - keep excluded from production mainline
  - `MOMENT`
    - `MIT`
  - `FEV`
    - `Apache-2.0`
  - `TIME`
    - code `MIT`
    - benchmark dataset card `Apache-2.0`
- direct implication:
  - keep `FEV` as the first external replay benchmark lane
  - keep `Chronos-Bolt -> Chronos-2 -> TimesFM 2.5` as the most practical external challenger order
  - keep `Uni2TS` as framework only, not as a shortcut to official non-commercial weights

### China data-side conclusion

- official-source recheck now makes the acquisition order even tighter:
  1. `China landslide catalogue 2008-2024 + official extraction code`
  2. `CHM_PRE V2`
  3. `CLDAS-V2.0`
  4. `GSCLOUD DEM`
  5. `CLCD`
  6. `China soil property rasters`
  7. `CMA station rainfall`
  8. request or manually land `Baijiabao`
- latest practical interpretation:
  - `CMA station rainfall`
    - valuable, but should not block first-wave execution
    - better treated as second-stage station calibration / supplement
  - `Baijiabao`
    - keep as `ThreeGorges` extension pack rather than a nationwide backbone
  - `China catalogue + code`
    - remains the strongest official event-side reuse source because paper + data DOI + code DOI are all public
  - `CHM_PRE V2`
    - remains the strongest national rainfall backbone
  - `CLDAS-V2.0`
    - best next official dynamic weather-context supplement
  - `GSCLOUD DEM + CLCD + soil`
    - enough to fill terrain / land-cover / soil priors for `RegionProfile`

## 2026-04-22 Backbone Source Access Detail Refresh

- `CMA station rainfall`
  - primary official path:
    - `中国地面气候资料日值数据集（V3.0）`
    - `https://m.data.cma.cn/data/detail/dataCode/SURF_CLI_CHN_MUL_DAY_V3.0.html`
  - current interpretation:
    - use as station-rainfall calibration and supplement
    - do not let it block first-wave execution
  - current access note:
    - real-name registration / portal access is required
- `CLDAS-V2.0`
  - primary official path:
    - `https://k.data.cma.cn/mekb/?dataCode=NAFP_CLDAS2.0_NRT&r=data%2Fdetail`
  - current interpretation:
    - best official dynamic weather-context supplement
    - especially useful for `2017+ replay` and grid-side context
  - current access note:
    - registered portal access is required
- `DEM`
  - public fallback path worth keeping in mind:
    - `NASADEM_HGT.001`
    - `https://www.earthdata.nasa.gov/data/catalog/lpcloud-nasadem-hgt-001`
  - China-side first-choice operational path remains:
    - `GSCLOUD DEM`
  - current interpretation:
    - source truth for elevation and terrain derivatives
- `CLCD`
  - newest official open path worth preferring:
    - `CLCD 1985-2025`
    - `https://zenodo.org/records/18180184`
  - current interpretation:
    - static land-cover prior
    - can also support land-cover transition summaries
- `China soil property rasters`
  - current official path remains:
    - `https://www.ncdc.ac.cn/portal/metadata/3e5ce7b6-5989-45f5-84de-8b8ac61f4191`
  - current interpretation:
    - soil and hydrologic-sensitivity prior
  - current reuse note:
    - official release already includes attached preprocessing code, so this is both a data and code reuse source

## 2026-04-22 Execution-Grade Acquisition Buckets

- `direct landing now`
  - `China 2008-2024 catalogue + code`
    - strongest direct data+code reuse source
  - `CLCD`
    - prefer `Zenodo` direct download over mirror-first
  - `Baijiabao`
    - prefer the NCDC direct-download endpoint with metadata-page `Referer`; keep browser landing as fallback
- `registered portal access`
  - `CHM_PRE V2`
  - `CLDAS-V2.0`
  - `GSCLOUD DEM`
  - `China soil rasters`
  - `CMA station rainfall`
- current execution principle:
  - direct-download assets should be landed first so the mainline keeps moving
  - portal-gated assets should be parallelized through account registration, not allowed to block coding

### Current Minimum Reuse Units

- `China 2008-2024 catalogue + code`
  - land:
    - raw Chinese workbook
    - raw English workbook
    - released extraction-code archive
  - this is the strongest current `data + code` reuse pair for:
    - `event_inventory_adapter`
    - replay truth
    - region onboarding prior
- `CHM_PRE V2`
  - first useful landing unit should be:
    - one year or one time-slice of daily precipitation backbone
  - do not wait for national full-history flattening before using it for:
    - event rainfall join
    - region climate descriptors
- `CLCD`
  - prefer `Zenodo` direct download
  - first useful landing unit should be:
    - one province package plus classification workbook
- `China soil property rasters`
  - keep the official attached preprocessing code together with the rasters
  - first useful landing unit should be:
    - shallow hydrology-relevant layers such as:
      - `TAWC`
      - `BULK`
      - `CLPC`
      - `ORGC`
- `Baijiabao`
  - treat browser or FTP landing as the default operator path
  - first useful landing unit should be:
    - deformation
    - rainfall
    - reservoir or water-level
    workbook family pack

## 2026-04-22 Current Matcher Reuse Boundary

- the runtime matcher now already supports:
  - `candidate-set`
  - `metadata replay hook`
  - payload routing trace
- current repo-native replay contract is now fixed enough for reuse:
  - `evaluate-linear-risk-model.ts`
    - produces replay report
    - can write `artifact.metadata.replaySummary.primaryScore`
  - `model-matcher.ts`
    - consumes that score through `metadata-replay`
- this means the next replay-side external reuse should focus on:
  - `FEV`
    - producing stable replay summary
  - later `TIME`
    - broader benchmark view
- practical implication:
  - external replay frameworks do not need to replace the worker matcher
  - they mainly need to supply score summaries that can be written back into artifact metadata for rerank

## 2026-04-22 Baijiabao Join Coverage And Replay Baseline

- `Baijiabao`
  has now validated one full repo-native execution chain:
  - `normalized family join`
  - `future label derivation`
  - `temporal split`
  - `artifact training`
  - `validation replay`
  - `replaySummary writeback`
- current durable reuse fact after the join fix:
  - `rainfallCurrentMm`
    - `7303 / 7303`
  - `reservoirLevelM`
    - `7303 / 7303`
  - `crackDisplacementMm`
    - `2682 / 7303`
- practical meaning:
  - `rainfall / reservoir`
    - are now phase-1 usable covariates for the `ThreeGorges / Baijiabao` station expert
  - `crack`
    - is still auxiliary only
    - should not be promoted into the current phase-1 `requiredFeatureKeys`
- current first honest temporal baseline that can already feed the matcher is:
  - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-099-joinfix/registry.json`
- current preferred mainline baseline is now:
  - `.tmp/regional-model-library/out/artifacts/threegorges-baijiabao-temporal-035-explicit-no-crack/registry.json`
  - reason:
    - it encodes the same `3-feature` artifact as an explicit training policy via `--exclude-features crackDisplacementMm`
    - it no longer relies on a high coverage threshold to exclude `crack` indirectly
- current matcher-ready reuse value is:
  - `artifact.metadata.replaySummary.primaryScore`
    - written back from validation replay
- recommended mainline position:
  - keep the `3-feature` temporal artifact as the current `Baijiabao` execution baseline
  - treat `crack` as a later `auxiliary / challenger` branch until there is:
    - either a stable derived crack aggregate
    - or a verified long-horizon point-to-crack mapping

## 2026-04-22 CLCD RegionProfile Reuse Facts

- `CLCD`
  - is no longer only a landed static source
  - it now has a repo-native region extractor:
    - `scripts/dev/regional-model-library/build-clcd-region-profiles.ts`
- current local extraction backend is:
  - `geotiff + proj4`
- current reason:
  - `GISInternals.GDAL 3.12.1` is visible via `winget`
  - but the GISInternals download endpoint failed during automated install with:
    - `InternetOpenUrl() failed`
    - `0x80072efd`
  - so the first-wave `CLCD` path should not depend on system GDAL
- current first-wave default seeds are:
  - `CN-500101`
  - `CN-420528`
- current verified extraction outputs:
  - `CN-500101`
    - dominant class:
      - `Cropland`
    - next class:
      - `Forest`
    - current interpretation:
      - usable as a `Chongqing / Wanzhou-side` land-cover prior for `RegionProfile` and `Static Match`
  - `CN-420528`
    - dominant class:
      - `Forest`
    - next class:
      - `Cropland`
    - current interpretation:
      - usable as a `Three Gorges / Zigui-side` land-cover prior for `RegionProfile` and `Static Match`
- current reusable artifact shape is now concrete:
  - `RegionProfile.properties.staticFactors.landCover`
    - `dominantClass`
    - `classDistribution`
    - `validPixelCount`
    - `nodataPixelCount`
    - `bboxWgs84`
    - `bboxProjectedMeters`
    - `pixelWindow`
    - `sourceRaster`
- current boundary:
  - treat these outputs as:
    - `RegionProfile enrichment`
    - `Static Match land-cover prior`
  - do not treat them as:
    - online telemetry
    - direct training labels

## 2026-04-22 CHM_PRE Extraction Reuse Boundary After GDAL Fix

- `CHM_PRE`
  - current extraction script now auto-probes the workstation `GDAL` toolchain from:
    - explicit `--gdal-bin-dir`
    - `GDAL_BIN_DIR`
    - current `conda` prefix
    - sibling `conda envs/*gdal*`
    - common Windows conda prefixes
- current verified workstation resolution is:
  - `E:\2\Anaconda3\Anaconda\envs\gdal312\Library\bin`
- practical meaning:
  - the repo is no longer blocked on manually passing the GDAL bin directory every time
  - operator instructions can now treat this workstation as:
    - `GDAL ready`
- current real blocker moved to data validity:
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/original` is still absent
  - existing smoke fixtures under `.tmp/regional-model-library/smoke/chm-pre/original` are placeholder files
  - live extraction now fails with:
    - `not recognized as being in a supported file format`
- current execution implication:
  - do not spend more time on GDAL installation for this machine
  - spend the next unit on:
    - landing real `CHM_PRE` raw files
    - or generating valid smoke fixtures if a non-portal regression test is needed

## 2026-04-22 CLCD Contract Drift Fix

- current code truth for CLCD-derived land-cover priors is:
  - `RegionProfile.properties.staticFactors.landCover`
- stale target strings that still pointed to:
  - `RegionProfile.landCoverClass`
  have now been aligned in:
  - `scripts/dev/regional-model-library/intake-manifest-templates.ts`
  - current `.tmp` intake manifests
  - `memory/references/regional-model-library-schema-v0.md`
- practical implication:
  - downstream `RegionProfile enrichment`
  - static matcher prior consumption
  can now assume one consistent path instead of dual old/new aliases

## 2026-04-22 Land-Cover Prior Runtime Contract

- current smallest runtime contract is now executable:
  - region side:
    - `RegionProfile.properties.staticFactors.landCover`
    carried into `stationMetadata / metadata`
  - artifact side:
    - `artifact.metadata.landCoverAffinity`
- current recommended minimal artifact shape is:
  - `preferredClasses`
  - `classWeights`
- example:
  - `preferredClasses = ["Forest"]`
  - `classWeights.Forest = 1.0`
- reason:
  - this is the narrowest shape that the matcher can use for:
    - dominant-class match
    - class-distribution overlap
  without introducing a new runtime subsystem

## 2026-04-22 CHM_PRE Manual Landing Request Boundary

- current local search found no real `CHM_PRE` raw assets
- so if operator manual download is needed, the smallest useful manual landing set should be:
  1. one real `daily-netcdf` slice
  2. one real `monthly-total` GeoTIFF slice
  3. optional one `annual-total` HDF slice
- expected landing root remains:
  - `.tmp/regional-model-library/raw/CHM_PRE-V2/original`
- expected family subdirectories remain:
  - `daily-netcdf`
  - `monthly-total`
  - `annual-total`
- practical implication:
  - do not ask the operator for the full national stack first
  - ask for the smallest real slice that can validate:
    - raw index
    - by-region extraction
    - by-event extraction

## 2026-04-22 Additional Open Reuse Assets After Fourth Pass

- [`GDCLD` high-resolution earthquake-landslide dataset](https://doi.org/10.5281/zenodo.13612636) plus [official code release](https://doi.org/10.5281/zenodo.13956757)
  - access status:
    - direct download
    - `CC BY 4.0`
  - direct reuse position:
    - `patch inventory / segmentation challenger`
    - cross-region visual pretraining
    - China-side replay evidence for `Luding / Jiuzhaigou / Mainling`
  - execution note:
    - keep it on the vision side branch, not on the first online warning path
- [`SAR-LRA` open SAR rapid landslide assessment code](https://doi.org/10.5281/zenodo.14898556)
  - access status:
    - direct download
    - `CC BY 4.0`
  - direct reuse position:
    - event-response challenger
    - cloudy-scene fallback mapping
    - external comparator for rapid inventory generation
  - execution note:
    - use as a challenger or replay-side comparator, not as the first core production dependency

## 2026-04-23 Browser-Only Formal Intake Boundary

- current browser-first boundary should be treated as stable for:
  - `Beijing-2023`
  - `Zixing-2024`
  - `China-2008-2024-catalogue`
- practical reason:
  - this workstation can resolve the public paper and DOI landing pages
  - but anonymous CLI access to Springernature/Figshare `ndownloader` paths still returns `403`
- direct consequence:
  - use:
    - `paper / DOI page -> browser download -> repo landing path`
  - do not keep investing time in anonymous CLI downloader retries for these three assets
- current repo landing targets to preserve:
  - `Beijing-2023`
    - `.tmp/regional-model-library/raw/Beijing-2023/source/downloads/beijing-2023-dataset.zip`
  - `Zixing-2024`
    - `.tmp/regional-model-library/raw/Zixing-2024/source/downloads/zixing-2024-dataset.zip`
    - optional `.tmp/regional-model-library/raw/Zixing-2024/source/downloads/zixing-2024-code-main.zip`
  - `China-2008-2024-catalogue`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-dataset.zip`
    - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-code.zip`
- verified reference entry points:
  - Beijing paper:
    - `https://www.nature.com/articles/s41597-024-03901-0`
  - Beijing DOI / data landing:
    - `https://doi.org/10.6084/m9.figshare.26878327`
  - Zixing paper:
    - `https://www.nature.com/articles/s41597-025-05670-w`
  - Zixing DOI / data landing:
    - `https://doi.org/10.6084/m9.figshare.27960762`
  - Zixing companion code:
    - `https://github.com/klaus2023/RLZX-landslide-inventory-and-landslide-detection-datasets`
  - China catalogue paper:
    - `https://www.nature.com/articles/s41597-026-07066-w`
  - China catalogue data DOI:
    - `https://doi.org/10.6084/m9.figshare.29603420`
  - China catalogue code DOI:
    - `https://doi.org/10.6084/m9.figshare.31298212`
- current validator state after the 2026-04-23 fixes:
  - missing-package reports now stay honest for:
    - `.tmp/regional-model-library/intake-validation/Beijing-2023.validation.json`
    - `.tmp/regional-model-library/intake-validation/Zixing-2024.validation.json`
    - `.tmp/regional-model-library/intake-validation/China-2008-2024-catalogue.validation.json`
  - normalized event inventory family-split smoke now passes at:
    - `.tmp/regional-model-library/smoke/intake-validator/beijing-family-split.report.json`
  - `.gdb` directory-shaped source intake now passes for Wanzhou smoke at:
    - `.tmp/regional-model-library/smoke/intake-validator/wanzhou-gdb.report.json`

## 2026-04-23 Manual Browser Drop Proven Working

- the browser-only operator path has now been executed successfully on this workstation for:
  - `Beijing-2023`
  - `Zixing-2024`
  - `China-2008-2024-catalogue`
- successful landed package names observed from the operator drop:
  - `26878327.zip`
  - `RLZX.zip`
  - `29603420.zip`
  - `31298212.zip`
- practical ingestion rule is now stronger:
  - keep the browser/manual step only for download
  - after the files appear locally, the repo can finish:
    - canonical move
    - unpack
    - family materialization
    - validation
    - catalogue normalization
- current verified post-drop repo state:
  - `Beijing-2023`
    - formal intake validation:
      - `pass`
    - source archive:
      - `.tmp/regional-model-library/raw/Beijing-2023/source/downloads/beijing-2023-dataset.zip`
    - authoritative landed family:
      - `.tmp/regional-model-library/raw/Beijing-2023/original/event-inventory/Point_RLBJ.*`
      - `.tmp/regional-model-library/raw/Beijing-2023/original/event-inventory/Polygon_RLBJ.*`
  - `Zixing-2024`
    - formal intake validation:
      - `pass`
    - source archive:
      - `.tmp/regional-model-library/raw/Zixing-2024/source/downloads/zixing-2024-dataset.zip`
    - authoritative landed family:
      - `.tmp/regional-model-library/raw/Zixing-2024/original/event-inventory/RLZX-LIM.*`
    - companion code unpacked under:
      - `.tmp/regional-model-library/raw/Zixing-2024/original/code/`
  - `China-2008-2024-catalogue`
    - formal intake validation:
      - `warn`
    - current reason:
      - validator still reports the derived-artifact check as advisory-only
    - source archives:
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-dataset.zip`
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/source/downloads/china-catalogue-code.zip`
    - materialized catalogue files:
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/catalogue/catalogue-zh.xlsx`
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/catalogue/catalogue-en.xlsx`
    - normalized output:
      - `.tmp/regional-model-library/raw/China-2008-2024-catalogue/normalized/phase1-event-inventory.csv`
      - current normalized row count:
        - `1582`
- current blocker transition is now explicit:
  - the blocker is no longer:
    - package acquisition
  - the blocker is now:
    - event-inventory normalization policy for `Beijing-2023` and `Zixing-2024`
  - because their currently surfaced DBF fields are geometry and class oriented, not full event metadata:
    - `Beijing-2023`
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
      - `Classname`
      - `Classvalue`
      - `Area`
      - `Perimeter`

## 2026-04-23 Formal Replay Execution Facts After Normalization Closure

- the `Beijing-2023` and `Zixing-2024` event inventories are no longer just landed raw packages; they are now reusable replay-ready normalized inventories with stable scripts:
  - `scripts/dev/regional-model-library/normalize-beijing-2023-event-inventory.ts`
  - `scripts/dev/regional-model-library/normalize-zixing-2024-event-inventory.ts`
  - shared helper:
    - `scripts/dev/regional-model-library/shapefile-utils.ts`
- current normalization reuse rule is now explicit:
  - `Beijing-2023`
    - use the authoritative point inventory as truth:
      - `Point_RLBJ.shp`
    - join county from the packaged county boundary shapefile:
      - `县级 - 副本.shp`
    - encode county into `region_code`
  - `Zixing-2024`
    - use the authoritative polygon inventory as truth:
      - `RLZX-LIM.shp`
    - compute polygon centroid
    - reproject from:
      - `WGS_1984_UTM_Zone_49N`
      - into `WGS84`
    - keep one fixed region:
      - `cn:湖南省:郴州市:资兴市`
- reusable execution fact:
  - `CHM_PRE-V2` minimal replay backbone already on disk is sufficient for:
    - `Beijing-2023`
    - `Zixing-2024`
  - currently indexed files:
    - `daily-netcdf/CHM_PRE_V2_daily_2023.nc`
    - `daily-netcdf/CHM_PRE_V2_daily_2024.nc`
    - `monthly-total/CHM_PRE_V2_monthly.tif`
    - `annual-total/CHM_PRE_V2_annual.tif`
- the replay stack is now proven executable end to end at canary scale:
  - plan:
    - by-event jobs for positive windows pass
    - negative-window plans pass
  - extract:
    - positive and negative CHM_PRE daily-window CSVs pass
  - build:
    - event replay pack JSON and JSONL pass
  - train:
    - canary linear artifacts pass with correct `scopeKey`
- canary proof outputs worth reusing as smoke evidence:
  - `Beijing-2023`
    - positive extract:
      - `.tmp/regional-model-library/raw/Beijing-2023/extracts/chm-pre-v2-canary-rerun/by-event/Beijing-2023-8922.7d.csv`
    - replay pack:
      - `.tmp/regional-model-library/raw/Beijing-2023/canary/replay-pack/event-replay-pack.json`
    - artifact:
      - `.tmp/regional-model-library/raw/Beijing-2023/canary/artifact/Beijing-2023-canary.json`
    - proven scope:
      - `cn:北京市:北京市:房山区`
  - `Zixing-2024`
    - positive extract:
      - `.tmp/regional-model-library/raw/Zixing-2024/extracts/chm-pre-v2-canary/by-event/Zixing-2024-1.7d.csv`
    - replay pack:
      - `.tmp/regional-model-library/raw/Zixing-2024/canary/replay-pack/event-replay-pack.json`
    - artifact:
      - `.tmp/regional-model-library/raw/Zixing-2024/canary/artifact/Zixing-2024-canary.json`
    - proven scope:
      - `cn:湖南省:郴州市:资兴市`
- current operational matcher fact confirmed by code inspection plus canary artifact proof:
  - `county` by itself is metadata only
  - `region_code` is the actual runtime routing key used by:
    - pack identity
    - artifact scope
    - runtime artifact lookup
  - therefore county-level region refinement is worth doing only when it changes `region_code`
- current hard boundary for full-run reuse:
  - do not train `Beijing-2023` as one mixed-county artifact under the current runtime rules
  - reason:
    - mixed-county training drops `scopeKey` to `null`
    - current runtime registry performs exact region lookup and will not resolve that artifact as a county expert
- current full-run blocker is now an execution-shape blocker, not a research blocker:
  - the present extractor is per-event-window and full Beijing plus Zixing would explode into around `10^5` small extraction jobs
  - the right next reuse step is:
    - split Beijing by `region_code`
    - keep Zixing single-region
    - add batched or orchestrated full-run execution before attempting the full formal replay build

## 2026-04-23 Batched Replay Reuse Layer

- the execution layer now has reusable tooling for the full formal replay path without changing the existing architecture:
  - `extract-chm-pre-v2-batched.ts`
    - wraps the existing extractor and runs jobs in bounded batches
    - persists per-batch reports under:
      - `batch-reports/`
    - writes aggregate state to:
      - `extraction-batched-report.json`
  - `split-event-inventory-by-region.ts`
    - turns one normalized event inventory into deterministic per-`region_code` CSVs plus:
      - `split-index.json`
  - `run-event-replay-pack-by-region.ts`
    - reads a prior split root and drives the existing replay pipeline per region
- reuse rule is now cleaner:
  - keep:
    - `run-event-replay-pack-pipeline.ts`
    as the authoritative single-pack orchestrator
  - add:
    - batch execution through `--extract-batch-size`
    - region fan-out through `run-event-replay-pack-by-region.ts`
  - do not fork a second replay architecture
- integrated proof now exists that the new batch layer is compatible with the current mainline pipeline:
  - `Beijing-2023`
    - `.tmp/regional-model-library/out/replay-packs/beijing-2023-batched-canary/event-replay-pack.json`
  - `Zixing-2024`
    - `.tmp/regional-model-library/out/replay-packs/zixing-2024-batched-canary/event-replay-pack.json`
- integrated proof now exists that the region-split runner is compatible with the current mainline pipeline:
  - `.tmp/regional-model-library/out/replay-packs/beijing-2023-by-region-canary/run-by-region.report.json`
- current recommended formal execution order is therefore updated to:
  1. `Zixing-2024`
     - full replay with batched extraction through the existing pipeline
  2. `Beijing-2023`
     - split by `region_code`
     - execute county by county through the region runner
  3. only after those two stabilize:
     - consider any further extractor-level performance rewrite

## 2026-04-26 Badong-Huangtupo Open Pack Reuse Facts

- the current Badong-Huangtupo official open-access cluster is no longer limited to seven normalized packs
- a related-page scan found:
  - `35` related UUIDs
  - `11` `open-access`
  - `15` `apply-access`
  - `9` non-metadata or server-error UUIDs
- all `11` open-access Badong-Huangtupo monitoring entries found in this pass have been downloaded, extracted, and normalized
- normalized family output root:
  - `.tmp/regional-model-library/raw/Badong-Huangtupo/normalized/phase1-families/`
- current normalized output count:
  - `12`
- current normalized row count:
  - `144642`
- newly added open-access families in this pass:
  - `pore-pressure`
    - NCDC:
      - `9249c3ce-d96a-40a2-b9b9-ec0b31bab32b`
    - rows:
      - `17269`
  - `cave-crack`
    - NCDC:
      - `c6586768-6071-4fa6-805e-d4ef5c97d3dc`
    - rows:
      - `11600`
  - `weather-rainfall`
    - NCDC:
      - `f79afeb9-8239-4e23-ac2a-c0c5e132a354`
    - rows:
      - `3783`
  - `groundwater-depth`
    - NCDC:
      - `7a3f6751-d758-4639-9686-0b1da4ff3ed5`
    - rows:
      - `974`
  - `groundwater-temperature`
    - NCDC:
      - `7a3f6751-d758-4639-9686-0b1da4ff3ed5`
    - rows:
      - `975`
- updated normalizer:
  - `scripts/dev/regional-model-library/normalize-badong-huangtupo-open-pack.py`
- current interpretation:
  - Badong-Huangtupo is now a real multi-sensor regional support-set candidate
  - it can support displacement, crack/deformation auxiliary, hydrologic, groundwater, rainfall, temperature, and tunnel-flow context experiments
  - it still should not be described as complete full-period coverage because the open-access files are example slices for selected years/sensors
- application-gated files remain high priority:
  - Badong cave rainfall:
    - `f267a98f-a2f0-4db1-89db-2f9458473991`
  - Huangtupo surface displacement:
    - `0c3020e1-d792-4dd1-a820-2dd48dfde62f`
  - Three Gorges Baishuihe / Bazimen / Xintan deformation-rainfall-reservoir packs:
    - `8b610f07-addf-478c-b288-18df4f205fd0`
    - `a5651f2a-bccc-4de4-aeb2-4db70bf76a2e`
    - `0aaf6e26-fce1-4d3b-a160-777827d94cd4`

## 2026-04-26 Badong-Huangtupo Phase-1 Reuse Boundary

- Current reusable phase-1 core for Badong-Huangtupo is now:
  - displacement as required feature family
  - weather rainfall as optional context
  - cave crack as optional context
- Do not require these families for the first product-aligned displacement model:
  - groundwater depth
  - groundwater temperature
  - pore pressure
  - tunnel settlement
  - tunnel flow
  - slip-belt temperature / water content
  - cave-water temperature
- Current generated core sample report:
  - `.tmp/regional-model-library/out/badong-huangtupo/core-samples/badong-huangtupo-core-sample-factory.report.json`
- Current generated baseline report:
  - `.tmp/regional-model-library/out/artifacts/badong-huangtupo-core-displacement-baseline/badong-huangtupo-core-displacement-baseline.report.json`
- Reuse interpretation:
  - the open-access Badong-Huangtupo data is valuable for proving region-pack extensibility and support-set onboarding
  - it is not yet the main high-metric displacement model because the current best validation model is `zero-delta-persistence`
  - keep deferred sensor families for future ablation, explanation, or mechanistic challenger tasks rather than forcing them into the software field contract now
