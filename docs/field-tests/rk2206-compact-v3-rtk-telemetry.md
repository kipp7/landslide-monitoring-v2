# RK2206 Compact V3/V4/V5 RTK Telemetry Contract

## Purpose

`compact v5` is the RK2206-to-RK3568 periodic telemetry candidate for the three
field nodes. It keeps the complete 95-byte V3 sensor/GNSS prefix and adds a
bounded RTCM runtime summary. V4 remains decodable for diagnostics and rollback
analysis, but its 157-byte complete frame failed the real shared-XLS1 long gate.

The design priorities are:

1. one response per node and poll, with no packet-level join on RK3568;
2. centimetre-level coordinates without floating-point precision loss;
3. enough evidence to reject stale or non-Fixed solutions;
4. no raw NMEA, GSV, C/N0 detail, or receiver debug output on the normal link;
5. no SHT30 or MPU6050 metrics in the active firmware or payload.

## Wire Size

- Compact V3 payload: 95 bytes; complete COBS/CRC frame: 113 bytes.
- Compact V4 payload: 139 bytes; complete COBS/CRC frame: 157 bytes.
- Compact V5 payload: 110 bytes; complete COBS/CRC frame: exactly 128 bytes.
- The payload is one fixed snapshot. GNSS is not sent as a second frequent
  packet.

The DL-XLxx manual defines a nominal `[0,64] B` session payload. V5 therefore
fits in at most two nominal radio packets, whereas V4 needs at least three.
This reduces the mechanism that produced late 236/78-byte interleaving in the
V5-r4 firmware gate. It is still a candidate until it passes the strict real
three-node 60/600/1800-second tests; byte arithmetic is not field evidence.

## Payload Layout

| Offset | Bytes | Content |
| --- | ---: | --- |
| 0 | 2 | ASCII magic `LS` |
| 2 | 1 | payload version, fixed to `3` |
| 3 | 1 | node number, A/B/C = 1/2/3 |
| 4 | 1 | warning, simulated-field, and simulated-GNSS flags |
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

## V4 RTCM Extension

| Offset | Bytes | Metric/meta projection |
| --- | ---: | --- |
| 95 | 1 | `rtcm_injection_mode_code`: 0 disabled, 1 probe, 2 live |
| 96 | 1 | `rtcm_state_flags` in metadata |
| 97 | 1 | `rtcm_queue_pending` |
| 98 | 1 | `rtcm_queue_high_watermark` |
| 99 | 4 | `rtcm_session_epoch` |
| 103 | 4 | `rtcm_lease_remaining_ms` |
| 107 | 4 | `rtcm_last_fragment_age_ms` |
| 111 | 4 | `rtcm_last_completed_frame_age_ms` |
| 115 | 4 | `rtcm_last_action_age_ms` |
| 119 | 4 | `rtcm_accepted_fragments_total` |
| 123 | 4 | `rtcm_completed_frames_total` |
| 127 | 4 | `rtcm_injected_frames_total` |
| 131 | 2 | `rtcm_rejected_fragments_total` |
| 133 | 2 | `rtcm_crc_errors_total` |
| 135 | 2 | `rtcm_queue_drops_total` |
| 137 | 2 | `rtcm_uart_errors_total` |

An unavailable age is encoded as `UINT32_MAX` and omitted by RK3568 rather
than exposed as a plausible measurement. State flags report ready, armed
session, valid lease, recent fragment, recent completed frame, and recent
action evidence.

## V5 RTCM Summary

| Offset | Bytes | Metric/meta projection |
| --- | ---: | --- |
| 95 | 1 | `rtcm_injection_mode_code`: 0 disabled, 1 probe, 2 live |
| 96 | 1 | `rtcm_state_flags` in metadata |
| 97 | 1 | `rtcm_queue_pending` |
| 98 | 1 | `rtcm_queue_high_watermark` |
| 99 | 4 | `rtcm_session_epoch` |
| 103 | 2 | lease remaining, unsigned units of 100 ms, rounded up |
| 105 | 2 | last completed RTCM frame age, unsigned units of 10 ms |
| 107 | 2 | injected-frame counter, saturated at 65535 |
| 109 | 1 | cumulative error-summary and counter-saturation flags |

