import argparse
import bisect
import csv
import json
import math
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


RAW_ROOT = Path(".tmp/regional-model-library/raw/Badong-Huangtupo/normalized/phase1-families")
OUT_ROOT = Path(".tmp/regional-model-library/out/badong-huangtupo/core-samples")
DATASET_KEY = "Badong-Huangtupo-official-open-core"
REGION_CODE = "CN-HB-BADONG-HUANGTUPO"
SLOPE_CODE = "Huangtupo"
WINDOW_SPEC = "6h,24h,72h"
HORIZON_SPEC = "24h"
TARGET_HOURS = 24
TARGET_TOLERANCE_HOURS = 6


CORE_DISPLACEMENT_FAMILIES = {
    "beidou-displacement": {
        "path": RAW_ROOT / "beidou-displacement.official.rows.csv",
        "group_field": "point_id",
        "value_field": "displacement_change_mm",
        "metrics": {
            "displacement_x_mm": "beidouDispX",
            "displacement_y_mm": "beidouDispY",
            "displacement_z_mm": "beidouDispZ",
            "displacement_change_mm": "beidouDisplacementChangeMm",
        },
    },
    "fault-zone-beidou-displacement": {
        "path": RAW_ROOT / "fault-zone-beidou-displacement.official.rows.csv",
        "group_field": "point_id",
        "value_field": "displacement_change_mm",
        "metrics": {
            "displacement_x_mm": "beidouDispX",
            "displacement_y_mm": "beidouDispY",
            "displacement_z_mm": "beidouDispZ",
            "displacement_change_mm": "beidouDisplacementChangeMm",
        },
    },
    "cave-slip-belt-displacement": {
        "path": RAW_ROOT / "cave-slip-belt-displacement.official.rows.csv",
        "group_field": "sensor_code",
        "value_field": "slip_belt_displacement_value",
        "metrics": {
            "slip_belt_displacement_value": "slipBeltDisplacementMm",
        },
    },
}


OPTIONAL_FAMILIES = {
    "weather-rainfall": {
        "path": RAW_ROOT / "weather-rainfall.official.rows.csv",
        "time_field": "obs_time",
        "value_fields": ["rainfall_current_mm", "rainfall_cumulative_mm"],
    },
    "cave-crack": {
        "path": RAW_ROOT / "cave-crack.official.rows.csv",
        "time_field": "obs_time",
        "value_fields": ["cave_crack_mm"],
    },
}


DEFERRED_FAMILIES = {
    "pore-pressure": "deferred: groundwater/pore-pressure is not a phase-1 required product sensor",
    "groundwater-depth": "deferred: groundwater is not a phase-1 required product sensor",
    "groundwater-temperature": "deferred: groundwater temperature is not a phase-1 required product sensor",
    "tunnel-settlement": "deferred: tunnel settlement is not a phase-1 required product sensor",
    "tunnel-flow": "deferred: tunnel flow is not a phase-1 required product sensor",
    "slip-belt-temperature-water-content": "deferred: temperature/water-content is mechanistic context, not required",
    "cave-water-temperature": "deferred: water temperature is mechanistic context, not required",
}


@dataclass(frozen=True)
class TimedRow:
    ts: datetime
    row: dict[str, str]


@dataclass(frozen=True)
class DisplacementPoint:
    family: str
    group_key: str
    ts: datetime
    row: dict[str, str]
    value: float
    source_index: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build core Badong-Huangtupo canonical samples.")
    parser.add_argument("--raw-root", default=str(RAW_ROOT))
    parser.add_argument("--out-root", default=str(OUT_ROOT))
    parser.add_argument("--target-hours", type=float, default=TARGET_HOURS)
    parser.add_argument("--target-tolerance-hours", type=float, default=TARGET_TOLERANCE_HOURS)
    parser.add_argument("--validation-ratio", type=float, default=0.2)
    return parser.parse_args()


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


