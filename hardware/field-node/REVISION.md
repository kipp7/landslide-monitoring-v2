# Field Node Hardware Revisions

## Current Baseline

| Item | Revision | State | Manufacturing status |
| --- | --- | --- | --- |
| Integrated field node | `FIELD-NODE-HW-EVT0.2-DRAFT` | Engineering reference set | Not released |
| Existing carrier board | `R1.2` | As-built reference | Gerber exists; source documents conflict |
| Carrier-board improvement | `R1.3-ORDERED-PROTOTYPE` | Five-board fabrication order submitted 2026-07-28 | Order archive exists; source reconciliation and EVT pending |
| Competition enclosure | `MECH-R0.8-DRAFT` | 5 mm rectangular FR4, retained round harness, symmetric frame plus four context-rich connection reviews | Physical fit, interfaces, loads and purchased samples pending |
| Solar subsystem | `PWR-R0.1` | Candidate architecture | Charger and energy budget unqualified |
| Prototype procurement | `BOM-R0.5` | 5 mm FR4, sample cable glands/RF bulkheads and W1-W8 purchase gates | Not a production AVL |
| Mechanical CAD | `CAD-R0.8` | Four isolated connection-detail assemblies, seven new native parts, packaged dependencies and four-page A3 review set | Engineering review; no drilling or frame fabrication release |

## Change History

### 2026-07-28 - `R1.3-ORDERED-PROTOTYPE`

- Archived the exact five-board Gerber order package and BOM with SHA-256 hashes.
- Verified the final flying-probe netlist, two `ISO_GND -> GND` changes, board outline, drill counts, mask openings and Gerber/Excellon termination.
- Recorded the implemented RS485 TVS, per-channel resettable fuses, PC0 battery divider/clamp and duplicated eight-position RS485 terminal interfaces.
- Recorded intentional omissions: no DL-XLS1 load switch, no separate input reverse protection, no independent test points and no `SW2`.
- Marked galvanic isolation as bypassed because both RS485 field-side grounds are tied to system ground.
- Kept the revision out of EVT release: the final editable EasyEDA source and schematic must be re-exported after the last ground edits, and the ordinary-silkscreen production proof must confirm whether the Logo is present.

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

### 2026-07-26 - `CAD-R0.3`

- Added a reproducible SOLIDWORKS 2022 seven-component internal layout assembly
  using the `272 x 193 x 3 mm` FR4 rectangular fit-trial plate.
- Recorded the controlled placement study: carrier PCB at left rotated 90 deg,
  photo-estimated battery at lower right, CN3791 reserved zone at right center,
  and the tilt transmitter on its local 304 reference plate at upper right.
- Verified component transform readback, seven inserted components, 6 mm minimum
  planar clearance, 52 mm highest envelope, and 39.1 mm nominal rim clearance.
- Added native SLDASM/STEP, A3 SLDDRW/PDF/PNG, exploded/isometric/top previews,
  and a deterministic labeled SVG/PNG top view with a SHA-256 manifest.
- Kept R1-R6 holes, battery dimensions, CN3791 dimensions, and final tray
  scallops explicitly blocked; this revision is layout review only and not for
  manufacture.

### 2026-07-26 - `CAD-R0.4`

- Rebuilt the internal layout as a 23-component SOLIDWORKS 2022 assembly with a `272 x 193 x 3 mm` FR4 nominal plate carrying 8 x `Ø3.5 mm` H1-H8 holes.
- Recorded the user-specified nominal pattern: columns `120.3 mm`, outer rows `160 mm`, inner rows `61.2 mm`, centered coordinates `X=±60.15`, `Y=+80/+30.6/-30.6/-80 mm`.
- Added the verified carrier-board four-hole pattern (`Ø3.2 mm`, `163 x 108 mm`), CCW-rotated interface orientation, 35 mm installed-height envelope, `66 x 61 x 40 mm` battery envelope, `46 x 21 x 10 mm` CN3791 envelope, clip/holder zones, fuse/service zone, and four optional edge support pads.
- Added eight concept harness route solids and preserved the power topology: PV -> CN3791 -> battery charge; battery load -> fuse/maintenance disconnect -> PCB DC5521.
- Verified 18 generated part/route bodies by volume, inserted 23 assembly components, `4 mm` minimum planar module clearance, `57 mm` highest envelope, and `34.1 mm` nominal rim clearance. Generated native SLDASM/STEP, A3 SLDDRW/PDF/PNG, exploded/isometric/top previews, labeled SVG/PNG, and manifest checksums.
- Kept H1-H8 physical transfer, boss depth/blind state/coplanarity, cable OD/gland threads, RF bulkhead dimensions, final clip geometry, and FR4 DXF explicitly blocked.

