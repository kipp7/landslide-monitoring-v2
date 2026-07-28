from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import os
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pythoncom
import win32com.client
from win32com.client import VARIANT

from solidworks_mcp.adapters.base import ExtrusionParameters
from solidworks_mcp.adapters.pywin32_adapter import PyWin32Adapter
from solidworks_mcp.adapters import sw_type_info
from solidworks_mcp.adapters.solidworks.features import _read_member, _select_named_feature

from build_layout_assembly_r05 import (
    BATTERY_NAME, BATTERY_TRAY_NAME, BATTERY_TRAY_X_MM, BATTERY_TRAY_Y_MM,
    BATTERY_TRAY_Z_MM, BATTERY_X_MM, BATTERY_Y_MM, BATTERY_Z_MM,
    CHARGER_HOLDER_NAME, CHARGER_HOLDER_X_MM, CHARGER_HOLDER_Y_MM,
    CHARGER_HOLDER_Z_MM, CHARGER_NAME, CHARGER_X_MM, CHARGER_Y_MM,
    CHARGER_Z_MM, EDGE_PAD_NAME, EDGE_PAD_X_MM, EDGE_PAD_Y_MM, EDGE_PAD_Z_MM,
    ENC_BOTTOM_DEPTH_MM, ENC_FLOOR_MM, ENC_OUTER_X_MM, ENC_OUTER_Y_MM,
    FUSE_ZONE_NAME, FUSE_ZONE_X_MM, FUSE_ZONE_Y_MM, FUSE_ZONE_Z_MM,
    PCB_ENVELOPE_NAME, PCB_INSTALLED_Z_MM, PCB_NAME, PCB_STANDOFF_MM,
    PCB_X_MM, PCB_Y_MM, PCB_Z_MM, PLATE_NAME, PLATE_X_MM, PLATE_Y_MM,
    PLATE_Z_MM, SENSOR_X_MM, SENSOR_Y_MM, SENSOR_Z_MM, SUBPLATE_X_MM,
    SUBPLATE_Y_MM, SUBPLATE_Z_MM, SUPPORT_TOP_FROM_FLOOR_MM, TRAY_NAME,
    Placement, add_component, appearance, close_preloaded_documents,
    new_assembly, preload_component_documents, show_view,
)
from r06_design_inputs import CableSpec, EXTERNAL_CABLES, INTERNAL_CABLES
from build_tilt_interface_r02 import (
    com_value, normalize_step_line_endings as normalize_step_line_endings_base,
    save_document, set_custom_property,
)


REVISION = "CAD-R0.6"
INTERNAL_ASSEMBLY_NAME = "FN-ASM-004_internal-round-harness_R0.6"
FULL_ASSEMBLY_NAME = "FN-ASM-005_full-field-node-concept_R0.6"
STRUCTURE_ASSEMBLY_NAME = "FN-ASM-005A_external-structure_R0.6"
EXTERNAL_HARNESS_ASSEMBLY_NAME = "FN-ASM-005B_external-harness_R0.6"


def normalize_step_line_endings(path: Path) -> None:
    normalize_step_line_endings_base(path)
    lines = path.read_bytes().splitlines()
    path.write_bytes(b"\n".join(line.rstrip(b" \t") for line in lines) + b"\n")


@dataclass(frozen=True)
class PrimitiveSpec:
    name: str
    kind: str
    dimensions_mm: tuple[float, ...]
    color_rgb: tuple[float, float, float]
    status: str


@dataclass(frozen=True)
class AssemblyPlacement:
    key: str
    instance: str
    path: Path
    target_center_xyz_mm: tuple[float, float, float]
    color_rgb: tuple[float, float, float]
    transparency: float = 0.0
    rotation_x_deg: float = 0.0
    local_center_z_mm: float = 0.0
    status: str = "CONCEPT"
    origin_translation_xyz_mm: tuple[float, float, float] | None = None


