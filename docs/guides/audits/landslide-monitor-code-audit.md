# 现状审查：landslide-monitor（对齐 v2 标准）

## 0. 目标与范围

目标：按 `docs/` 的 v2 技术路线与规范，对现有代码做“高标准审查”，输出可执行的整改清单（而不是泛泛而谈）。

审查依据（权威入口）：

- 架构总览：`docs/architecture/overview.md`
- 关键 ADR：
  - `docs/architecture/adr/ADR-0001-mqtt-kafka-clickhouse-postgres.md`
  - `docs/architecture/adr/ADR-0002-device-identity-device-id-secret.md`
  - `docs/architecture/adr/ADR-0003-sparse-telemetry-model.md`
- 后端底线：`docs/guides/standards/backend-rules.md`
- 命名规范：`docs/guides/standards/naming-conventions.md`
- 契约入口：
  - API：`docs/integrations/api/README.md`（含 `openapi.yaml`）
  - MQTT：`docs/integrations/mqtt/README.md`
  - Kafka：`docs/integrations/kafka/README.md`
  - Storage：`docs/integrations/storage/README.md`
  - Rules：`docs/integrations/rules/README.md`

审查范围（本次已覆盖）：

- `landslide-monitor/backend/`（Node/Express IoT 服务）
- `landslide-monitor/frontend/`（Next.js 前端 + Next API routes）
- `landslide-monitor/database/`（PostgreSQL 初始化脚本）
- `txsmartropenharmony/iot配置.txt` 与 `txsmartropenharmony/L610.c`（设备侧联网/上报方式的代表性样例）

## 1. 总结（结论先行）

### 1.1 结论

现有项目属于“能跑但不可扩展/不可治理”的状态，主要表现为：

- 安全与边界缺失：存在密钥泄露风险、缺少鉴权/权限、存在可被滥用的管理/调试接口。
- 契约不收敛：前端/后端/数据库存在多份事实来源（直接依赖 Supabase 表结构/视图），导致改一处会连锁崩。
- 设备/遥测模型写死：`device_1/device_2/...`、固定字段与固定图例/站点坐标硬编码，违背 v2 的“稀疏指标 + 字典表”方向。
- 架构不具备“按最坏情况设计”的弹性：没有 Kafka 缓冲、幂等与回放机制弱，写链路与规则/AI/展示耦合，后续数据量上来只能重写。

### 1.2 最高优先级（必须先做）

1) **安全整改（立即）**：密钥与凭据治理、删除/隔离危险接口、收敛 DB 访问边界  
2) **契约收敛（v2）**：`integrations/` 作为唯一契约来源，前端只依赖 API，不直接依赖 DB/第三方 DB SDK  
3) **设备身份与上报链路切换**：从“华为云 IoT + Supabase”切换到“自建 MQTT + Kafka + ClickHouse/Postgres”

对应 incidents：

- `docs/incidents/INC-0002-secrets-and-credentials-leak.md`
- `docs/incidents/INC-0003-frontend-direct-db-access.md`

## 2. 关键问题清单（按领域 + 严重度）

严重度定义：

- P0：安全/数据破坏/不可恢复风险（必须立刻处理）
- P1：架构方向性错误（不改会导致 v2 无法落地）
- P2：质量/可维护性问题（会显著拖慢迭代）

### 2.1 安全（P0）

**A1. 本地环境文件与源码中出现凭据/密钥**

- 证据：历史上存在 `landslide-monitor/frontend/.env.local`，并且多处代码/脚本有“明文凭据回退常量”。（已在本次审查中做了脱敏处理，但这说明治理机制缺失）
- 风险：泄露后无法追责、可被滥用访问数据库/外部 AI 服务；即使是“anon key”，也会在错误的 RLS/函数权限配置下造成数据读写越权。
- v2 要求：所有敏感配置必须来自环境变量/Secret 文件，不入仓库；服务端只存 hash（设备 secret）或使用专门密钥服务。
- 对应动作：
  - 写复盘：`docs/incidents/INC-0002-secrets-and-credentials-leak.md`
  - 新增 PRD：`docs/features/prd/security-and-access-control.md`

**A2. 前端存在数据库管理/检查类接口（高风险能力暴露）**

- 证据：`landslide-monitor/frontend/app/api/db-admin/route.ts` 允许通过 RPC 执行 SQL（虽限制 SELECT，但仍可被枚举/扫库/放大查询成本）。
- 风险：在无鉴权/无审计/无限流下，容易造成敏感数据泄露与 DoS（大查询拖垮单机）。
- v2 要求：生产环境禁止保留“DB 管理/inspect”类 HTTP 接口；这类能力只能在内网/运维工具中完成，并强制 RBAC + 审计。
- 对应动作：
  - 写入 incident：`docs/incidents/INC-0003-frontend-direct-db-access.md`
  - 在 v2 `integrations/api` 中明确禁止与替代方案（管理员走受控 API + 审计表）

**A3. 后端 IoT 服务缺少鉴权/ACL 与最小权限**

