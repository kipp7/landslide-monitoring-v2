# 通晓 RK2206 Wi-Fi 应急告警终端

本固件把通晓套件作为山体滑坡平台的现场告警执行器，不采集传感器、不计算风险。OpenHarmony LiteOS-M 应用通过 Wi-Fi/MQTT 接收服务端 retained desired 状态，驱动蜂鸣器、振动马达、RGB 灯和中文 ST7789V LCD，可选驱动 SU03-T 固定播报。

## 当前部署参数

- Wi-Fi SSID、Wi-Fi 密码和 MQTT Broker 地址属于现场配置，不提交到 Git。
- 把三项值与设备密钥放进 Git 忽略的 `.tmp/tongxiao-alarm.credentials.env`，构建脚本只在编译期间注入 vendor 副本。
- 设备 ID：`00000000-0000-4000-8000-000000022206`
- 语音：默认编译关闭

设备凭证不提交到 Git。先执行 `scripts/firmware/provision-tongxiao-production.ps1 -Server <production-host> -WifiSsid <wifi-ssid> -WifiPassword <wifi-password>`，脚本通过 SSH 调用生产 API 创建设备，并把一次性密钥与网络值写入 Git 忽略的 `.tmp/tongxiao-alarm.credentials.env`；构建脚本只在编译期间把这些值注入 vendor 副本，结束后恢复空占位符源码。

## OpenHarmony 构建

主仓库中的本目录是源码真源。联调时同步到：

`vendor/isoftstone/rk2206/samples/rk2206_tongxiao_alarm`

XL01 主监测节点与通晓告警终端共用同一个 OpenHarmony vendor 树和 `out/rk2206/isoftstone-rk2206`，不得在 XL01 构建或烧录时手工切换 Sample。使用仓库脚本先做只读检查：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/provision-tongxiao-production.ps1
powershell -ExecutionPolicy Bypass -File scripts/firmware/build-tongxiao-rk2206.ps1 -CheckOnly
```

确认 XL01 已完全停止构建和烧录后，才显式执行：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/build-tongxiao-rk2206.ps1 -ConfirmNoActiveXl01Flash
```

脚本会校验主仓库与 vendor 源码哈希，拒绝与其他 `hb/ninja` 构建并发，暂存并在结束后恢复原有 XL01 `out`，把通晓产物单独保存为：

- `artifacts/firmware/rk2206-tongxiao-alarm/Firmware-tongxiao-alarm-rk2206.img`
- `artifacts/firmware/rk2206-tongxiao-alarm/liteos-tongxiao-alarm-rk2206.bin`
- `artifacts/firmware/rk2206-tongxiao-alarm/rk2206_db_loader.bin`

`artifacts/` 已被 Git 忽略。烧录通晓板时只使用带 `tongxiao-alarm` 名称的镜像，禁止根据共享目录里泛化的 `Firmware.img` 猜测固件角色。

脚本内部会在 `vendor/isoftstone/rk2206/samples/BUILD.gn` 的 `features` 中只启用：

```gn
"./rk2206_tongxiao_alarm:rk2206_tongxiao_alarm"
```

此 SDK 还在 `device/rockchip/rk2206/sdk_liteos/Makefile` 中硬编码了 Sample 静态库。脚本会在构建期间临时切换为 `-lrk2206_tongxiao_alarm`，执行 `hb build -f` 后恢复原始选择和共享输出；不要绕过脚本手工构建。同一次固件构建不能同时启用 XL01 Sample；XL01 监测节点和通晓告警终端是两块不同的 RK2206 设备，镜像不可混烧。

## MQTT 设备身份

开启 EMQX 鉴权前，使用 `POST /api/v1/devices` 创建固定 ID `00000000-0000-4000-8000-000000022206`、类型为 `alarm_terminal` 的设备。接口返回的 `deviceSecret` 只出现一次：把它写入本地/烧录副本的 `TONGXIAO_MQTT_PASSWORD`，不要提交到 Git，也不要输出到串口日志。板端 MQTT 用户名保持为同一个设备 ID。

桥接服务不使用设备密钥，而是使用 Compose 中与 API 一致的 `MQTT_INTERNAL_USERNAME` 和非空 `MQTT_INTERNAL_PASSWORD`。板端和桥接服务是两套身份，不能混用。

## 安全行为

- 上电先停止全部 PWM，语音驱动默认不初始化。
- retained desired 用于恢复声光/振动状态，但不触发语音。
- 只应用严格递增的 revision，重复消息不重复播报。
- `/silence` 后蜂鸣器和马达关闭、琥珀灯常亮、屏幕保留待复核。
- MQTT 断线不擅自改变服务端最后一次风险状态，只在 LCD 标记断线并自动重连。

## LCD 与按键

- LCD 使用套件 `landslide_monitor` Sample 的完整 UTF-8 中文字库。待机页只显示一致的“设备正常 / 风险等级正常”，不再把“准备告警”误写成第二个状态。告警时显示风险等级、撤离指令、标题、信息、监测点与告警编号；没有告警上下文时显示设备 ID、固件版本、告警 revision 和设备状态。Wi-Fi、MQTT、UUID 等协议值保留 ASCII，状态和值标签尽可能使用中文。
- 套件的 16 号与 24 号点阵字库字符集合不同，16 号缺少多项告警常用字。v1.2.1 起所有中文标签、状态和值统一使用 24 号字，避免同一行大小失衡和按字号缺字；动态服务端文本遇到 24 号字库未收录字符时显示 `?`，不再静默留空。
- v1.2.2 起底部 `WIFI/MQTT` 标签与对应的“正常/关闭”统一使用 24 号字和同一基线，避免英文协议名与中文状态大小不一致。
- 蜂鸣器保持套件验证过的 `2 kHz / 50%` PWM。每个告警脉冲先让蜂鸣器起音 `100 ms`，再启动马达并保持二者共同工作，减轻马达启动电流导致的蜂鸣器音头变小；若共同工作阶段仍明显变小，应检查 USB 电源和线缆压降。
- 四个方向键通过 ADC7（GPIO0_PC7）读取，并做 80 ms 防抖。
- `↑`：仅在 `idle` 状态执行 3 秒本地自检，联动蜂鸣器、马达和 RGB，不播放语音。
- `↓`：立即停止本地自检并恢复服务端状态。
- `←`：在 `active` 状态本地消音，停止蜂鸣器、马达和后续语音重复，LCD/RGB 仍保留风险告警。
- `→`：恢复当前 `active` 状态的蜂鸣器和马达；为防止突然发声，不自动恢复本轮语音重复。

按键操作不修改服务端 desired state。任何 revision 更高的新服务端状态都会清除本地消音和自检覆盖。

## SU03-T

RK2206 的 `Firmware.img` 不包含 SU03-T 词库。必须先按 `docs/integrations/tongxiao-alarm-terminal.md` 在智能公元平台单独生成并烧录 SU03-T 工程，关闭模块自身的上电、唤醒和未识别回复，并完成冷启动静音测试。通过后才能把 `TONGXIAO_VOICE_ENABLED` 改为 `1` 并重新构建 RK2206 固件。

## SwanLinkOS 说明

SwanLinkOS 是软通基于 OpenHarmony 的行业发行版，但当前本地通晓 SDK 未包含 RK2206 对应 BSP 或 SwanLinkOS 构建目标。除非比赛方另行提供通晓 RK2206 专用镜像/SDK，否则本固件使用套件现成且可验证的 OpenHarmony LiteOS-M 基线，避免把商显、交通或 AI PC 发行版误当成 MCU 固件。
