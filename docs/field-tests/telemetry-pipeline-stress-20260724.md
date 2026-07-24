# Telemetry Pipeline Stress Test - 2026-07-24

## Scope

This test covered the complete production path on the 4 vCPU / 7.4 GiB deployment:

```text
MQTT QoS 1 -> ingest -> Kafka -> telemetry-writer -> ClickHouse
```

The dedicated test UUID was isolated from field nodes A/B/C. Every message contained 11 metrics, so persisted row counts could be checked independently from packet sequence counts.

## Defects Found Before The Final Run

The original 10,000-message run acknowledged every MQTT publish but persisted only 9,218 unique sequences. The writer rejected 858 reordered messages as stale or duplicate.

Two Kafka reliability fixes improved recovery but did not remove the ordering defect:

- the ingest producer became idempotent with one in-flight Kafka request;
- the writer began explicitly committing resolved offsets after ClickHouse persistence.

A second isolated 10,000-message run still persisted only 8,669 unique sequences. MQTT `message` callbacks for the same topic were entering Kafka concurrently before producer ordering could apply.

The final fix adds a keyed serial queue around the complete ingest processing path. Messages from the same MQTT topic are processed in submission order, while different device topics remain parallel. A failed task does not block the next task, idle keys are removed, and service shutdown waits for queued work to finish.

## Final Results

| Run | Target rate | MQTT ACK | Failed | Unique sequences | ClickHouse rows | ACK p50 | ACK p95 | ACK p99 | ACK max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 10,000 messages | 500 msg/s | 10,000 | 0 | 10,000 | 110,000 | 0.51 ms | 1.21 ms | 2.59 ms | 24.83 ms |
| 50,000 messages | 1,000 msg/s | 50,000 | 0 | 50,000 | 550,000 | 0.64 ms | 1.42 ms | 3.80 ms | 16.49 ms |
| 100,000 messages | 1,000 msg/s | 100,000 | 0 | 100,000 | 1,100,000 | 0.55 ms | 1.29 ms | 3.43 ms | 30.70 ms |
| Total | - | 160,000 | 0 | 160,000 | 1,760,000 | - | - | - | - |

All sequences from 1 through 160,000 were present. All three runs had:

- zero `stale_seq` and `duplicate_seq` rejections;
- zero ingest processing or DLQ errors;
- zero container restarts and zero OOM kills;
- Kafka consumer lag returning to zero;
- exactly 11 persisted metric rows per message.

At 1,000 msg/s, the 100,000-message publisher briefly outran the ingest container's 0.5 CPU allocation. The first post-publish check contained 95,350 sequences; the keyed queue then drained without loss to the complete 100,000. This rate is a verified burst/overload case, not the recommended continuous operating point.

## Resource Peaks

| Run | Component | Peak CPU | Peak memory |
| --- | --- | ---: | ---: |
| 50,000 | ingest | 50.42% | 73.68 MiB |
| 50,000 | telemetry-writer | 7.00% | 35.40 MiB |
| 50,000 | Kafka | 95.79% | 768.70 MiB |
| 50,000 | ClickHouse | 157.41% | 1,629.18 MiB |
| 100,000 | ingest | 51.80% | 98.29 MiB |
| 100,000 | telemetry-writer | 6.15% | 35.05 MiB |
| 100,000 | Kafka | 89.54% | 924.80 MiB |
| 100,000 | ClickHouse | 156.29% | 1,684.48 MiB |

The production containers stayed within their configured memory limits. Disk usage after the run was 27 GiB of 178 GiB, with 144 GiB available.

## Field Traffic During Stress

The 50,000-message window persisted 143, 143 and 142 field packets for A, B and C. During the 100,000-message window and final drain, A/B/C persisted 280, 280 and 279 unique field sequences. The stress test therefore did not interrupt the live three-node path.

Normal field traffic is about 3 messages per second in total. The verified 500 msg/s continuous test is over 160 times that load and completed without an observed backlog. Keep 500 msg/s as the sustained operational ceiling for the current CPU allocation; use 1,000 msg/s only as a tested overload margin that may require drain time.

## Deployment And Cleanup

- Production ingest image: `sha256:3074903f9f14d0e77dd31cb356764838d76ffece5a7b9e6554798e8136073446`
- Pre-deployment source backup: `/opt/lsmv2-production/backups/ingest-topic-order-20260724-235128`
- ClickHouse test rows after cleanup: `0`
- PostgreSQL test device and shadow rows after cleanup: `0`
- Kafka uses a shared production topic, so test records are removed by the existing 72-hour retention policy rather than deleting the topic and risking field data.

The load generator refuses the formal A/B/C UUIDs and limits one run to at most 1,000,000 messages, 100,000 msg/s and 10,000 concurrent publishes.
