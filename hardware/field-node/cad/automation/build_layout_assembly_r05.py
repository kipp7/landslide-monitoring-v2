from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import shutil
import subprocess
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import pythoncom
import win32com.client

from build_reference_parts import (
    PartSpec,
    build_part,
    call,
    cut_last_profile_through_all,
    safe_close_model,
)
from build_tilt_interface_r02 import (
    add_note,
    close_new_unsaved_documents,
    close_output_documents,
    com_value,
    document_titles,
    normalize_step_line_endings,
    save_document,
    set_custom_property,
    standard_view_name,
)


REVISION = "CAD-R0.5"
ASSEMBLY_NAME = "FN-ASM-003_internal-layout-ports-harness_R0.5"
ASSEMBLY_TEMPLATE = Path(
    r"C:\ProgramData\SOLIDWORKS\SOLIDWORKS 2022\templates\gb_assembly.asmdot"
)
TRAY_NAME = "FN-ENC-004_open-tray_4PORT-NOMINAL_R0.5"
PLATE_NAME = "FN-PLT-005_fr4-5MM_8HOLE-NOMINAL_R0.5"
PCB_NAME = "FN-PCB-004_carrier_ROTATED-CCW_4HOLE_R0.5"
PCB_ENVELOPE_NAME = "FN-ENV-002_carrier-installed-height_R0.5"
BATTERY_NAME = "FN-BAT-003_battery-envelope_USER-MEASURED_R0.5"
BATTERY_TRAY_NAME = "FN-HLD-003_battery-tray-zone_R0.5"
CHARGER_NAME = "FN-PWR-002_cn3791-module-envelope_R0.5"
CHARGER_HOLDER_NAME = "FN-HLD-004_cn3791-clip-zone_R0.5"
FUSE_ZONE_NAME = "FN-ZON-003_fuse-service-disconnect_R0.5"
EDGE_PAD_NAME = "FN-SUP-002_edge-support-pad_DRAFT_R0.5"

ENC_OUTER_X_MM = 317.9
ENC_OUTER_Y_MM = 238.9
ENC_BOTTOM_DEPTH_MM = 91.1
ENC_INNER_X_MM = 276.0655
ENC_INNER_Y_MM = 197.0
ENC_FLOOR_MM = 3.0
SUPPORT_TOP_FROM_FLOOR_MM = 6.0

PLATE_X_MM = 272.0
PLATE_Y_MM = 193.0
PLATE_Z_MM = 5.0

PCB_X_MM = 115.0
PCB_Y_MM = 170.0
PCB_Z_MM = 1.6
PCB_INSTALLED_Z_MM = 35.0
PCB_STANDOFF_MM = 6.0
PCB_HOLES_XY_MM = ((-54.0, -81.5), (54.0, -81.5), (-54.0, 81.5), (54.0, 81.5))
PCB_HOLE_DIAMETER_MM = 3.2

BATTERY_X_MM = 66.0
BATTERY_Y_MM = 61.0
BATTERY_Z_MM = 40.0
BATTERY_TRAY_X_MM = 72.0
BATTERY_TRAY_Y_MM = 67.0
BATTERY_TRAY_Z_MM = 3.0

CHARGER_X_MM = 46.0
CHARGER_Y_MM = 21.0
CHARGER_Z_MM = 10.0
CHARGER_HOLDER_X_MM = 56.0
CHARGER_HOLDER_Y_MM = 31.0
CHARGER_HOLDER_Z_MM = 3.0

FUSE_ZONE_X_MM = 38.0
FUSE_ZONE_Y_MM = 18.0
FUSE_ZONE_Z_MM = 15.0

EDGE_PAD_X_MM = 12.0
EDGE_PAD_Y_MM = 12.0
EDGE_PAD_Z_MM = 6.0

ANCHOR_COLUMN_PITCH_MM = 120.3
ANCHOR_OUTER_ROW_PITCH_MM = 160.0
ANCHOR_INNER_ROW_PITCH_MM = 61.2
ANCHOR_HOLE_DIAMETER_MM = 3.5
ANCHOR_HOLES_XY_MM = tuple(
    (x_mm, y_mm)
    for y_mm in (80.0, 30.6, -30.6, -80.0)
    for x_mm in (-60.15, 60.15)
)

SUBPLATE_X_MM = 120.0
SUBPLATE_Y_MM = 85.0
SUBPLATE_Z_MM = 3.0
SENSOR_X_MM = 90.0
SENSOR_Y_MM = 58.0
SENSOR_Z_MM = 36.0

MAIN_LAYOUT_KEYS = {"pcb_envelope", "battery_tray", "charger_holder", "fuse_zone", "subplate"}


@dataclass(frozen=True)
class RouteSpec:
    key: str
    wire_id: str
    name: str
    instance: str
    purpose: str
    endpoints: str
    cable: str
    points_xy_mm: tuple[tuple[float, float], ...]
    width_mm: float
    height_mm: float
    color_rgb: tuple[float, float, float]
    status: str

    @property
    def bounds_xy_mm(self) -> tuple[float, float, float, float]:
        xs = [point[0] for point in self.points_xy_mm]
        ys = [point[1] for point in self.points_xy_mm]
        half = self.width_mm / 2.0
        return min(xs) - half, min(ys) - half, max(xs) + half, max(ys) + half

    @property
    def centerline_length_mm(self) -> float:
        return sum(
            abs(x2 - x1) + abs(y2 - y1)
            for (x1, y1), (x2, y2) in zip(
                self.points_xy_mm, self.points_xy_mm[1:]
            )
        )


ROUTES = (
    RouteSpec("route_pv", "W1", "FN-HAR-009_W1-pv-input_R0.5", "W1_PV_TO_CN3791", "太阳能输入", "G1 PV -> CN3791 PV IN", "2芯耐候电源线", ((110.0, -117.0), (110.0, -100.0), (132.0, -100.0), (132.0, -9.0), (119.0, -9.0)), 4.0, 2.5, (0.95, 0.55, 0.05), "NOMINAL_G1_M16"),
    RouteSpec("route_charge", "W2", "FN-HAR-010_W2-battery-charge_R0.5", "W2_CN3791_TO_BATTERY", "电池充电", "CN3791 BAT -> battery charge lead", "2芯电源线/防反插插头", ((73.0, -9.0), (73.0, -24.0), (60.0, -24.0), (60.0, -31.0)), 4.0, 2.5, (0.84, 0.12, 0.10), "CONNECTOR_SELECTION_PENDING"),
    RouteSpec("route_load_in", "W3", "FN-HAR-011_W3-battery-to-fuse_R0.5", "W3_BATTERY_TO_FUSE", "负载主电源", "battery load -> fuse/service disconnect", "2芯电源线", ((60.0, -34.0), (52.0, -34.0), (52.0, -55.0), (47.0, -55.0)), 4.5, 2.5, (0.70, 0.06, 0.08), "FUSE_SELECTION_PENDING"),
    RouteSpec("route_load_out", "W4", "FN-HAR-012_W4-fuse-to-dc5521_R0.5", "W4_FUSE_TO_DC5521", "受保护电源", "fuse/service disconnect -> PCB DC5521", "2芯电源线/DC5521插头", ((9.0, -55.0), (-2.0, -55.0), (-2.0, -75.0), (-15.5, -75.0)), 4.5, 2.5, (0.70, 0.06, 0.08), "FUSE_SELECTION_PENDING"),
    RouteSpec("route_tilt", "W5", "FN-HAR-013_W5-tilt-rs485_R0.5", "W5_TILT_TO_RS485_1", "箱内倾角RS485", "tilt transmitter -> PCB RS485-1", "4芯屏蔽线: V+/GND/A/B", ((23.0, 53.0), (4.0, 53.0), (4.0, 70.0), (-15.5, 70.0)), 4.0, 2.5, (0.48, 0.20, 0.72), "INTERNAL_ROUTE"),
    RouteSpec("route_soil", "W6", "FN-HAR-014_W6-soil-rs485_R0.5", "W6_G2_SOIL_TO_RS485_2", "外部土壤RS485", "G2 SOIL -> PCB RS485-2", "4芯屏蔽线: V+/GND/A/B", ((60.0, -117.0), (60.0, -100.0), (4.0, -100.0), (4.0, 38.0), (0.0, 38.0), (0.0, 45.0), (-15.5, 45.0)), 4.0, 2.5, (0.05, 0.36, 0.78), "NOMINAL_G2_M16"),
    RouteSpec("route_gnss", "W7", "FN-HAR-015_W7-gnss-coax_R0.5", "W7_RF1_GNSS_COAX", "GNSS同轴", "PCB GNSS SMA -> RF1 bulkhead -> BT-760", "50 ohm同轴/非RP-SMA", ((-130.5, -75.0), (-134.0, -75.0), (-134.0, -99.0), (-118.0, -99.0), (-118.0, -117.0)), 3.0, 2.5, (0.88, 0.64, 0.08), "NOMINAL_RF1_SMA"),
    RouteSpec("route_xls1", "W8", "FN-HAR-016_W8-xls1-rf_R0.5", "W8_RF2_XLS1_COAX", "XLS1射频同轴", "PCB XLS1 SMA -> RF2 bulkhead -> external antenna", "50 ohm同轴/非RP-SMA", ((-130.5, 0.0), (-136.0, 0.0), (-136.0, -104.0), (-82.0, -104.0), (-82.0, -117.0)), 3.0, 2.5, (0.00, 0.62, 0.72), "NOMINAL_RF2_SMA"),
)


@dataclass(frozen=True)
class PortSpec:
    port_id: str
    purpose: str
    x_mm: float
    z_mm: float
    cutout_diameter_mm: float
    hardware: str
    status: str


