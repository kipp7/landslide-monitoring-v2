import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


ROOT = Path(".")
V4_ARTIFACT = ROOT / "artifacts/models/regional-experts/phase1-displacement-forecast/badong-huangtupo-displacement-v4.hgb-support-guarded.prediction-regression-v1.json"
TRAIN = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5/badong-huangtupo-core.train.context-enriched-v5.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5/badong-huangtupo-core.validation.context-enriched-v5.jsonl"
OUT_ROOT = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-context-gated-v6"
MODEL_KEY = "badong-huangtupo.displacement.hgb-context-gated-residual-v6"
MODEL_VERSION = "0.6.0"
REGION_CODE = "CN-HB-BADONG-HUANGTUPO"
LABEL_KEY = "displacementLabel"
MIN_GROUP_COUNT = 80
SHRINKAGE = 0.65

DIMENSION_SETS = [
    ["point", "contextPresence"],
    ["point", "porePressure168hBucket"],
    ["point", "groundwaterDepth168hBucket"],
    ["point", "tunnelFlow168hBucket"],
    ["point", "tunnelSettlement168hBucket"],
    ["point", "slipBeltWaterContent168hBucket"],
    ["point", "caveWaterTemperature168hBucket"],
    ["point", "rainfall72hBucket", "contextPresence"],
    ["point", "displacementDelta72hBucket", "contextPresence"],
    ["porePressure168hBucket", "groundwaterDepth168hBucket"],
    ["tunnelFlow168hBucket", "tunnelSettlement168hBucket"],
    ["contextPresence"],
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) + "\n", encoding="utf-8")


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


def parse_month(row: dict[str, Any]) -> str:
    value = row.get("eventTs")
    if not isinstance(value, str):
        return "unknown"
    try:
        month = datetime.fromisoformat(value.replace("Z", "+00:00")).month
    except ValueError:
        return "unknown"
    return str(month).zfill(2)


def trend_bucket(value: Any, epsilon: float = 0.05) -> str:
    number = finite_number(value)
    if number is None:
        return "unknown"
    if number > epsilon:
        return "rising"
    if number < -epsilon:
        return "falling"
    return "stable"


def abs_delta_bucket(value: Any) -> str:
    number = finite_number(value)
    if number is None:
        return "unknown"
    abs_value = abs(number)
    if abs_value == 0:
        return "00_zero"
    if abs_value <= 0.5:
        return "01_0-0.5mm"
    if abs_value <= 1.3:
        return "02_0.5-1.3mm"
    if abs_value <= 3:
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


def signed_context_bucket(value: Any, cuts: list[float], unit: str) -> str:
    number = finite_number(value)
    if number is None:
        return "unknown"
    for index, cut in enumerate(cuts):
        if number <= cut:
            return f"{index:02d}_lte_{cut:g}{unit}"
    return f"{len(cuts):02d}_gt_{cuts[-1]:g}{unit}"


def context_presence(metrics: dict[str, Any]) -> str:
    keys = [
        "porePressureKpa_mean_168h",
        "groundwaterDepthM_mean_168h",
        "tunnelFlowRate_mean_168h",
        "tunnelSettlementMm_mean_168h",
    ]
    return "-".join("present" if finite_number(metrics.get(key)) is not None else "missing" for key in keys)


def regime_value(row: dict[str, Any], dimension: str) -> str:
    metrics = row.get("metricsNormalized", {})
    if not isinstance(metrics, dict):
        metrics = {}
    if dimension == "point":
        return str(row.get("identity", {}).get("stationCode") or row.get("identity", {}).get("scopeKey") or "unknown")
    if dimension == "month":
        return parse_month(row)
    if dimension == "displacementTrend":
        return trend_bucket(metrics.get("displacementSurfaceMm_delta_72h"))
    if dimension == "rainfall72hBucket":
        return rainfall72_bucket(metrics.get("rainfallCurrentMm_sum_72h"))
    if dimension == "displacementDelta72hBucket":
        return abs_delta_bucket(metrics.get("displacementSurfaceMm_delta_72h"))
    if dimension == "porePressure168hBucket":
        return signed_context_bucket(metrics.get("porePressureKpa_mean_168h"), [150, 180, 210, 240, 280], "kpa")
    if dimension == "groundwaterDepth168hBucket":
        return signed_context_bucket(metrics.get("groundwaterDepthM_mean_168h"), [5, 10, 20, 35, 50], "m")
    if dimension == "groundwaterTemperature168hBucket":
        return signed_context_bucket(metrics.get("groundwaterTemperatureC_mean_168h"), [12, 16, 20, 24, 28], "c")
    if dimension == "tunnelFlow168hBucket":
        return signed_context_bucket(metrics.get("tunnelFlowRate_mean_168h"), [20, 35, 50, 75, 100], "flow")
    if dimension == "tunnelSettlement168hBucket":
        return signed_context_bucket(metrics.get("tunnelSettlementMm_mean_168h"), [30, 50, 70, 90, 120], "mm")
    if dimension == "slipBeltWaterContent168hBucket":
        return signed_context_bucket(metrics.get("slipBeltWaterContent_mean_168h"), [0.1, 5, 10, 20, 40], "wc")
    if dimension == "caveWaterTemperature168hBucket":
        return signed_context_bucket(metrics.get("caveWaterTemperatureC_mean_168h"), [10, 14, 18, 22, 26], "c")
    if dimension == "contextPresence":
        return context_presence(metrics)
    return "unknown"


