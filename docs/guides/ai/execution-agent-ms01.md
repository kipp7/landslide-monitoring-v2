# MS01 Execution Agent 指令（单机可恢复 + 移动端 MVP）

本文件用于指导“执行代理（Execution Agent）”按固定顺序完成 MS01，并确保契约/实现/脚本/门禁一致。

> 说明：本仓库采用 `docs/` 体系（architecture/features/integrations/guides），不使用 `openspec/` 目录。权威契约入口为 `docs/integrations/`。

## 0) 目标（MS01）

- 单机优先交付“能恢复”：提供离线备份/恢复脚本与 Runbook。
- 移动端 MVP：补齐 `patrol` / `sos` 的 API 契约 + 实现 + 冒烟脚本；App 侧提供 UI 原型与调用样例。

## 1) Anti-Goals（禁止做）

- 禁止在多个目录重复定义同一契约：API 只写在 `docs/integrations/api/` 与 `docs/integrations/api/openapi.yaml`。
- 禁止在 ADR 写实现细节（ADR 只解释 Why）。
- 禁止向 `main` 直接 push（必须 PR）。
- 禁止在客户端写死传感器/单位/阈值（字典驱动：`/sensors`）。

## 2) Task Batches（按顺序执行）

### Batch A：PRD 与契约（Docs First）

1. PRD：确认移动端范围与约束：`docs/features/prd/mobile-app.md`
2. API 契约：
   - Markdown：`docs/integrations/api/015-patrol.md`、`docs/integrations/api/016-sos.md`
   - OpenAPI：`docs/integrations/api/openapi.yaml`
3. Storage 契约（DDL）：
   - Postgres：`docs/integrations/storage/postgres/tables/21-patrol-reports.sql`、`22-sos-requests.sql`
   - ClickHouse：`docs/integrations/storage/clickhouse/01-telemetry.sql`（含 TTL 基线）、必要时补充增量脚本

验收：

- `python docs/tools/run-quality-gates.py` 通过（OpenAPI stamp + contract validation + secrets scan）。

### Batch B：后端实现（API）

1. 实现移动端 MVP 路由：
   - `services/api/src/routes/patrol.ts`
   - `services/api/src/routes/sos.ts`
2. 配置项：
   - `MOBILE_API_MOCK=true` 时返回 mock 数据（便于 App UI 联调）。

验收：

- `npm run lint`
- `npm run build`

### Batch C：单机可恢复（Infra）

1. 离线备份/恢复脚本：
   - `infra/compose/scripts/backup-offline.ps1`
   - `infra/compose/scripts/restore-offline.ps1`
2. Runbook/说明：
   - `docs/guides/runbooks/single-host-runbook.md`
   - `infra/compose/README.md`

验收：

- 可执行备份与恢复，并能在恢复后跑通健康检查：`infra/compose/scripts/health-check.ps1`

### Batch D：端到端冒烟（E2E）

1. `infra/compose/scripts/e2e-smoke-test.ps1` 增加移动端 MVP 断言：
   - `-TestMobileMvp` 覆盖 `/patrol/reports` 与 `/sos` 的 create/list/get

验收（推荐命令，自动留证到 `backups/evidence/`）：

- 关闭鉴权的最小闭环：`powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -TestMobileMvp`
- 若环境已开启 MQTT 鉴权：`powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -ConfigureEmqx -UseMqttAuth -CreateDevice -TestMobileMvp`

### Batch E：移动端 App（Flutter）

1. 技术栈冻结：`docs/features/flutter/app-architecture.md`
2. App 侧实现：
   - 高德瓦片：`flutter_map`（Key 通过 `--dart-define=AMAP_ANDROID_KEY=...` 注入）
   - MVP UI：公众版 SOS / 巡查版工作台 / 专家版总台（UI 原型可先行）
3. 文档：`apps/mobile/README.md`

验收：

- `flutter analyze`
- `flutter test`

## 3) Done Definition（完成标准）

- Docs：PRD/契约/DDL/Runbook 均存在且不重复、可点击、内容自洽。
- 后端：`patrol`/`sos` 接口可用，并在 `MOBILE_API_MOCK=true` 下可返回 mock。
- Infra：离线备份/恢复脚本可执行，E2E 脚本包含 `-TestMobileMvp` 并可跑通。
- 门禁：`python docs/tools/run-quality-gates.py`、`npm run lint`、`npm run build`、`flutter analyze`、`flutter test` 全部通过。

## 4) 目录规范（必须遵守）

- 需求：`docs/features/`
- 契约：`docs/integrations/`
- 实践指南：`docs/guides/`
- 可交付 App：`apps/`
- 后端服务：`services/`
