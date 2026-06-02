# RK3568 Alarm Actuator

RK3568 端侧声光报警执行器。该服务只负责 YX75R Modbus RTU 控制：

- 默认串口：`/dev/ttyS7`
- 默认波特率：`9600`
- 默认地址：`01`
- 默认动作序列采用现场已验证能触发声音和爆闪的路径：先设置演示音量，再循环播放 FLASH 物理曲目 1，并让 D1 保持爆闪。
- 默认不强制 Modbus 回显校验阻断动作：`ALARM_REQUIRE_ECHO=false`
- 不打开 `/dev/ttyS3`，避免影响 XL01 field gateway

## Local dry-run

```bash
npm run build --workspace @lsmv2/rk3568-alarm-actuator
ALARM_DRY_RUN=true node services/rk3568-alarm-actuator/dist/index.js
```

## RK3568 real serial

RK3568 上需要已有 `python3` 和 `pyserial`：

```bash
cd /opt/landslide-monitoring-v2-mainline
npm run build --workspace @lsmv2/rk3568-alarm-actuator
ALARM_DRY_RUN=false ALARM_SERIAL_DEVICE=/dev/ttyS7 ALARM_DEMO_VOLUME=5 ALARM_REQUIRE_ECHO=false node services/rk3568-alarm-actuator/dist/index.js
```

API 服务通过 `RK3568_ALARM_ACTUATOR_URL=http://192.168.124.179:18087` 代理到本服务。

如需硬件验收，可临时设置 `ALARM_REQUIRE_ECHO=true`，动作成功会以 YX75R Modbus 写指令完整回显为准；演示默认不启用该阻断，避免现场设备已动作但回显读取异常时误判为未下发。

2026-05-11 现场复测结论：

- `0x300F 0x0101` 文件夹 `01/001` 播放在当前 YX75R FLASH 文件组织下只回显，不进入播放态。
- `0x3003 0x0001` 物理曲目 1 可进入播放态，但曲目很短，容易被现场听感误判为“没声音”。
- `0x3008 0x0001` 物理曲目 1 循环播放可稳定保持 `playback=正在播放`，同时 D1 一直爆闪；因此正式 `alarm_on` 默认使用该路径。
- `alarm_off` / `silence` 依次发送停止循环、停止播放、关闭 D1。
