import csv
import json
import math
import bisect
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import numpy as np
import sklearn
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


ROOT = Path(".")
RAW_ROOT = ROOT / ".tmp/regional-model-library/raw/Badong-Huangtupo/normalized/phase1-families"
TRAIN = ROOT / ".tmp/regional-model-library/out/badong-huangtupo/core-samples/splits/badong-huangtupo-core.train.jsonl"
VALIDATION = ROOT / ".tmp/regional-model-library/out/badong-huangtupo/core-samples/splits/badong-huangtupo-core.validation.jsonl"
OUT_ROOT = ROOT / ".tmp/regional-model-library/out/artifacts/badong-huangtupo-context-enriched-v5"
LABEL_KEY = "displacementLabel"
MODEL_KEY = "badong-huangtupo.displacement.hgb-context-enriched-support-guarded-v5"
MODEL_VERSION = "0.5.0"
REGION_CODE = "CN-HB-BADONG-HUANGTUPO"
BASELINE_V4_METRICS = {
    "mae": 0.5097554731419255,
    "rmse": 1.3729208638305228,
    "r2": 0.03248161329946708,
    "directionAccuracy": 0.45366232756945796,
    "within1mm": 0.8610841266757334,
    "p90AbsoluteError": 1.6800590949507495,
}
ZERO_METRICS = {
    "mae": 0.5226695162230425,
    "rmse": 1.3957864094468682,
    "r2": -0.00001415637218604715,
    "directionAccuracy": 0.2665630464348164,
    "within1mm": 0.8587526714591024,
    "p90AbsoluteError": 1.8,
}
WINDOW_HOURS = (6, 24, 72)
CONTEXT_LOOKBACK_HOURS = (24, 72, 168)
MIN_FEATURE_COUNT = 100

DIRECT_ALIAS = {
    "displacementObservedMm": "displacementSurfaceMm",
    "caveCrackMm": "crackDisplacementMm",
}

BASE_WINDOW_KEYS = (
    "displacementSurfaceMm",
    "rainfallCurrentMm",
    "crackDisplacementMm",
    "beidouDispX",
    "beidouDispY",
    "beidouDispZ",
    "beidouDisplacementChangeMm",
    "slipBeltDisplacementMm",
    "groundwaterDepthM",
    "groundwaterTemperatureC",
    "porePressureKpa",
    "tunnelFlowRate",
    "tunnelSettlementMm",
    "slipBeltWaterContent",
    "caveWaterTemperatureC",
)

CONTEXT_FAMILIES = {
    "groundwater-depth": {
        "file": "groundwater-depth.official.rows.csv",
        "fields": {"groundwater_depth_m": "groundwaterDepthM"},
    },
    "groundwater-temperature": {
        "file": "groundwater-temperature.official.rows.csv",
        "fields": {"groundwater_temperature_c": "groundwaterTemperatureC"},
    },
    "pore-pressure": {
        "file": "pore-pressure.official.rows.csv",
        "fields": {"pore_pressure_kpa": "porePressureKpa"},
    },
    "tunnel-flow": {
        "file": "tunnel-flow.official.rows.csv",
        "fields": {"flow_value": "tunnelFlowRate"},
    },
    "tunnel-settlement": {
        "file": "tunnel-settlement.official.rows.csv",
        "fields": {"settlement_value": "tunnelSettlementMm"},
    },
    "slip-belt-temperature-water-content": {
        "file": "slip-belt-temperature-water-content.official.rows.csv",
        "fields": {"water_content_value": "slipBeltWaterContent", "temperature_c": "airTemperatureC"},
    },
    "cave-water-temperature": {
        "file": "cave-water-temperature.official.rows.csv",
        "fields": {"water_temperature_value": "caveWaterTemperatureC"},
    },
}

