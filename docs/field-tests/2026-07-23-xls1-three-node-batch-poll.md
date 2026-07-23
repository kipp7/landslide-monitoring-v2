# XLS1 Three-Node Batch Poll Canary

## Scope

- Date: 2026-07-23
- Hardware: RK3568 center receiver plus RK2206 field nodes A, B, and C
- Radio topology: one XLS1 channel and one aggregated `/dev/ttyS3` stream
- Stable baseline: one node polled every 1000 ms, about one sample per node every 3 seconds
- Experimental profile: poll A, B, and C within each 1000 ms window
- Field-node firmware was not changed for this canary.

## Result

The current approximately 590-byte JSON telemetry frame is not suitable for concurrent three-node uplink on the shared transparent XLS1 stream.

| Signal | Observed |
| --- | ---: |
| Batches | 10 |
| Expected telemetry replies | 30 |
| Matched valid replies | 2 |
| Match rate | 6.67% |
| Decode or JSON errors | 11 |
| Dominant error | `cobs code exceeded input length` |
| Largest corrupt framed segment | 1706 bytes |

Node A and C produced no command-matched valid telemetry in the canary. Node B produced two matched frames with command-to-telemetry latency of 2383.5 ms and 3810.8 ms.

Corrupt segments were materially larger than one normal telemetry frame (for example 892, 1156, 1204, and 1706 bytes). Their byte prefixes contain overlapping field-link and JSON content. This is direct evidence that radio packet queueing/retry does not preserve application-frame atomicity across multiple transparent senders.

## Recovery

The harness stopped `lsmv2-field-gateway.service`, owned `/dev/ttyS3` only for the bounded canary, and restored the service in a `finally` path. Post-test verification passed:

- field gateway service active
- serial open
- MQTT connected
- spool pending 0
- A, B, and C online
- cloud publishing fresh
- post-restart parser rejection and interleaving counters 0

## Decision

- Do not deploy three-node same-window polling with the current long JSON telemetry frame.
- Keep the released one-node-per-second round-robin profile as the production rollback baseline.
- Do not run the planned 60-second batch test; the 10-second canary already fails by a wide margin.
- The next one-second-per-node experiment must first make each southbound telemetry frame fit in one XLS1 radio packet, or use source-address-aware packet reassembly at the center receiver.

## Reproduction

Run `scripts/field/xls1_three_node_batch_poll.py` as root on RK3568. The script restores the configured gateway service even when the experiment fails.
