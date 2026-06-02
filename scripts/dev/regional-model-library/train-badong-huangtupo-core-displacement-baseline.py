import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import ExtraTreesRegressor, GradientBoostingRegressor, HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import make_pipeline


ROOT = Path(".")
TRAIN = ROOT / ".tmp/regional-model-library/out/badong-huangtupo/core-samples/splits/badong-huangtupo-core.train.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/badong-huangtupo/core-samples/splits/badong-huangtupo-core.validation.jsonl"
OUT_ROOT = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-core-displacement-baseline"
LABEL_KEY = "displacementLabel"


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            line = line.strip()
            if line:
                rows.append(json.loads(line))
    return rows


def finite_number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def collect_feature_keys(rows: list[dict[str, Any]]) -> list[str]:
    keys: set[str] = set()
    for row in rows:
        for key, value in row.get("metricsNormalized", {}).items():
            if finite_number(value) is not None:
                keys.add(f"metric:{key}")
    return sorted(keys)


def category_values(rows: list[dict[str, Any]], field: str) -> list[str]:
    values: set[str] = set()
    for row in rows:
        if field == "station":
            value = row.get("identity", {}).get("stationCode")
        elif field == "family":
            value = row.get("rawRef", {}).get("originalFields", {}).get("core_family")
        else:
            value = None
        if isinstance(value, str) and value:
            values.add(value)
    return sorted(values)


def parse_event_ts(row: dict[str, Any]) -> datetime | None:
    value = row.get("eventTs")
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def build_matrix(
    rows: list[dict[str, Any]],
    metric_keys: list[str],
    station_values: list[str],
    family_values: list[str],
) -> tuple[np.ndarray, np.ndarray]:
    feature_names = (
        metric_keys
        + ["time:hour_sin", "time:hour_cos", "time:month_sin", "time:month_cos"]
        + [f"station:{value}" for value in station_values]
        + [f"family:{value}" for value in family_values]
    )
    matrix: list[list[float]] = []
    labels: list[float] = []
    for row in rows:
        label = finite_number(row.get("labels", {}).get(LABEL_KEY))
        if label is None:
            continue
        metrics = row.get("metricsNormalized", {})
        vector: list[float] = []
        for key in metric_keys:
            metric_key = key.split(":", 1)[1]
            value = finite_number(metrics.get(metric_key))
            vector.append(value if value is not None else np.nan)
        ts = parse_event_ts(row)
        if ts is None:
            vector.extend([np.nan, np.nan, np.nan, np.nan])
        else:
            hour_angle = 2 * math.pi * (ts.hour + ts.minute / 60) / 24
            month_angle = 2 * math.pi * max(0, ts.month - 1) / 12
            vector.extend([math.sin(hour_angle), math.cos(hour_angle), math.sin(month_angle), math.cos(month_angle)])
        station = row.get("identity", {}).get("stationCode")
        vector.extend([1.0 if station == value else 0.0 for value in station_values])
        family = row.get("rawRef", {}).get("originalFields", {}).get("core_family")
        vector.extend([1.0 if family == value else 0.0 for value in family_values])
        matrix.append(vector)
        labels.append(label)
    return np.asarray(matrix, dtype=float), np.asarray(labels, dtype=float), feature_names


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    abs_error = np.abs(y_true - y_pred)
    direction_true = np.sign(y_true)
    direction_pred = np.sign(y_pred)
    mse = float(mean_squared_error(y_true, y_pred))
    return {
        "mae": float(mean_absolute_error(y_true, y_pred)),
        "rmse": math.sqrt(mse),
        "r2": float(r2_score(y_true, y_pred)),
        "directionAccuracy": float(np.mean(direction_true == direction_pred)),
        "within1mm": float(np.mean(abs_error <= 1.0)),
        "p90AbsoluteError": float(np.quantile(abs_error, 0.9)),
        "predictionMean": float(np.mean(y_pred)),
        "targetMean": float(np.mean(y_true)),
    }