PORTS = (
    PortSpec("RF1", "GNSS天线", -118.0, 28.0, 6.5, "SMA-K/SMA-K穿板座", "NOMINAL_VERIFY_SAMPLE"),
    PortSpec("RF2", "XLS1天线", -82.0, 28.0, 6.5, "SMA-K/SMA-K穿板座", "NOMINAL_VERIFY_SAMPLE"),
    PortSpec("G2", "土壤传感器", 60.0, 28.0, 16.5, "M16 IP68格兰头", "NOMINAL_VERIFY_CABLE_OD"),
    PortSpec("G1", "太阳能输入", 110.0, 28.0, 16.5, "M16 IP68格兰头", "NOMINAL_VERIFY_CABLE_OD"),
)


@dataclass(frozen=True)
class Placement:
    key: str
    instance: str
    path: Path
    center_x_mm: float
    center_y_mm: float
    bottom_z_mm: float
    size_x_mm: float
    size_y_mm: float
    size_z_mm: float
    status: str
    color_rgb: tuple[float, float, float]
    transparency: float = 0.0

    @property
    def bounds_xy_mm(self) -> tuple[float, float, float, float]:
        return (
            self.center_x_mm - self.size_x_mm / 2.0,
            self.center_y_mm - self.size_y_mm / 2.0,
            self.center_x_mm + self.size_x_mm / 2.0,
            self.center_y_mm + self.size_y_mm / 2.0,
        )


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def appearance(rgb: tuple[float, float, float], transparency: float) -> list[float]:
    return [rgb[0], rgb[1], rgb[2], 0.25, 0.75, 0.35, 0.25, transparency, 0.0]


def validate_layout(placements: list[Placement]) -> dict[str, Any]:
    half_plate_x = PLATE_X_MM / 2.0
    half_plate_y = PLATE_Y_MM / 2.0
    layout_keys = MAIN_LAYOUT_KEYS
    for item in placements:
        if item.key not in layout_keys:
            continue
        x1, y1, x2, y2 = item.bounds_xy_mm
        if x1 < -half_plate_x or x2 > half_plate_x or y1 < -half_plate_y or y2 > half_plate_y:
            raise RuntimeError(f"{item.key} lies outside the FR4 plate: {item.bounds_xy_mm}")

    planar = [item for item in placements if item.key in layout_keys]
    clearances: dict[str, float] = {}
    for index, first in enumerate(planar):
        ax1, ay1, ax2, ay2 = first.bounds_xy_mm
        for second in planar[index + 1 :]:
            bx1, by1, bx2, by2 = second.bounds_xy_mm
            gap_x = max(bx1 - ax2, ax1 - bx2, 0.0)
            gap_y = max(by1 - ay2, ay1 - by2, 0.0)
            if gap_x == 0.0 and gap_y == 0.0:
                raise RuntimeError(f"Planar overlap between {first.key} and {second.key}")
            clearances[f"{first.key}:{second.key}"] = round(math.hypot(gap_x, gap_y), 3)

    plate_gap_x = (ENC_INNER_X_MM - PLATE_X_MM) / 2.0
    plate_gap_y = (ENC_INNER_Y_MM - PLATE_Y_MM) / 2.0
    if plate_gap_x <= 0.0 or plate_gap_y <= 0.0:
        raise RuntimeError("FR4 plate does not fit the nominal enclosure rectangle")

    max_z = max(
        item.bottom_z_mm + item.size_z_mm
        for item in placements
        if item.key not in {"tray", "edge_pad_1", "edge_pad_2", "edge_pad_3", "edge_pad_4"}
    )
    if max_z >= ENC_BOTTOM_DEPTH_MM:
        raise RuntimeError(f"Assembly exceeds nominal bottom depth: z={max_z} mm")

    endpoint_components = {
        "route_pv": {"charger_holder"},
        "route_charge": {"charger_holder", "battery_tray"},
        "route_load_in": {"battery_tray", "fuse_zone"},
        "route_load_out": {"fuse_zone", "pcb_envelope"},
        "route_tilt": {"subplate", "pcb_envelope"},
        "route_soil": {"pcb_envelope"},
        "route_gnss": {"pcb_envelope"},
        "route_xls1": {"pcb_envelope"},
    }
    obstacle_by_key = {item.key: item for item in placements if item.key in MAIN_LAYOUT_KEYS}
    route_clearances: dict[str, float] = {}
    for route in ROUTES:
        half = route.width_mm / 2.0
        segments = [
            (
                min(x1, x2) - half,
                min(y1, y2) - half,
                max(x1, x2) + half,
                max(y1, y2) + half,
            )
            for (x1, y1), (x2, y2) in zip(route.points_xy_mm, route.points_xy_mm[1:])
        ]
        for key, obstacle in obstacle_by_key.items():
            if key in endpoint_components[route.key]:
                continue
            bx1, by1, bx2, by2 = obstacle.bounds_xy_mm
            minimum_gap = math.inf
            for ax1, ay1, ax2, ay2 in segments:
                gap_x = max(bx1 - ax2, ax1 - bx2, 0.0)
                gap_y = max(by1 - ay2, ay1 - by2, 0.0)
                if gap_x == 0.0 and gap_y == 0.0:
                    raise RuntimeError(
                        f"Harness collision: {route.wire_id} intersects {key}"
                    )
                minimum_gap = min(minimum_gap, math.hypot(gap_x, gap_y))
            route_clearances[f"{route.wire_id}:{key}"] = round(minimum_gap, 3)
    return {
        "plate_nominal_clearance_per_side_mm": [round(plate_gap_x, 4), round(plate_gap_y, 4)],
        "minimum_planar_clearance_mm": min(clearances.values()),
        "pair_clearances_mm": clearances,
        "highest_component_z_mm": round(max_z, 3),
        "nominal_rim_clearance_mm": round(ENC_BOTTOM_DEPTH_MM - max_z, 3),
        "minimum_harness_to_nonendpoint_component_clearance_mm": min(
            route_clearances.values()
        ),
        "harness_to_nonendpoint_component_clearances_mm": route_clearances,
    }


def rectangle_union_area(rectangles: list[tuple[float, float, float, float]]) -> float:
    """Return the exact union area for axis-aligned route rectangles."""

    x_values = sorted({value for rectangle in rectangles for value in (rectangle[0], rectangle[2])})
    area = 0.0
    for left, right in zip(x_values, x_values[1:]):
        if right <= left:
            continue
        intervals = sorted(
            (bottom, top)
            for x1, bottom, x2, top in rectangles
            if x1 < right and x2 > left
        )
        merged_length = 0.0
        if intervals:
            current_bottom, current_top = intervals[0]
            for bottom, top in intervals[1:]:
                if bottom <= current_top:
                    current_top = max(current_top, top)
                else:
                    merged_length += current_top - current_bottom
                    current_bottom, current_top = bottom, top
            merged_length += current_top - current_bottom
        area += (right - left) * merged_length
    return area


def route_rectangles(route: RouteSpec) -> tuple[tuple[float, float, float, float], ...]:
    center_x = (route.bounds_xy_mm[0] + route.bounds_xy_mm[2]) / 2.0
    center_y = (route.bounds_xy_mm[1] + route.bounds_xy_mm[3]) / 2.0
    half = route.width_mm / 2.0
    rectangles: list[tuple[float, float, float, float]] = []
    for (x1, y1), (x2, y2) in zip(route.points_xy_mm, route.points_xy_mm[1:]):
        if not (math.isclose(x1, x2) or math.isclose(y1, y2)):
            raise RuntimeError(f"{route.key}: only orthogonal concept routes are supported")
        rectangles.append(
            (
                min(x1, x2) - half - center_x,
                min(y1, y2) - half - center_y,
                max(x1, x2) + half - center_x,
                max(y1, y2) + half - center_y,
            )
        )
    return tuple(rectangles)


async def build_route_part(
    session: ClientSession, route: RouteSpec, output_dir: Path
) -> dict[str, Any]:
    rectangles = list(route_rectangles(route))
    await call(session, "create_part", {"input_data": {"name": route.name, "units": "mm"}})
    for index, (x1, y1, x2, y2) in enumerate(rectangles, start=1):
        sketch_name = f"RouteSegment{index:02d}"
        await call(
            session,
            "create_sketch",
            {"input_data": {"plane": "Top", "sketch_name": sketch_name}},
        )
        await call(
            session,
            "add_rectangle",
            {"input_data": {"x1": x1, "y1": y1, "x2": x2, "y2": y2}},
        )
        await call(session, "exit_sketch", {})
        await call(
            session,
            "create_extrusion",
            {
                "input_data": {
                    "sketch_name": sketch_name,
                    "depth": route.height_mm,
                    "direction": "blind",
                }
            },
        )

    mass_result = await call(session, "get_mass_properties", {"input_data": {"units": "metric"}})
    actual_volume = float(mass_result["mass_properties"]["volume"]["value"])
    expected_volume = rectangle_union_area(rectangles) * route.height_mm
    route_volume_tolerance = max(0.75, expected_volume * 0.05)
    if not math.isclose(
        actual_volume,
        expected_volume,
        rel_tol=0.0,
        abs_tol=route_volume_tolerance,
    ):
        raise RuntimeError(
            f"{route.name}: volume mismatch, expected {expected_volume:.3f}, "
            f"got {actual_volume:.3f} mm3; tolerance={route_volume_tolerance:.3f}"
        )

    native = output_dir / f"{route.name}.SLDPRT"
    step = output_dir / f"{route.name}.STEP"
    preview = output_dir / f"{route.name}.png"
    await call(
        session,
        "save_as",
        {"input_data": {"file_path": str(native), "format_type": "solidworks", "overwrite": True}},
    )
    await call(session, "export_step", {"input_data": {"file_path": str(step), "format_type": "step"}})
    await call(
        session,
        "export_image",
        {
            "input_data": {
                "file_path": str(preview),
                "format_type": "png",
                "width": 1600,
                "height": 1000,
                "view_orientation": "top",
            }
        },
    )
    await safe_close_model(session)
    return {
        "part": route.name,
        "status": route.status,
        "segments": len(rectangles),
        "centerline_length_mm": round(route.centerline_length_mm, 3),
        "expected_volume_mm3": round(expected_volume, 3),
        "actual_volume_mm3": round(actual_volume, 3),
        "volume_tolerance_mm3": round(route_volume_tolerance, 3),
    }


