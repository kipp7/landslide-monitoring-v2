from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

import pythoncom
import win32com.client
from win32com.client import VARIANT

from solidworks_mcp.adapters.base import ExtrusionParameters
from solidworks_mcp.adapters.pywin32_adapter import PyWin32Adapter
from solidworks_mcp.adapters import sw_type_info

import build_full_assembly_r06 as r06
from r07_design_inputs import CABLE_CLIP_POINTS, EXTERNAL_CABLES_R07


REVISION = "CAD-R0.7"
STRUCTURE_DETAIL_NAME = "FN-ASM-006A_structural-detail_R0.7"
HARNESS_DETAIL_NAME = "FN-ASM-006B_external-harness-retention_R0.7"
FULL_ASSEMBLY_NAME = "FN-ASM-006_full-field-node-detailed-concept_R0.7"


DETAIL_PRIMITIVES = (
    r06.PrimitiveSpec("FN-MNT-001_enclosure-back-strap-300x6x32_CONCEPT_R0.7", "box", (300, 6, 32), (0.42, 0.45, 0.48), "ENCLOSURE_REAR_INTERFACE_PENDING"),
    r06.PrimitiveSpec("FN-FST-001_M6-bolt-envelope-D6x55_PENDING_R0.7", "cylinder_y", (6, 55), (0.70, 0.72, 0.74), "FASTENER_GRADE_AND_LENGTH_PENDING"),
    r06.PrimitiveSpec("FN-FST-002_M6-washer-envelope-D14x2_PENDING_R0.7", "cylinder_y", (14, 2), (0.70, 0.72, 0.74), "WASHER_SELECTION_PENDING"),
    r06.PrimitiveSpec("FN-SOL-006_panel-back-rail-320x25x20_CONCEPT_R0.7", "box", (320, 25, 20), (0.30, 0.33, 0.36), "PANEL_HOLES_AND_SECTION_PENDING"),
    r06.PrimitiveSpec("FN-SOL-007_panel-edge-clamp-24x18x8_PENDING_R0.7", "box", (24, 18, 8), (0.68, 0.70, 0.72), "CLAMP_GEOMETRY_PENDING"),
    r06.PrimitiveSpec("FN-FST-003_solar-pivot-envelope-D8x40_PENDING_R0.7", "cylinder_x", (8, 40), (0.70, 0.72, 0.74), "PIVOT_FASTENER_PENDING"),
    r06.PrimitiveSpec("FN-GNS-005_mast-base-plate-90x80x8_CONCEPT_R0.7", "box", (90, 80, 8), (0.36, 0.39, 0.42), "MAST_CONNECTION_PENDING_LOAD"),
    r06.PrimitiveSpec("FN-FST-004_mast-bolt-envelope-D8x35_PENDING_R0.7", "cylinder_z", (8, 35), (0.70, 0.72, 0.74), "FASTENER_PATTERN_PENDING_LOAD"),
    r06.PrimitiveSpec("FN-FRM-008_tube-end-cap-30x30x3_CONCEPT_R0.7", "box", (30, 30, 3), (0.08, 0.09, 0.10), "END_CAP_SELECTION_PENDING"),
    r06.PrimitiveSpec("FN-FRM-009_foot-end-cap-50x3x30_CONCEPT_R0.7", "box", (50, 3, 30), (0.08, 0.09, 0.10), "END_CAP_SELECTION_PENDING"),
    r06.PrimitiveSpec("FN-FRM-010_foot-gusset-50x8x80_CONCEPT_R0.7", "box", (50, 8, 80), (0.30, 0.33, 0.36), "GUSSET_THICKNESS_AND_JOINT_PENDING"),
    r06.PrimitiveSpec("FN-HAR-036_P-clip-envelope-20x8x15_PENDING_R0.7", "box", (20, 8, 15), (0.16, 0.17, 0.18), "CLIP_SIZE_AND_CUSHION_PENDING"),
    r06.PrimitiveSpec("FN-HAR-037_lower-strain-relief-bar-110x12x8_CONCEPT_R0.7", "box", (110, 12, 8), (0.32, 0.35, 0.38), "LOWER_WALL_INTERFACE_PENDING"),
    r06.PrimitiveSpec("FN-FST-005_clip-fastener-envelope-D4x18_PENDING_R0.7", "cylinder_y", (4, 18), (0.68, 0.70, 0.72), "CLIP_FASTENER_PENDING"),
)


