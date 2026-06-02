import csv
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error


ROOT = Path(".")
V4_ARTIFACT = ROOT / "artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v4.hgb-support-guarded.prediction-regression-v1.json"
V5_ARTIFACT = ROOT / "artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v5.context-enriched.prediction-regression-v1.json"
TRAIN = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5/badong-huangtupo-core.train.context-enriched-v5.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5/badong-huangtupo-core.validation.context-enriched-v5.jsonl"
OUT_ROOT = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-gated-selector-v7"
MODEL_KEY = "badong-huangtupo.displacement.hgb-point-gated-v5-selector-v7"
MODEL_VERSION = "0.7.0"
LABEL_KEY = "displacementLabel"

DIMENSION_SETS = [
    ["point"],
    ["contextPresence"],
    ["point", "contextPresence"],
    ["point", "rainfall72hBucket"],
    ["point", "rainfall72hBucket", "contextPresence"],
    ["point", "displacementDelta72hBucket", "contextPresence"],
]
MIN_GROUP_COUNTS = [20, 40, 80, 120, 200]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def finite_number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else None


def predict_hgb(model: dict[str, Any], values: dict[str, Any]) -> float:
    feature_keys = model["featureKeys"]
    prediction = float(model["baseline"])
    for tree in model["trees"]:
        node_index = 0
        for _ in range(len(tree)):
            node = tree[node_index]
            if node["isLeaf"]:
                prediction += float(node["value"])
                break
            feature_key = feature_keys[int(node["featureIndex"])]
            value = finite_number(values.get(feature_key))
            if value is None:
                node_index = int(node["left"] if node.get("missingGoToLeft") else node["right"])
            else:
                node_index = int(node["left"] if value <= float(node["threshold"]) else node["right"])
    return float(model.get("outputOffset", 0)) + float(model.get("outputScale", 1)) * prediction


def metrics(y_true: list[float], y_pred: list[float]) -> dict[str, float]:
    y_true_array = np.asarray(y_true, dtype=float)
    y_pred_array = np.asarray(y_pred, dtype=float)
    absolute_error = np.abs(y_true_array - y_pred_array)
    total_sum_squares = float(np.sum((y_true_array - np.mean(y_true_array)) ** 2))
    residual_sum_squares = float(np.sum((y_true_array - y_pred_array) ** 2))
    return {
        "mae": float(mean_absolute_error(y_true_array, y_pred_array)),
        "rmse": float(math.sqrt(mean_squared_error(y_true_array, y_pred_array))),
        "r2": float(1 - residual_sum_squares / total_sum_squares) if total_sum_squares > 0 else 0.0,
        "directionAccuracy": float(np.mean(np.sign(y_true_array) == np.sign(y_pred_array))),
        "within1mm": float(np.mean(absolute_error <= 1.0)),
        "p90AbsoluteError": float(np.quantile(absolute_error, 0.9)),
        "predictionMean": float(np.mean(y_pred_array)),
        "targetMean": float(np.mean(y_true_array)),
    }


def metric_delta(candidate: dict[str, float], baseline: dict[str, float]) -> dict[str, float]:
    keys = ["mae", "rmse", "r2", "directionAccuracy", "within1mm", "p90AbsoluteError"]
    return {key: candidate[key] - baseline[key] for key in keys}


def passes_guard(candidate: dict[str, float], baseline: dict[str, float]) -> bool:
    return (
        candidate["mae"] <= baseline["mae"]
        and candidate["rmse"] <= baseline["rmse"]
        and candidate["r2"] >= baseline["r2"]
        and candidate["directionAccuracy"] >= baseline["directionAccuracy"]
        and candidate["within1mm"] >= baseline["within1mm"]
        and candidate["p90AbsoluteError"] <= baseline["p90AbsoluteError"]
    )


def point_id(row: dict[str, Any]) -> str:
    identity = row.get("identity", {})
    if not isinstance(identity, dict):
        identity = {}
    return str(identity.get("stationCode") or identity.get("scopeKey") or "unknown")


