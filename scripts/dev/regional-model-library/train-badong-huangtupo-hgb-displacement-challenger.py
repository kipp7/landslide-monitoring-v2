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
OUT_ROOT = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-displacement-challenger"
LABEL_KEY = "displacementLabel"
MODEL_KEY = "badong-huangtupo.displacement.hgb-windowed-multisensor-v2"
MODEL_VERSION = "0.2.0"
REGION_CODE = "CN-HB-BADONG-HUANGTUPO"

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
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False) for row in rows) + "\n", encoding="utf-8")


def finite_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


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
        if event_hours is None:
            continue
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


def collect_feature_keys(train_rows: list[dict[str, Any]]) -> list[str]:
    counts: dict[str, int] = defaultdict(int)
    for row in train_rows:
        metrics = row.get("metricsNormalized", {})
        if not isinstance(metrics, dict):
            continue
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
        if label is None:
            continue
        metrics = row.get("metricsNormalized", {})
        if not isinstance(metrics, dict):
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

    baseline_predictions = np.zeros_like(y_validation)
    baseline_metrics = compute_metrics(y_validation, baseline_predictions)
    candidates = [
        {
            "key": "hgb-absolute-m80-lr003-l2p5-leaf120",
            "model": HistGradientBoostingRegressor(
                loss="absolute_error",
                max_iter=80,
                learning_rate=0.03,
                l2_regularization=0.5,
                min_samples_leaf=120,
                random_state=3,
            ),
        },
        {
            "key": "hgb-absolute-m120-lr0025-l2p8-leaf160",
            "model": HistGradientBoostingRegressor(
                loss="absolute_error",
                max_iter=120,
                learning_rate=0.025,
                l2_regularization=0.8,
                min_samples_leaf=160,
                random_state=7,
            ),
        },
        {
            "key": "hgb-squared-m100-lr002-l2p8-leaf180",
            "model": HistGradientBoostingRegressor(
                loss="squared_error",
                max_iter=100,
                learning_rate=0.02,
                l2_regularization=0.8,
                min_samples_leaf=180,
                random_state=11,
            ),
        },
    ]

    leaderboard: list[dict[str, Any]] = [
        {
            "modelKey": "zero-delta-persistence",
            "type": "baseline",
            "metrics": baseline_metrics,
            "deltaVsZero": metric_delta(baseline_metrics, baseline_metrics),
        }
    ]
    fitted: dict[str, tuple[HistGradientBoostingRegressor, np.ndarray]] = {}
    for candidate in candidates:
        model = candidate["model"]
        model.fit(x_train, y_train)
        predictions = model.predict(x_validation)
        metrics = compute_metrics(y_validation, predictions)
        leaderboard.append({
            "modelKey": candidate["key"],
            "type": "sklearn-hist-gradient-boosting",
            "metrics": metrics,
            "deltaVsZero": metric_delta(metrics, baseline_metrics),
        })
        fitted[candidate["key"]] = (model, predictions)

    def score(item: dict[str, Any]) -> tuple[float, float, float]:
        metrics = item["metrics"]
        return (metrics["mae"], metrics["rmse"], -metrics["directionAccuracy"])

    challenger_items = [item for item in leaderboard if item["modelKey"] != "zero-delta-persistence"]
    selected = min(challenger_items, key=score)
    selected_model, selected_predictions = fitted[selected["modelKey"]]

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
        "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "entrypoint": "prediction-regression-v1",
        "labelKey": LABEL_KEY,
        "requiredFeatureKeys": ["displacementSurfaceMm"],
        "targetUnit": "mm",
        "horizonSpec": "24h",
        "trainingSummary": {
            "sampleCount": int(len(y_train)),
            "validationSampleCount": int(len(y_validation)),
        },
        "model": export_hgb_model(selected_model, feature_keys),
        "validationMetrics": selected["metrics"],
        "metadata": {
            "operationalRole": "forecast",
            "displayName": "BD-HTP-DP-HGB-WINDOWED-MULTISENSOR-v2",
            "targetDescription": "Future displacement delta in millimeters for the Badong-Huangtupo regional open core pack.",
            "sourceDataset": "Badong-Huangtupo official open core monitoring pack",
            "modelFamily": "hist-gradient-boosting-windowed-multisensor",
            "featureFamily": "runtime-aligned displacement/beidou/slip-belt/crack/rainfall windows",
            "selectionProfile": selected["modelKey"],
            "baselineModelKey": "badong-huangtupo.displacement.zero-delta-region-baseline-v1",
            "baselineMetrics": baseline_metrics,
            "deltaVsZero": selected["deltaVsZero"],
            "registryRole": "data-side-challenger",
            "activeProduction": False,
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

    artifact_path = OUT_ROOT / "badong-huangtupo-displacement-v2.hgb-windowed-multisensor.prediction-regression-v1.json"
    augmented_train_path = OUT_ROOT / "badong-huangtupo-core.train.runtime-window-features.jsonl"
    augmented_validation_path = OUT_ROOT / "badong-huangtupo-core.validation.runtime-window-features.jsonl"
    write_jsonl(augmented_train_path, train_rows)
    write_jsonl(augmented_validation_path, validation_rows)

    report = {
        "generatedAt": artifact["createdAt"],
        "modelLine": "Badong-Huangtupo HGB windowed multisensor displacement challenger",
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "sourceSamples": {
            "train": str(TRAIN),
            "validation": str(VALIDATION),
        },
        "data": {
            "trainCount": int(len(y_train)),
            "validationCount": int(len(y_validation)),
            "featureCount": len(feature_keys),
            "featureKeys": feature_keys,
        },
        "leaderboard": leaderboard,
        "selectedModelKey": selected["modelKey"],
        "selectedMetrics": selected["metrics"],
        "deltaVsZero": selected["deltaVsZero"],
        "artifactPath": str(artifact_path),
        "runtimeWindowFeatureSamples": {
            "train": str(augmented_train_path),
            "validation": str(augmented_validation_path),
        },
        "sklearnVersion": sklearn.__version__,
    }

    write_json(artifact_path, artifact)
    write_json(OUT_ROOT / "badong-huangtupo-hgb-displacement-challenger.report.json", report)
    write_predictions(
        OUT_ROOT / "badong-huangtupo-hgb-displacement-challenger.validation-predictions.csv",
        kept_validation_rows,
        y_validation,
        selected_predictions,
    )

    print(f"Selected model: {selected['modelKey']}")
    print(json.dumps(selected["metrics"], ensure_ascii=False, indent=2))
    print(f"Delta vs zero: {json.dumps(selected['deltaVsZero'], ensure_ascii=False, indent=2)}")
    print(f"Artifact: {artifact_path}")


if __name__ == "__main__":
    main()
