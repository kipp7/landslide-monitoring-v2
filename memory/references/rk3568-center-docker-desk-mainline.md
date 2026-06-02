---
title: rk3568-center-docker-desk-mainline
type: note
tags:
- reference
status: active
permalink: landslide-monitoring-v2-mainline/memory/references/rk3568-center-docker-desk-mainline
---

# Reference: rk3568-center-docker-desk-mainline

## Purpose

Freeze the current next-phase execution line as `RK3568 -> Docker center -> desk` so future sessions do not drift back into older field-only or desk-only interpretations.

## Current Boundary

- backend/server source of truth:
  - `infra/compose/docker-compose.yml`
  - `infra/compose/docker-compose.app.yml`
  - `scripts/release/deploy-docker-oneclick.ps1`
- RK3568 northbound source of truth:
  - `services/field-gateway/deploy/field-gateway.env.rk3568.example`
  - `scripts/dev/install-rk3568-field-gateway.ps1`
  - `scripts/dev/check-field-center-rk3568-operator-entry.ps1`
- desk/client source of truth:
  - `docs/unified/reports/desk-win-production-handoff-latest.json`
  - `artifacts/desk-win/latest/`
  - `artifacts/desk-win/latest.zip`

## Key Rule

- `artifacts/desk-win` is a delivery artifact and client compatibility target.
- It is not the source used to reconstruct the backend Docker stack.

## Integration Contract

- field chain:
  - `RK2206 A/B/C -> center XL01 -> RK3568 /dev/ttyS3`
- center chain:
  - `EMQX -> Kafka -> Postgres / ClickHouse -> API -> Web`
- desk contract:
  - `GET /api/v1/devices`
  - `GET /api/v1/data/state/{deviceId}`
  - `POST /api/v1/devices/{deviceId}/commands`

## Resume Order

1. Read `docs/unified/reports/field-rk3568-docker-center-desk-baseline-latest.json`
2. Read `docs/guides/deployment/single-host/rk3568-center-docker-desk-mainline.md`
3. Refresh center side if needed:
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\deploy-docker-oneclick.ps1 -AllowUnsafeSecrets`
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets`
4. Refresh RK3568/operator side if needed:
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-rk3568-operator-entry.ps1 -BoardPassword <password> -AllowUnsafeSecrets`
5. Validate desk delivery if needed:
   - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-desk-win-latest-delivery.ps1`

## Notes

- The current phase is deployment/integration, not protocol invention.
- Keep Docker as the formal center baseline.
- Keep installer/latest package as the mature desk delivery path once clean-machine validation is complete.
