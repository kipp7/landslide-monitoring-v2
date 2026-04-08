---
title: field-rk2206-firmware-implementation-tasklist-2026-04
type: note
permalink: landslide-monitoring-v2-mainline/docs/unified/reports/field-rk2206-firmware-implementation-tasklist-2026-04
---

# RK2206 固件实施任务单（2026-04）

## 状态

- topic: `field-rk2206-firmware-implementation`
- state: `implementation-tasklist-frozen`
- updated_at: `2026-04-08`
- authority: `current`

## 1. 这份任务单解决什么问题

[field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)
已经把 RK2206 定义成：

- `field node`

但“field node”还只是边界定义，不是固件 backlog。

这份文档的作用是：

1. 把 RK2206 从“能演示上传/收命令”推进到“可长期运行的现场节点”
2. 把固件工作切成明确模块
3. 防止固件继续被零散串口试验牵着走

## 2. 它挂靠在哪条 authority 链上

这份任务单直接继承以下结论：

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)

因此，RK2206 当前只应承担：

- 采集
- 节点状态
- 采样/上报调度
- 低功耗
- 最小缓存
- 必要命令执行

不应承担：

- 平台核心逻辑
- 多节点协同
- 中心部署逻辑

## 3. 当前固件第一阶段目标

RK2206 当前第一阶段的真正目标不是再证明一次 UART。

而是把节点固件收口成：

- `多传感器可采`
- `采样与上报解耦`
- `低功耗可切`
- `最小缓存可用`
- `命令执行最小闭环成立`

## 4. 固件实施任务包

### 4.1 传感器驱动包

必须完成：

1. 固定一期传感器清单
- IMU
- 温湿度
- GPS
- 其余现场传感器按明确范围补入

2. 每类驱动要有稳定输出结构
- 读数
- 状态位
- 最近采样时间

3. 统一驱动错误语义
- init failed
- read timeout
- invalid sample

目标是让上层调度不再直接依赖驱动细节。

### 4.2 采样调度包

必须完成：

1. 采样周期和上报周期解耦
- `sampling_s`
- `report_interval_s`

2. 风险模式切换
- 正常模式
- 高频模式
- 低功耗模式

3. 采样聚合缓存
- 上报前先聚合最近有效样本

当前禁止：

- 继续把“采一次就立刻发一次”写死成唯一模型

### 4.3 上报打包包

必须完成：

1. 统一 payload 构造器
- `schema_version`
- `device_id`
- `seq`
- `metrics`
- `meta`

2. 字段稳定性
- 已经是 canonical 的字段名不再反复改

3. 体积预算
- 高频消息必须控制长度
- 非必要字段不能无限膨胀

4. 上传触发原因
- `periodic`
- `manual_collect`
- 其他触发原因要显式编码

### 4.4 本地健康与容错包

必须完成：

1. 看门狗策略
- 正常喂狗点
- 异常恢复路径

2. 节点健康状态
- 传感器健康
- 上报健康
- 最近错误类型

3. 异常降级
- 某个传感器故障时不应拖死整机上报

### 4.5 最小缓存包

必须完成：

1. 短时断链缓存
- 断链不立即丢弃最新关键样本

2. 缓存容量上限
- 明确条数或字节上限

3. 覆盖/淘汰策略
- 新样本进来后如何淘汰旧样本

一期目标仍是：

- 最小可用

不是：

- 长历史存储

### 4.6 低功耗包

必须完成：

1. 模式切换条件
- 正常
- 节能
- 风险唤醒

2. 传感器启停策略
- 高功耗模块按需启停

3. 睡眠与唤醒时序
- 不破坏采样和上报主循环

4. 低电量策略
- 电量过低时的降频或保命模式

### 4.7 命令执行包

必须完成最小支持集：

1. `manual_collect`
- 触发立即采集/立即上报

2. `set_config`
- 支持至少：
  - `sampling_s`
  - `report_interval_s`

3. 命令执行结果
- ack
- applied / rejected
- 原因说明

当前这一层不需要做丰富命令生态，但必须把已经证明过的最小命令链固化进固件结构。

4. ACK 发送时序保护
- ACK 必须优先于下一条 telemetry 发送
- ACK 发送后需要保留最小静默窗口，避免同一上行链路上的其他 JSON 立即挤入
- 至少要能配置或固定：
  - `ack_guard_ms`
  - `post_ack_quiet_ms`

5. 命令窗口内的上报协同
- `manual_collect` 触发后，不得让 ACK 与立即上报在字节级交织
- 如果当前节点要在命令后立即上报：
  - 也必须先 ACK
  - 再经过静默窗口
  - 再发 telemetry

## 5. 推荐实施顺序

### Step 1

先固定驱动与采样模型：

- 传感器驱动
- 采样调度
- 打包结构

### Step 2

再固定命令与配置模型：

- `manual_collect`
- `set_config`

### Step 3

再做健康、缓存和低功耗：

- watchdog
- node health
- minimal cache
- power mode

原因是：

- 没有稳定采样/打包主线，后面的低功耗和缓存都只是补丁

## 6. 一期验收标准

RK2206 一期算完成，至少要满足：