def to_utc_iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def to_float(value: Any) -> float | None:
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


def build_timed_rows(path: Path) -> list[TimedRow]:
    timed_rows: list[TimedRow] = []
    for row in read_csv_rows(path):
        ts = parse_local_time(row.get("obs_time", ""))
        if ts is not None:
            timed_rows.append(TimedRow(ts=ts, row=row))
    timed_rows.sort(key=lambda item: item.ts)
    return timed_rows


def load_displacement_points(raw_root: Path) -> dict[str, list[DisplacementPoint]]:
    groups: dict[str, list[DisplacementPoint]] = defaultdict(list)
    for family, spec in CORE_DISPLACEMENT_FAMILIES.items():
        path = raw_root / spec["path"].name
        rows = read_csv_rows(path)
        for index, row in enumerate(rows):
            ts = parse_local_time(row.get("obs_time", ""))
            value = to_float(row.get(spec["value_field"]))
            group_value = (row.get(spec["group_field"]) or "").strip() or spec["group_field"]
            if ts is None or value is None:
                continue
            group_key = f"{family}:{group_value}"
            groups[group_key].append(
                DisplacementPoint(
                    family=family,
                    group_key=group_key,
                    ts=ts,
                    row=row,
                    value=value,
                    source_index=index,
                )
            )
    for points in groups.values():
        points.sort(key=lambda item: (item.ts, item.source_index))
    return groups


def sum_rainfall_window(rainfall: list[TimedRow], anchor: datetime, hours: float) -> float | None:
    if not rainfall:
        return None
    times = [item.ts for item in rainfall]
    start = anchor - timedelta(hours=hours)
    left = bisect.bisect_left(times, start)
    right = bisect.bisect_right(times, anchor)
    values = [
        to_float(item.row.get("rainfall_current_mm"))
        for item in rainfall[left:right]
    ]
    finite_values = [value for value in values if value is not None]
    if not finite_values:
        return None
    return round6(sum(finite_values))


def latest_rainfall_current(rainfall: list[TimedRow], anchor: datetime, max_age_hours: float = 1.5) -> float | None:
    if not rainfall:
        return None
    times = [item.ts for item in rainfall]
    right = bisect.bisect_right(times, anchor)
    if right <= 0:
        return None
    item = rainfall[right - 1]
    if anchor - item.ts > timedelta(hours=max_age_hours):
        return None
    value = to_float(item.row.get("rainfall_current_mm"))
    return round6(value) if value is not None else None


def nearest_prior_crack(cracks: list[TimedRow], anchor: datetime, max_age_hours: float = 6) -> float | None:
    if not cracks:
        return None
    times = [item.ts for item in cracks]
    right = bisect.bisect_right(times, anchor)
    if right <= 0:
        return None
    item = cracks[right - 1]
    if anchor - item.ts > timedelta(hours=max_age_hours):
        return None
    value = to_float(item.row.get("cave_crack_mm"))
    return round6(value) if value is not None else None


def find_future_point(
    points: list[DisplacementPoint],
    index: int,
    target_hours: float,
    tolerance_hours: float,
) -> tuple[DisplacementPoint, float] | None:
    current = points[index]
    target_ts = current.ts + timedelta(hours=target_hours)
    best: tuple[DisplacementPoint, float] | None = None
    tolerance = timedelta(hours=tolerance_hours)
    for candidate in points[index + 1:]:
        if candidate.ts < target_ts - tolerance:
            continue
        if candidate.ts > target_ts + tolerance:
            break
        delta = abs((candidate.ts - target_ts).total_seconds())
        if best is None or delta < best[1]:
            best = (candidate, delta)
    if best is None:
        return None
    future = best[0]
    lead_hours = (future.ts - current.ts).total_seconds() / 3600
    return future, lead_hours


