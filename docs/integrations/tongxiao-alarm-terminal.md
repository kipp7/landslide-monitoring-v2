# 通晓 RK2206 现场告警终端契约

## 定位

通晓板替代原型中的 YX75R 大型声光报警器，作为只负责执行的 Wi-Fi 现场终端。它不连接滑坡传感器、不计算风险，也不直接连接 HarmonyOS App。服务端是风险状态唯一真源。

终端通过 MQTT 接收期望状态，并联动蜂鸣器、振动马达、RGB 灯、LCD，以及可选的 SU03-T 固定语音。原有平台继续调用兼容的 HTTP 执行器接口，由 `services/tongxiao-alarm-bridge` 转为 MQTT。

## MQTT 主题

- 期望状态：`alarm/desired/{device_id}`，平台到设备，QoS 1，retain=true
- 回报状态：`alarm/reported/{device_id}`，设备到平台，QoS 1，retain=true
- 在线状态：`presence/{device_id}`，设备到平台，QoS 1，retain=true，并配置离线遗嘱。桥接服务以本地收到 presence 的时间为准，默认 90 秒未收到新事件就判定离线，不会永久信任旧的 retained `online`。

设备只应用 `revision` 严格大于最后已应用值的消息。相同或更旧的消息必须忽略，防止 MQTT 重投和乱序导致再次播报或恢复旧告警。

## 鉴权与建档

- 通晓板使用设备身份：MQTT 用户名为 `device_id`，密码为 `POST /api/v1/devices` 仅返回一次的 `deviceSecret`。
- 创建设备时固定 `deviceId=00000000-0000-4000-8000-000000022206`、`deviceType=alarm_terminal`，确保与桥接服务和固件配置一致。
- 通晓板只允许订阅自己的 `alarm/desired/{device_id}`，只允许发布自己的 `alarm/reported/{device_id}` 与 `presence/{device_id}`。
- 桥接服务使用内部服务账号 `MQTT_INTERNAL_USERNAME/MQTT_INTERNAL_PASSWORD`；开启 EMQX HTTP 鉴权时密码必须非空，并与 API 配置一致。
- `deviceSecret` 不得提交到仓库或输出到日志，只写入比赛现场使用的烧录配置副本。

生产 MQTT 地址、Wi-Fi SSID 和 Wi-Fi 密码均属于现场配置，不提交到公开仓库。在本机执行 `scripts/firmware/provision-tongxiao-production.ps1 -Server <production-host> -WifiSsid <wifi-ssid> -WifiPassword <wifi-password>` 完成线上建档；脚本把一次性密钥和网络值保存到 Git 忽略的 `.tmp/tongxiao-alarm.credentials.env`，随后由通晓构建脚本临时注入，源码和构建日志均不保留密钥明文。

## 输出矩阵

| 期望状态 | 风险 | 蜂鸣器与马达 | RGB | LCD | 固定语音 |
| --- | --- | --- | --- | --- | --- |
| `idle` | `normal` | 关闭 | 关闭 | 待机/已解除 | 可选单次 `ALL_CLEAR_01` |
| `active` | `high` | 同步间歇启动 | 红色闪烁 | 高风险、站点、告警编号 | `PREPARE_01` |
| `active` | `critical` | 同步快速间歇启动 | 红色快速闪烁 | 严重风险、立即撤离 | `EVACUATE_01`，之后可用 `EVACUATE_REPEAT_01` |
| `silenced` | 保留原等级 | 关闭 | 琥珀色常亮 | 已静音、等待复核 | 关闭 |

板端屏幕只显示终端和服务端提供的风险信息，不伪造传感器数值。

## 固定播报词

| phrase_id | SU03-T 串口输入触发帧（HEX） | 播报内容 |
| --- | --- | --- |
| `PREPARE_01` | `AA 55 01 00 55 AA` | 请注意，当前监测区域风险升高。请立即远离边坡、挡墙和沟谷区域，做好撤离准备，听从现场工作人员指挥。 |
| `EVACUATE_01` | `AA 55 02 00 55 AA` | 紧急通知，当前区域存在滑坡危险。请立即沿指定疏散路线前往应急安置点，不要停留，不要返回取物，请照顾老人和儿童有序撤离。 |
| `EVACUATE_REPEAT_01` | `AA 55 03 00 55 AA` | 滑坡危险，请立即撤离。滑坡危险，请立即撤离。 |
| `ALL_CLEAR_01` | `AA 55 04 00 55 AA` | 现场警报已经解除，请继续服从工作人员安排，未经允许不要进入危险区域。 |
| `SELF_TEST_01` | `AA 55 05 00 55 AA` | 设备测试，请勿惊慌。设备测试，请勿惊慌。 |