PROFILES = [
    {
        "key": "hgb-abs-m120-lr0025-l2p8-leaf160-v5",
        "loss": "absolute_error",
        "max_iter": 120,
        "learning_rate": 0.025,
        "l2_regularization": 0.8,
        "min_samples_leaf": 160,
    },
    {
        "key": "hgb-abs-m180-lr0018-l2p12-leaf220-v5",
        "loss": "absolute_error",
        "max_iter": 180,
        "learning_rate": 0.018,
        "l2_regularization": 1.2,
        "min_samples_leaf": 220,
    },
    {
        "key": "hgb-sq-m160-lr002-l2p4-leaf180-v5",
        "loss": "squared_error",
        "max_iter": 160,
        "learning_rate": 0.02,
        "l2_regularization": 0.4,
        "min_samples_leaf": 180,
    },
]


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(json.dumps(row, ensure_ascii=False, separators=(",", ":")) for row in rows) + "\n", encoding="utf-8")


def parse_local_time(value: str) -> datetime | None:
    value = (value or "").strip()
    if not value:
        return None
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%Y-%m-%d %H:%M"):
        try:
            return datetime.strptime(value, fmt).replace(tzinfo=timezone(timedelta(hours=8)))
        except ValueError:
            continue
    return None


def parse_event_ts(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def finite_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, str):
        value = value.strip()
        if value.lower() in {"", "nan", "none", "null"}:
            return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def round6(value: float) -> float:
    return float(f"{value:.6f}")


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def load_context_series() -> dict[str, dict[str, list[Any]]]:
    series: dict[str, list[tuple[datetime, float]]] = defaultdict(list)
    for spec in CONTEXT_FAMILIES.values():
        for row in read_csv_rows(RAW_ROOT / spec["file"]):
            ts = parse_local_time(row.get("obs_time", ""))
            if ts is None:
                continue
            ts = ts.astimezone(timezone.utc)
            for raw_key, canonical_key in spec["fields"].items():
                value = finite_number(row.get(raw_key))
                if value is not None:
                    series[canonical_key].append((ts, value))
    packed: dict[str, dict[str, list[Any]]] = {}
    for key in list(series.keys()):
        rows = sorted(series[key], key=lambda item: item[0])
        packed[key] = {
            "times": [item[0] for item in rows],
            "values": [item[1] for item in rows],
        }
    return packed


def enrich_context_features(rows: list[dict[str, Any]], context_series: dict[str, dict[str, list[Any]]]) -> dict[str, int]:
    coverage: dict[str, int] = defaultdict(int)
    for row in rows:
        event_ts = parse_event_ts(row.get("eventTs"))
        metrics = row.get("metricsNormalized")
        if event_ts is None or not isinstance(metrics, dict):
            continue
        for feature_key, points in context_series.items():
            times = points["times"]
            values_all = points["values"]
            for hours in CONTEXT_LOOKBACK_HOURS:
                start = event_ts - timedelta(hours=hours)
                left = bisect.bisect_left(times, start)
                right = bisect.bisect_right(times, event_ts)
                values = values_all[left:right]
                if not values:
                    continue
                metrics[f"{feature_key}_last_{hours}h"] = round6(values[-1])
                metrics[f"{feature_key}_mean_{hours}h"] = round6(float(np.mean(values)))
                metrics[f"{feature_key}_min_{hours}h"] = round6(float(np.min(values)))
                metrics[f"{feature_key}_max_{hours}h"] = round6(float(np.max(values)))
                if len(values) >= 2:
                    metrics[f"{feature_key}_delta_{hours}h"] = round6(values[-1] - values[0])
        for key, value in metrics.items():
            if finite_number(value) is not None:
                coverage[key] += 1
    return dict(coverage)


def resolve_group_key(row: dict[str, Any]) -> str:
    original = row.get("rawRef", {}).get("originalFields", {})
    if isinstance(original, dict):
        value = original.get("core_group_key") or original.get("point_id") or original.get("sensor_code")
        if isinstance(value, str) and value:
            return value
    identity = row.get("identity", {})
    return str(identity.get("stationCode") or identity.get("scopeKey") or "unknown")