def create_labeled_top_view(
    placements: list[Placement], output_dir: Path
) -> dict[str, Any]:
    width = 2800
    height = 1800
    center_x = 800.0
    center_y = 850.0
    scale = 4.35
    svg_ns = "http://www.w3.org/2000/svg"
    ET.register_namespace("", svg_ns)

    def element(parent: Any, tag: str, **attributes: Any) -> Any:
        return ET.SubElement(
            parent,
            f"{{{svg_ns}}}{tag}",
            {key.replace("_", "-"): str(value) for key, value in attributes.items()},
        )

    def point(x_mm: float, y_mm: float) -> tuple[float, float]:
        return center_x + x_mm * scale, center_y - y_mm * scale

    def rectangle(
        parent: Any,
        x_mm: float,
        y_mm: float,
        size_x_mm: float,
        size_y_mm: float,
        **attributes: Any,
    ) -> Any:
        left, top = point(x_mm - size_x_mm / 2.0, y_mm + size_y_mm / 2.0)
        return element(
            parent,
            "rect",
            x=f"{left:.2f}",
            y=f"{top:.2f}",
            width=f"{size_x_mm * scale:.2f}",
            height=f"{size_y_mm * scale:.2f}",
            **attributes,
        )

    def text_node(
        parent: Any,
        value: str,
        x: float,
        y: float,
        size: int = 28,
        weight: int = 400,
        color: str = "#172033",
        anchor: str = "start",
    ) -> Any:
        node = element(
            parent,
            "text",
            x=f"{x:.2f}",
            y=f"{y:.2f}",
            font_family="Microsoft YaHei, Arial, sans-serif",
            font_size=size,
            font_weight=weight,
            fill=color,
            text_anchor=anchor,
        )
        node.text = value
        return node

    root = ET.Element(
        f"{{{svg_ns}}}svg",
        {
            "width": str(width),
            "height": str(height),
            "viewBox": f"0 0 {width} {height}",
        },
    )
    defs = element(root, "defs")
    marker = element(
        defs,
        "marker",
        id="arrow",
        markerWidth="10",
        markerHeight="10",
        refX="5",
        refY="5",
        orient="auto-start-reverse",
    )
    element(marker, "path", d="M 0 0 L 10 5 L 0 10 z", fill="#3f4b5f")
    element(root, "rect", x="0", y="0", width=width, height=height, fill="#ffffff")

    text_node(root, "FN-ASM-003 内部布局、箱壁接口与线束", 80, 68, 42, 700)
    text_node(root, "CAD-R0.5 | 5 mm FR4 | 四个下侧壁名义开孔 | 仅供评审", 80, 112, 25, 700, "#b42318")

    geometry = element(root, "g")
    rectangle(
        geometry,
        0.0,
        0.0,
        ENC_OUTER_X_MM,
        ENC_OUTER_Y_MM,
        fill="#d9dee5",
        stroke="#263241",
        stroke_width="4",
    )
    rectangle(
        geometry,
        0.0,
        0.0,
        ENC_INNER_X_MM,
        ENC_INNER_Y_MM,
        fill="#f7f9fb",
        stroke="#6b7788",
        stroke_width="3",
        stroke_dasharray="14 10",
    )
    rectangle(
        geometry,
        0.0,
        0.0,
        PLATE_X_MM,
        PLATE_Y_MM,
        fill="#dcefdc",
        stroke="#236b3a",
        stroke_width="5",
    )

    item_by_key = {item.key: item for item in placements}
    draw_order = (
        "pcb_envelope",
        "pcb",
        "battery_tray",
        "battery",
        "charger_holder",
        "charger",
        "fuse_zone",
        "subplate",
        "sensor",
    )
    styles = {
        "pcb_envelope": ("#87b996", "#23633c", 0.16),
        "pcb": ("#1f7a45", "#124c2c", 0.90),
        "battery_tray": ("#637083", "#303846", 0.52),
        "battery": ("#303844", "#111827", 0.94),
        "charger_holder": ("#7a8595", "#354154", 0.55),
        "charger": ("#2e75bd", "#174f87", 0.92),
        "fuse_zone": ("#f2d45c", "#7b6300", 0.78),
        "subplate": ("#c4cad2", "#626d7b", 0.96),
        "sensor": ("#ef8f32", "#9a4d08", 0.94),
    }
    for key in draw_order:
        item = item_by_key[key]
        fill, stroke, opacity = styles[key]
        rectangle(
            geometry,
            item.center_x_mm,
            item.center_y_mm,
            item.size_x_mm,
            item.size_y_mm,
            fill=fill,
            fill_opacity=opacity,
            stroke=stroke,
            stroke_width="4",
        )

    routes_group = element(root, "g")
    for route in ROUTES:
        color = "#{:02x}{:02x}{:02x}".format(
            *(round(channel * 255) for channel in route.color_rgb)
        )
        points = " ".join(
            f"{x:.2f},{y:.2f}" for x, y in (point(x_mm, y_mm) for x_mm, y_mm in route.points_xy_mm)
        )
        element(
            routes_group,
            "polyline",
            points=points,
            fill="none",
            stroke=color,
            stroke_width=f"{route.width_mm * scale:.2f}",
            stroke_linecap="round",
            stroke_linejoin="round",
            opacity="0.90",
        )

    route_label_positions = {
        "W1": (132.0, -67.0),
        "W2": (67.0, -20.0),
        "W3": (50.0, -44.0),
        "W4": (-1.0, -62.0),
        "W5": (3.0, 62.0),
        "W6": (4.0, 18.0),
        "W7": (-122.0, -92.0),
        "W8": (-102.0, -103.0),
    }
    for route in ROUTES:
        x, y = point(*route_label_positions[route.wire_id])
        element(root, "rect", x=x - 23, y=y - 18, width=46, height=30, rx=4, fill="#ffffff", stroke="#172033", stroke_width=2)
        text_node(root, route.wire_id, x, y + 5, 18, 700, "#172033", "middle")

    ports_group = element(root, "g")
    lower_wall_y = -ENC_OUTER_Y_MM / 2.0
    for port in PORTS:
        x, y = point(port.x_mm, lower_wall_y)
        radius_px = max(10.0, port.cutout_diameter_mm * scale / 2.0)
        element(ports_group, "circle", cx=x, cy=y, r=radius_px, fill="#ffffff", stroke="#111827", stroke_width=4)
        text_node(root, port.port_id, x, y + radius_px + 24, 18, 700, "#111827", "middle")

    marker_positions = {
        "pcb": (-118.0, 71.0, "1"),
        "battery": (116.0, -76.0, "2"),
        "charger": (116.0, -9.0, "3"),
        "sensor": (105.0, 60.0, "4"),
        "fuse_zone": (28.0, -55.0, "5"),
    }
    for key, (x_mm, y_mm, label) in marker_positions.items():
        x, y = point(x_mm, y_mm)
        element(root, "circle", cx=f"{x:.2f}", cy=f"{y:.2f}", r="24", fill="#ffffff", stroke="#172033", stroke_width="4")
        text_node(root, label, x, y + 10, 28, 700, "#172033", "middle")

    holes_group = element(root, "g")
    for index, (x_mm, y_mm) in enumerate(ANCHOR_HOLES_XY_MM, start=1):
        x, y = point(x_mm, y_mm)
        element(holes_group, "circle", cx=f"{x:.2f}", cy=f"{y:.2f}", r="14", fill="#ffffff", stroke="#d92d20", stroke_width="5")
        text_node(root, f"H{index}", x + 19, y - 13, 18, 700, "#b42318")

    pcb = item_by_key["pcb"]
    for x_offset, y_offset in PCB_HOLES_XY_MM:
        x, y = point(pcb.center_x_mm + x_offset, pcb.center_y_mm + y_offset)
        element(holes_group, "circle", cx=f"{x:.2f}", cy=f"{y:.2f}", r="8", fill="#ffffff", stroke="#102a1c", stroke_width="4")

    plate_left, plate_top = point(-PLATE_X_MM / 2.0, PLATE_Y_MM / 2.0)
    plate_right, plate_bottom = point(PLATE_X_MM / 2.0, -PLATE_Y_MM / 2.0)
    dimension_y = plate_bottom + 82.0
    element(root, "line", x1=plate_left, y1=plate_bottom, x2=plate_left, y2=dimension_y + 15, stroke="#3f4b5f", stroke_width="3")
    element(root, "line", x1=plate_right, y1=plate_bottom, x2=plate_right, y2=dimension_y + 15, stroke="#3f4b5f", stroke_width="3")
    element(root, "line", x1=plate_left, y1=dimension_y, x2=plate_right, y2=dimension_y, stroke="#3f4b5f", stroke_width="3", marker_start="url(#arrow)", marker_end="url(#arrow)")
    text_node(root, "FR4 272 mm | 厚 5 mm", (plate_left + plate_right) / 2.0, dimension_y - 14, 27, 700, "#263241", "middle")

    dimension_x = plate_left - 72.0
    element(root, "line", x1=plate_left, y1=plate_top, x2=dimension_x - 15, y2=plate_top, stroke="#3f4b5f", stroke_width="3")
    element(root, "line", x1=plate_left, y1=plate_bottom, x2=dimension_x - 15, y2=plate_bottom, stroke="#3f4b5f", stroke_width="3")
    element(root, "line", x1=dimension_x, y1=plate_top, x2=dimension_x, y2=plate_bottom, stroke="#3f4b5f", stroke_width="3", marker_start="url(#arrow)", marker_end="url(#arrow)")
    label = text_node(root, "193 mm", dimension_x - 20, (plate_top + plate_bottom) / 2.0, 27, 700, "#263241", "middle")
    label.set("transform", f"rotate(-90 {dimension_x - 20:.2f} {(plate_top + plate_bottom) / 2.0:.2f})")

    datum_x, datum_y = point(-PLATE_X_MM / 2.0 + 14.0, -PLATE_Y_MM / 2.0 + 14.0)
    element(root, "circle", cx=datum_x, cy=datum_y, r="8", fill="#b42318")
    element(root, "line", x1=datum_x, y1=datum_y, x2=datum_x + 80, y2=datum_y, stroke="#b42318", stroke_width="4", marker_end="url(#arrow)")
    element(root, "line", x1=datum_x, y1=datum_y, x2=datum_x, y2=datum_y - 80, stroke="#b42318", stroke_width="4", marker_end="url(#arrow)")
    text_node(root, "+X", datum_x + 88, datum_y + 9, 22, 700, "#b42318")
    text_node(root, "+Y", datum_x - 12, datum_y - 94, 22, 700, "#b42318")
    text_node(root, "layout datum", datum_x + 18, datum_y - 18, 20, 400, "#b42318")

    x_left = point(-ANCHOR_COLUMN_PITCH_MM / 2.0, 0.0)[0]
    x_right = point(ANCHOR_COLUMN_PITCH_MM / 2.0, 0.0)[0]
    dim_anchor_y = point(0.0, 93.0)[1]
    element(root, "line", x1=x_left, y1=dim_anchor_y, x2=x_right, y2=dim_anchor_y, stroke="#b42318", stroke_width="3", marker_start="url(#arrow)", marker_end="url(#arrow)")
    text_node(root, "120.3 mm", (x_left + x_right) / 2.0, dim_anchor_y - 10, 22, 700, "#b42318", "middle")

    outer_top = point(0.0, 80.0)[1]
    outer_bottom = point(0.0, -80.0)[1]
    dim_anchor_x = point(145.0, 0.0)[0]
    element(root, "line", x1=dim_anchor_x, y1=outer_top, x2=dim_anchor_x, y2=outer_bottom, stroke="#b42318", stroke_width="3", marker_start="url(#arrow)", marker_end="url(#arrow)")
    outer_label = text_node(root, "160 mm", dim_anchor_x + 25, (outer_top + outer_bottom) / 2.0, 21, 700, "#b42318", "middle")
    outer_label.set("transform", f"rotate(-90 {dim_anchor_x + 25:.2f} {(outer_top + outer_bottom) / 2.0:.2f})")

    inner_top = point(0.0, 30.6)[1]
    inner_bottom = point(0.0, -30.6)[1]
    dim_inner_x = point(137.0, 0.0)[0]
    element(root, "line", x1=dim_inner_x, y1=inner_top, x2=dim_inner_x, y2=inner_bottom, stroke="#b42318", stroke_width="3", marker_start="url(#arrow)", marker_end="url(#arrow)")
    inner_label = text_node(root, "61.2 mm", dim_inner_x - 15, (inner_top + inner_bottom) / 2.0, 19, 700, "#b42318", "middle")
    inner_label.set("transform", f"rotate(-90 {dim_inner_x - 15:.2f} {(inner_top + inner_bottom) / 2.0:.2f})")

    # Interface labels follow the user's physical board orientation after CCW rotation.
    text_node(root, "GNSS", point(-131.0, -75.0)[0] - 7, point(-131.0, -75.0)[1] + 7, 18, 700, "#7b5600", "end")
    text_node(root, "XLS1 RF", point(-131.0, 0.0)[0] - 7, point(-131.0, 0.0)[1] + 7, 18, 700, "#006879", "end")
    text_node(root, "DC5521", point(-15.5, -75.0)[0] - 8, point(-15.5, -75.0)[1] + 24, 18, 700, "#7a271a", "end")
    text_node(root, "2 x RS485", point(-15.5, 58.0)[0] - 8, point(-15.5, 58.0)[1] - 10, 18, 700, "#344054", "end")

    legend_x = 1510.0
    text_node(root, "布局说明", legend_x, 160, 31, 700)
    legend = [
        ("1  载板组件", "PCB 115 x 170；安装总高包络 35 mm；4 x Ø3.2"),
        ("2  电池与托盘", "电池 66 x 61 x 40 mm；出线朝箱体中心"),
        ("3  CN3791与夹持座", "46 x 21 x 10 mm；两短边均有接口；模块无安装孔"),
        ("4  倾角变送器", "90 x 58 x 36 mm；安装于 120 x 85 x 3 mm 局部钢板"),
        ("5  保险/维护断开区", "位于电池负载输出与PCB DC5521之间"),
        ("H1-H8", "FR4固定到箱体：8 x Ø3.5；坐标仍需实物复核"),
    ]
    legend_y = 210.0
    for heading, detail in legend:
        text_node(root, heading, legend_x, legend_y, 27, 700)
        text_node(root, detail, legend_x, legend_y + 34, 21, 400, "#455468")
        legend_y += 91.0

    text_node(root, "线束编号", legend_x, 790, 29, 700)
    for index, route in enumerate(ROUTES):
        column_x = legend_x if index < 4 else 2140.0
        row = index if index < 4 else index - 4
        y = 835.0 + row * 72.0
        text_node(root, f"{route.wire_id}  {route.purpose}", column_x, y, 22, 700)
        text_node(root, route.endpoints, column_x, y + 29, 18, 400, "#455468")

    text_node(root, "箱壁开孔（箱体下侧壁）", legend_x, 1150, 29, 700)
    for index, port in enumerate(PORTS):
        column_x = legend_x if index < 2 else 2140.0
        row = index if index < 2 else index - 2
        y = 1193.0 + row * 60.0
        text_node(root, f"{port.port_id}  {port.purpose}  Ø{port.cutout_diameter_mm:g}", column_x, y, 21, 700)
        text_node(root, port.hardware, column_x, y + 27, 18, 400, "#455468")

    text_node(root, "制造前必须确认", legend_x, 1350, 29, 700, "#b42318")
    text_node(root, "实测 H1-H8、四个接口件螺纹/开孔、线缆外径和最小弯曲半径。", legend_x, 1393, 22, 400, "#7a271a")
    text_node(root, "先用 272 x 193 x 5 mm 模板试装；CAD-R0.5 不放行 FR4 或箱体加工图。", legend_x, 1429, 22, 700, "#7a271a")
    text_node(root, "8孔固定后检查板面翘曲；四个边缘承托垫只承托、不新增箱体孔。", legend_x, 1465, 22, 400, "#7a271a")

    text_node(root, "箱体内包络名义值 276.0655 x 197 mm；实际弧槽、筋位和接口件防转平面仍需实测。", 80, 1690, 23, 400, "#455468")
    text_node(root, "G1/G2 是防水格兰头；RF1/RF2 是独立 SMA 穿板座，不能用普通格兰头代替。", 80, 1730, 23, 400, "#455468")

    svg_path = output_dir / f"{ASSEMBLY_NAME}_labeled-top.svg"
    png_path = output_dir / f"{ASSEMBLY_NAME}_labeled-top.png"
    ET.ElementTree(root).write(svg_path, encoding="utf-8", xml_declaration=True)

    magick = shutil.which("magick")
    if magick is None:
        raise RuntimeError("ImageMagick 'magick' is required to rasterize the labeled SVG")
    subprocess.run(
        [magick, "-background", "white", str(svg_path), str(png_path)],
        check=True,
        capture_output=True,
        text=True,
    )
    if not png_path.exists() or png_path.stat().st_size == 0:
        raise RuntimeError("ImageMagick did not create the labeled top-view PNG")
    return {
        "svg": svg_path.name,
        "png": png_path.name,
        "canvas_px": [width, height],
        "geometry_scale_px_per_mm": scale,
    }