def primitive_path(output_dir: Path, name: str) -> Path:
    path = output_dir / f"{name}.SLDPRT"
    if not path.exists():
        raise RuntimeError(f"Missing R0.7 detail part: {path}")
    return path


def close_all_solidworks_documents() -> None:
    app = win32com.client.Dispatch("SldWorks.Application")
    try:
        app.CloseAllDocuments(True)
    except Exception:
        pass


async def build_detail_primitive(
    adapter: PyWin32Adapter,
    spec: r06.PrimitiveSpec,
    output_dir: Path,
) -> dict[str, Any]:
    if spec.kind != "cylinder_x":
        return await r06.build_primitive(adapter, spec, output_dir)

    r06.ensure_success("create cylinder-x part", await adapter.create_part())
    diameter, length = spec.dimensions_mm
    r06.ensure_success("cylinder-x sketch", await adapter.create_sketch("Right"))
    r06.ensure_success("cylinder-x circle", await adapter.add_circle(0, 0, diameter / 2))
    r06.ensure_success("exit cylinder-x sketch", await adapter.exit_sketch())
    r06.ensure_success(
        "cylinder-x extrusion",
        await adapter.create_extrusion(ExtrusionParameters(depth=length)),
    )
    r06.set_custom_property(adapter.currentModel, "Revision", REVISION)
    r06.set_custom_property(adapter.currentModel, "GeometryStatus", spec.status)
    return await r06.save_native_part(adapter, spec.name, output_dir)


async def build_native_geometry(output_dir: Path) -> dict[str, Any]:
    adapter = PyWin32Adapter({})
    await adapter.connect()
    built: list[dict[str, Any]] = []
    try:
        for spec in DETAIL_PRIMITIVES:
            outputs = (
                output_dir / f"{spec.name}.SLDPRT",
                output_dir / f"{spec.name}.STEP",
                output_dir / f"{spec.name}.png",
            )
            if all(path.exists() and path.stat().st_size > 0 for path in outputs):
                built.append({"name": spec.name, "status": "REUSED"})
            else:
                built.append(await build_detail_primitive(adapter, spec, output_dir))

    finally:
        try:
            await adapter.disconnect()
        except Exception:
            pass

    # SOLIDWORKS 2022 can retain stale sketch selections between consecutive
    # 3D sweeps, so isolate every cable in a fresh adapter session.
    for spec in EXTERNAL_CABLES_R07:
        outputs = (
            output_dir / f"{spec.name}.SLDPRT",
            output_dir / f"{spec.name}.STEP",
            output_dir / f"{spec.name}.png",
        )
        if all(path.exists() and path.stat().st_size > 0 for path in outputs):
            built.append({"name": spec.name, "wire_id": spec.wire_id, "status": "REUSED"})
            continue
        close_all_solidworks_documents()
        cable_adapter = PyWin32Adapter({})
        await cable_adapter.connect()
        try:
            built.append(await r06.build_sweep(cable_adapter, spec, output_dir))
        finally:
            try:
                await cable_adapter.disconnect()
            except Exception:
                pass
            close_all_solidworks_documents()
    return {
        "parts": built,
        "detail_primitive_count": len(DETAIL_PRIMITIVES),
        "native_round_cable_count": len(EXTERNAL_CABLES_R07),
    }


