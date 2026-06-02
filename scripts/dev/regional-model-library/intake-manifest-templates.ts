import type { RawDatasetIntakeManifest } from "../../../libs/regional-model-library/src";

export const FIRST_WAVE_INTAKE_MANIFESTS: RawDatasetIntakeManifest[] = [
  {
    datasetKey: "China-2008-2024-catalogue",
    displayName: "China landslide high-precision event catalogue 2008-2024",
    sourceKind: "event-catalogue",
    rawLandingRoot: ".tmp/regional-model-library/raw/China-2008-2024-catalogue",
    repoRoles: ["event_inventory_adapter", "Static Match", "replay truth", "region onboarding prior"],
    accessPlan: {
      mode: "browser-doi",
      primarySource: "https://doi.org/10.6084/m9.figshare.29603420",
      backupSources: [
        "https://www.nature.com/articles/s41597-026-07066-w",
        "https://doi.org/10.6084/m9.figshare.31298212"
      ],
      downloadTargets: [
        {
          targetKey: "dataset-archive",
          displayName: "China catalogue dataset archive",
          url: "https://springernature.figshare.com/ndownloader/articles/29603420/versions/1",
          relativeOutFile: "source/downloads/china-catalogue-dataset.zip",
          required: true,
          notes: [
            "Current direct archive URL resolved from the article-linked figshare landing page."
          ]
        },
        {
          targetKey: "code-archive",
          displayName: "China catalogue extraction code archive",
          url: "https://figshare.com/ndownloader/articles/31298212/versions/1",
          relativeOutFile: "source/downloads/china-catalogue-code.zip",
          required: true
        }
      ],
      immediateActions: [
        "Open the Scientific Data paper and both figshare DOIs in a normal browser.",
        "Download the dataset archive and the extraction-code archive together.",
        "Preserve the raw download package and unpack into a read-only source subdirectory before field normalization."
      ],
      constraints: [
        "Automated anonymous access may still hit figshare restrictions.",
        "Do not rewrite source event IDs during initial landing."
      ]
    },
    families: [
      {
        familyKey: "event-catalogue",
        displayName: "China landslide event catalogue",
        stage: "event-library",
        rawLandingRelative: "catalogue",
        expectedFormats: ["csv", "xlsx", "json"],
        selectionHints: {
          preferredFileNames: ["catalogue-zh.xlsx", "catalogue-en.xlsx"],
          preferredFilePatterns: ["*catalogue*.xlsx", "*catalog*.xlsx"]
        },
        schemaHints: {
          timeFieldCandidates: ["发生时间", "event_time", "event_ts", "date"],
          identityFieldCandidates: [
            "唯一滑坡事件ID",
            "滑坡事件ID",
            "event_id",
            "report_id",
            "province",
            "city",
            "county",
            "longitude",
            "latitude",
            "location"
          ],
          valueFieldCandidates: ["death_count", "injury_count", "economic_loss"],
          passthroughFieldCandidates: [
            "time_precision",
            "space_precision",
            "news_title",
            "source_url",
            "news_text"
          ]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["event", "region"],
          joinKeyFieldCandidates: ["event_id", "report_id", "province", "city", "county", "longitude", "latitude"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "event"
        },
        adapterBinding: "event_inventory_adapter",
        requiredFieldMappings: [
          {
            rawField: "source event id / report id",
            canonicalTarget: "eventId / rawRef.sourceRecordKey",
            required: true,
            notes: "Prefer a stable source event identifier; fallback to report-level composite key."
          },
          {
            rawField: "event time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "time precision",
            canonicalTarget: "timePrecision",
            required: true
          },
          {
            rawField: "province/city/county",
            canonicalTarget: "location.region hierarchy",
            required: true
          },
          {
            rawField: "longitude / latitude or place name",
            canonicalTarget: "location.coordinates or geocoding seed",
            required: true
          }
        ],
        optionalFieldMappings: [
          {
            rawField: "trigger type summary",
            canonicalTarget: "triggerType / metadata.triggerSummary",
            required: false
          },
          {
            rawField: "news title / source url",
            canonicalTarget: "metadata.title / metadata.sourceUrl",
            required: false
          }
        ],
        notes: [
          "Keep raw titles and URLs for replay QA.",
          "Geocoding and dedup remain a second pass; first landing should preserve source text."
        ]
      },
      {
        familyKey: "extraction-code",
        displayName: "event catalogue extraction code",
        stage: "metadata",
        rawLandingRelative: "code",
        expectedFormats: ["zip", "py", "ipynb"],
        selectionHints: {
          preferredFilePatterns: ["*.py", "*.ipynb", "*.json", "*.md"]
        },
        requiredFieldMappings: [],
        notes: [
          "This is a reuse/reference family, not direct model input.",
          "Keep it versioned with the source DOI for later production hardening."
        ]
      }
    ]
  },
  {
    datasetKey: "CHM_PRE-V2",
    displayName: "CHM_PRE V2 China daily precipitation grid 1960-2023",
    sourceKind: "rainfall-grid",
    rawLandingRoot: ".tmp/regional-model-library/raw/CHM_PRE-V2",
    repoRoles: ["rainfall backbone", "replay join", "RegionProfile climate descriptor"],
    accessPlan: {
      mode: "browser-doi",
      primarySource: "https://doi.org/10.11888/Atmos.tpdc.300523",
      backupSources: ["https://essd.copernicus.org/articles/17/3987/2025/essd-17-3987-2025.html"],
      immediateActions: [
        "Open the ESSD paper and TPDC DOI in a normal browser.",
        "Register TPDC if login is required, then download the daily precipitation archive.",
        "Keep raw grid files unchanged and stage a second pass for region/window extraction."
      ],
      constraints: [
        "TPDC download flow may be interactive.",
        "Grid precipitation is coarse for a single slope; use as a backbone, not a replacement for local gauges."
      ]
    },
    families: [
      {
        familyKey: "daily-grid",
        displayName: "daily precipitation grid",
        stage: "rainfall-backbone",
        rawLandingRelative: "daily-grid",
        expectedFormats: ["nc", "tif", "hdf", "csv"],
        selectionHints: {
          archiveSubpaths: ["original/daily-netcdf", "original/monthly-total", "original/annual-total"],
          preferredFilePatterns: ["*.nc", "*.tif", "*.tiff", "*.hdf"]
        },
        schemaHints: {
          timeFieldCandidates: ["time", "date", "day"],
          identityFieldCandidates: ["grid_id", "lon", "lat"],
          valueFieldCandidates: ["pre", "precipitation", "tp", "rainfall_mm"],
          passthroughFieldCandidates: ["source_version", "quality_flag"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["grid"],
          joinKeyFieldCandidates: ["grid_id", "lon", "lat", "time"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "day",
          granularity: "daily"
        },
        valueSemantics: {
          valueType: "number",
          unit: "mm",
          semanticVariant: "daily_precipitation"
        },
        requiredFieldMappings: [
          {
            rawField: "date",
            canonicalTarget: "gridDay",
            required: true
          },
          {
            rawField: "grid longitude / latitude",
            canonicalTarget: "gridCell",
            required: true
          },
          {
            rawField: "daily precipitation",
            canonicalTarget: "rainfallDailyMm",
            required: true
          }
        ],
        optionalFieldMappings: [
          {
            rawField: "version / quality flags",
            canonicalTarget: "metadata.version / metadata.quality",
            required: false
          }
        ],
        notes: [
          "Do not flatten the national grid into pack-specific tables during raw landing.",
          "Derive region and event joins in a second pass from this backbone."
        ]
      }
    ]
  },
  {
    datasetKey: "Beijing-2023",
    displayName: "Beijing July 2023 rainfall-triggered landslide inventory",
    sourceKind: "event-catalogue",
    rawLandingRoot: ".tmp/regional-model-library/raw/Beijing-2023",
    repoRoles: ["replay", "event prior", "regional benchmark"],
    accessPlan: {
      mode: "direct-download",
      primarySource:
        "https://springernature.figshare.com/articles/dataset/Inventory_of_shallow_landslides_triggered_by_extreme_precipitation_in_July_2023_in_Beijing_China/26878327",
      downloadTargets: [
        {
          targetKey: "dataset-archive",
          displayName: "Beijing 2023 dataset archive",
          url: "https://springernature.figshare.com/ndownloader/articles/26878327/versions/1",
          relativeOutFile: "source/downloads/beijing-2023-dataset.zip",
          required: true,
          notes: [
            "Current archive URL resolved from the Springer Nature figshare landing page.",
            "Browser download is the expected operator path when anonymous CLI download is blocked."
          ]
        }
      ],
      backupSources: [
        "https://www.nature.com/articles/s41597-024-03901-0"
      ],
      immediateActions: [
        "Open the Scientific Data paper or figshare landing page in a normal browser and download the dataset archive.",
        "Keep the original archive and unpack it under the Beijing replay root before any renaming.",
        "Normalize one authoritative event csv for replay-pack construction, but preserve the original shapefile or workbook beside it."
      ],
      constraints: [
        "Automated anonymous access may still hit figshare restrictions on this workstation.",
        "Treat this dataset as an event-level replay pack, not as a long-running station-timeseries expert source.",
        "Negative windows and rainfall joins must still be derived locally."
      ]
    },
    families: [
      {
        familyKey: "event-inventory",
        displayName: "Beijing 2023 landslide event inventory",
        stage: "authoritative",
        rawLandingRelative: "original/event-inventory",
        expectedFormats: ["csv", "xlsx", "xls", "shp", "geojson", "gpkg"],
        selectionHints: {
          preferredFilePatterns: ["*beijing*2023*", "*inventory*", "*.shp", "*.geojson", "*.xlsx"]
        },
        schemaHints: {
          timeFieldCandidates: ["event_time", "event_ts", "date", "发生时间"],
          identityFieldCandidates: ["event_id", "id", "region_code", "longitude", "latitude", "county"],
          valueFieldCandidates: ["trigger", "hazard_type"],
          passthroughFieldCandidates: ["location_text", "time_precision", "space_precision", "source_url"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["event", "region"],
          joinKeyFieldCandidates: ["event_id", "longitude", "latitude", "county", "event_ts"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "event"
        },
        adapterBinding: "event_inventory_adapter",
        requiredFieldMappings: [
          {
            rawField: "event id",
            canonicalTarget: "eventId / rawRef.sourceRecordKey",
            required: true
          },
          {
            rawField: "event time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "longitude / latitude",
            canonicalTarget: "location.coordinates",
            required: true
          },
          {
            rawField: "county / district",
            canonicalTarget: "regionCode seed",
            required: true
          }
        ],
        optionalFieldMappings: [
          {
            rawField: "trigger summary",
            canonicalTarget: "triggerSummary",
            required: false
          }
        ],
        notes: [
          "This is the preferred northern-China rainfall replay benchmark.",
          "Keep the authoritative normalized event csv under normalized/phase1-event-inventory.csv once landed."
        ]
      }
    ]
  },
  {
    datasetKey: "Zixing-2024",
    displayName: "Zixing July 2024 rainfall-triggered landslide inventory",
    sourceKind: "event-catalogue",
    rawLandingRoot: ".tmp/regional-model-library/raw/Zixing-2024",
    repoRoles: ["replay", "event prior", "regional benchmark"],
    accessPlan: {
      mode: "mixed",
      primarySource: "https://doi.org/10.6084/m9.figshare.27960762",
      downloadTargets: [
        {
          targetKey: "dataset-archive",
          displayName: "Zixing 2024 dataset archive",
          url: "https://springernature.figshare.com/ndownloader/files/50973759",
          relativeOutFile: "source/downloads/zixing-2024-dataset.zip",
          required: true,
          notes: [
            "Current file URL resolved from the figshare landing page download action.",
            "Browser download is the expected operator path when anonymous CLI download is blocked."
          ]
        },
        {
          targetKey: "code-archive",
          displayName: "Zixing companion code archive",
          url: "https://github.com/klaus2023/RLZX-landslide-inventory-and-landslide-detection-datasets/archive/refs/heads/main.zip",
          relativeOutFile: "source/downloads/zixing-2024-code-main.zip",
          required: false,
          notes: [
            "Optional reference-only archive mirrored from the public GitHub repository default branch."
          ]
        }
      ],
      backupSources: [
        "https://www.nature.com/articles/s41597-025-05670-w",
        "https://github.com/klaus2023/RLZX-landslide-inventory-and-landslide-detection-datasets"
      ],
      immediateActions: [
        "Open the Scientific Data paper or figshare landing page in a normal browser and download the dataset archive.",
        "If useful, also mirror the public GitHub repository archive as reference-only metadata.",
        "Mirror the companion code repository as metadata/reference, not as source truth.",
        "Normalize the authoritative event inventory first; keep detection-side assets separate from replay truth."
      ],
      constraints: [
        "Automated anonymous access may still hit figshare restrictions on this workstation.",
        "Do not mix the vision/detection branch into the event-truth branch during raw landing.",
        "Use this dataset first as an event-level replay pack."
      ]
    },
    families: [
      {
        familyKey: "event-inventory",
        displayName: "Zixing 2024 landslide event inventory",
        stage: "authoritative",
        rawLandingRelative: "original/event-inventory",
        expectedFormats: ["csv", "xlsx", "xls", "shp", "geojson", "gpkg"],
        selectionHints: {
          preferredFilePatterns: ["*zixing*2024*", "*inventory*", "*.shp", "*.geojson", "*.xlsx"]
        },
        schemaHints: {
          timeFieldCandidates: ["event_time", "event_ts", "date", "发生时间"],
          identityFieldCandidates: ["event_id", "id", "region_code", "longitude", "latitude", "county"],
          valueFieldCandidates: ["trigger", "hazard_type"],
          passthroughFieldCandidates: ["location_text", "time_precision", "space_precision", "source_url"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["event", "region"],
          joinKeyFieldCandidates: ["event_id", "longitude", "latitude", "county", "event_ts"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "event"
        },
        adapterBinding: "event_inventory_adapter",
        requiredFieldMappings: [
          {
            rawField: "event id",
            canonicalTarget: "eventId / rawRef.sourceRecordKey",
            required: true
          },
          {
            rawField: "event time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "longitude / latitude",
            canonicalTarget: "location.coordinates",
            required: true
          },
          {
            rawField: "county / district",
            canonicalTarget: "regionCode seed",
            required: true
          }
        ],
        optionalFieldMappings: [
          {
            rawField: "trigger summary",
            canonicalTarget: "triggerSummary",
            required: false
          }
        ],
        notes: [
          "Keep the event inventory as the authoritative replay branch.",
          "Remote-sensing detection assets should remain a side branch until explicitly wired."
        ]
      },
      {
        familyKey: "detection-code",
        displayName: "Zixing 2024 companion detection code",
        stage: "metadata",
        rawLandingRelative: "original/code",
        expectedFormats: ["py", "ipynb", "md", "txt", "json"],
        selectionHints: {
          preferredFilePatterns: ["*.py", "*.ipynb", "*.md", "*.json"]
        },
        requiredFieldMappings: [],
        notes: [
          "Reference only. Do not treat this family as model-library truth."
        ]
      }
    ]
  },
  {
    datasetKey: "Fuling-2019",
    displayName: "Fuling June 2019 heavy-rainfall-induced landslide database",
    sourceKind: "event-catalogue",
    rawLandingRoot: ".tmp/regional-model-library/raw/Fuling-2019",
    repoRoles: ["replay", "Static Match", "regional benchmark"],
    accessPlan: {
      mode: "direct-download",
      primarySource: "https://data.mendeley.com/datasets/5j5b7wyrjp/1",
      backupSources: [],
      immediateActions: [
        "Download the Mendeley dataset archive and keep the raw package before any field mapping.",
        "Normalize one authoritative event inventory csv for replay construction.",
        "Keep any terrain or auxiliary GIS tables beside the event inventory for later static-factor joins."
      ],
      constraints: [
        "Use this dataset first as a southwest rainfall-triggered replay benchmark.",
        "Do not infer negative windows from the source package; derive them locally from the normalized event table."
      ]
    },
    families: [
      {
        familyKey: "event-inventory",
        displayName: "Fuling 2019 landslide event inventory",
        stage: "authoritative",
        rawLandingRelative: "original/event-inventory",
        expectedFormats: ["csv", "xlsx", "xls", "shp", "geojson", "gpkg"],
        selectionHints: {
          preferredFilePatterns: ["*fuling*2019*", "*inventory*", "*.shp", "*.geojson", "*.xlsx"]
        },
        schemaHints: {
          timeFieldCandidates: ["event_time", "event_ts", "date", "发生时间"],
          identityFieldCandidates: ["event_id", "id", "region_code", "longitude", "latitude", "county"],
          valueFieldCandidates: ["trigger", "hazard_type"],
          passthroughFieldCandidates: ["location_text", "time_precision", "space_precision", "source_url"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["event", "region"],
          joinKeyFieldCandidates: ["event_id", "longitude", "latitude", "county", "event_ts"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "event"
        },
        adapterBinding: "event_inventory_adapter",
        requiredFieldMappings: [
          {
            rawField: "event id",
            canonicalTarget: "eventId / rawRef.sourceRecordKey",
            required: true
          },
          {
            rawField: "event time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "longitude / latitude",
            canonicalTarget: "location.coordinates",
            required: true
          },
          {
            rawField: "county / district",
            canonicalTarget: "regionCode seed",
            required: true
          }
        ],
        optionalFieldMappings: [
          {
            rawField: "trigger summary",
            canonicalTarget: "triggerSummary",
            required: false
          }
        ],
        notes: [
          "This is the current southwest rainfall replay benchmark seed.",
          "Terrain and static-factor families can be added later without changing the first replay path."
        ]
      }
    ]
  },
  {
    datasetKey: "Baijiabao-2017-2024",
    displayName: "Baijiabao observation dataset 2017-2024",
    sourceKind: "station-timeseries",
    rawLandingRoot: ".tmp/regional-model-library/raw/ThreeGorges/Baijiabao-2017-2024",
    repoRoles: ["china.threegorges challenger", "threegorges extension family"],
    accessPlan: {
      mode: "mixed",
      primarySource: "https://www.ncdc.ac.cn/portal/metadata/3768727b-13b2-4675-8a00-2d661ec96229",
      backupSources: [
        "https://www.ncdc.ac.cn/portal/metadata/export_json/3768727b-13b2-4675-8a00-2d661ec96229",
        "NCDC SFTP/Web client endpoints listed on the metadata page"
      ],
      downloadTargets: [
        {
          targetKey: "baijiabao-source-package",
          displayName: "Baijiabao full source package",
          url: "https://www.ncdc.ac.cn/portal/metadata/data_direct_download/3768727b-13b2-4675-8a00-2d661ec96229",
          method: "POST",
          headers: {
            Referer: "https://www.ncdc.ac.cn/portal/metadata/3768727b-13b2-4675-8a00-2d661ec96229",
            Origin: "https://www.ncdc.ac.cn",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          },
          relativeOutFile:
            "source/downloads/3768727b-13b2-4675-8a00-2d661ec96229.zip",
          required: true,
          notes: [
            "Anonymous direct download works as of 2026-04-22 when the metadata page Referer is present.",
            "Keep the source zip and the unpacked tree together for reproducible normalization."
          ]
        }
      ],
      immediateActions: [
        "Download the full source zip and preserve it before any family split.",
        "Unpack the raw xls, jpg, and _ncdc_meta_.json files together under the ThreeGorges challenger landing root.",
        "Extract displacement, crack, rainfall, and reservoir/water-level workbooks first.",
        "Keep the three jpg context images as metadata-side evidence; do not expect a PDF in the real package."
      ],
      constraints: [
        "The direct-download endpoint currently requires a valid metadata-page Referer header.",
        "Use NCDC SFTP/Web client only as backup; FTPS is not the preferred automation path."
      ]
    },
    notes: [
      "Do not create a separate top-level Baijiabao raw tree outside the ThreeGorges landing root.",
      "Do not hand-build family folders in raw landing; keep source and unpacked layers first, then normalize."
    ],
    families: [
      {
        familyKey: "deformation",
        displayName: "Baijiabao GNSS displacement",
        stage: "challenger",
        rawLandingRelative: "phase1-families/deformation",
        expectedFormats: ["xlsx", "xls", "csv"],
        selectionHints: {
          preferredFileNames: ["白家包滑坡3个自动GNSS地表位移监测.xls"],
          preferredSheetNames: ["白家包"],
          preferredFilePatterns: ["*GNSS*.xls*", "*地表位移*.xls*", "*deformation*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["观测时间", "obs_time"],
          identityFieldCandidates: ["ZD1", "ZD2", "ZD3", "point_id"],
          valueFieldCandidates: ["累计位移", "位移", "displacement_mm"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["point", "station", "slope"],
          joinKeyFieldCandidates: ["point_id", "stationCode", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "day",
          granularity: "daily"
        },
        valueSemantics: {
          valueType: "number",
          semanticVariant: "displacement_raw"
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          {
            rawField: "obs_time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "point_id",
            canonicalTarget: "identity.stationCode / point identity",
            required: true
          },
          {
            rawField: "displacement_mm or mm/d",
            canonicalTarget: "metricsNormalized.displacementSurfaceMm",
            required: true
          }
        ]
      },
      {
        familyKey: "crack",
        displayName: "Baijiabao crack deformation",
        stage: "challenger",
        rawLandingRelative: "phase1-families/crack",
        expectedFormats: ["xlsx", "xls", "csv"],
        selectionHints: {
          preferredFileNames: ["白家包滑坡4个地表裂缝相对位移自动监测点.xls"],
          preferredSheetNames: ["白家包"],
          preferredFilePatterns: ["*裂缝*.xls*", "*crack*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["观测时间", "obs_time"],
          identityFieldCandidates: ["LF1", "LF2", "LF3", "LF4", "crack_id"],
          valueFieldCandidates: ["裂缝相对位移", "裂缝位移", "crack_displacement_mm"]
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          {
            rawField: "obs_time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "crack_id",
            canonicalTarget: "crack identity",
            required: true
          },
          {
            rawField: "crack_displacement_mm",
            canonicalTarget: "metricsNormalized.crackDisplacementMm",
            required: true
          }
        ]
      },
      {
        familyKey: "rainfall",
        displayName: "Baijiabao rainfall",
        stage: "challenger",
        rawLandingRelative: "phase1-families/rainfall",
        expectedFormats: ["xlsx", "xls", "csv"],
        selectionHints: {
          preferredFileNames: ["白家包滑坡1个自动雨量监测.xls"],
          preferredSheetNames: ["白家包"],
          preferredFilePatterns: ["*雨量*.xls*", "*降雨*.xls*", "*rain*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["观测时间", "obs_time"],
          identityFieldCandidates: ["rain_gauge_id", "gauge_id"],
          valueFieldCandidates: ["日降雨量（mm）", "rainfall_mm", "日降雨量"]
        },
        identityHints: {
          joinRole: "overlay",
          joinBasePriority: 20,
          canonicalIdentitySlots: ["gauge", "station", "slope"],
          joinKeyFieldCandidates: ["gauge_id", "stationCode", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "day",
          granularity: "daily"
        },
        valueSemantics: {
          valueType: "number",
          unit: "mm",
          semanticVariant: "daily_rainfall"
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          {
            rawField: "obs_time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "rainfall_mm",
            canonicalTarget: "metricsNormalized.rainfallCurrentMm",
            required: true
          }
        ]
      },
      {
        familyKey: "reservoir",
        displayName: "Baijiabao reservoir / water-level",
        stage: "challenger",
        rawLandingRelative: "phase1-families/reservoir",
        expectedFormats: ["xlsx", "xls", "csv"],
        selectionHints: {
          preferredFileNames: ["三峡库水位数据.xls"],
          preferredSheetNames: ["白家包"],
          preferredFilePatterns: ["*库水位*.xls*", "*水位*.xls*", "*reservoir*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["观测时间", "obs_time"],
          identityFieldCandidates: ["stationCode", "slopeCode"],
          valueFieldCandidates: ["三峡库水位（m）", "reservoir_level_m", "库水位"]
        },
        identityHints: {
          joinRole: "overlay",
          joinBasePriority: 30,
          canonicalIdentitySlots: ["station", "slope"],
          joinKeyFieldCandidates: ["stationCode", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "day",
          granularity: "daily"
        },
        valueSemantics: {
          valueType: "number",
          unit: "m",
          semanticVariant: "reservoir_level"
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          {
            rawField: "obs_time",
            canonicalTarget: "eventTs",
            required: true
          },
          {
            rawField: "reservoir_level_m or rise-fall rate",
            canonicalTarget: "metricsNormalized.reservoirLevelM",
            required: true
          }
        ]
      }
    ]
  },
  {
    datasetKey: "ThreeGorges-station-family",
    displayName: "Three Gorges station family",
    sourceKind: "station-timeseries",
    rawLandingRoot: ".tmp/regional-model-library/raw/ThreeGorges",
    repoRoles: ["china.threegorges primary pack"],
    accessPlan: {
      mode: "mixed",
      primarySource:
        "https://www.ncdc.ac.cn/portal/metadata?current_page=1&org=%E9%95%BF%E6%B1%9F%E4%B8%89%E5%B3%A1%E6%BB%91%E5%9D%A1%E8%A7%82%E6%B5%8B%E7%AB%99",
      immediateActions: [
        "Register NCDC and request the priority stations first.",
        "Pull deformation, rainfall, reservoir, groundwater, and temperature files before metadata families.",
        "Land annual reports and basic-feature tables in separate metadata directories instead of mixing them into station series."
      ]
    },
    families: [
      {
        familyKey: "deformation",
        displayName: "surface GPS / deformation tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/deformation",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*变形*.xls*", "*位移*.xls*", "*GPS*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["stationCode", "slopeCode", "point_id", "监测点编号"],
          valueFieldCandidates: ["displacement_mm", "累计位移", "位移"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["point", "station", "slope"],
          joinKeyFieldCandidates: ["point_id", "stationCode", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          semanticVariant: "displacement_raw"
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          {
            rawField: "point_id / stationCode",
            canonicalTarget: "identity.point / identity.stationCode",
            required: true
          },
          {
            rawField: "GPS displacement columns",
            canonicalTarget: "metricsNormalized.displacementSurfaceMm",
            required: true
          }
        ]
      },
      {
        familyKey: "rainfall",
        displayName: "rainfall tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/rainfall",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*降雨*.xls*", "*雨量*.xls*", "*rain*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["gauge_id", "stationCode", "slopeCode"],
          valueFieldCandidates: ["rainfall_mm", "降雨量", "日降雨量"]
        },
        identityHints: {
          joinRole: "overlay",
          joinBasePriority: 20,
          canonicalIdentitySlots: ["gauge", "station", "slope"],
          joinKeyFieldCandidates: ["gauge_id", "stationCode", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          unit: "mm",
          semanticVariant: "rainfall"
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          { rawField: "gauge_id", canonicalTarget: "rain gauge identity", required: false },
          {
            rawField: "rainfall_mm",
            canonicalTarget: "metricsNormalized.rainfallCurrentMm",
            required: true
          }
        ]
      },
      {
        familyKey: "reservoir",
        displayName: "reservoir / Yangtze water-level tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/reservoir",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*库水位*.xls*", "*长江水位*.xls*", "*reservoir*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["stationCode", "slopeCode", "gauge_id"],
          valueFieldCandidates: ["water_level_m", "库水位", "长江水位", "rise_fall_rate"]
        },
        identityHints: {
          joinRole: "overlay",
          joinBasePriority: 30,
          canonicalIdentitySlots: ["station", "slope"],
          joinKeyFieldCandidates: ["stationCode", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          semanticVariant: "reservoir_or_river_level"
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          {
            rawField: "water_level_m",
            canonicalTarget: "metricsNormalized.reservoirLevelM",
            required: true
          }
        ]
      },
      {
        familyKey: "groundwater",
        displayName: "groundwater tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/groundwater",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*地下水*.xls*", "*groundwater*.xls*", "*孔压*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["well_id", "stationCode", "slopeCode"],
          valueFieldCandidates: ["groundwater_level_m", "地下水位", "埋深"]
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          {
            rawField: "groundwater_level_m or depth",
            canonicalTarget: "metricsNormalized.groundwaterLevelM",
            required: true
          }
        ]
      },
      {
        familyKey: "temperature",
        displayName: "air-temperature tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/temperature",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*气温*.xls*", "*temperature*.xls*", "*温度*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["stationCode", "weather_station"],
          valueFieldCandidates: ["temperature_c", "气温", "温度"]
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          {
            rawField: "temperature_c",
            canonicalTarget: "metricsNormalized.airTemperatureC",
            required: true
          }
        ]
      },
      {
        familyKey: "crack",
        displayName: "crack deformation tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/crack",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*裂缝*.xls*", "*crack*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["crack_id", "stationCode", "slopeCode"],
          valueFieldCandidates: ["crack_width_mm", "裂缝宽度", "裂缝位移"]
        },
        packBinding: "china.threegorges",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          {
            rawField: "crack_width_mm / crack_displacement_mm",
            canonicalTarget: "metricsNormalized.crackDisplacementMm",
            required: true
          }
        ]
      },
      {
        familyKey: "inclinometer",
        displayName: "inclinometer / borehole tables",
        stage: "deferred",
        rawLandingRelative: "phase1-families/inclinometer",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*测斜*.xls*", "*inclinometer*.xls*", "*borehole*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["borehole_id", "stationCode", "slopeCode"],
          valueFieldCandidates: ["depth", "inclination", "偏移"]
        },
        packBinding: "china.threegorges",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true }
        ]
      },
      {
        familyKey: "metadata",
        displayName: "basic-feature / annual-report tables",
        stage: "metadata",
        rawLandingRelative: "metadata",
        expectedFormats: ["xlsx", "xls", "pdf", "doc", "json"],
        selectionHints: {
          preferredFilePatterns: ["*年报*.pdf", "*基本特征*.xls*", "*基础信息*.xls*"]
        },
        packBinding: "china.threegorges",
        adapterBinding: "region_profile_builder",
        requiredFieldMappings: []
      }
    ]
  },
  {
    datasetKey: "Badong-Huangtupo-official-family",
    displayName: "Badong Huangtupo official family",
    sourceKind: "station-timeseries",
    rawLandingRoot: ".tmp/regional-model-library/raw/Badong-Huangtupo",
    repoRoles: ["china.badong-huangtupo primary pack"],
    accessPlan: {
      mode: "mixed",
      primarySource:
        "https://www.ncdc.ac.cn/portal/metadata?current_page=1&org=%E6%B9%96%E5%8C%97%E5%B7%B4%E4%B8%9C%E5%9C%B0%E8%B4%A8%E7%81%BE%E5%AE%B3%E5%9B%BD%E5%AE%B6%E9%87%8E%E5%A4%96%E7%A7%91%E5%AD%A6%E8%A7%82%E6%B5%8B%E7%A0%94%E7%A9%B6%E7%AB%99",
      immediateActions: [
        "Register NCDC and submit the first request from the surface-displacement seed page.",
        "Pull Beidou, rainfall, groundwater/water-temperature, and tunnel-flow first.",
        "Keep slip-belt, settlement, bank, stress, and soil families in deferred folders until authoritative phase-1 data is stable."
      ]
    },
    families: [
      {
        familyKey: "beidou",
        displayName: "3D Beidou displacement tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/beidou",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*北斗*.xls*", "*Beidou*.xls*", "*位移*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["point_id", "station_id", "测站编号"],
          valueFieldCandidates: ["dx", "dy", "dz", "displacement_mm"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["point", "station", "slope"],
          joinKeyFieldCandidates: ["point_id", "station_id", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          semanticVariant: "beidou_displacement_vector"
        },
        packBinding: "china.badong-huangtupo",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          {
            rawField: "point_id / station_id",
            canonicalTarget: "identity point / station",
            required: true
          },
          { rawField: "dx / dy / dz", canonicalTarget: "metricsNormalized.beidouDisp*", required: true }
        ]
      },
      {
        familyKey: "rainfall",
        displayName: "cave rainfall tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/rainfall",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*降雨*.xls*", "*雨量*.xls*", "*rain*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["gauge_id", "station_id"],
          valueFieldCandidates: ["rainfall_mm", "降雨量", "日降雨量"]
        },
        identityHints: {
          joinRole: "overlay",
          joinBasePriority: 20,
          canonicalIdentitySlots: ["gauge", "station", "slope"],
          joinKeyFieldCandidates: ["gauge_id", "station_id", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          unit: "mm",
          semanticVariant: "rainfall"
        },
        packBinding: "china.badong-huangtupo",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          { rawField: "rainfall_mm", canonicalTarget: "metricsNormalized.rainfallCurrentMm", required: true }
        ]
      },
      {
        familyKey: "groundwater",
        displayName: "groundwater / water-temperature tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/groundwater",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*地下水*.xls*", "*水温*.xls*", "*groundwater*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["station_id", "well_id"],
          valueFieldCandidates: ["groundwater_level_m", "地下水位", "水温", "temperature_c"]
        },
        identityHints: {
          joinRole: "overlay",
          joinBasePriority: 30,
          canonicalIdentitySlots: ["well", "station", "slope"],
          joinKeyFieldCandidates: ["well_id", "station_id", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          semanticVariant: "groundwater_or_water_temperature"
        },
        packBinding: "china.badong-huangtupo",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          {
            rawField: "groundwater_level_m or depth",
            canonicalTarget: "metricsNormalized.groundwaterLevelM",
            required: true
          }
        ]
      },
      {
        familyKey: "flow",
        displayName: "tunnel flow tables",
        stage: "authoritative",
        rawLandingRelative: "phase1-families/flow",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*流量*.xls*", "*flow*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["station_id", "tunnel_id"],
          valueFieldCandidates: ["flow_rate", "flow_total", "流量"]
        },
        identityHints: {
          joinRole: "overlay",
          joinBasePriority: 40,
          canonicalIdentitySlots: ["tunnel", "station", "slope"],
          joinKeyFieldCandidates: ["tunnel_id", "station_id", "slopeCode", "eventTs"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "mixed",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          semanticVariant: "tunnel_flow"
        },
        packBinding: "china.badong-huangtupo",
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          { rawField: "flow_rate or flow_total", canonicalTarget: "metricsNormalized.tunnelFlowRate", required: true }
        ]
      },
      {
        familyKey: "slip-belt",
        displayName: "cave slip-belt displacement tables",
        stage: "deferred",
        rawLandingRelative: "deferred/slip-belt",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        packBinding: "china.badong-huangtupo",
        requiredFieldMappings: []
      },
      {
        familyKey: "surface",
        displayName: "surface displacement tables",
        stage: "deferred",
        rawLandingRelative: "deferred/surface",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        packBinding: "china.badong-huangtupo",
        requiredFieldMappings: []
      },
      {
        familyKey: "settlement",
        displayName: "tunnel settlement tables",
        stage: "deferred",
        rawLandingRelative: "deferred/settlement",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        packBinding: "china.badong-huangtupo",
        requiredFieldMappings: []
      },
      {
        familyKey: "bank",
        displayName: "bank deformation / crack tables",
        stage: "deferred",
        rawLandingRelative: "deferred/bank",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        packBinding: "china.badong-huangtupo",
        requiredFieldMappings: []
      },
      {
        familyKey: "stress",
        displayName: "soil pressure / rock-soil stress tables",
        stage: "deferred",
        rawLandingRelative: "deferred/stress",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        packBinding: "china.badong-huangtupo",
        requiredFieldMappings: []
      }
    ]
  },
  {
    datasetKey: "Wanzhou-1950-2020",
    displayName: "Wanzhou 1950-2020 inventory + 18 factors",
    sourceKind: "inventory-static",
    rawLandingRoot: ".tmp/regional-model-library/raw/Wanzhou",
    repoRoles: ["Static Match", "RegionProfile enrichment", "threegorges static prior"],
    accessPlan: {
      mode: "direct-download",
      primarySource: "https://data.mendeley.com/datasets/xr3wrvm393/1",
      immediateActions: [
        "Download the full zip archive from Mendeley Data.",
        "Keep the outer zip, inner data zip, FileGDB inventory, FileGDB causal factors, and results directory separated after unpacking."
      ]
    },
    notes: [
      "Preserve the original FileGDB layout instead of flattening to csv during first landing.",
      "Manual license recheck is required because the Mendeley page and the inner package text disagree."
    ],
    families: [
      {
        familyKey: "inventory",
        displayName: "Wanzhou landslide inventory",
        stage: "static-prior",
        rawLandingRelative: "inventory",
        expectedFormats: ["gdb", "shp", "geojson", "csv", "xlsx"],
        selectionHints: {
          preferredFilePatterns: ["*.gdb", "*.shp", "*.geojson", "*inventory*.csv", "*inventory*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["year", "date", "time slice"],
          identityFieldCandidates: ["landslide_id", "slope_id", "geometry"],
          valueFieldCandidates: ["susceptibility", "class"],
          passthroughFieldCandidates: ["source", "notes"]
        },
        adapterBinding: "event_inventory_adapter",
        requiredFieldMappings: [
          {
            rawField: "landslide_id",
            canonicalTarget: "eventId / static inventory key",
            required: true
          },
          {
            rawField: "time slice / year",
            canonicalTarget: "eventTs or profile time slice",
            required: false
          },
          {
            rawField: "geometry",
            canonicalTarget: "profile / region geometry",
            required: true
          }
        ]
      },
      {
        familyKey: "causal-factors",
        displayName: "18 causal factors",
        stage: "static-prior",
        rawLandingRelative: "causal-factors",
        expectedFormats: ["gdb", "tif", "asc", "csv", "xlsx"],
        selectionHints: {
          preferredFilePatterns: ["*.gdb", "*.tif", "*.asc", "*factor*.csv", "*factor*.xls*"]
        },
        schemaHints: {
          identityFieldCandidates: ["grid_id", "slope_unit_id", "polygon_id"],
          valueFieldCandidates: ["18 causal factors", "elevation", "slope", "aspect", "distance_to_river"]
        },
        adapterBinding: "region_profile_builder",
        requiredFieldMappings: [
          {
            rawField: "18 causal factors",
            canonicalTarget: "RegionProfile.properties.staticFactors",
            required: true
          }
        ]
      },
      {
        familyKey: "model-results",
        displayName: "RF / XGBoost benchmark outputs",
        stage: "metadata",
        rawLandingRelative: "model-results",
        expectedFormats: ["xlsx", "csv", "pdf"],
        requiredFieldMappings: []
      }
    ]
  },
  {
    datasetKey: "Luoyugou",
    displayName: "Luoyugou field experiment pack",
    sourceKind: "station-timeseries",
    rawLandingRoot: ".tmp/regional-model-library/raw/Luoyugou",
    repoRoles: ["loess challenger", "joined short-window experiment pack"],
    accessPlan: {
      mode: "browser-request",
      primarySource: "https://www.ncdc.ac.cn/portal/metadata/61f27a07-e5fa-4409-aad5-7347b9453000",
      backupSources: [
        "https://www.ncdc.ac.cn/portal/metadata/e5e9e00c-30e5-425c-810e-b82655376d7e",
        "https://www.ncdc.ac.cn/portal/metadata/e730c037-65b9-4258-ab3f-a64162447c32",
        "https://www.ncdc.ac.cn/portal/metadata/572f4fe9-1b85-4fb2-8f55-e723938a7782"
      ],
      immediateActions: [
        "Register NCDC and request displacement, rainfall, water-level, and pore-pressure first.",
        "Keep the short-window families together to preserve the experiment horizon."
      ]
    },
    families: [
      {
        familyKey: "displacement",
        displayName: "Luoyugou displacement tables",
        stage: "challenger",
        rawLandingRelative: "phase1-families/displacement",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*位移*.xls*", "*displacement*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["pit_id", "point_id", "试验点编号"],
          valueFieldCandidates: ["surface displacement", "位移", "累计位移"]
        },
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          { rawField: "pit_id / point_id", canonicalTarget: "identity.point", required: true },
          {
            rawField: "surface displacement",
            canonicalTarget: "metricsNormalized.displacementSurfaceMm",
            required: true
          }
        ]
      },
      {
        familyKey: "hydro-pack",
        displayName: "rainfall / water-level / pore-pressure",
        stage: "challenger",
        rawLandingRelative: "phase1-families/hydro-pack",
        expectedFormats: ["xlsx", "xls", "csv", "json"],
        selectionHints: {
          preferredFilePatterns: ["*降雨*.xls*", "*水位*.xls*", "*孔隙水压力*.xls*", "*pore*.xls*"]
        },
        schemaHints: {
          timeFieldCandidates: ["obs_time", "监测时间", "日期"],
          identityFieldCandidates: ["pit_id", "point_id", "sensor_id"],
          valueFieldCandidates: ["rainfall", "water_level", "pore_pressure", "water_potential", "water_content"]
        },
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "obs_time", canonicalTarget: "eventTs", required: true },
          { rawField: "rainfall", canonicalTarget: "metricsNormalized.rainfallCurrentMm", required: false },
          { rawField: "water_level", canonicalTarget: "metricsNormalized.hydrologicLevel", required: false },
          { rawField: "pore_pressure", canonicalTarget: "metricsNormalized.porePressure", required: false }
        ]
      }
    ]
  },
  {
    datasetKey: "CMA-station-rainfall",
    displayName: "CMA station rainfall and basic meteorology",
    sourceKind: "station-timeseries",
    rawLandingRoot: ".tmp/regional-model-library/raw/CMA-station-rainfall",
    repoRoles: ["station rainfall join", "rainfall backbone supplement", "RegionProfile climate descriptor"],
    accessPlan: {
      mode: "browser-login",
      primarySource: "https://data.cma.cn/",
      backupSources: ["https://data.cma.cn/site/portalPublic/news/info?id=7415875d-a874-45f9-8f2d-0d5848a6427b"],
      immediateActions: [
        "Register and log into the CMA data portal.",
        "Prioritize hourly and daily rainfall products for stations nearest to first-wave regions.",
        "Preserve the original station export and station metadata together before any regional join."
      ],
      constraints: [
        "Some CMA products require service-application steps after login.",
        "Station identifiers and station metadata must stay attached to rainfall tables during landing."
      ]
    },
    families: [
      {
        familyKey: "hourly-rainfall",
        displayName: "hourly station rainfall",
        stage: "rainfall-backbone",
        rawLandingRelative: "original/hourly-rainfall",
        expectedFormats: ["csv", "xlsx", "txt"],
        selectionHints: {
          preferredFilePatterns: ["*hourly*.csv", "*hourly*.xlsx", "*rain*.csv", "*PRE*.txt"]
        },
        schemaHints: {
          timeFieldCandidates: ["datetime", "time", "日期时间", "观测时间"],
          identityFieldCandidates: ["station_id", "station_code", "站号", "站点编号"],
          valueFieldCandidates: ["rainfall_mm", "precipitation", "PRE", "降水量"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["gauge", "station", "region"],
          joinKeyFieldCandidates: ["station_id", "station_code", "datetime"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "hour",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          unit: "mm",
          semanticVariant: "hourly_station_rainfall"
        },
        adapterBinding: "ts_station_multivariate_adapter",
        requiredFieldMappings: [
          { rawField: "datetime", canonicalTarget: "eventTs", required: true },
          { rawField: "station id / station code", canonicalTarget: "identity.gauge / identity.station", required: true },
          { rawField: "hourly rainfall", canonicalTarget: "metricsNormalized.rainfallCurrentMm", required: true }
        ],
        optionalFieldMappings: [
          { rawField: "temperature / humidity / pressure", canonicalTarget: "hydroclimateContext.metFeatures", required: false }
        ]
      },
      {
        familyKey: "station-metadata",
        displayName: "station metadata and coordinates",
        stage: "metadata",
        rawLandingRelative: "original/station-metadata",
        expectedFormats: ["csv", "xlsx", "json"],
        selectionHints: {
          preferredFilePatterns: ["*station*.csv", "*station*.xlsx", "*metadata*.json"]
        },
        schemaHints: {
          identityFieldCandidates: ["station_id", "station_code", "站号", "站名"],
          valueFieldCandidates: ["longitude", "latitude", "elevation", "province", "city", "county"]
        },
        adapterBinding: "region_profile_builder",
        requiredFieldMappings: [
          { rawField: "station id / station code", canonicalTarget: "sourceRegionKeys.station", required: true },
          { rawField: "longitude / latitude", canonicalTarget: "RegionProfile representative coordinates", required: true }
        ]
      }
    ]
  },
  {
    datasetKey: "CLDAS-V2.0",
    displayName: "CLDAS-V2.0 real-time forcing grids",
    sourceKind: "rainfall-grid",
    rawLandingRoot: ".tmp/regional-model-library/raw/CLDAS-V2.0",
    repoRoles: ["rainfall backbone supplement", "RegionProfile climate descriptor", "replay weather context"],
    accessPlan: {
      mode: "browser-login",
      primarySource: "https://k.data.cma.cn/mekb/?dataCode=NAFP_CLDAS2.0_RT&r=data%2Fdetail",
      backupSources: ["https://data.cma.cn/"],
      immediateActions: [
        "Register and log into the CMA data service.",
        "Download the first-wave region coverage for precipitation and near-surface forcing fields.",
        "Preserve the original grid files unchanged before event or region extraction."
      ],
      constraints: [
        "CLDAS is a grid backbone and context source, not a replacement for local gauges.",
        "Keep variable-family naming explicit during landing because one package may contain multiple forcing fields."
      ]
    },
    families: [
      {
        familyKey: "precipitation-grid",
        displayName: "CLDAS precipitation grids",
        stage: "rainfall-backbone",
        rawLandingRelative: "original/precipitation-grid",
        expectedFormats: ["grb", "nc", "tif", "hdf"],
        selectionHints: {
          preferredFilePatterns: ["*PRE*.grb", "*rain*.nc", "*precip*.nc", "*.tif"]
        },
        schemaHints: {
          timeFieldCandidates: ["time", "datetime", "forecast_time"],
          identityFieldCandidates: ["grid_id", "lon", "lat"],
          valueFieldCandidates: ["precipitation", "rainfall_mm", "tp", "PRE"]
        },
        identityHints: {
          joinRole: "base",
          joinBasePriority: 10,
          canonicalIdentitySlots: ["grid"],
          joinKeyFieldCandidates: ["grid_id", "lon", "lat", "time"]
        },
        timeSemantics: {
          timezone: "Asia/Shanghai",
          precision: "hour",
          granularity: "timeseries"
        },
        valueSemantics: {
          valueType: "number",
          unit: "mm",
          semanticVariant: "hourly_grid_precipitation"
        },
        requiredFieldMappings: [
          { rawField: "time", canonicalTarget: "gridHour", required: true },
          { rawField: "grid longitude / latitude", canonicalTarget: "gridCell", required: true },
          { rawField: "precipitation", canonicalTarget: "rainfallMm", required: true }
        ]
      },
      {
        familyKey: "soil-moisture-and-meteo",
        displayName: "soil moisture and near-surface forcing",
        stage: "metadata",
        rawLandingRelative: "original/soil-moisture-and-meteo",
        expectedFormats: ["grb", "nc", "tif", "hdf"],
        selectionHints: {
          preferredFilePatterns: ["*soil*.grb", "*SM*.nc", "*temp*.nc", "*wind*.nc"]
        },
        schemaHints: {
          timeFieldCandidates: ["time", "datetime"],
          identityFieldCandidates: ["grid_id", "lon", "lat"],
          valueFieldCandidates: ["soil_moisture", "temperature", "wind", "humidity"]
        },
        adapterBinding: "region_profile_builder",
        requiredFieldMappings: [
          { rawField: "soil moisture / temperature / humidity", canonicalTarget: "RegionProfile.hydrologicProxySet or weather context", required: false }
        ]
      }
    ]
  },
  {
    datasetKey: "GSCLOUD-DEM",
    displayName: "Geospatial Data Cloud DEM tiles",
    sourceKind: "inventory-static",
    rawLandingRoot: ".tmp/regional-model-library/raw/GSCLOUD-DEM",
    repoRoles: ["RegionProfile enrichment", "Static Match terrain factors"],
    accessPlan: {
      mode: "browser-login",
      primarySource: "https://www.gscloud.cn/",
      immediateActions: [
        "Register and log into Geospatial Data Cloud.",
        "Download DEM tiles that cover first-wave regions.",
        "Preserve raw DEM tiles first and derive slope/aspect locally as a second pass."
      ],
      constraints: [
        "Do not treat derived slope/aspect rasters as source truth; keep DEM tiles.",
        "Prefer local derivation of slope and aspect instead of mixing third-party processed terrain factors early."
      ]
    },
    families: [
      {
        familyKey: "dem-tiles",
        displayName: "raw DEM tiles",
        stage: "static-prior",
        rawLandingRelative: "original/dem-tiles",
        expectedFormats: ["tif", "img", "hgt"],
        selectionHints: {
          preferredFilePatterns: ["*.tif", "*.img", "*.hgt"]
        },
        schemaHints: {
          identityFieldCandidates: ["tile_id", "lon", "lat", "bbox"],
          valueFieldCandidates: ["elevation"]
        },
        adapterBinding: "region_profile_builder",
        requiredFieldMappings: [
          { rawField: "elevation raster", canonicalTarget: "RegionProfile.elevation and derived terrain factors", required: true }
        ],
        notes: [
          "Slope, aspect, curvature, and relief should be derived locally from this family in a second pass."
        ]
      }
    ]
  },
  {
    datasetKey: "CLCD-1985-2025",
    displayName: "China Land Cover Dataset CLCD 1985-2025",
    sourceKind: "inventory-static",
    rawLandingRoot: ".tmp/regional-model-library/raw/CLCD-1985-2025",
    repoRoles: ["RegionProfile enrichment", "Static Match land-cover prior"],
    accessPlan: {
      mode: "direct-download",
      primarySource: "https://doi.org/10.5281/zenodo.18180184",
      backupSources: [
        "https://zenodo.org/records/18180184",
        "https://www.ncdc.ac.cn/portal/metadata/9de270f3-b5ad-4e19-afc0-2531f3977f2f"
      ],
      downloadTargets: [
        {
          targetKey: "classification-workbook",
          displayName: "CLCD classification workbook",
          url: "https://zenodo.org/records/18180184/files/CLCD_classificationsystem.xlsx?download=1",
          relativeOutFile: "source/downloads/CLCD_classificationsystem.xlsx",
          required: true,
          notes: [
            "Small direct-download target for schema and class mapping before large raster packs.",
            "Zenodo md5 as of 2026-04-22: 928388273874350c8d06649761e6c87b."
          ]
        },
        {
          targetKey: "province-2025-pack",
          displayName: "CLCD 2025 province split pack",
          url: "https://zenodo.org/records/18180184/files/CLCD_v01_2025_albert_province.zip?download=1",
          relativeOutFile: "source/downloads/CLCD_v01_2025_albert_province.zip",
          required: false,
          notes: [
            "Optional large pack for first-wave region extraction after the workbook lands.",
            "Zenodo md5 as of 2026-04-22: 788f99e99eeee816ae46c95742165d6e."
          ]
        }
      ],
      immediateActions: [
        "Pin the first-wave CLCD intake to Zenodo record 18180184 (v1.0.5).",
        "Download the classification workbook first, then only the 2025 province pack for first-wave regions.",
        "Keep the land-cover rasters unchanged before aggregating to region profiles."
      ],
      constraints: [
        "CLCD is a static prior source and should not delay the first rainfall/event backbone.",
        "Do not pull the full 1985-2025 nationwide stack before the first region-profile pipeline is proven."
      ]
    },
    families: [
      {
        familyKey: "land-cover-grid",
        displayName: "CLCD annual land-cover rasters",
        stage: "static-prior",
        rawLandingRelative: "original/land-cover-grid",
        expectedFormats: ["tif", "img"],
        selectionHints: {
          preferredFilePatterns: ["*.tif", "*.img"]
        },
        schemaHints: {
          identityFieldCandidates: ["tile_id", "year", "bbox"],
          valueFieldCandidates: ["land_cover_class", "class_code"]
        },
        adapterBinding: "region_profile_builder",
        requiredFieldMappings: [
          {
            rawField: "land-cover raster",
            canonicalTarget: "RegionProfile.properties.staticFactors.landCover",
            required: true
          }
        ]
      }
    ]
  },
  {
    datasetKey: "China-soil-property-rasters",
    displayName: "China soil property rasters based on WISE30sec",
    sourceKind: "inventory-static",
    rawLandingRoot: ".tmp/regional-model-library/raw/China-soil-property-rasters",
    repoRoles: ["RegionProfile enrichment", "Static Match soil prior"],
    accessPlan: {
      mode: "browser-login",
      primarySource: "https://www.ncdc.ac.cn/portal/metadata/3e5ce7b6-5989-45f5-84de-8b8ac61f4191",
      backupSources: ["https://doi.org/10.12072/ncdc.qlsst.db2702.2023"],
      immediateActions: [
        "Log into NCDC and download the soil-property rasters for first-wave regions.",
        "Preserve soil variable layers separately instead of merging them immediately."
      ],
      constraints: [
        "This family is for static soil and hydrologic sensitivity priors, not for direct runtime telemetry."
      ]
    },
    families: [
      {
        familyKey: "soil-property-rasters",
        displayName: "soil property rasters",
        stage: "static-prior",
        rawLandingRelative: "original/soil-property-rasters",
        expectedFormats: ["tif", "img", "asc"],
        selectionHints: {
          preferredFilePatterns: ["*.tif", "*.img", "*.asc"]
        },
        schemaHints: {
          identityFieldCandidates: ["tile_id", "layer_name", "bbox"],
          valueFieldCandidates: ["soil_texture", "organic_carbon", "cec", "ph", "bulk_density"]
        },
        adapterBinding: "region_profile_builder",
        requiredFieldMappings: [
          { rawField: "soil property raster", canonicalTarget: "RegionProfile.soilType / soil-property priors", required: true }
        ],
        notes: [
          "Keep each soil property layer recoverable so later profile builders can choose aggregation rules explicitly."
        ]
      }
    ]
  }
];
