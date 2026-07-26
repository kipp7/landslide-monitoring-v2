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
- Use a removable rectangular 3 mm FR4/G10 main mounting plate. The supplier's `276.0655 x 197 mm` value is a nominal internal reference envelope; the first fit-trial candidate is `272 x 193 x 3 mm` to retain approximately 2 mm clearance per side.
- Supersede the old inner P1-P6 and six-point R1-R6 selections for this enlarged plate. Use the user's two-column/four-row H1-H8 pattern as the nominal CAD study: `X=+/-60.15 mm`, `Y=+80/+30.6/-30.6/-80 mm`, with 8 x diameter 3.5 mm FR4 holes. Treat it as `NOMINAL / VERIFY PHYSICAL`, not a released hole table.
- Keep the tilt transmitter inside the box for competition consistency.
- Mount the tilt transmitter on a dedicated `120 x 85 x 3 mm` 304 stainless subplate with four-point support. Keep the PCB, battery, and charger on FR4.
- Do not use a full steel internal plate.
- For CAD-R0.4, place the CCW-rotated `170 x 115 mm` carrier PCB on the left, the `66 x 61 x 40 mm` battery envelope at lower right, the `46 x 21 x 10 mm` no-hole CN3791 module at right center, and the tilt stack at upper right. Add four optional `12 x 12 x 6 mm` edge support pads and route-envelope parts for power, RS485, GNSS, and XLS1.
- Preserve the power topology: solar panel -> CN3791 -> battery charge branch; battery load output -> fuse/service disconnect -> PCB DC5521.

## Rationale

A full `265 x 185 x 3 mm` steel plate weighs about 1.16 kg, adds long-term load to the plastic bosses, and creates RF risk for GPS/DL-XLS1. A local stainless reference plate improves tilt-sensor flatness while retaining electrical insulation and lower mass elsewhere.

Eight H1-H8 anchors improve lift and torsional restraint, but the `120.3 mm` column pitch leaves about `75.85 mm` FR4 overhang on each long side. Four non-fastened edge pads support these overhangs without adding more plastic threads. The eight holes anchor only the FR4 to the enclosure; every module keeps an independent mounting interface on the FR4.

## Consequences

- The competition configuration improves repeatability but is not automatically a field-grade measurement reference.
- The enclosure must use a two-point or four-point external bracket and must be recalibrated after transport.
- The FR4 DXF cannot be released until a `272 x 193 mm` physical template fits freely and captures local interference plus the actual H1-H8 coordinates.
- H1-H8 identity, physical coordinates, boss height, hole depth, blind-hole state, top coplanarity, and screw length are not frozen. The annotated supplier drawing is a nominal reference, not a machining release.
- Anchor screw heads fall under module footprints. Fasten FR4 before modules and provide raised standoffs/trays or underside relief.
- The boss top planes are nominally coplanar: perimeter bosses rise approximately 6 mm from the main floor, while the four middle bosses rise 5 mm from a 1 mm raised floor. The FR4 bears directly on these tops with no 1 mm compensation shim; straightedge verification is still required before release.

## Follow-up

- Fit a `272 x 193 mm` template, transfer H1-H8, and measure their coordinates, boss height, top-plane variation, hole diameter/depth, and blind-hole state; derive rigid compensation and limited screw length from those measurements.
- Confirm the `66 x 61 x 40 mm` battery and `46 x 21 x 10 mm` CN3791 allowance envelopes with calipers and freeze tray/clip details.
- Measure cable OD, gland thread, RF bulkhead, and minimum bend radius before converting route envelopes into a production harness.
- Freeze the four subplate-to-FR4 support holes.
- Generate the FR4 and stainless subplate DXFs.
- Run closing, transport, zero-repeatability, and IP65 tests.