def make_placement(
    output_dir: Path,
    by_name: dict[str, r06.PrimitiveSpec],
    name: str,
    key: str,
    instance: str,
    center: tuple[float, float, float],
    transparency: float = 0.0,
    rotation_x_deg: float = 0.0,
    local_center_z_mm: float = 0.0,
) -> r06.AssemblyPlacement:
    spec = by_name[name]
    return r06.AssemblyPlacement(
        key,
        instance,
        primitive_path(output_dir, name),
        center,
        spec.color_rgb,
        transparency,
        rotation_x_deg,
        local_center_z_mm,
        spec.status,
    )


def structural_detail_placements(output_dir: Path) -> list[r06.AssemblyPlacement]:
    by_name = {spec.name: spec for spec in DETAIL_PRIMITIVES}
    result: list[r06.AssemblyPlacement] = []
    item = lambda name, key, instance, center, transparency=0.0, rotation=0.0, local_z=0.0: make_placement(
        output_dir, by_name, name, key, instance, center, transparency, rotation, local_z
    )

    strap = "FN-MNT-001_enclosure-back-strap-300x6x32_CONCEPT_R0.7"
    bolt = "FN-FST-001_M6-bolt-envelope-D6x55_PENDING_R0.7"
    washer = "FN-FST-002_M6-washer-envelope-D14x2_PENDING_R0.7"
    for z_mm in (35, 125):
        result.append(item(strap, f"STRAP-{z_mm}", f"ENCLOSURE_BACK_STRAP_Z{z_mm}", (0, 123, z_mm)))
        for x_mm in (-125, 125):
            suffix = f"X{x_mm}_Z{z_mm}"
            result.append(item(bolt, f"M6-{suffix}", f"ENCLOSURE_M6_BOLT_{suffix}", (x_mm, 137, z_mm)))
            result.append(item(washer, f"M6W-F-{suffix}", f"ENCLOSURE_WASHER_FRONT_{suffix}", (x_mm, 111, z_mm)))
            result.append(item(washer, f"M6W-R-{suffix}", f"ENCLOSURE_WASHER_REAR_{suffix}", (x_mm, 162, z_mm)))

    panel_rail = "FN-SOL-006_panel-back-rail-320x25x20_CONCEPT_R0.7"
    panel_clamp = "FN-SOL-007_panel-edge-clamp-24x18x8_PENDING_R0.7"
    for row, y_mm, z_mm in (("LOWER", 53.3, 264.7), ("UPPER", 167.9, 345.1)):
        result.append(item(panel_rail, f"PANEL-RAIL-{row}", f"PANEL_BACK_RAIL_{row}", (0, y_mm, z_mm), 0.0, 35, 10))
        for x_mm in (-137, 137):
            result.append(item(panel_clamp, f"PANEL-CLAMP-{row}-{x_mm}", f"PANEL_EDGE_CLAMP_{row}_{x_mm}", (x_mm, y_mm, z_mm), 0.0, 35, 4))

    pivot = "FN-FST-003_solar-pivot-envelope-D8x40_PENDING_R0.7"
    for x_mm in (-120, 120):
        for z_mm in (245, 385):
            result.append(item(pivot, f"PIVOT-{x_mm}-{z_mm}", f"SOLAR_PIVOT_X{x_mm}_Z{z_mm}", (x_mm, 145, z_mm)))

    mast_plate = "FN-GNS-005_mast-base-plate-90x80x8_CONCEPT_R0.7"
    mast_bolt = "FN-FST-004_mast-bolt-envelope-D8x35_PENDING_R0.7"
    result.append(item(mast_plate, "MAST-BASE", "GNSS_MAST_BASE_PLATE", (0, 145, 406)))
    for x_mm in (-32, 32):
        for y_mm in (120, 170):
            result.append(item(mast_bolt, f"MAST-BOLT-{x_mm}-{y_mm}", f"GNSS_MAST_BOLT_{x_mm}_{y_mm}", (x_mm, y_mm, 406)))

    rail_cap = "FN-FRM-008_tube-end-cap-30x30x3_CONCEPT_R0.7"
    for x_mm in (-120, 120):
        result.append(item(rail_cap, f"RAIL-CAP-B-{x_mm}", f"RAIL_BOTTOM_CAP_{x_mm}", (x_mm, 145, -81.5)))
        result.append(item(rail_cap, f"RAIL-CAP-T-{x_mm}", f"RAIL_TOP_CAP_{x_mm}", (x_mm, 145, 571.5)))

    foot_cap = "FN-FRM-009_foot-end-cap-50x3x30_CONCEPT_R0.7"
    gusset = "FN-FRM-010_foot-gusset-50x8x80_CONCEPT_R0.7"
    for x_mm in (-120, 120):
        for y_mm in (-171.5, 181.5):
            result.append(item(foot_cap, f"FOOT-CAP-{x_mm}-{y_mm}", f"FOOT_END_CAP_{x_mm}_{y_mm}", (x_mm, y_mm, -92)))
        for y_mm in (102, 158):
            result.append(item(gusset, f"GUSSET-{x_mm}-{y_mm}", f"FOOT_GUSSET_{x_mm}_{y_mm}", (x_mm, y_mm, -37)))
    return result


