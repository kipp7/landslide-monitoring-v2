# Definition of Done（DoD，交付闭环标准）

目标：把“做完了”从主观感觉变成可验证标准，避免后续重构时返工、丢契约、丢验收。

适用范围：docs / infra / services / apps / libs / firmware 的所有 PR。

## 1) 通用 DoD（所有 PR 必须满足）

- [ ] 有清晰的 Why（背景与目标），并能被复述。
- [ ] 变更范围明确（影响哪些目录/模块）。
- [ ] 质量门禁通过：`python docs/tools/run-quality-gates.py`
- [ ] 若影响“阶段/里程碑/下一步/风险”：已更新 `docs/guides/roadmap/project-status.md`（交接入口，强制）。
- [ ] 若涉及契约变更：已同步更新 `docs/integrations/`（且示例可校验）。
- [ ] 有回滚策略（至少是 “revert 本 PR”）。
- [ ] 不提交任何敏感信息（token/secret/password）。

## 2) 契约变更 DoD（API/MQTT/Kafka/Rules/Storage）

- [ ] 契约文件已更新（OpenAPI/Schema/DDL）。
- [ ] 示例已更新并自洽（至少 1 正向 + 1 错误示例，如果适用）。
- [ ] OpenAPI stamp 已更新（如果改了 OpenAPI）：
  - `python docs/tools/update-openapi-stamp.py`
- [ ] 相关 PRD/Spec/ADR 有引用更新（只引用，不复制契约内容）。

## 3) 后端代码 DoD（services）

- [ ] 输入边界有 runtime 校验（HTTP/MQTT/Kafka）。
- [ ] 幂等/重试/降级策略明确（至少在 Spec 中写清楚）。
- [ ] 日志具备可追踪性：包含 `traceId` / `deviceId` / `stationId` 等关键字段（按实际需要）。
- [ ] 有最小可运行路径（最小链路能跑通），并写明如何验证。

## 4) 前端代码 DoD（apps）

- [ ] 不硬编码传感器 key/单位/枚举/阈值（从 API 获取或走配置/字典表）。
- [ ] 请求/DTO 不私自定义字段（以 OpenAPI 为准，未来走 codegen）。
- [ ] 错误处理一致（能定位问题、提示用户可操作）。

## 5) 单机运维 DoD（infra）

- [ ] `infra/compose/README.md` 有清晰的一键启动、数据目录、备份恢复步骤。
- [ ] 关键脚本可执行（init/health-check/evidence/backup）。
- [ ] 遇到问题能收集证据：`infra/compose/scripts/collect-evidence.ps1`
