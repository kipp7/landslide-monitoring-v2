from __future__ import annotations

import argparse
import asyncio
import json
import shutil
from dataclasses import replace
from pathlib import Path
from typing import Any

import pythoncom
import win32com.client
from win32com.client import VARIANT

from solidworks_mcp.adapters.base import ExtrusionParameters
from solidworks_mcp.adapters.pywin32_adapter import PyWin32Adapter
from solidworks_mcp.adapters import sw_type_info

import build_detail_assembly_r07 as r07
import build_full_assembly_r06 as r06
from build_tilt_interface_r02 import add_note, com_value, standard_view_name
from r08_design_inputs import DETAIL_ASSEMBLIES, SECTION_PARTS, WALL_DETAIL_CABLES


REVISION = "CAD-R0.8"
PACKAGE_PDF = "FN-DRW-008_connection-detail-review-package_R0.8.pdf"


def dependency_path(cad_root: Path, revision: str, name: str, suffix: str = ".SLDPRT") -> Path:
    path = cad_root / "models" / revision / f"{name}{suffix}"
    if not path.exists() or path.stat().st_size == 0:
        raise RuntimeError(f"Missing dependency: {path}")
    return path


def generated_part_path(output_dir: Path, name: str) -> Path:
    path = output_dir / f"{name}.SLDPRT"
    if not path.exists() or path.stat().st_size == 0:
        raise RuntimeError(f"Missing generated part: {path}")
    return path


async def build_perforated_plate(
    adapter: PyWin32Adapter,
    spec: Any,
    output_dir: Path,
) -> dict[str, Any]:
    r06.ensure_success("create perforated plate", await adapter.create_part())
    r06.ensure_success("plate sketch", await adapter.create_sketch(spec.sketch_plane))
    r06.ensure_success(
        "plate rectangle",
        await adapter.add_rectangle(
            -spec.size_u_mm / 2.0,
            -spec.size_v_mm / 2.0,
            spec.size_u_mm / 2.0,
            spec.size_v_mm / 2.0,
        ),
    )
    for u_mm, v_mm, diameter_mm in spec.holes_uvd_mm:
        r06.ensure_success(
            f"plate hole {u_mm},{v_mm}",
            await adapter.add_circle(u_mm, v_mm, diameter_mm / 2.0),
        )
    r06.ensure_success("exit plate sketch", await adapter.exit_sketch())
    r06.ensure_success(
        "plate extrusion",
        await adapter.create_extrusion(ExtrusionParameters(depth=spec.thickness_mm)),
    )
    r06.set_custom_property(adapter.currentModel, "Revision", REVISION)
    r06.set_custom_property(adapter.currentModel, "GeometryStatus", spec.status)
    r06.set_custom_property(adapter.currentModel, "ManufacturingStatus", "NOT FOR MANUFACTURE")
    result = await r06.save_native_part(adapter, spec.name, output_dir)
    result.update(
        {
            "geometry": "PERFORATED_SECTION_REVIEW_PART",
            "hole_count": len(spec.holes_uvd_mm),
            "status": spec.status,
        }
    )
    return result


def close_generated_document() -> None:
    app = win32com.client.Dispatch("SldWorks.Application")
    try:
        title = str(com_value(app.ActiveDoc, "GetTitle")) if app.ActiveDoc else ""
        if title.startswith(("Part", "零件")):
            app.CloseDoc(title)
    except Exception:
        pass


