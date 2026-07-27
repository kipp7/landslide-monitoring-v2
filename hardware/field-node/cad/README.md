# Field Node CAD

Status: `CAD-R0.8 / CONTEXT-RICH CONNECTION DETAILS + A3 SECTION REVIEW / NOT FOR MANUFACTURE`

This directory contains the reproducible SOLIDWORKS 2022 automation setup and
the field-node mechanical reference models. Native models are tracked with Git
LFS. STEP exports and PNG previews are tracked as review artifacts.

## Source Of Truth

| Input class | Meaning | Manufacturing use |
| --- | --- | --- |
| `VERIFIED` | Taken from a manual, Gerber, or confirmed product specification | May be used only for the named interface |
| `DESIGN` | Controlled engineering choice derived from a verified interface | May be used only after drawing review |
| `NOMINAL` | Supplier nominal envelope, not a measured manufactured part | Layout reference only |
| `ESTIMATED` | Derived from a photograph or incomplete information | Never use for machining |
| `PENDING` | Must be measured from the physical sample | Blocks final geometry |

The machine-readable register is
[`parameters/field-node-cad-inputs.csv`](parameters/field-node-cad-inputs.csv).

## Model Revisions

`models/CAD-R0.1/` contains the original independent reference parts:

- `FN-ENC-001`: purchased enclosure outer envelope only.
- `FN-PLT-001`: 265 x 185 x 3 mm FR4/G10 maximum blank envelope. It has no
  P1-P6 holes because their coordinates are still pending.
- `FN-SUB-001`: historical 120 x 85 x 3 mm plate model. Its four diameter
  3.6 mm holes copied the sensor-body clearance holes and are superseded by
  `FN-SUB-002`; do not manufacture the old plate.
- `FN-PCB-001`: 170 x 115 x 1.6 mm carrier-board envelope.
- `FN-SEN-001`: 90 x 58 x 36 mm tilt-transmitter envelope with its verified
  four-hole pattern.
- `FN-BAT-001`: photo-estimated battery envelope.
- `FN-SOL-001`: SWM-10W solar-panel envelope.

No assembly placement is frozen in `CAD-R0.1`. The enclosure scallops, P1-P6
coordinates, boss heights, FR4 reliefs, battery dimensions, charger dimensions,
and cable interfaces must be measured before a manufacturing assembly or DXF is
released.

`MECH-R0.5-DRAFT` supersedes the old FR4 direction without overwriting the
historical `FN-PLT-001` model. The supplier's `276.0655 x 197 mm` rectangle is a
nominal enclosure reference; the current CAD plate is a `272 x 193 x 5 mm`
fit-trial candidate with eight nominal H1-H8 holes. The physical template, eight
actual coordinates, boss interfaces, and local scallop relief must be checked
before any manufacturing plate or DXF is released.

`models/CAD-R0.2/` corrects the competition tilt-reference plate interface:

- `FN-SUB-002`: 120 x 85 x 3 mm 304 plate with four modeled diameter 2.5 mm
  tap-drill holes at `(21,23)`, `(99,23)`, `(21,62)`, and `(99,62)` mm.
- The governing manufacturing callout is `4 x M3 x 0.5 - 6H THRU`. The sensor
  body retains its verified `4 x diameter 3.6 mm` clearance holes.
- SLDPRT, STEP, SLDDRW, PDF, PNG, and profile/tap-drill DXF outputs share one
  parameter source and are recorded with SHA-256 checksums in the manifest.
- The four independent holes that eventually attach this plate to the FR4 are
  still absent. Their position remains blocked by the physical enclosure survey.

`models/CAD-R0.3/` contains the first controlled internal layout assembly. It is
an engineering packing reference, not a manufacturing release:

- `FN-ASM-001_internal-layout_R0.3.SLDASM/STEP`: seven-component nominal layout
  with the tray, rectangular FR4 fit plate, rotated carrier PCB, battery
  envelope, CN3791 reserved zone, tilt subplate, and tilt transmitter.
- `*_labeled-top.svg/png`: deterministic top-view overlay with component IDs,
  dimensions, coordinate datum, clearances, and blocked inputs.
