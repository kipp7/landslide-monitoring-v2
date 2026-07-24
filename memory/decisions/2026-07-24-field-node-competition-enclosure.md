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
- Keep the tilt transmitter inside the box for competition consistency.
- Mount the tilt transmitter on a dedicated `120 x 85 x 3 mm` 304 stainless subplate with four-point support. Keep the PCB, battery, and charger on FR4.
- Do not use a full steel internal plate.

## Rationale

A full `265 x 185 x 3 mm` steel plate weighs about 1.16 kg, adds long-term load to the plastic bosses, and creates RF risk for GPS/DL-XLS1. A local stainless reference plate improves tilt-sensor flatness while retaining electrical insulation and lower mass elsewhere.

## Consequences

- The competition configuration improves repeatability but is not automatically a field-grade measurement reference.
- The enclosure must use a two-point or four-point external bracket and must be recalibrated after transport.
- The FR4 DXF cannot be released until a physical template captures the scallops, boss coordinates, and clearances.

## Follow-up

- Measure the enclosure bosses and battery envelope.
- Freeze the four subplate-to-FR4 support holes.
- Generate the FR4 and stainless subplate DXFs.
- Run closing, transport, zero-repeatability, and IP65 tests.
