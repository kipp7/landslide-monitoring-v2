• 下面按你当前版本，从原理图到 PCB 的完整流程走。

  1. 电源输入

  新增电池接口：

  J_BAT
  1  VBAT_3S
  2  GND

  VBAT_3S 是 3S2P 电池原压：

  约 9V~12.6V

  2. 总电源开关

  你已经添加开关，按这个接：

  SW_PWR
  COM  -> VBAT_3S
  OUT  -> VBAT_SW
  NC   -> 不接
  固定脚 -> 不接，只做机械固定

  后面所有电源都从 VBAT_SW 走。

  3. 两个 MP1584 模块

  5V 模块：

  U_BUCK_5V
  IN+  -> VBAT_SW
  IN-  -> GND
  OUT+ -> 5V_SYS
  OUT- -> GND

  3.3V 模块：

  U_BUCK_3V3
  IN+  -> VBAT_SW
  IN-  -> GND
  OUT+ -> 3V3_SYS
  OUT- -> GND

  加测试点：

  TP_VBAT_SW
  TP_5V_SYS
  TP_3V3_SYS
  TP_GND

  4. RS485 传感器电源

  不用稳压 12V，直接用开关后的电池电压：

  VBAT_SENSOR = VBAT_SW

  端子：

  J_RS485_1
  1  VBAT_SENSOR
  2  GND
  3  RS4851_A
  4  RS4851_B
  5  SHIELD

  J_RS485_2
  1  VBAT_SENSOR
  2  GND
  3  RS4852_A
  4  RS4852_B
  5  SHIELD

  5. DL-XLS1

  按你已建好的封装和符号接：

  pin8   -> 3V3_SYS
  pin9   -> GND
  pin11  USR_RX <- DL_RX_FROM_MCU
  pin12  USR_TX -> DL_TX_TO_MCU
  pin10  KEY -> 按键到 GND，或测试点
  pin17  CMD_TX -> XLS1_CMD_TX 测试/配置口
  pin18  CMD_RX -> XLS1_CMD_RX 测试/配置口
  pin1   NC
  pin2~7 必须悬空
  pin13~16 UIO0~UIO3 可悬空或测试点

  对应 RK2206：

  DL-XLS1 pin12 USR_TX -> RK2206 PB2 / MCU_RX
  DL-XLS1 pin11 USR_RX <- RK2206 PB3 / MCU_TX

  建议加配置口：

  J_XLS1_CMD
  1  3V3_SYS
  2  GND
  3  XLS1_CMD_TX
  4  XLS1_CMD_RX

  6. GPS

  J_GPS
  1  5V_SYS
  2  GND
  3  GPS_TX_TO_MCU
  4  GPS_RX_FROM_MCU

  对应 RK2206：

  GPS_TX_TO_MCU -> PB6 / MCU_RX
  GPS_RX_FROM_MCU <- PB7 / MCU_TX

  7. SC16IS752 双串口扩展

  U_SC16IS752
  VCC   -> 3V3_SYS
  GND   -> GND
  SDA   -> I2C_SDA / PB4
  SCL   -> I2C_SCL / PB5
  A0    -> GND
  A1    -> GND
  RESET -> 3V3_SYS，经 10k 上拉
  IRQ   -> 测试点或 RK2206 空闲 GPIO

  I2C 上拉：

  R_SDA 4.7k：I2C_SDA -> 3V3_SYS
  R_SCL 4.7k：I2C_SCL -> 3V3_SYS

  串口 A：

  TXA -> RS485_1_DI
  RXA <- RS485_1_RO
  RTSA/GPIOA -> RS485_1_DE

  串口 B：

  TXB -> RS485_2_DI
  RXB <- RS485_2_RO
  RTSB/GPIOB -> RS485_2_DE

  8. 两路 RS485 收发器

  第 1 路：

  U_RS485_1
  VCC -> 3V3_SYS
  GND -> GND
  DI  <- RS485_1_DI
  RO  -> RS485_1_RO
  DE  <- RS485_1_DE
  /RE <- RS485_1_DE
  A   -> RS4851_A
  B   -> RS4851_B

  第 2 路：

  U_RS485_2
  VCC -> 3V3_SYS
  GND -> GND
  DI  <- RS485_2_DI
  RO  -> RS485_2_RO
  DE  <- RS485_2_DE
  /RE <- RS485_2_DE
  A   -> RS4852_A
  B   -> RS4852_B

  每路建议：

  SM712 TVS：A/B 到 GND
  120Ω 终端电阻：A 和 B 之间，最好用跳帽控制
  偏置电阻预留：A 上拉到 3V3_SYS，B 下拉到 GND
  测试点：A、B、GND

  9. 日志调试口

  保留：

  J_DEBUG
  1  3V3_SYS
  2  GND
  3  LOG_TX_TO_USB
  4  LOG_RX_FROM_USB

  对应：

  PC3 / MCU_TX -> LOG_TX_TO_USB
  PC2 / MCU_RX -> LOG_RX_FROM_USB

  10. 必删旧模块

  删除旧的：

  J_XL01 插针版
  J_SHT30
  J_MPU6050
  旧 SHT30/MPU6050 去耦电容
  旧 I2C 传感器标签

  保留 I2C 上拉，但改给 SC16IS752 用。

  11. PCB 布局顺序

  按这个顺序放：

  1. J_BAT、电源开关、两个 MP1584 放电源区
  2. RS485 两个端子放板边
  3. RS485 收发器和 SM712 靠近端子
  4. SC16IS752 靠近 RS485 收发器
  5. DL-XLS1 放板边，天线区域朝外，禁布铜
  6. GPS 接口远离 MP1584 和 DL-XLS1 天线
  7. RK2206 接口按机械位置放
  8. J_DEBUG 放边缘或测试点形式

  12. PCB 关键规则

  DL-XLS1 天线区域不要铺铜、不要走线、不要放金属件
  MP1584 远离 GPS 和 DL-XLS1
  RS485 A/B 差分线尽量并行、靠近端子加 TVS
  VBAT_SENSOR 线宽加粗
  5V_SYS、3V3_SYS 线宽不要太细
  GND 尽量整面铺铜
  开关和端子机械件周围留空间

  13. 下板前检查

  ERC/DRC 后人工检查：

  VBAT_3S 没有直接短到 GND
  5V_SYS 没有短到 3V3_SYS
  DL-XLS1 pin8 是 3V3，不是 5V
  DL-XLS1 pin9 是 GND
  DL-XLS1 pin11/12 UART 交叉正确
  pin2~7 悬空
  SC16IS752 是 3V3 供电
  RS485 芯片是 3V3 供电
  RS485 端子电源是 VBAT_SENSOR，不是 5V_SYS
  MP1584 方向 IN/OUT 没反
  开关 OFF 时后级 VBAT_SW 断开

  14. 第一次上电顺序

  1. 不插传感器，不插 RK2206，只上电池
  2. 测 VBAT_SW
  3. 测 5V_SYS = 5.00V
  4. 测 3V3_SYS = 3.30V
  5. 再焊/插 DL-XLS1、SC16IS752、RS485 芯片
  6. 最后接 GPS 和 RS485 传感器

  下一步你把当前原理图截图发我，优先看：电源开关、MP1584、DL-XLS1、SC16IS752、RS485 这五块。