- `*.SLDDRW/pdf` and `*_drawing.png`: A3 review drawing with top and isometric views.
- `manifest.json`: geometry checks, component transforms, artifact sizes, and
  SHA-256 hashes.

The assembly uses `272 x 193 x 3 mm` FR4, a nominal 6 mm coplanar support top,
and no R1-R6 holes. The battery remains photo-estimated and the `60 x 35 mm`
CN3791 object is only a reserved layout zone. The generator reopens historical
reference parts read-only. It also packages copies inside `CAD-R0.3` before
assembly, because SolidWorks can still rewrite binary view/cache data in a
referenced document despite a read-only open request.

`models/CAD-R0.4/` contains the previous 23-component internal layout and harness
study. It is an engineering packing reference, not a manufacturing release:

- `FN-ASM-002_internal-layout-harness_R0.4.SLDASM/STEP`: nominal tray, four
  optional edge pads, 8-hole FR4, four-hole carrier PCB, 35 mm carrier envelope,
  battery/tray, CN3791/clip, fuse zone, tilt stack, and eight harness routes.
- `*_labeled-top.svg/png`: editable top view with H1-H8, `120.3/160/61.2 mm`
  dimensions, interface directions, route colors, and blocked inputs.
- `*.SLDDRW/pdf`, drawing PNG, exploded/isometric/top previews, and
  `manifest.json` with volume, transform, placement, route, and SHA-256 checks.

The H1-H8 pattern is nominal and must be transferred to the physical enclosure.
No FR4 DXF is generated. The colored harness bodies are route/clearance
envelopes, not production round-wire geometry. Cable OD, gland threads, RF
bulkheads, bend radius, fuse choice, and final tray/clip details remain pending.

`models/CAD-R0.5/` is the previous 23-component review assembly:

- `FN-PLT-005` changes the main plate to `272 x 193 x 5 mm` FR4 while retaining
  the nominal 8 x diameter 3.5 mm H1-H8 pattern.
- `FN-ENC-004` contains four real lower-wall cut features: RF1/RF2 nominal
  diameter 6.5 mm SMA bulkhead openings and G1/G2 nominal diameter 16.5 mm M16
  gland openings. Their expected and actual removed volumes match exactly.
- Harness parts and assembly instances are named W1-W8. The separate
  `*_harness-diagram.zh-CN.svg/png` defines endpoints and cable classes; the 3D
  bodies remain route/clearance envelopes rather than production wire models.
- W1 uses the battery right-side channel and W6 uses the center signal channel.
  Automated checks reject any route crossing a non-endpoint module; the current
  minimum checked harness clearance is 2 mm.
- The assembly remains `NOT FOR MANUFACTURE`: port sizes/coordinates must be
  frozen from purchased glands and bulkheads, and no FR4 or enclosure drilling
  DXF is generated.

`models/CAD-R0.6/` replaces the rectangular route envelopes with native
SOLIDWORKS 3D-spline circular sweeps and adds the complete external concept:

- `FN-ASM-004` is the 31-component open internal assembly. W1-W8 are editable
  round swept solids; every wall route reaches the nominal connector centre at
  `Z=28 mm` before crossing the wall.
- `FN-ASM-005A` contains the symmetric dual-rail frame, independent enclosure
  mounts, 35-degree SWM-10W panel, central braced GNSS mast, separate XLS1
  antenna envelope, lid and removable competition feet.
- `FN-ASM-005B` contains four external round harnesses with downward entries,
  drip loops and strain-relief routing.
- `FN-ASM-005` is the three-subassembly master. It resolves 65 components and
  is left open in SOLIDWORKS after a successful rebuild.
- The panel holes, enclosure rear interface, tube wall thickness, wind/transport
  load, BT-760 envelope, BT-M87SF three-hole pattern, XLS1 antenna and actual
  cable OD/bend radii remain `PENDING`. R0.6 is not a fabrication release.

`models/CAD-R0.7/` is the current detailed concept and intentionally depends on
the pinned R0.6 internal and external-structure assemblies:

- `FN-ASM-006A` adds the enclosure rear straps and nominal fastener stack,
  solar-panel back rails/clamps/pivots, GNSS mast base connection, rail/foot end
  caps and removable-foot gussets.
- `FN-ASM-006B` replaces the R0.6 external harness with four revised native
  round sweeps, eight P-clip envelopes and a lower-wall strain-relief bar.
