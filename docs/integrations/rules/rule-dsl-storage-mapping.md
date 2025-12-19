# 规则 DSL 的落库与接口映射（v2，无遗漏）

本文件把三件事一次讲清楚，避免后续“文档有 DSL、数据库存不下、API 传不全”的断层：

1) **DSL v1 的结构**（见 `rule-dsl-spec.md`）  
2) **PostgreSQL 表如何存 DSL**（`alert_rules` / `alert_rule_versions` / `alert_events`）  
3) **API 如何传 DSL**（创建、发布新版本、读取、回放）  

---

## 1. 落库总原则

- 规则必须版本化：任何修改都新增版本（不可覆盖旧版本）
- DSL 必须“原样可回放”：数据库里要能拿到一份完整 DSL JSON
- 同时保留少量“冗余字段”用于检索与索引（例如 severity/enabled）
- 不强制把 DSL 拆成很多列（那会导致 DSL 演进时频繁改表）

---

## 2. PostgreSQL：表与字段映射

### 2.1 `alert_rules`（规则容器）

用途：存规则“归属与状态”，不直接存复杂条件。

- `rule_id`：规则 ID（UUID）
- `scope`：device/station/global
- `device_id` / `station_id`：适用范围（可空）
- `is_active`：是否启用（容器级开关）

### 2.2 `alert_rule_versions`（版本内容：完整 DSL + 冗余字段）

用途：存可执行版本内容，保证可回放。

推荐字段：

- `rule_id` + `rule_version`：复合主键（版本号从 1 递增）
- `dsl_version`：DSL 版本（v1=1）
- `dsl_json`：**完整 DSL JSON**（原样保存）
- `severity`：冗余字段（便于列表筛选/统计/索引）
- `enabled`：版本级开关（便于灰度/回滚）
- （可选冗余）`conditions/window/hysteresis`：从 DSL 中抽取，便于 SQL 侧快速过滤；如果保留，必须声明为冗余字段并由应用层保持一致

为什么要 `dsl_json`：

- DSL 一定会演进，完整 JSON 能保证旧版本仍可回放与解释
- 前端可直接编辑/展示完整 DSL（不丢字段）

### 2.3 `alert_events`（事件化告警输出）

用途：告警事实以事件流保存，支持审计与复盘。

关键字段：

- `alert_id`：告警生命周期 ID（trigger/update/resolve/ack 共享）
- `event_type`：四类事件
- `rule_id` / `rule_version`：**必须写入**，否则无法解释“当时按哪个版本触发”
- `evidence`：证据（触发点值、窗口统计、算法输出等）

---

## 3. API：请求与响应的 DSL 约定

### 3.1 创建规则

- 创建规则容器（`alert_rules`）
- 同时创建 `rule_version=1`（`alert_rule_versions`），必须携带完整 DSL JSON

建议 API 请求体（要点）：

- `ruleName`
- `scope`
- `dsl`：完整 DSL（见 `rule-dsl-spec.md` 的 RuleVersion 结构）

响应建议返回：

- `ruleId`
- `currentVersion`

### 3.2 发布新版本

- 只能新增版本：`POST /alert-rules/:ruleId/versions`
- 服务端必须：
  - 校验 DSL（见 DSL 的校验清单）
  - 生成新 `rule_version = max + 1`
  - 保存完整 `dsl_json`

### 3.3 读取规则/版本

建议支持：

- `GET /alert-rules`：规则容器列表（按 scope/device/station 筛选）
- `GET /alert-rules/:ruleId`：规则详情 + 当前版本摘要
- `GET /alert-rules/:ruleId/versions`：版本列表
- `GET /alert-rules/:ruleId/versions/:version`：返回完整 `dsl`

---

## 4. 回放/回测（与落库的关系）

回放需要：

- 时间范围（startTime/endTime）
- 规则版本（ruleId + ruleVersion）
- 数据源（ClickHouse 的 telemetry）

回放输出：

- 写入 `alert_events`（可选：标记为 replay 产生的事件）
- 或仅返回结果（dry-run）

建议在实现阶段支持 dry-run 参数：

- `dryRun=true`：不落库，仅返回事件列表与统计

---

## 5. 一致性约束（避免遗漏）

必须保证：

- `alert_rule_versions.dsl_json` 内的 `dslVersion` 与列 `dsl_version` 一致
- `dsl_json.severity` 与列 `severity` 一致（如果两者都存在）
- 规则引擎输出事件必须写 `rule_version`

