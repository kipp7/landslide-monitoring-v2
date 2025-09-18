/*
 * Copyright (c) 2024 iSoftStone Education Co., Ltd.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#ifndef __LCD_DISPLAY_H__
#define __LCD_DISPLAY_H__

#include <stdint.h>
#include <stdbool.h>
#include "landslide_monitor.h"

#ifdef __cplusplus
extern "C" {
#endif

// 颜色定义现在通过lcd.h提供，不需要重复定义

// LCD尺寸 - 使用智能家居的320x240配置（横屏模式）
#define LCD_W           320
#define LCD_H           240

// 函数声明

// LCD基础功能
int LCD_Init(void);
void LCD_Deinit(void);
void LCD_Clear(uint16_t color);
void LCD_ShowString(uint16_t x, uint16_t y, const char *str, uint16_t fc, uint16_t bc, uint8_t sizey);
bool LCD_IsInitialized(void);

// 山体滑坡监测显示功能
void LCD_DisplayRealTimeData(const SensorData *data);
void LCD_DisplayRiskStatus(const RiskAssessment *assessment);
void LCD_DisplayTrendChart(const RiskAssessment *assessment);
void LCD_DisplaySystemInfo(const SystemStats *stats);

// 局部刷新功能 - 实时数据模式
void LCD_InitStaticLayout(void);
void LCD_UpdateDataOnly(const SensorData *data);
void LCD_UpdateStatusOnly(const SensorData *data);

// 局部刷新功能 - 风险状态模式
void LCD_InitRiskStatusLayout(void);
void LCD_UpdateRiskStatusData(const RiskAssessment *assessment);

// 局部刷新功能 - 趋势图模式
void LCD_InitTrendChartLayout(void);
void LCD_UpdateTrendChartData(const RiskAssessment *assessment);

// 显示模式切换
void LCD_SwitchMode(LcdDisplayMode mode);

// 状态检查
bool LCD_IsInitialized(void);

#ifdef __cplusplus
}
#endif

#endif // __LCD_DISPLAY_H__
