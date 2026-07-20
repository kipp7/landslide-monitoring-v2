# Edge AI Deployment And Rollback

## Stability boundary

- `field-gateway` only exposes its last validated telemetry frame in the
  existing health snapshot. Serial parsing, spooling and MQTT publishing do
  not call AI code.
- `field-link-monitor` forwards that snapshot read-only.
- Hermes inference is advisory and runs in its existing sidecar service with
  `CPUQuota=50%`, `MemoryMax=384M`, `TasksMax=64` and lower process priority.
- The server worker is an opt-in Compose profile with `0.5 CPU / 384 MB`.
- Edge AI Compose deployments set `SERVER_PREDICTIONS_ENABLED=false`, so the
  worker trains models and receives edge results without writing one server
  prediction for every telemetry message. The legacy default remains `true`
  for deployments that already rely on that server prediction stream.
- The rule engine remains the only authority for physical alarms.

## Server rollout

1. Run all unit tests and validate Compose with and without `--profile edge-ai`.
2. Build `ai-prediction-worker` without starting it.
3. Confirm the 24-hour training query completes with `max_threads=1`,
   `max_execution_time=30` and `max_memory_usage=268435456`.
4. Start only `ai-prediction-worker` with the `edge-ai` profile.
5. Verify model creation, retained MQTT publish and idempotent writes to the
   existing `ai_predictions` table.
6. Confirm `ingest`, `telemetry-writer`, `rule-engine-worker` and API restart
   counts remain unchanged.

Rollback is limited to stopping `ai-prediction-worker`. No database migration
or data rollback is required.

For a production server that keeps an immutable private Compose snapshot, load
the already verified image and use only
`infra/compose/docker-compose.edge-ai.runtime.yml`. This runtime file joins the
existing `${EDGE_AI_DOCKER_NETWORK}` and does not redefine API, ingest,
telemetry writer, rule engine or command services:

```bash
docker compose \
  -f infra/compose/docker-compose.edge-ai.runtime.yml \
  --env-file /path/to/production.env \
  --profile edge-ai up -d ai-prediction-worker
```

Set `EDGE_AI_DOCKER_NETWORK` when the production project's default network is
not `lsmv2-production_default`. Stop the same service with `docker compose stop`
to roll back.

## RK3568 rollout

1. Preserve the current Hermes environment file and service unit.
2. Build the shared model package and Hermes before restarting anything.
3. Install with `--no-enable`, inspect the generated unit, then restart only
   `lsmv2-hermes-edge-supervisor`.
4. Verify `/healthz`, `/v1/supervision` and `/v1/edge-risk`.
5. Confirm `field-gateway` and `field-link-monitor` restart counts did not
   change and live telemetry continues upstream.

Rollback restores the previous Hermes build and environment file, then
restarts only Hermes. The gateway and rule chain remain untouched.

## Failure behavior

- Invalid or checksum-mismatched models are rejected; the last valid model is
  retained.
- MQTT publish waits at most three seconds before queuing locally.
- The offline queue is persisted atomically and capped at 200 predictions.
- Model, MQTT or state-file errors are reported in status but cannot fail the
  core Hermes supervision refresh.
- The App loads AI independently and keeps its last cached snapshot when the
  endpoint is unavailable.