def harness_detail_placements(output_dir: Path) -> list[r06.AssemblyPlacement]:
    colors = {
        "W1-EXT": (0.95, 0.55, 0.05),
        "W6-EXT": (0.05, 0.36, 0.78),
        "W7-EXT": (0.88, 0.64, 0.08),
        "W8-EXT": (0.00, 0.62, 0.72),
    }
    result = [
        r06.AssemblyPlacement(
            spec.wire_id,
            f"{spec.wire_id}_R07_NATIVE_SWEEP",
            primitive_path(output_dir, spec.name),
            (0, 0, 0),
            colors[spec.wire_id],
            0.0,
            0.0,
            0.0,
            spec.status,
            spec.points_xyz_mm[0],
        )
        for spec in EXTERNAL_CABLES_R07
    ]

    by_name = {spec.name: spec for spec in DETAIL_PRIMITIVES}
    clip_name = "FN-HAR-036_P-clip-envelope-20x8x15_PENDING_R0.7"
    fastener_name = "FN-FST-005_clip-fastener-envelope-D4x18_PENDING_R0.7"
    for key, instance, center, color in CABLE_CLIP_POINTS:
        clip = make_placement(output_dir, by_name, clip_name, key, instance, center)
        result.append(r06.AssemblyPlacement(**{**clip.__dict__, "color_rgb": color}))
        result.append(make_placement(output_dir, by_name, fastener_name, f"{key}-F", f"{instance}_FASTENER", (center[0], center[1] + 5, center[2])))

    result.append(
        make_placement(
            output_dir,
            by_name,
            "FN-HAR-037_lower-strain-relief-bar-110x12x8_CONCEPT_R0.7",
            "LOWER-SR-BAR",
            "LOWER_WALL_STRAIN_RELIEF_BAR",
            (75, -151, 0),
        )
    )
    return result


