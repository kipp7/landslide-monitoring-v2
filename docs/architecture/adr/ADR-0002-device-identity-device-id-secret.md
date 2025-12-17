# ADR-0002: 设备身份采用 device_id + device_secret（无硬件唯一 ID）

## Status

- Status: Accepted
- Date: 2025-12-16

## Context

- 设备端无法稳定读取芯片唯一 ID（或读不到），因此不能依赖硬件唯一 ID 做身份根。
- 设备可能频繁断电，身份信息必须断电后可恢复，且写入过程需抗断电（避免写坏）。
- 系统需要最小可用的鉴权能力，能防止“伪造设备上报”，并支持吊销/未来轮换。
- 目标是单机部署，不引入复杂 PKI 体系作为 v1 强制项，但需可升级。

## Options Considered

1) 依赖硬件唯一 ID（不可行）  
- 优点：天然唯一  
- 缺点：当前硬件/固件条件下不可用或不可靠  

2) 后台发放 device_id，设备每次启动通过网络拉取凭据  
- 优点：凭据可随时更新  
- 缺点：设备首次上线前无法鉴权；断网/平台不可用时设备无法工作  

3) 烧录写入 device_id + secret（选定）  
- 优点：离线可用；断电后可恢复；实现简单；可与 MQTT username/password 配合  
- 缺点：secret 需要保护与可轮换（后续实现）；烧录流程必须确保唯一性与安全  

4) mTLS 证书（未来升级）  
- 优点：安全性高  
- 缺点：证书管理/烧录复杂度高，不适合作为 v1 强制  

## Decision

- v1 身份采用 `device_id (UUID) + device_secret (随机 32 bytes)`，由烧录/出厂写入。
- MQTT 鉴权：username = device_id，password = secret（或基于 secret 生成签名）。
- 服务端只存 secret 的 hash；支持 `revoked`（吊销）。
- 断电安全写入采用双槽 A/B + CRC（作为设备端实现规范）。

升级路径（非 v1 强制）：

- v1.1 支持 secret 轮换（命令下发 + 回执）
- v2 可引入 mTLS（证书）

## Consequences

- Positive
  - 不依赖硬件唯一 ID，适配当前现实约束
  - 断电后仍能稳定上线与上报
- Negative / Risks
  - secret 泄露风险：需要后续轮换/吊销策略与日志审计
  - 烧录流程必须严格避免 device_id 冲突
- Follow-ups
  - 在 `integrations/mqtt` 固化身份包格式与 ACL
  - 在 `features/` 增加“设备注册与身份发放”PRD

