---
title: RK2206 Compact V4 indoor RS485 acceptance
status: active
updated: 2026-08-03
---

# RK2206 Compact V4 Indoor RS485 Acceptance

This profile stabilizes the real two-sensor RS485 path indoors before the
three UM220 receivers are tested outside. It is a transport and sensor gate,
not an RTK or centimetre-accuracy test.

## Truth Profile

| Path | Source | Required behavior |
| --- | --- | --- |
| XLS1 PB2/PB3 | hardware | EUART2 M1 at 115200 baud |
| SC16IS752 PB4/PB5 | hardware | EI2C0 M0 initialized |
| soil temperature/moisture/EC | hardware | valid Modbus response on channel 0, address 1 |
| three-axis tilt | hardware | valid Modbus response on channel 1, address 1 |
| PC0 battery | hardware | input-only ADC with accepted A/B/C calibration |
| GNSS PB6/PB7 | simulated | UM220 UART is not initialized |
| RTCM | disabled | no capability, session, queue, or activity |

The simulated GNSS payload is marked `gnss_source=simulated`, reports ordinary
single-fix quality only, and must remain `rtk_trusted=false` and
`rtk_displacement_eligible=false`. It must not be used to initialize a baseline,
calculate displacement, or demonstrate Fixed/centimetre accuracy.

## Build And Flash Gate

Create the immutable A/B/C package only from a clean, pushed commit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/prepare-xl01-rs485-hardware-gnss-simulated-release.ps1
```

The release verifier requires Compact V4, 139-byte payloads, 157-byte complete
frames, real RS485 markers, no GPS UART initialization marker, final PC0
calibration, unique A/B/C identities, RTCM disabled, and `sourceDirty=false`.
Flash only the image matching the physical node label.

## Runtime Gate

Keep RK3568 `NTRIP_ENABLED=false`. After all three nodes are powered, run:

```bash
sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py \
  --required-gnss-source simulated \
  --check-prerequisites

sudo python3 /usr/local/bin/xls1_compact_v4_acceptance.py \
  --required-gnss-source simulated
```

The second command executes fail-fast 60, 600, and 1800 second stages. Every
stage requires all A/B/C responses, continuous sequences, no decode/CRC or
unmatched frames, real soil/EC/tilt validity, field-calibrated PC0 data, the
simulated GNSS source marker, and zero RTCM history. Do not tune link timing
until the 1800-second baseline has completed.

## Outdoor Transition

After the indoor 1800-second gate passes, create a separate clean package with
`FieldSensorMode=hardware` and `GnssSourceMode=hardware`. Test the real UM220,
BT-760 antenna, NTRIP/RTCM, correction age, `GGA=4`, Fixed continuity, and the
professional displacement pipeline outside. Never convert the indoor package
to real GNSS through a runtime toggle; GNSS source selection is compile-time.
