---
title: field-host-path-troubleshooting
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/testing/field-host-path-troubleshooting
---

# 现场链路联调：宿主机路径异常排查

适用范围：当前 A 路线联调中，Docker 容器内服务健康，但 Windows 宿主机访问映射端口时出现：

- `Empty reply from server`
- `socket hang up`
- `The response ended prematurely`
- `Connection reset by peer`

目标：快速判断问题是不是出在 **Docker Desktop / WSL localhost forwarding / host-to-docker relay**，并给出当前最安全的绕行路径。

当前状态补充：

- 本机已实际验证一次低风险恢复步骤：
  - 关闭 Docker Desktop
  - `wsl --shutdown`
  - 重新启动 Docker Desktop
- 恢复后：
  - `field-host-path-context` 已显示 `8080` / `3000` / `8123` 的 `127.0.0.1` 与 `::1` 都可正常返回
  - `field-local-runtime` 已能成功登录并打通本地 `system/status`
  - `field-runtime-delta` 当前结论为：
    - `host-path-recovered`
- 这表示：
  - 当前宿主机 relay/path blocker 已解除
  - 当前不再存在宿主机 relay 导致的本地 runtime 假失败

## 1) 先看现成结论，不要盲猜

优先执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-local-runtime.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-runtime.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-docker-acceptance.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-runtime-delta.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-host-path-context.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/render-field-host-remediation-plan.ps1
```

如果你准备正式开始收宿主机路径问题，建议先一次性采证：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/collect-field-host-triage.ps1
```

重点看：

- `docs/unified/reports/field-local-runtime-latest.json`
- `docs/unified/reports/field-docker-runtime-latest.json`
- `docs/unified/reports/field-docker-acceptance-latest.json`
- `docs/unified/reports/field-runtime-delta-latest.json`
- `docs/unified/reports/field-host-path-context-latest.json`
- `docs/unified/reports/field-host-remediation-plan-latest.md`

或直接看一次性 triage bundle：

- `backups/evidence/field-host-triage-<timestamp>/summary.json`

## 2) 当前已知判定规则

如果你看到：

- TCP 端口都能连
- 但 `127.0.0.1` 和 `::1` 访问 HTTP 都空回复或 reset
- Docker 容器内探针全绿
- Docker 容器内 acceptance 全绿

那就按下面这条结论处理：

> 这是 **host-to-docker relay/path problem**，不是业务脚本、样例协议、节点 profile 或平台主链本身的问题。

如果你看到：

- `field-host-path-context` 中 `failedHostHttpUrls = []`
- `field-runtime-delta` 结论为 `host-path-recovered`

那就按下面这条结论处理：

> 当前 host-to-docker relay 已恢复。后续只有在 `field-host-path-context` 再次出现真实失败 URL 时，才应把问题重新归类为宿主机路径 blocker。

## 3) 当前最安全的绕行路径

在宿主机路径没修好之前，优先使用 Docker 网络内成功路径：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal-docker.ps1 -Sample hf-normal
```

如果你希望跑完自动收尾：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/run-field-rehearsal-docker.ps1 -Sample hf-normal -CleanupAfter
```

当前成功留证文件：

- `docs/unified/reports/field-docker-mqtt-path-latest.json`
- `docs/unified/reports/field-docker-mqtt-summary-latest.json`

## 4) WSL / Docker Desktop 相关附加证据

如果在 `wsl.exe` 下看到类似：

- `localhost forwarding`
- `WSL NAT`

并且：

- `nc` 能连通端口
- 但 `curl` / `python urllib` 仍然 reset / empty reply

那么不要再把时间花在：

- 换 `localhost`
- 换 `127.0.0.1`
- 换 `::1`

这种低层地址切换上。

这类情况当前更应当视为：

- Docker Desktop localhost forwarding 异常
- WSL relay 路径异常

## 5) 这时不要做的事

不要因为宿主机路径异常而去改：

- Field Telemetry Profile
- 样例包结构
- 节点协议
- 网关职责边界
- 平台 acceptance probe 设计

这些都不是当前 blocker 的根因。

## 6) 当前建议优先级

1. Docker 网络内成功路径继续作为主基线
2. 若 host relay 已恢复，则只处理剩余本地 probe/auth/config 缺口
3. 只有当 `field-host-path-context` 再次出现真实失败 URL 时，才重新进入宿主机路径治理

## 7) 如果必须继续查宿主机路径

优先收集：

