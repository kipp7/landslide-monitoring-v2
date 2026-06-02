import json
import math
import pathlib
import random
import time
import warnings
from collections import defaultdict

import numpy as np
import torch
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor
from sklearn.linear_model import HuberRegressor, Ridge
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.preprocessing import StandardScaler
from torch import nn


ROOT = pathlib.Path(".")
TRAIN = ROOT / ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.train.future-labels.window-features.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/threegorges-baijiabao/splits/labeled/baijiabao.validation.future-labels.window-features.jsonl"
OUT_DIR = ROOT / ".tmp/regional-model-library/out/artifacts/baijiabao-displacement-sequence-challengers"
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
BASE_METRIC_KEYS = [
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
LOOKBACKS = [6, 12, 20]
TORCH_SEED = 20260426


def set_seed():
    random.seed(TORCH_SEED)
    np.random.seed(TORCH_SEED)
    torch.manual_seed(TORCH_SEED)
    torch.set_num_threads(max(1, min(4, torch.get_num_threads())))


def load_jsonl(path):
    rows = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            sample = json.loads(line)
            label = sample.get("labels", {}).get("displacementLabel")
            metrics = sample.get("metricsNormalized", {})
            has_core_process = all(
                isinstance(metrics.get(key), (int, float)) and math.isfinite(metrics.get(key))
                for key in [
                    "displacementSurfaceMm_delta_24h",
                    "displacementSurfaceMm_delta_72h",
                    "rainfallCurrentMm_sum_24h",
                    "rainfallCurrentMm_sum_72h",
                    "reservoirLevelM_delta_24h",
                    "reservoirLevelM_delta_72h",
                ]
            )
            if isinstance(label, (int, float)) and math.isfinite(label) and has_core_process:
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


def finite_or_nan(value):
    return float(value) if isinstance(value, (int, float)) and math.isfinite(value) else np.nan


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


def rolling_context_features(history, current_sample):
    metrics = current_sample.get("metricsNormalized", {})
    current_displacement = finite_or_nan(metrics.get("displacementSurfaceMm"))
    current_rainfall = finite_or_nan(metrics.get("rainfallCurrentMm"))
    current_reservoir = finite_or_nan(metrics.get("reservoirLevelM"))
    displacement_values = [item["displacement"] for item in history if math.isfinite(item["displacement"])]
    rainfall_values = [item["rainfall"] for item in history if math.isfinite(item["rainfall"])]
    reservoir_values = [item["reservoir"] for item in history if math.isfinite(item["reservoir"])]

    if math.isfinite(current_displacement):
        displacement_values = [*displacement_values, current_displacement]
    if math.isfinite(current_rainfall):
        rainfall_values = [*rainfall_values, current_rainfall]
    if math.isfinite(current_reservoir):
        reservoir_values = [*reservoir_values, current_reservoir]

    features = [float(len(displacement_values))]
    for window in [3, 5, 10, 20]:
        recent_displacement = displacement_values[-window:]
        recent_rainfall = rainfall_values[-window:]
        recent_reservoir = reservoir_values[-window:]
        if recent_displacement:
            current = recent_displacement[-1]
            mean_value = float(np.mean(recent_displacement))
            deltas = np.diff(recent_displacement) if len(recent_displacement) >= 2 else np.array([0.0])
            features.extend(
                [
                    mean_value,
                    current - mean_value,
                    linear_slope(recent_displacement),
                    float(np.std(deltas)),
                    float(max(recent_displacement) - min(recent_displacement)),
                ]
            )
        else:
            features.extend([0.0, 0.0, 0.0, 0.0, 0.0])
        features.append(float(np.mean(recent_rainfall)) if recent_rainfall else 0.0)
        features.append(linear_slope(recent_reservoir))
    return features


def sample_row_features(sample, known_label, is_current, rolling_features):
    metrics = sample.get("metricsNormalized", {})
    values = [finite_or_nan(metrics.get(key)) for key in BASE_METRIC_KEYS]
    current_point = point_id(sample)
    month = event_month(sample)
    values.extend(
        [
            float(known_label) if known_label is not None and math.isfinite(float(known_label)) else 0.0,
            1.0 if is_current else 0.0,
            1.0 if current_point == "ZD1" else 0.0,
            1.0 if current_point == "ZD2" else 0.0,
            1.0 if current_point == "ZD3" else 0.0,
            math.sin(2 * math.pi * month / 12),
            math.cos(2 * math.pi * month / 12),
        ]
    )
    values.extend(rolling_features)
    return values


def history_item(sample):
    metrics = sample.get("metricsNormalized", {})
    return {
        "sample": sample,
        "label": float(sample["labels"]["displacementLabel"]),
        "displacement": finite_or_nan(metrics.get("displacementSurfaceMm")),
        "rainfall": finite_or_nan(metrics.get("rainfallCurrentMm")),
        "reservoir": finite_or_nan(metrics.get("reservoirLevelM")),
    }


def build_sequences(train_rows, validation_rows, lookback):
    train_rows = sorted(train_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", "")))
    validation_rows = sorted(validation_rows, key=lambda item: (point_id(item), event_ts(item), item.get("sampleId", "")))
    train_history = defaultdict(list)
    x_train, y_train, train_ids = [], [], []

    for sample in train_rows:
        history = train_history[point_id(sample)]
        x_train.append(build_one_sequence(sample, history, lookback))
        y_train.append(float(sample["labels"]["displacementLabel"]))
        train_ids.append(sample.get("sampleId", ""))
        history.append(history_item(sample))

    validation_history = defaultdict(list, {key: list(value) for key, value in train_history.items()})
    x_validation, y_validation, validation_ids = [], [], []
    for sample in validation_rows:
        history = validation_history[point_id(sample)]
        x_validation.append(build_one_sequence(sample, history, lookback))
        y_validation.append(float(sample["labels"]["displacementLabel"]))
        validation_ids.append(sample.get("sampleId", ""))
        history.append(history_item(sample))

    return {
        "xTrain": np.array(x_train, dtype=np.float32),
        "yTrain": np.array(y_train, dtype=np.float32),
        "xValidation": np.array(x_validation, dtype=np.float32),
        "yValidation": np.array(y_validation, dtype=np.float32),
        "trainIds": train_ids,
        "validationIds": validation_ids,
    }


def build_one_sequence(current_sample, history, lookback):
    rows = []
    selected_history = history[-lookback:]
    pad_count = lookback - len(selected_history)
    feature_width = len(BASE_METRIC_KEYS) + 7 + 1 + 4 * 7
    for _ in range(pad_count):
        rows.append([0.0] * feature_width)
    for item in selected_history:
        rolling_features = rolling_context_features(history[: history.index(item) + 1], item["sample"])
        rows.append(sample_row_features(item["sample"], item["label"], False, rolling_features))
    rows.append(sample_row_features(current_sample, None, True, rolling_context_features(history, current_sample)))
    return rows


def flatten_sequences(x):
    return x.reshape((x.shape[0], x.shape[1] * x.shape[2]))


def evaluate(y_true, y_pred):
    y_true = np.array(y_true, dtype=float)
    y_pred = np.array(y_pred, dtype=float)
    abs_error = np.abs(y_true - y_pred)
    rmse = math.sqrt(mean_squared_error(y_true, y_pred))
    true_direction = np.sign(y_true)
    pred_direction = np.sign(y_pred)
    direction_mask = true_direction != 0
    direction_accuracy = float(np.mean(true_direction[direction_mask] == pred_direction[direction_mask])) if np.any(direction_mask) else 0.0
    true_threshold = np.abs(y_true) >= 1.3
    pred_threshold = np.abs(y_pred) >= 1.3
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": float(rmse),
        "r2": float(r2_score(y_true, y_pred)),
        "directionAccuracy": direction_accuracy,
        "within1mm": float(np.mean(abs_error <= 1.0)),
        "thresholdAgreement": float(np.mean(true_threshold == pred_threshold)),
        "p50AbsError": float(np.quantile(abs_error, 0.5)),
        "p90AbsError": float(np.quantile(abs_error, 0.9)),
    }


def train_tabular_sequence_models(dataset, lookback):
    x_train = flatten_sequences(dataset["xTrain"])
    x_validation = flatten_sequences(dataset["xValidation"])
    y_train = dataset["yTrain"]
    y_validation = dataset["yValidation"]
    x_train, x_validation = impute_flattened_arrays(x_train, x_validation)
    scaler = StandardScaler()
    x_train_scaled = scaler.fit_transform(x_train)
    x_validation_scaled = scaler.transform(x_validation)
    models = [
        ("sequence-flatten-ridge", Ridge(alpha=3.0), x_train_scaled, x_validation_scaled),
        ("sequence-flatten-huber", HuberRegressor(epsilon=1.2, alpha=0.001, max_iter=1200), x_train_scaled, x_validation_scaled),
        (
            "sequence-flatten-gradient-boosting-huber",
            GradientBoostingRegressor(loss="huber", n_estimators=180, learning_rate=0.035, max_depth=2, min_samples_leaf=12, random_state=52),
            x_train,
            x_validation,
        ),
        (
            "sequence-flatten-extra-trees",
            ExtraTreesRegressor(n_estimators=220, max_depth=8, min_samples_leaf=8, random_state=53, n_jobs=-1),
            x_train,
            x_validation,
        ),
    ]
    candidates = []
    for model_name, model, model_x_train, model_x_validation in models:
        started = time.time()
        model.fit(model_x_train, y_train)
        predictions = model.predict(model_x_validation)
        candidates.append(
            {
                "featureSet": f"leakage-safe-point-sequence-lookback-{lookback}",
                "modelName": model_name,
                "lookback": lookback,
                "trainEvaluatedCount": int(len(y_train)),
                "validationEvaluatedCount": int(len(y_validation)),
                "runtimeSeconds": round(time.time() - started, 3),
                "validationMetrics": evaluate(y_validation, predictions),
            }
        )
    return candidates


def impute_flattened_arrays(flat_train, flat_validation):
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", category=RuntimeWarning)
        medians = np.nanmedian(flat_train, axis=0)
    medians = np.where(np.isfinite(medians), medians, 0.0)
    train_imputed = np.where(np.isfinite(flat_train), flat_train, medians)
    validation_imputed = np.where(np.isfinite(flat_validation), flat_validation, medians)
    return train_imputed, validation_imputed


class SequenceRegressor(nn.Module):
    def __init__(self, feature_count, architecture, hidden_size):
        super().__init__()
        self.architecture = architecture
        if architecture == "gru":
            self.sequence = nn.GRU(input_size=feature_count, hidden_size=hidden_size, num_layers=1, batch_first=True)
            self.head = nn.Sequential(nn.LayerNorm(hidden_size), nn.Linear(hidden_size, 1))
        elif architecture == "tcn":
            self.net = nn.Sequential(
                nn.Conv1d(feature_count, hidden_size, kernel_size=3, padding=1),
                nn.ReLU(),
                nn.Dropout(0.08),
                nn.Conv1d(hidden_size, hidden_size, kernel_size=3, padding=1),
                nn.ReLU(),
            )
            self.head = nn.Sequential(nn.LayerNorm(hidden_size), nn.Linear(hidden_size, 1))
        else:
            raise ValueError(f"Unknown architecture: {architecture}")

    def forward(self, x):
        if self.architecture == "gru":
            _, hidden = self.sequence(x)
            return self.head(hidden[-1]).squeeze(-1)
        encoded = self.net(x.transpose(1, 2)).transpose(1, 2)
        return self.head(encoded[:, -1, :]).squeeze(-1)


def robust_standardize_sequences(x_train, x_validation):
    flat_train, flat_validation = impute_flattened_arrays(flatten_sequences(x_train), flatten_sequences(x_validation))
    scaler = StandardScaler()
    flat_train = scaler.fit_transform(flat_train)
    flat_validation = scaler.transform(flat_validation)
    return flat_train.reshape(x_train.shape).astype(np.float32), flat_validation.reshape(x_validation.shape).astype(np.float32)


def train_torch_sequence_model(dataset, lookback, architecture, hidden_size):
    started = time.time()
    x_train, x_validation = robust_standardize_sequences(dataset["xTrain"], dataset["xValidation"])
    y_train = dataset["yTrain"].astype(np.float32)
    y_validation = dataset["yValidation"].astype(np.float32)
    cutoff = max(1, int(len(x_train) * 0.82))
    train_x = torch.tensor(x_train[:cutoff])
    train_y = torch.tensor(y_train[:cutoff])
    holdout_x = torch.tensor(x_train[cutoff:])
    holdout_y = torch.tensor(y_train[cutoff:])
    validation_x = torch.tensor(x_validation)
    model = SequenceRegressor(x_train.shape[2], architecture, hidden_size)
    optimizer = torch.optim.AdamW(model.parameters(), lr=0.002, weight_decay=0.01)
    loss_fn = nn.SmoothL1Loss(beta=0.6)
    best_state = None
    best_holdout = float("inf")
    stale_epochs = 0

    for epoch in range(220):
        model.train()
        permutation = torch.randperm(len(train_x))
        for start in range(0, len(train_x), 192):
            index = permutation[start : start + 192]
            optimizer.zero_grad()
            loss = loss_fn(model(train_x[index]), train_y[index])
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()

        model.eval()
        with torch.no_grad():
            holdout_loss = float(loss_fn(model(holdout_x), holdout_y).item()) if len(holdout_x) else float(loss.item())
        if holdout_loss < best_holdout - 1e-5:
            best_holdout = holdout_loss
            best_state = {key: value.detach().clone() for key, value in model.state_dict().items()}
            stale_epochs = 0
        else:
            stale_epochs += 1
        if stale_epochs >= 24:
            break

    if best_state:
        model.load_state_dict(best_state)
    model.eval()
    with torch.no_grad():
        predictions = model(validation_x).numpy()
    return {
        "featureSet": f"leakage-safe-point-sequence-lookback-{lookback}",
        "modelName": f"{architecture}-smoothl1-hidden-{hidden_size}",
        "lookback": lookback,
        "trainEvaluatedCount": int(len(y_train)),
        "validationEvaluatedCount": int(len(y_validation)),
        "runtimeSeconds": round(time.time() - started, 3),
        "trainingSummary": {"holdoutSmoothL1": best_holdout, "epochs": epoch + 1},
        "validationMetrics": evaluate(y_validation, predictions),
    }


def render_markdown(report):
    lines = [
        "# Baijiabao Sequence Displacement Challengers",
        "",
        f"- generatedAt: `{report['generatedAt']}`",
        f"- trainRows: `{report['trainRows']}`",
        f"- validationRows: `{report['validationRows']}`",
        "- target: `labels.displacementLabel` future 24h displacement delta in mm",
        "- sequence rule: same-point historical rows only; validation sequence state starts from train history and then rolls forward with earlier validation observations",
        "",
        "## Baseline To Beat",
        "",
        "| Model | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
        "| `BJB-DP-ENS-OOF-REFINED-SOFT-REGIME-v14` | `0.633` | `0.894` | `0.1236` | `58.28%` | `80.77%` | `86.32%` | `1.392` |",
        "",
        "## Sequence Leaderboard",
        "",
        "| Rank | Feature set | Model | Lookback | MAE | RMSE | R2 | Direction | Within 1mm | Threshold | P90 AE |",
        "| ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for index, item in enumerate(report["leaderboard"][:16], start=1):
        metrics = item["validationMetrics"]
        lines.append(
            f"| {index} | `{item['featureSet']}` | `{item['modelName']}` | `{item['lookback']}` | `{metrics['mae']:.3f}` | `{metrics['rmse']:.3f}` | "
            f"`{metrics['r2']:.4f}` | `{metrics['directionAccuracy'] * 100:.2f}%` | `{metrics['within1mm'] * 100:.2f}%` | "
            f"`{metrics['thresholdAgreement'] * 100:.2f}%` | `{metrics['p90AbsError']:.3f}` |"
        )
    lines.extend(
        [
            "",
            "## Conclusion",
            "",
            "- These challengers test leakage-safe same-point sequence histories, including flattened sequence baselines, GRU, and lightweight TCN.",
            "- They do not change runtime schema; they remain offline research challengers unless later promoted into the regional model library.",
            "- If none beats v14, keep v14 as the balanced displacement model and cite these as sequence-model ablations.",
            "",
        ]
    )
    return "\n".join(lines)


def main():
    set_seed()
    train_rows = load_jsonl(TRAIN)
    validation_rows = load_jsonl(VALIDATION)
    candidates = []
    for lookback in LOOKBACKS:
        dataset = build_sequences(train_rows, validation_rows, lookback)
        candidates.extend(train_tabular_sequence_models(dataset, lookback))
        for architecture in ["gru", "tcn"]:
            for hidden_size in [16, 32]:
                candidates.append(train_torch_sequence_model(dataset, lookback, architecture, hidden_size))

    leaderboard = sorted(candidates, key=lambda item: (item["validationMetrics"]["rmse"], item["validationMetrics"]["mae"]))
    report = {
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "trainRows": len(train_rows),
        "validationRows": len(validation_rows),
        "baselineToBeat": BASELINE_TO_BEAT,
        "featureKeys": BASE_METRIC_KEYS,
        "lookbacks": LOOKBACKS,
        "leaderboard": leaderboard,
    }
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "baijiabao-displacement-sequence-challengers.report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "baijiabao-displacement-sequence-challengers.report.md").write_text(render_markdown(report), encoding="utf-8")
    best = leaderboard[0]
    metrics = best["validationMetrics"]
    print(f"Wrote sequence challenger report to {OUT_DIR}")
    print(
        f"Best sequence challenger: {best['featureSet']} {best['modelName']} "
        f"MAE={metrics['mae']:.6f} RMSE={metrics['rmse']:.6f} R2={metrics['r2']:.6f} "
        f"Direction={metrics['directionAccuracy'] * 100:.2f}% Within={metrics['within1mm'] * 100:.2f}%"
    )


if __name__ == "__main__":
    main()
