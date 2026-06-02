# Field Center DB/API Live Proof

- generatedAt: `2026-04-25T20:09:16Z`
- accepted: `false`
- operationallyReady: `false`
- currentBoundary: `field-center-db-api-live-proof-needs-review`
- operationalBoundary: `field-center-db-api-live-proof-operational-needs-review`

## Summary

- `nodeA` postgres fresh=False clickhouse fresh=False api fresh=False web fresh=False
- `nodeB` postgres fresh=False clickhouse fresh=False api fresh=False web fresh=False
- `nodeC` postgres fresh=False clickhouse fresh=False api fresh=False web fresh=False

## Operational Summary

- requiredNodeKeys: `nodeA,nodeB`
- pendingNodeKeys: `nodeC`
- requiredNodeFailures: `nodeA,nodeB`
- pendingNodeOutstanding: `nodeC`

## Failure Keys

- `nodeAPostgresFresh`
- `nodeAClickHousePresent`
- `nodeAClickHouseFresh`
- `nodeAApiFresh`
- `nodeAWebFresh`
- `nodeBPostgresFresh`
- `nodeBClickHousePresent`
- `nodeBClickHouseFresh`
- `nodeBApiFresh`
- `nodeBWebFresh`
- `nodeCPostgresFresh`
- `nodeCClickHousePresent`
- `nodeCClickHouseFresh`
- `nodeCApiFresh`
- `nodeCWebFresh`