def build_metrics(
    point: DisplacementPoint,
    rainfall: list[TimedRow],
    cracks: list[TimedRow],
) -> dict[str, float]:
    spec = CORE_DISPLACEMENT_FAMILIES[point.family]
    metrics: dict[str, float] = {
        "displacementObservedMm": round6(point.value),
    }
    for raw_field, canonical_field in spec["metrics"].items():
        value = to_float(point.row.get(raw_field))
        if value is not None:
            metrics[canonical_field] = round6(value)

    rainfall_current = latest_rainfall_current(rainfall, point.ts)
    if rainfall_current is not None:
        metrics["rainfallCurrentMm"] = rainfall_current

    for hours in (6, 24, 72):
        rainfall_sum = sum_rainfall_window(rainfall, point.ts, hours)
        if rainfall_sum is not None:
            metrics[f"rainfallCurrentMm_sum_{hours}h"] = rainfall_sum

    crack = nearest_prior_crack(cracks, point.ts)
    if crack is not None:
        metrics["caveCrackMm"] = crack

    return metrics


def build_sample(
    point: DisplacementPoint,
    future: DisplacementPoint | None,
    lead_hours: float | None,
    rainfall: list[TimedRow],
    cracks: list[TimedRow],
) -> dict[str, Any]:
    metrics = build_metrics(point, rainfall, cracks)
    labels: dict[str, Any] = {}
    label_metadata: dict[str, Any] = {}
    quality_flags: list[dict[str, str]] = []

    if future is not None and lead_hours is not None:
        delta = round6(future.value - point.value)
        rate = round6(delta / (lead_hours / 24)) if lead_hours > 0 else delta
        labels["displacementLabel"] = delta
        labels["displacementRateMmPerDay"] = rate
        label_metadata["displacementLabel"] = {
            "valueType": "number",
            "derivationMode": "derived-future-delta",
            "sourceField": "metricsNormalized.displacementObservedMm",
            "horizonSpec": f"{round6(lead_hours)}h",
        }
        label_metadata["displacementRateMmPerDay"] = {
            "valueType": "number",
            "derivationMode": "derived-future-delta",
            "sourceField": "metricsNormalized.displacementObservedMm",
            "horizonSpec": f"{round6(lead_hours)}h",
        }
    else:
        quality_flags.append(
            {
                "code": "future_24h_displacement_label_unavailable",
                "severity": "info",
                "message": "No same-sensor future displacement point was found inside the 24h tolerance window.",
            }
        )

    if not any(key.startswith("rainfallCurrentMm") for key in metrics):
        quality_flags.append(
            {
                "code": "rainfall_context_unavailable",
                "severity": "info",
                "message": "No prior weather-rainfall observation was available for this anchor.",
            }
        )

    if "caveCrackMm" not in metrics:
        quality_flags.append(
            {
                "code": "optional_cave_crack_unavailable",
                "severity": "info",
                "message": "Optional cave-crack context was not available within the configured lookback window.",
            }
        )

    point_id = (point.row.get("point_id") or point.row.get("sensor_code") or point.group_key).strip()
    sample_id = f"badong-huangtupo:{point.family}:{point_id}:{point.row.get('source_row_index', point.source_index)}"
    return {
        "sampleId": sample_id,
        "identity": {
            "scopeType": "station",
            "scopeKey": point_id,
            "regionCode": REGION_CODE,
            "slopeCode": SLOPE_CODE,
            "stationCode": point_id,
        },
        "eventTs": to_utc_iso(point.ts),
        "windowSpec": WINDOW_SPEC,
        "horizonSpec": HORIZON_SPEC,
        "metricsNormalized": metrics,
        "labels": labels,
        **({"labelMetadata": label_metadata} if label_metadata else {}),
        "sourceDataset": DATASET_KEY,
        "sourceRecordKey": f"{point.family}:{point.row.get('source_row_index', point.source_index)}",
        "sourceFieldMap": {
            "obs_time": "eventTs",
            "displacement_change_mm": "metricsNormalized.beidouDisplacementChangeMm",
            "slip_belt_displacement_value": "metricsNormalized.slipBeltDisplacementMm",
            "rainfall_current_mm": "metricsNormalized.rainfallCurrentMm",
            "cave_crack_mm": "metricsNormalized.caveCrackMm",
        },
        "rawRef": {
            "datasetKey": DATASET_KEY,
            "sourceRecordKey": f"{point.family}:{point.row.get('source_row_index', point.source_index)}",
            "sourcePath": str(CORE_DISPLACEMENT_FAMILIES[point.family]["path"]),
            "originalFields": {
                **point.row,
                "core_family": point.family,
                "core_group_key": point.group_key,
            },
        },
        "qualityFlags": quality_flags,
    }


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n")


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def split_samples(samples: list[dict[str, Any]], validation_ratio: float) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    by_scope: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for sample in samples:
        by_scope[str(sample["identity"]["scopeKey"])].append(sample)
    train: list[dict[str, Any]] = []
    validation: list[dict[str, Any]] = []
    for rows in by_scope.values():
        rows.sort(key=lambda item: item["eventTs"])
        cut = max(1, int(len(rows) * (1 - validation_ratio)))
        if cut >= len(rows):
            cut = max(0, len(rows) - 1)
        train.extend(rows[:cut])
        validation.extend(rows[cut:])
    train.sort(key=lambda item: item["eventTs"])
    validation.sort(key=lambda item: item["eventTs"])
    return train, validation