async def build_native_geometry(output_dir: Path) -> dict[str, Any]:
    built: list[dict[str, Any]] = []
    for spec in SECTION_PARTS:
        outputs = tuple(output_dir / f"{spec.name}{suffix}" for suffix in (".SLDPRT", ".STEP", ".png"))
        if all(path.exists() and path.stat().st_size > 0 for path in outputs):
            built.append({"name": spec.name, "status": "REUSED"})
            continue
        adapter = PyWin32Adapter({})
        await adapter.connect()
        try:
            built.append(await build_perforated_plate(adapter, spec, output_dir))
        finally:
            try:
                await adapter.disconnect()
            except Exception:
                pass
            close_generated_document()

    for spec in WALL_DETAIL_CABLES:
        outputs = tuple(output_dir / f"{spec.name}{suffix}" for suffix in (".SLDPRT", ".STEP", ".png"))
        if all(path.exists() and path.stat().st_size > 0 for path in outputs):
            built.append({"name": spec.name, "wire_id": spec.wire_id, "status": "REUSED"})
            continue
        adapter = PyWin32Adapter({})
        await adapter.connect()
        try:
            built.append(await r06.build_sweep(adapter, spec, output_dir))
        finally:
            try:
                await adapter.disconnect()
            except Exception:
                pass
            close_generated_document()
    return {
        "parts": built,
        "section_part_count": len(SECTION_PARTS),
        "native_round_cable_count": len(WALL_DETAIL_CABLES),
    }


def placement(
    path: Path,
    key: str,
    instance: str,
    center: tuple[float, float, float],
    color: tuple[float, float, float],
    transparency: float = 0.0,
    rotation_x_deg: float = 0.0,
    local_center_z_mm: float = 0.0,
    status: str = "CONCEPT_REVIEW",
    origin: tuple[float, float, float] | None = None,
) -> r06.AssemblyPlacement:
    return r06.AssemblyPlacement(
        key,
        instance,
        path,
        center,
        color,
        transparency,
        rotation_x_deg,
        local_center_z_mm,
        status,
        origin,
    )


def enclosure_detail(cad_root: Path, output_dir: Path) -> list[r06.AssemblyPlacement]:
    coupon = generated_part_path(output_dir, SECTION_PARTS[0].name)
    strap = dependency_path(cad_root, "CAD-R0.7", "FN-MNT-001_enclosure-back-strap-300x6x32_CONCEPT_R0.7")
    bolt = dependency_path(cad_root, "CAD-R0.7", "FN-FST-001_M6-bolt-envelope-D6x55_PENDING_R0.7")
    washer = dependency_path(cad_root, "CAD-R0.7", "FN-FST-002_M6-washer-envelope-D14x2_PENDING_R0.7")
    cross = dependency_path(cad_root, "CAD-R0.6", "FN-FRM-003_crossmember-330x30x30_CONCEPT_R0.6")
    result = [
        placement(coupon, "wall", "ENCLOSURE_REAR_SECTION_COUPON", (0, 0, 0), (0.76, 0.80, 0.84), 0.68, status=SECTION_PARTS[0].status),
        placement(strap, "strap", "LOAD_DISTRIBUTION_STRAP", (0, 5, 0), (0.42, 0.45, 0.48)),
        placement(cross, "cross", "COMMON_FRAME_CROSSMEMBER", (0, 28, 0), (0.18, 0.20, 0.23), 0.25),
    ]
    for x_mm in (-125, 125):
        suffix = "L" if x_mm < 0 else "R"
        result.extend(
            (
                placement(bolt, f"bolt-{suffix}", f"M6_NOMINAL_BOLT_{suffix}", (x_mm, 8, 0), (0.70, 0.72, 0.74)),
                placement(washer, f"washer-front-{suffix}", f"M6_FRONT_WASHER_{suffix}", (x_mm, -3, 0), (0.70, 0.72, 0.74)),
                placement(washer, f"washer-rear-{suffix}", f"M6_REAR_WASHER_{suffix}", (x_mm, 15, 0), (0.70, 0.72, 0.74)),
            )
        )
    return result


