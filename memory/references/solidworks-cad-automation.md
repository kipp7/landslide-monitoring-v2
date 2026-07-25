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

# Inspect the global Codex registration.
codex mcp get solidworks_mcp
```

## Files

- `hardware/field-node/cad/README.md`: CAD release boundary and workflow.
- `hardware/field-node/cad/parameters/field-node-cad-inputs.csv`: controlled
  input status and measurement blockers.
- `hardware/field-node/cad/automation/build_reference_parts.py`: deterministic
  part build and geometry validation.
- `hardware/field-node/cad/models/CAD-R0.1/manifest.json`: artifact sizes,
  expected volumes, and measured model volumes.
- `%LOCALAPPDATA%\Codex\SolidWorksMCP\source`: pinned third-party checkout and
  virtual environment; never commit it.

## Notes

- Verified installation: SOLIDWORKS Premium 2022 SP5.0, API revision `30.5.0`.
- Verified MCP: FastMCP 3.4.4, 112 tools, upstream commit `0de8755`.
- The active Codex process must be restarted or reloaded after MCP registration.
- Do not use the protected nested payload from `jianjwu/codex_to_solidworks`.
- Never accept tool `isError=false` alone; also inspect structured `status`,
  confirm files exist, verify STEP headers, and validate geometry/volume.