def count_file_rows(path: Path) -> int:
    return len(read_csv_rows(path))


def summarize_samples(samples: list[dict[str, Any]]) -> dict[str, Any]:
    by_family: dict[str, int] = defaultdict(int)
    by_station: dict[str, int] = defaultdict(int)
    feature_coverage: dict[str, int] = defaultdict(int)
    labeled = 0
    for sample in samples:
        family = str(sample["rawRef"]["originalFields"]["core_family"])
        by_family[family] += 1
        by_station[str(sample["identity"]["stationCode"])] += 1
        if "displacementLabel" in sample["labels"]:
            labeled += 1
        for key in sample["metricsNormalized"]:
            feature_coverage[key] += 1
    total = len(samples)
    return {
        "sampleCount": total,
        "labeledCount": labeled,
        "unlabeledCount": total - labeled,
        "byFamily": dict(sorted(by_family.items())),
        "byStation": dict(sorted(by_station.items())),
        "featureCoverage": {
            key: {
                "count": count,
                "ratio": round6(count / total) if total else 0,
            }
            for key, count in sorted(feature_coverage.items())
        },
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Badong-Huangtupo Core Sample Factory",
        "",
        "## Scope",
        "",
        "- included required families: displacement",
        "- included optional families: weather rainfall, cave crack",
        "- deferred families: groundwater, pore pressure, tunnel settlement, tunnel flow, temperature/water-content",
        "",
        "## Outputs",
        "",
    ]
    for key, value in report["outputs"].items():
        lines.append(f"- `{key}`: `{value}`")
    lines.extend(["", "## Counts", ""])
    summary = report["summary"]
    lines.append(f"- samples: `{summary['sampleCount']}`")
    lines.append(f"- labeled: `{summary['labeledCount']}`")
    lines.append(f"- unlabeled: `{summary['unlabeledCount']}`")
    lines.extend(["", "## Families", ""])
    for family, count in summary["byFamily"].items():
        lines.append(f"- `{family}`: `{count}`")
    lines.extend(["", "## Feature Coverage", ""])
    for key, item in summary["featureCoverage"].items():
        lines.append(f"- `{key}`: `{item['count']}` / `{summary['sampleCount']}` ({item['ratio']:.3f})")
    lines.extend(["", "## Deferred Families", ""])
    for family, item in report["deferredFamilies"].items():
        lines.append(f"- `{family}`: `{item['rowCount']}` rows, {item['reason']}")
    return "\n".join(lines) + "\n"