def create_harness_diagram(output_dir: Path) -> dict[str, Any]:
    """Create a readable connectivity drawing separate from the 3D route envelopes."""

    width = 2600
    height = 1600
    svg_ns = "http://www.w3.org/2000/svg"
    ET.register_namespace("", svg_ns)

    def element(parent: Any, tag: str, **attributes: Any) -> Any:
        return ET.SubElement(
            parent,
            f"{{{svg_ns}}}{tag}",
            {key.replace("_", "-"): str(value) for key, value in attributes.items()},
        )

    def text_node(
        parent: Any,
        value: str,
        x: float,
        y: float,
        size: int = 26,
        weight: int = 400,
        color: str = "#172033",
        anchor: str = "start",
    ) -> Any:
        node = element(
            parent,
            "text",
            x=x,
            y=y,
            font_family="Microsoft YaHei, Arial, sans-serif",
            font_size=size,
            font_weight=weight,
            fill=color,
            text_anchor=anchor,
        )
        node.text = value
        return node

    def box(x: float, y: float, w: float, h: float, title: str, detail: str, fill: str) -> None:
        element(root, "rect", x=x, y=y, width=w, height=h, rx=6, fill=fill, stroke="#263241", stroke_width=3)
        text_node(root, title, x + w / 2.0, y + 45, 27, 700, "#172033", "middle")
        text_node(root, detail, x + w / 2.0, y + 82, 19, 400, "#455468", "middle")

    def arrow(x1: float, y1: float, x2: float, y2: float, wire_id: str, label: str, color: str) -> None:
        element(root, "line", x1=x1, y1=y1, x2=x2, y2=y2, stroke=color, stroke_width=10, marker_end="url(#arrow)")
        mid_x = (x1 + x2) / 2.0
        mid_y = (y1 + y2) / 2.0
        element(root, "rect", x=mid_x - 41, y=mid_y - 28, width=82, height=35, rx=4, fill="#ffffff", stroke=color, stroke_width=2)
        text_node(root, wire_id, mid_x, mid_y - 3, 20, 700, color, "middle")

    root = ET.Element(f"{{{svg_ns}}}svg", {"width": str(width), "height": str(height), "viewBox": f"0 0 {width} {height}"})
    defs = element(root, "defs")
    marker = element(defs, "marker", id="arrow", markerWidth=10, markerHeight=10, refX=8, refY=5, orient="auto")
    element(marker, "path", d="M 0 0 L 10 5 L 0 10 z", fill="#263241")
    element(root, "rect", x=0, y=0, width=width, height=height, fill="#ffffff")
    text_node(root, "FN-ASM-003 线束连接图", 80, 70, 44, 700)
    text_node(root, "CAD-R0.5 | W1-W8 与箱壁接口一一对应 | 仅供装配评审", 80, 116, 25, 700, "#b42318")

    # Power chain
    text_node(root, "电源链路", 80, 205, 31, 700)
    box(80, 245, 280, 105, "太阳能板", "箱外，先做滴水弯", "#fff4cc")
    box(440, 245, 220, 105, "G1", "M16格兰头", "#edf2f7")
    box(750, 245, 300, 105, "CN3791", "PV IN / BAT OUT", "#d9ebff")
    box(1170, 245, 300, 105, "电池充电口", "防反插插头", "#ffe2e0")
    arrow(360, 298, 440, 298, "W1", "2芯PV线", "#e58a00")
    arrow(660, 298, 750, 298, "W1", "2芯PV线", "#e58a00")
    arrow(1050, 298, 1170, 298, "W2", "2芯充电线", "#c62828")

    box(80, 440, 310, 105, "电池负载输出", "与充电口分支定义待确认", "#ffe2e0")
    box(520, 440, 310, 105, "保险 + 维护断开", "靠近电池正极", "#fff4cc")
    box(980, 440, 340, 105, "PCB DC5521", "载板电源输入", "#dff1e4")
    arrow(390, 493, 520, 493, "W3", "2芯负载线", "#9f1239")
    arrow(830, 493, 980, 493, "W4", "2芯受保护电源", "#9f1239")

    # RS485 chain
    text_node(root, "RS485 链路", 80, 675, 31, 700)
    box(80, 715, 310, 105, "倾角变送器", "安装在箱内局部钢板", "#ffe3c2")
    box(980, 715, 340, 105, "PCB RS485-1", "V+ / GND / A / B", "#dff1e4")
    arrow(390, 768, 980, 768, "W5", "箱内4芯屏蔽线", "#7b3fb2")

    box(80, 885, 310, 105, "土壤传感器", "箱外", "#d7e8ff")
    box(500, 885, 220, 105, "G2", "M16格兰头", "#edf2f7")
    box(980, 885, 340, 105, "PCB RS485-2", "V+ / GND / A / B", "#dff1e4")
    arrow(390, 938, 500, 938, "W6", "4芯屏蔽线", "#1559a6")
    arrow(720, 938, 980, 938, "W6", "4芯屏蔽线", "#1559a6")

    # RF chain
    text_node(root, "射频链路", 80, 1120, 31, 700)
    box(80, 1160, 310, 105, "BT-760 GNSS天线", "TNC-K，箱外侧翼", "#fff4cc")
    box(500, 1160, 220, 105, "RF1", "SMA穿板座", "#edf2f7")
    box(980, 1160, 340, 105, "PCB GNSS接口", "50 ohm / 非RP-SMA", "#dff1e4")
    arrow(390, 1213, 500, 1213, "W7", "TNC-SMA馈线", "#9a6700")
    arrow(720, 1213, 980, 1213, "W7", "箱内同轴", "#9a6700")

    box(80, 1330, 310, 105, "XLS1外置天线", "接口型号待样品确认", "#d5f5f2")
    box(500, 1330, 220, 105, "RF2", "SMA穿板座", "#edf2f7")
    box(980, 1330, 340, 105, "PCB XLS1接口", "50 ohm / 非RP-SMA", "#dff1e4")
    arrow(390, 1383, 500, 1383, "W8", "箱外同轴", "#008b9b")
    arrow(720, 1383, 980, 1383, "W8", "箱内同轴", "#008b9b")

    # Review notes
    element(root, "rect", x=1530, y=220, width=980, height=1190, rx=6, fill="#f7f9fb", stroke="#6b7788", stroke_width=3)
    text_node(root, "怎么读这张图", 1590, 285, 32, 700)
    notes = [
        "1. W编号是整条线束，不是单根导线。",
        "2. G1/G2负责防水和抗拉，不承担电连接。",
        "3. RF1/RF2是射频连接器，不能换成普通格兰头。",
        "4. W3必须先经过保险/维护断开，再进入PCB。",
        "5. RS485每路至少四芯：电源正、地、A、B。",
        "6. GNSS与XLS1各走独立50 ohm同轴，不与电源共束。",
    ]
    for index, note in enumerate(notes):
        text_node(root, note, 1590, 350 + index * 58, 23, 400, "#344054")
    text_node(root, "制造前未冻结项", 1590, 760, 30, 700, "#b42318")
    blocked = [
        "G1/G2：根据实测电缆外径选择M12/M16及夹紧范围。",
        "RF1/RF2：根据到货穿板座确认螺纹、扳手位与最终孔径。",
        "W1-W6：确认额定电流、线规、颜色和端子型号。",
        "W7/W8：确认接头公母、非RP-SMA、最小弯曲半径。",
        "所有箱外连接完成后执行淋雨、拉力和通断测试。",
    ]
    for index, note in enumerate(blocked):
        text_node(root, note, 1590, 825 + index * 58, 22, 400, "#7a271a")
    text_node(root, "注意：本图是连接关系与布线路径图，不替代电气原理图。", 1590, 1250, 23, 700, "#7a271a")
    text_node(root, "极性、保险额定值和CN3791端子定义必须按实物丝印/手册核对。", 1590, 1290, 23, 700, "#7a271a")

    svg_path = output_dir / f"{ASSEMBLY_NAME}_harness-diagram.zh-CN.svg"
    png_path = output_dir / f"{ASSEMBLY_NAME}_harness-diagram.zh-CN.png"
    ET.ElementTree(root).write(svg_path, encoding="utf-8", xml_declaration=True)
    magick = shutil.which("magick")
    if magick is None:
        raise RuntimeError("ImageMagick 'magick' is required to rasterize the harness SVG")
    subprocess.run([magick, "-background", "white", str(svg_path), str(png_path)], check=True, capture_output=True, text=True)
    return {"svg": svg_path.name, "png": png_path.name, "canvas_px": [width, height]}


