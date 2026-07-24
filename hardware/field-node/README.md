# Field Node Hardware

Status: `EVT0.1 / design inputs not frozen`

This package records the current productization work for the RK2206 field node. It covers the competition enclosure, internal mounting structure, tilt sensor mounting, solar charging architecture, procurement, and the R1.3 carrier-board requirements.

## Contents

| Path | Purpose |
| --- | --- |
| [`productization-overview.zh-CN.md`](productization-overview.zh-CN.md) | System-level hardware scope, risks, and delivery stages |
| [`REVISION.md`](REVISION.md) | Revision identifiers, state, and change history |
| [`electrical/`](electrical/) | Carrier-board R1.3 requirements and electrical boundaries |
| [`enclosure/`](enclosure/) | Waterproof enclosure, internal plate, tilt sensor interface, and concept visuals |
| [`power/`](power/) | 10 W solar panel, 3S battery, and charging subsystem requirements |
| [`procurement/`](procurement/) | Prototype purchasing list and qualification gates |

## Current Decisions

- Keep the purchased `320 x 240 x 145 mm` IP65 enclosure for the competition build.
- Use a removable 3 mm FR4/G10 internal plate. `265 x 185 mm` is only its maximum envelope; the final outline needs reliefs for the enclosure ribs and scallops.
- Keep the tilt transmitter inside the competition enclosure on a dedicated `120 x 85 x 3 mm` 304 stainless reference plate. Do not replace the whole FR4 plate with steel.
- Connect the 10 W panel to the 3S battery through a complete 12.6 V solar charging module. The panel must not connect directly to the battery or carrier board.
- Preserve the validated RK2206 pinout and module topology while R1.3 adds protection, observability, and maintainability.

## Release Boundary

Nothing in this directory is a fabrication release until the enclosure hole coordinates, battery dimensions/BMS, cable diameters, charging-module qualification, and 24-hour power measurements are recorded in a release manifest.

Active work and unresolved inputs are tracked in [`memory/tasks/2026-07-23-hardware-productization.md`](../../memory/tasks/2026-07-23-hardware-productization.md).