1. 传感器采集链稳定
2. `sampling_s` 与 `report_interval_s` 可独立工作
3. payload 字段稳定且与当前平台语义一致
4. `manual_collect` 生效并能反映到 `last_command_*`
5. `set_config` 生效并能改变运行节奏
6. 单个传感器故障不拖垮整个节点
7. 存在最小断链缓存
8. 至少具备一档可用低功耗模式

## 7. 当前不纳入一期的内容

以下内容暂不作为一期 blocker：

1. 完整 OTA
2. 高级本地规则引擎
3. 复杂边缘 AI
4. 长期大容量历史存储
5. 丰富命令种类扩展

## 8. 风险与注意事项

当前最现实的风险是：

1. 固件仍然把演示路径和产品路径混在一起

2. 传感器驱动与业务打包耦合过深

3. 低功耗改造过早进入细节，反而把基础采样主线打散

4. payload 字段频繁漂移，导致网关与平台两端都不稳定

5. 命令 ACK 与 telemetry 共用中心 XL01 汇聚链路时，如果没有发送窗口控制，可能在 RK3568 侧形成不可恢复的字节级交织

## 9. 当前结论

RK2206 固件当前应按这一条主线推进：

- `先把多传感器采样、打包、命令、健康打稳，再做最小缓存和低功耗收口`

并且命令执行层现在需要显式加入一条工业级约束：

- `ACK 优先 + ACK 后静默窗口 + 命令后 telemetry 延迟释放`

这样做的目的，是让 RK2206 成为真正的现场节点，而不是继续停留在单点演示固件。

## 10. 相关文档

- [field-uplink-platform-closure-baseline.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-uplink-platform-closure-baseline.md)
- [field-hardware-gateway-architecture-eval.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-hardware-gateway-architecture-eval.md)
- [field-program-direction-and-task-split-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-program-direction-and-task-split-2026-04.md)
- [field-rk3568-rk2206-center-phased-architecture-2026-04.md](/E:/学校/02 项目/99 山体滑坡优化完善/landslide-monitoring-v2-mainline/docs/unified/reports/field-rk3568-rk2206-center-phased-architecture-2026-04.md)

## 11. 2026-04-08 当前实施检查点

截至 `2026-04-08`，RK2206 固件这条线已经从“源码级整改”推进到“真实烧录后的实机回归”：

1. 已进入真实源码树并完成烧录的整改项
- 真实工作区：
  - `F:\2\openharmony\txsmartropenharmony\vendor\isoftstone\rk2206\samples\xl01_landslide_monitor_v1.0`
- 第一轮已落地并烧录的命令窗口整改包括：
  - `drivers/xl01/xl01_driver.c`
    - UART TX mutex
  - `config/app_config.h`
    - `PLATFORM_POST_ACK_QUIET_MS = 1200`
    - `PLATFORM_MANUAL_COLLECT_DELAY_MS = 1500`
  - `main/landslide_main.c`
    - ACK 统一走 guard send
    - `manual_collect` 改为：
      - ACK first
      - quiet window
      - deferred telemetry release

2. 最新实机结果已经证明这轮整改有效
- 在两块已重新烧录的 RK2206 板参与的共享串口场景下：
  - `node B` fresh `manual_collect` proof 已恢复成功
- 最新命令证据：
  - `commandId = 3a989480-a41e-4bb3-98bf-1db7bd45b664`
- RK3568 侧已确认：
  - `diagnosis.summary = command-forward-and-ack-publish-succeeded`
  - `stats.ackMessagesPublished = 2`
  - `nodes[B].ackPublishes = 2`
- 这意味着这轮固件整改已经不再只是“理论上应该改善”
  - 而是已经实际恢复了共享链路上的 ACK 发布闭环

3. 仍然存在但已降级的问题
- 共享中心 XL01 串流里仍有解析噪声：
  - `southbound-json-fragmentation`
  - `shared-stream-byte-interleaving`
  - `unclassified-parse-failure`
- 所以这轮结论不是“串流已经完全干净”
- 而是：
  - ACK 保护窗口已经把主闭环从阻塞态拉回可运行态
  - 下一轮仍要继续压缩串流坏包率

4. 因此 RK2206 当前下一阶段应继续收敛为
- 保持当前 ACK guard 方案作为固件主线
- 继续验证：
  - `set_config`
  - 更长时间窗
  - 节点 `C` 加入后的三节点共享串流
- 然后再进入真正的一期固件结构化工作：
  - 采样/上报解耦
  - 最小缓存
  - 低功耗

5. 最新补充结论
- 修复后的共享串口链路现在已同时实机复证：
  - `manual_collect`
  - `set_config`
- `set_config` 最新两次命令证据分别为：
  - `7acb0df9-5647-4551-a283-9d4b9ca0f78e` (`set-report-300`)
  - `db328b8c-0874-4f35-81a1-ef576b8178f2` (`set-report-5`)
- 两次都已在 RK3568 侧看到：
  - `field gateway command forwarded to serial`
  - `field gateway command ack published`
- 因此当前固件线不再只是“先把 manual_collect 拉通”
- 而是已经进入：
  - 共享链路最小命令集已恢复
  - 下一步转向三节点与更长时间窗稳定性
