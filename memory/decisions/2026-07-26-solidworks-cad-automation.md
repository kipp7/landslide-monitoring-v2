---
title: solidworks-cad-automation
type: note
tags:
  - decision
  - hardware
  - cad
  - solidworks
status: accepted
---

# Decision: solidworks-cad-automation

## Context

The field-node enclosure work needs reproducible native CAD, STEP exports, and
review images rather than AI renders alone. The supplied
`jianjwu/codex_to_solidworks` repository has useful Windows/Codex wrappers, but
all 93 Python files in its nested MCP payload are protected and fail standard
Python compilation with `source code string cannot contain null bytes`.

## Decision

- Use SOLIDWORKS Premium 2022 SP5.0 through its version-independent
  `SldWorks.Application` COM interface.
- Reuse the derivative repository's deployment layout, but run the readable MIT
  upstream `andrewbartels1/SolidworksMCP-python` pinned to commit
  `0de875502281df298695ef4733cae03fd11e450f`.
- Keep the third-party checkout and virtual environment under
  `%LOCALAPPDATA%\Codex\SolidWorksMCP`; commit only bootstrap, launch, validation,
  parameter, and deterministic build scripts.
- Start the MCP server through `python -m solidworks_mcp.server`, because the
  upstream `run-mcp.ps1` welcome output pollutes the stdio JSON-RPC channel.
- Disable macro recording, use one live COM connection, and require both MCP
  status checks and physical artifact/volume validation.
- Track native SOLIDWORKS files with Git LFS and label `CAD-R0.1` as
  `REFERENCE ONLY / NOT FOR MANUFACTURE`.
- Load assembly references with the SolidWorks `Silent + ReadOnly` option, and
  package inherited R0.1/R0.2 SLDPRT files inside the new revision before opening
  them. SolidWorks can rewrite binary view/cache data despite a read-only request;
  revision-local copies prevent that behavior from dirtying released source CAD.
- Use `CAD-R0.3` for the first controlled internal layout assembly: the assembly
  is a seven-component packing study with a `272 x 193 x 3 mm` FR4 fit plate,
  not a manufacturing definition. Store a deterministic labeled SVG/PNG overlay
  beside the native SLDASM/STEP and A3 drawing, and include all output hashes in
  the manifest.
- Preserve released CAD history instead of silently overwriting it. `CAD-R0.2`
  supersedes only the tilt-reference plate hole definition: the sensor body has
  four diameter 3.6 mm clearance holes, while the steel plate has four
  `M3 x 0.5 - 6H THRU` tapped holes modeled with diameter 2.5 mm tap drills.

## Rationale

This preserves the 112-tool MCP implementation without accepting opaque Python
or unversioned workstation state. A pinned readable upstream can be audited and
reinstalled, while repository scripts capture the SW2022 localization fallback
needed for actual cut features. File existence, STEP headers, screenshots, and
calculated solid volume prevent a tool's false success response from becoming an
engineering release.

## Consequences

- Codex can create and export real SOLIDWORKS parts on this workstation.
- The project owns a small compatibility layer for Chinese SW2022 feature names
  and `FeatureCut3` direction handling.
- Updating the third-party commit is an explicit reviewed change, not an
  automatic floating dependency update.
- `CAD-R0.1` contains independent known-envelope parts only. A manufacturing
  assembly, FR4 DXF, and revised perimeter R1-R6 holes remain blocked by
  physical measurements.
- `CAD-R0.2/FN-SUB-002` contains the corrected SLDPRT, STEP, SLDDRW, PDF, PNG,
  and profile/tap-drill DXF. It remains `REVIEW REQUIRED` because the four
  plate-to-FR4 support holes are not frozen.
- `CAD-R0.3` verifies the nominal packing geometry and transform mapping, but its
  tray, battery, charger zone, and FR4 anchor interface remain provisional.
- The global Codex MCP path currently targets the hardware worktree and must be
  repointed after the branch is merged or moved.

## Follow-up

- Fit the `272 x 193 mm` rectangular template and measure perimeter R1-R6
  coordinates/heights/hole depths, battery, charger, panel holes, and cable
  interfaces.
- Replace nominal/estimated envelopes only through a new CAD revision.
- Replace the provisional R0.3 envelopes with measured parts, then build the
  manufacturing assembly and FR4 DXF after the blocking measurements.
- Review upstream changes before advancing the pinned MCP commit.
