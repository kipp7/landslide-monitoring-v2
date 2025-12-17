# AI/PR 文档一致性检查清单（文档阶段）

本清单用于减少遗漏：当你修改任意一个领域（功能/契约/决策/运维），应同步更新对应入口。

## 1. 改了“功能”（What）

必须更新：

- `docs/features/00-index.md`（索引）
- 对应 PRD/Spec（`docs/features/`）

可能需要更新：

- `docs/architecture/adr/`（如果引入新的关键决策）
- `docs/guides/`（实现/运维指南）

## 2. 改了“对接契约”（Interface）

必须更新（按影响面）：

- API：`docs/integrations/api/`
- MQTT：`docs/integrations/mqtt/`
- Kafka：`docs/integrations/kafka/`
- Rules：`docs/integrations/rules/`
- Storage：`docs/integrations/storage/`

强制要求：

- 契约只能在 `integrations/` 存一份（唯一来源）
- 文档示例必须能“自洽”：
  - ID/时间格式与 `docs/guides/standards/naming-conventions.md` 一致
  - 字段命名与 envelope 约定一致

必跑门禁（提交前）：

- `python docs/tools/run-quality-gates.py`

OpenAPI 额外要求：

- 若修改 `docs/integrations/api/openapi.yaml`，必须同步更新 `docs/integrations/api/openapi.sha256`：
  - `python docs/tools/update-openapi-stamp.py`

## 3. 改了“关键决策”（Why）

必须更新：

- 新增或更新 ADR：`docs/architecture/adr/`

判定标准（任一满足都算“关键决策”）：

- 技术路线改变（入口协议、消息系统、数据库类型）
- 数据模型改变（遥测模型、告警模型、身份模型）
- 影响多个模块的交互边界

## 4. 改了“运维与部署”（How-to）

必须更新：

- `docs/guides/runbooks/`
- `docs/guides/deployment/`

建议同时补充：

- 容量规划假设（磁盘/内存/峰值吞吐）
- 故障处置流程（Kafka 积压、ClickHouse 写入失败、MQTT 连接风暴）

## 5. 进入“合并阶段”（Merge）

强制要求：

- 合并必须使用 `Squash and merge`
- 每次合并必须提供“合并信息包”（PR 标题/描述 + Squash commit 标题/描述）

参考：

- `docs/guides/standards/pull-request-howto.md`