def package_reference_part(source: Path, output_dir: Path) -> tuple[Path, dict[str, Any]]:
    if not source.exists():
        raise RuntimeError(f"Missing packaged assembly reference: {source}")
    destination = output_dir / source.name
    shutil.copy2(source, destination)
    return destination, {
        "source_revision": source.parent.name,
        "source_name": source.name,
        "packaged_name": destination.name,
        "source_sha256": sha256(source),
    }


async def build_tray(session: ClientSession, output_dir: Path) -> dict[str, Any]:
    outer_half_x = ENC_OUTER_X_MM / 2.0
    outer_half_y = ENC_OUTER_Y_MM / 2.0
    inner_half_x = ENC_INNER_X_MM / 2.0
    inner_half_y = ENC_INNER_Y_MM / 2.0
    await call(session, "create_part", {"input_data": {"name": TRAY_NAME, "units": "mm"}})

    await call(session, "create_sketch", {"input_data": {"plane": "Top", "sketch_name": "FloorSketch"}})
    await call(
        session,
        "add_rectangle",
        {"input_data": {"x1": -outer_half_x, "y1": -outer_half_y, "x2": outer_half_x, "y2": outer_half_y}},
    )
    await call(session, "exit_sketch", {})
    await call(
        session,
        "create_extrusion",
        {"input_data": {"sketch_name": "FloorSketch", "depth": ENC_FLOOR_MM, "direction": "blind"}},
    )

    await call(session, "create_sketch", {"input_data": {"plane": "Top", "sketch_name": "WallRingSketch"}})
    await call(
        session,
        "add_rectangle",
        {"input_data": {"x1": -outer_half_x, "y1": -outer_half_y, "x2": outer_half_x, "y2": outer_half_y}},
    )
    await call(
        session,
        "add_rectangle",
        {"input_data": {"x1": -inner_half_x, "y1": -inner_half_y, "x2": inner_half_x, "y2": inner_half_y}},
    )
    await call(session, "exit_sketch", {})
    await call(
        session,
        "create_extrusion",
        {"input_data": {"sketch_name": "WallRingSketch", "depth": ENC_BOTTOM_DEPTH_MM, "direction": "blind"}},
    )

    # All external entries face downward in service orientation.  The nominal
    # Front plane is the enclosure lower side; each circle is X versus Z.
    await call(
        session,
        "create_sketch",
        {"input_data": {"plane": "Front", "sketch_name": "LowerWallPortCutouts"}},
    )
    for port in PORTS:
        await call(
            session,
            "add_circle",
            {
                "input_data": {
                    "center_x": port.x_mm,
                    "center_y": port.z_mm,
                    "radius": port.cutout_diameter_mm / 2.0,
                }
            },
        )
    await call(session, "exit_sketch", {})
    cut_last_profile_through_all(ENC_OUTER_Y_MM / 2.0 + 5.0)

    mass_result = await call(session, "get_mass_properties", {"input_data": {"units": "metric"}})
    actual_volume = float(mass_result["mass_properties"]["volume"]["value"])
    ring_area = ENC_OUTER_X_MM * ENC_OUTER_Y_MM - ENC_INNER_X_MM * ENC_INNER_Y_MM
    nominal_wall_thickness = (ENC_OUTER_Y_MM - ENC_INNER_Y_MM) / 2.0
    port_cut_volume = sum(
        math.pi * (port.cutout_diameter_mm / 2.0) ** 2 * nominal_wall_thickness
        for port in PORTS
    )
    expected_volume = (
        ENC_INNER_X_MM * ENC_INNER_Y_MM * ENC_FLOOR_MM
        + ring_area * ENC_BOTTOM_DEPTH_MM
        - port_cut_volume
    )
    if not math.isclose(actual_volume, expected_volume, rel_tol=0.0, abs_tol=1.0):
        raise RuntimeError(
            f"{TRAY_NAME}: volume mismatch, expected {expected_volume:.3f}, got {actual_volume:.3f} mm3"
        )

    native = output_dir / f"{TRAY_NAME}.SLDPRT"
    step = output_dir / f"{TRAY_NAME}.STEP"
    preview = output_dir / f"{TRAY_NAME}.png"
    await call(session, "save_as", {"input_data": {"file_path": str(native), "format_type": "solidworks", "overwrite": True}})
    await call(session, "export_step", {"input_data": {"file_path": str(step), "format_type": "step"}})
    await call(
        session,
        "export_image",
        {"input_data": {"file_path": str(preview), "format_type": "png", "width": 1600, "height": 1000, "view_orientation": "isometric"}},
    )
    await safe_close_model(session)
    normalize_step_line_endings(step)
    return {
        "part": TRAY_NAME,
        "status": "NOMINAL_LAYOUT_REFERENCE_WITH_4_LOWER_WALL_PORTS",
        "expected_volume_mm3": round(expected_volume, 3),
        "actual_volume_mm3": round(actual_volume, 3),
        "ports": [
            {
                "id": port.port_id,
                "purpose": port.purpose,
                "center_xz_mm": [port.x_mm, port.z_mm],
                "cutout_diameter_mm": port.cutout_diameter_mm,
                "hardware": port.hardware,
                "status": port.status,
            }
            for port in PORTS
        ],
    }