PRIMITIVES = (
    PrimitiveSpec("FN-FRM-002_rail-30x30x650_CONCEPT_R0.6", "box", (30,30,650), (0.18,0.20,0.23), "SECTION_AND_WALL_PENDING"),
    PrimitiveSpec("FN-FRM-003_crossmember-330x30x30_CONCEPT_R0.6", "box", (330,30,30), (0.18,0.20,0.23), "SECTION_AND_HOLES_PENDING"),
    PrimitiveSpec("FN-FRM-004_mast-30x30x220_CONCEPT_R0.6", "box", (30,30,220), (0.18,0.20,0.23), "SECTION_PENDING"),
    PrimitiveSpec("FN-FRM-005_removable-foot-50x350x30_CONCEPT_R0.6", "box", (50,350,30), (0.18,0.20,0.23), "COMPETITION_FOOT_CONCEPT"),
    PrimitiveSpec("FN-SOL-004_swm10w-panel-envelope_R0.6", "box", (290,240,17), (0.60,0.64,0.68), "VERIFIED_ENVELOPE_HOLES_PENDING"),
    PrimitiveSpec("FN-SOL-005_swm10w-active-face_R0.6", "box", (266,216,4), (0.04,0.10,0.17), "VISUAL_REFERENCE"),
    PrimitiveSpec("FN-ENC-006_lid-envelope_NOMINAL_R0.6", "box", (317.9,238.9,53.5), (0.86,0.88,0.90), "NOMINAL"),
    PrimitiveSpec("FN-BRK-003_enclosure-mount-28x28x18_CONCEPT_R0.6", "box", (28,28,18), (0.34,0.37,0.40), "HOLES_PENDING"),
    PrimitiveSpec("FN-GNS-002_mast-platform-120x120x6_CONCEPT_R0.6", "box", (120,120,6), (0.38,0.41,0.44), "BTM87SF_HOLES_PENDING"),
    PrimitiveSpec("FN-GNS-003_BTM87SF-envelope_D78x24_PENDING_R0.6", "cylinder_z", (78,24), (0.60,0.62,0.64), "PHYSICAL_DIMENSIONS_PENDING"),
    PrimitiveSpec("FN-GNS-004_BT760-envelope_D180x70_PENDING_R0.6", "cylinder_z", (180,70), (0.92,0.92,0.88), "PHYSICAL_DIMENSIONS_PENDING"),
    PrimitiveSpec("FN-ANT-002_xls1-bracket-70x80x6_PENDING_R0.6", "box", (70,80,6), (0.35,0.37,0.40), "ANTENNA_MODEL_PENDING"),
    PrimitiveSpec("FN-ANT-003_xls1-whip-D12x180_PENDING_R0.6", "cylinder_z", (12,180), (0.10,0.10,0.11), "ANTENNA_MODEL_PENDING"),
    PrimitiveSpec("FN-IFC-002_sma-bulkhead-envelope-D12x34_R0.6", "cylinder_y", (12,34), (0.66,0.68,0.70), "NOMINAL_VERIFY_SAMPLE"),
    PrimitiveSpec("FN-IFC-003_sma-collar-envelope-D17x5_R0.6", "cylinder_y", (17,5), (0.66,0.68,0.70), "NOMINAL_VERIFY_SAMPLE"),
    PrimitiveSpec("FN-IFC-004_m16-gland-envelope-D24x34_R0.6", "cylinder_y", (24,34), (0.12,0.12,0.13), "NOMINAL_VERIFY_SAMPLE"),
    PrimitiveSpec("FN-IFC-005_m16-cap-envelope-D29x5_R0.6", "cylinder_y", (29,5), (0.12,0.12,0.13), "NOMINAL_VERIFY_SAMPLE"),
)


