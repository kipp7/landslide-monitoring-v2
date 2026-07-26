---
title: field-node-solidworks-cad-2026-07-26
type: note
tags:
  - checkpoint
  - hardware
  - cad
  - solidworks
status: active
---

# Checkpoint: field-node-solidworks-cad-2026-07-26

## Objective

Establish a reproducible SOLIDWORKS 2022 automation environment and begin the
field-node digital mechanical model without inventing unresolved dimensions.

## Last Confirmed State

- SOLIDWORKS Premium 2022 SP5.0 is installed at
  `E:\2\SolidWorks2022\SOLIDWORKS\sldworks.exe` and reports API `30.5.0`.
- COM dispatch, native SLDPRT saving, STEP export, and PNG export work with paths
  containing Chinese characters.
- The readable MCP upstream is pinned at `0de8755`, installed under LocalAppData,
  and registered globally as Codex MCP server `solidworks_mcp`.
- A clean stdio client handshake lists 112 tools.
- `CAD-R0.1` generated seven independent reference parts, STEP files, previews,
  and a manifest. Every output exists, has a valid STEP header, and matches its
  theoretical solid volume within 0.5 mm3.
- The tilt subplate and tilt-transmitter models have real 4 x diameter 3.6 mm
  cuts at 78 x 39 mm pitch. The FR4 envelope intentionally has no P1-P6 holes.
- Native SOLIDWORKS files are configured for Git LFS.
- CAD automation baseline commit `785c709c63e315d0b7be4277d7769fc24550b43c`
  is pushed to `origin/docs/hardware-field-node-evt0-1`.
- The push uploaded all seven tracked `.SLDPRT` files through Git LFS; local and
  remote branch tips were verified at the same commit.
- `CAD-R0.2` corrects the tilt-reference plate interface without overwriting
  `CAD-R0.1`: `FN-SUB-002` uses four diameter 2.5 mm tap-drill holes governed by
  `M3 x 0.5 - 6H THRU`; the sensor body alone retains diameter 3.6 mm holes.
- The corrected SLDPRT/STEP/SLDDRW/PDF/PNG/DXF set exists. Solid volume matches
  `30541.095 mm3`, DXF coordinates round-trip exactly, and the rendered A3 PDF
  has one nonblank page with readable, non-overlapping views and notes.
- `MECH-R0.3-DRAFT` changes the FR4 direction to a rectangular fit trial. The
  supplier `276.0655 x 197 mm` envelope is nominal; the engineering candidate is
  `272 x 193 x 3 mm` with about 2 mm clearance per side. The previous P1-P6 boss
  choice is superseded for the enlarged plate, and new perimeter R1-R6 points
  must be selected and physically measured.
- `CAD-R0.3` now contains a reproducible seven-component internal layout
  assembly, native/STEP outputs, exploded/isometric/top previews, an A3 drawing,
  and a deterministic labeled top-view SVG/PNG. Transform readback and layout
  checks pass: 6 mm minimum planar clearance, Z=52 mm highest envelope, and
  39.1 mm nominal rim clearance.
- CAD-R0.3 feature commit `879d019b` is pushed to
  `origin/docs/hardware-field-node-evt0-1`; all nine native SolidWorks LFS
  objects uploaded successfully.

## In Progress

- The CAD setup, known-envelope parts, corrected tilt-interface drawing set, and
  first layout assembly are complete, but the physical enclosure survey and
  manufacturing assembly have not started.
- Global Codex configuration targets the current hardware worktree path.
- The pre-existing untracked `tmp/` directory remains outside this work and was
  intentionally neither staged nor deleted.

## Next Actions

- Measure the physical enclosure from one datum and fill every `PENDING` entry in
  `field-node-cad-inputs.csv` with evidence.
- Fit a `272 x 193 mm` rectangular template, record any local interference, and
  select/measure perimeter R1-R6 from one plate datum.
- Model the nominally coplanar boss stack as perimeter 6 mm versus middle
  1 mm raised floor plus 5 mm boss. No height-compensation shim is planned;
  verify R1-R6 top-plane coplanarity, hole diameter/depth, and blind state.
- Freeze the rectangular FR4 outline and six hole coordinates, then export DXF
  and a dimensioned drawing.
- Add measured battery, CN3791 module, cable glands, solar frame holes, and GNSS
  hardware before promoting the layout to a manufacturing assembly.
- Repoint global MCP configuration after the branch is merged into its permanent
  worktree path.

## Risks

- Supplier dimensions and photo estimates are not machining inputs.
- Upstream `create_cut_extrude` misreports success on localized SW2022; keep the
  project fallback and volume validation until upstream has a verified fix.
- Native CAD is binary; Git LFS availability must be checked before every push.

## Resume Prompt

Continue field-node CAD from `CAD-R0.3 / MECH-R0.3-DRAFT`: verify the generated
artifact set and Git diff, then fit a `272 x 193 mm` template and measure
perimeter R1-R6 from the plate left-bottom datum. Update only physically verified
inputs before generating the FR4 DXF and manufacturing assembly.