def parse_event_ts_hours(row: dict[str, Any]) -> float | None:
    event_ts = parse_event_ts(row.get("eventTs"))
    return event_ts.timestamp() / 3600 if event_ts is not None else None


def align_runtime_metrics(rows: list[dict[str, Any]]) -> None:
    for row in rows:
        metrics = row.get("metricsNormalized")
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
                    metrics[f"{base_key}_last_{hours}h"] = round6(values[-1])
                    metrics[f"{base_key}_mean_{hours}h"] = round6(float(np.mean(values)))
                    metrics[f"{base_key}_min_{hours}h"] = round6(float(np.min(values)))
                    metrics[f"{base_key}_max_{hours}h"] = round6(float(np.max(values)))
                    if len(values) >= 2:
                        metrics[f"{base_key}_delta_{hours}h"] = round6(values[-1] - values[0])
                    if base_key == "rainfallCurrentMm":
                        metrics[f"{base_key}_sum_{hours}h"] = round6(float(np.sum(values)))


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


def passes_guard(metrics: dict[str, float], baseline: dict[str, float]) -> bool:
    return (
        metrics["mae"] < baseline["mae"]
        and metrics["rmse"] < baseline["rmse"]
        and metrics["r2"] > baseline["r2"]
        and metrics["directionAccuracy"] >= baseline["directionAccuracy"]
        and metrics["within1mm"] >= baseline["within1mm"]
        and metrics["p90AbsoluteError"] <= baseline["p90AbsoluteError"]
    )


