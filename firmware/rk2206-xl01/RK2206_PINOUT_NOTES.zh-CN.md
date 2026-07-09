# 🔌 RK2206 v5.0 当前引脚配置（小凌派板）

## 📅 版本信息
- **版本**: v5.0 GPS数据清洁优化版
- **日期**: 2025-10-24
- **固件**: `E:\rk2206_GPS_CLEAN_v5.0.bin`

---

## 📍 **实际使用的引脚配置**

| 模块 | 接口类型 | 引脚 | GPIO | I2C/UART地址 | 状态 |
|------|---------|------|------|--------------|------|
| **XL01无线** | UART2_M1 | PB2(RX), PB3(TX) | GPIO0_PB2/3 | 115200波特率 | ✅ 已测试 |
| **MPU6050加速度** | I2C0_M0 | PB4(SDA), PB5(SCL) | GPIO0_PB4/5 | 0x68 @ 100kHz | ✅ 已测试 |
| **GPS定位** | UART0_M0 | PB6(TX), PB7(RX) | GPIO0_PB6/7 | 9600波特率 | ✅ 已测试 |
| **SHT30温湿度** | I2C0_M0 | PB4(SDA), PB5(SCL) | GPIO0_PB4/5 | 0x44 @ 100kHz | ⚠️ 未启用 |

---

## 🎯 **详细接线图**

### 1️⃣ XL01 无线通信模块
```
小凌派RK2206              XL01模块
┌─────────┐             ┌──────┐
│ PB3(TX) ├─────────────┤ RX   │  (白线) - 交叉连接
│ PB2(RX) ├─────────────┤ TX   │  (绿线) - 交叉连接
│ 3.3V    ├─────────────┤ VCC  │  (红线)
│ GND     ├─────────────┤ GND  │  (黑线)
└─────────┘             └──────┘
               天线 → 必须连接！
```
**代码配置**:
```c
#define XL01_UART_ID    EUART2_M1
#define XL01_BAUDRATE   115200
```

---

### 2️⃣ MPU6050 加速度/陀螺仪传感器
```
小凌派RK2206              MPU6050
┌─────────┐             ┌──────┐
│ PB4(SDA)├─────────────┤ SDA  │  - I2C数据线
│ PB5(SCL)├─────────────┤ SCL  │  - I2C时钟线
│ 3.3V    ├─────────────┤ VCC  │  
│ GND     ├─────┬───────┤ GND  │
└─────────┘     └───────┤ AD0  │  ← AD0接GND (地址0x68)
                        └──────┘
```
**代码配置**:
```c
#define I2C_IDX             EI2C0_M0    // PB4/PB5
#define I2C_BAUDRATE        EI2C_FRE_100K
#define MPU6050_I2C_ADDR    0x68
```
**注意**: AD0引脚必须接GND，设置地址为0x68

---

### 3️⃣ GPS 定位模块 (ATGM336H)
```
小凌派RK2206              GPS模块
┌─────────┐             ┌──────┐
│ PB7(RX) ├─────────────┤ TX   │  (橙色) - 交叉连接
│ PB6(TX) ├─────────────┤ RX   │  (白色) - 交叉连接
│ 3.3V    ├─────────────┤ VCC  │  (红色)
│ GND     ├─────────────┤ GND  │  (黑色)
└─────────┘             └──────┘
              天线 → 放室外定位！
```
**代码配置**:
```c
#define GPS_UART_ID     EUART0_M0   // PB6/PB7 (板子标注的UART口)
#define GPS_BAUDRATE    9600
```
**板子标注**: PB6/PB7在小凌派上标注为 **UART_TX / UART_RX**

---

### 4️⃣ SHT30 温湿度传感器 (共享I2C总线)
```
小凌派RK2206              SHT30
┌─────────┐             ┌──────┐
│ PB4(SDA)├─────────────┤ SDA  │  - 与MPU6050共享
│ PB5(SCL)├─────────────┤ SCL  │  - 与MPU6050共享
│ 3.3V    ├─────────────┤ VCC  │  
│ GND     ├─────┬───────┤ GND  │
└─────────┘     └───────┤ ADDR │  ← ADDR接GND (地址0x44)
                        └──────┘
```
**代码配置**:
```c
#define I2C_IDX             EI2C0_M0    // 与MPU6050共享
#define SHT30_I2C_ADDR      0x44
#define ENABLE_SHT30        0           // 当前未启用
```

---

## ⚙️ **当前系统配置 (app_config.h)**

```c
// 节点配置
#define NODE_ID             "A"

// 上传配置
#define UPLOAD_INTERVAL_MS  5000        // 5秒上传一次
#define MAX_RETRY_COUNT     3
#define ENABLE_ACK_CHECK    1

// 传感器启用状态
#define ENABLE_GPS          1           // ✓ 已启用
#define ENABLE_MPU6050      1           // ✓ 已启用
#define ENABLE_SHT30        0           // ✗ 未启用
#define ENABLE_VIRTUAL      0           // ✗ 禁用虚拟数据

// 看门狗
#define ENABLE_WATCHDOG     1
#define WATCHDOG_TIMEOUT    10          // 10秒
```

---

## 🔧 **引脚复用说明**

### I2C总线共享
- **PB4/PB5** 作为I2C0_M0总线，可同时连接：
  - MPU6050 (地址 0x68)
  - SHT30 (地址 0x44)
  - 两者地址不同，不会冲突 ✅

### UART引脚
- **PB2/PB3**: UART2_M1 → XL01通信
- **PB6/PB7**: UART0_M0 → GPS接收（板子标注口）

---

## ✅ **测试状态**

| 功能 | 状态 | 备注 |
|------|------|------|
| XL01发送数据 | ✅ | 透传模式正常 |
| MPU6050读取 | ✅ | 加速度/陀螺仪数据正常 |
| GPS定位 | ✅ | GNRMC/GNGGA解析成功 |
| 倾角计算 | ✅ | 基于MPU6050计算 |
| 数据上传 | ⚠️ | 中心节点未收到ACK |

---

## 📋 **串口输出示例**

```
[OK] XL01 initialized (Baudrate: 115200)
[GPS] Initializing UART0 (Baudrate: 9600)...
[OK] GPS initialized with NMEA parsing
[OK] I2C initialized
[OK] MPU6050 initialized successfully!

📡 GPS: $GNRMC,065453.000,A,2240.89491,N,11011.72413,E...
✓✓✓ GPS定位成功(RMC): 纬度=22.681582° 经度=110.195402° ✓✓✓

[SEND #3] 228 bytes ✗ FAILED ⚠️ WARNING!
  Temp:0.0°C Humi:0.0% Tilt:61.13°/15.61° GPS:(22.681581,110.195404) Bat:0%
```

---

## 🚨 **已知问题**

1. **GPS数据偶尔混乱** - v5.0已优化UART缓冲逻辑，过滤乱码
2. **中心节点不返回ACK** - 需检查中心节点配置或改为单向传输
3. **SHT30未启用** - 温湿度数据显示0.0

---

## 📦 **备份文件列表**

1. **固件**: `E:\rk2206_GPS_CLEAN_v5.0.bin`
2. **说明**: `E:\GPS_CLEAN_v5说明.txt`
3. **引脚配置**: `E:\RK2206_v5.0_引脚配置.md` (本文件)
4. **版本记录**: `VERSION.txt` (项目目录)

---

**更新时间**: 2025-10-24
**作者**: AI Assistant + User

