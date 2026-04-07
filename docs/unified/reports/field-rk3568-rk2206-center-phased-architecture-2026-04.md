---
title: field-rk3568-rk2206-center-phased-architecture-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04
---

# `3 x RK2206 + 1 x RK3568 + 1 x Center Server` 分阶段架构与任务基线

## 状态

- topic: `field-system-phased-architecture`
- state: `phase-plan-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. 这份文档解决什么问题

前面的文档已经分别收口了几件事：

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
  - 解决“当前现场上行到底是什么形态、网关边界是什么”
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
  - 解决“长期应采用 node / gateway / platform 三层架构”
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
  - 解决“当前不要再围着单条 proof 打转，而要切到总方向和任务拆分”

但还缺一份真正可执行的阶段文档，把你当前关心的 4 个工程对象压到同一条线上：

1. `3 个 RK2206 分节点`
2. `1 个 RK3568 网关`
3. `1 台中心服务器`
4. `它们之间的正式职责、接口和阶段顺序`

因此，这份文档的作用是：

- 把“总方向”进一步落成“可编码、可分工、可验收”的分阶段架构基线
- 让后续报告、任务、代码实现都能挂到同一份 authority 上

## 2. 这份文档和前面文档的关系

### 2.1 它不替代哪些文档

这份文档不替代：

- `field-uplink-platform-closure-baseline`
- `field-hardware-gateway-architecture-eval`
- `field-hardware-uplink-full-proof-latest.json`

原因是：

- 它不负责证明“链路已经打通”
- 它负责规定“打通之后，系统下一步怎样正式落地”

### 2.2 它补齐哪些空缺

它补齐的是：

- RK2206 节点到底负责到哪里
- RK3568 网关到底负责到哪里
- 中心服务器到底负责到哪里
- 哪些工作先做、哪些后做
- 什么才算当前阶段真正完成

## 3. 当前已经可以当作真值的前提

### 3.1 现场链路真值

当前已知真值：

- RK2206 节点通过 XL01/串口链路把 telemetry 送到中心接收端
- 当前真机上行已接近平台遥测语义：
  - `schema_version`
  - `device_id`
  - `seq`
  - `metrics`
  - `meta`

因此：

- 当前系统不再需要按“旧扁平 JSON 现场协议”来理解

### 3.2 平台链路真值

当前已知真值：

- 平台标准主链保持不变：
  - MQTT
  - ingest
  - Kafka
  - telemetry-writer
  - ClickHouse / Postgres
  - API / Web

因此：

- 中心平台不应为了现场链路去吸收 XL01 私有协议细节

### 3.3 当前 proof 真值

当前已知真值：

- 真机样本 replay 已可进入：
  - MQTT
  - `device_state`
  - API
  - Web 产品读路径
- 当前统一入口已存在：
  - `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\dev\run-field-hardware-uplink-full-proof.ps1`

因此：

- 当前的主问题不是“能不能通”
- 而是“怎样把这套东西做成正式系统”

## 4. 正式系统边界

### 4.1 RK2206 节点边界

RK2206 节点应被定义为：

- `field node`

它的长期职责应包括：

1. 传感器采集
- 读取本节点挂载的传感器

2. 本地状态管理
- 维护采样状态
- 维护本节点健康状态

3. 采样与上报调度
- 采样频率
- 上报频率
- 风险模式切换

4. 低功耗策略
- 睡眠 / 唤醒
- 高功耗传感器按需启停

5. 最小本地缓存
- 短时断链下不立即丢数据

RK2206 不应承担：

- 平台内部组件知识
- Kafka / Postgres / ClickHouse / API 逻辑
- 复杂多节点协调

### 4.2 RK3568 网关边界

RK3568 应被定义为：

- `field gateway`

它的长期职责应包括：

1. 多节点接入
- 接收 3 个 RK2206 分节点的数据

2. 现场协议适配
- framing 重组
- 完整性校验
- 长度预算控制
- 输入消息恢复

3. 节点映射管理
- 节点接入标识
- `field_node_id -> device_id`

4. 本地 spool/cache
- 断网缓存
- 恢复后补传

5. 平台上行
- 向中心 MQTT 遥测入口发送标准化 telemetry

6. 下行翻译
- 将平台命令翻译为节点可执行命令

7. 网关健康
- 节点连接状态
- 缓存深度
- 上次成功上行时间

RK3568 不应承担：

- Web/UI 业务逻辑
- 中心数据库逻辑
- 平台内部审计/报表逻辑

### 4.3 中心服务器边界

中心服务器应被定义为：

- `central platform`

它的职责保持为：

1. 标准入口
- MQTT / ingest

2. 数据主链
- Kafka
- telemetry-writer
- ClickHouse / Postgres

3. 业务读写接口
- API
- Web

4. 运维与证据
- 日志
- 监控
- 数据留证

中心服务器不应承担：

- 现场串口/XL01 私有重组逻辑
- 多节点南向接入管理

## 5. 当前正式部署拓扑建议

当前最合理的一期拓扑建议是：

1. 现场侧
- `3 x RK2206`
- `1 x RK3568`

2. 中心侧
- `1 x center server`
  - API
  - Web
  - MQTT broker
  - Kafka
  - Postgres
  - ClickHouse

3. 连接关系
- `RK2206 -> RK3568`
  - 现场链路
- `RK3568 -> center server`
  - 网络回传链路
- `center server -> user/ops`
  - API / Web

## 6. 当前建议的阶段顺序

### Phase A：系统边界冻结

这一阶段必须先完成，不再继续分散试验。

必须冻结：

1. RK2206 节点职责
2. RK3568 网关职责
3. 中心服务器职责
4. 三者之间的输入输出边界

### Phase B：RK3568 网关最小实现

这一阶段优先级最高。

必须先实现：

1. 3 节点接入模型
2. 输入重组与校验
3. `field_node_id -> device_id` 映射
4. 缓存与补传
5. MQTT 上行

原因：

- 它是现场系统真正的结构中心

### Phase C：RK2206 固件实现

这一阶段与网关实现并行推进，但不应先于网关主线。

必须收口：

1. 多传感器采集模型
2. 采样/上报分离
3. 低功耗模式
4. 节点本地健康与最小缓存

### Phase D：中心部署定型

这一阶段必须在网关边界足够清楚后推进。

必须收口：

1. 中心服务器组件清单
2. 部署方式
3. 运行恢复策略
4. 现场到中心的网络依赖

### Phase E：3 节点真实演练

最后再做：

- `3 x RK2206 -> 1 x RK3568 -> center server`

最终验收只看：

1. 稳定上传
2. 节点可区分
3. 网关可缓存/恢复
4. 平台可见

## 7. 任务拆分建议

### 7.1 RK3568 网关任务包

建议首先拆成：

1. 接入层
- 3 节点输入管理
- 南向接口抽象

2. 适配层
- framing
- 重组
- 校验

3. 状态层
- 节点映射
- 节点在线状态
- 网关健康状态

4. 缓存层
- spool/cache
- replay

5. 上行层
- MQTT uplink

### 7.2 RK2206 固件任务包

建议拆成：

1. 传感器驱动包
2. 采样调度包
3. 上报调度包
4. 低功耗包
5. 本地健康/容错包

### 7.3 中心部署任务包

建议拆成：

1. 组件拓扑
2. 服务部署
3. 配置管理
4. 监控与恢复

## 8. 当前最该避免的误区

### 8.1 不要继续把 proof 当产品

`full-path` 脚本很重要，但它只是：

- 当前软件验收入口

不是：

- 现场正式网关程序

### 8.2 不要把命令链重新当主 blocker

命令链已经证明过。

当前真正的主 blocker 是：

- 网关主线
- 节点主线
- 中心部署主线

### 8.3 不要让中心平台吸收现场复杂度

不应出现：

- 为了现场链路而修改平台核心边界

正确方式仍然是：

- RK3568 承担边缘适配

## 9. 当前建议的单一执行线

从现在开始，建议只按这一条执行线推进：

1. 先冻结：
- `3 RK2206 + 1 RK3568 + 1 center server`

2. 然后先做：
- RK3568 网关最小实现

3. 同步推进：
- RK2206 固件功能收口

4. 最后再定：
- 中心部署与真实 3 节点联调

## 10. 当前结论

当前最重要的收口结论是：

- 现场系统的下一阶段不应再按“proof 驱动”推进
- 而应按“角色边界 + 阶段实现 + 最终部署”推进

一句话总结：

- `先把 3 节点 + 1 网关 + 1 中心服务器的正式方案冻结，再进入 RK3568 / RK2206 / 中心部署三线实现`

## 11. 相关文档

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-hardware-uplink-full-proof-latest.json](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-uplink-full-proof-latest.json)
- [field-uplink-platform-closure.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/memory/tasks/field-uplink-platform-closure.md)
