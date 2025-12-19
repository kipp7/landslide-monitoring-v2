# Firmware Simulator (single-host dev/e2e)

目的：提供一个“可运行”的固件侧 MQTT 行为参考，实现：

- 遥测上报：`telemetry/{device_id}`（TelemetryEnvelope v1）
- 命令接收：`cmd/{device_id}`（DeviceCommand v1）
- 命令回执：`cmd_ack/{device_id}`（DeviceCommandAck v1）
- **Schema 校验**：使用 `docs/integrations/mqtt/schemas/*.schema.json` 验证发送/接收 payload
- **断电安全**：持久化 `seq` 与 `set_config` 的配置（写入 state 文件，原子写入）
- **重连退避**：指数退避 + jitter（避免断网时疯狂重连）

脚本位置：`scripts/dev/firmware-sim.js`

## 快速开始（PowerShell）

```powershell
node scripts/dev/firmware-sim.js `
  --mqtt mqtt://localhost:1883 `
  --device <deviceId> `
  --username <deviceId> `
  --password <deviceSecret> `
  --stateFile backups/firmware-sim/<deviceId>.json `
  --telemetryIntervalMs 2000
```

说明：

- `--username/--password` 应使用设备的 `deviceId/deviceSecret`（参见 `device-identity-and-auth.md`）。
- `--stateFile` 建议放在 `backups/` 下（已被 `.gitignore` 忽略），便于模拟断电后 seq/config 续写。

## 支持的最小命令集

- `ping`：回 `acked`，`result.pong=true`
- `set_config`：回 `acked`，将 `payload` 合并进 state，并返回 `result.applied=true`
- `reboot`：回 `acked` 后主动断开连接，触发“重连退避”流程（模拟重启）

## e2e 集成

单机回归可以使用：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File infra/compose/scripts/e2e-smoke-test.ps1 -Stage5Regression
```

该模式会在 evidence bundle 中包含：

- `firmware-sim.stdout.log` / `firmware-sim.stderr.log`
- `firmware-sim.state.json`

