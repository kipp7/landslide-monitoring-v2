import csv
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd


ROOT = Path(".")
RAW_ROOT = ROOT / ".tmp/regional-model-library/raw/Badong-Huangtupo/original"
OUT_ROOT = ROOT / ".tmp/regional-model-library/raw/Badong-Huangtupo/normalized/phase1-families"

DATASETS = {
    "afda81fe-f260-4da0-8627-7311c792b979": {
        "family": "beidou-displacement",
        "sensor_code": "P1",
        "expected_columns": ["时间", "序号", "测站编号", "灾害体名称", "测站名称", "X", "Y", "Z", "变化量"],
        "kind": "beidou_3d_displacement",
    },
    "394ea9b2-4e41-400c-b975-54e82c5eb382": {
        "family": "fault-zone-beidou-displacement",
        "sensor_code": "P24",
        "expected_columns": ["时间", "序号", "测站编号", "灾害体名称", "测站名称", "X", "Y", "Z", "变化量"],
        "kind": "beidou_3d_displacement",
    },
    "a1fdce07-86b6-4a6b-b665-776e821768e3": {
        "family": "cave-slip-belt-displacement",
        "sensor_code": "D301",
        "expected_columns": ["时间", "序号", "温度", "测量值", "偏差值"],
        "kind": "generic_tunnel_sensor",
        "value_column": "slip_belt_displacement_value",
    },
    "d23a09fc-fcf0-4fa5-9637-bde3f7d968a5": {
        "family": "tunnel-settlement",
        "sensor_code": "S300",
        "expected_columns": ["时间", "序号", "温度", "测量值", "偏差值"],
        "kind": "generic_tunnel_sensor",
        "value_column": "settlement_value",
    },
    "ca1fbf48-a050-4ae3-86f2-3b0000f2ee00": {
        "family": "tunnel-flow",
        "sensor_code": "Q007",
        "expected_columns": ["时间", "序号", "温度", "测量值", "偏差值"],
        "kind": "generic_tunnel_sensor",
        "value_column": "flow_value",
    },
    "3a31fe7f-d817-4945-895b-345dc96bb84f": {
        "family": "slip-belt-temperature-water-content",
        "sensor_code": "WC501",
        "expected_columns": ["时间", "序号", "温度", "测量值", "偏差值"],
        "kind": "generic_tunnel_sensor",
        "value_column": "water_content_value",
    },
    "a03e3c52-c67f-486a-989d-8ec2980a5f96": {
        "family": "cave-water-temperature",
        "sensor_code": "T001",
        "expected_columns": ["时间", "序号", "温度", "测量值", "偏差值"],
        "kind": "generic_tunnel_sensor",
        "value_column": "water_temperature_value",
    },
    "9249c3ce-d96a-40a2-b9b9-ec0b31bab32b": {
        "family": "pore-pressure",
        "sensor_code": "WL001",
        "expected_columns": ["时间", "序号", "温度", "测量值", "偏差值"],
        "kind": "generic_tunnel_sensor",
        "value_column": "pore_pressure_kpa",
    },
    "c6586768-6071-4fa6-805e-d4ef5c97d3dc": {
        "family": "cave-crack",
        "sensor_code": "C004",
        "expected_columns": ["时间", "序号", "温度", "测量值", "偏差值"],
        "kind": "generic_tunnel_sensor",
        "value_column": "cave_crack_mm",
    },
    "f79afeb9-8239-4e23-ac2a-c0c5e132a354": {
        "family": "weather-rainfall",
        "sensor_code": "QX1",
        "expected_columns": ["时间", "序号", "实时雨量", "累计雨量"],
        "kind": "weather_rainfall",
    },
    "7a3f6751-d758-4639-9686-0b1da4ff3ed5": {
        "family": "groundwater-depth-temperature",
        "sensor_code": "JC10",
        "kind": "groundwater_depth_temperature",
    },
}


def is_missing(value):
    if value is None:
        return True
    try:
        return bool(pd.isna(value))
    except (TypeError, ValueError):
        return False


def normalize_time(value):
    if is_missing(value):
        return ""
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    return str(value).strip()


