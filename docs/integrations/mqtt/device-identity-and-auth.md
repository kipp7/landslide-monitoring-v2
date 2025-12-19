# 设备身份与鉴权（无硬件唯一 ID 场景）

前提：设备端无法可靠读取芯片唯一 ID / MAC，因此身份完全由“烧录/出厂写入”提供。

## 1. 设备身份包（烧录写入）

设备 Flash/NVS 中存储一份 `device_identity`（建议二进制或 JSON，需断电安全写入）：

- `schema_version`：版本号（例如 1）
- `device_id`：UUID/ULID（系统主键，必须全局唯一）
- `device_secret`：随机 32 字节（Base64/Hex）
- `cred_version`：凭据版本（整数，v1 可固定为 1，为未来轮换预留）
- `crc32`：校验（防断电写坏）

## 2. 断电安全存储（双槽 A/B）

调试阶段频繁断电是常态，必须避免“写一半把凭据写坏导致设备失联”：

- 预留两块存储区：`slotA`、`slotB`
- 写入步骤（原子提交）：
  1) 写入非当前槽位（例如写 B）
  2) 写完后写 `crc32`
  3) 最后写入 `commit` 标记（或把 `magic` 放最后写）
- 启动时读取 A/B：
  - 校验 CRC，选 `cred_version` 最大且有效的一份作为当前身份

## 3. MQTT 鉴权（推荐：username/password）

最小可用方案（v1）：

- MQTT `username = device_id`
- MQTT `password = device_secret`

服务端原则：

- 服务端数据库只存 `device_secret_hash`（例如 `argon2`/`bcrypt` hash），不存明文 secret
- EMQX 通过 HTTP Auth 回调到后端鉴权接口（或内置认证插件），校验用户名/密码是否匹配、设备状态是否为 `active`
  - 当前实现：拒绝 `revoked`；允许 `inactive/active`，并在设备首次成功鉴权连接时将状态从 `inactive` 提升为 `active`（同时更新 `last_seen_at`）。

## 4. ACL（访问控制）

- 设备只能发布自己的上报 topic：`telemetry/{device_id}`
- 设备只能订阅自己的命令 topic：`cmd/{device_id}`
- 禁止设备发布/订阅通配符越权 topic（`telemetry/+`、`#` 等）

## 5. 设备注册与激活（推荐流程）

### v1 简化流程（适合学生项目）

- 管理端创建设备记录：生成 `device_id` 与 `device_secret`，导出为“烧录配置文件/二维码”
- 烧录写入 `device_identity`
- 设备上线 MQTT 即视为激活（第一次上报时更新 `last_seen_at`）

### v1.1 可选升级（更工程化）

- 追加 `bootstrap_token`（一次性注册 token）
- 设备首次上线通过 `provision/{device_id}` 完成激活后再允许上报

## 6. 密钥轮换（预留，不强制 v1 实现）

轮换目标：密钥泄露后能恢复，而不是必须全量重刷固件。

可行策略：

- v1 只做“吊销”（server 端标记 `revoked`，拒绝连接）
- v1.1 做“轮换”：
  - 后端生成新 secret，通过命令下发（加密包更好），设备写入双槽并回执确认
