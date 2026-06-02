import json
import math
import pathlib
import time
import warnings
from collections import defaultdict

import numpy as np
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, HistGradientBoostingRegressor
from sklearn.linear_model import HuberRegressor, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler


ROOT = pathlib.Path(".")
TRAIN = ROOT / ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl"
OUT_DIR = ROOT / ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-component-residual-challengers"
CORE_KEYS = [
    "displacementSurfaceMm",
    "displacementSurfaceMm_delta_6h",
    "displacementSurfaceMm_delta_24h",
    "displacementSurfaceMm_delta_72h",
    "displacementSurfaceMm_mean_24h",
    "displacementSurfaceMm_mean_72h",
    "rainfallCurrentMm",
    "rainfallCurrentMm_sum_6h",
    "rainfallCurrentMm_sum_24h",
    "rainfallCurrentMm_sum_72h",
    "reservoirLevelM",
    "reservoirLevelM_delta_6h",
    "reservoirLevelM_delta_24h",
    "reservoirLevelM_delta_72h",
]
REQUIRED_KEYS = [
    "displacementSurfaceMm_delta_24h",
    "displacementSurfaceMm_delta_72h",
    "rainfallCurrentMm_sum_24h",
    "rainfallCurrentMm_sum_72h",
    "reservoirLevelM_delta_24h",
    "reservoirLevelM_delta_72h",
]
TREND_PRIOR_KEYS = ["trendPriorSlope3", "trendPriorSlope5", "trendPriorSlope10", "trendPriorSlope20", "trendPriorRobustBlend"]
BASELINE_TO_BEAT = {
    "displayName": "BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14",
    "mae": 0.633075,
    "rmse": 0.893631,
    "r2": 0.123579,
    "directionAccuracy": 0.5828,
    "within1mm": 0.8077,
    "thresholdAgreement": 0.8632,
    "p90AbsError": 1.392424,
}


def finite_or_nan(value):
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else np.nan


def point_id(sample):
    return str(sample.get("rawRef", {}).get("originalFields", {}).get("point_id") or "unknown")


def event_ts(sample):
    return str(sample.get("eventTs") or "")


def event_month(sample):
    try:
        return int(event_ts(sample)[5:7])
    except (TypeError, ValueError):
        return 0


def load_jsonl(path):
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            sample = json.loads(line)
            label = sample.get("labels", {}).get("displacementLabel")
            metrics = sample.get("metricsNormalized", {})
            has_required = all(isinstance(metrics.get(key), (int, float)) and math.isfinite(metrics.get(key)) for key in REQUIRED_KEYS)
            if isinstance(label, (int, float)) and math.isfinite(label) and has_required:
                sample["_features"] = {}
                rows.append(sample)
    return rows


def linear_slope(values):
    values = [float(value) for value in values if math.isfinite(value)]
    if len(values) < 2:
        return 0.0
    x_values = np.arange(len(values), dtype=float)
    x_mean = float(np.mean(x_values))
    y_mean = float(np.mean(values))
    denominator = float(np.sum((x_values - x_mean) ** 2))
    if denominator <= 0:
        return 0.0
    return float(np.sum((x_values - x_mean) * (np.array(values, dtype=float) - y_mean)) / denominator)


def robust_delta(values):
    values = [float(value) for value in values if math.isfinite(value)]
    if len(values) < 2:
        return 0.0
    deltas = np.diff(values)
    return float(np.median(deltas))


def fill_component_features(sample, history):
    metrics = sample.get("metricsNormalized", {})
    current_displacement = finite_or_nan(metrics.get("displacementSurfaceMm"))
    current_rainfall = finite_or_nan(metrics.get("rainfallCurrentMm"))
    current_reservoir = finite_or_nan(metrics.get("reservoirLevelM"))
    values = [item["displacement"] for item in history if math.isfinite(item["displacement"])]
    rainfall = [item["rainfall"] for item in history if math.isfinite(item["rainfall"])]
    reservoir = [item["reservoir"] for item in history if math.isfinite(item["reservoir"])]
    if math.isfinite(current_displacement):
        values = [*values, current_displacement]
    if math.isfinite(current_rainfall):
        rainfall = [*rainfall, current_rainfall]
    if math.isfinite(current_reservoir):
        reservoir = [*reservoir, current_reservoir]

    features = sample["_features"]
    features["historyCount"] = float(len(values))
    slope_values = {}
    robust_values = {}
    for window in [3, 5, 10, 20]:
        recent = values[-window:]
        recent_rain = rainfall[-window:]
        recent_reservoir = reservoir[-window:]
        slope = linear_slope(recent)
        robust = robust_delta(recent)
        slope_values[window] = slope
        robust_values[window] = robust
        if recent:
            current = recent[-1]
            mean_value = float(np.mean(recent))
            deltas = np.diff(recent) if len(recent) >= 2 else np.array([0.0])
            features[f"componentMean{window}"] = mean_value
            features[f"componentResidualMean{window}"] = current - mean_value
            features[f"componentSlope{window}"] = slope
            features[f"componentRobustDelta{window}"] = robust
            features[f"componentVolatility{window}"] = float(np.std(deltas))
            features[f"componentRange{window}"] = float(max(recent) - min(recent))
        else:
            for prefix in ["Mean", "ResidualMean", "Slope", "RobustDelta", "Volatility", "Range"]:
                features[f"component{prefix}{window}"] = 0.0
        features[f"componentRainfallMean{window}"] = float(np.mean(recent_rain)) if recent_rain else 0.0
        features[f"componentReservoirSlope{window}"] = linear_slope(recent_reservoir)

    features["trendPriorSlope3"] = slope_values[3]
    features["trendPriorSlope5"] = slope_values[5]
    features["trendPriorSlope10"] = slope_values[10]
    features["trendPriorSlope20"] = slope_values[20]
    features["trendPriorRobustBlend"] = 0.5 * slope_values[5] + 0.3 * robust_values[5] + 0.2 * slope_values[20]