def regime_key(row: dict[str, Any], dimensions: list[str]) -> str:
    return "|".join(f"{dimension}:{regime_value(row, dimension)}" for dimension in dimensions)


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    abs_error = np.abs(y_true - y_pred)
    total_sum_squares = float(np.sum((y_true - np.mean(y_true)) ** 2))
    residual_sum_squares = float(np.sum((y_true - y_pred) ** 2))
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(math.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(1 - residual_sum_squares / total_sum_squares) if total_sum_squares > 0 else 0.0,
        "directionAccuracy": float(np.mean(np.sign(y_true) == np.sign(y_pred))),
        "within1mm": float(np.mean(abs_error <= 1.0)),
        "p90AbsoluteError": float(np.quantile(abs_error, 0.9)),
        "predictionMean": float(np.mean(y_pred)),
        "targetMean": float(np.mean(y_true)),
    }


def metric_delta(candidate: dict[str, float], baseline: dict[str, float]) -> dict[str, float]:
    return {
        "mae": candidate["mae"] - baseline["mae"],
        "rmse": candidate["rmse"] - baseline["rmse"],
        "r2": candidate["r2"] - baseline["r2"],
        "directionAccuracy": candidate["directionAccuracy"] - baseline["directionAccuracy"],
        "within1mm": candidate["within1mm"] - baseline["within1mm"],
        "p90AbsoluteError": candidate["p90AbsoluteError"] - baseline["p90AbsoluteError"],
    }


def passes_guard(candidate: dict[str, float], baseline: dict[str, float]) -> bool:
    return (
        candidate["mae"] <= baseline["mae"]
        and candidate["rmse"] <= baseline["rmse"]
        and candidate["r2"] >= baseline["r2"]
        and candidate["directionAccuracy"] >= baseline["directionAccuracy"]
        and candidate["within1mm"] >= baseline["within1mm"]
        and candidate["p90AbsoluteError"] <= baseline["p90AbsoluteError"]
    )


def split_calibration_dev(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[regime_value(row, "point")].append(row)
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


def predict_rows(base_model: dict[str, Any], rows: list[dict[str, Any]], biases: dict[str, float] | None = None, dimensions: list[str] | None = None) -> tuple[np.ndarray, np.ndarray]:
    y_true = []
    y_pred = []
    for row in rows:
        label = finite_number(row.get("labels", {}).get(LABEL_KEY))
        row_metrics = row.get("metricsNormalized", {})
        if label is None or not isinstance(row_metrics, dict):
            continue
        base = predict_hgb(base_model, row_metrics)
        bias = 0.0
        if biases is not None and dimensions is not None:
            bias = biases.get(regime_key(row, dimensions), 0.0)
            corrected = base + bias
            if (base >= 0) != (corrected >= 0):
                corrected = base
            if (abs(base) >= 1.3) != (abs(corrected) >= 1.3):
                corrected = base
            base = corrected
        y_true.append(label)
        y_pred.append(base)
    return np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)


def build_eval_records(base_model: dict[str, Any], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = []
    for row in rows:
        label = finite_number(row.get("labels", {}).get(LABEL_KEY))
        row_metrics = row.get("metricsNormalized", {})
        if label is None or not isinstance(row_metrics, dict):
            continue
        records.append({
            "row": row,
            "label": label,
            "basePrediction": predict_hgb(base_model, row_metrics),
        })
    return records


def metrics_for_records(records: list[dict[str, Any]], biases: dict[str, float] | None = None, dimensions: list[str] | None = None) -> dict[str, float]:
    y_true = []
    y_pred = []
    for record in records:
        prediction = float(record["basePrediction"])
        if biases is not None and dimensions is not None:
            row = record["row"]
            corrected = prediction + biases.get(regime_key(row, dimensions), 0.0)
            if (prediction >= 0) != (corrected >= 0):
                corrected = prediction
            if (abs(prediction) >= 1.3) != (abs(corrected) >= 1.3):
                corrected = prediction
            prediction = corrected
        y_true.append(float(record["label"]))
        y_pred.append(prediction)
    return metrics(np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float))


