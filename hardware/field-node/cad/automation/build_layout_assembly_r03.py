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

from build_reference_parts import PartSpec, build_part, call
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


REVISION = "CAD-R0.3"
ASSEMBLY_NAME = "FN-ASM-001_internal-layout_R0.3"
ASSEMBLY_TEMPLATE = Path(
    r"C:\ProgramData\SOLIDWORKS\SOLIDWORKS 2022\templates\gb_assembly.asmdot"
)
TRAY_NAME = "FN-ENC-002_open-tray-layout-reference_R0.3"
PLATE_NAME = "FN-PLT-003_fr4-rect-fit_NO-HOLES_R0.3"
PCB_NAME = "FN-PCB-002_carrier-envelope_ROTATED_R0.3"
CHARGER_ZONE_NAME = "FN-ZON-001_cn3791-reserved-zone_R0.3"

ENC_OUTER_X_MM = 317.9
ENC_OUTER_Y_MM = 238.9
ENC_BOTTOM_DEPTH_MM = 91.1
ENC_INNER_X_MM = 276.0655
ENC_INNER_Y_MM = 197.0
ENC_FLOOR_MM = 3.0
SUPPORT_TOP_FROM_FLOOR_MM = 6.0

PLATE_X_MM = 272.0
PLATE_Y_MM = 193.0
PLATE_Z_MM = 3.0

PCB_X_MM = 115.0
PCB_Y_MM = 170.0
PCB_Z_MM = 1.6
PCB_STANDOFF_MM = 10.0

BATTERY_X_MM = 70.0
BATTERY_Y_MM = 55.0
BATTERY_Z_MM = 40.0

CHARGER_ZONE_X_MM = 60.0
CHARGER_ZONE_Y_MM = 35.0
CHARGER_ZONE_Z_MM = 1.0

SUBPLATE_X_MM = 120.0
SUBPLATE_Y_MM = 85.0
SUBPLATE_Z_MM = 3.0
SENSOR_X_MM = 90.0
SENSOR_Y_MM = 58.0
SENSOR_Z_MM = 36.0


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
    layout_keys = {"pcb", "battery", "charger_zone", "subplate"}
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

    max_z = max(item.bottom_z_mm + item.size_z_mm for item in placements if item.key != "tray")
    if max_z >= ENC_BOTTOM_DEPTH_MM:
        raise RuntimeError(f"Assembly exceeds nominal bottom depth: z={max_z} mm")
    return {
        "plate_nominal_clearance_per_side_mm": [round(plate_gap_x, 4), round(plate_gap_y, 4)],
        "minimum_planar_clearance_mm": min(clearances.values()),
        "pair_clearances_mm": clearances,
        "highest_component_z_mm": round(max_z, 3),
        "nominal_rim_clearance_mm": round(ENC_BOTTOM_DEPTH_MM - max_z, 3),
    }