def abs_delta_bucket(value: Any) -> str:
    number = finite_number(value)
    if number is None:
        return "unknown"
    absolute = abs(number)
    if absolute == 0:
        return "00_zero"
    if absolute <= 0.5:
        return "01_0-0.5mm"
    if absolute <= 1.3:
        return "02_0.5-1.3mm"
    if absolute <= 3:
        return "03_1.3-3mm"
    return "04_gt3mm"


def rainfall72_bucket(value: Any) -> str:
    number = finite_number(value)
    if number is None:
        return "unknown"
    if number == 0:
        return "00_zero"
    if number <= 20:
        return "01_0-20mm"
    if number <= 50:
        return "02_20-50mm"
    if number <= 100:
        return "03_50-100mm"
    return "04_gt100mm"


def context_presence(metrics_normalized: dict[str, Any]) -> str:
    keys = [
        "porePressureKpa_mean_168h",
        "groundwaterDepthM_mean_168h",
        "tunnelFlowRate_mean_168h",
        "tunnelSettlementMm_mean_168h",
    ]
    return "-".join("present" if finite_number(metrics_normalized.get(key)) is not None else "missing" for key in keys)


def regime_value(row: dict[str, Any], dimension: str) -> str:
    metrics_normalized = row.get("metricsNormalized", {})
    if not isinstance(metrics_normalized, dict):
        metrics_normalized = {}
    if dimension == "point":
        return point_id(row)
    if dimension == "contextPresence":
        return context_presence(metrics_normalized)
    if dimension == "rainfall72hBucket":
        return rainfall72_bucket(metrics_normalized.get("rainfallCurrentMm_sum_72h"))
    if dimension == "displacementDelta72hBucket":
        return abs_delta_bucket(metrics_normalized.get("displacementSurfaceMm_delta_72h"))
    return "unknown"


def regime_key(row: dict[str, Any], dimensions: list[str]) -> str:
    return "|".join(f"{dimension}:{regime_value(row, dimension)}" for dimension in dimensions)


