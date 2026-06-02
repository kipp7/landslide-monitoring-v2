#!/usr/bin/env python3

import argparse
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import h5py
import numpy as np


CHINA_TZ = timezone(timedelta(hours=8))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract daily CHM_PRE point series from a yearly NetCDF file."
    )
    parser.add_argument("--source-file", required=True)
    parser.add_argument("--jobs-file")
    parser.add_argument("--longitude", type=float)
    parser.add_argument("--latitude", type=float)
    parser.add_argument("--window-start")
    parser.add_argument("--window-end")
    args = parser.parse_args()

    if args.jobs_file:
        return args

    missing = [
        flag
        for flag, value in [
            ("--longitude", args.longitude),
            ("--latitude", args.latitude),
            ("--window-start", args.window_start),
            ("--window-end", args.window_end),
        ]
        if value is None
    ]
    if missing:
        parser.error(f"Missing required arguments for single-job mode: {', '.join(missing)}")
    return args


def parse_iso(value: str) -> datetime:
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed


def enumerate_china_days(start_iso: str, end_iso: str) -> list[str]:
    start = parse_iso(start_iso).astimezone(CHINA_TZ).date()
    end = parse_iso(end_iso).astimezone(CHINA_TZ).date()
    if start > end:
        return []

    days: list[str] = []
    cursor = start
    while cursor <= end:
        days.append(cursor.strftime("%Y%m%d"))
        cursor += timedelta(days=1)
    return days


def parse_time_units(units: object) -> date:
    text = units.decode("utf-8") if isinstance(units, bytes) else str(units)
    prefix = "days since "
    if not text.startswith(prefix):
        raise ValueError(f"Unsupported time units: {text}")
    return date.fromisoformat(text[len(prefix) :].split()[0])


def build_day_lookup(time_values: np.ndarray, base_date: date) -> dict[str, int]:
    lookup: dict[str, int] = {}
    for time_index, time_value in enumerate(time_values):
        current_day = (base_date + timedelta(days=int(time_value))).strftime("%Y%m%d")
        lookup[current_day] = time_index
    return lookup


def resolve_grid_indices(
    longitude: float,
    latitude: float,
    lat_values: np.ndarray,
    lon_values: np.ndarray,
    cache: dict[tuple[float, float], tuple[int, int]],
) -> tuple[int, int]:
    cache_key = (longitude, latitude)
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    lat_index = int(np.abs(lat_values - latitude).argmin())
    lon_index = int(np.abs(lon_values - longitude).argmin())
    resolved = (lat_index, lon_index)
    cache[cache_key] = resolved
    return resolved


def extract_rows_for_job(
    *,
    longitude: float,
    latitude: float,
    window_start: str,
    window_end: str,
    day_lookup: dict[str, int],
    lat_values: np.ndarray,
    lon_values: np.ndarray,
    prec_values: h5py.Dataset,
    index_cache: dict[tuple[float, float], tuple[int, int]],
) -> list[dict[str, str]]:
    target_days = enumerate_china_days(window_start, window_end)
    if not target_days:
        return []

    lat_index, lon_index = resolve_grid_indices(
        longitude, latitude, lat_values, lon_values, index_cache
    )

    rows: list[dict[str, str]] = []
    for target_day in target_days:
        time_index = day_lookup.get(target_day)
        if time_index is None:
            continue

        rainfall = prec_values[time_index, lat_index, lon_index]
        rainfall_value = float(rainfall)
        rows.append(
            {
                "source_day": target_day,
                "rainfall_mm": "" if np.isnan(rainfall_value) else f"{rainfall_value}",
                "grid_longitude": f"{float(lon_values[lon_index])}",
                "grid_latitude": f"{float(lat_values[lat_index])}",
            }
        )

    return rows


def main() -> None:
    args = parse_args()
    source_file = Path(args.source_file)

    with h5py.File(source_file, "r") as dataset:
        time_values = dataset["time"][:]
        lat_values = dataset["lat"][:]
        lon_values = dataset["lon"][:]
        prec_values = dataset["prec"]

        base_date = parse_time_units(dataset["time"].attrs["units"])
        day_lookup = build_day_lookup(time_values, base_date)
        index_cache: dict[tuple[float, float], tuple[int, int]] = {}

        if args.jobs_file:
            jobs = json.loads(Path(args.jobs_file).read_text(encoding="utf-8"))
            rows: list[dict[str, str]] = []
            for job in jobs:
                job_rows = extract_rows_for_job(
                    longitude=float(job["longitude"]),
                    latitude=float(job["latitude"]),
                    window_start=str(job.get("window_start", job.get("windowStart", ""))),
                    window_end=str(job.get("window_end", job.get("windowEnd", ""))),
                    day_lookup=day_lookup,
                    lat_values=lat_values,
                    lon_values=lon_values,
                    prec_values=prec_values,
                    index_cache=index_cache,
                )
                rows.extend(
                    {
                        "job_key": str(job.get("job_key", job.get("jobKey", ""))),
                        **row,
                    }
                    for row in job_rows
                )

            print(json.dumps(rows, ensure_ascii=False))
            return

        rows = extract_rows_for_job(
            longitude=float(args.longitude),
            latitude=float(args.latitude),
            window_start=str(args.window_start),
            window_end=str(args.window_end),
            day_lookup=day_lookup,
            lat_values=lat_values,
            lon_values=lon_values,
            prec_values=prec_values,
            index_cache=index_cache,
        )

    print(json.dumps(rows, ensure_ascii=False))


if __name__ == "__main__":
    main()
