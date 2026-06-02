import csv
import json
import math
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


ROOT = Path(".")
TRAIN = ROOT / ".tmp/regional-model-library/out/badong-huangtupo/core-samples/splits/badong-huangtupo-core.train.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/badong-huangtupo/core-samples/splits/badong-huangtupo-core.validation.jsonl"
OUT_ROOT = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-support-guarded-production-v4"
LABEL_KEY = "displacementLabel"
MODEL_KEY = "badong-huangtupo.displacement.hgb-windowed-multisensor-support-guarded-v4"
MODEL_VERSION = "0.4.0"
REGION_CODE = "CN-HB-BADONG-HUANGTUPO"
SELECTED_PROFILE = "hgb-absolute-m120-lr0025-l2p8-leaf160"

WINDOW_HOURS = (6, 24, 72)
BASE_WINDOW_KEYS = (
    "displacementSurfaceMm",
    "rainfallCurrentMm",
    "crackDisplacementMm",
    "beidouDispX",
    "beidouDispY",
    "beidouDispZ",
    "beidouDisplacementChangeMm",
    "slipBeltDisplacementMm",
)
DIRECT_ALIAS = {
    "displacementObservedMm": "displacementSurfaceMm",
    "caveCrackMm": "crackDisplacementMm",
}
MIN_FEATURE_COUNT = 100


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")


def finite_number(value: Any) -> float | None:
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else None


def parse_event_ts_hours(row: dict[str, Any]) -> float | None:
    value = row.get("eventTs")
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() / 3600
    except ValueError:
        return None


def resolve_group_key(row: dict[str, Any]) -> str:
    original = row.get("rawRef", {}).get("originalFields", {})
    if isinstance(original, dict):
        value = original.get("core_group_key") or original.get("point_id") or original.get("sensor_code")
        if isinstance(value, str) and value:
            return value
    identity = row.get("identity", {})
    return str(identity.get("stationCode") or identity.get("scopeKey") or "unknown")


