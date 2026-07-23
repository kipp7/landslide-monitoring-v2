# Edge Supervisor

`hermes-edge-supervisor` is a local RK3568 supervision sidecar. It consumes read-only link-monitor evidence, combines it with local resource checks and an optional lightweight diagnosis model, and exposes operator-facing supervision output.

## Responsibilities

- Poll local field-link summary and automation endpoints.
- Subscribe read-only to the existing validated `telemetry/+` MQTT stream for risk inference.
- Produce supervision summaries and event logs.
- Expose read-only HTTP endpoints for local display or operator tooling.
- Keep diagnostic actions limited to sidecar refresh and local health collection.

## Service Boundary

This service does not:

- Control southbound serial links.
- Publish MQTT telemetry.
- Replace `field-gateway`.
- Modify gateway spool/cache files.
- Perform autonomous network switching.
- Execute physical alarm actions.

## Environment

Use `.env.example` as a local template. Key variables:

- `AUTOMATION_URL` - field-link-monitor automation endpoint.
- `SUMMARY_URL` - field-link-monitor summary endpoint.
- `DIAGNOSIS_MODEL_PATH` - optional local diagnosis model JSON.
- `SUPERVISION_FILE_PATH` - generated supervision JSON output.
- `EVENT_LOG_FILE_PATH` - generated event log path.
- `HTTP_HOST` / `HTTP_PORT` - local HTTP listener.
- `MQTT_TELEMETRY_TOPIC` - existing field telemetry subscription (default `telemetry/+`).
- `MQTT_TELEMETRY_MAX_PAYLOAD_BYTES` - input size limit before JSON validation.
- `RISK_MODEL_MAX_AGE_MS` - maximum accepted model age; expired models remain visible for
  diagnostics but do not evaluate or publish risk.

## Local Development

From the repository root:

```bash
npm install
npm run build --workspace @lsmv2/hermes-edge-supervisor
node edge/rk3568-gateway/hermes-edge-supervisor/dist/index.js
```

Endpoints:

- `GET /healthz`
- `GET /v1/supervision`
- `GET /v1/edge-risk`
- `POST /v1/actions`

## RK3568 Deployment

```bash
sudo bash edge/rk3568-gateway/hermes-edge-supervisor/deploy/install-rk3568-hermes-edge-supervisor.sh \
  --repo-root /opt/landslide-monitoring-v2 \
  --run-user <service-user>
```

Common checks:

```bash
sudo systemctl status lsmv2-hermes-edge-supervisor --no-pager
sudo journalctl -u lsmv2-hermes-edge-supervisor -n 100 --no-pager
bash edge/rk3568-gateway/hermes-edge-supervisor/deploy/check-rk3568-hermes-edge-supervisor.sh
```

## Local Data

The committed model JSON and examples are part of the public package. Keep device-specific reports, private endpoints, local logs, and generated stress-test reports outside Git.