def set_component_appearance(component: Any, item: Placement) -> None:
    try:
        values = win32com.client.VARIANT(
            pythoncom.VT_ARRAY | pythoncom.VT_R8,
            appearance(item.color_rgb, item.transparency),
        )
        component.SetMaterialPropertyValues2(values, 1, None)
    except Exception:
        pass


def add_component(assembly: Any, item: Placement, exploded_z_mm: float = 0.0) -> Any:
    vertical_center_mm = item.bottom_z_mm + exploded_z_mm + item.size_z_mm / 2.0
    component = assembly.AddComponent5(
        str(item.path),
        0,
        "",
        False,
        "",
        item.center_x_mm / 1000.0,
        vertical_center_mm / 1000.0,
        item.center_y_mm / 1000.0,
    )
    if component is None:
        raise RuntimeError(f"Failed to insert component: {item.path}")
    try:
        component.Name2 = item.instance
    except Exception:
        pass
    set_component_appearance(component, item)
    return component


def validate_component_transforms(
    components: list[Any], placements: list[Placement]
) -> None:
    for component, item in zip(components, placements, strict=True):
        transform = component.Transform2
        values = tuple(float(value) for value in transform.ArrayData)
        actual_mm = tuple(values[index] * 1000.0 for index in (9, 10, 11))
        expected_mm = (item.center_x_mm, item.bottom_z_mm, item.center_y_mm)
        if any(
            not math.isclose(actual, expected, rel_tol=0.0, abs_tol=0.1)
            for actual, expected in zip(actual_mm, expected_mm, strict=True)
        ):
            raise RuntimeError(
                f"Component transform mismatch for {item.key}: "
                f"expected XYZ translation {expected_mm}, got {actual_mm} mm"
            )


def show_view(model: Any, english: str, localized: str) -> None:
    name = standard_view_name(model, english, localized)
    model.ShowNamedView2(name, -1)
    try:
        model.ViewDisplayShaded()
    except Exception:
        pass
    model.ViewZoomtofit2()
    model.ForceRebuild3(False)


def new_assembly(app: Any) -> Any:
    if not ASSEMBLY_TEMPLATE.exists():
        raise RuntimeError(f"Assembly template does not exist: {ASSEMBLY_TEMPLATE}")
    model = app.NewDocument(str(ASSEMBLY_TEMPLATE), 0, 0, 0)
    if model is None:
        raise RuntimeError("SolidWorks failed to create a new assembly")
    return model


def preload_component_documents(app: Any, placements: list[Placement]) -> list[str]:
    opened_titles: list[str] = []
    opened_paths: set[Path] = set()
    for title in (
        "FN-ASM-001_internal-layout_R0.3.SLDASM",
        "FN-ASM-001_internal-layout_R0.3",
        "FN-ASM-002_internal-layout-harness_R0.4.SLDASM",
        "FN-ASM-002_internal-layout-harness_R0.4",
    ):
        try:
            app.CloseDoc(title)
        except Exception:
            pass
    for item in placements:
        if item.path in opened_paths:
            continue
        # SW2022 identifies open documents primarily by title. A historical
        # packaged part with the same filename can block the current revision.
        try:
            app.CloseDoc(item.path.name)
        except Exception:
            pass
        errors = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        warnings = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        document = app.OpenDoc6(str(item.path), 1, 3, "", errors, warnings)
        if document is None:
            raise RuntimeError(
                f"Failed to preload component: {item.path}; "
                f"errors={errors.value}, warnings={warnings.value}"
            )
        opened_titles.append(str(com_value(document, "GetTitle")))
        opened_paths.add(item.path)
    return opened_titles


def close_preloaded_documents(app: Any, titles: list[str]) -> None:
    for title in reversed(titles):
        try:
            app.CloseDoc(title)
        except Exception:
            pass


def create_assembly(
    placements: list[Placement], output_dir: Path
) -> tuple[dict[str, Any], Path]:
    pythoncom.CoInitialize()
    app = None
    model = None
    preloaded_titles: list[str] = []
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        app.Visible = True
        preloaded_titles = preload_component_documents(app, placements)
        model = new_assembly(app)
        inserted_components: list[Any] = []
        for item in placements:
            inserted_components.append(add_component(model, item))
        validate_component_transforms(inserted_components, placements)

        set_custom_property(model, "AssemblyNumber", "FN-ASM-003")
        set_custom_property(model, "Revision", REVISION)
        set_custom_property(model, "ManufacturingStatus", "LAYOUT REVIEW ONLY")
        set_custom_property(model, "FR4", "272 x 193 x 5 mm; 8 x dia 3.5 nominal holes")
        set_custom_property(model, "SupportDatum", "Eight nominal coplanar tops Z=6 mm above inner floor")
        set_custom_property(model, "EnclosurePorts", "RF1/RF2 dia 6.5 SMA; G1/G2 dia 16.5 M16; NOMINAL VERIFY SAMPLE")
        set_custom_property(model, "HarnessStatus", "W1-W8 CONNECTIVITY DEFINED; CABLE OD/CONNECTORS PENDING")

        model.ForceRebuild3(False)
        component_count = len(tuple(model.GetComponents(False) or ()))
        if component_count != len(placements):
            raise RuntimeError(f"Assembly component count mismatch: {component_count} != {len(placements)}")

        assembly_path = output_dir / f"{ASSEMBLY_NAME}.SLDASM"
        step_path = output_dir / f"{ASSEMBLY_NAME}.STEP"
        iso_path = output_dir / f"{ASSEMBLY_NAME}_isometric.png"
        top_path = output_dir / f"{ASSEMBLY_NAME}_top.png"
        save_document(model, assembly_path)
        save_document(model, step_path)
        normalize_step_line_endings(step_path)

        show_view(model, "*Isometric", "*等轴测")
        save_document(model, iso_path)
        show_view(model, "*Top", "*上视")
        save_document(model, top_path)

        title = str(com_value(model, "GetTitle"))
        app.CloseDoc(title)
        model = None
        close_preloaded_documents(app, preloaded_titles)
        preloaded_titles = []
        return (
            {
                "name": ASSEMBLY_NAME,
                "component_count": component_count,
                "native_bytes": assembly_path.stat().st_size,
                "step_bytes": step_path.stat().st_size,
                "isometric_preview_bytes": iso_path.stat().st_size,
                "top_preview_bytes": top_path.stat().st_size,
            },
            assembly_path,
        )
    finally:
        if app is not None and model is not None:
            try:
                app.CloseDoc(str(com_value(model, "GetTitle")))
            except Exception:
                pass
        if app is not None:
            close_preloaded_documents(app, preloaded_titles)
        pythoncom.CoUninitialize()


def create_exploded_preview(placements: list[Placement], output_dir: Path) -> Path:
    pythoncom.CoInitialize()
    app = None
    model = None
    preloaded_titles: list[str] = []
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        app.Visible = True
        preloaded_titles = preload_component_documents(app, placements)
        model = new_assembly(app)
        offsets = {
            "tray": 0.0,
            "edge_pad_1": 52.0,
            "edge_pad_2": 52.0,
            "edge_pad_3": 52.0,
            "edge_pad_4": 52.0,
            "plate": 105.0,
            "battery_tray": 116.0,
            "charger_holder": 116.0,
            "fuse_zone": 116.0,
            "pcb": 125.0,
            "pcb_envelope": 155.0,
            "battery": 145.0,
            "charger": 135.0,
            "subplate": 132.0,
            "sensor": 178.0,
        }
        for item in placements:
            add_component(model, item, offsets.get(item.key, 165.0))
        show_view(model, "*Isometric", "*等轴测")
        preview = output_dir / f"{ASSEMBLY_NAME}_exploded-reference.png"
        save_document(model, preview)
        title = str(com_value(model, "GetTitle"))
        app.CloseDoc(title)
        model = None
        close_preloaded_documents(app, preloaded_titles)
        preloaded_titles = []
        return preview
    finally:
        if app is not None and model is not None:
            try:
                app.CloseDoc(str(com_value(model, "GetTitle")))
            except Exception:
                pass
        if app is not None:
            close_preloaded_documents(app, preloaded_titles)
        pythoncom.CoUninitialize()


