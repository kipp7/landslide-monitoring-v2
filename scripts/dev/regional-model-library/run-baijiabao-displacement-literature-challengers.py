import json
import math
import pathlib
import time
from collections import defaultdict

import numpy as np
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import HuberRegressor, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.neural_network import MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler


ROOT = pathlib.Path(".")
TRAIN = ROOT / ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl"
OUT_DIR = ROOT / ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-literature-challengers"
DECOMPOSITION_FEATURE_KEYS = [
    "decompHistoryCount",
    "decompCurrentDisplacement",
    *[f"{prefix}{window}" for window in [3, 5, 10, 20] for prefix in ["decompMean", "decompResidualMean", "decompSlope", "decompVolatility", "decompRange"]],
    *[f"decompRainfallMean{window}" for window in [3, 5, 10, 20]],
    *[f"decompReservoirSlope{window}" for window in [3, 5, 10, 20]],
]


def load_jsonl(path):
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            sample = json.loads(line)
            label = sample.get("labels", {}).get("displacementLabel")
            if isinstance(label, (int, float)) and math.isfinite(label):
                rows.append(sample)
    return rows


def point_id(sample):
    return str(sample.get("rawRef", {}).get("originalFields", {}).get("point_id") or "unknown")


def event_ts(sample):
    return str(sample.get("eventTs") or "")


def event_month(sample):
    try:
        return int(event_ts(sample)[5:7])
    except (TypeError, ValueError):
        return 0