def to_json_safe(value: Any) -> Any:
    if value is None or isinstance(value, (str, bool)):
        return value
    if isinstance(value, (int, float)):
        return value if math.isfinite(float(value)) else None
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, np.ndarray):
        return [to_json_safe(item) for item in value.tolist()]
    if isinstance(value, (list, tuple)):
        return [to_json_safe(item) for item in value]
    if isinstance(value, dict):
        return {str(key): to_json_safe(item) for key, item in value.items()}
    return repr(value)


def station_median_predictions(train_rows: list[dict[str, Any]], validation_rows: list[dict[str, Any]]) -> np.ndarray:
    by_station: dict[str, list[float]] = {}
    all_labels: list[float] = []
    for row in train_rows:
        label = finite_number(row.get("labels", {}).get(LABEL_KEY))
        if label is None:
            continue
        station = str(row.get("identity", {}).get("stationCode") or "unknown")
        by_station.setdefault(station, []).append(label)
        all_labels.append(label)
    global_median = float(np.median(all_labels)) if all_labels else 0.0
    station_medians = {
        station: float(np.median(values))
        for station, values in by_station.items()
        if values
    }
    preds: list[float] = []
    for row in validation_rows:
        if finite_number(row.get("labels", {}).get(LABEL_KEY)) is None:
            continue
        station = str(row.get("identity", {}).get("stationCode") or "unknown")
        preds.append(station_medians.get(station, global_median))
    return np.asarray(preds, dtype=float)


def write_predictions(path: Path, rows: list[dict[str, Any]], y_true: np.ndarray, y_pred: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    labeled_rows = [row for row in rows if finite_number(row.get("labels", {}).get(LABEL_KEY)) is not None]
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["sampleId", "eventTs", "stationCode", "family", "yTrue", "yPred", "absError"])
        writer.writeheader()
        for row, true, pred in zip(labeled_rows, y_true, y_pred):
            writer.writerow(
                {
                    "sampleId": row.get("sampleId"),
                    "eventTs": row.get("eventTs"),
                    "stationCode": row.get("identity", {}).get("stationCode"),
                    "family": row.get("rawRef", {}).get("originalFields", {}).get("core_family"),
                    "yTrue": f"{true:.6f}",
                    "yPred": f"{pred:.6f}",
                    "absError": f"{abs(true - pred):.6f}",
                }
            )


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Badong-Huangtupo Core Displacement Baseline",
        "",
        "## Data",
        "",
        f"- train samples: `{report['data']['trainCount']}`",
        f"- validation samples: `{report['data']['validationCount']}`",
        f"- feature count: `{report['data']['featureCount']}`",
        "",
        "## Leaderboard",
        "",
        "| model | MAE | RMSE | R2 | Within 1mm | Direction | P90 AE |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for item in report["leaderboard"]:
        metrics = item["metrics"]
        lines.append(
            "| {model} | {mae:.6f} | {rmse:.6f} | {r2:.6f} | {within:.2%} | {direction:.2%} | {p90:.6f} |".format(
                model=item["modelKey"],
                mae=metrics["mae"],
                rmse=metrics["rmse"],
                r2=metrics["r2"],
                within=metrics["within1mm"],
                direction=metrics["directionAccuracy"],
                p90=metrics["p90AbsoluteError"],
            )
        )
    lines.extend(
        [
            "",
            "## Scope Boundary",
            "",
            "- required inputs are displacement-derived features; rainfall and cave-crack features are optional because coverage is partial.",
            "- groundwater, pore pressure, tunnel settlement, tunnel flow, and temperature/water-content families are intentionally deferred.",
        ]
    )
    return "\n".join(lines) + "\n"


