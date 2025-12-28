# 阶段 4 验收清单：Web/App 去硬编码（v2）

目标：让 Web/Flutter 能“只依赖 API/字典表渲染”，新增传感器/站点/规则无需改前端代码即可正确展示与处理。

> 本清单用于把阶段 4 从“口号”变成可执行验收；实现可分多 PR 推进，但必须保持 OpenAPI 与实现一致，且每次变更过本地门禁。

## A. 契约与字典（强制）

- [x] `GET /sensors` 可用，且包含 `sensorKey/displayName/unit/dataType` 等渲染所需字段（App/Web 不做二次映射）。
- [x] App/Web 只展示“契约 key”：telemetry 的 `metrics` key 与 `/sensors` 对齐（命名规则一致），并且可选的设备传感器声明 `GET/PUT /devices/{deviceId}/sensors` 返回同一套 `sensorKey`。
- [x] OpenAPI（`docs/integrations/api/openapi.yaml`）覆盖 App/Web 依赖端点，并通过 `python docs/tools/run-quality-gates.py`。

## B. App/Web 依赖端点（最小可用）

- [x] `GET /dashboard` 可用：返回今日数据量、在线/离线设备数、待处理告警数、按 severity 聚合等。
- [x] `GET /system/status` 可用：返回单机基础设施连通性（至少 Postgres/ClickHouse），便于现场排查。
- [x] `GET /stations`、`GET /devices`、`GET /data/state/{deviceId}`、`GET /data/series/{deviceId}` 可用且稳定。
- [x] `GET /alerts`、`GET /alerts/{alertId}/events`、`POST /alerts/{alertId}/ack|resolve` 可用且可审计（事件流可追溯）。

## C. 去硬编码约束（强制）

- [x] 前端/Flutter 不写死：传感器显示名、单位（来自 `/sensors`）；站点/设备等通过 API 列表渲染；客户端不拼接业务文案。
- [x] 新增传感器：仅通过后端 `sensors` 字典扩展即可展示（无需改 App/Web）。
- [x] 告警标题/内容由后端模板渲染或 DTO 返回，客户端不拼接业务文案（只做展示）。

## D. 单机联调与证据（强制）

- [x] 单机 Compose 下可复现联调流程，并能生成证据包（`backups/evidence/...`）。
- [x] 关键链路（告警触发→通知落库→查询/处理）有脚本级断言：`infra/compose/scripts/e2e-smoke-test.ps1 -Stage2Regression`。
- [x] Stage4 关键端点/字典/声明也有脚本级断言：`infra/compose/scripts/e2e-smoke-test.ps1 -Stage4Regression`。

## E. 退出条件（阶段完成判定）

- [x] 本清单 A/B/C/D 均满足（允许少量“可选项”保留为下一阶段，但必须明确标记与说明理由）。
- [x] `docs/guides/roadmap/project-status.md` 更新：阶段 4 完成，并明确进入阶段 5 的下一步工作包。