STRUCTURAL_SWEEPS = (
    CableSpec("B1", "FN-FRM-006_left-mast-brace_D16_CONCEPT_R0.6", "left symmetric mast brace", 16, 48, ((-120,145,400),(-120,146,400),(0,145,560)), "CONCEPT"),
    CableSpec("B2", "FN-FRM-007_right-mast-brace_D16_CONCEPT_R0.6", "right symmetric mast brace", 16, 48, ((120,145,400),(120,146,400),(0,145,560)), "CONCEPT"),
    CableSpec("S1", "FN-BRK-004_solar-left-lower-strut_D14_CONCEPT_R0.6", "left lower solar strut", 14, 42, ((-120,145,245),(-120,144,245),(-120,6,255)), "CONCEPT"),
    CableSpec("S2", "FN-BRK-005_solar-right-lower-strut_D14_CONCEPT_R0.6", "right lower solar strut", 14, 42, ((120,145,245),(120,144,245),(120,6,255)), "CONCEPT"),
    CableSpec("S3", "FN-BRK-006_solar-left-upper-strut_D14_CONCEPT_R0.6", "left upper solar strut", 14, 42, ((-120,145,385),(-120,146,385),(-120,194,386)), "CONCEPT"),
    CableSpec("S4", "FN-BRK-007_solar-right-upper-strut_D14_CONCEPT_R0.6", "right upper solar strut", 14, 42, ((120,145,385),(120,146,385),(120,194,386)), "CONCEPT"),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ensure_success(label: str, result: Any) -> Any:
    if not result.is_success:
        raise RuntimeError(f"{label}: {result.error}")
    return result.data


async def save_native_part(adapter: PyWin32Adapter, name: str, output_dir: Path, orientation: str = "isometric") -> dict[str, Any]:
    native = output_dir / f"{name}.SLDPRT"
    step = output_dir / f"{name}.STEP"
    preview = output_dir / f"{name}.png"
    ensure_success("save native", await adapter.save_file(str(native)))
    ensure_success("export STEP", await adapter.export_file(str(step), "step"))
    ensure_success("export preview", await adapter.export_image({"file_path": str(preview), "format_type": "png", "width": 1400, "height": 900, "view_orientation": orientation}))
    mass = ensure_success("mass properties", await adapter.get_mass_properties())
    await adapter.close_model(save=False)
    normalize_step_line_endings(step)
    return {"name": name, "native": native.name, "step": step.name, "preview": preview.name, "volume_mm3": float(mass.volume)}


async def build_primitive(adapter: PyWin32Adapter, spec: PrimitiveSpec, output_dir: Path) -> dict[str, Any]:
    ensure_success("create part", await adapter.create_part())
    if spec.kind == "box":
        sx, sy, sz = spec.dimensions_mm
        ensure_success("box sketch", await adapter.create_sketch("Top"))
        ensure_success("box rectangle", await adapter.add_rectangle(-sx/2, -sy/2, sx/2, sy/2))
        ensure_success("exit box sketch", await adapter.exit_sketch())
        ensure_success("box extrusion", await adapter.create_extrusion(ExtrusionParameters(depth=sz)))
    elif spec.kind == "cylinder_z":
        diameter, height = spec.dimensions_mm
        ensure_success("cylinder sketch", await adapter.create_sketch("Top"))
        ensure_success("cylinder circle", await adapter.add_circle(0, 0, diameter/2))
        ensure_success("exit cylinder sketch", await adapter.exit_sketch())
        ensure_success("cylinder extrusion", await adapter.create_extrusion(ExtrusionParameters(depth=height)))
    elif spec.kind == "cylinder_y":
        diameter, length = spec.dimensions_mm
        ensure_success("depth cylinder sketch", await adapter.create_sketch("Front"))
        ensure_success("depth cylinder circle", await adapter.add_circle(0, 0, diameter/2))
        ensure_success("exit depth cylinder sketch", await adapter.exit_sketch())
        ensure_success("depth cylinder extrusion", await adapter.create_extrusion(ExtrusionParameters(depth=length)))
    else:
        raise RuntimeError(f"Unknown primitive kind: {spec.kind}")
    set_custom_property(adapter.currentModel, "Revision", REVISION)
    set_custom_property(adapter.currentModel, "GeometryStatus", spec.status)
    return await save_native_part(adapter, spec.name, output_dir)


def last_3d_sketch_name(model: Any) -> str:
    found = ""
    feature = _read_member(model, "FirstFeature")
    for _ in range(5000):
        if not feature:
            break
        try:
            if _read_member(feature, "GetTypeName2") == "3DProfileFeature":
                found = str(_read_member(feature, "Name"))
        except Exception:
            pass
        feature = _read_member(feature, "GetNextFeature")
    if not found:
        raise RuntimeError("3D path sketch was not found in the feature tree")
    return found


async def build_sweep(adapter: PyWin32Adapter, spec: CableSpec, output_dir: Path) -> dict[str, Any]:
    ensure_success("create sweep part", await adapter.create_part())
    start = spec.points_xyz_mm[0]
    profile_name = str(ensure_success("profile sketch", await adapter.create_sketch("Front")))
    ensure_success("profile circle", await adapter.add_circle(0, 0, spec.od_mm / 2.0))
    ensure_success("exit profile", await adapter.exit_sketch())

    model = adapter.currentModel
    model.Insert3DSketch2(True)
    coordinates: list[float] = []
    for x_mm, y_mm, z_mm in spec.points_xyz_mm:
        coordinates.extend(((x_mm-start[0]) / 1000.0, (z_mm-start[2]) / 1000.0, (y_mm-start[1]) / 1000.0))
    points = VARIANT(pythoncom.VT_ARRAY | pythoncom.VT_R8, coordinates)
    spline = model.SketchManager.CreateSpline2(points, False)
    if not spline:
        raise RuntimeError(f"{spec.wire_id}: failed to create 3D spline")
    model.Insert3DSketch2(True)
    path_name = last_3d_sketch_name(model)
    model.ClearSelection2(True)
    if not _select_named_feature(adapter, profile_name, 1, False):
        raise RuntimeError(f"{spec.wire_id}: failed to select circular profile")
    if not _select_named_feature(adapter, path_name, 4, True):
        raise RuntimeError(f"{spec.wire_id}: failed to select 3D path")
    feature = model.FeatureManager.InsertProtrusionSwept4(
        False, False, 0, False, False, 0, 0, False, 0.0, 0.0,
        0, 0, True, True, True, 0.0, True, False, 0.0, 0,
    )
    if not feature:
        raise RuntimeError(f"{spec.wire_id}: native circular sweep failed")
    set_custom_property(model, "WireID", spec.wire_id)
    set_custom_property(model, "CableOD", f"{spec.od_mm} mm / {spec.status}")
    set_custom_property(model, "MinimumBendRadius", f"{spec.minimum_bend_radius_mm} mm / VERIFY PHYSICAL")
    result = await save_native_part(adapter, spec.name, output_dir)
    result.update({"wire_id": spec.wire_id, "od_mm": spec.od_mm, "points_xyz_mm": spec.points_xyz_mm, "status": spec.status, "geometry": "SOLIDWORKS_NATIVE_3D_SPLINE_CIRCULAR_SWEEP"})
    return result


async def build_native_geometry(output_dir: Path) -> dict[str, Any]:
    adapter = PyWin32Adapter({})
    await adapter.connect()
    built: list[dict[str, Any]] = []
    try:
        for spec in PRIMITIVES:
            native = output_dir / f"{spec.name}.SLDPRT"
            step = output_dir / f"{spec.name}.STEP"
            preview = output_dir / f"{spec.name}.png"
            if all(path.exists() and path.stat().st_size > 0 for path in (native, step, preview)):
                built.append({"name": spec.name, "status": "REUSED_FROM_COMPLETED_NATIVE_PASS"})
            else:
                built.append(await build_primitive(adapter, spec, output_dir))
        for spec in (*INTERNAL_CABLES, *EXTERNAL_CABLES, *STRUCTURAL_SWEEPS):
            native = output_dir / f"{spec.name}.SLDPRT"
            step = output_dir / f"{spec.name}.STEP"
            preview = output_dir / f"{spec.name}.png"
            if all(path.exists() and path.stat().st_size > 0 for path in (native, step, preview)):
                built.append({"name": spec.name, "wire_id": spec.wire_id, "status": "REUSED_FROM_COMPLETED_NATIVE_PASS"})
            else:
                built.append(await build_sweep(adapter, spec, output_dir))
    finally:
        try:
            await adapter.disconnect()
        except Exception:
            pass
    return {"parts": built, "native_sweeps": len(INTERNAL_CABLES) + len(EXTERNAL_CABLES) + len(STRUCTURAL_SWEEPS)}


def copy_r05_reference(source_dir: Path, output_dir: Path, name: str) -> Path:
    source = source_dir / f"{name}.SLDPRT"
    if not source.exists():
        raise RuntimeError(f"Missing CAD-R0.5 reference: {source}")
    destination = output_dir / source.name
    shutil.copy2(source, destination)
    return destination


def internal_placements(source_dir: Path, output_dir: Path) -> list[Placement]:
    names = (TRAY_NAME, EDGE_PAD_NAME, PLATE_NAME, PCB_NAME, PCB_ENVELOPE_NAME,
             BATTERY_TRAY_NAME, BATTERY_NAME, CHARGER_HOLDER_NAME, CHARGER_NAME,
             FUSE_ZONE_NAME, "FN-SUB-002_tilt-reference-plate_M3_R0.2",
             "FN-SEN-001_tilt-transmitter-envelope_R0.1")
    parts = {name: copy_r05_reference(source_dir, output_dir, name) for name in names}
    plate_bottom = ENC_FLOOR_MM + SUPPORT_TOP_FROM_FLOOR_MM
    plate_top = plate_bottom + PLATE_Z_MM
    pcb_bottom = plate_top + PCB_STANDOFF_MM
    tilt_bottom = plate_top + 6.0
    return [
        Placement("tray","ENCLOSURE_TRAY_REFERENCE",parts[TRAY_NAME],0,0,0,ENC_OUTER_X_MM,ENC_OUTER_Y_MM,ENC_BOTTOM_DEPTH_MM,"NOMINAL",(0.78,0.82,0.86),0.72),
        Placement("edge1","EDGE_SUPPORT_LEFT_UPPER",parts[EDGE_PAD_NAME],-126,45,ENC_FLOOR_MM,EDGE_PAD_X_MM,EDGE_PAD_Y_MM,EDGE_PAD_Z_MM,"OPTIONAL",(0.18,0.18,0.20)),
        Placement("edge2","EDGE_SUPPORT_LEFT_LOWER",parts[EDGE_PAD_NAME],-126,-45,ENC_FLOOR_MM,EDGE_PAD_X_MM,EDGE_PAD_Y_MM,EDGE_PAD_Z_MM,"OPTIONAL",(0.18,0.18,0.20)),
        Placement("edge3","EDGE_SUPPORT_RIGHT_UPPER",parts[EDGE_PAD_NAME],126,45,ENC_FLOOR_MM,EDGE_PAD_X_MM,EDGE_PAD_Y_MM,EDGE_PAD_Z_MM,"OPTIONAL",(0.18,0.18,0.20)),
        Placement("edge4","EDGE_SUPPORT_RIGHT_LOWER",parts[EDGE_PAD_NAME],126,-45,ENC_FLOOR_MM,EDGE_PAD_X_MM,EDGE_PAD_Y_MM,EDGE_PAD_Z_MM,"OPTIONAL",(0.18,0.18,0.20)),
        Placement("plate","FR4_RECT_8HOLE_NOMINAL",parts[PLATE_NAME],0,0,plate_bottom,PLATE_X_MM,PLATE_Y_MM,PLATE_Z_MM,"VERIFY_PHYSICAL",(0.10,0.45,0.22)),
        Placement("pcb","CARRIER_BOARD_ROTATED_CCW",parts[PCB_NAME],-73,0,pcb_bottom,PCB_X_MM,PCB_Y_MM,PCB_Z_MM,"VERIFIED_XY_HOLES",(0.05,0.38,0.16)),
        Placement("pcb_env","CARRIER_INSTALLED_HEIGHT_ENVELOPE",parts[PCB_ENVELOPE_NAME],-73,0,pcb_bottom,PCB_X_MM,PCB_Y_MM,PCB_INSTALLED_Z_MM,"ALLOWANCE",(0.05,0.38,0.16),0.82),
        Placement("bat_tray","BATTERY_TRAY_CONCEPT",parts[BATTERY_TRAY_NAME],92,-62,plate_top,BATTERY_TRAY_X_MM,BATTERY_TRAY_Y_MM,BATTERY_TRAY_Z_MM,"CONCEPT",(0.35,0.39,0.45),0.25),
        Placement("battery","BATTERY_USER_MEASURED",parts[BATTERY_NAME],92,-62,plate_top+BATTERY_TRAY_Z_MM,BATTERY_X_MM,BATTERY_Y_MM,BATTERY_Z_MM,"ALLOWANCE",(0.12,0.14,0.17)),
        Placement("charger_holder","CN3791_CLIP_ZONE",parts[CHARGER_HOLDER_NAME],96,-9,plate_top,CHARGER_HOLDER_X_MM,CHARGER_HOLDER_Y_MM,CHARGER_HOLDER_Z_MM,"CONCEPT",(0.32,0.36,0.43),0.25),
        Placement("charger","CN3791_MODULE",parts[CHARGER_NAME],96,-9,plate_top+CHARGER_HOLDER_Z_MM,CHARGER_X_MM,CHARGER_Y_MM,CHARGER_Z_MM,"ALLOWANCE",(0.10,0.38,0.78)),
        Placement("fuse","FUSE_SERVICE_DISCONNECT_ZONE",parts[FUSE_ZONE_NAME],28,-55,plate_top,FUSE_ZONE_X_MM,FUSE_ZONE_Y_MM,FUSE_ZONE_Z_MM,"PENDING",(0.90,0.72,0.08),0.20),
        Placement("subplate","TILT_REFERENCE_PLATE",parts["FN-SUB-002_tilt-reference-plate_M3_R0.2"],68,53,tilt_bottom,SUBPLATE_X_MM,SUBPLATE_Y_MM,SUBPLATE_Z_MM,"DESIGN",(0.72,0.75,0.78)),
        Placement("sensor","TILT_TRANSMITTER",parts["FN-SEN-001_tilt-transmitter-envelope_R0.1"],68,53,tilt_bottom+SUBPLATE_Z_MM,SENSOR_X_MM,SENSOR_Y_MM,SENSOR_Z_MM,"VERIFIED",(0.92,0.52,0.10)),
    ]


def primitive_path(output_dir: Path, name: str) -> Path:
    path = output_dir / f"{name}.SLDPRT"
    if not path.exists():
        raise RuntimeError(f"Missing generated part: {path}")
    return path


def external_placements(output_dir: Path) -> list[AssemblyPlacement]:
    by_name = {spec.name: spec for spec in PRIMITIVES}
    def item(name: str, key: str, instance: str, center: tuple[float,float,float], transparency: float = 0, rotation: float = 0, local_center_z: float = 0) -> AssemblyPlacement:
        spec = by_name[name]
        return AssemblyPlacement(key, instance, primitive_path(output_dir,name), center, spec.color_rgb, transparency, rotation, local_center_z, spec.status)
    rail="FN-FRM-002_rail-30x30x650_CONCEPT_R0.6"; cross="FN-FRM-003_crossmember-330x30x30_CONCEPT_R0.6"
    placements = [
        item(rail,"rail_l","FRAME_LEFT_RAIL",(-120,145,245)), item(rail,"rail_r","FRAME_RIGHT_RAIL",(120,145,245)),
        *[item(cross,f"cross_{z}",f"FRAME_CROSSMEMBER_Z{z}",(0,145,z)) for z in (35,125,245,385)],
        item("FN-FRM-004_mast-30x30x220_CONCEPT_R0.6","mast","GNSS_CENTRAL_MAST",(0,145,520)),
        item("FN-FRM-005_removable-foot-50x350x30_CONCEPT_R0.6","foot_l","REMOVABLE_FOOT_LEFT",(-120,5,-92)),
        item("FN-FRM-005_removable-foot-50x350x30_CONCEPT_R0.6","foot_r","REMOVABLE_FOOT_RIGHT",(120,5,-92)),
        item("FN-SOL-004_swm10w-panel-envelope_R0.6","solar_panel","SWM10W_PANEL_35DEG",(0,100,320),0,35,8.5),
        item("FN-SOL-005_swm10w-active-face_R0.6","solar_face","SWM10W_ACTIVE_FACE_35DEG",(0,96.8,325.0),0,35,2.0),
        item("FN-ENC-006_lid-envelope_NOMINAL_R0.6","lid","ENCLOSURE_LID",(0,0,117.85),0.68),
        *[item("FN-BRK-003_enclosure-mount-28x28x18_CONCEPT_R0.6",f"mount_{x}_{z}",f"ENCLOSURE_MOUNT_{x}_{z}",(x,127,z)) for x in (-125,125) for z in (35,125)],
        item("FN-GNS-002_mast-platform-120x120x6_CONCEPT_R0.6","platform","GNSS_PLATFORM",(0,145,633)),
        item("FN-GNS-003_BTM87SF-envelope_D78x24_PENDING_R0.6","gnss_base","BTM87SF_ENVELOPE",(0,145,648)),
        item("FN-GNS-004_BT760-envelope_D180x70_PENDING_R0.6","gnss_ant","BT760_ENVELOPE",(0,145,695)),
        item("FN-ANT-002_xls1-bracket-70x80x6_PENDING_R0.6","xls_bracket","XLS1_BRACKET",(195,145,420)),
        item("FN-ANT-003_xls1-whip-D12x180_PENDING_R0.6","xls_whip","XLS1_SEPARATE_ANTENNA",(195,145,513)),
    ]
    ports=(("RF1",-118,"FN-IFC-002_sma-bulkhead-envelope-D12x34_R0.6","FN-IFC-003_sma-collar-envelope-D17x5_R0.6"),("RF2",-82,"FN-IFC-002_sma-bulkhead-envelope-D12x34_R0.6","FN-IFC-003_sma-collar-envelope-D17x5_R0.6"),("G2",60,"FN-IFC-004_m16-gland-envelope-D24x34_R0.6","FN-IFC-005_m16-cap-envelope-D29x5_R0.6"),("G1",110,"FN-IFC-004_m16-gland-envelope-D24x34_R0.6","FN-IFC-005_m16-cap-envelope-D29x5_R0.6"))
    for port_id,x_mm,body,cap in ports:
        placements.append(item(body,f"{port_id}_body",f"{port_id}_THROUGH_BODY",(x_mm,-120,28)))
        placements.append(item(cap,f"{port_id}_cap",f"{port_id}_OUTER_CAP",(x_mm,-139.5,28)))
    return placements


def global_sweep_placements(output_dir: Path, include_external: bool) -> list[AssemblyPlacement]:
    colors={"W1":(0.95,0.55,0.05),"W2":(0.84,0.12,0.10),"W3":(0.70,0.06,0.08),"W4":(0.70,0.06,0.08),"W5":(0.48,0.20,0.72),"W6":(0.05,0.36,0.78),"W7":(0.88,0.64,0.08),"W8":(0,0.62,0.72),"W1-EXT":(0.95,0.55,0.05),"W6-EXT":(0.05,0.36,0.78),"W7-EXT":(0.88,0.64,0.08),"W8-EXT":(0,0.62,0.72)}
    specs=list(INTERNAL_CABLES)
    if include_external: specs.extend((*EXTERNAL_CABLES,*STRUCTURAL_SWEEPS))
    result=[]
    for spec in specs:
        color=colors.get(spec.wire_id,(0.28,0.30,0.33))
        result.append(AssemblyPlacement(spec.wire_id,f"{spec.wire_id}_NATIVE_3D_SWEEP",primitive_path(output_dir,spec.name),(0,0,0),color,0,0,0,spec.status,spec.points_xyz_mm[0]))
    return result


def set_component_color(component: Any, rgb: tuple[float,float,float], transparency: float) -> None:
    try:
        values=VARIANT(pythoncom.VT_ARRAY|pythoncom.VT_R8,appearance(rgb,transparency))
        component.SetMaterialPropertyValues2(values,1,None)
    except Exception:
        pass


def insert_assembly_placement(model: Any, app: Any, item: AssemblyPlacement) -> Any:
    x,y,z=item.target_center_xyz_mm
    component=model.AddComponent5(str(item.path),0,"",False,"",x/1000,z/1000,y/1000)
    if component is None:
        raise RuntimeError(f"Failed to insert component: {item.path}")
    try: component.Name2=item.instance
    except Exception: pass
    if item.origin_translation_xyz_mm is not None:
        ox,oy,oz=item.origin_translation_xyz_mm
        data=VARIANT(pythoncom.VT_ARRAY|pythoncom.VT_R8,[1,0,0,0,1,0,0,0,1,ox/1000,oz/1000,oy/1000,1,0,0,0])
        math_utility=app.GetMathUtility(); sw_type_info.invalidate_flag_cache(math_utility); sw_type_info.flag_methods(math_utility,"IMathUtility")
        component.Transform2=math_utility.CreateTransform(data)
    elif item.rotation_x_deg:
        angle=math.radians(item.rotation_x_deg); c=math.cos(angle); s=math.sin(angle)
        local_center_sw_y=item.local_center_z_mm/1000
        tx=x/1000; ty=z/1000-c*local_center_sw_y; tz=y/1000+s*local_center_sw_y
        data=VARIANT(pythoncom.VT_ARRAY|pythoncom.VT_R8,[1,0,0,0,c,-s,0,s,c,tx,ty,tz,1,0,0,0])
        math_utility=app.GetMathUtility(); sw_type_info.invalidate_flag_cache(math_utility); sw_type_info.flag_methods(math_utility,"IMathUtility")
        component.Transform2=math_utility.CreateTransform(data)
    set_component_color(component,item.color_rgb,item.transparency)
    return component


def create_assembly(output_dir: Path, name: str, fixed: list[Placement], extra: list[AssemblyPlacement], keep_open: bool, views: tuple[tuple[str,str,str],...], sequential_preload: bool = False) -> dict[str,Any]:
    pythoncom.CoInitialize(); app=None; model=None; opened=[]
    try:
        app=win32com.client.Dispatch("SldWorks.Application"); sw_type_info.invalidate_flag_cache(app); sw_type_info.flag_methods(app,"ISldWorks"); app.Visible=True
        preload=fixed+[Placement(e.key,e.instance,e.path,0,0,0,1,1,1,e.status,e.color_rgb,e.transparency) for e in extra]
        try: app.CloseDoc("零件1")
        except Exception: pass
        if sequential_preload:
            model=new_assembly(app)
            grouped: dict[Path,list[tuple[str,Any]]]={}
            for item in fixed: grouped.setdefault(item.path,[]).append(("fixed",item))
            for item in extra: grouped.setdefault(item.path,[]).append(("extra",item))
            for path,items in grouped.items():
                errors=VARIANT(pythoncom.VT_BYREF|pythoncom.VT_I4,0); warnings=VARIANT(pythoncom.VT_BYREF|pythoncom.VT_I4,0)
                document=app.OpenDoc6(str(path),1,3,"",errors,warnings)
                if document is None:
                    raise RuntimeError(f"Failed sequential preload: {path}; errors={errors.value}, warnings={warnings.value}")
                title=str(com_value(document,"GetTitle"))
                for kind,item in items:
                    if kind=="fixed": add_component(model,item)
                    else: insert_assembly_placement(model,app,item)
                app.CloseDoc(title)
        else:
            opened=preload_component_documents(app,preload); model=new_assembly(app)
            for p in fixed: add_component(model,p)
            for e in extra: insert_assembly_placement(model,app,e)
        set_custom_property(model,"Revision",REVISION); set_custom_property(model,"ManufacturingStatus","ENGINEERING CONCEPT / NOT FOR MANUFACTURE")
        set_custom_property(model,"HarnessGeometry","SOLIDWORKS NATIVE 3D SPLINE + CIRCULAR SWEEP")
        model.ForceRebuild3(False)
        count=len(tuple(model.GetComponents(False) or ())); expected=len(fixed)+len(extra)
        if count!=expected: raise RuntimeError(f"Component count mismatch: {count} != {expected}")
        native=output_dir/f"{name}.SLDASM"; step=output_dir/f"{name}.STEP"; save_document(model,native); save_document(model,step); normalize_step_line_endings(step)
        previews=[]
        for suffix,english,localized in views:
            show_view(model,english,localized); path=output_dir/f"{name}_{suffix}.png"; save_document(model,path); previews.append(path.name)
        if keep_open:
            close_preloaded_documents(app,opened); opened=[]; show_view(model,"*Isometric","*等轴测")
        else:
            app.CloseDoc(str(com_value(model,"GetTitle"))); model=None; close_preloaded_documents(app,opened); opened=[]
        return {"name":name,"component_count":count,"native":native.name,"step":step.name,"previews":previews,"left_open_in_solidworks":keep_open}
    finally:
        if app is not None and model is not None and not keep_open:
            try: app.CloseDoc(str(com_value(model,"GetTitle")))
            except Exception: pass
        if app is not None: close_preloaded_documents(app,opened)
        pythoncom.CoUninitialize()


def create_master_assembly(output_dir: Path, subassemblies: list[tuple[str,Path]]) -> dict[str,Any]:
    pythoncom.CoInitialize(); app=None; model=None; opened=[]
    try:
        app=win32com.client.Dispatch("SldWorks.Application"); sw_type_info.invalidate_flag_cache(app); sw_type_info.flag_methods(app,"ISldWorks"); app.Visible=True
        for instance,path in subassemblies:
            errors=VARIANT(pythoncom.VT_BYREF|pythoncom.VT_I4,0); warnings=VARIANT(pythoncom.VT_BYREF|pythoncom.VT_I4,0)
            document=app.OpenDoc6(str(path),2,3,"",errors,warnings)
            if document is None: raise RuntimeError(f"Failed to preload subassembly: {path}; errors={errors.value}, warnings={warnings.value}")
            opened.append(str(com_value(document,"GetTitle")))
        model=new_assembly(app)
        math_utility=app.GetMathUtility(); sw_type_info.invalidate_flag_cache(math_utility); sw_type_info.flag_methods(math_utility,"IMathUtility")
        identity=VARIANT(pythoncom.VT_ARRAY|pythoncom.VT_R8,[1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0])
        for instance,path in subassemblies:
            component=model.AddComponent5(str(path),0,"",False,"",0,0,0)
            if component is None: raise RuntimeError(f"Failed to insert subassembly: {path}")
            try: component.Name2=instance
            except Exception: pass
            component.Transform2=math_utility.CreateTransform(identity)
        set_custom_property(model,"Revision",REVISION); set_custom_property(model,"AssemblyArchitecture","INTERNAL + EXTERNAL STRUCTURE + EXTERNAL HARNESS SUBASSEMBLIES")
        model.ForceRebuild3(False)
        count=len(tuple(model.GetComponents(True) or ())); resolved_count=len(tuple(model.GetComponents(False) or ()))
        if count!=len(subassemblies): raise RuntimeError(f"Master top-level component count mismatch: {count}")
        native=output_dir/f"{FULL_ASSEMBLY_NAME}.SLDASM"; step=output_dir/f"{FULL_ASSEMBLY_NAME}.STEP"; save_document(model,native); save_document(model,step); normalize_step_line_endings(step)
        previews=[]
        for suffix,english,localized in (("isometric","*Isometric","*等轴测"),("front","*Front","*前视"),("right","*Right","*右视"),("top","*Top","*上视")):
            show_view(model,english,localized); path=output_dir/f"{FULL_ASSEMBLY_NAME}_{suffix}.png"; save_document(model,path); previews.append(path.name)
        close_preloaded_documents(app,opened); opened=[]; show_view(model,"*Isometric","*等轴测")
        save_document(model,native)
        return {"name":FULL_ASSEMBLY_NAME,"component_count":count,"resolved_component_count":resolved_count,"native":native.name,"step":step.name,"previews":previews,"left_open_in_solidworks":True}
    finally:
        if app is not None: close_preloaded_documents(app,opened)
        pythoncom.CoUninitialize()


async def main_async(args: argparse.Namespace) -> None:
    cad_root=Path(__file__).resolve().parents[1]; output_dir=(args.output_dir or cad_root/"models"/REVISION).resolve(); output_dir.mkdir(parents=True,exist_ok=True)
    native_result={"parts":[],"native_sweeps":len(INTERNAL_CABLES)+len(EXTERNAL_CABLES)+len(STRUCTURAL_SWEEPS)}
    if not args.reuse_parts: native_result=await build_native_geometry(output_dir)
    fixed=internal_placements(cad_root/"models"/"CAD-R0.5",output_dir)
    internal_extra=global_sweep_placements(output_dir,False)+[p for p in external_placements(output_dir) if p.key.startswith(("RF","G1","G2"))]
    external_fixed=[p for p in external_placements(output_dir) if not p.key.startswith(("RF","G1","G2"))]
    global_external=global_sweep_placements(output_dir,True)
    structure_extra=external_fixed+[p for p in global_external if p.key in {"B1","B2","S1","S2","S3","S4"}]
    external_harness_extra=[p for p in global_external if p.key in {"W1-EXT","W6-EXT","W7-EXT","W8-EXT"}]
    if args.full_only:
        internal={"name":INTERNAL_ASSEMBLY_NAME,"component_count":len(fixed)+len(internal_extra),"native":f"{INTERNAL_ASSEMBLY_NAME}.SLDASM","step":f"{INTERNAL_ASSEMBLY_NAME}.STEP","previews":[f"{INTERNAL_ASSEMBLY_NAME}_isometric.png",f"{INTERNAL_ASSEMBLY_NAME}_top.png",f"{INTERNAL_ASSEMBLY_NAME}_front.png"],"left_open_in_solidworks":False,"status":"REUSED_FROM_COMPLETED_ASSEMBLY_PASS"}
    else:
        internal=create_assembly(output_dir,INTERNAL_ASSEMBLY_NAME,fixed,internal_extra,False,(("isometric","*Isometric","*等轴测"),("top","*Top","*上视"),("front","*Front","*前视")))
    if args.master_only:
        structure={"name":STRUCTURE_ASSEMBLY_NAME,"native":f"{STRUCTURE_ASSEMBLY_NAME}.SLDASM","step":f"{STRUCTURE_ASSEMBLY_NAME}.STEP","status":"REUSED_FROM_COMPLETED_ASSEMBLY_PASS"}
        external_harness={"name":EXTERNAL_HARNESS_ASSEMBLY_NAME,"native":f"{EXTERNAL_HARNESS_ASSEMBLY_NAME}.SLDASM","step":f"{EXTERNAL_HARNESS_ASSEMBLY_NAME}.STEP","status":"REUSED_FROM_COMPLETED_ASSEMBLY_PASS"}
    else:
        structure=create_assembly(output_dir,STRUCTURE_ASSEMBLY_NAME,[],structure_extra,False,(("isometric","*Isometric","*等轴测"),("front","*Front","*前视"),("right","*Right","*右视")))
        external_harness=create_assembly(output_dir,EXTERNAL_HARNESS_ASSEMBLY_NAME,[],external_harness_extra,False,(("isometric","*Isometric","*等轴测"),("front","*Front","*前视")))
    full=create_master_assembly(output_dir,[("INTERNAL_NODE",output_dir/f"{INTERNAL_ASSEMBLY_NAME}.SLDASM"),("EXTERNAL_STRUCTURE",output_dir/f"{STRUCTURE_ASSEMBLY_NAME}.SLDASM"),("EXTERNAL_HARNESS",output_dir/f"{EXTERNAL_HARNESS_ASSEMBLY_NAME}.SLDASM")])
    artifacts=sorted(
        p for p in output_dir.iterdir()
        if p.is_file() and not p.name.startswith("~$")
    )
    manifest={"revision":REVISION,"scope":"native round harness plus symmetric complete external integration","manufacturing_status":"ENGINEERING CONCEPT / NOT FOR MANUFACTURE","solidworks":"2022 SP5.0","assemblies":[internal,structure,external_harness,full],"native_geometry":native_result,"validation":{"native_round_sweeps":len(INTERNAL_CABLES)+len(EXTERNAL_CABLES),"structural_native_sweeps":len(STRUCTURAL_SWEEPS),"port_center_z_mm":28,"rectangular_harness_reused":False,"solar_load_on_lid":False,"gnss_support_symmetric":True,"master_subassembly_count":3},"blocked_inputs":["BT-760 physical outer dimensions and TNC datum","BT-M87SF three-hole pattern","SWM-10W frame holes","enclosure rear mount interface","frame wall thickness fasteners and wind load","actual cable OD connector length and bend radius","XLS1 antenna model"],"artifacts":[{"name":p.name,"bytes":p.stat().st_size,"sha256":sha256(p)} for p in artifacts if p.name not in {"manifest.json","geometry-manifest.json"}]}
    (output_dir/"manifest.json").write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(json.dumps({"revision":REVISION,"assemblies":manifest["assemblies"],"artifacts":len(manifest["artifacts"])},ensure_ascii=False,indent=2))


def main() -> None:
    parser=argparse.ArgumentParser(); parser.add_argument("--output-dir",type=Path); parser.add_argument("--reuse-parts",action="store_true"); parser.add_argument("--full-only",action="store_true"); parser.add_argument("--master-only",action="store_true"); args=parser.parse_args(); asyncio.run(main_async(args))


if __name__ == "__main__": main()