def solar_detail(cad_root: Path) -> list[r06.AssemblyPlacement]:
    p = lambda rev, name: dependency_path(cad_root, rev, name)
    panel = p("CAD-R0.6", "FN-SOL-004_swm10w-panel-envelope_R0.6")
    face = p("CAD-R0.6", "FN-SOL-005_swm10w-active-face_R0.6")
    rail = p("CAD-R0.7", "FN-SOL-006_panel-back-rail-320x25x20_CONCEPT_R0.7")
    clamp = p("CAD-R0.7", "FN-SOL-007_panel-edge-clamp-24x18x8_PENDING_R0.7")
    pivot = p("CAD-R0.7", "FN-FST-003_solar-pivot-envelope-D8x40_PENDING_R0.7")
    cross = p("CAD-R0.6", "FN-FRM-003_crossmember-330x30x30_CONCEPT_R0.6")
    result = [
        placement(panel, "panel", "SWM10W_PANEL_TRANSPARENT", (0, 0, 0), (0.60, 0.64, 0.68), 0.55, 35, 8.5),
        placement(face, "face", "SWM10W_ACTIVE_FACE", (0, -3.2, 5), (0.04, 0.10, 0.17), 0.15, 35, 2),
        placement(cross, "cross-l", "LOWER_SUPPORT_CROSSMEMBER", (0, 45, -75), (0.18, 0.20, 0.23), 0.40),
        placement(cross, "cross-u", "UPPER_SUPPORT_CROSSMEMBER", (0, 45, 65), (0.18, 0.20, 0.23), 0.40),
    ]
    for row, y_mm, z_mm in (("LOWER", -46.7, -55.3), ("UPPER", 67.9, 25.1)):
        result.append(placement(rail, f"rail-{row}", f"PANEL_BACK_RAIL_{row}", (0, y_mm, z_mm), (0.30, 0.33, 0.36), 0.0, 35, 10))
        for x_mm in (-137, 137):
            result.append(placement(clamp, f"clamp-{row}-{x_mm}", f"EDGE_CLAMP_{row}_{x_mm}", (x_mm, y_mm, z_mm), (0.68, 0.70, 0.72), 0.0, 35, 4))
    for x_mm in (-120, 120):
        for y_mm, z_mm in ((45, -75), (45, 65)):
            result.append(placement(pivot, f"pivot-{x_mm}-{z_mm}", f"PIVOT_{x_mm}_{z_mm}", (x_mm, y_mm, z_mm), (0.70, 0.72, 0.74)))
    return result


def gnss_detail(cad_root: Path, output_dir: Path) -> list[r06.AssemblyPlacement]:
    p = lambda rev, name: dependency_path(cad_root, rev, name)
    mast = p("CAD-R0.6", "FN-FRM-004_mast-30x30x220_CONCEPT_R0.6")
    cross = p("CAD-R0.6", "FN-FRM-003_crossmember-330x30x30_CONCEPT_R0.6")
    platform = p("CAD-R0.6", "FN-GNS-002_mast-platform-120x120x6_CONCEPT_R0.6")
    base = generated_part_path(output_dir, SECTION_PARTS[2].name)
    bolt = p("CAD-R0.7", "FN-FST-004_mast-bolt-envelope-D8x35_PENDING_R0.7")
    btm = p("CAD-R0.6", "FN-GNS-003_BTM87SF-envelope_D78x24_PENDING_R0.6")
    ant = p("CAD-R0.6", "FN-GNS-004_BT760-envelope_D180x70_PENDING_R0.6")
    result = [
        placement(cross, "cross", "UPPER_COMMON_CROSSMEMBER", (0, 0, -135), (0.18, 0.20, 0.23), 0.35),
        placement(base, "base", "FOUR_HOLE_MAST_BASE_PLATE", (0, 0, -114), (0.36, 0.39, 0.42), status=SECTION_PARTS[2].status),
        placement(mast, "mast", "CENTRAL_SHORT_MAST", (0, 0, 0), (0.18, 0.20, 0.23)),
        placement(platform, "platform", "GNSS_PLATFORM", (0, 0, 113), (0.38, 0.41, 0.44)),
        placement(btm, "btm", "BTM87SF_NOMINAL_ENVELOPE", (0, 0, 128), (0.60, 0.62, 0.64), 0.25),
        placement(ant, "antenna", "BT760_NOMINAL_ENVELOPE", (0, 0, 175), (0.92, 0.92, 0.88), 0.55),
    ]
    for x_mm in (-32, 32):
        for y_mm in (-25, 25):
            result.append(placement(bolt, f"bolt-{x_mm}-{y_mm}", f"BASE_BOLT_{x_mm}_{y_mm}", (x_mm, y_mm, -114), (0.70, 0.72, 0.74)))
    colors = {"B1": (0.38, 0.41, 0.44), "B2": (0.38, 0.41, 0.44)}
    for spec in r06.STRUCTURAL_SWEEPS[:2]:
        source = p("CAD-R0.6", spec.name)
        ox, oy, oz = spec.points_xyz_mm[0]
        result.append(
            placement(
                source,
                spec.wire_id,
                f"{spec.wire_id}_SYMMETRIC_BRACE",
                (0, 0, 0),
                colors[spec.wire_id],
                origin=(ox, oy - 145, oz - 520),
                status="CONCEPT_SYMMETRIC_BRACE",
            )
        )
    return result


