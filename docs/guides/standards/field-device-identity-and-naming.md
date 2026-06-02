---
title: field-device-identity-and-naming
type: note
permalink: landslide-monitoring-v2-mainline/docs/guides/standards/field-device-identity-and-naming
---

# 现场设备身份与命名标准

如果当前讨论的是“设备注册、正式命名、baseline 确立”的实际执行顺序，统一回到：

- `docs/guides/runbooks/field-formal-device-commissioning-runbook.md`

本文只定义身份和命名规则，不替代 runbook。

适用范围：

- 山体滑坡现场部署
- 多区域、分批次接入
- 中心节点 + 分节点 + 后续扩展传感器
- `RK2206` 节点、`RK3568` 网关、平台 `API/Web/Desk`

本文解决的核心问题不是“怎么起一个好听的名字”，而是：

- 大规模接入时如何避免身份混乱
- 换板、返修、扩区后如何不丢业务连续性
- 现场人员和软件系统如何使用同一套对象模型
- 如何把正式设备与 `seed/replay/rehearsal/test` 彻底分层

## 1. 基本原则

### 1.1 机器身份与人类标签分离

必须分开两类字段：

- 机器身份
  - 用于认证、主题、数据库主键、命令审计
  - 一旦创建，不承载现场语义
- 人类标签
  - 用于贴标、巡检、交付、施工、页面展示
  - 可以调整，但不能替代机器身份

### 1.2 固定点位与硬件生命周期分离

必须分开两类对象：

- 固定点位
  - 代表山体上的一个长期监测点
  - 不因为换板、返修、升级而改变
- 具体硬件
  - 代表某一块真实设备板卡
  - 可以报废、更换、重新烧录

结论：

- 换板时，`station_code` / `node_code` 通常不变
- 换板时，`device_id` 必须允许变化

### 1.3 先支持扩区，再优化展示

命名体系必须先满足：

- 多区域
- 多滑坡体
- 多点位
- 多节点
- 多网关
- 多批次上线

页面显示名称可以优化，但底层编码规则必须先支持规模化。

## 2. 对象层级

推荐把现场对象拆成五层。

### 2.1 `region`

表示一个行政区、项目片区、流域片区或运维分区。

示例：

- `CN-GX-YL-DC`
- `CN-GD-SZ-NS`

要求：

- 全大写字母、数字、连字符
- 在整个部署范围内唯一
- 用于区域筛选、分区部署、运维权限、批量报表

### 2.2 `slope`

表示一个具体滑坡体、边坡体或风险体。

示例：

- `LS-CN-GX-YL-DC-001`
- `LS-CN-GX-YL-DC-002`

要求：

- 属于某个 `region_code`
- 一个滑坡体一个稳定编码
- 后续所有固定点位从属于该 `slope_code`

### 2.3 `station`

表示一个固定监测点位。

这是最关键的“长期业务对象”。

示例：

- `ST-LS-CN-GX-YL-DC-001-01`
- `ST-LS-CN-GX-YL-DC-001-02`

要求：

- 对应真实定点
- 不跟具体板卡生命周期绑定
- 页面、报表、趋势分析、运维工单优先围绕 `station_code`

### 2.4 `node`

表示该点位下的一个现场节点角色。

示例：

- `ND-ST-LS-CN-GX-YL-DC-001-01-A`
- `ND-ST-LS-CN-GX-YL-DC-001-01-B`
- `ND-ST-LS-CN-GX-YL-DC-001-01-C`

要求：

- 对应点位内的逻辑节点角色
- 角色后缀建议稳定，例如 `A/B/C`
- 若后续不是 A/B/C，而是不同传感器角色，可改为角色后缀，如 `GNSS`、`RAIN`、`CAM`

### 2.5 `gateway`

表示一个网关或中心接入单元。

示例：

- `GW-CN-GX-YL-DC-01`
- `GW-CN-GX-YL-DC-02`

要求：

- 面向可维护覆盖单元，而不是“整座山唯一一个”
- 一个网关可服务多个节点
- 但不建议跨严重遮挡区滥扩

## 3. 机器身份字段

### 3.1 `device_id`

这是唯一平台机器身份。

规则：

- 使用 UUID
- 用于：
  - MQTT topic
  - 命令下发
  - 数据库主键
  - API 主标识
  - 审计和告警关联
- 不承载区域、滑坡体、点位语义

