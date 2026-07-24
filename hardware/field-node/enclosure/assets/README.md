# Enclosure Engineering Visual Assets

The `01`-`07` SVG/PNG pairs are engineering reference visuals for the current field-node architecture. They use confirmed dimensions where available and mark unknown inputs as `TBD`. They are not released manufacturing drawings.

| Asset | Scope |
| --- | --- |
| `01-field-node-system-architecture.*` | Field node, RK3568 gateway, and alarm terminal boundary; power and data ownership |
| `02-competition-unit-external-arrangement.*` | Proportional external arrangement of the 320 mm enclosure, 290 mm panel, and common back-frame |
| `03-internal-packing-study.*` | 1:2 packing study for the 265 x 185 mm maximum FR4 envelope, 170 x 115 mm PCB, and rotated tilt subplate |
| `04-internal-mounting-exploded-view.*` | Mechanical stack, four-point tilt support, and fastener/material rules |
| `05-power-and-signal-architecture.*` | Solar, 3S battery, CN3791 candidate, RS485, GNSS, and RTCM paths |
| `06-gnss-side-platform-detail.*` | BT-760 / BT-M87SF side outrigger concept and phase-center stability constraints |
| `07-design-input-status.*` | Known, TBD, and blocked inputs required before fabrication release |
| `internal-layout-concept.*` | Earlier concept visual retained for history; not a manufacturing drawing |
| `solar-panel-enclosure-mount-concept.*` | Earlier shared back-frame concept retained for history |
| `competition-tilt-mount-section.*` | Earlier competition tilt stack concept retained for history |
| `field-tilt-reference-concept.*` | Earlier long-term field reference concept retained for history |

## AI reference renders

`renderings/field-node-integrated-exterior-reference-4k.png` is an Image 2 product render generated from the external engineering drawings. It is for communication only and must not be used to infer hole coordinates, bracket lengths, connector locations, or manufacturing tolerances.

The attempted open-enclosure Image 2 render was rejected and is not included because it invented extra boards and changed the carrier-board/module geometry. Internal assembly review must use `03-internal-packing-study.*`, `04-internal-mounting-exploded-view.*`, and `05-power-and-signal-architecture.*`.

The previously generated `field-node-integrated-solar-gnss-concept-4k.png` is intentionally not copied into this package: it was rejected as an engineering baseline because it invented enclosure and module details.

## Release gate

Do not publish a fabrication DXF or purchase a final FR4 plate until the box hole coordinates, scallop outline, battery envelope, CN3791 module envelope, cable diameters, panel frame holes, and BT-M87SF three-hole data are measured and recorded.