def wall_detail(cad_root: Path, output_dir: Path) -> list[r06.AssemblyPlacement]:
    p = lambda rev, name: dependency_path(cad_root, rev, name)
    wall = generated_part_path(output_dir, SECTION_PARTS[1].name)
    sma_body = p("CAD-R0.6", "FN-IFC-002_sma-bulkhead-envelope-D12x34_R0.6")
    sma_cap = p("CAD-R0.6", "FN-IFC-003_sma-collar-envelope-D17x5_R0.6")
    gland = p("CAD-R0.6", "FN-IFC-004_m16-gland-envelope-D24x34_R0.6")
    gland_cap = p("CAD-R0.6", "FN-IFC-005_m16-cap-envelope-D29x5_R0.6")
    bar = p("CAD-R0.7", "FN-HAR-037_lower-strain-relief-bar-110x12x8_CONCEPT_R0.7")
    clip = p("CAD-R0.7", "FN-HAR-036_P-clip-envelope-20x8x15_PENDING_R0.7")
    fastener = p("CAD-R0.7", "FN-FST-005_clip-fastener-envelope-D4x18_PENDING_R0.7")
    result = [
        placement(wall, "wall", "LOWER_WALL_FOUR_PORT_SECTION", (0, -120, 28), (0.76, 0.80, 0.84), 0.45, status=SECTION_PARTS[1].status),
        placement(bar, "bar", "EXTERNAL_STRAIN_RELIEF_BAR", (75, -151, 0), (0.32, 0.35, 0.38)),
    ]
    for port, x_mm, body, cap in (
        ("RF1", -118, sma_body, sma_cap),
        ("RF2", -82, sma_body, sma_cap),
        ("G2", 60, gland, gland_cap),
        ("G1", 110, gland, gland_cap),
    ):
        result.append(placement(body, f"{port}-body", f"{port}_THROUGH_BODY", (x_mm, -120, 28), (0.66, 0.68, 0.70)))
        result.append(placement(cap, f"{port}-cap", f"{port}_OUTER_CAP", (x_mm, -139.5, 28), (0.18, 0.19, 0.20)))
    colors = {
        "W7-SEC": (0.88, 0.64, 0.08),
        "W8-SEC": (0.00, 0.62, 0.72),
        "W6-SEC": (0.05, 0.36, 0.78),
        "W1-SEC": (0.95, 0.55, 0.05),
    }
    for spec in WALL_DETAIL_CABLES:
        result.append(
            placement(
                generated_part_path(output_dir, spec.name),
                spec.wire_id,
                f"{spec.wire_id}_NATIVE_ROUND_SWEEP",
                (0, 0, 0),
                colors[spec.wire_id],
                origin=spec.points_xyz_mm[0],
                status=spec.status,
            )
        )
    for key, x_mm, color in (("G2", 60, colors["W6-SEC"]), ("G1", 110, colors["W1-SEC"])):
        result.extend(
            (
                placement(clip, f"clip-{key}", f"{key}_P_CLIP_ENVELOPE", (x_mm, -151, 0), color),
                placement(fastener, f"clip-fastener-{key}", f"{key}_CLIP_FASTENER", (x_mm, -146, 0), (0.68, 0.70, 0.72)),
            )
        )
    return result


