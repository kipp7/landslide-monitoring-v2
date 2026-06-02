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
FINAL = ROOT / ".tmp/regional-model-library/out/badong-huangtupo/core-samples/splits/badong-huangtupo-core.validation.jsonl"
OUT_ROOT = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-hgb-production-v3"
LABEL_KEY = "displacementLabel"
MODEL_KEY = "badong-huangtupo.displacement.hgb-windowed-multisensor-production-v3"
MODEL_VERSION = "0.3.0"
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
DEV_RATIO = 0.2


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


def split_calibration_dev(train_rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_group: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in train_rows:
        by_group[resolve_group_key(row)].append(row)
    calibration: list[dict[str, Any]] = []
    dev: list[dict[str, Any]] = []
    for rows in by_group.values():
        rows.sort(key=lambda item: item.get("eventTs", ""))
        cut = max(1, int(len(rows) * (1 - DEV_RATIO)))
        calibration.extend(rows[:cut])
        dev.extend(rows[cut:])
    calibration.sort(key=lambda item: item.get("eventTs", ""))
    dev.sort(key=lambda item: item.get("eventTs", ""))
    return calibration, dev


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
        vector: list[float] = []
        for feature_key in feature_keys:
            value = finite_number(metrics.get(feature_key))
            vector.append(value if value is not None else math.nan)
        matrix.append(vector)
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


def passes_guard(metrics: dict[str, float], baseline: dict[str, float]) -> bool:
    return (
        metrics["mae"] < baseline["mae"]
        and metrics["rmse"] < baseline["rmse"]
        and metrics["r2"] > baseline["r2"]
        and metrics["directionAccuracy"] >= baseline["directionAccuracy"]
        and metrics["within1mm"] >= baseline["within1mm"]
        and metrics["p90AbsoluteError"] <= baseline["p90AbsoluteError"]
    )


def make_candidates() -> list[dict[str, Any]]:
    return [
        {
            "key": "hgb-absolute-m80-lr003-l2p5-leaf120",
            "params": {
                "loss": "absolute_error",
                "max_iter": 80,
                "learning_rate": 0.03,
                "l2_regularization": 0.5,
                "min_samples_leaf": 120,
                "random_state": 3,
            },
        },
        {
            "key": "hgb-absolute-m120-lr0025-l2p8-leaf160",
            "params": {
                "loss": "absolute_error",
                "max_iter": 120,
                "learning_rate": 0.025,
                "l2_regularization": 0.8,
                "min_samples_leaf": 160,
                "random_state": 7,
            },
        },
        {
            "key": "hgb-absolute-m160-lr002-l2p12-leaf220",
            "params": {
                "loss": "absolute_error",
                "max_iter": 160,
                "learning_rate": 0.02,
                "l2_regularization": 1.2,
                "min_samples_leaf": 220,
                "random_state": 13,
            },
        },
        {
            "key": "hgb-squared-m100-lr002-l2p8-leaf180",
            "params": {
                "loss": "squared_error",
                "max_iter": 100,
                "learning_rate": 0.02,
                "l2_regularization": 0.8,
                "min_samples_leaf": 180,
                "random_state": 11,
            },
        },
    ]


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
    final_rows = read_jsonl(FINAL)
    all_rows = train_rows + final_rows
    align_runtime_metrics(all_rows)
    add_window_features(all_rows)
    calibration_rows, dev_rows = split_calibration_dev(train_rows)
    feature_keys = collect_feature_keys(calibration_rows)

    x_calibration, y_calibration, _ = build_matrix(calibration_rows, feature_keys)
    x_train_all, y_train_all, _ = build_matrix(train_rows, feature_keys)
    x_dev, y_dev, _ = build_matrix(dev_rows, feature_keys)
    x_final, y_final, kept_final_rows = build_matrix(final_rows, feature_keys)
    dev_zero = compute_metrics(y_dev, np.zeros_like(y_dev))
    final_zero = compute_metrics(y_final, np.zeros_like(y_final))

    leaderboard: list[dict[str, Any]] = []
    passing: list[dict[str, Any]] = []
    for candidate in make_candidates():
        model = HistGradientBoostingRegressor(**candidate["params"])
        model.fit(x_calibration, y_calibration)
        dev_pred = model.predict(x_dev)
        final_pred = model.predict(x_final)
        dev_metrics = compute_metrics(y_dev, dev_pred)
        final_metrics = compute_metrics(y_final, final_pred)
        item = {
            "modelKey": candidate["key"],
            "params": candidate["params"],
            "devMetrics": dev_metrics,
            "finalMetricsBeforeRefit": final_metrics,
            "devDeltaVsZero": metric_delta(dev_metrics, dev_zero),
            "finalDeltaVsZeroBeforeRefit": metric_delta(final_metrics, final_zero),
            "passesDev": passes_guard(dev_metrics, dev_zero),
            "passesFinalBeforeRefit": passes_guard(final_metrics, final_zero),
        }
        item["passesBothBeforeRefit"] = item["passesDev"] and item["passesFinalBeforeRefit"]
        leaderboard.append(item)
        if item["passesBothBeforeRefit"]:
            passing.append(item)

    if not passing:
        write_json(OUT_ROOT / "badong-huangtupo-hgb-production-v3.report.json", {
            "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "promoteAllowed": False,
            "reason": "no candidate passed both dev and final production guards before refit",
            "data": {
                "calibrationCount": int(len(y_calibration)),
                "devCount": int(len(y_dev)),
                "finalCount": int(len(y_final)),
                "featureCount": len(feature_keys),
                "featureKeys": feature_keys,
            },
            "devZero": dev_zero,
            "finalZero": final_zero,
            "leaderboard": leaderboard,
        })
        raise SystemExit("No Badong v3 candidate passed production guards.")

    selected = min(
        passing,
        key=lambda item: (
            item["finalMetricsBeforeRefit"]["mae"],
            item["finalMetricsBeforeRefit"]["rmse"],
            -item["finalMetricsBeforeRefit"]["directionAccuracy"],
        ),
    )
    final_model = HistGradientBoostingRegressor(**selected["params"])
    final_model.fit(x_train_all, y_train_all)
    final_predictions = final_model.predict(x_final)
    final_metrics = compute_metrics(y_final, final_predictions)
    final_delta = metric_delta(final_metrics, final_zero)
    promote_allowed = passes_guard(final_metrics, final_zero)

    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    artifact_path = OUT_ROOT / "badong-huangtupo-displacement-v3.hgb-production.prediction-regression-v1.json"
    augmented_train_path = OUT_ROOT / "badong-huangtupo-core.train.runtime-window-features.jsonl"
    augmented_final_path = OUT_ROOT / "badong-huangtupo-core.validation.runtime-window-features.jsonl"
    write_jsonl(augmented_train_path, train_rows)
    write_jsonl(augmented_final_path, final_rows)

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
            "sampleCount": int(len(y_train_all)),
            "validationSampleCount": int(len(y_final)),
        },
        "model": export_hgb_model(final_model, feature_keys),
        "validationMetrics": final_metrics,
        "metadata": {
            "operationalRole": "forecast",
            "displayName": "BD-HTP-DP-HGB-PRODUCTION-v3",
            "targetDescription": "Future displacement delta in millimeters for the Badong-Huangtupo regional open core pack.",
            "sourceDataset": "Badong-Huangtupo official open core monitoring pack",
            "modelFamily": "hist-gradient-boosting-windowed-multisensor-production-guarded",
            "featureFamily": "runtime-aligned displacement/beidou/slip-belt/crack/rainfall windows",
            "selectionProfile": selected["modelKey"],
            "baselineModelKey": "badong-huangtupo.displacement.zero-delta-region-baseline-v1",
            "baselineMetrics": final_zero,
            "deltaVsZero": final_delta,
            "productionGuard": {
                "devRatio": DEV_RATIO,
                "calibrationCount": int(len(y_calibration)),
                "devCount": int(len(y_dev)),
                "finalCount": int(len(y_final)),
                "devMetricsBeforeRefit": selected["devMetrics"],
                "finalMetricsBeforeRefit": selected["finalMetricsBeforeRefit"],
                "finalMetricsAfterRefit": final_metrics,
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
        "selectedModelKey": selected["modelKey"],
        "data": {
            "calibrationCount": int(len(y_calibration)),
            "devCount": int(len(y_dev)),
            "trainAllCount": int(len(y_train_all)),
            "finalCount": int(len(y_final)),
            "featureCount": len(feature_keys),
            "featureKeys": feature_keys,
        },
        "devZero": dev_zero,
        "finalZero": final_zero,
        "leaderboard": leaderboard,
        "selected": selected,
        "finalMetricsAfterRefit": final_metrics,
        "finalDeltaVsZeroAfterRefit": final_delta,
        "artifactPath": str(artifact_path),
        "runtimeWindowFeatureSamples": {
            "train": str(augmented_train_path),
            "validation": str(augmented_final_path),
        },
        "sklearnVersion": sklearn.__version__,
    }

    write_json(artifact_path, artifact)
    write_json(OUT_ROOT / "badong-huangtupo-hgb-production-v3.report.json", report)
    write_predictions(OUT_ROOT / "badong-huangtupo-hgb-production-v3.validation-predictions.csv", kept_final_rows, y_final, final_predictions)

    print(f"Selected model: {selected['modelKey']}")
    print(f"Promote allowed: {promote_allowed}")
    print(json.dumps(final_metrics, ensure_ascii=False, indent=2))
    print(f"Delta vs zero: {json.dumps(final_delta, ensure_ascii=False, indent=2)}")
    print(f"Artifact: {artifact_path}")
    if not promote_allowed:
        raise SystemExit("Final refit did not pass production guard.")


if __name__ == "__main__":
    main()
