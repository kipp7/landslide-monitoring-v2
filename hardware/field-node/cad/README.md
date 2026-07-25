# Field Node CAD

Status: `CAD-R0.2 / TILT INTERFACE CORRECTION / REVIEW REQUIRED`

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

`models/CAD-R0.2/` corrects the competition tilt-reference plate interface:

- `FN-SUB-002`: 120 x 85 x 3 mm 304 plate with four modeled diameter 2.5 mm
  tap-drill holes at `(21,23)`, `(99,23)`, `(21,62)`, and `(99,62)` mm.
- The governing manufacturing callout is `4 x M3 x 0.5 - 6H THRU`. The sensor
  body retains its verified `4 x diameter 3.6 mm` clearance holes.
- SLDPRT, STEP, SLDDRW, PDF, PNG, and profile/tap-drill DXF outputs share one
  parameter source and are recorded with SHA-256 checksums in the manifest.
- The four independent holes that eventually attach this plate to the FR4 are
  still absent. Their position remains blocked by the physical enclosure survey.

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

The MCP entry point writes no welcome text to stdout, because stdout is reserved
for JSON-RPC. Macro recording is disabled and the live adapter is limited to one
SolidWorks connection.