def create_detail_assembly(
    output_dir: Path,
    name: str,
    placements: list[r06.AssemblyPlacement],
) -> dict[str, Any]:
    pythoncom.CoInitialize()
    app = None
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        sw_type_info.invalidate_flag_cache(app)
        sw_type_info.flag_methods(app, "ISldWorks")
        app.Visible = True
        for path in dict.fromkeys(item.path for item in placements):
            errors = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
            warnings = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
            document = app.OpenDoc6(str(path), 1, 3, "", errors, warnings)
            if document is None:
                raise RuntimeError(f"Failed to preload detail dependency: {path}")
        model = r06.new_assembly(app)
        for item in placements:
            r06.insert_assembly_placement(model, app, item)
        r06.set_custom_property(model, "Revision", REVISION)
        r06.set_custom_property(model, "ManufacturingStatus", "ENGINEERING REVIEW / NOT FOR MANUFACTURE")
        r06.set_custom_property(model, "DetailRepresentation", "TRANSPARENT CONTEXT + SECTION REVIEW PARTS")
        model.ForceRebuild3(False)
        component_count = len(tuple(model.GetComponents(False) or ()))
        if component_count != len(placements):
            raise RuntimeError(f"Component count mismatch: {component_count} != {len(placements)}")
        native = output_dir / f"{name}.SLDASM"
        step = output_dir / f"{name}.STEP"
        r06.save_document(model, native)
        r06.save_document(model, step)
        r06.normalize_step_line_endings(step)
        previews: list[str] = []
        for suffix, english, localized in (
            ("isometric", "*Isometric", "*等轴测"),
            ("front", "*Front", "*前视"),
            ("right-section", "*Right", "*右视"),
        ):
            r06.show_view(model, english, localized)
            preview = output_dir / f"{name}_{suffix}.png"
            r06.save_document(model, preview)
            previews.append(preview.name)
        r06.show_view(model, "*Isometric", "*等轴测")
        r06.save_document(model, native)
        return {
            "name": name,
            "component_count": component_count,
            "native": native.name,
            "step": step.name,
            "previews": previews,
            "left_open_in_solidworks": True,
        }
    finally:
        # Each isolated phase runs in its own Python process. Calling
        # CoUninitialize while saved SOLIDWORKS documents are still active can
        # block on SW2022, so process exit owns COM teardown.
        pass