def create_assembly_drawing(
    assembly_path: Path, output_dir: Path, drawing_template: Path
) -> dict[str, Any]:
    pythoncom.CoInitialize()
    app = None
    assembly_model = None
    drawing_model = None
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        app.Visible = True
        errors = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        warnings = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        assembly_model = app.OpenDoc6(str(assembly_path), 2, 3, "", errors, warnings)
        if assembly_model is None:
            raise RuntimeError(f"Failed to open assembly for drawing: {assembly_path}")

        drawing_model = app.NewDocument(str(drawing_template), 12, 0.420, 0.297)
        if drawing_model is None:
            raise RuntimeError("Failed to create A3 assembly drawing")
        top_name = standard_view_name(assembly_model, "*Top", "*上视")
        iso_name = standard_view_name(assembly_model, "*Isometric", "*等轴测")
        top_view = drawing_model.CreateDrawViewFromModelView3(
            str(assembly_path), top_name, 0.125, 0.165, 0.0
        )
        iso_view = drawing_model.CreateDrawViewFromModelView3(
            str(assembly_path), iso_name, 0.325, 0.165, 0.0
        )
        if top_view is None or iso_view is None:
            raise RuntimeError("Failed to create assembly drawing views")
        top_view.ScaleDecimal = 0.55
        iso_view.ScaleDecimal = 0.38

        add_note(drawing_model, "FN-ASM-003 INTERNAL LAYOUT + PORTS + HARNESS", 0.025, 0.282, 5.0)
        add_note(drawing_model, "CAD-R0.5 | LAYOUT REVIEW ONLY | NOT FOR MANUFACTURE", 0.025, 0.271)
        add_note(drawing_model, "FR4: 272 x 193 x 5 mm | 8 x DIA 3.5 NOMINAL ANCHOR HOLES", 0.025, 0.050)
        add_note(drawing_model, "ANCHOR PITCH: X=120.3 | Y OUTER=160 | Y INNER=61.2 mm", 0.025, 0.038)
        add_note(drawing_model, "CN3791: 46 x 21 x 10 mm | NO MOUNTING HOLES | CLIP/HOLDER REQUIRED", 0.025, 0.026)
        add_note(drawing_model, "BATTERY: 66 x 61 x 40 mm | USER MEASURED WITH ALLOWANCE", 0.025, 0.014)
        add_note(drawing_model, "PCB: 4 x DIA 3.2 AT 163 x 108 mm | 35 mm INSTALLED HEIGHT ENVELOPE", 0.225, 0.050)
        add_note(drawing_model, "LOWER WALL: RF1/RF2 DIA 6.5 SMA + G1/G2 DIA 16.5 M16; VERIFY SAMPLES", 0.225, 0.038)
        add_note(drawing_model, "W1-W8 SEE HARNESS DIAGRAM; NO FR4/ENCLOSURE DXF UNTIL PHYSICAL VERIFICATION", 0.225, 0.026)

        drawing_model.ViewZoomtofit2()
        drawing_model.ForceRebuild3(False)
        drawing_path = output_dir / f"{ASSEMBLY_NAME}.SLDDRW"
        pdf_path = output_dir / f"{ASSEMBLY_NAME}.pdf"
        png_path = output_dir / f"{ASSEMBLY_NAME}_drawing.png"
        save_document(drawing_model, drawing_path)
        save_document(drawing_model, pdf_path)
        save_document(drawing_model, png_path)

        drawing_title = str(com_value(drawing_model, "GetTitle"))
        assembly_title = str(com_value(assembly_model, "GetTitle"))
        app.CloseDoc(drawing_title)
        app.CloseDoc(assembly_title)
        drawing_model = None
        assembly_model = None
        return {
            "drawing_bytes": drawing_path.stat().st_size,
            "pdf_bytes": pdf_path.stat().st_size,
            "drawing_preview_bytes": png_path.stat().st_size,
        }
    finally:
        if app is not None:
            for document in (drawing_model, assembly_model):
                if document is None:
                    continue
                try:
                    app.CloseDoc(str(com_value(document, "GetTitle")))
                except Exception:
                    pass
        pythoncom.CoUninitialize()