- 证据：`landslide-monitor/backend/iot-service/iot-server.js` 暴露大量设备/命令/调试接口，未发现标准鉴权（JWT/权限）。
- 风险：任意人可调用设备控制/数据接口；CORS 放开会扩大被利用面。
- v2 要求：设备走 MQTT 鉴权 + topic ACL；管理端走 JWT + RBAC；接口必须有 `traceId` 与审计日志。

### 2.2 契约与边界（P1）

**B1. 前端/Next API routes 直接使用 Supabase SDK 访问表/视图（强耦合 DB）**

- 证据：`landslide-monitor/frontend/app/api/monitoring-stations/route.ts` 等多个路由直接 `.from('devices_new')`、`.from('monitoring_stations_view')`。
- 风险：DB schema 变化会直接破坏前端；权限与审计无法统一；多端协作无法“只改契约不改实现”。
- v2 要求：前端只依赖 `integrations/api`（OpenAPI），不得直接依赖 DB 表/视图；所有业务规则与字典由后端下发。

**B2. API Base URL 与环境判定硬编码**

- 证据：`landslide-monitor/frontend/lib/config.ts` 里按 hostname 拼接 `http://localhost:5100` / 指定域名。
- 风险：部署形态变化时容易出错；无法通过统一配置治理；测试/生产切换不可靠。
- v2 要求：统一使用环境变量配置（或反向代理固定路径），并在 `guides/deployment` 固化。

### 2.3 数据模型与“不写死”（P1）

**C1. 设备与站点写死在前端配置**

- 证据：`landslide-monitor/frontend/app/config/monitoring-stations.ts` 固定 `device_1/2/3`、固定坐标、固定图例与阈值。
- 风险：新增设备/传感器需要改代码；与 v2 “字典表 + 稀疏指标 + 可扩展”方向冲突。
- v2 要求：设备/站点/传感器字典来自 PostgreSQL 元数据；前端通过 API 获取，不写死。

**C2. 设备侧仍是华为云 IoT MQTT 形态，并在固件中写死连接参数**

- 证据：`txsmartropenharmony/iot配置.txt`（示例代码）中存在 broker/username/device_id/密码等硬编码。
- 风险：凭据泄露与无法轮换；与“自建 MQTT + device_id + secret（可吊销/可轮换）”不一致。
- v2 要求：采用 `device_id + device_secret`（见 ADR-0002），并通过烧录身份包写入；后续支持轮换。

### 2.4 可扩展性与最坏情况（P1）

**D1. 写链路缺少 Kafka 缓冲与回放能力**

- 现状：IoT 服务直接处理 + 直接写 DB（或第三方），缺少“可回放”与“消费隔离”。
- 风险：高频上报/峰值/断电重连会拖垮服务；规则/AI 会阻塞写链路。
- v2 要求：MQTT → ingest → Kafka → writer → ClickHouse；规则引擎异步消费 Kafka，输出事件化告警。

**D2. 阈值/健康度逻辑硬编码**

- 证据：`landslide-monitor/backend/iot-service/iot-server.js` 中存在大量阈值判断（温湿度/振动等）。
- 风险：每改一次规则都要发版；无法版本化、回测与解释。
- v2 要求：规则 DSL + 版本化 + 事件化告警（见 `integrations/rules` 与 `integrations/api/06-alerts.md`）。

## 3. 建议整改路线（按阶段不遗漏）

### Phase 0：立即止血（P0）

- 立刻完成密钥治理与复盘（incidents）：
  - `INC-0002`：密钥泄露与凭据治理
  - `INC-0003`：前端直连 DB 与危险接口暴露
- 删除/隔离所有“inspect/db-admin/test-db”类接口（实现阶段），并在 v2 API 契约中明确不提供此类能力。

### Phase 1：契约收敛（P1）

- 前端只依赖 `docs/integrations/api/openapi.yaml`；禁止使用 Supabase SDK 直接访问业务表。
- 把硬编码的监测站/图例/阈值迁移为“元数据 + 字典表”，由后端 API 下发。

### Phase 2：链路切换（P1）

- 设备上报：切换到自建 MQTT（EMQX），身份采用 `device_id + device_secret`。
- 写链路：引入 Kafka（单机 KRaft）与 writer，遥测进入 ClickHouse，元数据/规则/告警进入 PostgreSQL。

### Phase 3：规则/AI 模块化（P1/P2）

- 规则引擎：按 DSL 版本化 + evidence 输出，支持回放重算。
- AI/预测：仅作为可降级插件，输出可解释结果，不阻塞写链路。

## 4. 缺口映射（需要补的 PRD）

现有 v2 PRD 已覆盖：设备注册、上报链路、告警规则、命令、仪表盘。

审查发现还需要补齐的 PRD：

- 安全与访问控制：`docs/features/prd/security-and-access-control.md`
- 站点管理（站点/设备绑定/状态）：`docs/features/prd/station-management.md`
- 系统运维与可观测性：`docs/features/prd/system-operations-and-observability.md`

