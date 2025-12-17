# 重构启动前检查清单（开始写代码之前必须完成）

目标：把“准备开始重构”变成一套可执行的启动条件，确保后续进入代码阶段不会因为环境、流程、契约缺失而反复返工。

## A. 仓库流程（必须先完成）

- [ ] `main` 分支保护已开启（必须）：`docs/guides/standards/github-repo-governance.md`
  - [ ] 禁止直接 push main（PR-only）
  - [ ] 必须通过 `quality-gates` 才能合并
  - [ ] 合并方式固定为 Squash
- [ ] PR/Issue 模板已确认可用（中文）：`.github/`
- [ ] 本地提交模板已设置（建议）：`git config commit.template .github/commit-message-template.txt`

## B. 文档与契约（必须完成）

- [ ] Docs Hub 入口齐全：`docs/README.md`
- [ ] integrations 入口齐全：`docs/integrations/README.md`
- [ ] 契约校验通过：`python docs/tools/validate-contracts.py`
- [ ] 一键质量门禁通过：`python docs/tools/run-quality-gates.py`
- [ ] 已明确语言政策（中文文档 + 英文标识符）：`docs/guides/standards/language-policy.md`
- [ ] 已明确 DoD：`docs/guides/standards/definition-of-done.md`

## C. 单机环境（强烈建议在进入 services 之前完成）

如果你打算在本机跑完整链路（EMQX/Kafka/Postgres/ClickHouse/Redis）：

- [ ] Docker Desktop 可用
- [ ] Docker 镜像可拉取（如拉取超时，先解决镜像源/加速）
  - 参考 Incident：`docs/incidents/INC-0004-dockerhub-pull-timeout.md`
- [ ] `infra/compose/scripts/health-check.ps1` 通过（至少基础端口/容器状态正常）

## D. 阶段 1（最小链路）里程碑（进入代码的第一个目标）

进入“代码重构”后，第一阶段只做 M1（最小可跑闭环）：

- [ ] MQTT ingest：设备上报 → Kafka（含 DLQ）
- [ ] writer：Kafka → ClickHouse（批量写入、错误隔离）
- [ ] API：查询最新值 + 简单曲线（最少 2~3 个端点即可）
- [ ] Web/App：只做最小展示，且不硬编码传感器元数据

建议把 M1 拆成 3~6 个小 PR，保持每个 PR 可 review、可回滚。

