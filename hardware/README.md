# Hardware

This directory contains reviewable hardware handoff material for the landslide monitoring system. It intentionally excludes local scratch exports, extracted Gerber folders, vendor chat screenshots, and generated PDF page images.

## Packages

| Path | Scope | Status |
| --- | --- | --- |
| [`carrier-board/`](carrier-board/) | Existing RK2206/XL01 carrier-board source and production exports | As-built R1.2 package with known documentation conflicts |
| [`field-node/`](field-node/) | Field-node enclosure, solar power, integration, procurement, and R1.3 requirements | EVT0.1 design input; not released for manufacture |

## Source Of Truth

1. A released manufacturing package and its manifest take precedence over concept drawings.
2. Gerber defines fabricated board geometry; the matching schematic, BOM, placement, and editable source must be reconciled before ordering.
3. Files marked `DRAFT`, `EVT0.1`, or `concept` are design inputs, not production drawings.
4. Durable decisions and active work are tracked under [`memory/`](../memory/).

Do not copy a local working directory into this tree wholesale. Add only named deliverables with an owner, status, revision, and review context.