### 2026-07-26 - `CAD-R0.5`

- Changed the current main plate from `272 x 193 x 3 mm` to user-selected `272 x 193 x 5 mm` FR4/G10 while preserving CAD-R0.4 as history.
- Added four actual cut features to the nominal lower enclosure wall: `RF1` GNSS and `RF2` XLS1 at `Ø6.5 mm`, plus `G2` soil and `G1` PV at `Ø16.5 mm`. These are sample-selection values, not released drilling dimensions.
- Replaced color-only harness interpretation with W1-W8 instance names, explicit endpoints/cable classes, a Chinese connectivity SVG/PNG, and labeled lower-wall interfaces.
- Rerouted W1 around the battery right-side service channel and W6 through the center signal channel. Added automatic route-to-nonendpoint-component collision checks; the final minimum checked clearance is `2 mm`.
- Verified 19 STEP headers, 68 artifact hashes, four wall-cut expected/actual volume equality, 23 assembly components, `4 mm` minimum planar module clearance, `59 mm` highest envelope, and `32.1 mm` nominal rim clearance.
- Kept H1-H8 physical coordinates, enclosure scallops, final gland/bulkhead sample geometry, cable OD/bend radii, fuse rating, tray/clip details, FR4 DXF and enclosure drilling drawing blocked.

### 2026-07-27 - `CAD-R0.6`

- Replaced all rectangular W1-W8 route envelopes with editable SOLIDWORKS
  native `3D sketch + circular sweep` parts. Internal wall crossings now reach
  the nominal RF1/RF2/G2/G1 centre plane at `Z=28 mm`.
- Added separate nominal bulkhead/gland bodies, four external round harnesses,
  drip loops and service tails. Cable outer diameters and bend radii remain
  selection inputs rather than manufacturing truth.
- Rejected the long one-sided GNSS outrigger direction. Added a symmetric
  dual-rail common back-frame, independently supported enclosure and 35-degree
  solar panel, central short GNSS mast with two braces, separate XLS1 antenna
  envelope, and removable competition feet.
- Split the model into internal, external-structure and external-harness
  subassemblies. The final master has three top-level subassemblies and 65
  resolved components; 47 SLDPRT, four SLDASM, 39 STEP and 47 PNG artifacts
  passed file/header checks.

### 2026-07-27 - `CAD-R0.7`

- Kept the validated R0.6 internal and symmetric external-structure
  subassemblies as immutable dependencies. Replaced only the R0.6 external
  harness in the current master with four revised native circular sweeps.
- Added two enclosure rear straps, nominal through-bolt/washer envelopes, two
  solar-panel back rails, four edge clamps, four pivot-pin envelopes, a GNSS
  mast base plate and fastener envelopes, tube/foot end caps and foot gussets.
- Added eight nominal cable-retention points, their fastener envelopes and a
  lower-wall strain-relief bar. The PV route now terminates at the panel rear;
  GNSS/XLS1 routes follow the left/right rails and central mast.
- Verified the nominal enclosure-to-strap gap at `0.55 mm`, moved the panel
  rails `18.5 mm` behind the panel mid-plane, and checked the corrected clip
  contacts from actual SOLIDWORKS component bounding boxes.
- The R0.7 master has four top-level subassemblies and 124 resolved components.
  The delta release contains 18 SLDPRT, three SLDASM, 21 valid STEP and 27
  nonblank PNG files; 69 manifest artifact hashes are tracked separately from
  two pinned R0.6 assembly dependencies.

### 2026-07-27 - `CAD-R0.8`

- Added four isolated connection assemblies: enclosure rear strap/crossmember,
  solar panel/back rail/clamp/pivot, GNSS mast/base/brace, and lower-wall
  bulkhead/gland/drip-loop retention.
- Added three perforated section-review parts and four native round swept wall
  detail cables. The lower-wall detail shows cables passing through actual
  nominal openings and bending outside the wall.
- Generated four native A3 SLDDRW/PDF/PNG sheets and a four-page merged review
  PDF. Render review corrected page clipping and view-title overlap.
- Packaged 23 R0.6/R0.7 part dependencies inside CAD-R0.8 before opening them,
  preventing SW2022 view/cache writes from changing released source revisions.
- Verified 77 hash-tracked artifacts, 11 valid STEP files, 23 nonblank PNGs and
  four A3 pages. All nominal holes and fasteners remain not for manufacture.

## Versioning Rules

- Increment `MECH-Rx.y`, `PWR-Rx.y`, and `BOM-Rx.y` independently while requirements are still changing.
- Create a `FIELD-NODE-HW-EVTn` release only when its manifest lists exact source files, drawing revisions, checksums, test evidence, and known deviations.
- Never overwrite a released manufacturing archive; add a new revision and explain the delta.
