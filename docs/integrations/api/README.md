# integrations/api/

该目录是**唯一的 API 契约来源**（Web/Flutter 都只引用这里）。

规范：
- Base URL：`/api/v1`
- ID：UUID 字符串
- 时间：RFC3339 UTC
- 统一响应：必须包含 `code`、`message`、`timestamp`、`traceId`（见 `api-design.md`）

索引：
- `docs/integrations/api/api-design.md`
- `docs/integrations/api/01-auth.md`
- `docs/integrations/api/02-users.md`
- `docs/integrations/api/03-devices.md`
- `docs/integrations/api/04-stations.md`
- `docs/integrations/api/05-data.md`
- `docs/integrations/api/06-alerts.md`
- `docs/integrations/api/07-system.md`
- `docs/integrations/api/08-gps-baselines.md`
- `docs/integrations/api/09-gps-deformations.md`
- `docs/integrations/api/010-realtime.md`
- `docs/integrations/api/011-camera.md`
- `docs/integrations/api/012-device-health-expert.md`
- `docs/integrations/api/013-ai-predictions.md`
- `docs/integrations/api/014-legacy-device-management.md`
- `docs/integrations/api/018-desk-ui.md`

机器可读契约（实现阶段用于生成 SDK/Mock/校验）：

- OpenAPI：`docs/integrations/api/openapi.yaml`
- 契约校验：`docs/tools/validate-contracts.py`
