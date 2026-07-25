from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import pythoncom
import win32com.client

from build_reference_parts import PartSpec, build_part


REVISION = "CAD-R0.2"
PART_NAME = "FN-SUB-002_tilt-reference-plate_M3_R0.2"
PLATE_X_MM = 120.0
PLATE_Y_MM = 85.0
PLATE_Z_MM = 3.0
THREAD_SPEC = "M3 x 0.5 - 6H THRU"
TAP_DRILL_DIAMETER_MM = 2.5
HOLES_FROM_CENTER_MM = (
    (-39.0, -19.5),
    (39.0, -19.5),
    (-39.0, 19.5),
    (39.0, 19.5),
)
HOLES_FROM_LOWER_LEFT_MM = (
    (21.0, 23.0),
    (99.0, 23.0),
    (21.0, 62.0),
    (99.0, 62.0),
)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def normalize_step_line_endings(path: Path) -> None:
    data = path.read_bytes()
    normalized = data.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
    if normalized != data:
        path.write_bytes(normalized)


def write_profile_dxf(path: Path) -> None:
    """Write an ASCII DXF with one closed profile and four tap-drill circles."""

    pairs: list[tuple[int, str | int | float]] = [
        (0, "SECTION"),
        (2, "HEADER"),
        (9, "$ACADVER"),
        (1, "AC1015"),
        (9, "$INSUNITS"),
        (70, 4),
        (0, "ENDSEC"),
        (0, "SECTION"),
        (2, "ENTITIES"),
        (0, "LWPOLYLINE"),
        (100, "AcDbEntity"),
        (8, "PROFILE"),
        (100, "AcDbPolyline"),
        (90, 4),
        (70, 1),
    ]
    for x_mm, y_mm in (
        (0.0, 0.0),
        (PLATE_X_MM, 0.0),
        (PLATE_X_MM, PLATE_Y_MM),
        (0.0, PLATE_Y_MM),
    ):
        pairs.extend(((10, x_mm), (20, y_mm)))
    for x_mm, y_mm in HOLES_FROM_LOWER_LEFT_MM:
        pairs.extend(
            (
                (0, "CIRCLE"),
                (100, "AcDbEntity"),
                (8, "M3_TAP_DRILL_D2.5"),
                (100, "AcDbCircle"),
                (10, x_mm),
                (20, y_mm),
                (30, 0.0),
                (40, TAP_DRILL_DIAMETER_MM / 2.0),
            )
        )
    pairs.extend(((0, "ENDSEC"), (0, "EOF")))
    path.write_text(
        "".join(f"{code}\n{value}\n" for code, value in pairs),
        encoding="ascii",
        newline="\n",
    )


def validate_profile_dxf(path: Path) -> None:
    lines = path.read_text(encoding="ascii").splitlines()
    if len(lines) % 2:
        raise RuntimeError("DXF group-code stream has an odd number of lines")
    pairs = [(int(lines[index]), lines[index + 1]) for index in range(0, len(lines), 2)]
    circles: list[tuple[float, float, float]] = []
    index = 0
    while index < len(pairs):
        if pairs[index] == (0, "CIRCLE"):
            entity: dict[int, str] = {}
            index += 1
            while index < len(pairs) and pairs[index][0] != 0:
                entity[pairs[index][0]] = pairs[index][1]
                index += 1
            circles.append((float(entity[10]), float(entity[20]), 2.0 * float(entity[40])))
            continue
        index += 1
    expected = [(*xy, TAP_DRILL_DIAMETER_MM) for xy in HOLES_FROM_LOWER_LEFT_MM]
    if circles != expected:
        raise RuntimeError(f"DXF circle mismatch: expected {expected}, got {circles}")


def set_custom_property(model: Any, name: str, value: str) -> None:
    manager = model.Extension.CustomPropertyManager("")
    # swCustomInfoText=30, swCustomPropertyReplaceValue=2.
    manager.Add3(name, 30, value, 2)


def com_value(obj: Any, name: str) -> Any:
    value = getattr(obj, name)
    return value() if callable(value) else value


def close_output_documents(output_dir: Path) -> None:
    pythoncom.CoInitialize()
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        documents = app.GetDocuments or ()
        resolved_output = output_dir.resolve()
        for document in documents:
            document_path = str(document.GetPathName or "")
            if document_path and Path(document_path).resolve().is_relative_to(
                resolved_output
            ):
                app.CloseDoc(str(document.GetTitle))
    finally:
        pythoncom.CoUninitialize()


def document_titles() -> set[str]:
    pythoncom.CoInitialize()
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        return {str(document.GetTitle) for document in (app.GetDocuments or ())}
    finally:
        pythoncom.CoUninitialize()