def main() -> None:
    OUT_ROOT.mkdir(parents=True, exist_ok=True)
    train_rows = read_jsonl(TRAIN)
    validation_rows = read_jsonl(VALIDATION)
    metric_keys = collect_feature_keys(train_rows)
    stations = category_values(train_rows, "station")
    families = category_values(train_rows, "family")
    x_train, y_train, feature_names = build_matrix(train_rows, metric_keys, stations, families)
    x_val, y_val, _ = build_matrix(validation_rows, metric_keys, stations, families)

    leaderboard: list[dict[str, Any]] = []
    fitted_models: dict[str, Any] = {}

    baselines = {
        "zero-delta-persistence": np.zeros_like(y_val),
        "global-median": np.full_like(y_val, float(np.median(y_train))),
        "station-median": station_median_predictions(train_rows, validation_rows),
    }
    for model_key, preds in baselines.items():
        leaderboard.append(
            {
                "modelKey": model_key,
                "type": "baseline",
                "params": {},
                "metrics": compute_metrics(y_val, preds),
            }
        )

    models = {
        "hist-gradient-boosting-absolute": HistGradientBoostingRegressor(
            loss="absolute_error",
            learning_rate=0.05,
            max_iter=240,
            max_leaf_nodes=31,
            l2_regularization=0.01,
            random_state=42,
        ),
        "gradient-boosting-huber": make_pipeline(
            SimpleImputer(strategy="median"),
            GradientBoostingRegressor(
                loss="huber",
                learning_rate=0.035,
                n_estimators=260,
                max_depth=3,
                min_samples_leaf=12,
                random_state=42,
            ),
        ),
        "extra-trees-median-impute": make_pipeline(
            SimpleImputer(strategy="median"),
            ExtraTreesRegressor(
                n_estimators=160,
                min_samples_leaf=6,
                max_features=0.85,
                random_state=42,
                n_jobs=-1,
            ),
        ),
    }
    for model_key, model in models.items():
        model.fit(x_train, y_train)
        preds = model.predict(x_val)
        leaderboard.append(
            {
                "modelKey": model_key,
                "type": "sklearn-regressor",
                "params": to_json_safe(model.get_params(deep=True)),
                "metrics": compute_metrics(y_val, preds),
            }
        )
        fitted_models[model_key] = model

    leaderboard.sort(key=lambda item: (item["metrics"]["rmse"], item["metrics"]["mae"]))
    best = leaderboard[0]
    best_key = best["modelKey"]
    if best_key in fitted_models:
        joblib.dump(
            {
                "modelKey": best_key,
                "model": fitted_models[best_key],
                "featureNames": feature_names,
                "metricKeys": metric_keys,
                "stations": stations,
                "families": families,
            },
            OUT_ROOT / "badong-huangtupo-core-displacement-baseline.best.joblib",
        )
    best_preds = fitted_models[best_key].predict(x_val) if best_key in fitted_models else baselines[best_key]
    write_predictions(OUT_ROOT / "badong-huangtupo-core-displacement-baseline.validation-predictions.csv", validation_rows, y_val, best_preds)

    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "modelLine": "Badong-Huangtupo core displacement baseline",
        "sourceSamples": {
            "train": str(TRAIN),
            "validation": str(VALIDATION),
        },
        "data": {
            "trainCount": int(len(y_train)),
            "validationCount": int(len(y_val)),
            "featureCount": len(feature_names),
            "featureNames": feature_names,
            "stations": stations,
            "families": families,
        },
        "scopeBoundary": {
            "requiredFamilies": ["beidou-displacement", "fault-zone-beidou-displacement", "cave-slip-belt-displacement"],
            "optionalFamilies": ["weather-rainfall", "cave-crack"],
            "deferredFamilies": [
                "groundwater-depth",
                "groundwater-temperature",
                "pore-pressure",
                "tunnel-settlement",
                "tunnel-flow",
                "slip-belt-temperature-water-content",
                "cave-water-temperature",
            ],
        },
        "leaderboard": leaderboard,
        "bestModelKey": best_key,
    }
    (OUT_ROOT / "badong-huangtupo-core-displacement-baseline.report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    (OUT_ROOT / "badong-huangtupo-core-displacement-baseline.report.md").write_text(
        render_markdown(report),
        encoding="utf-8",
    )
    print(f"Best model: {best_key}")
    print(json.dumps(best["metrics"], ensure_ascii=False, indent=2))
    print(f"Report: {OUT_ROOT / 'badong-huangtupo-core-displacement-baseline.report.json'}")


if __name__ == "__main__":
    main()
