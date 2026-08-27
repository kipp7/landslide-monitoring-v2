# PCB Layout Module Carrier v7 Notes

> Historical concept only. The production Gerber outline is `170 x 115 mm`; this document's `150 x 100 mm` reference must not be used for enclosure or fabrication dimensions.

Board reference size: 150mm x 100mm.

This is a placement guide for the hand-soldered module-carrier version. It is not a locked mechanical drawing. Before ordering PCBs, verify real module dimensions, socket spacing, pin 1 direction, and acrylic cover clearance.

## Placement Table

| Ref | Part | Suggested size | Suggested position | Notes |
|---|---|---:|---|---|
| J1 | XH2.54 2P battery input | about 12 x 8mm | left edge, x=4, y=18 | Side-entry opening faces board edge. Pin1 BAT+, pin2 BAT-. |
| SW1 | SS-12D10G5 power switch | 13.5 x 6.6mm | x=20, y=17.5 | Must be reachable from board top or acrylic cutout. |
| F1/Q1/D4/D5/C15/C16 | Input protection/filter | grouped | x=6-58, y=28-36 | Keep compact. C15 positive to VBAT_SW, negative to GND. |
| U1 | MP1584 5V module | 22.5 x 17mm | x=7, y=39 | Hand-solder, adjust output to 5.00V before soldering. |
| U2 | MP1584 3.3V module | 22.5 x 17mm | x=35, y=39 | Hand-solder, adjust output to 3.30V before soldering. |
| D1/R1 | Power LED/resistor | small | x=5, y=58 | Visible from edge/top. |
| U3 | DL-XLS1 | 18 x 27mm | x=69, y=10 | Keep antenna side near board edge. Avoid copper/metal in antenna keepout. |
| J2/J3/SW2 | DL-XLS1 CMD/USR/KEY | small | x=90, y=11-34 | Keep near DL-XLS1. Watch acrylic cover height. |
| J4 | GPS 1x4 female header | about 18 x 7mm | x=111, y=8 | Keep away from MP1584 switching modules. |
| J5/J8 + RK2206 | RK2206 projection | 72.5 x 60.7mm | x=34, y=37 | Largest mechanical constraint. Confirm pin1 and row spacing. |
| U4 | CJMCU-752 / SC16IS752 module socket | 24 x 23mm | x=112, y=31 | Measure 2x8 and 2x5 socket positions from real module before PCB order. |
| U5 | Isolated TTL-to-RS485 module 1 | 34 x 18mm | x=111, y=58 | VIN/TX/RX/GND on left, A+/B+/earth on right. |
| U6 | Isolated TTL-to-RS485 module 2 | 34 x 18mm | x=111, y=79 | Same as U5. |

## Routing Widths

| Net class | Suggested width |
|---|---:|
| VBAT_IN / VBAT_SW main power | 1.0-1.5mm |
| 5V_SYS | 0.8-1.0mm |
| 3V3_SYS | 0.6-0.8mm |
| GND | copper pour, with stitching vias |
| I2C_SDA / I2C_SCL | 0.2-0.3mm |
| UART TX/RX | 0.2-0.3mm |
| RS485 A/B | 0.3-0.5mm, short and parallel |

## Critical Checks Before PCB Order

- CJMCU-752 socket hole positions must be measured from the real module.
- RS485 isolated module footprint must match the vendor footprint: left TTL 2.54mm pads and right 5.08mm terminal/half-hole area.
- Use 3V3_SYS for RS485 module VIN unless module TX output is proven 3.3V-safe when powered by 5V.
- RS485 module UART wiring is crossed: module TX to SC16IS752 RX, module RX to SC16IS752 TX.
- Acrylic cover clearance must account for RK2206 height, female sockets, MP1584 modules, CJMCU-752 module, and RS485 modules.
- Keep MP1584 modules away from DL-XLS1 and GPS area.