def align_runtime_metrics(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        metrics = row.setdefault("metricsNormalized", {})
        if not isinstance(metrics, dict):
            continue
        for source_key, target_key in DIRECT_ALIAS.items():
            value = finite_number(metrics.get(source_key))
            if value is not None and finite_number(metrics.get(target_key)) is None:
                metrics[target_key] = value


def add_window_features(rows: list[dict[str, Any]]) -> None:
    groups: dict[str, list[tuple[float, dict[str, Any]]]] = defaultdict(list)
    for row in rows:
        event_hours = parse_event_ts_hours(row)
        if event_hours is not None:
            groups[resolve_group_key(row)].append((event_hours, row))

    for group_rows in groups.values():
        group_rows.sort(key=lambda item: item[0])
        for base_key in BASE_WINDOW_KEYS:
            windows = {hours: deque() for hours in WINDOW_HOURS}
            for event_hours, row in group_rows:
                metrics = row.get("metricsNormalized", {})
                value = finite_number(metrics.get(base_key)) if isinstance(metrics, dict) else None
                if value is not None:
                    for window in windows.values():
                        window.append((event_hours, value))
                for hours, window in windows.items():
                    while window and window[0][0] < event_hours - hours:
                        window.popleft()
                    values = [item[1] for item in window]
                    if not values or not isinstance(metrics, dict):
                        continue
                    metrics[f"{base_key}_last_{hours}h"] = round(values[-1], 6)
                    metrics[f"{base_key}_mean_{hours}h"] = round(float(np.mean(values)), 6)
                    metrics[f"{base_key}_min_{hours}h"] = round(float(np.min(values)), 6)
                    metrics[f"{base_key}_max_{hours}h"] = round(float(np.max(values)), 6)
                    if len(values) >= 2:
                        metrics[f"{base_key}_delta_{hours}h"] = round(values[-1] - values[0], 6)
                    if base_key == "rainfallCurrentMm":
                        metrics[f"{base_key}_sum_{hours}h"] = round(float(np.sum(values)), 6)


def collect_feature_keys(rows: list[dict[str, Any]]) -> list[str]:
    counts: dict[str, int] = defaultdict(int)
    for row in rows:
        metrics = row.get("metricsNormalized", {})
        if isinstance(metrics, dict):
            for key, value in metrics.items():
                if finite_number(value) is not None:
                    counts[key] += 1
    return sorted(key for key, count in counts.items() if count >= MIN_FEATURE_COUNT)


def build_matrix(rows: list[dict[str, Any]], feature_keys: list[str]) -> tuple[np.ndarray, np.ndarray, list[dict[str, Any]]]:
    matrix: list[list[float]] = []
    labels: list[float] = []
    kept_rows: list[dict[str, Any]] = []
    for row in rows:
        label = finite_number(row.get("labels", {}).get(LABEL_KEY))
        metrics = row.get("metricsNormalized", {})
        if label is None or not isinstance(metrics, dict):
            continue
        matrix.append([
            finite_number(metrics.get(feature_key)) if finite_number(metrics.get(feature_key)) is not None else math.nan
            for feature_key in feature_keys
        ])
        labels.append(label)
        kept_rows.append(row)
    return np.asarray(matrix, dtype=float), np.asarray(labels, dtype=float), kept_rows


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    abs_error = np.abs(y_true - y_pred)
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(math.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
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


def passes_final_guard(metrics: dict[str, float], baseline: dict[str, float]) -> bool:
    return (
        metrics["mae"] < baseline["mae"]
        and metrics["rmse"] < baseline["rmse"]
        and metrics["r2"] > baseline["r2"]
        and metrics["directionAccuracy"] >= baseline["directionAccuracy"]
        and metrics["within1mm"] >= baseline["within1mm"]
        and metrics["p90AbsoluteError"] <= baseline["p90AbsoluteError"]
    )


def make_model() -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss="absolute_error",
        max_iter=120,
        learning_rate=0.025,
        l2_regularization=0.8,
        min_samples_leaf=160,
        random_state=7,
    )


def export_hgb_model(model: HistGradientBoostingRegressor, feature_keys: list[str]) -> dict[str, Any]:
    trees: list[list[dict[str, Any]]] = []
    for predictor_group in model._predictors:
        predictor = predictor_group[0]
        tree_nodes: list[dict[str, Any]] = []
        for node in predictor.nodes:
            tree_nodes.append({
                "featureIndex": int(node["feature_idx"]),
                "threshold": float(node["num_threshold"]),
                "left": int(node["left"]),
                "right": int(node["right"]),
                "value": float(node["value"]),
                "isLeaf": bool(node["is_leaf"]),
                "missingGoToLeft": bool(node["missing_go_to_left"]),
            })
        trees.append(tree_nodes)
    return {
        "modelType": "sklearn_hist_gradient_boosting_regression_v1",
        "featureKeys": feature_keys,
        "baseline": float(model._baseline_prediction[0][0]),
        "trees": trees,
        "outputScale": 1,
        "outputOffset": 0,
    }


def write_predictions(path: Path, rows: list[dict[str, Any]], y_true: np.ndarray, y_pred: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["sampleId", "eventTs", "stationCode", "family", "yTrue", "yPred", "absError"])
        writer.writeheader()
        for row, true, pred in zip(rows, y_true, y_pred):
            writer.writerow({
                "sampleId": row.get("sampleId"),
                "eventTs": row.get("eventTs"),
                "stationCode": row.get("identity", {}).get("stationCode"),
                "family": row.get("rawRef", {}).get("originalFields", {}).get("core_family"),
                "yTrue": f"{true:.6f}",
                "yPred": f"{pred:.6f}",
                "absError": f"{abs(true - pred):.6f}",
            })


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    train_rows = read_jsonl(TRAIN)
    validation_rows = read_jsonl(VALIDATION)
    all_rows = train_rows + validation_rows
    align_runtime_metrics(all_rows)
    add_window_features(all_rows)

    feature_keys = collect_feature_keys(train_rows)
    x_train, y_train, _ = build_matrix(train_rows, feature_keys)
    x_validation, y_validation, kept_validation_rows = build_matrix(validation_rows, feature_keys)

    zero_predictions = np.zeros_like(y_validation)
    zero_metrics = compute_metrics(y_validation, zero_predictions)
    model = make_model()
    model.fit(x_train, y_train)
    predictions = model.predict(x_validation)
    metrics = compute_metrics(y_validation, predictions)
    delta = metric_delta(metrics, zero_metrics)
    promote_allowed = passes_final_guard(metrics, zero_metrics)
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    artifact_path = OUT_ROOT / "badong-huangtupo-displacement-v4.hgb-support-guarded.prediction-regression-v1.json"
    augmented_train_path = OUT_ROOT / "badong-huangtupo-core.train.runtime-window-features.jsonl"
    augmented_validation_path = OUT_ROOT / "badong-huangtupo-core.validation.runtime-window-features.jsonl"
    write_jsonl(augmented_train_path, train_rows)
    write_jsonl(augmented_validation_path, validation_rows)

    artifact = {
        "schemaVersion": "prediction-regression-model.v1",
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "scopeType": "region",
        "scopeKey": REGION_CODE,
        "artifactType": "calibrated_prediction_regression_v1",
        "featureSchemaVersion": "runtime-feature-vector.v1",
        "labelSchemaVersion": "displacement-regression-label.v1",
        "profileVersion": "phase1-profile.v1",
        "trainingDatasetKeys": ["Badong-Huangtupo-official-open-core"],
        "createdAt": created_at,
        "entrypoint": "prediction-regression-v1",
        "labelKey": LABEL_KEY,
        "requiredFeatureKeys": ["displacementSurfaceMm"],
        "targetUnit": "mm",
        "horizonSpec": "24h",
        "trainingSummary": {
            "sampleCount": int(len(y_train)),
            "validationSampleCount": int(len(y_validation)),
        },
        "model": export_hgb_model(model, feature_keys),
        "validationMetrics": metrics,
        "metadata": {
            "operationalRole": "forecast",
            "displayName": "BD-HTP-DP-HGB-SUPPORT-GUARDED-v4",
            "targetDescription": "Future displacement delta in millimeters for the Badong-Huangtupo regional open core pack.",
            "sourceDataset": "Badong-Huangtupo official open core monitoring pack",
            "modelFamily": "hist-gradient-boosting-windowed-multisensor-support-guarded",
            "featureFamily": "runtime-aligned displacement/beidou/slip-belt/crack/rainfall windows",
            "selectionProfile": SELECTED_PROFILE,
            "baselineModelKey": "badong-huangtupo.displacement.zero-delta-region-baseline-v1",
            "baselineMetrics": zero_metrics,
            "deltaVsZero": delta,
            "supportGuard": {
                "mode": "fit-on-all-pre-final-train-final-holdout-guard",
                "trainCount": int(len(y_train)),
                "finalCount": int(len(y_validation)),
                "strictCalibrationDevScreen": "failed for v3; this model is promoted only as local-support production, not cold-start production",
                "promoteAllowed": promote_allowed,
            },
            "registryRole": "badong-production-main",
            "activeProduction": promote_allowed,
            "routing": {
                "operationalRole": "forecast",
                "outputType": "displacement-forecast",
                "primaryWarningArtifact": False,
            },
            "matcher": {
                "operationalRole": "forecast",
                "scopeAliases": {
                    "region": [
                        "CN-HB-BADONG-HUANGTUPO",
                        "CN-HB-BADONG",
                        "CN-420823",
                        "Badong-Huangtupo",
                        "Huangtupo",
                        "巴东黄土坡",
                        "黄土坡",
                    ]
                },
            },
            "runtimeBoundary": {
                "requiredFeatureKeys": ["displacementSurfaceMm"],
                "optionalFeaturePolicy": "Missing multisensor/window features are routed through the exported HGB missing-value branches.",
            },
        },
    }
    report = {
        "generatedAt": created_at,
        "promoteAllowed": promote_allowed,
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "selectedProfile": SELECTED_PROFILE,
        "data": {
            "trainCount": int(len(y_train)),
            "validationCount": int(len(y_validation)),
            "featureCount": len(feature_keys),
            "featureKeys": feature_keys,
        },
        "zeroMetrics": zero_metrics,
        "metrics": metrics,
        "deltaVsZero": delta,
        "artifactPath": str(artifact_path),
        "runtimeWindowFeatureSamples": {
            "train": str(augmented_train_path),
            "validation": str(augmented_validation_path),
        },
        "sklearnVersion": sklearn.__version__,
    }
    write_json(artifact_path, artifact)
    write_json(OUT_ROOT / "badong-huangtupo-hgb-support-guarded-production-v4.report.json", report)
    write_predictions(
        OUT_ROOT / "badong-huangtupo-hgb-support-guarded-production-v4.validation-predictions.csv",
        kept_validation_rows,
        y_validation,
        predictions,
    )

    print(f"Selected profile: {SELECTED_PROFILE}")
    print(f"Promote allowed: {promote_allowed}")
    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    print(f"Delta vs zero: {json.dumps(delta, ensure_ascii=False, indent=2)}")
    print(f"Artifact: {artifact_path}")
    if not promote_allowed:
        raise SystemExit("Badong v4 did not pass final support guard.")


if __name__ == "__main__":
    main()
