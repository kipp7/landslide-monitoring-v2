---
title: rk2206-safe-ota-migration-strategy
type: note
tags:
  - decision
  - rk2206
  - ota
  - bootloader
  - rk3568
status: active
---

# Decision: rk2206-safe-ota-migration-strategy

## Context

频繁拆出 RK2206 核心板进行串口烧录存在插针错位、硬件损伤和身份刷错风险，因此需要远程升级。2026-08-02 对当前 OpenHarmony SDK、RK2206 HOTA HAL、应用链接结果、8 MiB 分区、打包器、loader 和本地开发工具手册完成只读审计。

## Decision

- 当前 A/B/C 不允许 OTA。现有 HOTA HAL 是返回假成功的占位实现，应用未接入 OTA，生产镜像也是单 `liteos` 槽位。
- 先在可有线救援的备用板实现并验证 A/B 引导链；正式板需要最后一次有线迁移到 A/B loader/分区。迁移后常规 OTA 写非活动槽并软件重启，不需要人工下电。
- 云端只把签名制品发到 RK3568。RK3568 负责一次下载、预校验、分节点灰度和状态审计；RK2206 仍必须独立验签和读回校验。
- 当前不接受任何 OTA 制品数据面。现有 RK2206 应用没有 Wi-Fi/WLAN、socket 或 HTTP 实现，本地 Wi-Fi 只能作为待验证候选；必须先证明实板能力、覆盖、断线恢复、吞吐和资源预算。若不成立，则单独实现低速、可续传、单节点维护窗口的 XLS1 数据面，并在传输期间暂停竞争的 RTCM，不把固件流量混入正常生产时隙。
- 必须具备硬件/profile/节点身份约束、SHA-256、离线签名、单调版本、防重放、冗余原子元数据、pending boot 次数、健康确认、看门狗复位回滚和完整掉电测试。
- OTA 首次上线始终单节点灰度，其他节点继续监测；保留串口/pogo 救援路径。

## Rationale

- 当前 `HotaHalWrite` 不写 Flash 却返回成功，`SetBootSettings/Restart/Rollback` 均为空操作，分区表和公钥为 `NULL`，版本检查永远接受；直接接 UI 或命令会形成危险的假成功。
- 当前 `Backup_Partition_Enable` 为空且只有一个 1.875 MiB `liteos` 槽位，掉电中断没有已证明的可启动回退镜像。
- loader 的 `Boot FW1/FW2` 字符串和双槽打包成功只证明潜在能力，不证明启动选择、XIP 映射和回滚。
- 当前应用仅 457776 bytes，两个 1.875 MiB 固件槽在应用容量层面可行，所以先攻克 A/B 引导链比更换 MCU 更合理；但整体分区仍未验收，必须先证明 `rootfs` 可从 4 MiB 缩到 2 MiB 且 `userfs` 能完整保留。
- 现有 XLS1 已有明确包率边界；按实测约 450-702 B/s 传输当前 457776-byte 固件，理论下限约 11-17 分钟，尚未计入帧开销、确认、重发和 Flash 停顿。它只能作为暂停 RTCM 的维护数据面；若实板能证明局部高速链路，再把控制面留在 XLS1、制品面迁移到该链路。

## Consequences

- 近期仍需串口烧录，但应减少为经过发布门禁的统一批次，并严格防止排针偏移。
- OTA 实现不是一个 App 按钮或单个命令，而是 bootloader、Flash HAL、签名供应链、RK3568 编排、节点状态机和掉电/回滚门禁的联合项目。
- 在 pilot 完成前，任何 `ota_prepare` 命令都只能返回 `unsupported`，不能返回 `acked/success`。

## Follow-up

- 详细证据、候选分区和验收矩阵见 `docs/integrations/firmware/rk2206-ota-readiness-audit-20260802.md`。
- 下一步只在备用板建立 FW1/FW2 手动启动和回滚最小闭环，不修改现场 A/B/C。
