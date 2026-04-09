# Field Center Production Handoff

> Goal: condense the current center deployment line into a one-page handoff that is reproducible and recoverable.

## Current Boundary

- generatedAt: `2026-04-09T15:53:54Z`
- accepted: `true`
- currentBoundary: `center-production-handoff-ready`
- primaryRunbook: `docs/guides/runbooks/single-host-runbook.md`

## Frozen Compose Boundary

- `emqx`
- `kafka`
- `postgres`
- `clickhouse`
- `api`
- `web`
- `ingest-service`
- `telemetry-writer`

## Standard Commands

- refresh handoff packet: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-field-center-production-handoff.ps1 -AllowUnsafeSecrets`
- refresh freeze baseline: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-runtime-freeze.ps1 -AllowUnsafeSecrets`
- routine acceptance: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets`
- full redeploy + acceptance: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets`

## Recovery Order

- `emqx -> kafka -> postgres -> clickhouse`
- `ingest-service -> telemetry-writer`
- `api -> web`
- `check-field-center-compose-acceptance.ps1`
- `check-field-rk3568-center-operational-recovery.ps1`

## Mandatory Artifacts

- `docs/guides/runbooks/single-host-runbook.md`
- `docs/unified/reports/field-center-runtime-freeze-latest.json`
- `docs/unified/reports/field-center-compose-acceptance-latest.json`
- `docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json`
- `docs/unified/reports/prod-env-checklist-latest.json`
- `docs/unified/reports/docker-deploy-latest.json`

## Env Summary

- configured: ``18``
- missing: ``0``
- placeholder: ``0``
- emptyOptional: ``2``

## Current Conclusion

- Current handoff boundary is the combined green line of `center-runtime-freeze-ready`, `full-path-ready`, and `center-deployment-software-adaptation-ready`.
- No protocol scope needs to be reopened here; use the existing runbook, freeze, and acceptance entrypoints.
- `node C` remains a reserved config and capacity slot and does not block center deployment handoff.