def update_history(history, sample):
    metrics = sample.get("metricsNormalized", {})
    displacement = finite_or_nan(metrics.get("displacementSurfaceMm"))
    if not math.isfinite(displacement):
        return
    history.append(
        {
            "displacement": displacement,
            "rainfall": finite_or_nan(metrics.get("rainfallCurrentMm")),
            "reservoir": finite_or_nan(metrics.get("reservoirLevelM")),
        }
    )


def add_component_features(train_rows, validation_rows):
    train_history = defaultdict(list)
    for sample in sorted(train_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", ""))):
        history = train_history[point_id(sample)]
        fill_component_features(sample, history)
        update_history(history, sample)

    validation_history = defaultdict(list, {key: list(value) for key, value in train_history.items()})
    for sample in sorted(validation_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", ""))):
        history = validation_history[point_id(sample)]
        fill_component_features(sample, history)
        update_history(history, sample)


def feature_keys():
    component_keys = ["historyCount"]
    for window in [3, 5, 10, 20]:
        component_keys.extend(
            [
                f"componentMean{window}",
                f"componentResidualMean{window}",
                f"componentSlope{window}",
                f"componentRobustDelta{window}",
                f"componentVolatility{window}",
                f"componentRange{window}",
                f"componentRainfallMean{window}",
                f"componentReservoirSlope{window}",
            ]
        )
    return [*CORE_KEYS, *component_keys, *TREND_PRIOR_KEYS]


def build_matrix(rows, keys):
    x_rows = []
    y_values = []
    priors = []
    for sample in rows:
        metrics = sample.get("metricsNormalized", {})
        features = sample.get("_features", {})
        values = []
        for key in keys:
            value = metrics.get(key, features.get(key, np.nan))
            values.append(finite_or_nan(value))
        current_point = point_id(sample)
        month = event_month(sample)
        values.extend(
            [
                1.0 if current_point == "ZD1" else 0.0,
                1.0 if current_point == "ZD2" else 0.0,
                1.0 if current_point == "ZD3" else 0.0,
                math.sin(2 * math.pi * month / 12),
                math.cos(2 * math.pi * month / 12),
            ]
        )
        x_rows.append(values)
        y_values.append(float(sample["labels"]["displacementLabel"]))
        priors.append({key: float(features.get(key, 0.0)) for key in TREND_PRIOR_KEYS})
    return np.array(x_rows, dtype=float), np.array(y_values, dtype=float), priors


def impute_and_scale(x_train, x_validation, scale):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        medians = np.nanmedian(x_train, axis=0)
    medians = np.where(np.isfinite(medians), medians, 0.0)
    x_train = np.where(np.isfinite(x_train), x_train, medians)
    x_validation = np.where(np.isfinite(x_validation), x_validation, medians)
    if not scale:
        return x_train, x_validation
    scaler = StandardScaler()
    return scaler.fit_transform(x_train), scaler.transform(x_validation)


def evaluate(y_true, y_pred):
    abs_error = np.abs(y_true - y_pred)
    true_threshold = np.abs(y_true) >= 1.3
    pred_threshold = np.abs(y_pred) >= 1.3
    true_direction = np.sign(y_true)
    pred_direction = np.sign(y_pred)
    direction_mask = true_direction != 0
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(math.sqrt(mean_squared_error(y_true, y_pred))),
        "r2": float(r2_score(y_true, y_pred)),
        "directionAccuracy": float(np.mean(true_direction[direction_mask] == pred_direction[direction_mask])) if np.any(direction_mask) else 0.0,
        "within1mm": float(np.mean(abs_error <= 1.0)),
        "thresholdAgreement": float(np.mean(true_threshold == pred_threshold)),
        "p50AbsError": float(np.quantile(abs_error, 0.5)),
        "p90AbsError": float(np.quantile(abs_error, 0.9)),
    }


def model_specs():
    return [
        ("component-ridge", Ridge(alpha=3.0), True),
        ("component-huber", HuberRegressor(epsilon=1.2, alpha=0.001, max_iter=1400), True),
        ("component-hist-gradient-boosting", HistGradientBoostingRegressor(max_iter=240, learning_rate=0.035, max_leaf_nodes=15, l2_regularization=0.3, random_state=61), False),
        ("component-gradient-boosting-huber", GradientBoostingRegressor(loss="huber", n_estimators=220, learning_rate=0.035, max_depth=2, min_samples_leaf=10, random_state=62), False),
        ("component-extra-trees", ExtraTreesRegressor(n_estimators=260, max_depth=9, min_samples_leaf=8, random_state=63, n_jobs=-1), False),
    ]


def render_markdown(report):
    lines = [
        "# Baijiabao Component Residual Displacement Challengers",
        "",
        f"- generatedAt: `{report['generatedAt']}`",
        f"- trainRows: `{report['trainRows']}`",
        f"- validationRows: `{report['validationRows']}`",
        "- target: `labels.displacementLabel` future 24h displacement delta in mm",
        "- method: leakage-safe cumulative displacement trend priors plus residual learners",
        "",
        "## Baseline To Beat",
        "",
        "| Model | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        "| `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` | `0.633` | `0.894` | `0.1236` | `58.28%` | `80.77%` | `86.32%` | `1.392` |",
        "",
        "## Leaderboard",
        "",
        "| Rank | Prior | Model | Mode | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
        "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for index, item in enumerate(report["leaderboard"][:16], start=1):
        metrics = item["validationMetrics"]
        lines.append(
            f"| {index} | `{item['trendPrior']}` | `{item['modelName']}` | `{item['targetMode']}` | `{metrics['mae']:.3f}` | `{metrics['rmse']:.3f}` | "
            f"`{metrics['r2']:.4f}` | `{metrics['directionAccuracy'] * 100:.2f}%` | `{metrics['within1mm'] * 100:.2f}%` | "
            f"`{metrics['thresholdAgreement'] * 100:.2f}%` | `{metrics['p90AbsError']:.3f}` |"
        )
    return "\n".join(lines) + "\n"


def main():
    train_rows = load_jsonl(TRAIN)
    validation_rows = load_jsonl(VALIDATION)
    add_component_features(train_rows, validation_rows)
    keys = feature_keys()
    x_train, y_train, train_priors = build_matrix(train_rows, keys)
    x_validation, y_validation, validation_priors = build_matrix(validation_rows, keys)
    candidates = []

    for trend_prior in ["none", *TREND_PRIOR_KEYS]:
        train_prior_values = np.zeros_like(y_train) if trend_prior == "none" else np.array([item[trend_prior] for item in train_priors])
        validation_prior_values = np.zeros_like(y_validation) if trend_prior == "none" else np.array([item[trend_prior] for item in validation_priors])
        for target_mode in ["direct", "residual"]:
            target_train = y_train if target_mode == "direct" else y_train - train_prior_values
            for model_name, model, scale in model_specs():
                started = time.time()
                train_features, validation_features = impute_and_scale(x_train, x_validation, scale)
                model.fit(train_features, target_train)
                raw_prediction = model.predict(validation_features)
                prediction = raw_prediction if target_mode == "direct" else raw_prediction + validation_prior_values
                candidates.append(
                    {
                        "trendPrior": trend_prior,
                        "modelName": model_name,
                        "targetMode": target_mode,
                        "featureCount": int(train_features.shape[1]),
                        "trainEvaluatedCount": int(len(y_train)),
                        "validationEvaluatedCount": int(len(y_validation)),
                        "runtimeSeconds": round(time.time() - started, 3),
                        "validationMetrics": evaluate(y_validation, prediction),
                    }
                )

    leaderboard = sorted(candidates, key=lambda item: (item["validationMetrics"]["rmse"], item["validationMetrics"]["mae"]))
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "trainRows": len(train_rows),
        "validationRows": len(validation_rows),
        "baselineToBeat": BASELINE_TO_BEAT,
        "featureKeys": keys,
        "leaderboard": leaderboard,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "baijiabao-displacement-component-residual-challengers.report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "baijiabao-displacement-component-residual-challengers.report.md").write_text(render_markdown(report), encoding="utf-8")
    best = leaderboard[0]
    metrics = best["validationMetrics"]
    print(f"Wrote component residual challenger report to {OUT_DIR}")
    print(
        f"Best component residual challenger: prior={best['trendPrior']} mode={best['targetMode']} {best['modelName']} "
        f"MAE={metrics['mae']:.6f} RMSE={metrics['rmse']:.6f} R2={metrics['r2']:.6f} "
        f"Direction={metrics['directionAccuracy'] * 100:.2f}% Within={metrics['within1mm'] * 100:.2f}%"
    )


if __name__ == "__main__":
    main()
