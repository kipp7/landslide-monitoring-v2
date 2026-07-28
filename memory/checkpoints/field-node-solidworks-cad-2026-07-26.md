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
- `CAD-R0.4` now contains a reproducible 23-component layout/harness assembly.
  The final full rebuild generated 18 bodies with exact expected/actual volume
  matches, native/STEP/drawing/PDF/previews, and a SHA-256 manifest. Layout
  checks pass at 4 mm minimum planar clearance, Z=57 mm highest envelope, and
  34.1 mm nominal rim clearance. The A3 one-page PDF was rendered through
  Poppler and visually checked for clipping and overlap.
- The nominal FR4 H1-H8 pattern is `X=+/-60.15 mm` and
  `Y=+80/+30.6/-30.6/-80 mm`; these are user-annotated supplier dimensions and
  remain blocked from fabrication until physically transferred and measured.
- CAD-R0.4 adds the Gerber-derived carrier holes (4 x diameter 3.2 mm at
  163 x 108 mm), a 35 mm installed envelope, measured-with-allowance battery
  and CN3791 bodies, four optional edge pads, a fuse zone, and eight concept
  harness route solids. Power routing preserves PV -> CN3791 -> battery charge
  and battery load -> fuse/service disconnect -> PCB DC5521.
- CAD-R0.4 feature commit `ddb02862` is pushed to
  `origin/docs/hardware-field-node-evt0-1`; the push uploaded all 22 new native
  SOLIDWORKS LFS objects successfully.
- `CAD-R0.5` changes the current main plate to `272 x 193 x 5 mm` and adds four
  real lower-wall cut features: RF1/RF2 diameter 6.5 mm SMA nominal openings and
  G1/G2 diameter 16.5 mm M16 nominal openings. Expected and actual tray volume
  match exactly, confirming the ports are cut features rather than sketch marks.
- W1-W8 now have explicit endpoints and cable classes plus a Chinese SVG/PNG
  connectivity drawing. W1 uses the battery right-side service channel and W6
  uses the center signal channel. Automated route collision checks pass with a
  2 mm minimum clearance to non-endpoint module envelopes.
- The final CAD-R0.5 rebuild contains 23 assembly components, 19 valid STEP
  headers and 68 hash-verified artifacts. Layout checks pass at 4 mm minimum
  module clearance, Z=59 mm highest envelope and 32.1 mm nominal rim clearance.
- CAD-R0.5 feature commit `d94db4c7` is pushed to
  `origin/docs/hardware-field-node-evt0-1`; all 22 new native SOLIDWORKS LFS
  objects uploaded successfully.
- `CAD-R0.6` replaces W1-W8 rectangular route envelopes with editable native
  SOLIDWORKS 3D-spline circular sweeps. Internal entries align to the nominal
  `Z=28 mm` RF1/RF2/G2/G1 centre plane; four external routes add drip loops and
  service tails.
- The external design now uses a symmetric dual-rail frame, independent box and
  35-degree panel supports, a central short GNSS mast with two braces, separate
  XLS1 envelope and removable competition feet. The one-sided long outrigger is
  no longer the current direction.
- R0.6 contains 47 SLDPRT, four SLDASM, 39 valid STEP files and 47 PNG files.
  `FN-ASM-004` has 31 components; the master has three top-level subassemblies
  and 65 resolved components. Visual checks covered internal isometric plus full
  isometric/front/right/top views, and the final master is open in SOLIDWORKS.
- The R0.6 generator now excludes transient SOLIDWORKS `~$` lock files and saves
  the final isometric master state before hashing. The closed-document audit
  verified all 137 listed artifact hashes and byte counts against 137 files;
  `manifest.json` is the 138th file in the output directory.
- CAD-R0.6 feature commit `7124315c` contains the native round harness,
  symmetric external concept, reproducible generator, generated artifacts and
  associated engineering records.
- `CAD-R0.7` preserves the R0.6 internal and external-structure assemblies as
  hash-pinned dependencies, replaces the external harness with four refined
  frame-following circular sweeps, and adds structural-detail plus
  harness-retention subassemblies.
- R0.7 adds two enclosure back straps and nominal fastener stacks, two panel
  back rails/four clamps/four pivots, a GNSS mast base connection, tube and foot
  caps, four foot gussets, eight cable-clip stations and a lower strain-relief
  bar. Actual SOLIDWORKS bounding boxes verify a `0.55 mm` nominal lid/strap gap,
  `18.5 mm` panel back-rail offset and contact at the corrected clip stations.