禁止：

- 禁止把 `device_id` 设计成 `A01`、`device_1`、`挂榜山-1号`
- 禁止把 `install_label` 或 `device_name` 当成机器身份

### 3.2 `identity_class`

必须为每个设备定义身份类别，用于把正式设备与测试设备分层。

推荐值：

- `formal`
- `seed`
- `replay`
- `rehearsal`
- `smoke_test`
- `lab`

规则：

- 产品默认视图只显示 `formal`
- `seed/replay/rehearsal/smoke_test/lab` 只能出现在调试、证明、演示、开发工具链

### 3.3 `device_role`

表示设备在现场拓扑中的职责。

推荐值：

- `field_gateway`
- `field_node`
- `center_node`
- `gnss_node`
- `rain_node`
- `camera_node`
- `multi_sensor_node`

规则：

- 角色用于调度、筛选和页面展示
- 角色不替代 `node_code`

## 4. 人类可读字段

### 4.1 `display_name`

给软件界面和运维列表使用。

示例：

- `玉林东川滑坡体 01 点 A 节点`
- `玉林东川滑坡体 01 点中心网关`

规则：

- 可使用中文
- 允许后期优化措辞
- 不参与认证、命令主题、数据库主键

### 4.2 `install_label`

给施工贴标、外壳标签、巡检记录使用。

示例：

- `FIELD-NODE-A`
- `DONGCHUAN-01-B`

规则：

- 允许与 `display_name` 不同
- 适合印在外壳、标签纸、现场记录单
- 不能替代 `device_id`

### 4.3 `device_name`

当前仓库里已经存在这个字段。

近期待法：

- 视为兼容字段
- 可以继续保留
- 但正式语义建议逐步向 `display_name` 迁移

不建议继续使用：

- `device_1`
- `device_2`
- `device_3`

这类名字只适合 seed/demo，不适合正式交付。

## 5. 推荐编码模板

### 5.1 `region_code`

格式：

- `<COUNTRY>-<PROVINCE>-<CITY>-<AREA>`

示例：

- `CN-GX-YL-DC`

### 5.2 `slope_code`

格式：

- `LS-<region_code>-<seq3>`

示例：

- `LS-CN-GX-YL-DC-001`

### 5.3 `station_code`

格式：

- `ST-<slope_code>-<seq2>`

示例：

- `ST-LS-CN-GX-YL-DC-001-01`

### 5.4 `node_code`

格式：

- `ND-<station_code>-<node_suffix>`

示例：

- `ND-ST-LS-CN-GX-YL-DC-001-01-A`
- `ND-ST-LS-CN-GX-YL-DC-001-01-B`
- `ND-ST-LS-CN-GX-YL-DC-001-01-C`

### 5.5 `gateway_code`

格式：

- `GW-<region_code>-<seq2>`

示例：

- `GW-CN-GX-YL-DC-01`

说明：

- `gateway_code` 不一定强绑定某个单一 `station`
- 它绑定的是“一个可维护覆盖单元”

## 6. 当前项目的落地映射

当前仓库还没有完整的 `region/slope/node/gateway` 一等实体表。

所以近期开工建议是：

### 6.1 数据库现状

- `devices`
- `stations`

### 6.2 近期开工映射

- `device_id`
  - 继续保留为 `devices.device_id`
- `station_code`
  - 继续保留在 `stations.station_code`
- `region_code`
  - 先写入 `stations.metadata.regionCode`
- `slope_code`
  - 先写入 `stations.metadata.slopeCode`
- `node_code`
  - 先写入 `devices.metadata.nodeCode`
- `gateway_code`
  - 先写入 `devices.metadata.gatewayCode`
- `device_role`
  - 先写入 `devices.metadata.deviceRole`
- `identity_class`
  - 先写入 `devices.metadata.identityClass`
- `display_name`
  - 先写入 `devices.metadata.displayName`

这样做的好处是：

- 不马上破坏当前 API
- 可以先把正式命名体系跑起来
- 后续规模起来后再把高频筛选字段升成一等列

### 6.3 当前实体语义约束

为了避免当前主线里的 `station` 再次同时表示“整座边坡”和“固定监测点”，近期开工必须统一成：

- `stations` 代表固定监测点，也就是本文里的 `station`
- `station_code` 代表固定点位编码，不承载整座滑坡体语义
- `slope_code` 代表滑坡体，先进入 `stations.metadata.slopeCode`
- `region_code` 代表部署分区，先进入 `stations.metadata.regionCode`

