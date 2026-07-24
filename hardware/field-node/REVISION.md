# Field Node Hardware Revisions

## Current Baseline

| Item | Revision | State | Manufacturing status |
| --- | --- | --- | --- |
| Integrated field node | `FIELD-NODE-HW-EVT0.1` | Design input | Not released |
| Existing carrier board | `R1.2` | As-built reference | Gerber exists; source documents conflict |
| Carrier-board improvement | `R1.3-DRAFT` | Requirements | Not routed or released |
| Competition enclosure | `MECH-R0.1` | Concept and measured inputs | Hole coordinates pending |
| Solar subsystem | `PWR-R0.1` | Candidate architecture | Charger and energy budget unqualified |
| Prototype procurement | `BOM-R0.1` | Sample purchasing list | Not a production AVL |

## Change History

### 2026-07-24 - `FIELD-NODE-HW-EVT0.1`

- Recorded the actual R1.2 Gerber outline as `170 x 115 mm` with four corner mounting holes.
- Selected the purchased IP65 enclosure and an irregular removable FR4/G10 mounting plate.
- Added the competition tilt-sensor subplate design and froze the manual-derived `90 x 58 x 36 mm`, `78 x 39 mm` mechanical interface.
- Recorded the SWM-10W panel and 3S `11.1 V / 5000 mAh` battery inputs.
- Defined solar charging, interface, protection, and prototype procurement requirements.

## Versioning Rules

- Increment `MECH-Rx.y`, `PWR-Rx.y`, and `BOM-Rx.y` independently while requirements are still changing.
- Create a `FIELD-NODE-HW-EVTn` release only when its manifest lists exact source files, drawing revisions, checksums, test evidence, and known deviations.
- Never overwrite a released manufacturing archive; add a new revision and explain the delta.
