# PCB Layout Pin1 and Dimensions v6

Origin: board top-left. Unit: mm. Board: 150 x 100.

| ID | Name | X | Y | W | H | Pin1 / direction | Note |
|---|---|---:|---:|---:|---:|---|---|
| KO1 | RK2206 projection / no tall parts | 40 | 37 | 72.5 | 60.7 | - | 72.5 x 60.7 x 11.1mm |
| KO2 | DL-XLS1 antenna keepout | 101 | 3 | 31 | 11 | - | no copper / no traces / no metal |
| KO3 | Power tall-parts zone | 3 | 3 | 32 | 94 | - | MP1584, switch, C15 outside RK projection |
| KO4 | RS485 wiring zone | 123 | 36 | 26 | 58 | - | terminal -> TVS -> SP3485 |
| J1 | BAT_IN 2P | 5 | 8 | 11 | 9 | pin1上侧 | pin1=BAT+ |
| F1 | PPTC 1812 | 19 | 8 | 6 | 4 | 无极性/见细图 | no polarity |
| Q1A | input protect cluster | 28 | 6 | 14 | 10 | 无极性/见细图 | detail: Q1/D4/D5/R11/C16 |
| SW1 | power switch | 5 | 22 | 18 | 7 | pin1左侧 | pin2=COM |
| C15 | 100uF/25V | 25 | 22 | 8 | 8 | pin1上侧 | + to VBAT_SW |
| U1 | MP1584_5V | 5 | 36 | 22.5 | 17 | pin1左侧 | IN left, OUT right |
| U2 | MP1584_3V3 | 5 | 61 | 22.5 | 17 | pin1左侧 | IN left, OUT right |
| J4 | GPS 1x4 | 45 | 8 | 11 | 5 | pin1左侧 | pin1=5V_SYS |
| J2 | XLS1_CMD | 62 | 8 | 10 | 5 | pin1左侧 | pin1=3V3_SYS |
| J3 | XLS1_USR | 62 | 20 | 10 | 5 | pin1左侧 | pin1=3V3_SYS |
| U4 | SC16IS752 | 74 | 28 | 12 | 7 | pin1左上 | pin1 top-left |
| Y1 | 14.7456MHz | 77 | 38 | 5 | 4 | pin1左下 | pin1->XTAL1 |
| U3 | DL-XLS1 | 107 | 17 | 18 | 27 | pin1左上 | pin1 top-left |
| U5 | SP3485_CH1 | 127 | 43 | 7 | 7 | pin1左上 | pin1 RO top-left |
| D2 | SM712_CH1 | 136 | 43 | 4 | 5 | pin1下侧 | pin3 GND side per footprint |
| J6 | RS485_CH1 4P | 141 | 38 | 8 | 23 | pin1上侧 | pin1=V+ |
| U6 | SP3485_CH2 | 127 | 68 | 7 | 7 | pin1左上 | pin1 RO top-left |
| D3 | SM712_CH2 | 136 | 68 | 4 | 5 | pin1下侧 | pin3 GND side per footprint |
| J7 | RS485_CH2 4P | 141 | 64 | 8 | 23 | pin1上侧 | pin1=V+ |
| J5 | RK2206_IF_L | 44 | 52 | 4 | 35 | pin1上侧 | pin1 top |
| J8 | RK2206_IF_R | 94 | 52 | 4 | 35 | pin1上侧 | pin1 top |

## Trace Width Targets

| Net | Width | Note |
|---|---:|---|
| VBAT main rails | 1.2~1.5mm | J1/F1/Q1/SW1/MP1584 input |
| RS485 terminal V+ | 1.0~1.2mm | sensor supply to J6/J7 |
| 5V_SYS | 0.8~1.0mm | GPS/RK2206 |
| 3V3_SYS | 0.5~0.8mm | DL-XLS1/U4/U5/U6 |
| I2C/UART/DE/TP | 0.20~0.25mm | normal digital signals |
| TSSOP escape | 0.15~0.18mm | short local U4 escape only |
| RS485 A/B | 0.25~0.30mm | gap 0.25~0.40mm, parallel |
| XTAL1/XTAL2 | 0.15~0.20mm | very short, away from MP1584 |
| GND | top/bottom pours | many GND vias around U4/U5/U6 |