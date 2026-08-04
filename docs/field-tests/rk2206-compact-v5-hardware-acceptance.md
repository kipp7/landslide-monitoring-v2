---
title: RK2206 Compact V5 hardware acceptance
status: candidate
updated: 2026-08-04
---

# RK2206 Compact V5 Hardware Acceptance

Compact V5 is the successor to the rejected 157-byte V4 periodic frame. It
preserves every V3 field sensor, battery, and professional RTK field, adds the
essential RTCM runtime summary, and produces a 128-byte complete COBS/CRC frame.

## Release Gate

The immutable release manifest must prove all of the following before flashing:

- Compact version 5, 110-byte payload, 128-byte complete frame;
- hardware SC16IS752/soil/EC/three-axis tilt and field-calibrated PC0 battery;
- simulated GNSS for the indoor stage, with PB6/PB7 UART not initialized;
- RTCM capability disabled and runtime boot mode disabled;
- P2 targeted single-flight polling and unique A/B/C identity;
- clean source commit, complete hashes, and all firmware safety tests passed.

Install the generic decoder, shared runner, and V5 wrapper on RK3568:

```bash
sudo install -m 0755 xls1_three_node_batch_poll.py /usr/local/bin/xls1_three_node_batch_poll.py
sudo install -m 0755 xls1_compact_v4_acceptance.py /usr/local/bin/xls1_compact_v4_acceptance.py
sudo install -m 0755 xls1_compact_v5_acceptance.py /usr/local/bin/xls1_compact_v5_acceptance.py
```

Keep `NTRIP_ENABLED=false`, then run:

```bash
sudo python3 /usr/local/bin/xls1_compact_v5_acceptance.py --required-gnss-source simulated --check-prerequisites
sudo python3 /usr/local/bin/xls1_compact_v5_acceptance.py --required-gnss-source simulated
```

The runner holds the production gateway once and executes 60, 600, then 1800
seconds, stopping on the first failure. It requires 100% command matching,
continuous node sequences, zero decode/CRC/unmatched/duplicate/profile errors,
zero XLS1 retries, command latency at most 1500 ms, total protected-session
latency at most 6000 ms, and A/B/C arrival P95 at most 2500 ms. All real
soil/EC/tilt fields and the calibrated battery must remain valid. RTCM must be
READY-only, fail-closed, and clean.

Before the first command, the runner drains the shared receiver until it has
observed 5 seconds of continuous silence, bounded by a 30-second timeout. The
protected response window is 6 seconds, while the independent command-latency
gate remains 1500 ms. The longer window prevents a late frame from colliding
with the next node; it does not relax the performance requirement.

Passing this indoor gate proves only the three-node sensor/transport baseline.
It does not prove RTCM injection, RTK Fixed, centimetre accuracy, or the
professional displacement algorithm. Those gates remain PROBE, LIVE mixed
load, and outdoor hardware-GNSS validation in that order.