def close_new_unsaved_documents(existing_titles: set[str]) -> None:
    pythoncom.CoInitialize()
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        for document in app.GetDocuments or ():
            title = str(document.GetTitle)
            if title not in existing_titles and not str(document.GetPathName or ""):
                app.CloseDoc(title)
    finally:
        pythoncom.CoUninitialize()


def standard_view_name(part_model: Any, english: str, localized: str) -> str:
    names = tuple(str(name) for name in com_value(part_model, "GetModelViewNames"))
    for candidate in (english, localized):
        if candidate in names:
            return candidate
    raise RuntimeError(f"Standard view {english}/{localized} not found in {names}")


def add_note(model: Any, text: str, x_m: float, y_m: float, height_mm: float = 3.5) -> None:
    note = model.InsertNote(text)
    if note is None:
        raise RuntimeError(f"Failed to insert drawing note: {text}")
    annotation = note.GetAnnotation
    annotation.SetPosition2(x_m, y_m, 0.0)
    try:
        text_format = note.GetTextFormat(0)
        text_format.CharHeight = height_mm / 1000.0
        note.SetTextFormat(0, False, text_format)
    except Exception:
        # Font sizing varies across localized SW2022 templates; note content and
        # position are the release-critical values.
        pass


def save_document(model: Any, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    result = model.SaveAs3(str(path), 0, 0)
    if (not result or not path.exists()) and hasattr(model, "SaveAs"):
        result = model.SaveAs(str(path))
    if not path.exists() or path.stat().st_size == 0:
        raise RuntimeError(f"SOLIDWORKS failed to save {path}")


def create_drawing(part_path: Path, output_dir: Path, template: Path) -> dict[str, Any]:
    pythoncom.CoInitialize()
    app = None
    part_model = None
    drawing_model = None
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        app.Visible = True
        open_errors = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        open_warnings = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        part_model = app.OpenDoc6(
            str(part_path), 1, 1, "", open_errors, open_warnings
        )
        if part_model is None:
            raise RuntimeError(f"Failed to open part for drawing: {part_path}")
        set_custom_property(part_model, "PartNumber", "FN-SUB-002")
        set_custom_property(part_model, "Revision", REVISION)
        set_custom_property(part_model, "Material", "304 stainless steel, 3 mm")
        set_custom_property(part_model, "ThreadSpec", THREAD_SPEC)
        set_custom_property(part_model, "ManufacturingStatus", "REVIEW REQUIRED")
        save_errors = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        save_warnings = win32com.client.VARIANT(pythoncom.VT_BYREF | pythoncom.VT_I4, 0)
        if not part_model.Save3(1, save_errors, save_warnings):
            raise RuntimeError(
                f"Failed to save part properties: errors={save_errors.value}, "
                f"warnings={save_warnings.value}"
            )

        drawing_model = app.NewDocument(str(template), 12, 0.420, 0.297)
        if drawing_model is None:
            raise RuntimeError(f"Failed to create drawing from template: {template}")
        top_name = standard_view_name(part_model, "*Top", "*上视")
        iso_name = standard_view_name(part_model, "*Isometric", "*等轴测")
        right_name = standard_view_name(part_model, "*Right", "*右视")
        top_view = drawing_model.CreateDrawViewFromModelView3(
            str(part_path), top_name, 0.125, 0.165, 0.0
        )
        iso_view = drawing_model.CreateDrawViewFromModelView3(
            str(part_path), iso_name, 0.315, 0.165, 0.0
        )
        side_view = drawing_model.CreateDrawViewFromModelView3(
            str(part_path), right_name, 0.125, 0.075, 0.0
        )
        if top_view is None or iso_view is None or side_view is None:
            raise RuntimeError("Failed to create all required drawing views")
        top_view.ScaleDecimal = 1.0
        iso_view.ScaleDecimal = 0.65
        side_view.ScaleDecimal = 1.0

        add_note(drawing_model, "FN-SUB-002  TILT REFERENCE PLATE", 0.025, 0.282, 5.0)
        add_note(drawing_model, "CAD-R0.2 | REVIEW REQUIRED", 0.025, 0.272, 3.5)
        add_note(drawing_model, "MATERIAL: 304 STAINLESS STEEL, t=3 mm", 0.225, 0.275)
        add_note(drawing_model, "OUTLINE: 120 x 85 mm", 0.225, 0.263)
        add_note(drawing_model, "4 x M3 x 0.5 - 6H THRU", 0.225, 0.251)
        add_note(drawing_model, "TAP DRILL MODEL: 4 x DIA 2.5 THRU", 0.225, 0.239)
        add_note(drawing_model, "HOLE CENTRES FROM LOWER LEFT:", 0.225, 0.225)
        add_note(drawing_model, "(21,23) (99,23) (21,62) (99,62) mm", 0.225, 0.213)
        add_note(drawing_model, "PITCH: 78 x 39 mm", 0.225, 0.201)
        add_note(drawing_model, "DEBURR; BREAK SHARP EDGES; PASSIVATE", 0.225, 0.085)
        add_note(drawing_model, "DO NOT ADD FR4 SUPPORT HOLES UNTIL LAYOUT FREEZE", 0.225, 0.072)
        add_note(drawing_model, "SENSOR BODY HOLES ARE DIA 3.6; PLATE HOLES ARE M3 TAPPED", 0.225, 0.059)

        drawing_model.ViewZoomtofit2()
        drawing_model.ForceRebuild3(False)
        drawing_path = output_dir / f"{PART_NAME}.SLDDRW"
        pdf_path = output_dir / f"{PART_NAME}.pdf"
        png_path = output_dir / f"{PART_NAME}_drawing.png"
        save_document(drawing_model, drawing_path)
        save_document(drawing_model, pdf_path)
        save_document(drawing_model, png_path)

        drawing_title = str(com_value(drawing_model, "GetTitle"))
        part_title = str(com_value(part_model, "GetTitle"))
        app.CloseDoc(drawing_title)
        app.CloseDoc(part_title)
        drawing_model = None
        part_model = None
        return {
            "drawing_bytes": drawing_path.stat().st_size,
            "pdf_bytes": pdf_path.stat().st_size,
            "drawing_preview_bytes": png_path.stat().st_size,
        }
    finally:
        if app is not None:
            for document in (drawing_model, part_model):
                if document is None:
                    continue
                try:
                    app.CloseDoc(str(com_value(document, "GetTitle")))
                except Exception:
                    pass
        pythoncom.CoUninitialize()


async def build(server_script: Path, output_dir: Path, drawing_template: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    close_output_documents(output_dir)
    existing_titles = document_titles()
    spec = PartSpec(
        PART_NAME,
        PLATE_X_MM,
        PLATE_Y_MM,
        PLATE_Z_MM,
        "DESIGN_M3_TAPPED",
        HOLES_FROM_CENTER_MM,
        TAP_DRILL_DIAMETER_MM,
    )
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
                part_result = await build_part(session, spec, output_dir)
    finally:
        close_new_unsaved_documents(existing_titles)

    part_path = output_dir / f"{PART_NAME}.SLDPRT"
    step_path = output_dir / f"{PART_NAME}.STEP"
    normalize_step_line_endings(step_path)
    part_result["step_bytes"] = step_path.stat().st_size
    drawing_result = create_drawing(part_path, output_dir, drawing_template)
    part_result["native_bytes"] = part_path.stat().st_size
    dxf_path = output_dir / f"{PART_NAME}_profile-tap-drill.DXF"
    write_profile_dxf(dxf_path)
    validate_profile_dxf(dxf_path)

    artifacts = sorted(path for path in output_dir.iterdir() if path.is_file())
    manifest = {
        "revision": REVISION,
        "scope": "tilt-reference-plate interface correction",
        "manufacturing_status": "REVIEW REQUIRED",
        "supersedes": "FN-SUB-001 hole definition in CAD-R0.1",
        "solidworks": "2022 SP5.0",
        "part": part_result,
        "drawing": drawing_result,
        "interface": {
            "plate_mm": [PLATE_X_MM, PLATE_Y_MM, PLATE_Z_MM],
            "thread": THREAD_SPEC,
            "modeled_tap_drill_diameter_mm": TAP_DRILL_DIAMETER_MM,
            "hole_centres_from_lower_left_mm": HOLES_FROM_LOWER_LEFT_MM,
            "sensor_clearance_holes_mm": 3.6,
            "warning": "Do not copy the sensor body's 3.6 mm clearance holes into the tapped plate.",
        },
        "artifacts": [
            {
                "name": path.name,
                "bytes": path.stat().st_size,
                "sha256": sha256(path),
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
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main() -> None:
    cad_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--server-script",
        type=Path,
        default=cad_root / "scripts" / "Start-SolidWorksMcp.ps1",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=cad_root / "models" / REVISION,
    )
    parser.add_argument(
        "--drawing-template",
        type=Path,
        default=Path(r"E:\2\SolidWorks2022\SOLIDWORKS\data\templates\gb.drwdot"),
    )
    args = parser.parse_args()
    asyncio.run(
        build(
            args.server_script.resolve(),
            args.output_dir.resolve(),
            args.drawing_template.resolve(),
        )
    )


if __name__ == "__main__":
    main()
