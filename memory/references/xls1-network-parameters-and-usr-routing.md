---
title: xls1-network-parameters-and-usr-routing
type: note
tags:
  - reference
  - xls1
  - wireless
  - rk2206
  - rk3568
status: active
---

# Reference: XLS1 network parameters and USR routing

## Purpose

Record the verified distinction between DL-XLS1 radio-network configuration and
USR transparent-routing configuration. This prevents the fixed internal port
number `101` from being mistaken for the radio channel when preparing another
four-module network consisting of one RK3568-side center and three RK2206 field
nodes.

## Confirmed model

- Radio isolation is determined by three independent values: channel, 16-bit
  network identifier (PANID), and 16-bit node address.
- Modules can communicate only when channel and PANID match. Addresses within
  that network must be unique.
- If PANIDs differ but the same channel is reused, the networks cannot exchange
  packets but still reduce each other's radio efficiency. Different channels
  provide the stronger separation.
- The channel range is decimal `0..79`; the center frequency is
  `470.25 + 0.5 * channel` MHz. The previously used network was reported as
  channel `12`, corresponding to `476.25 MHz`.
- `.101` is the fixed XLS1 internal port for configuring the USR UART
  subscriber. It is not a channel and therefore remains `.101` on channel 12 or
  any other channel.
- Port `103` is the internal port for reading or changing address, PANID, and
  channel. Port `104` changes module identity, and port `105` controls the
  coordinator's address allocator.
- Port `112`, encoded as hexadecimal byte `70`, is the USR data port.
- Two-byte addresses and PANIDs inside command payloads are little-endian.

## Two command groups

Radio-network parameters, normally issued through the XLS1 `CMD` UART:

```text
FFF0.103:/R
```

Read the locally connected module's address, PANID, and channel. Use this as the
acceptance check before a link test; do not infer the current settings from the
`.101` commands.

```text
FFF0.104:/M 95 C4
FFF0.103:/A <address-low> <address-high>
FFF0.103:/P <panid-low> <panid-high>
FFF0.103:/C <channel>
```

These commands put a module into user-defined identity and then change its
address, PANID, or channel. For example, channel 12 is encoded as `0C`:

```text
FFF0.103:/C 0C
```

A new coordinator can instead be created with explicit PANID and channel:

```text
FFF0.104:/C <panid-low> <panid-high> <channel>
```

If the address-allocation workflow is used, open the allocator only while
members join and close it explicitly afterward:

```text
0000.105:/A
0000.105:/Q
```

Do not power off the coordinator before `/Q`; the manual warns that the latest
allocated address may not be saved, which can later create duplicate addresses.

USR one-to-many/many-to-one routing for a center at address `000A`:

```text
000A.101:/D FF FF 70
FFFF.101:/D 0A 00 70
```

- `000A.101:/D FF FF 70`: configure center `000A` so bytes entering its USR RX
  are sent to broadcast address `FFFF`, destination USR port `112` (`0x70`).
  This is the center-to-all-nodes direction.
- `FFFF.101:/D 0A 00 70`: broadcast the configuration to the other modules so
  bytes entering their USR RX are sent to center address `000A`, destination
  USR port `112`. This is the all-nodes-to-center direction.
- A successful `/D` configuration report is `44 00` according to the vendor's
  one-to-many guide.
- The corresponding vendor example for center address `0001` is
  `0001.101:/D FF FF 70` followed by `FFFF.101:/D 01 00 70`.

Because `FFFF.101` is a same-network broadcast command, isolate or power only
the intended network during configuration when another network may be in radio
range.

## Firmware boundary

- The current RK2206 driver uses only the XLS1 `USR` UART on
  `EUART2_M1 / PB2-PB3` at `115200 8N1` and writes application frames directly.
- It does not use the XLS1 `CMD` UART and contains no `.101`, `.103`, PANID,
  channel, or radio-address configuration logic.
- Therefore, when all four XLS1 modules are already configured with the correct
  network parameters and USR subscriptions, no XLS1 configuration code change
  is required. RK2206 and RK3568 should only transmit and receive data through
  USR.
- Do not add automatic `.101/.103/.104/.105` writes during RK2206 boot. A
  firmware bug or stale default could silently move a working radio into the
  wrong network.
- Application identities remain separate from XLS1 addresses. The three RK2206
  images still need unique A/B/C device identities, and the RK3568 polling and
  time-slot logic still needs to address those application identities.
- If the XLS1 USR baud is not already `115200`, configure it through port 101
  (`...101:/B 08`) or change the firmware UART baud deliberately; both sides
  must match.

## Four-module acceptance checklist

1. Read every module with `FFF0.103:/R` through its CMD UART.
2. Confirm one shared PANID and channel, four unique XLS1 addresses, and no
   overlap with the older network. Prefer a channel different from the older
   channel 12 as well as a different PANID.
3. Confirm center-to-broadcast and child-to-center USR subscriptions with the
   two `.101:/D` commands above.
4. Verify the configured USR baud is `115200 8N1`.
5. Run tagged bidirectional frames through USR and verify that the center sees
   each child independently and all children receive the center broadcast.
6. Only after this baseline passes should application packet size, pacing,
   polling slots, retry, and throughput parameters be tuned.

## Current status 2026-08-01

- The user reports that the newly prepared XLS1 network has already been
  configured.
- Treat the modules as persistent, preconfigured transport hardware. The
  current firmware task does not need XLS1 configuration changes.
- The exact PANID, channel, addresses, and `/D` readback of the new set have not
  yet been independently captured. Record them from `FFF0.103:/R` before the
  formal RK3568 link sweep rather than guessing from the old channel 12.

## Sources

- `D:\03 开发套件资料\02 传感器\DL-XL01\DL-XLxx\DL-XLxx用户手册.pdf`
- `D:\03 开发套件资料\02 传感器\DL-XL01\DL-XLxx\透传  一发多收，多发一收的配置方法  - 副本.pdf`
- `firmware/rk2206-xl01/drivers/xl01/xl01_driver.c`
- `firmware/rk2206-xl01/config/app_config.h`