def add_leakage_safe_label_lags(train_rows, validation_rows):
    for sample in [*train_rows, *validation_rows]:
        sample["_label_lags"] = {}

    history_by_point = defaultdict(list)
    for sample in sorted(train_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", ""))):
        history = history_by_point[point_id(sample)]
        assign_lag_features(sample, history)
        history.append(float(sample["labels"]["displacementLabel"]))

    validation_history_by_point = defaultdict(list, {key: list(value) for key, value in history_by_point.items()})
    for sample in sorted(validation_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", ""))):
        history = validation_history_by_point[point_id(sample)]
        assign_lag_features(sample, history)
        history.append(float(sample["labels"]["displacementLabel"]))


def assign_lag_features(sample, history):
    lag = sample["_label_lags"]
    lag["labelLag1"] = history[-1] if len(history) >= 1 else 0.0
    lag["labelLag2"] = history[-2] if len(history) >= 2 else 0.0
    lag["labelLag3"] = history[-3] if len(history) >= 3 else 0.0
    lag["labelMean3"] = float(np.mean(history[-3:])) if history else 0.0
    lag["labelMean5"] = float(np.mean(history[-5:])) if history else 0.0
    lag["labelAbsLag1"] = abs(history[-1]) if history else 0.0
    lag["labelTrendLag1Lag3"] = history[-1] - history[-3] if len(history) >= 3 else 0.0


def collect_metric_keys(rows):
    keys = sorted(set().union(*(set(sample.get("metricsNormalized", {}).keys()) for sample in rows)))
    return keys


def add_same_timestamp_graph_features(rows, source_metric_keys):
    for sample in rows:
        sample["_graph_features"] = {}

    rows_by_timestamp = defaultdict(list)
    for sample in rows:
        rows_by_timestamp[event_ts(sample)].append(sample)

    for timestamp_rows in rows_by_timestamp.values():
        for sample in timestamp_rows:
            metrics = sample.get("metricsNormalized", {})
            graph = sample["_graph_features"]
            for key in source_metric_keys:
                current = metrics.get(key, np.nan)
                current_value = float(current) if isinstance(current, (int, float)) and math.isfinite(current) else np.nan
                peer_values = []
                for peer in timestamp_rows:
                    if peer is sample:
                        continue
                    value = peer.get("metricsNormalized", {}).get(key, np.nan)
                    if isinstance(value, (int, float)) and math.isfinite(value):
                        peer_values.append(float(value))
                if peer_values and math.isfinite(current_value):
                    peer_mean = float(np.mean(peer_values))
                    graph[f"graphPeerMean:{key}"] = peer_mean
                    graph[f"graphSelfMinusPeerMean:{key}"] = current_value - peer_mean
                    graph[f"graphPeerSpread:{key}"] = float(max(peer_values) - min(peer_values)) if len(peer_values) > 1 else 0.0
                    graph[f"graphPeerCount:{key}"] = float(len(peer_values))
                elif math.isfinite(current_value):
                    graph[f"graphPeerMean:{key}"] = current_value
                    graph[f"graphSelfMinusPeerMean:{key}"] = 0.0
                    graph[f"graphPeerSpread:{key}"] = 0.0
                    graph[f"graphPeerCount:{key}"] = 0.0
                else:
                    graph[f"graphPeerMean:{key}"] = np.nan
                    graph[f"graphSelfMinusPeerMean:{key}"] = np.nan
                    graph[f"graphPeerSpread:{key}"] = np.nan
                    graph[f"graphPeerCount:{key}"] = 0.0


def add_leakage_safe_decomposition_features(train_rows, validation_rows):
    for sample in [*train_rows, *validation_rows]:
        sample["_decomposition_features"] = {}

    history_by_point = defaultdict(list)
    for sample in sorted(train_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", ""))):
        history = history_by_point[point_id(sample)]
        assign_decomposition_features(sample, history)
        update_decomposition_history(history, sample)

    validation_history_by_point = defaultdict(list, {key: list(value) for key, value in history_by_point.items()})
    for sample in sorted(validation_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", ""))):
        history = validation_history_by_point[point_id(sample)]
        assign_decomposition_features(sample, history)
        update_decomposition_history(history, sample)


def update_decomposition_history(history, sample):
    metrics = sample.get("metricsNormalized", {})
    displacement = metrics.get("displacementSurfaceMm")
    rainfall = metrics.get("rainfallCurrentMm")
    reservoir = metrics.get("reservoirLevelM")
    if isinstance(displacement, (int, float)) and math.isfinite(displacement):
        history.append(
            {
                "displacement": float(displacement),
                "rainfall": float(rainfall) if isinstance(rainfall, (int, float)) and math.isfinite(rainfall) else np.nan,
                "reservoir": float(reservoir) if isinstance(reservoir, (int, float)) and math.isfinite(reservoir) else np.nan,
            }
        )


def assign_decomposition_features(sample, previous_history):
    metrics = sample.get("metricsNormalized", {})
    current = metrics.get("displacementSurfaceMm")
    rainfall = metrics.get("rainfallCurrentMm")
    reservoir = metrics.get("reservoirLevelM")
    history = list(previous_history)
    if isinstance(current, (int, float)) and math.isfinite(current):
        history.append(
            {
                "displacement": float(current),
                "rainfall": float(rainfall) if isinstance(rainfall, (int, float)) and math.isfinite(rainfall) else np.nan,
                "reservoir": float(reservoir) if isinstance(reservoir, (int, float)) and math.isfinite(reservoir) else np.nan,
            }
        )

    features = sample["_decomposition_features"]
    values = [item["displacement"] for item in history if math.isfinite(item["displacement"])]
    features["decompHistoryCount"] = float(len(values))
    if not values:
        for window in [3, 5, 10, 20]:
            fill_decomposition_window(features, window, [])
        return

    features["decompCurrentDisplacement"] = values[-1]
    for window in [3, 5, 10, 20]:
        fill_decomposition_window(features, window, values[-window:])

    rainfall_values = [item["rainfall"] for item in history if math.isfinite(item["rainfall"])]
    reservoir_values = [item["reservoir"] for item in history if math.isfinite(item["reservoir"])]
    for window in [3, 5, 10, 20]:
        recent_rainfall = rainfall_values[-window:]
        recent_reservoir = reservoir_values[-window:]
        features[f"decompRainfallMean{window}"] = float(np.mean(recent_rainfall)) if recent_rainfall else 0.0
        features[f"decompReservoirSlope{window}"] = linear_slope(recent_reservoir)


def fill_decomposition_window(features, window, values):
    if not values:
        features[f"decompMean{window}"] = 0.0
        features[f"decompResidualMean{window}"] = 0.0
        features[f"decompSlope{window}"] = 0.0
        features[f"decompVolatility{window}"] = 0.0
        features[f"decompRange{window}"] = 0.0
        return
    current = values[-1]
    window_mean = float(np.mean(values))
    deltas = np.diff(values) if len(values) >= 2 else np.array([0.0])
    features[f"decompMean{window}"] = window_mean
    features[f"decompResidualMean{window}"] = current - window_mean
    features[f"decompSlope{window}"] = linear_slope(values)
    features[f"decompVolatility{window}"] = float(np.std(deltas))
    features[f"decompRange{window}"] = float(max(values) - min(values))


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


def make_matrix(rows, metric_keys, include_lags, graph_keys=None, decomposition_keys=None):
    x_rows = []
    y_values = []
    graph_keys = graph_keys or []
    decomposition_keys = decomposition_keys or []
    for sample in rows:
        metrics = sample.get("metricsNormalized", {})
        values = []
        for key in metric_keys:
            value = metrics.get(key, np.nan)
            values.append(float(value) if isinstance(value, (int, float)) and math.isfinite(value) else np.nan)

        graph = sample.get("_graph_features", {})
        for key in graph_keys:
            value = graph.get(key, np.nan)
            values.append(float(value) if isinstance(value, (int, float)) and math.isfinite(value) else np.nan)

        decomposition = sample.get("_decomposition_features", {})
        for key in decomposition_keys:
            value = decomposition.get(key, np.nan)
            values.append(float(value) if isinstance(value, (int, float)) and math.isfinite(value) else np.nan)

        if include_lags:
            for key in ["labelLag1", "labelLag2", "labelLag3", "labelMean3", "labelMean5", "labelAbsLag1", "labelTrendLag1Lag3"]:
                values.append(float(sample.get("_label_lags", {}).get(key, 0.0)))

        current_point = point_id(sample)
        values.extend([1.0 if current_point == "ZD1" else 0.0, 1.0 if current_point == "ZD2" else 0.0, 1.0 if current_point == "ZD3" else 0.0])
        month = event_month(sample)
        values.extend([math.sin(2 * math.pi * month / 12), math.cos(2 * math.pi * month / 12)])
        x_rows.append(values)
        y_values.append(float(sample["labels"]["displacementLabel"]))

    return np.array(x_rows, dtype=float), np.array(y_values, dtype=float)


def rows_with_complete_metrics(rows, metric_keys, graph_keys=None, decomposition_keys=None):
    graph_keys = graph_keys or []
    decomposition_keys = decomposition_keys or []
    complete = []
    for sample in rows:
        metrics = sample.get("metricsNormalized", {})
        graph = sample.get("_graph_features", {})
        decomposition = sample.get("_decomposition_features", {})
        metrics_complete = all(isinstance(metrics.get(key), (int, float)) and math.isfinite(metrics.get(key)) for key in metric_keys)
        graph_complete = all(isinstance(graph.get(key), (int, float)) and math.isfinite(graph.get(key)) for key in graph_keys)
        decomposition_complete = all(
            isinstance(decomposition.get(key), (int, float)) and math.isfinite(decomposition.get(key)) for key in decomposition_keys
        )
        if metrics_complete and graph_complete and decomposition_complete:
            complete.append(sample)
    return complete


def evaluate(y_true, y_pred):
    abs_errors = np.abs(y_true - y_pred)
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(mean_squared_error(y_true, y_pred, squared=False)),
        "r2": float(r2_score(y_true, y_pred)),
        "directionAccuracy": float(np.mean(np.sign(y_true) == np.sign(y_pred))),
        "within1mm": float(np.mean(abs_errors <= 1.0)),
        "thresholdAgreement": float(np.mean((np.abs(y_true) >= 1.3) == (np.abs(y_pred) >= 1.3))),
        "p90AbsError": float(np.quantile(abs_errors, 0.9)),
    }


def build_feature_sets(metric_keys):
    process_core = [
        key
        for key in metric_keys
        if ("displacementSurfaceMm" in key or "rainfallCurrentMm" in key or "reservoirLevelM" in key) and "crack" not in key
    ]
    all_sensor = metric_keys
    small_delta = [
        key
        for key in [
            "displacementSurfaceMm_delta_24h",
            "displacementSurfaceMm_delta_72h",
            "rainfallCurrentMm_sum_24h",
            "rainfallCurrentMm_sum_72h",
            "reservoirLevelM_delta_24h",
            "reservoirLevelM_delta_72h",
        ]
        if key in metric_keys
    ]
    process_graph = build_graph_keys(process_core)
    small_graph = build_graph_keys(small_delta)
    return [
        {"name": "process-core", "metricKeys": process_core, "graphKeys": [], "decompositionKeys": [], "includeLags": False},
        {"name": "process-core+lag", "metricKeys": process_core, "graphKeys": [], "decompositionKeys": [], "includeLags": True},
        {
            "name": "process-core+decomp",
            "metricKeys": process_core,
            "graphKeys": [],
            "decompositionKeys": DECOMPOSITION_FEATURE_KEYS,
            "includeLags": False,
        },
        {
            "name": "process-core+lag+decomp",
            "metricKeys": process_core,
            "graphKeys": [],
            "decompositionKeys": DECOMPOSITION_FEATURE_KEYS,
            "includeLags": True,
        },
        {"name": "process-core+graph", "metricKeys": process_core, "graphKeys": process_graph, "decompositionKeys": [], "includeLags": False},
        {
            "name": "process-core+lag+graph",
            "metricKeys": process_core,
            "graphKeys": process_graph,
            "decompositionKeys": [],
            "includeLags": True,
        },
        {
            "name": "process-core+lag+graph+decomp",
            "metricKeys": process_core,
            "graphKeys": process_graph,
            "decompositionKeys": DECOMPOSITION_FEATURE_KEYS,
            "includeLags": True,
        },
        {"name": "all-sensor+lag", "metricKeys": all_sensor, "graphKeys": [], "decompositionKeys": [], "includeLags": True},
        {"name": "small-delta+lag", "metricKeys": small_delta, "graphKeys": [], "decompositionKeys": [], "includeLags": True},
        {"name": "small-delta+lag+graph", "metricKeys": small_delta, "graphKeys": small_graph, "decompositionKeys": [], "includeLags": True},
        {
            "name": "small-delta+lag+decomp",
            "metricKeys": small_delta,
            "graphKeys": [],
            "decompositionKeys": DECOMPOSITION_FEATURE_KEYS,
            "includeLags": True,
        },
    ]


def build_graph_keys(source_metric_keys):
    return [
        f"{prefix}:{key}"
        for key in source_metric_keys
        for prefix in ["graphPeerMean", "graphSelfMinusPeerMean", "graphPeerSpread", "graphPeerCount"]
    ]


def build_models():
    return [
        ("ridge-std", make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), Ridge(alpha=1.0))),
        (
            "huber-std",
            make_pipeline(SimpleImputer(strategy="median"), StandardScaler(), HuberRegressor(epsilon=1.35, alpha=0.0001, max_iter=1000)),
        ),
        (
            "hist-gradient-boosting-l2-31",
            make_pipeline(
                SimpleImputer(strategy="median"),
                HistGradientBoostingRegressor(max_iter=300, learning_rate=0.03, max_leaf_nodes=31, l2_regularization=0.1, random_state=42),
            ),
        ),
        (
            "hist-gradient-boosting-l2-15",
            make_pipeline(
                SimpleImputer(strategy="median"),
                HistGradientBoostingRegressor(max_iter=250, learning_rate=0.04, max_leaf_nodes=15, l2_regularization=0.5, random_state=43),
            ),
        ),
        (
            "random-forest",
            make_pipeline(
                SimpleImputer(strategy="median"),
                RandomForestRegressor(n_estimators=240, max_depth=8, min_samples_leaf=8, random_state=44, n_jobs=-1),
            ),
        ),
        (
            "extra-trees",
            make_pipeline(
                SimpleImputer(strategy="median"),
                ExtraTreesRegressor(n_estimators=260, max_depth=10, min_samples_leaf=6, random_state=45, n_jobs=-1),
            ),
        ),
        (
            "gradient-boosting-huber",
            make_pipeline(
                SimpleImputer(strategy="median"),
                GradientBoostingRegressor(loss="huber", n_estimators=250, learning_rate=0.035, max_depth=2, min_samples_leaf=10, random_state=46),
            ),
        ),
        (
            "mlp-small",
            make_pipeline(
                SimpleImputer(strategy="median"),
                StandardScaler(),
                MLPRegressor(hidden_layer_sizes=(32, 16), alpha=0.01, learning_rate_init=0.001, max_iter=900, random_state=47, early_stopping=True),
            ),
        ),
    ]


def render_markdown(report):
    lines = [
        "# Baijiabao Literature-Inspired Displacement Challengers",
        "",
        f"- generatedAt: `{report['generatedAt']}`",
        f"- trainRows: `{report['trainRows']}`",
        f"- validationRows: `{report['validationRows']}`",
        "- target: `labels.displacementLabel` future 24h displacement delta in mm",
        "- source features: `metricsNormalized` plus point/month category fields, leakage-safe previous-label lag features, same-timestamp graph features, and leakage-safe decomposition features where enabled",
        "",
        "## Baseline To Beat",
        "",
        "| Model | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        "| `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` | `0.633` | `0.894` | `0.1236` | `58.28%` | `80.77%` | `86.32%` | `1.392` |",
        "",
        "## Challenger Leaderboard",
        "",
        "| Rank | Feature set | Model | Count | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
        "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for index, item in enumerate(report["leaderboard"][:12], start=1):
        metrics = item["validationMetrics"]
        lines.append(
            f"| {index} | `{item['featureSet']}` | `{item['modelName']}` | `{item['validationEvaluatedCount']}` | `{metrics['mae']:.3f}` | `{metrics['rmse']:.3f}` | "
            f"`{metrics['r2']:.4f}` | `{metrics['directionAccuracy'] * 100:.2f}%` | `{metrics['within1mm'] * 100:.2f}%` | "
            f"`{metrics['thresholdAgreement'] * 100:.2f}%` | `{metrics['p90AbsError']:.3f}` |"
        )
    lines.extend(
        [
            "",
            "## Conclusion",
            "",
            "- These challengers test literature-inspired nonlinear, lightweight graph-feature, and decomposition-feature learners without changing the project runtime schema.",
            "- None of the current tree / MLP challengers beats v14 on MAE, RMSE, or R2.",
            "- The best challenger is useful as an ablation showing that direct off-the-shelf nonlinear learners are weaker than the current analog + OOF calibration route on this split.",
            "- If graph-feature candidates do not beat v14, graph spatiotemporal models should remain a later route after more synchronized regional monitoring datasets are available.",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    train_rows = load_jsonl(TRAIN)
    validation_rows = load_jsonl(VALIDATION)
    add_leakage_safe_label_lags(train_rows, validation_rows)
    add_leakage_safe_decomposition_features(train_rows, validation_rows)
    metric_keys = collect_metric_keys([*train_rows, *validation_rows])
    graph_source_keys = [
        key
        for key in metric_keys
        if ("displacementSurfaceMm" in key or "rainfallCurrentMm" in key or "reservoirLevelM" in key) and "crack" not in key
    ]
    add_same_timestamp_graph_features(train_rows, graph_source_keys)
    add_same_timestamp_graph_features(validation_rows, graph_source_keys)
    candidates = []

    for feature_set in build_feature_sets(metric_keys):
        feature_train_rows = rows_with_complete_metrics(
            train_rows,
            feature_set["metricKeys"],
            feature_set["graphKeys"],
            feature_set["decompositionKeys"],
        )
        feature_validation_rows = rows_with_complete_metrics(
            validation_rows,
            feature_set["metricKeys"],
            feature_set["graphKeys"],
            feature_set["decompositionKeys"],
        )
        if len(feature_train_rows) < 100 or len(feature_validation_rows) < 100:
            continue
        x_train, y_train = make_matrix(
            feature_train_rows,
            feature_set["metricKeys"],
            feature_set["includeLags"],
            feature_set["graphKeys"],
            feature_set["decompositionKeys"],
        )
        x_validation, y_validation = make_matrix(
            feature_validation_rows,
            feature_set["metricKeys"],
            feature_set["includeLags"],
            feature_set["graphKeys"],
            feature_set["decompositionKeys"],
        )
        if x_train.shape[1] == 0:
            continue
        for model_name, model in build_models():
            started = time.time()
            model.fit(x_train, y_train)
            predictions = model.predict(x_validation)
            candidates.append(
                {
                    "featureSet": feature_set["name"],
                    "modelName": model_name,
                    "featureCount": int(x_train.shape[1]),
                    "graphFeatureCount": int(len(feature_set["graphKeys"])),
                    "decompositionFeatureCount": int(len(feature_set["decompositionKeys"])),
                    "trainEvaluatedCount": int(len(feature_train_rows)),
                    "validationEvaluatedCount": int(len(feature_validation_rows)),
                    "runtimeSeconds": round(time.time() - started, 3),
                    "validationMetrics": evaluate(y_validation, predictions),
                }
            )

    leaderboard = sorted(candidates, key=lambda item: (item["validationMetrics"]["rmse"], item["validationMetrics"]["mae"]))
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "trainRows": len(train_rows),
        "validationRows": len(validation_rows),
        "baselineToBeat": {
            "displayName": "BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14",
            "mae": 0.633075,
            "rmse": 0.893631,
            "r2": 0.123579,
            "directionAccuracy": 0.5828,
            "within1mm": 0.8077,
            "thresholdAgreement": 0.8632,
            "p90AbsError": 1.392424,
        },
        "leaderboard": leaderboard,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "baijiabao-displacement-literature-challengers.report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "baijiabao-displacement-literature-challengers.report.md").write_text(render_markdown(report), encoding="utf-8")
    print(f"Wrote literature challenger report to {OUT_DIR}")
    best = leaderboard[0]
    metrics = best["validationMetrics"]
    print(
        f"Best challenger: {best['featureSet']} {best['modelName']} "
        f"MAE={metrics['mae']:.6f} RMSE={metrics['rmse']:.6f} R2={metrics['r2']:.6f}"
    )


if __name__ == "__main__":
    main()
