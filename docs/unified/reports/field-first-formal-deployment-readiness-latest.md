# Field First Formal Deployment Readiness

- generatedAt: `2026-04-14T06:15:22Z`
- accepted: `true`
- currentBoundary: `field-first-formal-deployment-ready`
- decision: `proceed-to-server-deployment`

## Current Truth

- center handoff accepted: `True.ToLower()`
- db/api operationally ready: `True.ToLower()`
- desk latest delivery ready: `True.ToLower()`
- rk3568 operator entry accepted: `True.ToLower()`
- platform acceptance failedChecks: `0`
- rk3568 node statuses: `A=online,B=online,C=configured`
- deferred nodes: `C`

## Standard Commands

- env checklist: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\release\render-prod-env-checklist.ps1`
- validate: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets`
- apply: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets`
- rk3568 recovery: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-rk3568-center-operational-recovery.ps1 -BoardPassword <password> -AllowUnsafeSecrets`

## Mandatory Artifacts

- `docs/guides/runbooks/single-host-runbook.md`
- `docs/unified/reports/field-center-runtime-freeze-latest.json`
- `docs/unified/reports/field-center-compose-acceptance-latest.json`
- `docs/unified/reports/field-center-deployment-software-adaptation-readiness-latest.json`
- `docs/unified/reports/prod-env-checklist-latest.json`
- `docs/unified/reports/docker-deploy-latest.json`