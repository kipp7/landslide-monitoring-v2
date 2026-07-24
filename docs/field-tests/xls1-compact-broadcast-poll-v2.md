# XLS1 Compact Broadcast Poll v2

## Goal

Collect A, B and C once per second without asking the three nodes to transmit on the same radio channel at the same time.

## Downlink

The gateway sends one ASCII command per second:

```text
P1xxxxxxxx
```

- `P1` identifies compact broadcast poll v1.
- `xxxxxxxx` is an uppercase hexadecimal nonce.
- Payload size is 10 bytes; the field-link wire frame is 28 bytes including header, CRC32, COBS and delimiter.
- The FNV-1a tag of the complete 10-byte command is copied into each compact telemetry response for correlation.

## Uplink Slots

| Node | Delay after command reception |
| --- | ---: |
| A | 0 ms |
| B | 340 ms |
| C | 680 ms |

Each response remains a 46-byte compact telemetry payload and a 64-byte field-link wire frame. The 340 ms slot width follows the existing XL01 driver's 300 ms asynchronous-send guard and leaves a small scheduling margin.

JSON commands remain available for device control. Only the high-frequency telemetry polling path uses the compact broadcast command.