def create_detail_drawing(
    assembly_path: Path,
    output_dir: Path,
    drawing_template: Path,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    pythoncom.CoInitialize()
    app = None
    assembly_model = None
    drawing_model = None
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        app.Visible = True
        errors = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        warnings = VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        assembly_model = app.OpenDoc6(str(assembly_path), 2, 3, "", errors, warnings)
        if assembly_model is None:
            raise RuntimeError(f"Failed to open assembly for drawing: {assembly_path}")
        drawing_model = app.NewDocument(str(drawing_template), 12, 0.420, 0.297)
        if drawing_model is None:
            raise RuntimeError("Failed to create A3 detail drawing")
        front_name = standard_view_name(assembly_model, "*Front", "*前视")
        right_name = standard_view_name(assembly_model, "*Right", "*右视")
        iso_name = standard_view_name(assembly_model, "*Isometric", "*等轴测")
        front = drawing_model.CreateDrawViewFromModelView3(str(assembly_path), front_name, 0.088, 0.166, 0.0)
        right = drawing_model.CreateDrawViewFromModelView3(str(assembly_path), right_name, 0.215, 0.166, 0.0)
        iso = drawing_model.CreateDrawViewFromModelView3(str(assembly_path), iso_name, 0.345, 0.166, 0.0)
        if front is None or right is None or iso is None:
            raise RuntimeError(f"Failed to create all detail views: {assembly_path.name}")
        scale = float(metadata["scale"])
        front.ScaleDecimal = scale
        right.ScaleDecimal = scale
        iso.ScaleDecimal = scale * 0.72
        add_note(drawing_model, metadata["title"], 0.020, 0.282, 4.8)
        add_note(drawing_model, f"{REVISION} | CONNECTION DETAIL REVIEW | NOT FOR MANUFACTURE", 0.020, 0.271, 3.4)
        add_note(drawing_model, metadata["subtitle"], 0.220, 0.276, 3.2)
        add_note(drawing_model, "FRONT / SECTION CONTEXT", 0.040, 0.245, 3.0)
        add_note(drawing_model, "RIGHT / LOAD PATH", 0.165, 0.245, 3.0)
        add_note(drawing_model, "ISOMETRIC / INTERFACE CONTEXT", 0.295, 0.245, 3.0)
        for index, note in enumerate(metadata["notes"]):
            add_note(drawing_model, f"{index + 1}. {note}", 0.025, 0.050 - index * 0.012, 3.0)
        drawing_model.ViewZoomtofit2()
        drawing_model.ForceRebuild3(False)
        stem = assembly_path.stem
        drawing = output_dir / f"{stem}.SLDDRW"
        pdf = output_dir / f"{stem}.pdf"
        preview = output_dir / f"{stem}_drawing.png"
        r06.save_document(drawing_model, drawing)
        r06.save_document(drawing_model, pdf)
        r06.save_document(drawing_model, preview)
        return {
            "native": drawing.name,
            "pdf": pdf.name,
            "preview": preview.name,
            "drawing_bytes": drawing.stat().st_size,
            "pdf_bytes": pdf.stat().st_size,
            "preview_bytes": preview.stat().st_size,
        }
    finally:
        # SW2022 can block indefinitely while closing a saved detail assembly
        # whose read-only references are still used by a drawing. The R0.8
        # build therefore keeps saved documents open for the short batch and
        # the caller restarts the CAD session after artifact validation.
        # See create_detail_assembly: isolated process exit owns COM teardown.
        pass


def close_detail_documents(assembly_path: Path, placements: list[r06.AssemblyPlacement]) -> None:
    app = win32com.client.Dispatch("SldWorks.Application")
    titles = [assembly_path.name, *(item.path.name for item in placements)]
    for title in dict.fromkeys(titles):
        try:
            app.CloseDoc(title)
        except Exception:
            pass


def merge_pdfs(output_dir: Path, pdf_names: list[str]) -> dict[str, Any]:
    from pypdf import PdfReader, PdfWriter

    writer = PdfWriter()
    page_count = 0
    for name in pdf_names:
        reader = PdfReader(str(output_dir / name))
        for page in reader.pages:
            writer.add_page(page)
            page_count += 1
    package = output_dir / PACKAGE_PDF
    with package.open("wb") as stream:
        writer.write(stream)
    return {"name": package.name, "pages": page_count, "bytes": package.stat().st_size}


def collect_dependencies(placements_by_name: dict[str, list[r06.AssemblyPlacement]], output_dir: Path) -> list[dict[str, Any]]:
    paths = sorted(
        {
            item.path.resolve()
            for placements in placements_by_name.values()
            for item in placements
            if item.path.resolve().parent != output_dir.resolve()
        },
        key=lambda path: path.name,
    )
    return [
        {
            "name": path.name,
            "source_revision": path.parent.name,
            "bytes": path.stat().st_size,
            "sha256": r06.sha256(path),
        }
        for path in paths
    ]


def package_dependency_parts(
    placements_by_name: dict[str, list[r06.AssemblyPlacement]],
    output_dir: Path,
) -> dict[str, list[r06.AssemblyPlacement]]:
    packaged: dict[str, list[r06.AssemblyPlacement]] = {}
    for name, placements in placements_by_name.items():
        packaged[name] = []
        for item in placements:
            source = item.path.resolve()
            if source.parent == output_dir.resolve():
                packaged[name].append(item)
                continue
            destination = output_dir / source.name
            if not destination.exists() or r06.sha256(destination) != r06.sha256(source):
                shutil.copy2(source, destination)
            packaged[name].append(replace(item, path=destination))
    return packaged


async def main_async(args: argparse.Namespace) -> None:
    r06.REVISION = REVISION
    cad_root = Path(__file__).resolve().parents[1]
    output_dir = (args.output_dir or cad_root / "models" / REVISION).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_dir / "manifest.json"
    if args.manifest_only:
        if not manifest_path.exists():
            raise RuntimeError("--manifest-only requires an existing CAD-R0.8 manifest")
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        artifacts = sorted(path for path in output_dir.iterdir() if path.is_file() and path.name != "manifest.json" and not path.name.startswith("~$"))
        manifest["artifacts"] = [{"name": path.name, "bytes": path.stat().st_size, "sha256": r06.sha256(path)} for path in artifacts]
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(json.dumps({"revision": REVISION, "mode": "manifest-only", "artifacts": len(artifacts)}, indent=2))
        return
    if args.assembly_index is None and args.drawing_index is None and not args.finalize_only:
        raise RuntimeError(
            "Select --assembly-index 0..3, --drawing-index 0..3, or --finalize-only; "
            "R0.8 phases must use isolated SOLIDWORKS sessions"
        )

    native_geometry = {
        "parts": [],
        "section_part_count": len(SECTION_PARTS),
        "native_round_cable_count": len(WALL_DETAIL_CABLES),
    }
    if args.drawing_index is None and not args.finalize_only:
        native_geometry = await build_native_geometry(output_dir)
    source_placements_by_name = {
        DETAIL_ASSEMBLIES[0]["name"]: enclosure_detail(cad_root, output_dir),
        DETAIL_ASSEMBLIES[1]["name"]: solar_detail(cad_root),
        DETAIL_ASSEMBLIES[2]["name"]: gnss_detail(cad_root, output_dir),
        DETAIL_ASSEMBLIES[3]["name"]: wall_detail(cad_root, output_dir),
    }
    dependencies = collect_dependencies(source_placements_by_name, output_dir)
    placements_by_name = package_dependency_parts(source_placements_by_name, output_dir)
    if args.assembly_index is not None:
        metadata = DETAIL_ASSEMBLIES[args.assembly_index]
        name = metadata["name"]
        assembly = create_detail_assembly(output_dir, name, placements_by_name[name])
        print(json.dumps({"revision": REVISION, "phase": "assembly", "index": args.assembly_index, "assembly": assembly}, indent=2))
        return
    if args.drawing_index is not None:
        metadata = DETAIL_ASSEMBLIES[args.drawing_index]
        name = metadata["name"]
        drawing = create_detail_drawing(output_dir / f"{name}.SLDASM", output_dir, args.drawing_template, metadata)
        print(json.dumps({"revision": REVISION, "phase": "drawing", "index": args.drawing_index, "drawing": drawing}, indent=2))
        return
    assemblies: list[dict[str, Any]] = []
    if args.finalize_only:
        for metadata in DETAIL_ASSEMBLIES:
            name = metadata["name"]
            drawing_path = output_dir / f"{name}.SLDDRW"
            pdf_path = output_dir / f"{name}.pdf"
            preview_path = output_dir / f"{name}_drawing.png"
            required = (
                output_dir / f"{name}.SLDASM",
                output_dir / f"{name}.STEP",
                drawing_path,
                pdf_path,
                preview_path,
            )
            for path in required:
                if not path.exists() or path.stat().st_size == 0:
                    raise RuntimeError(f"Cannot finalize missing artifact: {path}")
            assemblies.append(
                {
                    "name": name,
                    "component_count": len(placements_by_name[name]),
                    "native": f"{name}.SLDASM",
                    "step": f"{name}.STEP",
                    "previews": [f"{name}_{suffix}.png" for suffix in ("isometric", "front", "right-section")],
                    "left_open_in_solidworks": False,
                    "drawing": {
                        "native": drawing_path.name,
                        "pdf": pdf_path.name,
                        "preview": preview_path.name,
                        "drawing_bytes": drawing_path.stat().st_size,
                        "pdf_bytes": pdf_path.stat().st_size,
                        "preview_bytes": preview_path.stat().st_size,
                    },
                }
            )
    else:
        for metadata in DETAIL_ASSEMBLIES:
            name = metadata["name"]
            assembly = create_detail_assembly(output_dir, name, placements_by_name[name])
            assembly["drawing"] = create_detail_drawing(output_dir / assembly["native"], output_dir, args.drawing_template, metadata)
            assembly["left_open_in_solidworks"] = True
            assemblies.append(assembly)
    package = merge_pdfs(output_dir, [item["drawing"]["pdf"] for item in assemblies])
    artifacts = sorted(path for path in output_dir.iterdir() if path.is_file() and path.name != "manifest.json" and not path.name.startswith("~$"))
    manifest = {
        "revision": REVISION,
        "scope": "four context-rich connection details with sectional review drawings",
        "manufacturing_status": "ENGINEERING REVIEW / NOT FOR MANUFACTURE",
        "solidworks": "2022 SP5.0",
        "assemblies": assemblies,
        "drawing_package": package,
        "native_geometry": native_geometry,
        "base_dependencies": dependencies,
        "validation": {
            "detail_assembly_count": len(assemblies),
            "native_drawing_count": len(assemblies),
            "section_context_part_count": len(SECTION_PARTS),
            "native_round_wall_detail_cable_count": len(WALL_DETAIL_CABLES),
            "drawing_package_page_count": package["pages"],
            "nominal_panel_back_rail_offset_mm": 18.5,
            "nominal_mast_base_hole_count": 4,
            "nominal_lower_wall_cutout_count": 4,
            "released_manufacturing_drawings": 0,
        },
        "blocked_inputs": [
            "enclosure rear hole table and wall capacity",
            "SWM-10W frame hole table and approved edge clamp geometry",
            "BT-M87SF three-hole pattern installation height and BT-760 TNC datum",
            "frame tube wall thickness joint design fastener grades wind and transport loads",
            "actual cable OD connector length bend radius gland and P-clip samples",
            "XLS1 antenna interface and ground-plane requirement",
        ],
        "artifacts": [{"name": path.name, "bytes": path.stat().st_size, "sha256": r06.sha256(path)} for path in artifacts],
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"revision": REVISION, "assemblies": len(assemblies), "artifacts": len(artifacts), "dependencies": len(dependencies), "drawing_pages": package["pages"]}, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--drawing-template", type=Path, default=Path(r"E:\2\SolidWorks2022\SOLIDWORKS\data\templates\gb.drwdot"))
    parser.add_argument("--manifest-only", action="store_true")
    parser.add_argument("--assembly-index", type=int, choices=range(len(DETAIL_ASSEMBLIES)))
    parser.add_argument("--drawing-index", type=int, choices=range(len(DETAIL_ASSEMBLIES)))
    parser.add_argument("--finalize-only", action="store_true")
    args = parser.parse_args()
    asyncio.run(main_async(args))


if __name__ == "__main__":
    main()
