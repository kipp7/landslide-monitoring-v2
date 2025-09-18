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

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include "lcd_display.h"
#include "lcd.h"       // 智能家居的LCD驱动头文件（已包含字库）
#include "landslide_monitor.h"  // 添加以使用RiskAssessment和GetLatestRiskAssessment
#include "iot_spi.h"
#include "iot_gpio.h"
#include "iot_errno.h"
#include "los_task.h"

// LCD驱动函数现在通过lcd.h头文件引入，不需要重复声明

// 静态变量
static bool g_lcd_initialized = false;
static LcdDisplayMode g_current_mode = LCD_MODE_REALTIME;
bool g_static_layout_initialized = false;  // 非静态，供外部访问

/**
 * @brief 初始化LCD
 * @return 0: 成功, 其他: 失败
 */
int LCD_Init(void)
{
    int ret;
    
    printf("Initializing LCD display...\n");
    
    ret = lcd_init();
    if (ret != 0) {
        printf("Failed to initialize LCD: %d\n", ret);
        return -1;
    }
    
    // 清屏为白色
    LCD_Clear(LCD_WHITE);
    
    // 简单的启动画面测试
    LCD_Clear(LCD_WHITE);
    LCD_ShowString(50, 100, "LCD Test OK", LCD_RED, LCD_WHITE, 24);

    LOS_Msleep(2000);  // 显示2秒启动画面

    // 强制重置静态布局标志，确保新布局被应用
    g_static_layout_initialized = false;

    g_lcd_initialized = true;
    printf("LCD display initialized successfully\n");
    
    return 0;
}

/**
 * @brief 反初始化LCD
 */
void LCD_Deinit(void)
{
    if (g_lcd_initialized) {
        lcd_deinit();
        g_lcd_initialized = false;
        g_static_layout_initialized = false;
        printf("LCD display deinitialized\n");
    }
}



/**
 * @brief 清屏
 * @param color 背景颜色
 */
void LCD_Clear(uint16_t color)
{
    printf("LCD_Clear: color=0x%04X, initialized=%d\n", color, g_lcd_initialized);
    if (g_lcd_initialized) {
        printf("LCD_Clear: Filling screen %dx%d with color 0x%04X\n", LCD_W, LCD_H, color);
        lcd_fill(0, 0, LCD_W, LCD_H, color);
        printf("LCD_Clear: Fill completed\n");
    }
}

/**
 * @brief 显示字符串
 */
void LCD_ShowString(uint16_t x, uint16_t y, const char *str, uint16_t fc, uint16_t bc, uint8_t sizey)
{
    printf("LCD_ShowString: x=%d, y=%d, text='%s', initialized=%d\n", x, y, str ? str : "NULL", g_lcd_initialized);
    if (g_lcd_initialized && str != NULL) {
        lcd_show_string(x, y, (const uint8_t *)str, fc, bc, sizey, 0);
    }
}

/**
 * @brief 显示实时数据界面
 * @param data 传感器数据
 */
void LCD_DisplayRealTimeData(const SensorData *data)
{
    if (!g_lcd_initialized || data == NULL || !data->data_valid) {
        return;
    }

    // 使用原来的中文静态布局初始化
    if (!g_static_layout_initialized) {
        LCD_InitStaticLayout();
        g_static_layout_initialized = true;
    }

    // 只更新数据数值，保持原来的中文布局
    LCD_UpdateDataOnly(data);
}

/**
 * @brief 初始化风险评估模式的静态布局 - 专业决策支持界面
 */
