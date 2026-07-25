from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
import pythoncom
import win32com.client


@dataclass(frozen=True)
class PartSpec:
    filename: str
    width_mm: float
    height_mm: float
    depth_mm: float
    status: str
    holes_xy_mm: tuple[tuple[float, float], ...] = ()
    hole_diameter_mm: float | None = None


PARTS = (
    PartSpec("FN-ENC-001_enclosure-outer-envelope_R0.1", 317.9, 238.9, 144.6, "NOMINAL"),
    PartSpec("FN-PLT-001_fr4-max-envelope_R0.1", 265.0, 185.0, 3.0, "NOMINAL"),
    PartSpec(
        "FN-SUB-001_tilt-reference-plate_R0.1",
        120.0,
        85.0,
        3.0,
        "VERIFIED",
        ((-39.0, -19.5), (39.0, -19.5), (-39.0, 19.5), (39.0, 19.5)),
        3.6,
    ),
    PartSpec("FN-PCB-001_carrier-board-envelope_R0.1", 170.0, 115.0, 1.6, "VERIFIED_XY_NOMINAL_Z"),
    PartSpec(
        "FN-SEN-001_tilt-transmitter-envelope_R0.1",
        90.0,
        58.0,
        36.0,
        "VERIFIED",
        ((-39.0, -19.5), (39.0, -19.5), (-39.0, 19.5), (39.0, 19.5)),
        3.6,
    ),
    PartSpec("FN-BAT-001_battery-envelope_ESTIMATED_R0.1", 70.0, 55.0, 40.0, "ESTIMATED"),
    PartSpec("FN-SOL-001_swm10w-panel-envelope_R0.1", 290.0, 240.0, 17.0, "VERIFIED"),
)


def result_text(result: Any) -> str:
    return " ".join(getattr(block, "text", str(block)) for block in result.content)


