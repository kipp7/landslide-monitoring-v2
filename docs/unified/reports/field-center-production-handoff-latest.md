# Field Center Production Handoff

> 鐩爣锛氭妸褰撳墠涓績閮ㄧ讲绾挎敹鏁涙垚鍙氦鎺ャ€佸彲澶嶈窇銆佸彲鎭㈠鐨勪竴椤靛紡璇存槑銆?,
    ",
    

- generatedAt: `2026-04-09T12:58:21Z`
- accepted: `true`
- currentBoundary: `center-production-handoff-ready`
- primaryRunbook: `docs/guides/runbooks/single-host-runbook.md`

## 鍥哄畾 compose 杈圭晫

- `emqx`
- `kafka`
- `postgres`
- `clickhouse`
- `api`
- `web`
- `ingest-service`
- `telemetry-writer`

## 鏍囧噯鍛戒护

- refresh handoff packet: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\prepare-field-center-production-handoff.ps1 -AllowUnsafeSecrets`
- refresh freeze baseline: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-runtime-freeze.ps1 -AllowUnsafeSecrets`
- routine acceptance: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode validate -AllowUnsafeSecrets`
- full redeploy + acceptance: `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\check-field-center-compose-acceptance.ps1 -DeployMode apply -AllowUnsafeSecrets`

## 鎭㈠椤哄簭

- `emqx -> kafka -> postgres -> clickhouse`
- `ingest-service -> telemetry-writer`
- `api -> web`
- `check-field-center-compose-acceptance.ps1`
- `check-field-rk3568-center-operational-recovery.ps1`

## 蹇呭甫鐗╂枡

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