async def build(
    server_script: Path,
    output_dir: Path,
    drawing_template: Path,
    cad_root: Path,
    reuse_parts: bool = False,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    close_output_documents(output_dir)
    existing_titles = document_titles()

    generated_parts: list[dict[str, Any]] = []
    specs = (
                    PartSpec(PLATE_NAME, PLATE_X_MM, PLATE_Y_MM, PLATE_Z_MM, "NOMINAL_8HOLE_VERIFY_PHYSICAL", ANCHOR_HOLES_XY_MM, ANCHOR_HOLE_DIAMETER_MM),
                    PartSpec(PCB_NAME, PCB_X_MM, PCB_Y_MM, PCB_Z_MM, "VERIFIED_XY_HOLES_NOMINAL_Z", PCB_HOLES_XY_MM, PCB_HOLE_DIAMETER_MM),
                    PartSpec(PCB_ENVELOPE_NAME, PCB_X_MM, PCB_Y_MM, PCB_INSTALLED_Z_MM, "USER_ALLOWANCE_INSTALLED_HEIGHT"),
                    PartSpec(BATTERY_NAME, BATTERY_X_MM, BATTERY_Y_MM, BATTERY_Z_MM, "USER_MEASURED_WITH_ALLOWANCE"),
                    PartSpec(BATTERY_TRAY_NAME, BATTERY_TRAY_X_MM, BATTERY_TRAY_Y_MM, BATTERY_TRAY_Z_MM, "CONCEPT_TRAY_BASE"),
                    PartSpec(CHARGER_NAME, CHARGER_X_MM, CHARGER_Y_MM, CHARGER_Z_MM, "USER_MEASURED_WITH_ALLOWANCE_NO_HOLES"),
                    PartSpec(CHARGER_HOLDER_NAME, CHARGER_HOLDER_X_MM, CHARGER_HOLDER_Y_MM, CHARGER_HOLDER_Z_MM, "CONCEPT_CLIP_BASE"),
                    PartSpec(FUSE_ZONE_NAME, FUSE_ZONE_X_MM, FUSE_ZONE_Y_MM, FUSE_ZONE_Z_MM, "REQUIRED_RESERVED_ZONE"),
                    PartSpec(EDGE_PAD_NAME, EDGE_PAD_X_MM, EDGE_PAD_Y_MM, EDGE_PAD_Z_MM, "OPTIONAL_EDGE_SUPPORT_DRAFT"),
    )
    if reuse_parts:
        required_names = [TRAY_NAME, *(spec.filename for spec in specs), *(route.name for route in ROUTES)]
        for name in required_names:
            for suffix in (".SLDPRT", ".STEP", ".png"):
                artifact = output_dir / f"{name}{suffix}"
                if not artifact.exists() or artifact.stat().st_size == 0:
                    raise RuntimeError(f"Cannot reuse missing artifact: {artifact}")
            generated_parts.append({"part": name, "status": "REUSED_FROM_VERIFIED_PART_PASS"})
    else:
        params = StdioServerParameters(
            command="powershell",
            args=["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(server_script)],
            cwd=str(server_script.parents[4]),
            env=os.environ.copy(),
        )
        try:
            async with stdio_client(params) as (read, write):
                async with ClientSession(read, write) as session:
                    await session.initialize()
                    generated_parts.append(await build_tray(session, output_dir))
                    for spec in specs:
                        generated_parts.append(await build_part(session, spec, output_dir))
                    for route in ROUTES:
                        generated_parts.append(await build_route_part(session, route, output_dir))
        finally:
            close_new_unsaved_documents(existing_titles)

    for step_path in output_dir.glob("*.STEP"):
        normalize_step_line_endings(step_path)

    plate_bottom_z = ENC_FLOOR_MM + SUPPORT_TOP_FROM_FLOOR_MM
    plate_top_z = plate_bottom_z + PLATE_Z_MM
    model_r02 = cad_root / "models" / "CAD-R0.2"
    packaged_references: list[dict[str, Any]] = []
    model_r01 = cad_root / "models" / "CAD-R0.1"
    sensor_path, packaged = package_reference_part(
        model_r01 / "FN-SEN-001_tilt-transmitter-envelope_R0.1.SLDPRT",
        output_dir,
    )
    packaged_references.append(packaged)
    subplate_path, packaged = package_reference_part(
        model_r02 / "FN-SUB-002_tilt-reference-plate_M3_R0.2.SLDPRT",
        output_dir,
    )
    packaged_references.append(packaged)
    pcb_bottom_z = plate_top_z + PCB_STANDOFF_MM
    tilt_plate_bottom_z = plate_top_z + 6.0
    placements = [
        Placement("tray", "ENCLOSURE_TRAY_REFERENCE", output_dir / f"{TRAY_NAME}.SLDPRT", 0.0, 0.0, 0.0, ENC_OUTER_X_MM, ENC_OUTER_Y_MM, ENC_BOTTOM_DEPTH_MM, "NOMINAL", (0.78, 0.82, 0.86), 0.65),
        Placement("edge_pad_1", "EDGE_SUPPORT_LEFT_UPPER", output_dir / f"{EDGE_PAD_NAME}.SLDPRT", -126.0, 45.0, ENC_FLOOR_MM, EDGE_PAD_X_MM, EDGE_PAD_Y_MM, EDGE_PAD_Z_MM, "OPTIONAL_DRAFT", (0.18, 0.18, 0.20)),
        Placement("edge_pad_2", "EDGE_SUPPORT_LEFT_LOWER", output_dir / f"{EDGE_PAD_NAME}.SLDPRT", -126.0, -45.0, ENC_FLOOR_MM, EDGE_PAD_X_MM, EDGE_PAD_Y_MM, EDGE_PAD_Z_MM, "OPTIONAL_DRAFT", (0.18, 0.18, 0.20)),
        Placement("edge_pad_3", "EDGE_SUPPORT_RIGHT_UPPER", output_dir / f"{EDGE_PAD_NAME}.SLDPRT", 126.0, 45.0, ENC_FLOOR_MM, EDGE_PAD_X_MM, EDGE_PAD_Y_MM, EDGE_PAD_Z_MM, "OPTIONAL_DRAFT", (0.18, 0.18, 0.20)),
        Placement("edge_pad_4", "EDGE_SUPPORT_RIGHT_LOWER", output_dir / f"{EDGE_PAD_NAME}.SLDPRT", 126.0, -45.0, ENC_FLOOR_MM, EDGE_PAD_X_MM, EDGE_PAD_Y_MM, EDGE_PAD_Z_MM, "OPTIONAL_DRAFT", (0.18, 0.18, 0.20)),
        Placement("plate", "FR4_RECT_8HOLE_NOMINAL", output_dir / f"{PLATE_NAME}.SLDPRT", 0.0, 0.0, plate_bottom_z, PLATE_X_MM, PLATE_Y_MM, PLATE_Z_MM, "NOMINAL_VERIFY_PHYSICAL", (0.10, 0.45, 0.22)),
        Placement("pcb", "CARRIER_BOARD_ROTATED_CCW", output_dir / f"{PCB_NAME}.SLDPRT", -73.0, 0.0, pcb_bottom_z, PCB_X_MM, PCB_Y_MM, PCB_Z_MM, "VERIFIED_XY_HOLES", (0.05, 0.38, 0.16)),
        Placement("pcb_envelope", "CARRIER_INSTALLED_HEIGHT_ENVELOPE", output_dir / f"{PCB_ENVELOPE_NAME}.SLDPRT", -73.0, 0.0, pcb_bottom_z, PCB_X_MM, PCB_Y_MM, PCB_INSTALLED_Z_MM, "USER_ALLOWANCE", (0.05, 0.38, 0.16), 0.80),
        Placement("battery_tray", "BATTERY_TRAY_CONCEPT", output_dir / f"{BATTERY_TRAY_NAME}.SLDPRT", 92.0, -62.0, plate_top_z, BATTERY_TRAY_X_MM, BATTERY_TRAY_Y_MM, BATTERY_TRAY_Z_MM, "CONCEPT", (0.35, 0.39, 0.45), 0.25),
        Placement("battery", "BATTERY_USER_MEASURED", output_dir / f"{BATTERY_NAME}.SLDPRT", 92.0, -62.0, plate_top_z + BATTERY_TRAY_Z_MM, BATTERY_X_MM, BATTERY_Y_MM, BATTERY_Z_MM, "USER_MEASURED_WITH_ALLOWANCE", (0.12, 0.14, 0.17)),
        Placement("charger_holder", "CN3791_CLIP_ZONE", output_dir / f"{CHARGER_HOLDER_NAME}.SLDPRT", 96.0, -9.0, plate_top_z, CHARGER_HOLDER_X_MM, CHARGER_HOLDER_Y_MM, CHARGER_HOLDER_Z_MM, "CONCEPT", (0.32, 0.36, 0.43), 0.25),
        Placement("charger", "CN3791_MODULE", output_dir / f"{CHARGER_NAME}.SLDPRT", 96.0, -9.0, plate_top_z + CHARGER_HOLDER_Z_MM, CHARGER_X_MM, CHARGER_Y_MM, CHARGER_Z_MM, "USER_MEASURED_WITH_ALLOWANCE_NO_HOLES", (0.10, 0.38, 0.78)),
        Placement("fuse_zone", "FUSE_SERVICE_DISCONNECT_ZONE", output_dir / f"{FUSE_ZONE_NAME}.SLDPRT", 28.0, -55.0, plate_top_z, FUSE_ZONE_X_MM, FUSE_ZONE_Y_MM, FUSE_ZONE_Z_MM, "REQUIRED_COMPONENT_SELECTION_PENDING", (0.90, 0.72, 0.08), 0.20),
        Placement("subplate", "TILT_REFERENCE_PLATE", subplate_path, 68.0, 53.0, tilt_plate_bottom_z, SUBPLATE_X_MM, SUBPLATE_Y_MM, SUBPLATE_Z_MM, "DESIGN_M3_TAPPED", (0.72, 0.75, 0.78)),
        Placement("sensor", "TILT_TRANSMITTER", sensor_path, 68.0, 53.0, tilt_plate_bottom_z + SUBPLATE_Z_MM, SENSOR_X_MM, SENSOR_Y_MM, SENSOR_Z_MM, "VERIFIED", (0.92, 0.52, 0.10)),
    ]
    route_bottom_z = plate_top_z + 4.0
    for route in ROUTES:
        x1, y1, x2, y2 = route.bounds_xy_mm
        placements.append(
            Placement(
                route.key,
                route.instance,
                output_dir / f"{route.name}.SLDPRT",
                (x1 + x2) / 2.0,
                (y1 + y2) / 2.0,
                route_bottom_z,
                x2 - x1,
                y2 - y1,
                route.height_mm,
                route.status,
                route.color_rgb,
            )
        )
    for item in placements:
        if not item.path.exists():
            raise RuntimeError(f"Missing assembly reference: {item.path}")

    validation = validate_layout(placements)
    labeled_top_result = create_labeled_top_view(placements, output_dir)
    harness_diagram_result = create_harness_diagram(output_dir)
    assembly_result, assembly_path = create_assembly(placements, output_dir)
    exploded_path = create_exploded_preview(placements, output_dir)
    drawing_result = create_assembly_drawing(assembly_path, output_dir, drawing_template)

    artifacts = sorted(path for path in output_dir.iterdir() if path.is_file())
    manifest = {
        "revision": REVISION,
        "scope": "5 mm FR4 internal layout with nominal lower-wall ports and W1-W8 harness definition",
        "manufacturing_status": "LAYOUT REVIEW ONLY / NOT FOR MANUFACTURE",
        "solidworks": "2022 SP5.0",
        "generated_parts": generated_parts,
        "packaged_reference_parts": packaged_references,
        "assembly": assembly_result,
        "drawing": drawing_result,
        "layout_validation": validation,
        "labeled_top_view": labeled_top_result,
        "harness_diagram": harness_diagram_result,
        "plate": {
            "size_mm": [PLATE_X_MM, PLATE_Y_MM, PLATE_Z_MM],
            "bottom_z_from_enclosure_outer_bottom_mm": plate_bottom_z,
            "support_top_from_inner_floor_mm": SUPPORT_TOP_FROM_FLOOR_MM,
            "anchor_holes": {
                "count": 8,
                "diameter_mm": ANCHOR_HOLE_DIAMETER_MM,
                "centered_xy_mm": ANCHOR_HOLES_XY_MM,
                "status": "NOMINAL_VERIFY_PHYSICAL_NO_DXF",
            },
        },
        "placements": [
            {
                "key": item.key,
                "instance": item.instance,
                "reference": os.path.relpath(item.path, output_dir).replace("\\", "/"),
                "center_xy_mm": [item.center_x_mm, item.center_y_mm],
                "bottom_z_mm": item.bottom_z_mm,
                "size_mm": [item.size_x_mm, item.size_y_mm, item.size_z_mm],
                "status": item.status,
            }
            for item in placements
        ],
        "enclosure_ports": [
            {
                "id": port.port_id,
                "purpose": port.purpose,
                "wall": "LOWER_FRONT",
                "center_xz_mm": [port.x_mm, port.z_mm],
                "cutout_diameter_mm": port.cutout_diameter_mm,
                "hardware": port.hardware,
                "status": port.status,
            }
            for port in PORTS
        ],
        "blocked_inputs": [
            "H1-H8 physical boss coordinates from one datum",
            "H1-H8 hole diameter, depth, blind state, and top coplanarity",
            "battery tray details and strap geometry",
            "CN3791 connector clearance and final clip geometry",
            "plate-to-FR4 four support holes",
            "G1/G2 cable outer diameters, gland thread and clamping ranges",
            "RF1/RF2 actual bulkhead thread, across-flat clearance and cutout diameters",
            "W1-W8 wire gauge, connector gender, labels and minimum bend radii",
        ],
        "warnings": [
            "The CN3791 envelope is user measured with allowance; it has no mounting holes.",
            "The battery envelope is user measured with allowance; verify with calipers before tray release.",
            "The eight FR4 holes are modeled from annotated supplier dimensions, not a physical coordinate survey.",
            "Harness parts are W1-W8 route envelopes; use the separate Chinese connectivity drawing for meaning.",
            "Four lower-wall cutouts use nominal sample values and are not released for enclosure drilling.",
            "Anchor screw heads lie below module footprints; fasten FR4 before modules and provide underside relief.",
            "The enclosure tray omits scallops, ribs, lid geometry, and fastener bosses.",
            "No FR4 or enclosure drilling DXF is generated in CAD-R0.5.",
        ],
        "harness": [
            {
                "key": route.key,
                "wire_id": route.wire_id,
                "instance": route.instance,
                "purpose": route.purpose,
                "endpoints": route.endpoints,
                "cable": route.cable,
                "points_xy_mm": route.points_xy_mm,
                "width_mm": route.width_mm,
                "height_mm": route.height_mm,
                "centerline_length_mm": round(route.centerline_length_mm, 3),
                "status": route.status,
            }
            for route in ROUTES
        ],
        "artifacts": [
            {"name": path.name, "bytes": path.stat().st_size, "sha256": sha256(path)}
            for path in artifacts
            if path.name != "manifest.json"
        ],
        "exploded_preview": exploded_path.name,
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main() -> None:
    cad_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--server-script", type=Path, default=cad_root / "scripts" / "Start-SolidWorksMcp.ps1")
    parser.add_argument("--output-dir", type=Path, default=cad_root / "models" / REVISION)
    parser.add_argument("--drawing-template", type=Path, default=Path(r"E:\2\SolidWorks2022\SOLIDWORKS\data\templates\gb.drwdot"))
    parser.add_argument("--reuse-parts", action="store_true")
    args = parser.parse_args()
    asyncio.run(
        build(
            args.server_script.resolve(),
            args.output_dir.resolve(),
            args.drawing_template.resolve(),
            cad_root,
            args.reuse_parts,
        )
    )


if __name__ == "__main__":
    main()