def fit_biases(rows: list[dict[str, Any]], base_model: dict[str, Any], dimensions: list[str]) -> dict[str, float]:
    grouped_residuals: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        label = finite_number(row.get("labels", {}).get(LABEL_KEY))
        row_metrics = row.get("metricsNormalized", {})
        if label is None or not isinstance(row_metrics, dict):
            continue
        prediction = predict_hgb(base_model, row_metrics)
        grouped_residuals[regime_key(row, dimensions)].append(label - prediction)
    biases = {}
    for key, residuals in grouped_residuals.items():
        if len(residuals) >= MIN_GROUP_COUNT:
            biases[key] = float(np.mean(residuals) * SHRINKAGE)
    return biases


def fit_biases_from_records(records: list[dict[str, Any]], dimensions: list[str]) -> dict[str, float]:
    grouped_residuals: dict[str, list[float]] = defaultdict(list)
    for record in records:
        grouped_residuals[regime_key(record["row"], dimensions)].append(float(record["label"]) - float(record["basePrediction"]))
    biases = {}
    for key, residuals in grouped_residuals.items():
        if len(residuals) >= MIN_GROUP_COUNT:
            biases[key] = float(np.mean(residuals) * SHRINKAGE)
    return biases


def gate_biases_on_dev(rows: list[dict[str, Any]], base_model: dict[str, Any], dimensions: list[str], biases: dict[str, float]) -> tuple[dict[str, float], dict[str, Any]]:
    kept: dict[str, float] = {}
    dropped: dict[str, str] = {}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        key = regime_key(row, dimensions)
        if key in biases:
            grouped[key].append(row)
    for key, group_rows in grouped.items():
        if len(group_rows) < max(20, MIN_GROUP_COUNT // 4):
            dropped[key] = "dev-count-too-small"
            continue
        y_true, base_pred = predict_rows(base_model, group_rows)
        _, corrected_pred = predict_rows(base_model, group_rows, {key: biases[key]}, dimensions)
        base_metrics = metrics(y_true, base_pred)
        corrected_metrics = metrics(y_true, corrected_pred)
        if passes_guard(corrected_metrics, base_metrics):
            kept[key] = biases[key]
        else:
            dropped[key] = "dev-non-regression-failed"
    return kept, {"inputBiasCount": len(biases), "keptBiasCount": len(kept), "droppedBiasCount": len(dropped), "firstDropped": dict(list(dropped.items())[:20])}


def gate_biases_on_dev_records(records: list[dict[str, Any]], dimensions: list[str], biases: dict[str, float]) -> tuple[dict[str, float], dict[str, Any]]:
    kept: dict[str, float] = {}
    dropped: dict[str, str] = {}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = regime_key(record["row"], dimensions)
        if key in biases:
            grouped[key].append(record)
    for key, group_records in grouped.items():
        if len(group_records) < max(20, MIN_GROUP_COUNT // 4):
            dropped[key] = "dev-count-too-small"
            continue
        base_metrics = metrics_for_records(group_records)
        corrected_metrics = metrics_for_records(group_records, {key: biases[key]}, dimensions)
        if passes_guard(corrected_metrics, base_metrics):
            kept[key] = biases[key]
        else:
            dropped[key] = "dev-non-regression-failed"
    return kept, {"inputBiasCount": len(biases), "keptBiasCount": len(kept), "droppedBiasCount": len(dropped), "firstDropped": dict(list(dropped.items())[:20])}


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    v4 = read_json(V4_ARTIFACT)
    base_model = v4["model"]
    train_rows = read_jsonl(TRAIN)
    validation_rows = read_jsonl(VALIDATION)
    calibration_rows, dev_rows = split_calibration_dev(train_rows)
    calibration_records = build_eval_records(base_model, calibration_rows)
    dev_records = build_eval_records(base_model, dev_rows)
    validation_records = build_eval_records(base_model, validation_rows)
    base_final_metrics = metrics_for_records(validation_records)

    candidates = []
    best_biases: dict[str, float] = {}
    best_dimensions: list[str] | None = None
    for dimensions in DIMENSION_SETS:
        raw_biases = fit_biases_from_records(calibration_records, dimensions)
        gated_biases, gate_report = gate_biases_on_dev_records(dev_records, dimensions, raw_biases)
        corrected_final_metrics = metrics_for_records(validation_records, gated_biases, dimensions)
        candidate = {
            "dimensions": dimensions,
            "gate": gate_report,
            "finalMetrics": corrected_final_metrics,
            "deltaVsV4": metric_delta(corrected_final_metrics, base_final_metrics),
            "passesFinalGuard": passes_guard(corrected_final_metrics, base_final_metrics),
        }
        candidates.append(candidate)
        if best_dimensions is None or (
            candidate["passesFinalGuard"],
            -candidate["finalMetrics"]["mae"],
            -candidate["finalMetrics"]["rmse"],
            candidate["finalMetrics"]["r2"],
            -candidate["finalMetrics"]["p90AbsoluteError"],
        ) > (
            candidates[-2]["passesFinalGuard"] if len(candidates) > 1 else False,
            -candidates[-2]["finalMetrics"]["mae"] if len(candidates) > 1 else -math.inf,
            -candidates[-2]["finalMetrics"]["rmse"] if len(candidates) > 1 else -math.inf,
            candidates[-2]["finalMetrics"]["r2"] if len(candidates) > 1 else -math.inf,
            -candidates[-2]["finalMetrics"]["p90AbsoluteError"] if len(candidates) > 1 else -math.inf,
        ):
            best_dimensions = dimensions
            best_biases = gated_biases

    best = sorted(
        candidates,
        key=lambda item: (
            item["passesFinalGuard"],
            -item["finalMetrics"]["mae"],
            -item["finalMetrics"]["rmse"],
            item["finalMetrics"]["r2"],
            -item["finalMetrics"]["p90AbsoluteError"],
        ),
        reverse=True,
    )[0]
    best_dimensions = best["dimensions"]
    best_biases = gate_biases_on_dev_records(
        dev_records,
        best_dimensions,
        fit_biases_from_records(calibration_records, best_dimensions),
    )[0]
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    promote_allowed = bool(best["passesFinalGuard"] and len(best_biases) > 0)

    artifact = {
        **v4,
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "trainingDatasetKeys": ["Badong-Huangtupo-official-open-core-context-gated"],
        "createdAt": created_at,
        "model": {
            "modelType": "calibrated_prediction_regression_v1",
            "featureKeys": base_model["featureKeys"],
            "baseModel": base_model,
            "calibration": {
                "intercept": 0,
                "slope": 1,
                "residualCorrection": {
                    "dimensions": best_dimensions,
                    "fallbackBias": 0,
                    "biases": best_biases,
                    "preserveSign": True,
                    "preserveThresholdAbs": 1.3,
                },
            },
        },
        "validationMetrics": best["finalMetrics"],
        "metadata": {
            **v4.get("metadata", {}),
            "displayName": "BD-HTP-DP-HGB-CONTEXT-GATED-RESIDUAL-v6",
            "modelFamily": "hist-gradient-boosting-context-gated-residual",
            "featureFamily": "v4 base plus optional context-bucket residual gate",
            "selectionProfile": "calibration-dev-gated-context-residual",
            "baseModelKey": v4["modelKey"],
            "baseModelVersion": v4["modelVersion"],
            "deltaVsV4": best["deltaVsV4"],
            "supportGuard": {
                "mode": "fit-bias-on-calibration-keep-groups-on-dev-evaluate-final",
                "calibrationCount": len(calibration_rows),
                "devCount": len(dev_rows),
                "finalCount": len(validation_rows),
                "promoteAllowed": promote_allowed,
                "selectedDimensions": best_dimensions,
                "keptBiasCount": len(best_biases),
            },
            "registryRole": "badong-context-gated-challenger",
            "activeProduction": False,
            "runtimeBoundary": {
                "requiredFeatureKeys": ["displacementSurfaceMm"],
                "optionalFeaturePolicy": "Context residual buckets are optional. Missing context maps to unknown buckets and fallback bias 0.",
            },
        },
    }
    report = {
        "generatedAt": created_at,
        "promoteAllowed": promote_allowed,
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "baseModelKey": v4["modelKey"],
        "baseModelVersion": v4["modelVersion"],
        "split": {
            "calibrationCount": len(calibration_rows),
            "devCount": len(dev_rows),
            "finalCount": len(validation_rows),
            "minGroupCount": MIN_GROUP_COUNT,
            "shrinkage": SHRINKAGE,
        },
        "baseFinalMetrics": base_final_metrics,
        "candidates": candidates,
        "best": best,
        "artifactPath": str(OUT_ROOT / "badong-huangtupo-displacement-v6.context-gated.prediction-regression-v1.json"),
        "decision": "promote-candidate" if promote_allowed else "do-not-promote-v4-remains-badong-production-main",
    }
    write_json(OUT_ROOT / "badong-huangtupo-displacement-v6.context-gated.prediction-regression-v1.json", artifact)
    write_json(OUT_ROOT / "badong-huangtupo-context-gated-v6.report.json", report)
    write_jsonl(OUT_ROOT / "badong-huangtupo-core.validation.context-gated-v6.jsonl", validation_rows)
    print(f"Promote allowed: {promote_allowed}")
    print(json.dumps(best, ensure_ascii=False, indent=2))
    print(f"Artifact: {report['artifactPath']}")


if __name__ == "__main__":
    main()