- The R0.7 master has four top-level subassemblies and 124 resolved components.
  Its delta directory contains 18 SLDPRT, three SLDASM, 21 STEP, 27 PNG and 69
  hash-tracked artifacts plus two recorded R0.6 dependency hashes.
- The R0.7 generator isolates every 3D cable sweep in a fresh SOLIDWORKS
  document session and supports `--manifest-only` so dependency hashes can be
  refreshed without reopening or rewriting R0.6. The temporary reference-file
  writes observed during development were removed; the tracked R0.6 directory
  matches its published commit.
- CAD-R0.7 feature commit `01b52c9b` contains the structural details, retained
  external harness, reproducible generator, generated artifacts and associated
  engineering records.
- `CAD-R0.8` isolates four connection-review assemblies: enclosure rear strap,
  solar clamp/pivot, GNSS mast/base/brace and lower-wall drip retention. It adds
  three perforated section-context parts and four native round local cable
  sweeps, four native A3 drawings and one four-page PDF review package.
- Final validation covers 77 artifact hashes, 11 STEP headers, 23 nonblank PNGs,
  four A3 page boxes and extracted note text. Visual review corrected an
  enclosure-page edge clip and GNSS title overlap before publication.
- R0.8 packages 23 reused R0.6/R0.7 SLDPRT references locally before any
  SOLIDWORKS open. An intermediate SW2022 cache write was detected and restored;
  the final R0.6/R0.7 worktree is clean.
- R0.8 assembly and drawing generation runs as eight isolated phases with a
  SOLIDWORKS restart between phases, avoiding SW2022 reference-close deadlocks.
- CAD-R0.8 feature commit `09a51dc2742d4871230887eb1d912cfb4f0a10e5`
  contains the four detail assemblies, packaged native dependencies, A3 review
  set, deterministic generator and hardware documentation.

## In Progress

- The CAD setup, native round harness, complete external concept and nominal
  connection/retention details are complete, but the physical interface survey
  and manufacturing release have not started.
- Global Codex configuration targets the current hardware worktree path.
- The pre-existing untracked `tmp/` directory remains outside this work and was
  intentionally neither staged nor deleted.

## Next Actions

- Measure the physical enclosure from one datum and fill every `PENDING` entry in
  `field-node-cad-inputs.csv` with evidence.
- Fit a `272 x 193 mm` rectangular template, record any local interference, and
  transfer/measure H1-H8 from one plate datum.
- Model the nominally coplanar boss stack as perimeter 6 mm versus middle
  1 mm raised floor plus 5 mm boss. No height-compensation shim is planned;
  verify H1-H8 top-plane coplanarity, hole diameter/depth, and blind state.
- Freeze the rectangular FR4 outline and eight hole coordinates, then export DXF
  and a dimensioned drawing.
- Confirm battery/CN3791 caliper dimensions, then freeze trays/clips. Buy one
  sample each of the G1/G2 glands and RF1/RF2 bulkheads; measure thread, cutout,
  anti-rotation, sealing and tool-clearance geometry before releasing enclosure
  drilling. Measure cable OD/bend radius, solar frame holes and GNSS hardware.
- Measure enclosure rear mounting points, SWM-10W holes, BT-760 envelope and
  BT-M87SF three-hole table; select frame wall thickness and fasteners from wind
  and transport loads before generating frame fabrication drawings.
- Purchase or identify the actual P-clips, cable, connectors, straps and panel
  clamps; replace the R0.7 envelopes and verify opening/removal service loops.
- Repoint global MCP configuration after the branch is merged into its permanent
  worktree path.

## Risks

- Supplier dimensions and photo estimates are not machining inputs.
- Upstream `create_cut_extrude` misreports success on localized SW2022; keep the
  project fallback and volume validation until upstream has a verified fix.
- Native CAD is binary; Git LFS availability must be checked before every push.

## Resume Prompt

Continue field-node CAD from `CAD-R0.8 / MECH-R0.8-DRAFT`: use the four-page
connection review package to collect interface measurements; fit a `272 x 193 mm`
template and transfer H1-H8; measure G1/G2/RF1/RF2 samples, SWM-10W holes,
enclosure rear mounts, BT-760 and BT-M87SF. Replace nominal fasteners, clamps,
P-clips, cable OD/bend radii and interface envelopes with physical data,
calculate frame/fastener loads, then release FR4, enclosure and external-frame
drawings as new revisions.
