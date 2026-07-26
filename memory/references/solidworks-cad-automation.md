---
title: solidworks-cad-automation
type: note
tags:
  - reference
  - hardware
  - cad
  - solidworks
status: active
---

# Reference: solidworks-cad-automation

## Purpose

Stable workstation commands and paths for rebuilding the field-node SOLIDWORKS
reference models.

## Commands

```powershell
# Install the pinned readable MCP upstream.
powershell -NoProfile -ExecutionPolicy Bypass -File hardware/field-node/cad/scripts/Install-SolidWorksMcp.ps1

# Keep SOLIDWORKS 2022 open, then verify COM and the required MCP tools.
powershell -NoProfile -ExecutionPolicy Bypass -File hardware/field-node/cad/scripts/Test-SolidWorksMcp.ps1

# Rebuild CAD-R0.1 and its SLDPRT/STEP/PNG/manifest artifacts.
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_reference_parts.py

# Rebuild the corrected CAD-R0.2 tilt plate and drawing/export set.
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_tilt_interface_r02.py

# Rebuild the current CAD-R0.4 layout/harness assembly and manifest.
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_layout_assembly_r04.py

# Inspect the global Codex registration.
codex mcp get solidworks_mcp
```

## Files

- `hardware/field-node/cad/README.md`: CAD release boundary and workflow.
- `hardware/field-node/cad/parameters/field-node-cad-inputs.csv`: controlled
  input status and measurement blockers.
- `hardware/field-node/cad/automation/build_reference_parts.py`: deterministic
  part build and geometry validation.
- `hardware/field-node/cad/automation/build_tilt_interface_r02.py`: corrected
  M3 tilt-plate build, localized SW2022 drawing creation, PDF/PNG export, and
  validated CNC DXF generation.
- `hardware/field-node/cad/automation/build_layout_assembly_r04.py`: 8-hole
  FR4, measured-envelope module layout, concept harness, assembly/drawing, and
  deterministic labeled view generation.
- `hardware/field-node/cad/models/CAD-R0.1/manifest.json`: artifact sizes,
  expected volumes, and measured model volumes.
- `hardware/field-node/cad/models/CAD-R0.2/manifest.json`: corrected interface,
  final artifact sizes, volumes, and SHA-256 checksums.
- `hardware/field-node/cad/models/CAD-R0.4/manifest.json`: 18 generated bodies,
  23 component transforms, route topology, layout checks, and artifact hashes.
- `%LOCALAPPDATA%\Codex\SolidWorksMCP\source`: pinned third-party checkout and
  virtual environment; never commit it.

## Notes

- Verified installation: SOLIDWORKS Premium 2022 SP5.0, API revision `30.5.0`.
- Verified MCP: FastMCP 3.4.4, 112 tools, upstream commit `0de8755`.
- The active Codex process must be restarted or reloaded after MCP registration.
- Do not use the protected nested payload from `jianjwu/codex_to_solidworks`.
- Never accept tool `isError=false` alone; also inspect structured `status`,
  confirm files exist, verify STEP headers, and validate geometry/volume.
- The upstream `close_model` tool can intermittently fail on SW2022 with
  `'str' object is not callable`; `safe_close_model` falls back to scoped COM
  closing. Same-title historical packaged parts must be closed before preloading
  a newer assembly revision.
