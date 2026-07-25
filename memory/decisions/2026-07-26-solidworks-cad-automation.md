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
  assembly, FR4 DXF, and P1-P6 holes remain blocked by physical measurements.
- The global Codex MCP path currently targets the hardware worktree and must be
  repointed after the branch is merged or moved.

## Follow-up

- Measure the enclosure scallops, P1-P6 coordinates/heights/hole depths, battery,
  charger, panel holes, and cable interfaces.
- Replace nominal/estimated envelopes only through a new CAD revision.
- Build the first controlled assembly and DXF after the blocking measurements.
- Review upstream changes before advancing the pinned MCP commit.
