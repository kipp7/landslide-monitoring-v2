# RK3568 -> Docker Center -> Desk Mainline Baseline

> Goal: freeze the current formal deployment line for RK3568 -> Docker center -> desk so the next phase can move from proof collection into repeatable deployment and integration.

## Current Boundary

- generatedAt: `2026-04-14T06:09:42Z`
- accepted: `true`
- currentBoundary: `rk3568-docker-center-desk-mainline-ready`

## Frozen Topology

- field: `RK2206 A/B/C -> center XL01`
- gateway: `RK3568 /dev/ttyS3`
- center: `EMQX -> Kafka -> Postgres/ClickHouse -> API -> Web`
- desk: `desk-win latest package / installer consumes the same API contract`

## RK3568 Frozen Contract

- env example: `services/field-gateway/deploy/field-gateway.env.rk3568.example`
- serial device: `/dev/ttyS3`
- serial baud rate: `115200`
- field link mode: `cobs-crc-v1`
- MQTT topics: `telemetry/`, `cmd/`, `cmd_ack/`

## Center Compose Boundary

- `emqx`
- `kafka`
- `postgres`
- `clickhouse`
- `api`
- `web`
- `ingest-service`
- `telemetry-writer`

## Desk/API Contract

- web contract file: `apps/web/lib/api/devices.ts`
- api route file: `services/api/src/routes/data.ts`
- canonical metrics: `14`

- `GET /api/v1/devices`
- `GET /api/v1/data/state/{deviceId}`
- `POST /api/v1/devices/{deviceId}/commands`

## Deployment Order

- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/release/deploy-docker-oneclick.ps1 -AllowUnsafeSecrets`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/install-rk3568-field-gateway.ps1 -Password <password> -OverwriteEnv`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-center-rk3568-operator-entry.ps1 -BoardPassword <password> -AllowUnsafeSecrets`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-desk-win-latest-delivery.ps1`

## Delivery Policy

- center: Deploy the server side from source with Docker Compose.
- rk3568: Bind field-gateway northbound MQTT target to the Docker center and keep /dev/ttyS3 as the frozen serial entry.
- desk: Use artifacts/desk-win latest package or installer only as the client delivery path.

## Non-Goals

- Do not rebuild backend containers from artifacts/desk-win.
- Do not let node C hardware variance redefine the current center deployment baseline.
- Do not make the desk app bypass API/Web to read the databases directly.

## Current Conclusion

- The backend/server side is already formalized around compose + source, not around `artifacts/desk-win`.
- The desk path is treated as a client delivery target that must keep consuming the same API contract.
- This baseline is the current mainline for the next phase: integrate RK3568 into the Docker center, then validate desk consumption against the frozen read path.