# XLS1 Compact Telemetry v1

## Goal

Carry one complete field-node telemetry sample in one XLS1 base-session radio packet. The existing cloud MQTT and JSON contracts remain unchanged; RK3568 expands this southbound-only binary payload before publishing.

## Wire Budget

| Layer | Bytes |
| --- | ---: |
| Compact telemetry payload | 46 |
| Field-link header | 12 |
| CRC32 | 4 |
| COBS overhead for a packet below 254 bytes | 1 |
| Frame delimiter | 1 |
| Total UART/radio session frame | 64 |

The size is fixed. Any v1 encoder output other than 46 payload bytes is invalid.

## Byte Layout

All multi-byte integers are big-endian.

| Offset | Size | Field | Scale / Meaning |
| ---: | ---: | --- | --- |
| 0 | 2 | magic | ASCII `LS` |
| 2 | 1 | version | `1` |
| 3 | 1 | node | A=`1`, B=`2`, C=`3` |
| 4 | 1 | flags | bit 0 = warning |
| 5 | 1 | upload trigger | 1 periodic, 2 manual, 3 scheduler poll |
| 6 | 2 | valid flags | temp, soil, EC, tilt, GPS, rain, IMU |
| 8 | 4 | sequence | unsigned sample sequence |
| 12 | 4 | uptime | seconds |
| 16 | 4 | command tag | FNV-1a 32-bit hash of command UUID |
| 20 | 2 | temperature | signed, 0.01 C |
| 22 | 2 | humidity | unsigned, 0.01 percent |
| 24 | 2 | soil temperature | signed, 0.01 C |
| 26 | 2 | soil moisture | unsigned, 0.01 percent |
| 28 | 2 | soil EC | unsigned, 1 uS/cm |
| 30 | 2 | tilt X | signed, 0.01 degree |
| 32 | 2 | tilt Y | signed, 0.01 degree |
| 34 | 2 | tilt Z | signed, 0.01 degree |
| 36 | 4 | GPS latitude | signed, 1e-6 degree |
| 40 | 4 | GPS longitude | signed, 1e-6 degree |
| 44 | 2 | rain total | unsigned, 0.1 mm |

Validity bits are authoritative. A numeric field with a clear validity bit must be ignored even when its encoded bytes are zero.

## Compatibility Boundary

- Command and command-ACK payloads remain JSON.
- Compact telemetry still uses field-link frame type `telemetry` and the existing CRC32.
- The stable `competition-suite-20260723` firmware remains JSON/polled and is the rollback image.
- Compact firmware must not be paired with the production gateway until the RK3568 decoder is deployed or the standalone batch harness owns `/dev/ttyS3`.