async def call(session: ClientSession, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    result = await session.call_tool(name, arguments)
    if result.isError:
        raise RuntimeError(f"{name} failed: {result_text(result)}")
    structured = result.structuredContent or {"text": result_text(result)}
    if str(structured.get("status", "success")).lower() == "error":
        raise RuntimeError(f"{name} failed: {structured.get('message', structured)}")
    return structured


def cut_last_profile_through_all(depth_mm: float) -> str:
    """Create a real cut on localized SW2022 feature trees.

    The upstream MCP cut helper searches for English ``Sketch<N>`` names and
    passes the wrong direction for a Top-plane positive extrusion in SW2022.
    Select the newest ProfileFeature independent of UI language, then try the
    two valid direction states using the exact 26-argument FeatureCut3 signature.
    """

    pythoncom.CoInitialize()
    try:
        app = win32com.client.Dispatch("SldWorks.Application")
        model = app.ActiveDoc
        if model is None:
            raise RuntimeError("No active SOLIDWORKS document for cut fallback")

        feature = model.FirstFeature
        last_profile = None
        while feature is not None:
            if feature.GetTypeName2 == "ProfileFeature":
                last_profile = feature
            feature = feature.GetNextFeature
        if last_profile is None:
            raise RuntimeError("No ProfileFeature found for mounting-hole cut")

        cut_feature = None
        for reverse_direction in (True, False):
            model.ClearSelection2(True)
            if not last_profile.Select2(False, 0):
                raise RuntimeError(f"Failed to select profile {last_profile.Name}")
            cut_feature = model.FeatureManager.FeatureCut3(
                True,
                False,
                reverse_direction,
                0,
                0,
                depth_mm / 1000.0,
                depth_mm / 1000.0,
                False,
                False,
                False,
                False,
                0.0,
                0.0,
                False,
                False,
                False,
                False,
                False,
                False,
                True,
                False,
                False,
                False,
                0,
                0.0,
                False,
            )
            if cut_feature is not None:
                break
        if cut_feature is None:
            raise RuntimeError("SW2022 FeatureCut3 returned no feature")
        model.ForceRebuild3(False)
        model.ClearSelection2(True)
        return str(cut_feature.Name)
    finally:
        pythoncom.CoUninitialize()


async def build_part(session: ClientSession, spec: PartSpec, output_dir: Path) -> dict[str, Any]:
    half_x = spec.width_mm / 2.0
    half_y = spec.height_mm / 2.0
    await call(session, "create_part", {"input_data": {"name": spec.filename, "units": "mm"}})
    await call(session, "create_sketch", {"input_data": {"plane": "Top", "sketch_name": "EnvelopeSketch"}})
    await call(
        session,
        "add_rectangle",
        {"input_data": {"x1": -half_x, "y1": -half_y, "x2": half_x, "y2": half_y}},
    )
    await call(session, "exit_sketch", {})
    await call(
        session,
        "create_extrusion",
        {"input_data": {"sketch_name": "EnvelopeSketch", "depth": spec.depth_mm, "direction": "blind"}},
    )

    if spec.holes_xy_mm:
        if spec.hole_diameter_mm is None:
            raise RuntimeError(f"{spec.filename}: hole diameter is missing")
        await call(session, "create_sketch", {"input_data": {"plane": "Top", "sketch_name": "MountingHoles"}})
        for x_mm, y_mm in spec.holes_xy_mm:
            await call(
                session,
                "add_circle",
                {"input_data": {"center_x": x_mm, "center_y": y_mm, "radius": spec.hole_diameter_mm / 2.0}},
            )
        await call(session, "exit_sketch", {})
        cut_last_profile_through_all(spec.depth_mm + 2.0)

    mass_result = await call(session, "get_mass_properties", {"input_data": {"units": "metric"}})
    actual_volume = float(mass_result["mass_properties"]["volume"]["value"])
    hole_volume = len(spec.holes_xy_mm) * math.pi * (float(spec.hole_diameter_mm or 0.0) / 2.0) ** 2 * spec.depth_mm
    expected_volume = spec.width_mm * spec.height_mm * spec.depth_mm - hole_volume
    if not math.isclose(actual_volume, expected_volume, rel_tol=0.0, abs_tol=0.5):
        raise RuntimeError(
            f"{spec.filename}: volume mismatch, expected {expected_volume:.3f} mm^3, "
            f"got {actual_volume:.3f} mm^3"
        )

    native = output_dir / f"{spec.filename}.SLDPRT"
    step = output_dir / f"{spec.filename}.STEP"
    preview = output_dir / f"{spec.filename}.png"
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
                "view_orientation": "isometric",
            }
        },
    )
    await call(session, "close_model", {"input_data": {"save": True}})

    for artifact in (native, step, preview):
        if not artifact.exists() or artifact.stat().st_size == 0:
            raise RuntimeError(f"Expected artifact was not created: {artifact}")
    if not step.read_text(encoding="latin-1", errors="ignore").startswith("ISO-10303-21"):
        raise RuntimeError(f"Invalid STEP header: {step}")

    return {
        "part": spec.filename,
        "status": spec.status,
        "native_bytes": native.stat().st_size,
        "step_bytes": step.stat().st_size,
        "preview_bytes": preview.stat().st_size,
        "expected_volume_mm3": round(expected_volume, 3),
        "actual_volume_mm3": round(actual_volume, 3),
    }


async def build(server_script: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    params = StdioServerParameters(
        command="powershell",
        args=["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(server_script)],
        cwd=str(server_script.parents[4]),
        env=os.environ.copy(),
    )
    manifest: list[dict[str, Any]] = []
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            for spec in PARTS:
                item = await build_part(session, spec, output_dir)
                manifest.append(item)
                print(json.dumps(item, ensure_ascii=False))

    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(
            {
                "revision": "CAD-R0.1",
                "manufacturing_status": "NOT FOR MANUFACTURE",
                "solidworks": "2022 SP5.0",
                "upstream_commit": "0de875502281df298695ef4733cae03fd11e450f",
                "parts": manifest,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


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
        default=cad_root / "models" / "CAD-R0.1",
    )
    args = parser.parse_args()
    asyncio.run(build(args.server_script.resolve(), args.output_dir.resolve()))


if __name__ == "__main__":
    main()