def create_labeled_top_view(
    placements: list[Placement], output_dir: Path
) -> dict[str, Any]:
    width = 2400
    height = 1600
    center_x = 800.0
    center_y = 760.0
    scale = 4.2
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
            font_family="Arial, sans-serif",
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

    text_node(root, "FN-ASM-001 INTERNAL LAYOUT - LABELED TOP VIEW", 90, 76, 42, 700)
    text_node(root, "CAD-R0.3 | LAYOUT REVIEW ONLY | NOT FOR MANUFACTURE", 90, 120, 25, 700, "#b42318")

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
    draw_order = ("pcb", "battery", "charger_zone", "subplate", "sensor")
    styles = {
        "pcb": ("#1f7a45", "#124c2c", 0.92),
        "battery": ("#303844", "#111827", 0.94),
        "charger_zone": ("#4f8bd6", "#1d4f91", 0.50),
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

    marker_positions = {
        "pcb": (-72.5, 62.0, "1"),
        "battery": (58.0, -68.0, "2"),
        "charger_zone": (112.0, -15.0, "3"),
        "sensor": (71.0, 51.0, "4"),
        "subplate": (118.0, 82.0, "5"),
    }
    for key, (x_mm, y_mm, label) in marker_positions.items():
        x, y = point(x_mm, y_mm)
        element(root, "circle", cx=f"{x:.2f}", cy=f"{y:.2f}", r="24", fill="#ffffff", stroke="#172033", stroke_width="4")
        text_node(root, label, x, y + 10, 28, 700, "#172033", "middle")

    plate_left, plate_top = point(-PLATE_X_MM / 2.0, PLATE_Y_MM / 2.0)
    plate_right, plate_bottom = point(PLATE_X_MM / 2.0, -PLATE_Y_MM / 2.0)
    dimension_y = plate_bottom + 82.0
    element(root, "line", x1=plate_left, y1=plate_bottom, x2=plate_left, y2=dimension_y + 15, stroke="#3f4b5f", stroke_width="3")
    element(root, "line", x1=plate_right, y1=plate_bottom, x2=plate_right, y2=dimension_y + 15, stroke="#3f4b5f", stroke_width="3")
    element(root, "line", x1=plate_left, y1=dimension_y, x2=plate_right, y2=dimension_y, stroke="#3f4b5f", stroke_width="3", marker_start="url(#arrow)", marker_end="url(#arrow)")
    text_node(root, "FR4 272 mm", (plate_left + plate_right) / 2.0, dimension_y - 14, 27, 700, "#263241", "middle")

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

    legend_x = 1570.0
    text_node(root, "LAYOUT KEY", legend_x, 210, 31, 700)
    legend = [
        ("1  Carrier PCB", "115 x 170 x 1.6 mm | center (-72.5, 0) | bottom Z=22"),
        ("2  Battery envelope", "70 x 55 x 40 mm | center (58, -68) | PHOTO ESTIMATED"),
        ("3  CN3791 reserved zone", "60 x 35 mm | center (91, -15) | NOT measured module size"),
        ("4  Tilt transmitter", "90 x 58 x 36 mm | center (71, 51) | VERIFIED envelope"),
        ("5  304 tilt reference plate", "120 x 85 x 3 mm | 4 x M3 tapped sensor interface"),
        ("FR4 fit-trial plate", "272 x 193 x 3 mm | no R1-R6 anchor holes modeled"),
    ]
    legend_y = 270.0
    for heading, detail in legend:
        text_node(root, heading, legend_x, legend_y, 27, 700)
        text_node(root, detail, legend_x, legend_y + 34, 21, 400, "#455468")
        legend_y += 104.0

    text_node(root, "CHECKED CLEARANCES", legend_x, 930, 29, 700)
    text_node(root, "Minimum planar module clearance: 6 mm", legend_x, 974, 23, 400)
    text_node(root, "Highest component envelope: Z=52 mm", legend_x, 1010, 23, 400)
    text_node(root, "Nominal clearance to 91.1 mm rim: 39.1 mm", legend_x, 1046, 23, 400)
    text_node(root, "FR4-to-inner-reference nominal gap:", legend_x, 1082, 23, 400)
    text_node(root, "2.0327 mm/side in X; 2.0 mm/side in Y", legend_x, 1118, 23, 700)

    text_node(root, "BLOCKED BEFORE MANUFACTURE", legend_x, 1195, 29, 700, "#b42318")
    text_node(root, "R1-R6 boss coordinates, hole depth and blind state", legend_x, 1238, 22, 400, "#7a271a")
    text_node(root, "Measured battery/CN3791 envelopes and mounting holes", legend_x, 1272, 22, 400, "#7a271a")
    text_node(root, "Physical 272 x 193 mm template fit and local scallop relief", legend_x, 1306, 22, 400, "#7a271a")

    text_node(root, "Nominal enclosure inner rectangle: 276.0655 x 197 mm. Tray scallops, ribs, bosses and lid geometry are omitted.", 90, 1472, 23, 400, "#455468")
    text_node(root, "Support tops are nominally coplanar 6 mm above the inner floor; no 1 mm compensation shim is used.", 90, 1510, 23, 400, "#455468")

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

    mass_result = await call(session, "get_mass_properties", {"input_data": {"units": "metric"}})
    actual_volume = float(mass_result["mass_properties"]["volume"]["value"])
    ring_area = ENC_OUTER_X_MM * ENC_OUTER_Y_MM - ENC_INNER_X_MM * ENC_INNER_Y_MM
    expected_volume = ENC_INNER_X_MM * ENC_INNER_Y_MM * ENC_FLOOR_MM + ring_area * ENC_BOTTOM_DEPTH_MM
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
    await call(session, "close_model", {"input_data": {"save": True}})
    normalize_step_line_endings(step)
    return {
        "part": TRAY_NAME,
        "status": "NOMINAL_LAYOUT_REFERENCE",
        "expected_volume_mm3": round(expected_volume, 3),
        "actual_volume_mm3": round(actual_volume, 3),
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
    for item in placements:
        errors = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        warnings = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        document = app.OpenDoc6(str(item.path), 1, 3, "", errors, warnings)
        if document is None:
            raise RuntimeError(
                f"Failed to preload component: {item.path}; "
                f"errors={errors.value}, warnings={warnings.value}"
            )
        opened_titles.append(str(com_value(document, "GetTitle")))
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

        set_custom_property(model, "AssemblyNumber", "FN-ASM-001")
        set_custom_property(model, "Revision", REVISION)
        set_custom_property(model, "ManufacturingStatus", "LAYOUT REVIEW ONLY")
        set_custom_property(model, "FR4", "272 x 193 x 3 mm; no R1-R6 holes")
        set_custom_property(model, "SupportDatum", "Nominal coplanar top Z=6 mm above inner floor")

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
            "plate": 105.0,
            "pcb": 125.0,
            "battery": 125.0,
            "charger_zone": 125.0,
            "subplate": 130.0,
            "sensor": 175.0,
        }
        for item in placements:
            add_component(model, item, offsets[item.key])
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

        add_note(drawing_model, "FN-ASM-001 INTERNAL LAYOUT", 0.025, 0.282, 5.0)
        add_note(drawing_model, "CAD-R0.3 | LAYOUT REVIEW ONLY | NOT FOR MANUFACTURE", 0.025, 0.271)
        add_note(drawing_model, "FR4: 272 x 193 x 3 mm | R1-R6 HOLES NOT MODELED", 0.025, 0.050)
        add_note(drawing_model, "SUPPORT TOP: NOMINAL Z=6 mm ABOVE INNER FLOOR | NO HEIGHT SHIM", 0.025, 0.038)
        add_note(drawing_model, "CN3791 GEOMETRY IS A 60 x 35 mm RESERVED ZONE, NOT A MODULE MEASUREMENT", 0.025, 0.026)
        add_note(drawing_model, "BATTERY 70 x 55 x 40 mm IS PHOTO-ESTIMATED; VERIFY BEFORE TRAY DESIGN", 0.025, 0.014)
        add_note(drawing_model, "PCB ROTATED 90 DEG FOR PACKING; TILT PLATE/SENSOR INTERFACE VERIFIED", 0.225, 0.050)
        add_note(drawing_model, "NO FR4 DXF UNTIL R1-R6 COORDINATES AND HOLE DEPTHS ARE MEASURED", 0.225, 0.038)
        add_note(drawing_model, "ENCLOSURE TRAY IS A NOMINAL RECTANGULAR REFERENCE; SCALLOPS OMITTED", 0.225, 0.026)

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
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    close_output_documents(output_dir)
    existing_titles = document_titles()

    params = StdioServerParameters(
        command="powershell",
        args=["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(server_script)],
        cwd=str(server_script.parents[4]),
        env=os.environ.copy(),
    )
    generated_parts: list[dict[str, Any]] = []
    try:
        async with stdio_client(params) as (read, write):
            async with ClientSession(read, write) as session:
                await session.initialize()
                generated_parts.append(await build_tray(session, output_dir))
                for spec in (
                    PartSpec(PLATE_NAME, PLATE_X_MM, PLATE_Y_MM, PLATE_Z_MM, "DESIGN_FIT_TRIAL_NO_ANCHOR_HOLES"),
                    PartSpec(PCB_NAME, PCB_X_MM, PCB_Y_MM, PCB_Z_MM, "VERIFIED_XY_ROTATED_NOMINAL_Z"),
                    PartSpec(CHARGER_ZONE_NAME, CHARGER_ZONE_X_MM, CHARGER_ZONE_Y_MM, CHARGER_ZONE_Z_MM, "DESIGN_RESERVED_ZONE_NOT_MODULE_SIZE"),
                ):
                    generated_parts.append(await build_part(session, spec, output_dir))
    finally:
        close_new_unsaved_documents(existing_titles)

    for step_path in output_dir.glob("*.STEP"):
        normalize_step_line_endings(step_path)

    plate_bottom_z = ENC_FLOOR_MM + SUPPORT_TOP_FROM_FLOOR_MM
    plate_top_z = plate_bottom_z + PLATE_Z_MM
    model_r01 = cad_root / "models" / "CAD-R0.1"
    model_r02 = cad_root / "models" / "CAD-R0.2"
    packaged_references: list[dict[str, Any]] = []
    battery_path, packaged = package_reference_part(
        model_r01 / "FN-BAT-001_battery-envelope_ESTIMATED_R0.1.SLDPRT",
        output_dir,
    )
    packaged_references.append(packaged)
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
    placements = [
        Placement("tray", "ENCLOSURE_TRAY_REFERENCE", output_dir / f"{TRAY_NAME}.SLDPRT", 0.0, 0.0, 0.0, ENC_OUTER_X_MM, ENC_OUTER_Y_MM, ENC_BOTTOM_DEPTH_MM, "NOMINAL", (0.78, 0.82, 0.86), 0.65),
        Placement("plate", "FR4_RECT_FIT_NO_HOLES", output_dir / f"{PLATE_NAME}.SLDPRT", 0.0, 0.0, plate_bottom_z, PLATE_X_MM, PLATE_Y_MM, PLATE_Z_MM, "DESIGN", (0.10, 0.45, 0.22)),
        Placement("pcb", "CARRIER_BOARD_ROTATED_90", output_dir / f"{PCB_NAME}.SLDPRT", -72.5, 0.0, plate_top_z + PCB_STANDOFF_MM, PCB_X_MM, PCB_Y_MM, PCB_Z_MM, "VERIFIED_XY", (0.05, 0.38, 0.16)),
        Placement("battery", "BATTERY_ESTIMATED", battery_path, 58.0, -68.0, plate_top_z, BATTERY_X_MM, BATTERY_Y_MM, BATTERY_Z_MM, "ESTIMATED", (0.12, 0.14, 0.17)),
        Placement("charger_zone", "CN3791_RESERVED_ZONE", output_dir / f"{CHARGER_ZONE_NAME}.SLDPRT", 91.0, -15.0, plate_top_z, CHARGER_ZONE_X_MM, CHARGER_ZONE_Y_MM, CHARGER_ZONE_Z_MM, "DESIGN_ZONE", (0.10, 0.38, 0.78), 0.15),
        Placement("subplate", "TILT_REFERENCE_PLATE", subplate_path, 71.0, 51.0, plate_top_z, SUBPLATE_X_MM, SUBPLATE_Y_MM, SUBPLATE_Z_MM, "DESIGN_M3_TAPPED", (0.72, 0.75, 0.78)),
        Placement("sensor", "TILT_TRANSMITTER", sensor_path, 71.0, 51.0, plate_top_z + SUBPLATE_Z_MM, SENSOR_X_MM, SENSOR_Y_MM, SENSOR_Z_MM, "VERIFIED", (0.92, 0.52, 0.10)),
    ]
    for item in placements:
        if not item.path.exists():
            raise RuntimeError(f"Missing assembly reference: {item.path}")

    validation = validate_layout(placements)
    labeled_top_result = create_labeled_top_view(placements, output_dir)
    assembly_result, assembly_path = create_assembly(placements, output_dir)
    exploded_path = create_exploded_preview(placements, output_dir)
    drawing_result = create_assembly_drawing(assembly_path, output_dir, drawing_template)

    artifacts = sorted(path for path in output_dir.iterdir() if path.is_file())
    manifest = {
        "revision": REVISION,
        "scope": "first controlled internal layout assembly",
        "manufacturing_status": "LAYOUT REVIEW ONLY / NOT FOR MANUFACTURE",
        "solidworks": "2022 SP5.0",
        "generated_parts": generated_parts,
        "packaged_reference_parts": packaged_references,
        "assembly": assembly_result,
        "drawing": drawing_result,
        "layout_validation": validation,
        "labeled_top_view": labeled_top_result,
        "plate": {
            "size_mm": [PLATE_X_MM, PLATE_Y_MM, PLATE_Z_MM],
            "bottom_z_from_enclosure_outer_bottom_mm": plate_bottom_z,
            "support_top_from_inner_floor_mm": SUPPORT_TOP_FROM_FLOOR_MM,
            "anchor_holes": "ABSENT_PENDING_R1_R6_MEASUREMENT",
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
        "blocked_inputs": [
            "R1-R6 physical boss identities and XY coordinates",
            "R1-R6 hole diameter, depth, and blind state",
            "battery measured envelope and cable exit",
            "CN3791 module measured envelope and mounting holes",
            "plate-to-FR4 four support holes",
        ],
        "warnings": [
            "The 60 x 35 mm CN3791 object is a reserved layout zone, not a module measurement.",
            "The 70 x 55 x 40 mm battery is photo-estimated.",
            "The enclosure tray omits scallops, ribs, lid geometry, and fastener bosses.",
            "No FR4 DXF is generated in CAD-R0.3.",
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
    args = parser.parse_args()
    asyncio.run(
        build(
            args.server_script.resolve(),
            args.output_dir.resolve(),
            args.drawing_template.resolve(),
            cad_root,
        )
    )


if __name__ == "__main__":
    main()