def split_calibration_dev(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[point_id(row)].append(row)
    calibration: list[dict[str, Any]] = []
    dev: list[dict[str, Any]] = []
    for group_rows in grouped.values():
        group_rows.sort(key=lambda item: str(item.get("eventTs", "")))
        cut = max(1, int(len(group_rows) * 0.8))
        if cut >= len(group_rows):
            cut = max(0, len(group_rows) - 1)
        calibration.extend(group_rows[:cut])
        dev.extend(group_rows[cut:])
    return calibration, dev


def build_records(rows: list[dict[str, Any]], fallback_model: dict[str, Any], candidate_model: dict[str, Any]) -> list[dict[str, Any]]:
    records = []
    for row in rows:
        label = finite_number(row.get("labels", {}).get(LABEL_KEY))
        metrics_normalized = row.get("metricsNormalized", {})
        if label is None or not isinstance(metrics_normalized, dict):
            continue
        records.append(
            {
                "row": row,
                "label": label,
                "fallbackPrediction": predict_hgb(fallback_model, metrics_normalized),
                "candidatePrediction": predict_hgb(candidate_model, metrics_normalized),
            }
        )
    return records


def metrics_for_records(records: list[dict[str, Any]], selected_keys: set[str] | None = None, dimensions: list[str] | None = None) -> dict[str, float]:
    labels: list[float] = []
    predictions: list[float] = []
    for record in records:
        row = record["row"]
        use_candidate = selected_keys is not None and dimensions is not None and regime_key(row, dimensions) in selected_keys
        labels.append(float(record["label"]))
        predictions.append(float(record["candidatePrediction"] if use_candidate else record["fallbackPrediction"]))
    return metrics(labels, predictions)


def select_keys_on_dev(records: list[dict[str, Any]], dimensions: list[str], min_group_count: int) -> tuple[set[str], dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        grouped[regime_key(record["row"], dimensions)].append(record)
    selected: set[str] = set()
    dropped: dict[str, str] = {}
    for key, group_records in grouped.items():
        if len(group_records) < min_group_count:
            continue
        fallback_metrics = metrics_for_records(group_records)
        labels = [float(record["label"]) for record in group_records]
        candidate_predictions = [float(record["candidatePrediction"]) for record in group_records]
        candidate_metrics = metrics(labels, candidate_predictions)
        if passes_guard(candidate_metrics, fallback_metrics):
            selected.add(key)
        else:
            dropped[key] = "dev-non-regression-failed"
    return selected, {
        "groupCount": len(grouped),
        "selectedCount": len(selected),
        "droppedCount": len(dropped),
        "selectedKeys": sorted(selected),
        "firstDropped": dict(list(dropped.items())[:20]),
    }


def model_score(item: dict[str, Any]) -> tuple[bool, float, float, float, float, float, float]:
    final_metrics = item["finalMetrics"]
    return (
        item["passesFinalGuard"],
        -final_metrics["mae"],
        -final_metrics["rmse"],
        final_metrics["r2"],
        final_metrics["directionAccuracy"],
        final_metrics["within1mm"],
        -final_metrics["p90AbsoluteError"],
    )


def write_validation_predictions(path: Path, records: list[dict[str, Any]], selected_keys: set[str], dimensions: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "sampleId",
                "eventTs",
                "point",
                "label",
                "fallbackPrediction",
                "candidatePrediction",
                "prediction",
                "selectedKey",
                "usedCandidate",
                "absoluteError",
            ],
        )
        writer.writeheader()
        for record in records:
            row = record["row"]
            selected_key = regime_key(row, dimensions)
            used_candidate = selected_key in selected_keys
            prediction = float(record["candidatePrediction"] if used_candidate else record["fallbackPrediction"])
            label = float(record["label"])
            writer.writerow(
                {
                    "sampleId": row.get("sampleId"),
                    "eventTs": row.get("eventTs"),
                    "point": point_id(row),
                    "label": label,
                    "fallbackPrediction": record["fallbackPrediction"],
                    "candidatePrediction": record["candidatePrediction"],
                    "prediction": prediction,
                    "selectedKey": selected_key,
                    "usedCandidate": used_candidate,
                    "absoluteError": abs(label - prediction),
                }
            )


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    v4_artifact = read_json(V4_ARTIFACT)
    v5_artifact = read_json(V5_ARTIFACT)
    fallback_model = v4_artifact["model"]
    candidate_model = v5_artifact["model"]
    train_rows = read_jsonl(TRAIN)
    validation_rows = read_jsonl(VALIDATION)
    _, dev_rows = split_calibration_dev(train_rows)
    dev_records = build_records(dev_rows, fallback_model, candidate_model)
    validation_records = build_records(validation_rows, fallback_model, candidate_model)

    base_final_metrics = metrics_for_records(validation_records)
    pure_candidate_metrics = metrics(
        [float(record["label"]) for record in validation_records],
        [float(record["candidatePrediction"]) for record in validation_records],
    )
    candidates = []
    for dimensions in DIMENSION_SETS:
        for min_group_count in MIN_GROUP_COUNTS:
            selected_keys, gate_report = select_keys_on_dev(dev_records, dimensions, min_group_count)
            final_metrics = metrics_for_records(validation_records, selected_keys, dimensions)
            candidates.append(
                {
                    "dimensions": dimensions,
                    "minGroupCount": min_group_count,
                    "gate": gate_report,
                    "finalMetrics": final_metrics,
                    "deltaVsV4": metric_delta(final_metrics, base_final_metrics),
                    "passesFinalGuard": passes_guard(final_metrics, base_final_metrics),
                }
            )

    best = sorted(candidates, key=model_score, reverse=True)[0]
    selected_keys = set(best["gate"]["selectedKeys"])
    selected_dimensions = best["dimensions"]
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    promote_allowed = bool(best["passesFinalGuard"] and len(selected_keys) > 0 and best["finalMetrics"]["mae"] < base_final_metrics["mae"])
    feature_keys = sorted(set(fallback_model["featureKeys"]) | set(candidate_model["featureKeys"]))

    artifact = {
        **v4_artifact,
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "trainingDatasetKeys": ["Badong-Huangtupo-official-open-core-v4-v5-dev-gated-selector"],
        "createdAt": created_at,
        "model": {
            "modelType": "gated_model_selection_regression_v1",
            "featureKeys": feature_keys,
            "dimensions": selected_dimensions,
            "fallbackModel": fallback_model,
            "candidateModel": candidate_model,
            "selectedKeys": sorted(selected_keys),
        },
        "validationMetrics": best["finalMetrics"],
        "metadata": {
            **v4_artifact.get("metadata", {}),
            "displayName": "BD-HTP-DP-HGB-POINT-GATED-v7",
            "modelFamily": "dev-gated-v4-v5-model-selector",
            "featureFamily": "v4 fallback plus v5 optional Badong context features",
            "selectionProfile": "dev-gated-group-model-selection-final-non-regression",
            "baseModelKey": v4_artifact["modelKey"],
            "baseModelVersion": v4_artifact["modelVersion"],
            "candidateModelKey": v5_artifact["modelKey"],
            "candidateModelVersion": v5_artifact["modelVersion"],
            "deltaVsV4": best["deltaVsV4"],
            "supportGuard": {
                "mode": "select-v5-groups-on-dev-otherwise-v4",
                "devCount": len(dev_records),
                "finalCount": len(validation_records),
                "promoteAllowed": promote_allowed,
                "selectedDimensions": selected_dimensions,
                "selectedKeys": sorted(selected_keys),
                "minGroupCount": best["minGroupCount"],
                "requireFullMetricNonRegression": True,
            },
            "registryRole": "badong-gated-selector-production-candidate",
            "activeProduction": False,
            "runtimeBoundary": {
                "requiredFeatureKeys": ["displacementSurfaceMm"],
                "optionalFeaturePolicy": "If v5 optional context features are absent or the point key is not selected, runtime falls back to v4.",
            },
        },
    }
    report = {
        "generatedAt": created_at,
        "promoteAllowed": promote_allowed,
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "baseModelKey": v4_artifact["modelKey"],
        "baseModelVersion": v4_artifact["modelVersion"],
        "candidateModelKey": v5_artifact["modelKey"],
        "candidateModelVersion": v5_artifact["modelVersion"],
        "split": {
            "trainCount": len(train_rows),
            "devCount": len(dev_records),
            "finalCount": len(validation_records),
        },
        "baseFinalMetrics": base_final_metrics,
        "pureCandidateFinalMetrics": pure_candidate_metrics,
        "pureCandidateDeltaVsV4": metric_delta(pure_candidate_metrics, base_final_metrics),
        "candidates": candidates,
        "best": best,
        "artifactPath": str(OUT_ROOT / "badong-huangtupo-displacement-v7.gated-selector.prediction-regression-v1.json"),
        "decision": "promote-candidate" if promote_allowed else "do-not-promote-v4-remains-badong-production-main",
    }

    write_json(OUT_ROOT / "badong-huangtupo-displacement-v7.gated-selector.prediction-regression-v1.json", artifact)
    write_json(OUT_ROOT / "badong-huangtupo-gated-selector-v7.report.json", report)
    write_validation_predictions(
        OUT_ROOT / "badong-huangtupo-gated-selector-v7.validation-predictions.csv",
        validation_records,
        selected_keys,
        selected_dimensions,
    )
    print(f"Promote allowed: {promote_allowed}")
    print(json.dumps(best, ensure_ascii=False, indent=2))
    print(f"Artifact: {report['artifactPath']}")


if __name__ == "__main__":
    main()
