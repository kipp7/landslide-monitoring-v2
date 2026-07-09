# PCB Layout Coordinate Table v5

Origin: board top-left. Unit: mm. Board: 150 x 100.

| ID | Name | X | Y | W | H | Note |
|---|---|---:|---:|---:|---:|---|
| KO1 | RK2206 projection / no tall parts | 40 | 37 | 72.5 | 60.7 | 72.5 x 60.7 x 11.1mm |
| KO2 | DL-XLS1 antenna keepout | 101 | 3 | 31 | 11 | no copper, traces, screws, metal |
| KO3 | power tall-part zone | 3 | 3 | 32 | 94 | MP1584/switch/electrolytic outside RK projection |
| KO4 | RS485 field wiring zone | 123 | 36 | 26 | 58 | terminals/TVS/transceivers inside edge clearance |
| J1 | BAT_IN 2P | 5 | 8 | 11 | 9 | KF142V 5.08-2P approx 11x9 keepout |
| F1 | PPTC 1812 | 19 | 8 | 6 | 4 | 4.5x3.2 body; keepout 6x4 |
| Q1A | Input protection cluster | 28 | 6 | 14 | 10 | AO3401A+D4+D5+R11+C16, detail sheet shows subparts |
| SW1 | PWR_SW | 5 | 22 | 18 | 7 | side switch keepout, verify with chosen footprint |
| C15 | 100uF/25V | 25 | 22 | 8 | 8 | RVT1E101M0607 approx D6.3x7.7 |
| U1 | MP1584_5V | 5 | 36 | 22.5 | 17 | module 22.5x17 |
| U2 | MP1584_3V3 | 5 | 61 | 22.5 | 17 | module 22.5x17 |
| J4 | GPS 1x4 | 45 | 8 | 11 | 5 | 2.54mm 1x4 header |
| J2 | XLS1_CMD | 62 | 8 | 10 | 5 | 2.54mm 1x4 header |
| J3 | XLS1_USR | 62 | 20 | 10 | 5 | 2.54mm 1x4 header |
| U4 | SC16IS752 | 74 | 28 | 12 | 7 | TSSOP-28, detail sheet shows crystal/caps |
| Y1 | 14.7456MHz | 77 | 38 | 5 | 4 | 3225 crystal keepout |
| U3 | DL-XLS1 | 107 | 17 | 18 | 27 | 18x27 module |
| U5 | SP3485_CH1 | 127 | 43 | 7 | 7 | SOIC-8 keepout |
| D2 | SM712_CH1 | 136 | 43 | 4 | 5 | SOT-23 keepout |
| J6 | RS485_CH1 | 141 | 38 | 8 | 23 | 4P 5.08 terminal, depth approx 8-10, length approx 21 |
| U6 | SP3485_CH2 | 127 | 68 | 7 | 7 | SOIC-8 keepout |
| D3 | SM712_CH2 | 136 | 68 | 4 | 5 | SOT-23 keepout |
| J7 | RS485_CH2 | 141 | 64 | 8 | 23 | 4P 5.08 terminal, depth approx 8-10, length approx 21 |
| J5 | RK2206_IF_L | 44 | 52 | 4 | 35 | 1x12; actual position must match connector |
| J8 | RK2206_IF_R | 94 | 52 | 4 | 35 | 1x12; actual position must match connector |

## Detail Dimensions

| Part | Approx size / keepout | Note |
|---|---:|---|
| RK2206 | 72.5 x 60.7 x 11.1mm | projected no-tall-parts area |
| DL-XLS1 | 18 x 27mm | antenna side needs copper/traces/metal keepout |
| MP1584 module | 22.5 x 17mm | two modules |
| 4P 5.08 terminal | ~8-10mm depth, ~21-23mm length | verify exact footprint |
| J1 2P terminal | ~11 x 9mm keepout | verify exact footprint |
| F1 1812 | ~4.5 x 3.2mm body | keepout 6 x 4 |
| AO3401A SOT-23 | ~2.9 x 1.6mm body | Q1 |
| SMBJ15CA SMB | ~4.6 x 3.6mm body | D4 |
| BZT52C10 SOD-123 | ~2.7 x 1.6mm body | D5 |
| R/C 0805 | ~2.0 x 1.25mm body | R11/C16/C1/C2 etc. |
| C15 RVT1E101M0607 | D6.3 x 7.7mm | high component |
| SC16IS752 TSSOP-28 | ~12 x 7mm keepout | body about 9.7 x 4.4 |
| SP3485 SOIC-8 | ~7 x 7mm keepout | body about 4.9 x 3.9 |
| SM712 SOT-23 | ~4 x 5mm keepout | D2/D3 |
| Y1 3225 | ~5 x 4mm keepout | body 3.2 x 2.5 |

## Trace Width Targets

| Net | Width | Note |
|---|---:|---|
| VBAT main rails | 1.2~1.5mm | J1/F1/Q1/SW1/MP1584 input |
| RS485 terminal V+ | 1.0~1.2mm | sensor supply to J6/J7 |
| 5V_SYS | 0.8~1.0mm | GPS/RK2206 |
| 3V3_SYS | 0.5~0.8mm | DL-XLS1/U4/U5/U6 |
| I2C/UART/DE/TP | 0.20~0.25mm | normal digital signals |
| TSSOP escape | 0.15~0.18mm | only short U4 escape, widen after escape |
| RS485 A/B | 0.25~0.30mm | gap 0.25~0.40mm, route parallel |
| XTAL1/XTAL2 | 0.15~0.20mm | very short, away from MP1584 |
| GND | top/bottom pours | many GND vias around U4/U5/U6 |