def normalize_number(value):
    if is_missing(value):
        return ""
    if isinstance(value, str) and value.strip().lower() in {"", "nan", "none", "null"}:
        return ""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return ""
    if not math.isfinite(number):
        return ""
    return f"{number:.10g}"


def normalize_text(value):
    if is_missing(value):
        return ""
    return str(value).strip()


def find_excel_files(dataset_dir):
    files = sorted(path for path in dataset_dir.glob("*.xls*") if path.suffix.lower() in {".xls", ".xlsx"})
    if not files:
        raise RuntimeError(f"Expected Excel files under {dataset_dir}, found none")
    return files


def read_first_sheet(source_file):
    workbook = pd.ExcelFile(source_file)
    try:
        sheet_name = workbook.sheet_names[0]
        frame = pd.read_excel(workbook, sheet_name=sheet_name, dtype=object)
        headers = [normalize_text(column) for column in frame.columns]
        records = [(row_index, list(row)) for row_index, row in enumerate(frame.itertuples(index=False, name=None), start=2)]
        return sheet_name, headers, records
    finally:
        workbook.close()


def read_meta(dataset_dir):
    meta_path = dataset_dir / "_ncdc_meta_.json"
    if not meta_path.exists():
        return {}
    return json.loads(meta_path.read_text(encoding="utf-8"))


def normalize_beidou(sheet_name, records, spec, meta_id, source_file):
    rows = []
    for row_index, row in records:
        obs_time, sequence_no, station_no, hazard_name, station_name, dx, dy, dz, change = row[:9]
        if not normalize_time(obs_time):
            continue
        rows.append(
            {
                "obs_time": normalize_time(obs_time),
                "sequence_no": normalize_number(sequence_no),
                "station_no": normalize_text(station_no),
                "hazard_name": normalize_text(hazard_name),
                "point_id": normalize_text(station_name) or spec["sensor_code"],
                "displacement_x_mm": normalize_number(dx),
                "displacement_y_mm": normalize_number(dy),
                "displacement_z_mm": normalize_number(dz),
                "displacement_change_mm": normalize_number(change),
                "source_meta_id": meta_id,
                "source_file": source_file.name,
                "source_sheet": sheet_name,
                "source_row_index": row_index,
            }
        )
    return rows


def normalize_generic_sensor(sheet_name, records, spec, meta_id, source_file):
    rows = []
    value_column = spec["value_column"]
    for row_index, row in records:
        obs_time, sequence_no, temperature, measured_value, deviation_value = row[:5]
        if not normalize_time(obs_time):
            continue
        rows.append(
            {
                "obs_time": normalize_time(obs_time),
                "sequence_no": normalize_number(sequence_no),
                "sensor_code": spec["sensor_code"],
                "sensor_family": spec["family"],
                "temperature_c": normalize_number(temperature),
                value_column: normalize_number(measured_value),
                "deviation_value": normalize_number(deviation_value),
                "source_meta_id": meta_id,
                "source_file": source_file.name,
                "source_sheet": sheet_name,
                "source_row_index": row_index,
            }
        )
    return rows


def normalize_weather_rainfall(sheet_name, records, spec, meta_id, source_file):
    rows = []
    for row_index, row in records:
        obs_time, sequence_no, rainfall_current, rainfall_cumulative = row[:4]
        if not normalize_time(obs_time):
            continue
        rows.append(
            {
                "obs_time": normalize_time(obs_time),
                "sequence_no": normalize_number(sequence_no),
                "sensor_code": spec["sensor_code"],
                "sensor_family": spec["family"],
                "rainfall_current_mm": normalize_number(rainfall_current),
                "rainfall_cumulative_mm": normalize_number(rainfall_cumulative),
                "source_meta_id": meta_id,
                "source_file": source_file.name,
                "source_sheet": sheet_name,
                "source_row_index": row_index,
            }
        )
    return rows


