# INC-0004: Docker Hub 拉取镜像超时导致基础设施无法启动

## Summary

- 单机基础设施使用 Docker Compose 启动时，拉取 `postgres/redis/clickhouse/emqx/kafka` 等镜像失败。
- 根因是当前网络环境访问 `https://registry-1.docker.io/v2/` 超时（或被阻断）。

## Impact

- 阶段 1（基础设施落地）阻塞：无法启动容器、无法初始化 DDL、无法进行后续 services 开发。

## Timeline（UTC）

- T0：执行 `docker compose up -d` 拉取镜像失败（timeout）。
- T1：使用 `curl.exe -I https://registry-1.docker.io/v2/` 复现超时。
- T2：补充 health-check / evidence 脚本与排障文档。

## Root Cause(s)

- 直接原因：Docker Hub registry 访问超时。
- 深层原因：部署环境未配置 registry mirror；网络环境对 Docker Hub 不稳定。

## Detection

- `docker compose up -d` 报错：`Client.Timeout exceeded while awaiting headers`。
- `infra/compose/scripts/health-check.ps1` 显示 required images 缺失，端口不可达。

## Resolution

- 临时缓解：
  - 在 Docker Desktop 配置 `registry-mirrors`（使用学校/网络允许的加速源）。
  - 或在可用网络环境中预先 `docker pull` 所需镜像，再回到当前网络运行 compose。
- 根本修复（流程化）：
  - 在 `infra/compose/README.md` 与测试文档中明确“镜像加速”作为前置条件。
  - 引入证据包脚本，确保问题可追溯。

## Corrective & Preventive Actions（CAPA）

- Action：增加企业化健康检查与证据包脚本  
  Owner：repo  
  验证：运行 `infra/compose/scripts/health-check.ps1` 与 `collect-evidence.ps1`
- Action：更新冒烟测试文档与排障指引  
  Owner：docs  
  验证：`docs/guides/testing/single-host-smoke-test.md`

## References

- 测试入口：`docs/guides/testing/single-host-smoke-test.md`
- 排障证据：`docs/guides/testing/troubleshooting-and-evidence.md`
- 部署物料：`infra/compose/README.md`

