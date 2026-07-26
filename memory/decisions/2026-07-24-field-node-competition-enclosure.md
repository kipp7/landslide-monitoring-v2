---
title: field-node-competition-enclosure
type: note
tags:
  - decision
  - hardware
  - enclosure
  - competition
status: accepted
---

# Decision: field-node-competition-enclosure

## Context

The competition build needs one consistent sealed enclosure for the carrier board, battery, solar charging module, and tilt transmitter. The purchased IP65 box has low M3 self-tapping bosses and a scalloped internal perimeter rather than a rectangular mounting surface.

## Decision

- Keep the purchased `320 x 240 x 145 mm` enclosure for the competition build.
- Use a removable rectangular 5 mm FR4/G10 main mounting plate. The supplier's `276.0655 x 197 mm` value is a nominal internal reference envelope; the current fit-trial candidate is `272 x 193 x 5 mm` to retain approximately 2 mm clearance per side while improving stiffness over the historical 3 mm direction.
- Supersede the old inner P1-P6 and six-point R1-R6 selections for this enlarged plate. Use the user's two-column/four-row H1-H8 pattern as the nominal CAD study: `X=+/-60.15 mm`, `Y=+80/+30.6/-30.6/-80 mm`, with 8 x diameter 3.5 mm FR4 holes. Treat it as `NOMINAL / VERIFY PHYSICAL`, not a released hole table.
- Keep the tilt transmitter inside the box for competition consistency.
- Mount the tilt transmitter on a dedicated `120 x 85 x 3 mm` 304 stainless subplate with four-point support. Keep the PCB, battery, and charger on FR4.
- Do not use a full steel internal plate.
- For CAD-R0.5, retain the CCW-rotated `170 x 115 mm` carrier PCB on the left, the `66 x 61 x 40 mm` battery envelope at lower right, the `46 x 21 x 10 mm` no-hole CN3791 module at right center, and the tilt stack at upper right. Add four optional `12 x 12 x 6 mm` edge support pads and W1-W8 route-envelope parts.
- Put four interfaces on the lower wall to support downward drip loops: RF1 GNSS and RF2 XLS1 use separate SMA bulkheads; G2 soil and G1 PV use separate cable glands. CAD nominal cutouts are diameter 6.5 mm for RF1/RF2 and diameter 16.5 mm for G1/G2, but purchased sample geometry governs final drilling.
- Preserve the power topology: solar panel -> CN3791 -> battery charge branch; battery load output -> fuse/service disconnect -> PCB DC5521.
- Replace rectangular harness envelopes in CAD-R0.6 with native round 3D
  sweeps. Wall-entry paths must reach the actual interface centre height before
  crossing the wall; RF1/RF2 remain GNSS/XLS1 interfaces, not tilt-sensor holes.
- Use a symmetric dual-rail common back-frame for the one-piece competition
  unit. Support the enclosure and 35-degree panel on independent crossmembers;
  place BT-760 on a central short mast with two symmetric braces. Reject the
  long one-sided antenna cantilever as the current direction.
- For CAD-R0.7, retain the R0.6 internal and external-structure assemblies as
  pinned dependencies, replace the external harness with frame-following round
  sweeps, and add separate structural-detail and harness-retention
  subassemblies. Do not overwrite the R0.6 release.
- Distribute enclosure reaction through two rear straps instead of treating the
  four small mounting blocks as isolated load points. Keep solar back rails
  behind the panel body and place external cable clips on real frame members.

## Rationale

A full `265 x 185 x 3 mm` steel plate weighs about 1.16 kg, adds long-term load to the plastic bosses, and creates RF risk for GPS/DL-XLS1. A local stainless reference plate improves tilt-sensor flatness while retaining electrical insulation and lower mass elsewhere.

Eight H1-H8 anchors improve lift and torsional restraint, but the `120.3 mm` column pitch leaves about `75.85 mm` FR4 overhang on each long side. Four non-fastened edge pads support these overhangs without adding more plastic threads. The eight holes anchor only the FR4 to the enclosure; every module keeps an independent mounting interface on the FR4.

The 5 mm plate consumes 2 mm more vertical space than CAD-R0.4, but CAD-R0.5 still retains 32.1 mm nominal clearance to the bottom-shell rim. The added thickness does not make the nominal H1-H8 coordinates or plastic-boss strength verified; both remain physical-test gates.

The symmetric external frame reduces torsion and antenna phase-centre motion
without requiring a separate field pole during competition. It also keeps solar
wind load off the plastic lid and preserves a single transportable assembly.

The R0.7 split lets purchased clamps, fasteners and measured interfaces replace
nominal detail parts without rebuilding the validated R0.6 internal layout. It
also makes retention points reviewable as components rather than implied bends
in cable geometry.

## Consequences

- The competition configuration improves repeatability but is not automatically a field-grade measurement reference.
- The enclosure must use a two-point or four-point external bracket and must be recalibrated after transport.
- The FR4 DXF cannot be released until a `272 x 193 mm` physical template fits freely and captures local interference plus the actual H1-H8 coordinates.
- H1-H8 identity, physical coordinates, boss height, hole depth, blind-hole state, top coplanarity, and screw length are not frozen. The annotated supplier drawing is a nominal reference, not a machining release.
- Anchor screw heads fall under module footprints. Fasten FR4 before modules and provide raised standoffs/trays or underside relief.
- No enclosure drilling drawing is released from the nominal RF1/RF2/G1/G2 cutouts. Confirm thread, sealing washer, anti-rotation flat, tool clearance, cable OD and clamping range from purchased samples first.
- No frame fabrication drawing is released from CAD-R0.6. The 30 x 30 mm member
  envelope, panel angle and removable feet are layout choices; wall thickness,
  hole tables, fasteners, wind load and transport load remain open gates.
- R0.7 M6/M8 fasteners, P-clips, straps, panel rails, clamps, end caps and
  gussets are interface envelopes only. Their names do not authorize those
  nominal sizes for procurement or drilling.
- The boss top planes are nominally coplanar: perimeter bosses rise approximately 6 mm from the main floor, while the four middle bosses rise 5 mm from a 1 mm raised floor. The FR4 bears directly on these tops with no 1 mm compensation shim; straightedge verification is still required before release.

## Follow-up

- Fit a `272 x 193 mm` template, transfer H1-H8, and measure their coordinates, boss height, top-plane variation, hole diameter/depth, and blind-hole state; derive rigid compensation and limited screw length from those measurements.
- Confirm the `66 x 61 x 40 mm` battery and `46 x 21 x 10 mm` CN3791 allowance envelopes with calipers and freeze tray/clip details.
- Measure cable OD, gland thread, RF bulkhead, and minimum bend radius before converting route envelopes into a production harness.
- Freeze the four subplate-to-FR4 support holes.
- Generate the FR4 and stainless subplate DXFs.
- Measure SWM-10W frame holes, enclosure rear interface, BT-760 envelope and
  BT-M87SF three-hole pattern; then freeze the external frame connection table.
- Fit physical cable samples to the eight R0.7 retention stations, replace the
  clip envelopes with selected parts and verify service loops while opening the
  enclosure and removing the solar panel.
- Run closing, transport, zero-repeatability, and IP65 tests.
