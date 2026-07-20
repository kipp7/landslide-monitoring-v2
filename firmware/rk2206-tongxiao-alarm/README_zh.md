# 通晓 RK2206 Wi-Fi 应急告警终端

本固件把通晓套件作为山体滑坡平台的现场告警执行器，不采集传感器、不计算风险。OpenHarmony LiteOS-M 应用通过 Wi-Fi/MQTT 接收服务端 retained desired 状态，驱动蜂鸣器、振动马达、RGB 灯、板载独立报警灯和中文 ST7789V LCD，可选驱动 SU03-T 固定播报。

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

稳定构建始终保持语音关闭。仅在 SU03-T 已烧入“无开机播报、包含固定串口播放动作”的词库后，才能构建独立语音试验包：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/firmware/build-tongxiao-rk2206.ps1 `
  -FirmwareVersion 1.3.3-voice-motor-shed -EnableVoice -ConfirmNoActiveXl01Flash `
  -ArtifactDirectory <独立试验输出目录>
```

`-EnableVoice` 只临时修改 vendor 构建副本，结束后恢复源码默认的 `TONGXIAO_VOICE_ENABLED=0`，不得把语音试验镜像覆盖稳定版目录。

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

- LCD 使用套件 `landslide_monitor` Sample 的 UTF-8 中文字库。待机页显示“设备正常 / 风险等级正常”；告警页只显示结构化的监测点、等级、固定撤离建议和告警编号，不直接渲染可能缺字的服务端标题与信息。没有告警上下文时显示设备 ID、固件版本、告警指令序号和设备状态。WIFI、MQTT、UUID 等协议值保留 ASCII，固定标签尽可能使用中文。
- 告警页“监测”后的字符是触发告警的 `station_id`，用于定位固定监测点；“告警”后的字符是本次事件的 `alert_id`，触发、升级、确认和解除共用同一个生命周期 ID。两者都不是传感器测量值，超过 20 个字符时只显示前后各 8 个字符。
- 套件的 16 号与 24 号点阵字库字符集合不同，16 号缺少多项告警常用字。v1.2.1 起所有中文标签、状态和值统一使用 24 号字，避免同一行大小失衡和按字号缺字；动态服务端文本遇到 24 号字库未收录字符时显示 `?`，不再静默留空。
- v1.2.2 起底部 `WIFI/MQTT` 标签与对应的“正常/关闭”统一使用 24 号字和同一基线，避免英文协议名与中文状态大小不一致。
- v1.2.3 起“设备/状态/WIFI”使用同一标签列和值列；`FW/REV` 改为“固件/指令”，并补充套件字库缺少的固定 24 号点阵字。告警详情改为固定的“监测/等级/建议/告警”四行，不再把服务端自由文本中的缺字显示成连续问号。网络连接变化只刷新对应状态字块，页面模式或告警内容变化时才整屏刷新。
- v1.2.4 起 MQTT 连接短暂中断时保留 Wi-Fi 关联并优先单独重连 MQTT；只有连续 3 次 MQTT 连接失败才重置 Wi-Fi，避免一次 socket 抖动导致整套无线连接和 LCD 状态反复切换。
- v1.2.5 起所有页面顶部的“标签 + 状态值”均按实际文字宽度整组居中，不再使用只适配某个词长的固定横坐标；待机、自检、高风险、严重风险、静音和解除页面统一以屏幕中心线 `x=160` 对齐。
- v1.2.6 起联动板载 `GPIO0_PA5` 独立报警灯：高风险、严重风险、本地消音和自检时随告警节奏闪烁，服务端静音时常亮，正常和解除状态熄灭。报警灯上电初始化后立即拉低，不产生启动误闪。
- 蜂鸣器保持套件验证过的 `2 kHz / 50%` PWM。每个告警脉冲先让蜂鸣器起音 `100 ms`，再启动马达并保持二者共同工作，减轻马达启动电流导致的蜂鸣器音头变小；若共同工作阶段仍明显变小，应检查 USB 电源和线缆压降。
- 四个方向键通过 ADC7（GPIO0_PC7）读取，并做 80 ms 防抖。
- `↑`：仅在 `idle` 状态执行 3 秒本地自检，联动蜂鸣器、马达、RGB 和独立报警灯，不播放语音。
- `↓`：立即停止本地自检并恢复服务端状态。
- `←`：在 `active` 状态本地消音，停止蜂鸣器、马达和后续语音重复，LCD、RGB 和独立报警灯仍保留风险告警。
- `→`：恢复当前 `active` 状态的蜂鸣器和马达；为防止突然发声，不自动恢复本轮语音重复。

按键操作不修改服务端 desired state。任何 revision 更高的新服务端状态都会清除本地消音和自检覆盖。

## SU03-T

RK2206 的 `Firmware.img` 不包含 SU03-T 词库。必须先按 `docs/integrations/tongxiao-alarm-terminal.md` 在智能公元平台单独生成并烧录 SU03-T 工程，关闭模块自身的上电、唤醒和未识别回复，并完成冷启动静音测试。通过后才能使用 `-EnableVoice` 构建独立 RK2206 语音试验固件。

语音试验配置使用板内 `EUART2_M1`（PB2/PB3）连接 SU03-T，115200/8N1。首次收到非 retained 的高风险告警发送 `AA 55 01 00 55 AA`，严重告警发送 `AA 55 02 00 55 AA`，解除时发送 `AA 55 04 00 55 AA`。上电、MQTT 重连和 retained 状态恢复均不发送播放帧，本地或服务端消音会停止后续重复播报。

`v1.3.1-voice-repeat` 起，高风险每 30 秒重复完整准备撤离词；严重告警首次完整播报后等待 25 秒，再每 15 秒重复精简撤离词，直到本地/服务端消音或解除。解除通知立即播放一次，之后每 12 秒再播放一次，总计 3 次。新 revision 会取消旧状态尚未完成的播报计划，上电、重连和 retained 恢复仍保持静默。

`v1.3.3-voice-motor-shed` 起，每次风险播报前只暂停启动电流较大的马达，蜂鸣器仍按原告警节奏发声，RGB 与独立报警灯也继续闪烁。准备撤离、完整紧急撤离和精简重复撤离的马达卸载窗口分别为 18 秒、24 秒和 8 秒，窗口结束后马达自动恢复；这既降低共享供电压降，也避免语音期间现场告警完全安静。MQTT 的 retained `reported` 状态改为在 desired 消息回调返回后发布，避免回调内嵌套 QoS 1 发布造成会话断开。

## SwanLinkOS 说明

SwanLinkOS 是软通基于 OpenHarmony 的行业发行版，但当前本地通晓 SDK 未包含 RK2206 对应 BSP 或 SwanLinkOS 构建目标。除非比赛方另行提供通晓 RK2206 专用镜像/SDK，否则本固件使用套件现成且可验证的 OpenHarmony LiteOS-M 基线，避免把商显、交通或 AI PC 发行版误当成 MCU 固件。