def create_master_assembly(
    output_dir: Path,
    subassemblies: list[tuple[str, Path]],
) -> dict[str, Any]:
    pythoncom.CoInitialize()
    app = None
    model = None
    opened: list[str] = []
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        sw_type_info.invalidate_flag_cache(app)
        sw_type_info.flag_methods(app, "ISldWorks")
        app.Visible = True
        for _, path in subassemblies:
            errors = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
            warnings = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
            document = app.OpenDoc6(str(path), 2, 3, "", errors, warnings)
            if document is None:
                raise RuntimeError(f"Failed to preload subassembly: {path}")
            opened.append(str(r06.com_value(document, "GetTitle")))

        model = r06.new_assembly(app)
        math_utility = app.GetMathUtility()
        sw_type_info.invalidate_flag_cache(math_utility)
        sw_type_info.flag_methods(math_utility, "IMathUtility")
        identity = VARIANT(
            pythoncom.VT_ARRAY | pythoncom.VT_R8,
            [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
        )
        for instance, path in subassemblies:
            component = model.AddComponent5(str(path), 0, "", False, "", 0, 0, 0)
            if component is None:
                raise RuntimeError(f"Failed to insert subassembly: {path}")
            try:
                component.Name2 = instance
            except Exception:
                pass
            component.Transform2 = math_utility.CreateTransform(identity)

        r06.set_custom_property(model, "Revision", REVISION)
        r06.set_custom_property(
            model,
            "AssemblyArchitecture",
            "R0.6 INTERNAL + R0.6 STRUCTURE + R0.7 STRUCTURAL DETAILS + R0.7 RETAINED HARNESS",
        )
        r06.set_custom_property(model, "ManufacturingStatus", "ENGINEERING CONCEPT / NOT FOR MANUFACTURE")
        model.ForceRebuild3(False)
        top_level_count = len(tuple(model.GetComponents(True) or ()))
        resolved_count = len(tuple(model.GetComponents(False) or ()))
        if top_level_count != len(subassemblies):
            raise RuntimeError(f"Master component count mismatch: {top_level_count}")

        native = output_dir / f"{FULL_ASSEMBLY_NAME}.SLDASM"
        step = output_dir / f"{FULL_ASSEMBLY_NAME}.STEP"
        r06.save_document(model, native)
        r06.save_document(model, step)
        r06.normalize_step_line_endings(step)
        previews: list[str] = []
        for suffix, english, localized in (
            ("isometric", "*Isometric", "*等轴测"),
            ("front", "*Front", "*前视"),
            ("right", "*Right", "*右视"),
            ("top", "*Top", "*上视"),
        ):
            r06.show_view(model, english, localized)
            preview = output_dir / f"{FULL_ASSEMBLY_NAME}_{suffix}.png"
            r06.save_document(model, preview)
            previews.append(preview.name)

        r06.close_preloaded_documents(app, opened)
        opened = []
        r06.show_view(model, "*Isometric", "*等轴测")
        r06.save_document(model, native)
        return {
            "name": FULL_ASSEMBLY_NAME,
            "component_count": top_level_count,
            "resolved_component_count": resolved_count,
            "native": native.name,
            "step": step.name,
            "previews": previews,
            "left_open_in_solidworks": True,
        }
    finally:
        if app is not None:
            r06.close_preloaded_documents(app, opened)
        pythoncom.CoUninitialize()


async def main_async(args: argparse.Namespace) -> None:
    r06.REVISION = REVISION
    cad_root = Path(__file__).resolve().parents[1]
    output_dir = (args.output_dir or cad_root / "models" / REVISION).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    r06_root = cad_root / "models" / "CAD-R0.6"
    base_internal = r06_root / "FN-ASM-004_internal-round-harness_R0.6.SLDASM"
    base_structure = r06_root / "FN-ASM-005A_external-structure_R0.6.SLDASM"
    for dependency in (base_internal, base_structure):
        if not dependency.exists():
            raise RuntimeError(f"Missing CAD-R0.6 dependency: {dependency}")

    if args.manifest_only:
        manifest_path = output_dir / "manifest.json"
        if not manifest_path.exists():
            raise RuntimeError("--manifest-only requires an existing CAD-R0.7 manifest")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        manifest["base_dependencies"] = [
            {
                "name": path.name,
                "revision": "CAD-R0.6",
                "bytes": path.stat().st_size,
                "sha256": r06.sha256(path),
            }
            for path in (base_internal, base_structure)
        ]
        artifacts = sorted(
            path
            for path in output_dir.iterdir()
            if path.is_file()
            and path.name != "manifest.json"
            and not path.name.startswith("~$")
        )
        manifest["artifacts"] = [
            {
                "name": path.name,
                "bytes": path.stat().st_size,
                "sha256": r06.sha256(path),
            }
            for path in artifacts
        ]
        manifest_path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
            newline="\n",
        )
        print(
            json.dumps(
                {
                    "revision": REVISION,
                    "artifacts": len(manifest["artifacts"]),
                    "dependencies": len(manifest["base_dependencies"]),
                    "mode": "manifest-only",
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return

    native_geometry = await build_native_geometry(output_dir)
    structural = r06.create_assembly(
        output_dir,
        STRUCTURE_DETAIL_NAME,
        [],
        structural_detail_placements(output_dir),
        False,
        (
            ("isometric", "*Isometric", "*等轴测"),
            ("front", "*Front", "*前视"),
            ("right", "*Right", "*右视"),
        ),
    )
    harness = r06.create_assembly(
        output_dir,
        HARNESS_DETAIL_NAME,
        [],
        harness_detail_placements(output_dir),
        False,
        (
            ("isometric", "*Isometric", "*等轴测"),
            ("front", "*Front", "*前视"),
        ),
    )
    full = create_master_assembly(
        output_dir,
        [
            ("INTERNAL_R06", base_internal),
            ("EXTERNAL_STRUCTURE_R06", base_structure),
            ("STRUCTURAL_DETAILS_R07", output_dir / f"{STRUCTURE_DETAIL_NAME}.SLDASM"),
            ("RETAINED_HARNESS_R07", output_dir / f"{HARNESS_DETAIL_NAME}.SLDASM"),
        ],
    )

    dependencies = [
        {
            "name": path.name,
            "revision": "CAD-R0.6",
            "bytes": path.stat().st_size,
            "sha256": r06.sha256(path),
        }
        for path in (base_internal, base_structure)
    ]
    artifacts = sorted(
        path
        for path in output_dir.iterdir()
        if path.is_file() and not path.name.startswith("~$")
    )
    manifest = {
        "revision": REVISION,
        "scope": "structural connection details plus frame-retained external harness",
        "manufacturing_status": "ENGINEERING CONCEPT / NOT FOR MANUFACTURE",
        "solidworks": "2022 SP5.0",
        "assemblies": [structural, harness, full],
        "base_dependencies": dependencies,
        "native_geometry": native_geometry,
        "validation": {
            "rectangular_harness_reused": False,
            "external_round_sweep_count": len(EXTERNAL_CABLES_R07),
            "cable_clip_count": len(CABLE_CLIP_POINTS),
            "enclosure_back_strap_count": 2,
            "solar_back_rail_count": 2,
            "solar_edge_clamp_count": 4,
            "master_subassembly_count": 4,
            "nominal_lid_to_back_strap_gap_mm": 0.55,
            "panel_back_rail_normal_offset_mm": 18.5,
            "mast_clip_nominal_overlap_mm": 5.0,
        },
        "blocked_inputs": [
            "enclosure rear mounting hole table and plastic wall capacity",
            "SWM-10W frame hole table and approved clamp geometry",
            "BT-760 physical envelope and TNC datum",
            "BT-M87SF three-hole pattern and mounting stack",
            "frame tube wall thickness fastener grades wind and transport loads",
            "actual cable OD connector length minimum bend radius and P-clip sizes",
            "XLS1 external antenna model ground-plane and connector requirements",
        ],
        "artifacts": [
            {
                "name": path.name,
                "bytes": path.stat().st_size,
                "sha256": r06.sha256(path),
            }
            for path in artifacts
            if path.name != "manifest.json"
        ],
    }
    (output_dir / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        json.dumps(
            {
                "revision": REVISION,
                "assemblies": manifest["assemblies"],
                "artifacts": len(manifest["artifacts"]),
                "dependencies": len(dependencies),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--manifest-only", action="store_true")
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