void LCD_InitRiskStatusLayout(void)
{
    if (!g_lcd_initialized) {
        return;
    }

    // 不需要清屏，主程序已经清屏了

    // 标题 - 使用32x32中文字体
    lcd_show_chinese(96, 0, (uint8_t *)"风险评估", LCD_RED, LCD_WHITE, 32, 0);
    lcd_draw_line(0, 33, LCD_W, 33, LCD_BLACK);

    // 主要风险状态显示区域（大字体，醒目）
    lcd_show_chinese(5, 40, (uint8_t *)"当前状态", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(101, 40, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    // 风险等级（用大字体突出显示）
    lcd_show_chinese(5, 70, (uint8_t *)"风险等级", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(101, 70, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    // 分割线
    lcd_draw_line(0, 105, LCD_W, 105, LCD_BLACK);

    // 关键指标区域（24x24字体）
    lcd_show_chinese(5, 110, (uint8_t *)"关键指标", LCD_RED, LCD_WHITE, 24, 0);

    // 最高风险因子
    lcd_show_chinese(5, 135, (uint8_t *)"主要风险", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(85, 135, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);

    // 风险值
    lcd_show_chinese(5, 155, (uint8_t *)"风险数值", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(85, 155, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);

    // 置信度
    lcd_show_chinese(5, 175, (uint8_t *)"置信程度", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(85, 175, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);

    // 建议行动
    lcd_show_chinese(5, 195, (uint8_t *)"建议行动", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(85, 195, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);

    printf("LCD risk assessment layout initialized\n");
}

/**
 * @brief 更新风险评估模式的动态数据 - 专业决策支持
 * @param assessment 风险评估结果
 */
void LCD_UpdateRiskStatusData(const RiskAssessment *assessment)
{
    if (!g_lcd_initialized || assessment == NULL) {
        return;
    }

    char data_str[64];
    uint16_t status_color;

    // 1. 当前状态（只在状态变化时更新，避免闪烁）
    static RiskLevel last_status_level = -1;
    if (assessment->level != last_status_level) {
        lcd_fill(109, 40, 200, 24, LCD_WHITE);
        switch (assessment->level) {
            case RISK_LEVEL_SAFE:
                lcd_show_chinese(109, 40, (uint8_t *)"正常", LCD_GREEN, LCD_WHITE, 24, 0);
                status_color = LCD_GREEN;
                break;
            case RISK_LEVEL_LOW:
                lcd_show_chinese(109, 40, (uint8_t *)"注意", LCD_YELLOW, LCD_WHITE, 24, 0);
                status_color = LCD_YELLOW;
                break;
            case RISK_LEVEL_MEDIUM:
                lcd_show_chinese(109, 40, (uint8_t *)"警告", LCD_ORANGE, LCD_WHITE, 24, 0);
                status_color = LCD_ORANGE;
                break;
            case RISK_LEVEL_HIGH:
                lcd_show_chinese(109, 40, (uint8_t *)"危险", LCD_RED, LCD_WHITE, 24, 0);
                status_color = LCD_RED;
                break;
            case RISK_LEVEL_CRITICAL:
                lcd_show_chinese(109, 40, (uint8_t *)"紧急", LCD_RED, LCD_WHITE, 24, 0);
                status_color = LCD_RED;
                break;
            default:
                lcd_show_string(109, 40, (const uint8_t *)"未知", LCD_GRAY, LCD_WHITE, 24, 0);
                status_color = LCD_GRAY;
                break;
        }
        last_status_level = assessment->level;
        printf("Status updated for level %d\n", assessment->level);
    } else {
        // 保持之前的颜色
        switch (assessment->level) {
            case RISK_LEVEL_SAFE: status_color = LCD_GREEN; break;
            case RISK_LEVEL_LOW: status_color = LCD_YELLOW; break;
            case RISK_LEVEL_MEDIUM: status_color = LCD_ORANGE; break;
            case RISK_LEVEL_HIGH:
            case RISK_LEVEL_CRITICAL: status_color = LCD_RED; break;
            default: status_color = LCD_GRAY; break;
        }
    }

    // 2. 风险等级（只在等级变化时更新，避免闪烁）
    static RiskLevel last_risk_level = -1;
    if (assessment->level != last_risk_level) {
        lcd_fill(109, 70, 200, 24, LCD_WHITE);
        switch (assessment->level) {
            case RISK_LEVEL_SAFE:
                lcd_show_chinese(109, 70, (uint8_t *)"安全", status_color, LCD_WHITE, 24, 0);
                break;
            case RISK_LEVEL_LOW:
                lcd_show_chinese(109, 70, (uint8_t *)"低风险", status_color, LCD_WHITE, 24, 0);
                break;
            case RISK_LEVEL_MEDIUM:
                lcd_show_chinese(109, 70, (uint8_t *)"中风险", status_color, LCD_WHITE, 24, 0);
                break;
            case RISK_LEVEL_HIGH:
                lcd_show_chinese(109, 70, (uint8_t *)"高风险", status_color, LCD_WHITE, 24, 0);
                break;
            case RISK_LEVEL_CRITICAL:
                lcd_show_chinese(109, 70, (uint8_t *)"极危险", status_color, LCD_WHITE, 24, 0);
                break;
            default:
                lcd_show_string(109, 70, (const uint8_t *)"未知", status_color, LCD_WHITE, 24, 0);
                break;
        }
        last_risk_level = assessment->level;
        printf("Risk level updated for level %d\n", assessment->level);
    }

    // 3. 找出最高风险因子
    float max_risk = assessment->tilt_risk;
    const char* max_risk_name = "倾斜";
    uint16_t max_risk_color = LCD_RED;

    if (assessment->vibration_risk > max_risk) {
        max_risk = assessment->vibration_risk;
        max_risk_name = "振动";
        max_risk_color = LCD_ORANGE;
    }
    if (assessment->humidity_risk > max_risk) {
        max_risk = assessment->humidity_risk;
        max_risk_name = "湿度";
        max_risk_color = LCD_BLUE;
    }
    if (assessment->light_risk > max_risk) {
        max_risk = assessment->light_risk;
        max_risk_name = "光照";
        max_risk_color = LCD_GREEN;
    }

    // 4. 主要风险因子
    lcd_fill(93, 135, 150, 16, LCD_WHITE);
    lcd_show_chinese(93, 135, (uint8_t *)max_risk_name, max_risk_color, LCD_WHITE, 16, 0);

    // 5. 风险值
    lcd_fill(93, 155, 80, 16, LCD_WHITE);
    snprintf(data_str, sizeof(data_str), "%.2f", max_risk);
    lcd_show_string(93, 155, (const uint8_t *)data_str, max_risk_color, LCD_WHITE, 16, 0);

    // 6. 置信度
    lcd_fill(93, 175, 80, 16, LCD_WHITE);
    snprintf(data_str, sizeof(data_str), "%.1f%%", assessment->confidence * 100.0f);
    lcd_show_string(93, 175, (const uint8_t *)data_str, LCD_BLUE, LCD_WHITE, 16, 0);

    // 7. 建议行动（只在等级变化时更新，避免闪烁）
    static RiskLevel last_suggestion_level = -1;
    if (assessment->level != last_suggestion_level) {
        lcd_fill(93, 195, 200, 16, LCD_WHITE);
        switch (assessment->level) {
            case RISK_LEVEL_SAFE:
                lcd_show_chinese(93, 195, (uint8_t *)"继续监测", LCD_GREEN, LCD_WHITE, 16, 0);
                break;
            case RISK_LEVEL_LOW:
                lcd_show_chinese(93, 195, (uint8_t *)"加强观察", LCD_YELLOW, LCD_WHITE, 16, 0);
                break;
            case RISK_LEVEL_MEDIUM:
                lcd_show_chinese(93, 195, (uint8_t *)"准备撤离", LCD_ORANGE, LCD_WHITE, 16, 0);
                break;
            case RISK_LEVEL_HIGH:
                lcd_show_chinese(93, 195, (uint8_t *)"立即撤离", LCD_RED, LCD_WHITE, 16, 0);
                break;
            case RISK_LEVEL_CRITICAL:
                lcd_show_chinese(93, 195, (uint8_t *)"紧急撤离", LCD_RED, LCD_WHITE, 16, 0);
                break;
            default:
                lcd_show_chinese(93, 195, (uint8_t *)"检查设备", LCD_GRAY, LCD_WHITE, 16, 0);
                break;
        }
        last_suggestion_level = assessment->level;
        printf("Suggestion updated for level %d\n", assessment->level);
    }
}

/**
 * @brief 显示风险状态界面
 * @param assessment 风险评估结果
 */
void LCD_DisplayRiskStatus(const RiskAssessment *assessment)
{
    if (!g_lcd_initialized || assessment == NULL) {
        return;
    }

    // 使用静态布局初始化和数据更新的方式
    LCD_InitRiskStatusLayout();
    LCD_UpdateRiskStatusData(assessment);
}

/**
 * @brief 初始化趋势分析模式的静态布局 - 专业趋势分析工具
 */
void LCD_InitTrendChartLayout(void)
{
    if (!g_lcd_initialized) {
        printf("LCD not initialized, cannot init trend layout\n");
        return;
    }

    printf("Starting trend chart layout initialization...\n");

    // 不需要清屏，主程序已经清屏了

    // 标题 - 使用简化中文
    printf("Drawing trend chart title...\n");
    lcd_show_chinese(120, 0, (uint8_t *)"趋势", LCD_RED, LCD_WHITE, 32, 0);
    lcd_draw_line(0, 33, LCD_W, 33, LCD_BLACK);
    printf("Title drawn successfully\n");

    // 左侧：当前趋势（简化为"当前"）
    printf("Drawing left side labels...\n");
    lcd_show_chinese(5, 40, (uint8_t *)"当前", LCD_RED, LCD_WHITE, 24, 0);
    printf("Current trend label drawn\n");

    // 趋势描述区域（简化标签）
    lcd_show_chinese(5, 65, (uint8_t *)"变化", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(45, 65, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Recent change label drawn\n");

    lcd_show_chinese(5, 85, (uint8_t *)"幅度", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(45, 85, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Change magnitude label drawn\n");

    lcd_show_chinese(5, 105, (uint8_t *)"强度", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(45, 105, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Trend strength label drawn\n");

    // 右侧：预测（简化标题）
    printf("Drawing right side labels...\n");
    lcd_show_chinese(160, 40, (uint8_t *)"预测", LCD_RED, LCD_WHITE, 24, 0);
    printf("Prediction analysis label drawn\n");

    // 等级
    lcd_show_chinese(160, 65, (uint8_t *)"等级", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(200, 65, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Prediction level label drawn\n");

    // 可靠性
    lcd_show_chinese(160, 85, (uint8_t *)"可靠", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(200, 85, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Reliability label drawn\n");

    // 稳定性
    lcd_show_chinese(160, 105, (uint8_t *)"稳定", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(200, 105, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Stability label drawn\n");

    // 分割线
    printf("Drawing separator line...\n");
    lcd_draw_line(0, 145, LCD_W, 145, LCD_BLACK);

    // 底部：预警（简化标题）
    printf("Drawing bottom section...\n");
    lcd_show_chinese(5, 150, (uint8_t *)"预警", LCD_RED, LCD_WHITE, 24, 0);
    printf("Warning info label drawn\n");

    // 时间
    lcd_show_chinese(5, 175, (uint8_t *)"时间", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(45, 175, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Time window label drawn\n");

    // 建议
    lcd_show_chinese(5, 195, (uint8_t *)"建议", LCD_RED, LCD_WHITE, 16, 0);
    lcd_show_string(45, 195, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 16, 0);
    printf("Suggestion label drawn\n");

    printf("LCD trend analysis layout initialized successfully!\n");
}

// 全局变量：存储历史数据用于趋势分析
static float g_risk_history[4][5] = {0}; // [风险类型][时间点]
static int g_history_index = 0;
static bool g_history_full = false;

/**
 * @brief 更新趋势分析模式的动态数据 - 专业趋势分析
 * @param assessment 风险评估结果
 */
void LCD_UpdateTrendChartData(const RiskAssessment *assessment)
{
    if (!g_lcd_initialized || assessment == NULL) {
        return;
    }

    char data_str[64];

    // 1. 更新历史数据
    g_risk_history[0][g_history_index] = assessment->tilt_risk;
    g_risk_history[1][g_history_index] = assessment->vibration_risk;
    g_risk_history[2][g_history_index] = assessment->humidity_risk;
    g_risk_history[3][g_history_index] = assessment->light_risk;

    g_history_index = (g_history_index + 1) % 5;
    if (g_history_index == 0) g_history_full = true;

    // 2. 计算总体风险和趋势
    float current_overall = (assessment->tilt_risk + assessment->vibration_risk +
                           assessment->humidity_risk + assessment->light_risk) / 4.0f;

    // 3. 计算变化率（如果有历史数据）
    float change_rate = 0.0f;
    if (g_history_full || g_history_index >= 2) {
        int prev_index = (g_history_index - 2 + 5) % 5;
        float prev_overall = (g_risk_history[0][prev_index] + g_risk_history[1][prev_index] +
                            g_risk_history[2][prev_index] + g_risk_history[3][prev_index]) / 4.0f;
        change_rate = current_overall - prev_overall;
    }

    // 4. 更新趋势描述（使用完整中文）
    // 最近变化
    lcd_fill(85, 65, 120, 16, LCD_WHITE);
    if (change_rate > 0.05f) {
        lcd_show_chinese(85, 65, (uint8_t *)"风险上升", LCD_RED, LCD_WHITE, 16, 0);
    } else if (change_rate < -0.05f) {
        lcd_show_chinese(85, 65, (uint8_t *)"风险下降", LCD_GREEN, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(85, 65, (uint8_t *)"基本稳定", LCD_BLUE, LCD_WHITE, 16, 0);
    }

    // 变化幅度
    lcd_fill(85, 85, 120, 16, LCD_WHITE);
    if (fabsf(change_rate) > 0.1f) {
        lcd_show_chinese(85, 85, (uint8_t *)"变化明显", LCD_RED, LCD_WHITE, 16, 0);
    } else if (fabsf(change_rate) > 0.03f) {
        lcd_show_chinese(85, 85, (uint8_t *)"轻微变化", LCD_YELLOW, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(85, 85, (uint8_t *)"几乎无变化", LCD_GREEN, LCD_WHITE, 16, 0);
    }

    // 趋势强度
    lcd_fill(85, 105, 120, 16, LCD_WHITE);
    if (fabsf(change_rate) > 0.08f) {
        lcd_show_chinese(85, 105, (uint8_t *)"强烈", LCD_RED, LCD_WHITE, 16, 0);
    } else if (fabsf(change_rate) > 0.04f) {
        lcd_show_chinese(85, 105, (uint8_t *)"中等", LCD_ORANGE, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(85, 105, (uint8_t *)"微弱", LCD_GREEN, LCD_WHITE, 16, 0);
    }

    // 5. 更新变化率显示
    lcd_fill(216, 65, 100, 16, LCD_WHITE);
    if (change_rate > 0.05f) {
        lcd_show_string(216, 65, (const uint8_t *)"上升", LCD_RED, LCD_WHITE, 16, 0);
    } else if (change_rate < -0.05f) {
        lcd_show_string(216, 65, (const uint8_t *)"下降", LCD_GREEN, LCD_WHITE, 16, 0);
    } else {
        lcd_show_string(216, 65, (const uint8_t *)"稳定", LCD_BLUE, LCD_WHITE, 16, 0);
    }

    // 6. 预测等级（基于当前趋势）
    lcd_fill(232, 65, 120, 16, LCD_WHITE);
    float predicted_risk = current_overall + change_rate * 2; // 简单线性预测
    if (predicted_risk > 0.8f) {
        lcd_show_chinese(232, 65, (uint8_t *)"高风险", LCD_RED, LCD_WHITE, 16, 0);
    } else if (predicted_risk > 0.5f) {
        lcd_show_chinese(232, 65, (uint8_t *)"中风险", LCD_ORANGE, LCD_WHITE, 16, 0);
    } else if (predicted_risk > 0.2f) {
        lcd_show_chinese(232, 65, (uint8_t *)"低风险", LCD_YELLOW, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(232, 65, (uint8_t *)"安全", LCD_GREEN, LCD_WHITE, 16, 0);
    }

    // 7. 可靠性评估（基于历史数据量）
    lcd_fill(232, 85, 100, 16, LCD_WHITE);
    if (g_history_full || g_history_index >= 3) {
        lcd_show_chinese(232, 85, (uint8_t *)"可靠", LCD_GREEN, LCD_WHITE, 16, 0);
    } else if (g_history_index >= 2) {
        lcd_show_chinese(232, 85, (uint8_t *)"一般", LCD_YELLOW, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(232, 85, (uint8_t *)"数据不足", LCD_RED, LCD_WHITE, 16, 0);
    }

    // 8. 稳定性评估（基于变化率的绝对值）
    lcd_fill(232, 105, 100, 16, LCD_WHITE);
    float stability = 1.0f - fabsf(change_rate) * 10; // 变化率越小越稳定
    if (stability > 0.8f) {
        lcd_show_chinese(232, 105, (uint8_t *)"稳定", LCD_GREEN, LCD_WHITE, 16, 0);
    } else if (stability > 0.5f) {
        lcd_show_chinese(232, 105, (uint8_t *)"一般", LCD_YELLOW, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(232, 105, (uint8_t *)"不稳定", LCD_RED, LCD_WHITE, 16, 0);
    }

    // 9. 时间窗口（预测有效期）
    lcd_fill(85, 175, 150, 16, LCD_WHITE);
    if (fabsf(change_rate) > 0.1f) {
        lcd_show_chinese(85, 175, (uint8_t *)"短期预测", LCD_ORANGE, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(85, 175, (uint8_t *)"中期预测", LCD_GREEN, LCD_WHITE, 16, 0);
    }

    // 10. 建议行动（基于趋势预测）
    lcd_fill(85, 195, 200, 16, LCD_WHITE);
    if (predicted_risk > 0.8f && change_rate > 0.05f) {
        lcd_show_chinese(85, 195, (uint8_t *)"加强监测", LCD_RED, LCD_WHITE, 16, 0);
    } else if (predicted_risk > 0.5f) {
        lcd_show_chinese(85, 195, (uint8_t *)"持续观察", LCD_ORANGE, LCD_WHITE, 16, 0);
    } else if (change_rate < -0.05f) {
        lcd_show_chinese(85, 195, (uint8_t *)"风险降低", LCD_GREEN, LCD_WHITE, 16, 0);
    } else {
        lcd_show_chinese(85, 195, (uint8_t *)"正常监测", LCD_BLUE, LCD_WHITE, 16, 0);
    }
}

/**
 * @brief 显示趋势图界面
 * @param assessment 风险评估结果
 */
void LCD_DisplayTrendChart(const RiskAssessment *assessment)
{
    if (!g_lcd_initialized || assessment == NULL) {
        return;
    }

    // 使用静态布局初始化和数据更新的方式
    LCD_InitTrendChartLayout();
    LCD_UpdateTrendChartData(assessment);
}

/**
 * @brief 显示系统信息界面
 * @param stats 系统统计信息
 */
void LCD_DisplaySystemInfo(const SystemStats *stats)
{
    if (!g_lcd_initialized || stats == NULL) {
        return;
    }
    
    // 清屏
    LCD_Clear(LCD_WHITE);
    
    // 标题
    LCD_ShowString(80, 5, "System Info", LCD_BLUE, LCD_WHITE, 16);
    
    // 分割线
    lcd_fill(10, 25, 230, 27, LCD_GRAY);
    
    // 运行时间
    LCD_ShowString(10, 35, "Uptime:", LCD_BLACK, LCD_WHITE, 12);
    char uptime_str[32];
    snprintf(uptime_str, sizeof(uptime_str), "%u seconds", stats->uptime_seconds);
    LCD_ShowString(70, 35, uptime_str, LCD_GREEN, LCD_WHITE, 12);
    
    // 数据采样次数
    LCD_ShowString(10, 55, "Samples:", LCD_BLACK, LCD_WHITE, 12);
    char samples_str[16];
    snprintf(samples_str, sizeof(samples_str), "%u", stats->data_samples);
    LCD_ShowString(80, 55, samples_str, LCD_BLUE, LCD_WHITE, 12);
    
    // 传感器错误次数
    LCD_ShowString(10, 75, "Sensor Errors:", LCD_BLACK, LCD_WHITE, 12);
    char errors_str[16];
    snprintf(errors_str, sizeof(errors_str), "%u", stats->sensor_errors);
    LCD_ShowString(120, 75, errors_str, LCD_RED, LCD_WHITE, 12);
    
    // 风险警报次数
    LCD_ShowString(10, 95, "Risk Alerts:", LCD_BLACK, LCD_WHITE, 12);
    char alerts_str[16];
    snprintf(alerts_str, sizeof(alerts_str), "%u", stats->risk_alerts);
    LCD_ShowString(100, 95, alerts_str, LCD_ORANGE, LCD_WHITE, 12);
    
    // 系统状态
    LCD_ShowString(10, 115, "System State:", LCD_BLACK, LCD_WHITE, 12);
    const char* state_text;
    uint16_t state_color;
    switch (stats->current_state) {
        case SYSTEM_STATE_RUNNING:
            state_text = "RUNNING";
            state_color = LCD_GREEN;
            break;
        case SYSTEM_STATE_WARNING:
            state_text = "WARNING";
            state_color = LCD_ORANGE;
            break;
        case SYSTEM_STATE_ERROR:
            state_text = "ERROR";
            state_color = LCD_RED;
            break;
        default:
            state_text = "UNKNOWN";
            state_color = LCD_GRAY;
            break;
    }
    LCD_ShowString(10, 135, state_text, state_color, LCD_WHITE, 16);
    
    // 底部状态栏
    lcd_fill(0, 220, 240, 222, LCD_GRAY);
    LCD_ShowString(10, 225, "Mode: System Info", LCD_BLACK, LCD_WHITE, 12);
}

/**
 * @brief 切换显示模式
 * @param mode 显示模式
 */
void LCD_SwitchMode(LcdDisplayMode mode)
{
    g_current_mode = mode;
}

/**
 * @brief 检查LCD是否已初始化
 * @return true: 已初始化, false: 未初始化
 */
bool LCD_IsInitialized(void)
{
    return g_lcd_initialized;
}

/* 暂时注释掉中文字库函数，避免编译错误 */
/*
int find_chinese_index_24x24(const char* chinese_char)
{
    // 实现代码暂时注释
    return -1;
}

void lcd_show_chinese_24x24(uint16_t x, uint16_t y, const char* text, uint16_t fc, uint16_t bc)
{
    // 实现代码暂时注释
}
*/

/**
 * @brief 初始化静态布局 (完全移植智能安防例程的布局)
 */
void LCD_InitStaticLayout(void)
{
    if (!g_lcd_initialized || g_static_layout_initialized) {
        return;
    }

    // 清屏为白色背景
    LCD_Clear(LCD_WHITE);

    // 现在使用32号字体的标题 - 更加醒目
    lcd_show_chinese(96, 0, (uint8_t *)"滑坡监测", LCD_RED, LCD_WHITE, 32, 0);
    lcd_draw_line(0, 33, LCD_W, 33, LCD_BLACK);
    lcd_show_chinese(5, 34, (uint8_t *)"传感器数据", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(101, 34, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    // 第一行：倾斜角度 (替换烟雾浓度)
    lcd_show_chinese(5, 58, (uint8_t *)"倾斜角度", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(101, 58, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    // 第二行：温度 (替换人体感应)
    lcd_show_chinese(5, 82, (uint8_t *)"温度", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(53, 82, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    lcd_draw_line(0, 131, LCD_W, 131, LCD_BLACK);
    lcd_show_chinese(5, 132, (uint8_t *)"环境状态", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(101, 132, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    // 第三行：湿度 (替换蜂鸣器)
    lcd_show_chinese(5, 156, (uint8_t *)"湿度", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(53, 156, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    // 第四行：光照 (替换报警灯)
    lcd_show_chinese(5, 180, (uint8_t *)"光照", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(53, 180, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    // 第五行：风险等级 (替换自动)
    lcd_show_chinese(5, 204, (uint8_t *)"风险", LCD_RED, LCD_WHITE, 24, 0);
    lcd_show_string(53, 204, (const uint8_t *)": ", LCD_RED, LCD_WHITE, 24, 0);

    g_static_layout_initialized = true;
    printf("LCD static layout initialized (Smart Security Layout Ported)\n");
}

/**
 * @brief 设置风险等级显示 (使用系统完整的风险评估)
 */
void lcd_set_risk_level(const SensorData *data)
{
    // 获取系统的完整风险评估
    extern int GetLatestRiskAssessment(RiskAssessment *assessment);
    RiskAssessment assessment;

    if (GetLatestRiskAssessment(&assessment) != 0) {
        // 如果无法获取风险评估，显示未知状态
        lcd_show_string(77, 204, (const uint8_t *)"Unknown", LCD_GRAY, LCD_WHITE, 24, 0);
        return;
    }

    // 根据系统风险评估等级显示状态
    switch (assessment.level) {
        case RISK_LEVEL_SAFE:
            lcd_show_chinese(77, 204, (uint8_t *)"安全", LCD_GREEN, LCD_WHITE, 24, 0);
            break;
        case RISK_LEVEL_LOW:
            lcd_show_chinese(77, 204, (uint8_t *)"注意", LCD_YELLOW, LCD_WHITE, 24, 0);
            break;
        case RISK_LEVEL_MEDIUM:
            lcd_show_chinese(77, 204, (uint8_t *)"警告", LCD_ORANGE, LCD_WHITE, 24, 0);
            break;
        case RISK_LEVEL_HIGH:
        case RISK_LEVEL_CRITICAL:
            lcd_show_chinese(77, 204, (uint8_t *)"危险", LCD_RED, LCD_WHITE, 24, 0);
            break;
        default:
            lcd_show_string(77, 204, (const uint8_t *)"Error ", LCD_GRAY, LCD_WHITE, 24, 0);
            break;
    }
}

/**
 * @brief 只更新状态指示器 (使用智能安防的风险等级显示)
 */
void LCD_UpdateStatusOnly(const SensorData *data)
{
    if (!g_lcd_initialized || !data->data_valid) {
        return;
    }

    // 使用智能安防风格的风险等级更新
    lcd_set_risk_level(data);
}

/**
 * @brief 设置倾斜角度显示 (移植自智能安防的lcd_set_ppm)
 */
void lcd_set_tilt_angle(const SensorData *data)
{
    char buf[50] = {0};  // 使用char类型
    float angle_magnitude = sqrtf(data->angle_x * data->angle_x + data->angle_y * data->angle_y);
    sprintf(buf, "%.2f", angle_magnitude);
    lcd_show_string(119, 58, (const uint8_t *)buf, LCD_RED, LCD_WHITE, 24, 0);
    // 调整"度"字位置，给两位小数留出足够空间（约48像素宽度）
    lcd_show_chinese(167, 58, (uint8_t *)"度", LCD_RED, LCD_WHITE, 24, 0);
}

/**
 * @brief 设置温度显示 (移植自智能安防的lcd_set_body_induction)
 */
void lcd_set_temperature(const SensorData *data)
{
    char buf[50] = {0};  // 使用char类型
    sprintf(buf, "%.1fC", data->sht_temperature);  // 使用ASCII字符C替代℃
    lcd_show_string(71, 82, (const uint8_t *)buf, LCD_BLUE, LCD_WHITE, 24, 0);
}

/**
 * @brief 设置湿度显示 (移植自智能安防的lcd_set_beep_state)
 */
void lcd_set_humidity(const SensorData *data)
{
    char buf[50] = {0};  // 使用char类型
    sprintf(buf, "%.1f%%", data->humidity);
    lcd_show_string(71, 156, (const uint8_t *)buf, LCD_GREEN, LCD_WHITE, 24, 0);
}

/**
 * @brief 设置光照显示 (移植自智能安防的lcd_set_alarm_light_state)
 */
void lcd_set_light(const SensorData *data)
{
    char buf[50] = {0};  // 使用char类型
    sprintf(buf, "%.0flux", data->light_intensity);
    lcd_show_string(71, 180, (const uint8_t *)buf, LCD_ORANGE, LCD_WHITE, 24, 0);
}

/**
 * @brief 只更新数据数值 (使用智能安防的更新方式)
 */
void LCD_UpdateDataOnly(const SensorData *data)
{
    if (!g_lcd_initialized || !data->data_valid) {
        return;
    }

    // 使用智能安防风格的数据更新函数
    lcd_set_tilt_angle(data);
    lcd_set_temperature(data);
    lcd_set_humidity(data);
    lcd_set_light(data);
}