def main() -> None:
    args = parse_args()
    raw_root = Path(args.raw_root)
    out_root = Path(args.out_root)
    rainfall = build_timed_rows(raw_root / "weather-rainfall.official.rows.csv")
    cracks = build_timed_rows(raw_root / "cave-crack.official.rows.csv")
    groups = load_displacement_points(raw_root)
    samples: list[dict[str, Any]] = []

    for points in groups.values():
        for index, point in enumerate(points):
            future_match = find_future_point(
                points,
                index,
                target_hours=args.target_hours,
                tolerance_hours=args.target_tolerance_hours,
            )
            if future_match is None:
                future, lead_hours = None, None
            else:
                future, lead_hours = future_match
            samples.append(build_sample(point, future, lead_hours, rainfall, cracks))

    samples.sort(key=lambda item: (item["eventTs"], item["identity"]["scopeKey"]))
    labeled_samples = [sample for sample in samples if "displacementLabel" in sample["labels"]]
    train, validation = split_samples(labeled_samples, args.validation_ratio)

    outputs = {
        "allSamples": str(out_root / "badong-huangtupo-core.samples.jsonl"),
        "labeledSamples": str(out_root / "badong-huangtupo-core.labeled.samples.jsonl"),
        "trainSamples": str(out_root / "splits/badong-huangtupo-core.train.jsonl"),
        "validationSamples": str(out_root / "splits/badong-huangtupo-core.validation.jsonl"),
        "reportJson": str(out_root / "badong-huangtupo-core-sample-factory.report.json"),
        "reportMd": str(out_root / "badong-huangtupo-core-sample-factory.report.md"),
    }
    write_jsonl(Path(outputs["allSamples"]), samples)
    write_jsonl(Path(outputs["labeledSamples"]), labeled_samples)
    write_jsonl(Path(outputs["trainSamples"]), train)
    write_jsonl(Path(outputs["validationSamples"]), validation)

    deferred = {
        family: {
            "rowCount": count_file_rows(raw_root / f"{family}.official.rows.csv"),
            "reason": reason,
        }
        for family, reason in DEFERRED_FAMILIES.items()
    }
    report = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "datasetKey": DATASET_KEY,
        "regionCode": REGION_CODE,
        "scopePolicy": "station samples under Badong-Huangtupo regional expert cluster",
        "targetPolicy": {
            "metric": "metricsNormalized.displacementObservedMm",
            "label": "labels.displacementLabel",
            "targetHours": args.target_hours,
            "targetToleranceHours": args.target_tolerance_hours,
        },
        "includedFamilies": {
            "coreDisplacement": list(CORE_DISPLACEMENT_FAMILIES.keys()),
            "requiredCovariates": [],
            "optionalCovariates": ["weather-rainfall", "cave-crack"],
        },
        "deferredFamilies": deferred,
        "inputRows": {
            **{
                family: count_file_rows(raw_root / spec["path"].name)
                for family, spec in CORE_DISPLACEMENT_FAMILIES.items()
            },
            **{
                family: count_file_rows(raw_root / spec["path"].name)
                for family, spec in OPTIONAL_FAMILIES.items()
            },
        },
        "summary": summarize_samples(samples),
        "splitSummary": {
            "validationRatio": args.validation_ratio,
            "trainCount": len(train),
            "validationCount": len(validation),
        },
        "outputs": outputs,
    }
    write_json(Path(outputs["reportJson"]), report)
    Path(outputs["reportMd"]).write_text(render_markdown(report), encoding="utf-8")

    print(f"Wrote Badong-Huangtupo core samples: {len(samples)}")
    print(f"Labeled samples: {len(labeled_samples)}")
    print(f"Train / validation: {len(train)} / {len(validation)}")
    print(f"Report: {outputs['reportJson']}")


if __name__ == "__main__":
    main()