- Docker Desktop 版本
- WSL 版本 / `wsl --status`
- Docker Desktop / WSL localhost forwarding 相关设置
- 本地安全软件 / 代理 / VPN 对端口转发的影响

但这些已属于环境治理问题，不属于当前仓库业务逻辑问题。

## 8) 推荐修复动作（按优先级）

以下动作优先级从“低风险、低成本”到“影响较大”排序。

### 8.1 先做最小重置

建议顺序：

1. 退出 Docker Desktop
2. 执行：

```powershell
wsl --shutdown
```

3. 重新启动 Docker Desktop
4. 重新执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-local-runtime.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/dev/check-field-runtime-delta.ps1
```

目的：

- 清掉当前 Docker Desktop / WSL 的 localhost relay 残留状态
- 当前本机已验证这一步可恢复宿主机 HTTP 路径

### 8.2 检查 Docker Desktop 的 WSL Integration

根据 Docker Desktop 官方文档，Windows + WSL2 模式下应确认：

- Docker Desktop 已启用 WSL 2 backend
- 当前默认 WSL 发行版已启用 Docker WSL integration

目的：

- 避免 Docker 运行在 WSL2 模式，但当前主要工作分发没接到 Docker integration

### 8.3 检查 Docker Desktop 网络模式与 published ports 行为

根据 Docker 官方文档，Docker Desktop 控制面负责本地端口转发。

当前如果出现：

- TCP 可达
- HTTP 空回复 / socket hang up

则建议优先检查：

- Docker Desktop 当前网络设置
- 是否存在代理/VPN/安全软件对 `com.docker.backend.exe` 的网络干预

目的：

- 当前问题更像“Docker Desktop 端口转发层异常”，而不是容器业务自身异常

### 8.4 若版本允许，评估 Docker Desktop Host Networking

Docker 官方文档说明：

- Docker Desktop `4.34+` 支持 host networking（Linux containers，需手动启用）

当前机器的 Docker Desktop 版本已经高于该门槛，因此可以把它作为**环境修复实验项**，而不是默认架构前提：

- 在 Docker Desktop 中启用 host networking
- 重新跑 `field-local-runtime` / `field-runtime-delta`

注意：

- 这属于环境层实验
- 不是业务架构变更

### 8.5 评估 WSL mirrored networking / hostAddressLoopback

根据 WSL 官方文档：

- mirrored networking
- `hostAddressLoopback`

都可能影响主机与 WSL/容器之间的 localhost 行为。

当前如果你们愿意继续收环境问题，可以把它们作为**系统层实验项**逐步验证，但要明确：

- 这已经超出当前仓库业务代码范围
- 每做一步都要重新跑本仓探针，不要凭感觉判断

## 9) 当前最务实的取舍

如果你们当前目标是继续推进项目而不是深挖本机网络栈：

- 继续以 Docker 网络内成功路径作为主基线
- 当前 host relay 已恢复后，不要再把 `8081` / `401` 一类本地 probe 结果误记成环境 blocker
- 只在 relay 真实回退时，才把宿主机路径重新登记为环境治理问题

## 10) 参考依据

官方资料方向：

- Docker Desktop WSL 使用说明
- Docker Desktop Networking / published ports
- Docker Desktop Host Networking（4.34+）
- Microsoft WSL networking / mirrored mode / hostAddressLoopback

## 11) 不要误用在 RK3568 共享口问题上

本页只适用于：

- Windows 宿主机到 Docker/WSL 的 host path / relay / localhost forwarding 问题

本页不适用于：

- RK3568 多节点共享 `/dev/ttyS3` 的 southbound 交叠问题

如果你看到的是：

- `interleavingSuspected` 持续增长
- `interleavingWithMultipleSchemas` 或 `interleavingWithMultipleDeviceIds` 持续增长
- `node A/B` 在共享口窗口里降为 `degraded/offline`
- command forwarded 仍在，但 ACK 经常不闭合或被污染

那就不要再按“宿主机路径”或“parser-first”思路处理，而应直接切换到：

- [field-rk3568-shared-port-interleaving-diagnosis-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-shared-port-interleaving-diagnosis-2026-04.md)
- [add-shared-port-source-stream-control](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/openspec/changes/add-shared-port-source-stream-control/proposal.md)

当前正式口径是：

- 这类故障属于 `shared-port source-stream control`
- 不属于 Docker Desktop / WSL host path
- 也不应继续被包装成“再补一点 parser heuristic”