换句话说：

- 当前主线里的 `station` 应优先理解为“固定监测点实体”
- 一个 `station` 可挂多个设备，但这些设备应属于同一个固定点位或其直接接入单元

## 7. 换板与返修规则

### 7.1 允许变化的

- `device_id`
- `hardware_serial`
- `firmware_version`

### 7.2 不应变化的

- `region_code`
- `slope_code`
- `station_code`
- `node_code`
- `device_role`

### 7.3 实际含义

如果 `ND-ST-LS-CN-GX-YL-DC-001-01-B` 这块板坏了：

- 新板重新发新的 `device_id`
- 但仍然挂在同一个 `node_code`
- 历史查询按 `station_code/node_code` 看连续性
- 审计与认证按 `device_id` 看单块硬件生命周期

## 8. 产品面展示规则

页面默认优先展示：

- `display_name`
- `station_code`
- `node_code`

页面可折叠显示：

- `device_id`
- `install_label`
- `hardware_model`
- `firmware_version`

页面不应只展示：

- `device_1`
- `device_2`
- 裸 UUID

因为这对现场运维和大规模接入都不友好。

## 9. 正式视图与测试视图分层

必须把设备类别做成正式规则，而不是靠人工记忆。

### 9.1 正式视图

只显示：

- `identity_class=formal`

### 9.2 调试/证明视图

允许显示：

- `seed`
- `replay`
- `rehearsal`
- `smoke_test`
- `lab`

这样可以避免再次出现：

- replay 设备污染 dashboard
- rehearsal 设备污染正式设备总数
- seed 设备冒充正式点位

## 10. 大规模接入时的最小字段集

正式部署建议至少具备：

- `device_id`
- `identity_class`
- `device_role`
- `region_code`
- `slope_code`
- `station_code`
- `node_code`
- `gateway_code`
- `display_name`
- `install_label`
- `hardware_model`
- `firmware_version`
- `lifecycle_status`

### 10.1 大规模接入前的最小可搜索 / 可索引字段集

在设备量明显扩大前，至少要保证以下字段可以稳定筛选、检索或后续升索引：

- `device_id`
- `identity_class`
- `region_code`
- `slope_code`
- `station_code`
- `node_code`
- `gateway_code`
- `device_role`
- `lifecycle_status`

## 11. 与当前主线的关系

当前主线已经确定的真值：

- 机器主身份继续是 `device_id(UUID)`
- 正式命令入口继续是 `/api/v1/devices/{deviceId}/commands`
- 遥测链继续围绕 `device_id`

本标准新增的是“业务分层身份”，不是推翻现有主链。

换句话说：

- `device_id` 继续做底层真值
- `region/slope/station/node/gateway` 用来承载现场业务层级

### 11.1 API 与读模型最小约束

API、Web、Desk 后续对齐时，字段职责至少要按下面四层分开：

- 机器身份层
  - `deviceId`
  - `stationId`
- 业务身份层
  - `stationCode`
  - `regionCode`
  - `slopeCode`
  - `nodeCode`
  - `gatewayCode`
  - `deviceRole`
  - `identityClass`
- 人类展示层
  - `displayName`
  - `installLabel`
- 兼容层
  - `deviceName`
  - `legacyDeviceId`

其中：

- 机器身份层必须继续稳定服务认证、命令和审计
- 业务身份层必须为现场部署、筛选、报表和换板连续性服务
- 人类展示层可以优化措辞，但不能抢占机器身份职责
- 兼容层只能用于过渡，不应再成为正式交付命名真值

## 12. 近期实施建议

第一阶段：

- 先冻结本标准
- 先在 API/DB metadata 中补齐这些字段
- 先让正式设备、seed、replay、rehearsal 分层

第二阶段：

- 把正式设备视图切成只看 `formal`
- 把旧 `device_1..6` 兼容对象从正式交付面隔离

第三阶段：

- 如果规模继续扩大，再把 `region/slope/node/gateway` 升成一等实体或索引字段

## 13. 一句话结论

正式系统必须坚持：

- `device_id` 管机器
- `station_code/node_code` 管现场定点和节点角色
- `display_name/install_label` 管人类可读性
- `identity_class` 管正式/测试分层

四者不能混用。
