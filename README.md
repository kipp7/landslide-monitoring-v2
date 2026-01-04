# Landslide Monitoring System (v2)

本仓库采用 **Monorepo** 结构，目标是把“契约优先 + 可扩展 + 不写死”落地为可复用工程模板。

## 权威文档入口（Docs Hub）

- `docs/README.md`
- 本地启动（Windows）：`docs/LOCAL_DEV.md`
- API/鉴权/数据格式快速测试：`docs/guides/testing/api-tools.md`
- 生产部署（Docker Compose）：`docs/PRODUCTION.md`

## 快速启动（Windows）

```powershell
cd "E:\学校\02 项目\99 山体滑坡优化完善\landslide-monitoring-v2"
npm install
powershell -ExecutionPolicy Bypass -File scripts/dev/start-local.ps1 -ForceKillPorts
```

- Web：`http://localhost:3000/analysis`
- API：`http://localhost:8080/health`

## 目录结构（v2 目标）

> 目前以“先立规矩，再写代码”为原则：先放目录骨架与边界规则，逐步填充实现。

- `apps/`：可交付的前端应用（Web/Flutter）
  - `apps/web/`
  - `apps/mobile/`
- `services/`：后端可运行服务（API / ingest / writer / rule engine 等）
- `libs/`：跨端共享库（DTO、校验、可观测性等）
- `infra/`：单机部署与运维（Docker Compose、备份恢复）
- `docs/`：架构/需求/契约/指南（唯一入口）

## 质量门禁（必须通过）

- 本地：`python docs/tools/run-quality-gates.py`
- GitHub CI：`.github/workflows/quality-gates.yml`

<!-- ruleset verify -->
