# PRD：安全与访问控制（v2 基线）

## 1. 背景

现有项目存在边界缺失与凭据治理不足的问题：前端直连数据库、调试/管理接口暴露、缺少统一鉴权/权限/审计。v2 目标是“单机也要正确”，把安全与边界作为基础设施一次性建好。

## 2. 目标（Goals）

- 用户侧：提供 JWT 登录、RBAC 权限控制、审计日志（谁在什么时候做了什么）。
- 设备侧：采用 `device_id + device_secret` 作为身份根（服务端只存 hash），并支持吊销（revoked）。
- 系统侧：禁止真实密钥进入仓库；所有敏感配置来自环境变量/secret 文件。

## 3. 非目标（Non-goals）

- v1 不强制上 mTLS/证书体系（可作为升级路径）。
- v1 不强制做复杂的多租户隔离（单机学生项目先做清晰 RBAC）。

## 4. 功能需求（Functional Requirements）

### FR1：用户认证（JWT）

- 登录/刷新/退出/获取当前用户接口，见 `docs/integrations/api/01-auth.md` 与 `openapi.yaml`。
- Token 必须包含用户 ID、角色与权限声明；服务端必须可撤销（实现阶段可用 token 黑名单或短期 token + refresh）。

### FR2：权限（RBAC）

- 权限枚举与角色关系存储于 PostgreSQL（见 `docs/integrations/storage/postgres/tables/02-permissions.sql`）。
- 所有 API 端点必须声明权限（写在 `integrations/api` 文档中）。

### FR3：设备鉴权与 ACL

- MQTT 鉴权/ACL 规则见：`docs/integrations/mqtt/device-identity-and-auth.md`
- 设备只能发布自己的 `telemetry/{device_id}`，只能订阅自己的 `cmd/{device_id}`。

### FR4：密钥与配置治理

- 任何真实密钥/凭据不得出现在仓库（包括 `.env.local`、源码回退常量、文档示例）。
- 在实现阶段加入 hooks/CI 校验（参考 `docs/guides/ai/hooks-workflow.md`）。

### FR5：审计日志

- 对以下行为记录审计：
  - 用户登录/退出
  - 规则变更、设备状态变更、命令下发、配置变更
- 审计表见：`docs/integrations/storage/postgres/tables/10-system.sql`

## 5. 验收标准（Acceptance Criteria）

- AC1：任意需要权限的接口未携带 token 时返回 401；无权限返回 403。
- AC2：设备被吊销后 MQTT 连接/发布被拒绝（鉴权/ACL 生效）。
- AC3：仓库中不存在真实密钥（通过扫描脚本/CI 校验）。
- AC4：关键操作可在审计日志中追溯到操作者与时间。

## 6. 依赖（Dependencies）

- ADR：`docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
- MQTT 契约：`docs/integrations/mqtt/README.md`
- API 契约：`docs/integrations/api/README.md`

