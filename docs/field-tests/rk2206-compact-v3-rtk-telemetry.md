# RK2206 Compact V3 RTK Telemetry Contract

## Purpose

`compact v3` is the normal RK2206-to-RK3568 telemetry response for the three
field nodes. It combines field sensors, PC0 battery evidence, and the latest
structured GNSS solution into one fixed binary snapshot.

The design priorities are:

1. one response per node and poll, with no packet-level join on RK3568;
2. centimetre-level coordinates without floating-point precision loss;
3. enough evidence to reject stale or non-Fixed solutions;
4. no raw NMEA, GSV, C/N0 detail, or receiver debug output on the normal link;
5. no SHT30 or MPU6050 metrics in the active firmware or payload.

## Wire Size

- Compact payload: 95 bytes.
- Complete COBS/CRC field-link frame: 113 bytes.
- The payload is one fixed snapshot. GNSS is not sent as a second frequent
  packet.

At 115200 baud, a 113-byte 8N1 serial frame occupies about 9.8 ms. Three nodes
at one response per second use about 339 B/s of payload framing; the production
poll scheduler remains slower and prioritizes zero missing rounds.

## Payload Layout

| Offset | Bytes | Content |
| --- | ---: | --- |
| 0 | 2 | ASCII magic `LS` |
| 2 | 1 | payload version, fixed to `3` |
| 3 | 1 | node number, A/B/C = 1/2/3 |
| 4 | 1 | warning and simulated-field flags |
| 5 | 1 | upload trigger |
| 6 | 2 | v3 validity bitmap |
| 8 | 4 | telemetry sequence |
| 12 | 4 | node monotonic uptime in seconds |
| 16 | 4 | command correlation tag |
| 20 | 2 | calibrated PC0 battery voltage in mV |
| 22 | 1 | 3S OCV state-of-charge estimate |
| 23 | 1 | battery calibration quality |
| 24 | 2 | RS485 soil temperature, signed 0.01 C |
| 26 | 2 | RS485 soil moisture, 0.01 percent |
| 28 | 2 | RS485 electrical conductivity, uS/cm |
| 30 | 2 | independent RS485 tilt X, signed 0.01 degree |
| 32 | 2 | independent RS485 tilt Y, signed 0.01 degree |
| 34 | 2 | independent RS485 tilt Z, signed 0.01 degree |
| 36 | 8 | latitude, signed 1e-9 degree |
| 44 | 8 | longitude, signed 1e-9 degree |
| 52 | 4 | mean-sea-level altitude in mm |
| 56 | 4 | geoid separation in mm |
| 60 | 4 | correction age in ms |
| 64 | 4 | local solution age in ms |
| 68 | 4 | GNSS time-of-week in ms |
| 72 | 2 | GNSS week |
| 74 | 1 | raw NMEA GGA quality |
| 75 | 1 | coordinate frame code |
| 76 | 2 | GNSS evidence and validity flags |
| 78 | 1 | satellites used |
| 79 | 2 | HDOP, 0.01 |
| 81 | 2 | GST latitude sigma in mm |
| 83 | 2 | GST longitude sigma in mm |
| 85 | 2 | GST altitude sigma in mm |
| 87 | 2 | continuous Fixed duration in seconds |
| 89 | 2 | recent Fixed ratio in permille |
| 91 | 2 | Fixed-to-non-Fixed transition count |
| 93 | 2 | reference station ID |

The validity bitmap is authoritative. A zero-filled fixed-width slot is not a
measurement unless its corresponding validity bit is set.

## Trusted RTK Gate

RK2206 only sets `GNSS_FIX_TRUSTED` when all conditions are true:

- the current checksum-valid GGA reports quality `4` (RTK Fixed);
- latitude and longitude parsed successfully;
- the configured coordinate frame is known;
- correction age is present and no greater than 5000 ms;
- local solution age is no greater than 2000 ms.

RK3568 independently validates the same conditions and rejects contradictory
validity flags, reserved bits, impossible Fixed ratios, invalid coordinate
frames, and out-of-range coordinates. Only a trusted epoch is eligible for the
professional ECEF/ENU displacement pipeline.

## Snapshot And Compatibility Rules

- `compact v3` replaces the complete field-device shadow. Missing values in a
  current v3 snapshot purge stale legacy, MPU6050, SHT30, and old RTK values.
- `compact v1/v2` keeps sparse merge behavior so the deployed rollback firmware
  remains compatible.
- RK3568 does not create ordinary `gps_latitude/gps_longitude` aliases from v3;
  precise coordinates remain under the `rtk_*` namespace.
- Ellipsoid height and human-readable fix type are derived on RK3568 rather
  than duplicated on the radio payload.

## Pin And Bring-Up Safety

For `FieldSensorMode=simulated`, RK2206 generates only realistic soil/EC/tilt
values. Real UM220 GNSS, XLS1, and PC0 battery sampling remain active, while the
SC16IS752 path is not built or initialized. PB4/PB5 therefore remain untouched
until the explicit hardware build is selected.

The hardware build restores SC16IS752 over EI2C0_M0 PB4/PB5 and must not be
flashed until the interface components, continuity, supply, direction, and
I2C-address gates have passed. RTCM injection remains disabled in both builds
until the separate mixed-load gate is complete.
