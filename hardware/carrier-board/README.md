# Carrier Board Hardware

This directory contains the public carrier-board handoff package for the RK2206/XL01 landslide monitoring node.

> **Source-of-truth warning:** the `150 x 100 mm` layout notes and SVG are historical placement concepts. The `2026-05-05` production Gerber has an actual `170 x 115 mm` outline with four corner mounting holes. The physical/production board uses finished RK2206, DL-XLS1, CJMCU-752, and isolated RS485 modules, while the exported schematic and BOM still describe an older or partial implementation. Do not order a new assembly until these files are reconciled.

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

## Manufacturing Notice

The existing files are an as-built investigation package, not a complete internally consistent release. Review the Gerber, editable source, schematic, BOM, pick-and-place orientation, connector footprints, and supplier substitutions before ordering. The active reconciliation and R1.3 requirements are tracked in [`../field-node/`](../field-node/).
