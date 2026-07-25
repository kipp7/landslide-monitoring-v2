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
- Use an irregular removable 3 mm FR4/G10 main mounting plate; `265 x 185 mm` is its maximum envelope, not a finished rectangular outline.
- Use the six physical low bosses identified as P1-P6 in `hardware/field-node/enclosure/assets/08-enclosure-six-boss-selection.png`: three positions along the enclosure long axis and two along the short axis. Do not substitute the brass lid bosses or side-wall outer bosses during assembly.
- Keep the tilt transmitter inside the box for competition consistency.
- Mount the tilt transmitter on a dedicated `120 x 85 x 3 mm` 304 stainless subplate with four-point support. Keep the PCB, battery, and charger on FR4.
- Do not use a full steel internal plate.

## Rationale

A full `265 x 185 x 3 mm` steel plate weighs about 1.16 kg, adds long-term load to the plastic bosses, and creates RF risk for GPS/DL-XLS1. A local stainless reference plate improves tilt-sensor flatness while retaining electrical insulation and lower mass elsewhere.

The selected P1-P6 pattern forms a broad support polygon around the intended load area, suppresses long-edge bending with the middle pair, and preserves access to the lid fasteners and side-wall reliefs. Six points are sufficient for the 3 mm FR4 prototype without increasing the number of plastic threads that can be damaged during assembly.

## Consequences

- The competition configuration improves repeatability but is not automatically a field-grade measurement reference.
- The enclosure must use a two-point or four-point external bracket and must be recalibrated after transport.
- The FR4 DXF cannot be released until a physical template captures the scallops, boss coordinates, and clearances.
- P1-P6 identity is frozen, but their coordinates, boss height, hole depth, blind-hole state, spacer height, and screw length are not. Photo pixels must never be converted into machining coordinates.

## Follow-up

- Measure P1-P6 coordinates, boss height, top-plane variation, hole diameter/depth, and blind-hole state; derive rigid-spacer height and limited screw length from those measurements.
- Confirm the photo-estimated `70 x 55 x 40 mm` battery envelope with calipers.
- Freeze the four subplate-to-FR4 support holes.
- Generate the FR4 and stainless subplate DXFs.
- Run closing, transport, zero-repeatability, and IP65 tests.