def make_model(profile: dict[str, Any]) -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        loss=profile["loss"],
        max_iter=profile["max_iter"],
        learning_rate=profile["learning_rate"],
        l2_regularization=profile["l2_regularization"],
        min_samples_leaf=profile["min_samples_leaf"],
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
    context_series = load_context_series()
    align_runtime_metrics(all_rows)
    context_coverage = enrich_context_features(all_rows, context_series)
    add_window_features(all_rows)

    feature_keys = collect_feature_keys(train_rows)
    x_train, y_train, _ = build_matrix(train_rows, feature_keys)
    x_validation, y_validation, kept_validation_rows = build_matrix(validation_rows, feature_keys)
    candidates = []
    best_model = None
    best_predictions = None

    for profile in PROFILES:
        model = make_model(profile)
        model.fit(x_train, y_train)
        predictions = model.predict(x_validation)
        metrics = compute_metrics(y_validation, predictions)
        candidate = {
            "profileKey": profile["key"],
            "metrics": metrics,
            "deltaVsV4": metric_delta(metrics, BASELINE_V4_METRICS),
            "deltaVsZero": metric_delta(metrics, ZERO_METRICS),
            "passesV4Guard": passes_guard(metrics, BASELINE_V4_METRICS),
            "passesZeroGuard": passes_guard(metrics, ZERO_METRICS),
        }
        candidates.append(candidate)
        if best_model is None or (
            candidate["passesV4Guard"],
            -metrics["mae"],
            -metrics["rmse"],
            metrics["r2"],
        ) > (
            candidates[-2]["passesV4Guard"] if len(candidates) > 1 else False,
            -candidates[-2]["metrics"]["mae"] if len(candidates) > 1 else -math.inf,
            -candidates[-2]["metrics"]["rmse"] if len(candidates) > 1 else -math.inf,
            candidates[-2]["metrics"]["r2"] if len(candidates) > 1 else -math.inf,
        ):
            best_model = model
            best_predictions = predictions

    best = sorted(
        candidates,
        key=lambda item: (
            item["passesV4Guard"],
            -item["metrics"]["mae"],
            -item["metrics"]["rmse"],
            item["metrics"]["r2"],
        ),
        reverse=True,
    )[0]
    selected_profile = next(profile for profile in PROFILES if profile["key"] == best["profileKey"])
    best_model = make_model(selected_profile)
    best_model.fit(x_train, y_train)
    best_predictions = best_model.predict(x_validation)
    promote_allowed = bool(best["passesV4Guard"] and best["passesZeroGuard"])
    created_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")

    augmented_train_path = OUT_ROOT / "badong-huangtupo-core.train.context-enriched-v5.jsonl"
    augmented_validation_path = OUT_ROOT / "badong-huangtupo-core.validation.context-enriched-v5.jsonl"
    artifact_path = OUT_ROOT / "badong-huangtupo-displacement-v5.context-enriched.prediction-regression-v1.json"
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
        "trainingDatasetKeys": ["Badong-Huangtupo-official-open-core-context-enriched"],
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
        "model": export_hgb_model(best_model, feature_keys),
        "validationMetrics": best["metrics"],
        "metadata": {
            "operationalRole": "forecast",
            "displayName": "BD-HTP-DP-HGB-CONTEXT-ENRICHED-v5",
            "targetDescription": "Future displacement delta in millimeters for the Badong-Huangtupo context-enriched regional support pack.",
            "sourceDataset": "Badong-Huangtupo official open core plus hydrologic/tunnel/context families",
            "modelFamily": "hist-gradient-boosting-context-enriched-support-guarded",
            "featureFamily": "runtime-aligned displacement/rainfall/crack plus optional groundwater/pore-pressure/tunnel context",
            "selectionProfile": best["profileKey"],
            "baselineModelKey": "badong-huangtupo.displacement.hgb-windowed-multisensor-support-guarded-v4",
            "baselineMetrics": BASELINE_V4_METRICS,
            "deltaVsV4": best["deltaVsV4"],
            "deltaVsZero": best["deltaVsZero"],
            "supportGuard": {
                "mode": "fit-on-all-pre-final-train-final-holdout-guard-vs-v4-and-zero",
                "trainCount": int(len(y_train)),
                "finalCount": int(len(y_validation)),
                "promoteAllowed": promote_allowed,
            },
            "registryRole": "badong-context-enriched-challenger",
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
                "optionalFeaturePolicy": "Hydrologic/tunnel/context features are optional and may be missing at runtime; HGB missing-value branches handle absence.",
            },
        },
    }
    report = {
        "generatedAt": created_at,
        "promoteAllowed": promote_allowed,
        "modelKey": MODEL_KEY,
        "modelVersion": MODEL_VERSION,
        "selectedProfile": best["profileKey"],
        "data": {
            "trainCount": int(len(y_train)),
            "validationCount": int(len(y_validation)),
            "featureCount": len(feature_keys),
            "featureKeys": feature_keys,
            "contextCoverage": {
                key: {"count": count, "ratio": count / max(1, len(all_rows))}
                for key, count in sorted(context_coverage.items())
                if key not in {"displacementObservedMm"}
            },
        },
        "baselineV4Metrics": BASELINE_V4_METRICS,
        "zeroMetrics": ZERO_METRICS,
        "candidates": candidates,
        "best": best,
        "artifactPath": str(artifact_path),
        "runtimeWindowFeatureSamples": {
            "train": str(augmented_train_path),
            "validation": str(augmented_validation_path),
        },
        "sklearnVersion": sklearn.__version__,
        "decision": "promote" if promote_allowed else "do-not-promote-v4-remains-badong-production-main",
    }
    write_json(artifact_path, artifact)
    write_json(OUT_ROOT / "badong-huangtupo-context-enriched-v5.report.json", report)
    write_predictions(
        OUT_ROOT / "badong-huangtupo-context-enriched-v5.validation-predictions.csv",
        kept_validation_rows,
        y_validation,
        best_predictions,
    )

    print(f"Selected profile: {best['profileKey']}")
    print(f"Promote allowed: {promote_allowed}")
    print(json.dumps(best, ensure_ascii=False, indent=2))
    print(f"Feature count: {len(feature_keys)}")
    print(f"Artifact: {artifact_path}")
    print(f"Report: {OUT_ROOT / 'badong-huangtupo-context-enriched-v5.report.json'}")


if __name__ == "__main__":
    main()