def normalize_groundwater(sheet_name, records, spec, meta_id, source_file, value_column):
    rows = []
    for row_index, row in records:
        obs_time, sequence_no, station_no, hazard_name, station_name, place_name, measured_value = row[:7]
        if not normalize_time(obs_time):
            continue
        rows.append(
            {
                "obs_time": normalize_time(obs_time),
                "sequence_no": normalize_number(sequence_no),
                "station_no": normalize_text(station_no),
                "hazard_name": normalize_text(hazard_name),
                "point_id": normalize_text(station_name) or spec["sensor_code"],
                "place_name": normalize_text(place_name),
                value_column: normalize_number(measured_value),
                "source_meta_id": meta_id,
                "source_file": source_file.name,
                "source_sheet": sheet_name,
                "source_row_index": row_index,
            }
        )
    return rows


def build_dataset_report(meta_id, spec, meta, source_file, output_path, rows, family=None):
    return {
        "metaId": meta_id,
        "titleCn": meta.get("title_cn"),
        "family": family or spec["family"],
        "sensorCode": spec["sensor_code"],
        "sourceFile": source_file.name,
        "output": str(output_path),
        "rows": len(rows),
        "columns": list(rows[0].keys()) if rows else [],
        "shareType": meta.get("ds_share_type"),
        "timeResolution": meta.get("ds_time_res"),
        "sizeBytes": meta.get("ds_total_size"),
    }


def write_csv(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    fieldnames = list(rows[0].keys())
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    report = {
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "rawRoot": str(RAW_ROOT),
        "outRoot": str(OUT_ROOT),
        "datasets": [],
    }
    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    for meta_id, spec in DATASETS.items():
        dataset_dir = RAW_ROOT / meta_id
        meta = read_meta(dataset_dir)
        source_files = find_excel_files(dataset_dir)

        if spec["kind"] == "groundwater_depth_temperature":
            for source_file in source_files:
                sheet_name, headers, records = read_first_sheet(source_file)
                if headers[:7] == ["时间", "序号", "测站ID", "灾害体名称", "测站名称", "参数名称", "埋深"]:
                    family = "groundwater-depth"
                    value_column = "groundwater_depth_m"
                elif headers[:7] == ["时间", "序号", "测站ID", "灾害体名称", "测站名称", "参数名称", "水温"]:
                    family = "groundwater-temperature"
                    value_column = "groundwater_temperature_c"
                else:
                    raise RuntimeError(f"Unexpected groundwater headers for {meta_id}: {headers}")
                rows = normalize_groundwater(sheet_name, records, spec, meta_id, source_file, value_column)
                output_path = OUT_ROOT / f"{family}.official.rows.csv"
                write_csv(output_path, rows)
                report["datasets"].append(build_dataset_report(meta_id, spec, meta, source_file, output_path, rows, family))
            continue

        if len(source_files) != 1:
            raise RuntimeError(f"Expected one Excel file under {dataset_dir}, found {len(source_files)}")

        source_file = source_files[0]
        sheet_name, headers, records = read_first_sheet(source_file)
        if headers[: len(spec["expected_columns"])] != spec["expected_columns"]:
            raise RuntimeError(f"Unexpected headers for {meta_id}: {headers}")
        if spec["kind"] == "beidou_3d_displacement":
            rows = normalize_beidou(sheet_name, records, spec, meta_id, source_file)
        elif spec["kind"] == "generic_tunnel_sensor":
            rows = normalize_generic_sensor(sheet_name, records, spec, meta_id, source_file)
        elif spec["kind"] == "weather_rainfall":
            rows = normalize_weather_rainfall(sheet_name, records, spec, meta_id, source_file)
        else:
            raise RuntimeError(f"Unsupported kind for {meta_id}: {spec['kind']}")

        output_path = OUT_ROOT / f"{spec['family']}.official.rows.csv"
        write_csv(output_path, rows)
        report["datasets"].append(build_dataset_report(meta_id, spec, meta, source_file, output_path, rows))

    report_path = OUT_ROOT / "badong-huangtupo-open-pack-normalization-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote Badong-Huangtupo open pack normalization report to {report_path}")
    for item in report["datasets"]:
        print(f"{item['family']}: {item['rows']} rows -> {item['output']}")


if __name__ == "__main__":
    main()