Age `0xFFFF` means unavailable and is omitted by RK3568. Error bits 0..4 mean
rejected fragment observed, CRC error observed, queue drop observed, UART error
observed, and injected counter saturated. Bits 5..7 are reserved and rejected.
The gateway publishes the four error classes as booleans plus
`rtcm_error_summary_flags`; it does not misrepresent those bits as exact
counters. Exact accepted/completed/rejected/CRC/drop/UART totals remain in the
single-node, on-demand G3S V5 response and are never queried periodically.

The decoder rejects reserved flags, impossible queue state, a recent-complete
flag without an available completion age, a false saturation claim, and active
RTCM without a non-zero session and lease. Disabled mode must have no armed
session, lease, or pending queue, preserving fail-closed behavior.

The validity bitmap is authoritative. A zero-filled fixed-width slot is not a
measurement unless its corresponding validity bit is set.

## Trusted RTK Gate

RK2206 only sets `GNSS_FIX_TRUSTED` when all conditions are true:

- the current checksum-valid GGA reports quality `4` (RTK Fixed);
- latitude and longitude parsed successfully;
- the configured coordinate frame is known;
- correction age is present and no greater than 6000 ms;
- local solution age is no greater than 2000 ms.

RK3568 independently validates the same conditions and rejects contradictory
validity flags, reserved bits, impossible Fixed ratios, invalid coordinate
frames, and out-of-range coordinates. Only a trusted epoch is eligible for the
professional ECEF/ENU displacement pipeline.

Bit 2 of the status byte marks a synthetic GNSS snapshot. For that source,
RK2206 clears checksum, trusted, time, GST, correction-age, reference-station,
and Fixed-statistics evidence before serialization. RK3568 independently
rejects a simulated snapshot that claims `GNSS_FIX_TRUSTED` and always sets
`rtk_displacement_eligible=false`. Synthetic coordinates are therefore useful
for indoor display and transport checks but are never RTK or displacement
evidence.

## Snapshot And Compatibility Rules

- `compact v3/v4/v5` replaces the complete field-device shadow. Missing values in
  a current snapshot purge stale legacy, MPU6050, SHT30, and old RTK values.
- `compact v1/v2` keeps sparse merge behavior so the deployed rollback firmware
  remains compatible.
- RK3568 does not create ordinary `gps_latitude/gps_longitude` aliases from v3;
  precise coordinates remain under the `rtk_*` namespace.
- Ellipsoid height and human-readable fix type are derived on RK3568 rather
  than duplicated on the radio payload.

## Pin And Bring-Up Safety

RS485 and GNSS use independent build-time source profiles. With
`FieldSensorMode=simulated`, RK2206 generates soil/EC/tilt values and never
initializes SC16IS752 on PB4/PB5. With `GnssSourceMode=simulated`, RK2206
generates a non-trusted single-fix snapshot and never initializes the UM220
UART on PB6/PB7. XLS1 on PB2/PB3 and the field-calibrated PC0 battery path stay
real in both profiles.

The indoor RS485 gate uses `FieldSensorMode=hardware` together with
`GnssSourceMode=simulated`: both RS485 sensors are real, GNSS is explicitly
synthetic, and RTCM capability is compiled out. The outdoor gate rebuilds from
a clean commit with both sources set to `hardware`.

The hardware build restores SC16IS752 over EI2C0_M0 PB4/PB5 and must not be
flashed until the interface components, continuity, supply, direction, and
I2C-address gates have passed.

The hardware-GNSS V5 production image may contain LIVE RTCM capability but every boot is
fail-closed in `DISABLED`. RK3568 must explicitly arm a non-zero session epoch,
target mask, mode, and 15..300 second lease. Reboot, lease expiry, invalid
session state, or an explicit disable command returns the node to `DISABLED`.
No RTCM is sent while `NTRIP_ENABLED=false` on RK3568.