不支持服务端下发任意 TTS 文本，避免内容注入、误播和 SU03-T 词库不一致。

### SU03-T 词库生成与烧录

SU03-T 是独立语音芯片，不能用 RKDevTool 或 RK2206 的 `Firmware.img` 烧录。处理步骤如下：

1. 在[智能公元 AI 产品零代码平台](https://www.smartpi.cn/#/)新建“AI 语音音响 / 纯离线方案 / SU03-T”产品。
2. 保留 1、2 脚为 `SW_CLK`、`SW_D`，它们是语音模块烧录接口；不要改成普通 GPIO。将 21、22 脚设为 `UART1_TX`、`UART1_RX`，串口设为 115200、8 数据位、1 停止位、无校验，接收格式选择固定格式。
3. 删除模板中的欢迎语、上电播报、唤醒回复、退出唤醒回复、未识别回复及其它自动回复。模块可以保留唤醒识别能力，但唤醒本身必须无回复、无端口输出。
4. 新增上表 5 个“串口输入”行为，输入帧必须逐字节匹配表中 HEX，回复语必须使用表中固定文本。不得添加开机自动执行、定时器自动执行或命令词触发。
5. 在平台完成语法检查并生成 SU03-T 固件包。使用智能公元/启英泰伦适配 SU03-T 的官方烧录器，通过板载语音模块的 `SW_CLK`、`SW_D` 下载口烧录；普通 USB-TTL 接到 UART1_TX/RX 只能测试触发帧，不能替代词库烧录器。接线与供电电压必须以烧录器和通晓板硬件手册为准，禁止凭 RK2206 UART 引脚猜测。
6. 断开 RK2206 UART 触发，连续进行至少 5 次完全断电冷启动；每次都必须无欢迎语、无唤醒回复。再用 USB-TTL 以 115200 8N1 分别发送 5 条 HEX 帧，逐条核对播报文本。
7. 上述检查通过后，把 `TONGXIAO_VOICE_ENABLED` 从 `0` 改为 `1`，重新构建并烧录 RK2206 固件，最后复测“上电静音、风险时播报、retained 重连不重复播报”。

如果现场没有 SU03-T 官方烧录器，保持 `TONGXIAO_VOICE_ENABLED=0`，并使用板载 K7/语音供电开关关闭模块供电；蜂鸣器、马达、RGB 和 LCD 不受影响。

## 本地按键

通晓板的四个方向键共用 ADC7（GPIO0_PC7），不作为服务端风险状态的真源：

| 按键 | 本地动作 | 安全限制 |
| --- | --- | --- |
| `↑` | 3 秒蜂鸣器、马达、RGB 自检 | 只允许在 `idle` 执行，不播放语音 |
| `↓` | 提前停止自检 | 恢复最后一次服务端 desired state |
| `←` | 本地消音 | 只关闭蜂鸣器、马达和后续语音重复，LCD/RGB 继续显示风险 |
| `→` | 恢复告警输出 | 恢复蜂鸣器和马达，不突然补播语音 |

新 revision 的服务端 desired state 会清除本地覆盖，确保现场终端不会永久偏离平台状态。

## 开机静音硬约束

1. 通晓主固件上电后第一件事是停止蜂鸣器、马达和 RGB，不调用任何语音播放函数。
2. `TONGXIAO_VOICE_ENABLED` 默认值必须为 `0`。
3. SU03-T 工程必须重新生成：关闭上电播报、欢迎语、唤醒回复和未识别回复，只保留上表 5 个串口触发词。
4. 完成断电重启实测前不得把 `TONGXIAO_VOICE_ENABLED` 改为 `1`。
5. 如果无法确认 SU03-T 模块自身上电静音，量产/比赛固件必须禁用语音并断开或关闭语音模块供电；蜂鸣器、马达和 RGB 告警不受影响。

## 失联行为

- 设备重连后订阅 retained desired 状态并恢复服务端当前期望状态。
- 短时 Wi-Fi/MQTT 断开不改变已应用的风险状态，LCD 显示网络断开。
- 设备不得因为上电、重连或收到旧 revision 自行发声。
- `/silence` 只静音并保留风险信息；`/alarm_off` 才回到正常状态并允许单次解除播报。
