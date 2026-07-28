# Carrier Board Hardware

This directory contains the public carrier-board handoff package for the RK2206/XL01 landslide monitoring node.

> **Source-of-truth warning:** the `150 x 100 mm` layout notes and SVG are historical placement concepts. The V1.3 order Gerber has an actual `170 x 115 mm` outline and is archived separately from the older V1.2 investigation files. Its pre-final editable source export does not include the last RS485 ground edits; use the immutable order Gerber plus the V1.3 production README for fabrication traceability.

## Contents

| Path | Purpose |
| --- | --- |
| `assets/board-layout-module-carrier-150x100-v7.svg` | Human-readable layout reference. |
| `board-layout-notes.md` | Placement, connector, and routing notes. |
| `coordinate-table.md` | Component coordinate planning table. |
| `pin1-dimension-notes.md` | Pin-1 and mechanical dimension notes. |
| `electrical-layout-notes.zh-CN.md` | Chinese electrical and wiring notes. |
| `production/gerber-pcb1-2026-05-05.zip` | Gerber package for PCB fabrication review. |
| `production/schematic-2026-04-30.pdf` | Schematic export. |
| `production/pcb-preview-2026-05-05.pdf` | PCB preview export. |
| `production/bom-board1-2026-04-23.xlsx` | BOM export. |
| `production/pick-and-place-2026-04-27.xlsx` | Pick-and-place export. |
| `production/lceda-project-rk2206-v1.2-2026-05-02.epro2` | LCEDA project package. |
| `production/v1.3/` | V1.3 order Gerber, BOM, review evidence, order settings and known source gap. |

## Manufacturing Notice

V1.2 remains an as-built investigation package. V1.3 was ordered as a five-board prototype on 2026-07-28, but it is not an as-built release until the production proof, received boards, final editable source, schematic and EVT evidence are reconciled. The active requirements and deviations are tracked in [`../field-node/`](../field-node/).
