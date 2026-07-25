# Field Node Hardware Revisions

## Current Baseline

| Item | Revision | State | Manufacturing status |
| --- | --- | --- | --- |
| Integrated field node | `FIELD-NODE-HW-EVT0.2-DRAFT` | Engineering reference set | Not released |
| Existing carrier board | `R1.2` | As-built reference | Gerber exists; source documents conflict |
| Carrier-board improvement | `R1.3-DRAFT` | Requirements | Not routed or released |
| Competition enclosure | `MECH-R0.3-DRAFT` | Rectangular FR4 fit trial and perimeter six-point reselection | Fit, coordinates, boss height, and hole depth pending |
| Solar subsystem | `PWR-R0.1` | Candidate architecture | Charger and energy budget unqualified |
| Prototype procurement | `BOM-R0.3` | Rectangular FR4 fit trial and perimeter R1-R6 gate recorded | Not a production AVL |
| Mechanical CAD | `CAD-R0.2` | Tilt-reference plate M3 interface correction and drawing set | Review required; FR4 support holes pending |

## Change History

### 2026-07-24 - `FIELD-NODE-HW-EVT0.1`

- Recorded the actual R1.2 Gerber outline as `170 x 115 mm` with four corner mounting holes.
- Selected the purchased IP65 enclosure and an irregular removable FR4/G10 mounting plate.
- Added the competition tilt-sensor subplate design and froze the manual-derived `90 x 58 x 36 mm`, `78 x 39 mm` mechanical interface.
- Recorded the SWM-10W panel and 3S `11.1 V / 5000 mAh` battery inputs.
- Defined solar charging, interface, protection, and prototype procurement requirements.

### 2026-07-25 - `FIELD-NODE-HW-EVT0.2-DRAFT`

- Added seven deterministic engineering SVG/PNG references covering device boundaries, external arrangement, internal packing, exploded mounting, power/signal paths, GNSS side platform, and design-input status.
- Added one accepted Image 2 4K external communication render under `enclosure/assets/renderings/`; it is explicitly a non-manufacturing reference. The attempted internal render was rejected for invented modules and is not tracked.
- Rejected the earlier generic AI exterior render as a design input because it invented enclosure and module geometry.
- Made the unresolved battery envelope, enclosure hole table, CN3791 dimensions, panel frame holes, and BT-M87SF three-hole data visible in the drawings instead of guessing them.
- Added `IMAGE2-R0.1`: three accepted 4K Image 2 engineering communication views for external integration, open-enclosure module zoning, and mechanical mounting-stack review. GNSS close-up is deferred because the image upstream was temporarily unavailable.
- Advanced the enclosure to `MECH-R0.2-DRAFT`: selected the exact P1-P6 low bosses from the physical box, added a photo locator and M3/FR4/boss section detail, and recorded the battery photo estimate as `70 x 55 x 40 mm` pending caliper confirmation.
- Advanced the Image 2 set to `IMAGE2-R0.2`: retained the three original 4K outputs and added three reviewed engineering-annotation variants plus editable SVG overlays.

### 2026-07-26 - `CAD-R0.1`

- Verified SOLIDWORKS Premium 2022 SP5.0 COM automation on the project workstation.
- Reused the `jianjwu/codex_to_solidworks` integration layout while replacing its protected Python payload with readable upstream commit `0de8755`.
- Added a clean stdio entry point, reproducible installer, MCP smoke test, controlled CAD input register, and reference-part build script.
- Added independent enclosure, FR4, tilt subplate, carrier-board, tilt-transmitter, battery, and solar-panel envelopes. These models remain `NOT FOR MANUFACTURE`; no P1-P6 coordinates or enclosure scallops were inferred.

### 2026-07-26 - `CAD-R0.2`

- Corrected the tilt-reference plate: the sensor body uses four `Ø3.6 mm` clearance holes, while the 304 plate uses four `M3 x 0.5 - 6H` tapped holes modeled with `Ø2.5 mm` tap drills.
- Added a reproducible SLDPRT/STEP/SLDDRW/PDF/PNG/DXF drawing set and SHA-256 manifest for `FN-SUB-002`.
- Kept the plate-to-FR4 support holes absent until the enclosure layout is physically measured and frozen.

### 2026-07-26 - `MECH-R0.3-DRAFT`

- Replaced the earlier scalloped `265 x 185 mm` direction with a rectangular fit-trial direction based on the supplier's nominal `276.0655 x 197 mm` internal reference envelope.
- Selected `272 x 193 x 3 mm` as the first fit-trial FR4 candidate, leaving approximately 2 mm nominal clearance per side; it is not released for manufacture until a physical template fits freely.
- Superseded the old inner P1-P6 selection for the enlarged plate. The new six anchors must be reselected from the upper and lower perimeter boss rows in a three-column by two-row pattern and measured from one physical datum.
- Recorded the clarified coplanar boss stack: perimeter bosses rise approximately 6 mm from the main floor; the four middle bosses rise 5 mm from a 1 mm raised floor, so both top planes are nominally level and require no height-compensation shim.
- Advanced the prototype list to `BOM-R0.3` without overwriting earlier purchasing records.

## Versioning Rules

- Increment `MECH-Rx.y`, `PWR-Rx.y`, and `BOM-Rx.y` independently while requirements are still changing.
- Create a `FIELD-NODE-HW-EVTn` release only when its manifest lists exact source files, drawing revisions, checksums, test evidence, and known deviations.
- Never overwrite a released manufacturing archive; add a new revision and explain the delta.
