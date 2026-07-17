import type {
  CanonicalStationMultivariateSeries,
  CanonicalTrainingSample,
  QualityFlag,
  RawReference,
  TrainingLabelMetadata,
  TrainingLabelValue
} from "../contracts";
import type { TrainingLabelValueType } from "../contracts";

export type SampleLabelPolicy = {
  key: string;
  valueType?: TrainingLabelValueType;
  fieldCandidates?: string[];
  defaultValue?: TrainingLabelValue;
  horizonSpec?: string;
};

export type SampleFactoryInput = {
  series: CanonicalStationMultivariateSeries;
  windowSpec: string;
  horizonSpec?: string;
  labelPolicies?: SampleLabelPolicy[];
  labelKey?: string;
  defaultLabel?: TrainingLabelValue;
  labelFieldCandidates?: string[];
};

type NormalizedLabelPolicy = {
  key: string;
  valueType: TrainingLabelValueType;
  fieldCandidates: readonly string[];
  hasDefaultValue: boolean;
  defaultValue?: TrainingLabelValue;
  horizonSpec?: string;
};

type ResolvedPointLabel = {
  value: TrainingLabelValue;
  sourceField: string;
};

function inferValueTypeFromValue(value: TrainingLabelValue): TrainingLabelValueType {
  if (value === null) {
    return "null";
  }

  if (typeof value === "boolean") {
    return "boolean";
  }

  if (typeof value === "number") {
    return "number";
  }

  return "string";
}

function inferPolicyValueType(policy: SampleLabelPolicy, input: SampleFactoryInput): TrainingLabelValueType {
  if (policy.valueType) {
    return policy.valueType;
  }

  if (policy.defaultValue !== undefined) {
    return inferValueTypeFromValue(policy.defaultValue);
  }

  const normalizedKey = policy.key.toLowerCase();
  if (normalizedKey.includes("warning") || normalizedKey.includes("hit")) {
    return "boolean";
  }

  if (normalizedKey.includes("risk") || normalizedKey.includes("level")) {
    return "string";
  }

  if (normalizedKey.includes("disp")) {
    return "number";
  }

  if (input.defaultLabel !== undefined) {
    return inferValueTypeFromValue(input.defaultLabel);
  }

  return "string";
}

function coerceLabelValue(
  value: unknown,
  valueType: TrainingLabelValueType
): TrainingLabelValue | undefined {
  if (valueType === "null") {
    return value === null ? null : undefined;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  if (valueType === "boolean") {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number" && Number.isFinite(value) && (value === 0 || value === 1)) {
      return value === 1;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized.length === 0) {
        return undefined;
      }

      if (["true", "1", "yes", "y"].includes(normalized)) {
        return true;
      }

      if (["false", "0", "no", "n"].includes(normalized)) {
        return false;
      }
    }

    return undefined;
  }

  if (valueType === "number") {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim();
      if (normalized.length === 0) {
        return undefined;
      }

      const asNumber = Number(normalized);
      return Number.isFinite(asNumber) ? asNumber : undefined;
    }

    return undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === "boolean") {
    return String(value);
  }

  return undefined;
}

function resolvePointLabel(
  rawRef: RawReference | undefined,
  labelFieldCandidates: readonly string[],
  valueType: TrainingLabelValueType
): ResolvedPointLabel | undefined {
  const originalFields = rawRef?.originalFields;
  if (!originalFields) {
    return undefined;
  }

  for (const field of labelFieldCandidates) {
    const value = coerceLabelValue(originalFields[field], valueType);
    if (value !== undefined) {
      return {
        value,
        sourceField: field
      };
    }
  }

  return undefined;
}