- `FN-ASM-006` combines the R0.6 internal assembly, R0.6 external structure and
  both R0.7 detail subassemblies. It has four top-level subassemblies and 124
  resolved components.
- The nominal lid-to-strap gap is `0.55 mm`; the two panel rails are offset
  `18.5 mm` behind the panel mid-plane. These are layout checks, not tolerance
  releases.
- R0.7 contains 18 new SLDPRT, three SLDASM, 21 STEP and 27 PNG files. Actual
  enclosure/panel holes, fastener grades, tube wall, cable/connector geometry,
  P-clips and GNSS/XLS1 interfaces remain `PENDING`.

`models/CAD-R0.8/` is the current connection-review package. It complements the
R0.7 integrated master by isolating four interfaces:

- `FN-ASM-007A`: enclosure rear section coupon, load-distribution strap,
  nominal M6 stack and common crossmember;
- `FN-ASM-007B`: transparent 35 degree panel, back rails, edge clamps and
  pivot envelopes;
- `FN-ASM-007C`: central mast, nominal four-hole base, symmetric braces,
  platform and GNSS envelopes;
- `FN-ASM-007D`: perforated lower wall, RF bulkheads, M16 glands, four native
  round cable sweeps, drip bends, P-clips and strain-relief bar.

Each assembly has SLDASM/STEP, front/right/isometric PNG views and an A3
SLDDRW/PDF/PNG sheet. `FN-DRW-008_connection-detail-review-package_R0.8.pdf`
combines all four pages. The section coupons and nominal fasteners remain review
geometry, not manufacturing definitions.

R0.8 packages every reused R0.6/R0.7 SLDPRT into its own directory before
opening it. SW2022 can rewrite binary view/cache data despite read-only opens,
so assemblies must reference these revision-local copies.

## Automation

The setup reuses the architecture from `jianjwu/codex_to_solidworks`, but runs
the readable public upstream `andrewbartels1/SolidworksMCP-python` pinned to
commit `0de875502281df298695ef4733cae03fd11e450f`. The protected nested Python
files in the derivative repository are not used.

Install or repair the local tool environment:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File hardware/field-node/cad/scripts/Install-SolidWorksMcp.ps1
```

With SOLIDWORKS 2022 open, verify COM and MCP:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File hardware/field-node/cad/scripts/Test-SolidWorksMcp.ps1
```

Rebuild the reference parts:

```powershell
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_reference_parts.py
```

Rebuild the corrected tilt-interface release:

```powershell
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_tilt_interface_r02.py
```

Rebuild the previous rectangular route-envelope assembly:

```powershell
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_layout_assembly_r05.py
```

Rebuild the current native round harness and complete external assembly:

```powershell
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_full_assembly_r06.py
```

Rebuild the current structural details and retained external harness:

```powershell
& "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe" hardware/field-node/cad/automation/build_detail_assembly_r07.py
```

Build R0.8 as isolated phases, restarting SOLIDWORKS between commands:

```powershell
$python = "$env:LOCALAPPDATA\Codex\SolidWorksMCP\source\.venv\Scripts\python.exe"

0..3 | ForEach-Object {
  Get-Process SLDWORKS -ErrorAction SilentlyContinue | Stop-Process -Force
  & $python hardware/field-node/cad/automation/build_review_details_r08.py --assembly-index $_
}

0..3 | ForEach-Object {
  Get-Process SLDWORKS -ErrorAction SilentlyContinue | Stop-Process -Force
  & $python hardware/field-node/cad/automation/build_review_details_r08.py --drawing-index $_
}

Get-Process SLDWORKS -ErrorAction SilentlyContinue | Stop-Process -Force
& $python hardware/field-node/cad/automation/build_review_details_r08.py --finalize-only
```

Do not call `CloseAllDocuments(True)` on an assembly containing released
references. `--manifest-only` refreshes hashes without opening SOLIDWORKS.

The labeled PNG is rasterized by the workstation `magick` executable from
ImageMagick; the SVG remains the editable source overlay.

The MCP entry point writes no welcome text to stdout, because stdout is reserved
for JSON-RPC. Macro recording is disabled and the live adapter is limited to one
SolidWorks connection.
