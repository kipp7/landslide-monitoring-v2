---
title: field-rk3568-edge-runtime-network-architecture-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-edge-runtime-network-architecture-2026-04
---

# RK3568 边缘运行与联网架构基线（2026-04）

## 状态

- topic: `field-rk3568-edge-runtime`
- state: `runtime-architecture-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. 这份文档解决什么问题

前面的文档已经冻结了：

- RK3568 是 `field gateway`
- RK3568 当前可通过：
  - `SSH`
  - `/dev/ttyS3`
  - `115200 8N1`
  直接收到中心节点 XL01 的标准 JSON 遥测

但当前还缺一份更上层的运行架构文档，回答下面这些问题：

1. RK3568 不只是串口接收端，它在长期系统里到底是什么角色
2. 联网到底按什么策略运行
3. 热点要不要开、什么时候开、叫什么
4. 显示屏和本地 OpenClaw 模型怎么放，才不会把主链拖死
5. 工业级稳定性、冗余、恢复应该压在哪些层

因此，这份文档的目标是：

- 把 RK3568 从“一个可 SSH 的 Ubuntu 板子”升级成“正式边缘运行节点”的 authority baseline

## 2. 它挂靠在哪条 authority 链上

这份文档不脱离已有主线，直接挂靠：

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
- [field-rk3568-gateway-implementation-tasklist-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04.md)

它补的是：

- RK3568 运行层和联网层的正式基线

## 3. RK3568 的正式角色定义

RK3568 不应只被定义成：

- `串口转 MQTT 小程序宿主`

而应被定义成：

- `edge gateway + edge control node`

也就是说，RK3568 要同时承担四种长期职责：

1. 南向接入
- 接 XL01 / UART
- 后续接 3 个 RK2206 分节点

2. 网关主链
- 重组
- 校验
- 缓存
- 上行
- 下行翻译

3. 本地设备管理
- 联网
- 配置
- 自启动
- 进程恢复
- 健康监测

4. 可选边缘增强
- 本地显示屏
- 本地 OpenClaw 模型
- 本地运维 UI

其中只有前 3 类属于主链，第四类必须是 sidecar。

## 4. RK3568 的分层运行架构

### 4.1 Layer 0: OS / Device Management Layer

这一层负责：

- Ubuntu 启动
- 网络管理
- systemd
- 时间同步
- 存储挂载
- 看门狗

它的目标是：

- 保证机器开机后能自恢复，不依赖人工登录

### 4.2 Layer 1: Southbound I/O Layer

这一层负责：

- `/dev/ttyS3` 当前接入
- 后续多 UART / 多通道接入
- 串口参数配置
- JSON 边界恢复前的原始流读取

当前冻结事实：

- active device: `/dev/ttyS3`
- serial: `115200 8N1`

### 4.3 Layer 2: Gateway Core Layer

这是 RK3568 的关键主进程层，负责：

- 字节流重组
- JSON 校验
- 本地 spool/cache
- MQTT uplink
- 最小命令翻译
- 节点状态维护

这一层应被实现为：

- `主网关进程`

而不是多个无治理的小脚本。

### 4.4 Layer 3: Local Control Plane Layer

这一层负责：

- 设备配置
- Wi-Fi / 热点策略
- 本地状态查询
- 本地维护入口

这一层可以独立于主网关进程存在，但不能和主链耦死。

### 4.5 Layer 4: Edge Intelligence / UI Sidecar Layer

这一层负责：

- 显示屏 UI
- 本地 OpenClaw 模型
- 边缘规则和辅助判断

这一层必须遵守一个硬规则：

- `sidecar only`

也就是：

- 它可以消费本地状态
- 它可以读本地缓存和统计结果
- 但它不能占有串口主入口
- 也不能阻塞：
  - 接收
  - 缓存
  - 上行

## 5. 运行进程原则

RK3568 不应以“散装脚本集合”方式长期运行。

推荐原则：

1. 一个主网关进程
- 负责：
  - `ttyS3 -> JSON -> spool -> MQTT`

2. 一个设备管理进程
- 负责：
  - 联网
  - 热点
  - 配置
  - 自恢复

3. 零到多个 sidecar
- 显示屏
- OpenClaw
- 本地运维页面

每个进程都应通过 systemd 管理，而不是靠手工终端常驻。

## 6. 联网策略基线

## 6.1 总原则

RK3568 联网不应采用：

- 永远先开热点，再让人手工切 Wi-Fi

推荐采用：

- `STA first, AP fallback`

原因是：

- 正式部署时，RK3568 应以无人值守接入上游网络为默认目标
- 热点应是维护兜底手段，而不是默认主模式

## 6.2 开机联网顺序

开机后推荐顺序固定为：

1. 先启动本地系统服务
- systemd
- 时间
- 存储
- 日志

2. 进入 Wi-Fi STA 自动连接窗口
- 读取预配置 SSID 列表
- 在限定超时时间内尝试自动入网

3. 若成功入网
- 进入正常网关模式
- 允许：
  - MQTT 上行
  - SSH
  - 远程运维

4. 若失败
- 自动进入 AP fallback 模式
- 开启维护热点

## 6.3 热点策略

当前维护热点名称冻结为：

- `rk3568-1`

这一热点的角色是：

- 维护入口
- 配网入口
- 应急 SSH / 本地配置入口

它不应被定义成：

- 正式业务主网络

## 6.4 推荐 AP fallback 行为

当 STA 失败时：

1. 开热点 `rk3568-1`
2. 打开本地维护入口
- SSH
- 或后续轻量本地配置页

3. 允许修改：
- Wi-Fi SSID
- Wi-Fi 凭据
- 设备标识
- 上行 broker 地址

4. 配置保存后，自动重试 STA 模式

## 6.5 AP 和 STA 同时工作的原则

不建议把：

- `AP + STA concurrently`

作为默认真值。

原因是：

- 单无线网卡下同时跑双模式，稳定性和维护性都更复杂
- 对当前阶段来说，收益不大

推荐策略：

- 默认 `STA only`
- 失败时再切 `AP fallback`

如果后期实测证明并发模式稳定，再单独立项扩展。

## 7. 工业级稳定性基线

## 7.1 主链稳定性优先级

RK3568 上优先级最高的不是：

- UI
- 模型
- 花哨本地功能

而是：

1. 串口接收不断
2. 本地缓存不丢
3. 上行恢复可追踪
4. 设备掉电可重启

## 7.2 进程级稳定性

必须具备：

1. systemd 自启动
2. 异常退出自动重启
3. 启动顺序明确
4. crash loop 限流

## 7.3 存储级稳定性

必须具备：

1. spool/cache 持久化
2. 落盘策略可控
3. 日志滚动
4. 重启后可继续处理未完成缓存

推荐方向：

- SQLite WAL 或稳定 spool 目录

不建议：

- 只靠内存队列

## 7.4 网络级稳定性

必须具备：

1. 上线重试
2. 断网缓存
3. 恢复补传
4. Wi-Fi 失败后 AP fallback

## 7.5 电源级稳定性

RK3568 的功耗策略不能按 RK2206 的“深睡眠节点”思路做。

RK3568 更像：

- 常电网关

因此电源重点是：

1. 稳定供电
2. 掉电恢复
3. 高温与热管理
4. 写盘安全

## 8. 冗余策略基线

冗余不能做成“所有层统一双机热备”，那样现场复杂度会失控。

正确方式是分层冗余。

## 8.1 网络冗余

当前推荐：

1. 主模式
- Wi-Fi STA

2. 维护兜底
- `rk3568-1` AP fallback

3. 后续可扩展
- 以太网
- 4G/5G

## 8.2 进程冗余

通过：

- systemd restart
- watchdog
- 本地健康检查

来做“软件自恢复”，而不是上来就做双网关热备。

## 8.3 存储冗余

通过：

- spool/cache
- 证据包
- 可重放记录

来实现“数据不轻易丢”。

## 8.4 功能冗余

关键原则：

- 显示和模型不是主链
- 即使显示屏坏了、OpenClaw 退出了，主网关也必须继续工作

## 8.5 硬件冗余

当前阶段不建议马上上：

- 双 RK3568 热备

当前更合理的是：

- 单 RK3568 正式运行
- 一台冷备板
- 明确恢复步骤

## 9. 显示屏与 OpenClaw 的放置原则

你后面要接显示屏、接本地 OpenClaw 模型，这个方向是合理的，但边界必须先写死。

## 9.1 显示屏原则

显示屏应只消费：

- 本地状态缓存
- 节点状态
- 网络状态
- 告警摘要

它不应直接承担：

- 串口主读取
- MQTT 主发布

## 9.2 OpenClaw 原则

OpenClaw 模型如果要部署在边缘侧，必须遵守：

1. 它是增强层，不是主链层
2. 它可以读本地状态、做推理、给出建议
3. 它不能成为：
- 串口接收前置依赖
- 上行必经依赖

4. 模型资源要有硬限制
- CPU
- 内存
- 启停策略

## 9.3 推荐 sidecar 连接方式

推荐让显示屏和 OpenClaw 读取：

- 本地状态数据库
- 本地事件总线
- 本地只读 API

而不是直接读原始串口。

## 10. 下一阶段实现顺序

基于这份文档，RK3568 不应马上直接长成“全功能边缘脑”。

推荐顺序：

### Phase 1

先冻结主链：

- `/dev/ttyS3`
- `115200 8N1`
- JSON 重组
- 本地 spool
- MQTT uplink

### Phase 2

再冻结运行层：

- systemd
- STA first
- `rk3568-1` AP fallback
- 配置持久化

### Phase 3

再接控制层：

- 本地配置
- 本地状态页
- 本地维护入口

### Phase 4

最后接增强层：

- 显示屏
- OpenClaw
- 边缘增强规则

## 11. 当前结论

当前 RK3568 的正式设计方向应冻结为：

- `一个稳定常电的边缘网关节点`
- `主链优先，增强层 sidecar`
- `STA first, AP fallback`
- `热点名固定为 rk3568-1`
- `分层冗余，不做盲目全双机`

一句话总结：

- `先把 RK3568 做成工业级可恢复网关，再在它上面叠显示和边缘模型`

## 12. 相关文档

- [field-rk3568-gateway-implementation-tasklist-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-gateway-implementation-tasklist-2026-04.md)
- [field-rk3568-access-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/memory/references/field-rk3568-access-baseline.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