function normalizeLabelPolicies(input: SampleFactoryInput): NormalizedLabelPolicy[] {
  if (input.labelPolicies && input.labelPolicies.length > 0) {
    return input.labelPolicies.map((policy) => ({
      key: policy.key,
      valueType: inferPolicyValueType(policy, input),
      fieldCandidates: policy.fieldCandidates ?? [],
      hasDefaultValue: policy.defaultValue !== undefined,
      ...(policy.defaultValue !== undefined ? { defaultValue: policy.defaultValue } : {}),
      ...(policy.horizonSpec ? { horizonSpec: policy.horizonSpec } : {})
    }));
  }

  const fallbackKey = input.labelKey ?? "warningHitLabel";
  return [
    {
      key: fallbackKey,
      valueType:
        input.defaultLabel !== undefined ? inferValueTypeFromValue(input.defaultLabel) : "boolean",
      fieldCandidates: input.labelFieldCandidates ?? [],
      hasDefaultValue: input.defaultLabel !== undefined,
      ...(input.defaultLabel !== undefined ? { defaultValue: input.defaultLabel } : {})
    }
  ];
}

function buildSeriesLabelAvailability(
  series: CanonicalStationMultivariateSeries,
  labelPolicies: readonly NormalizedLabelPolicy[]
): Map<string, boolean> {
  const availability = new Map<string, boolean>();

  for (const policy of labelPolicies) {
    const isAvailable = series.points.some((point) => {
      const resolved = resolvePointLabel(point.rawRef, policy.fieldCandidates, policy.valueType);
      return resolved !== undefined;
    });

    availability.set(policy.key, isAvailable);
  }

  return availability;
}

export function createCanonicalTrainingSamples(
  input: SampleFactoryInput
): CanonicalTrainingSample[] {
  const labelPolicies = normalizeLabelPolicies(input);
  const labelAvailability = buildSeriesLabelAvailability(input.series, labelPolicies);

  return input.series.points.map((point, index) => {
    const labels: Record<string, TrainingLabelValue> = {};
    const labelMetadata: Record<string, TrainingLabelMetadata> = {};
    const labelQualityFlags: QualityFlag[] = [];

    for (const policy of labelPolicies) {
      const resolvedLabel = resolvePointLabel(point.rawRef, policy.fieldCandidates, policy.valueType);
      if (resolvedLabel !== undefined) {
        labels[policy.key] = resolvedLabel.value;
        labelMetadata[policy.key] = {
          valueType: policy.valueType,
          derivationMode: "raw-field",
          sourceField: resolvedLabel.sourceField,
          ...(policy.horizonSpec ?? input.horizonSpec
            ? { horizonSpec: policy.horizonSpec ?? input.horizonSpec }
            : {})
        };
        continue;
      }

      if (policy.hasDefaultValue && policy.defaultValue !== undefined) {
        labels[policy.key] = policy.defaultValue;
        labelMetadata[policy.key] = {
          valueType: policy.valueType,
          derivationMode: "default-value",
          ...(policy.horizonSpec ?? input.horizonSpec
            ? { horizonSpec: policy.horizonSpec ?? input.horizonSpec }
            : {})
        };
        labelQualityFlags.push({
          code: "default_label_applied",
          severity: "info",
          message: `Label '${policy.key}' used the configured default value.`,
          field: policy.key
        });
        continue;
      }

      if (labelAvailability.get(policy.key)) {
        labelQualityFlags.push({
          code: "missing_label_value",
          severity: "warning",
          message: `Label '${policy.key}' is populated elsewhere in this series but missing on this row.`,
          field: policy.key
        });
      }
    }

    return {
      sampleId: `${input.series.seriesId}:${String(index)}`,
      identity: input.series.identity,
      eventTs: point.eventTs,
      windowSpec: input.windowSpec,
      ...(input.horizonSpec ? { horizonSpec: input.horizonSpec } : {}),
      metricsNormalized: point.metricsNormalized,
      labels,
      ...(Object.keys(labelMetadata).length > 0 ? { labelMetadata } : {}),
      sourceDataset: input.series.sourceDataset,
      ...(point.rawRef?.sourceRecordKey
        ? { sourceRecordKey: point.rawRef.sourceRecordKey }
        : {}),
      sourceFieldMap: input.series.sourceFieldMap,
      ...(point.rawRef ? { rawRef: point.rawRef } : {}),
      qualityFlags: [
        ...input.series.qualityFlags,
        ...(point.qualityFlags ?? []),
        ...labelQualityFlags
      ]
    };
  });
}
