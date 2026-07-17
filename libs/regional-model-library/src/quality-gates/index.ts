import type {
  CanonicalStationMultivariateSeries,
  CanonicalTrainingSample,
  QualityFlag,
  RegionProfile,
  TrainingLabelValue,
  TrainingLabelValueType
} from "../contracts";

export type QualityGateResult = {
  ok: boolean;
  errors: QualityFlag[];
  warnings: QualityFlag[];
};

function splitFlags(flags: QualityFlag[]): QualityGateResult {
  const errors = flags.filter((flag) => flag.severity === "error");
  const warnings = flags.filter((flag) => flag.severity !== "error");

  return {
    ok: errors.length === 0,
    errors,
    warnings
  };
}

export function evaluateSeriesQuality(
  series: CanonicalStationMultivariateSeries
): QualityGateResult {
  const flags: QualityFlag[] = [];

  if (series.points.length === 0) {
    flags.push({
      code: "empty_series",
      severity: "error",
      message: "Canonical series must contain at least one point."
    });
  }

  if (Object.keys(series.sourceFieldMap).length === 0) {
    flags.push({
      code: "missing_field_map",
      severity: "warning",
      message: "Series was built without a source field map."
    });
  }

  return splitFlags(flags);
}

export function evaluateRegionProfileQuality(profile: RegionProfile): QualityGateResult {
  const flags: QualityFlag[] = [];

  if (profile.requiredSensors.length === 0) {
    flags.push({
      code: "missing_required_sensors",
      severity: "warning",
      message: "Region profile does not declare required sensors."
    });
  }

  if (profile.sourceDatasets.length === 0) {
    flags.push({
      code: "missing_source_datasets",
      severity: "error",
      message: "Region profile must record at least one source dataset."
    });
  }

  return splitFlags(flags);
}

export function evaluateTrainingSamples(
  samples: readonly CanonicalTrainingSample[]
): QualityGateResult {
  const flags: QualityFlag[] = [];

  if (samples.length === 0) {
    flags.push({
      code: "empty_samples",
      severity: "error",
      message: "Sample factory must emit at least one training sample."
    });
  }

  const missingLabels = samples.some((sample) => Object.keys(sample.labels).length === 0);
  if (missingLabels) {
    flags.push({
      code: "missing_labels",
      severity: "error",
      message: "Every training sample must include at least one label."
    });
  }

  const labelCoverage = new Map<string, { present: number; missing: number }>();
  for (const sample of samples) {
    for (const labelKey of Object.keys(sample.labels)) {
      const entry = labelCoverage.get(labelKey) ?? { present: 0, missing: 0 };
      entry.present += 1;
      labelCoverage.set(labelKey, entry);
    }

    for (const qualityFlag of sample.qualityFlags) {
      if (qualityFlag.code !== "missing_label_value" || !qualityFlag.field) {
        continue;
      }

      const entry = labelCoverage.get(qualityFlag.field) ?? { present: 0, missing: 0 };
      entry.missing += 1;
      labelCoverage.set(qualityFlag.field, entry);
    }
  }

  for (const [labelKey, coverage] of labelCoverage) {
    if (coverage.present > 0 && coverage.missing > 0) {
      flags.push({
        code: "partial_label_coverage",
        severity: "warning",
        message: `Label '${labelKey}' is only present on a subset of the emitted samples.`,
        field: labelKey
      });
    }
  }

  for (const sample of samples) {
    for (const [labelKey, labelValue] of Object.entries(sample.labels)) {
      const metadata = sample.labelMetadata?.[labelKey];

      if (!metadata) {
        flags.push({
          code: "label_contract_missing",
          severity: "error",
          message: `Label '${labelKey}' is missing label metadata.`,
          field: labelKey
        });
        continue;
      }

      if (!matchesLabelValueType(labelValue, metadata.valueType)) {
        flags.push({
          code: "label_type_mismatch",
          severity: "error",
          message: `Label '${labelKey}' does not match the declared label value type '${metadata.valueType}'.`,
          field: labelKey
        });
      }

      if (!sample.horizonSpec && !metadata.horizonSpec) {
        flags.push({
          code: "label_horizon_missing",
          severity: "warning",
          message: `Label '${labelKey}' is missing both sample-level and label-level horizon metadata.`,
          field: labelKey
        });
      }
    }
  }

  return splitFlags(flags);
}

function matchesLabelValueType(
  value: TrainingLabelValue,
  valueType: TrainingLabelValueType
): boolean {
  if (value === null) {
    return valueType === "null";
  }

  switch (valueType) {
    case "boolean":
      return typeof value === "boolean";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "string":
      return typeof value === "string";
    case "null":
      return false;
  }
}
