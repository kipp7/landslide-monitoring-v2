#include "tongxiao_alarm.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "lcd.h"

static bool g_lcd_ready;

static void ShowAscii(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    lcd_show_string(x, y, (const uint8_t *)text, fg, bg, size, 0);
}

static void ShowChinese(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    lcd_show_chinese(x, y, (uint8_t *)text, fg, bg, size, 0);
}

static void ShowChineseCentered(uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    size_t characters = strlen(text) / 3U;
    uint16_t width = (uint16_t)(characters * size);
    uint16_t x = width < LCD_W ? (uint16_t)((LCD_W - width) / 2U) : 0;
    ShowChinese(x, y, text, fg, bg, size);
}

static const char *SeverityChinese(AlarmSeverity severity)
{
    switch (severity) {
        case ALARM_SEVERITY_LOW: return "低";
        case ALARM_SEVERITY_MEDIUM: return "中";
        case ALARM_SEVERITY_HIGH: return "高";
        case ALARM_SEVERITY_CRITICAL: return "极高";
        default: return "正常";
    }
}

static void SafeAscii(char *target, size_t target_size, const char *source)
{
    size_t i;
    if (target_size == 0) return;
    for (i = 0; i + 1 < target_size && source[i] != '\0'; ++i) {
        unsigned char ch = (unsigned char)source[i];
        target[i] = isprint(ch) && ch < 0x80 ? (char)ch : '?';
    }
    target[i] = '\0';
}

void AlarmDisplay_Init(void)
{
    g_lcd_ready = lcd_init() == 0;
    if (!g_lcd_ready) printf("lcd_init failed\n");
}

void AlarmDisplay_Render(const AlarmSnapshot *snapshot)
{
    uint16_t background;
    uint16_t foreground;
    char line[96];
    char station[25];
    char alert[25];

    if (!g_lcd_ready || snapshot == NULL) return;
    if (snapshot->self_test_active || snapshot->desired.display == ALARM_DISPLAY_SELF_TEST) {
        background = LCD_BLUE;
        foreground = LCD_WHITE;
    } else if (snapshot->desired.state == ALARM_STATE_ACTIVE && !snapshot->locally_silenced) {
        background = LCD_RED;
        foreground = LCD_WHITE;
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED || snapshot->locally_silenced) {
        background = LCD_YELLOW;
        foreground = LCD_BLACK;
    } else {
        background = LCD_WHITE;
        foreground = LCD_DARKBLUE;
    }

    lcd_fill(0, 0, LCD_W, LCD_H, background);
    ShowChineseCentered(10, "滑坡风险告警", foreground, background, 24);
    lcd_draw_line(12, 44, 307, 44, foreground);

    if (snapshot->self_test_active || snapshot->desired.display == ALARM_DISPLAY_SELF_TEST) {
        ShowChineseCentered(60, "设备自检", foreground, background, 24);
        ShowChineseCentered(94, "振动灯光检测", foreground, background, 24);
        ShowAscii(80, 124, "BUZZER / MOTOR / RGB", foreground, background, 16);
    } else if (snapshot->desired.state == ALARM_STATE_ACTIVE) {
        ShowChinese(16, 58, "当前等级", foreground, background, 16);
        ShowChinese(104, 54, SeverityChinese(snapshot->desired.severity), foreground, background, 24);
        ShowChinese(164, 54, "风险", foreground, background, 24);
        if (snapshot->locally_silenced) {
            ShowChineseCentered(88, "告警关闭", foreground, background, 24);
            ShowChineseCentered(116, "风险继续观察", foreground, background, 24);
        } else {
            ShowChineseCentered(92,
                snapshot->desired.severity == ALARM_SEVERITY_CRITICAL ? "紧急撤离" : "准备撤离",
                foreground, background, 24);
        }
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED) {
        ShowChineseCentered(62, "告警关闭", foreground, background, 24);
        ShowChineseCentered(98, "风险继续观察", foreground, background, 24);
    } else if (snapshot->desired.display == ALARM_DISPLAY_ALL_CLEAR) {
        ShowChineseCentered(62, "风险正常", LCD_GREEN, background, 24);
        ShowChineseCentered(98, "继续观察", foreground, background, 24);
    } else {
        ShowChineseCentered(62, "设备正常", LCD_GREEN, background, 24);
        ShowChineseCentered(98, "准备告警", foreground, background, 24);
    }

    SafeAscii(station, sizeof(station), snapshot->desired.station_id);
    SafeAscii(alert, sizeof(alert), snapshot->desired.alert_id);
    snprintf(line, sizeof(line), "SITE: %s", station[0] ? station : "--");
    ShowAscii(16, 146, line, foreground, background, 16);
    snprintf(line, sizeof(line), "ALERT: %s", alert[0] ? alert : "--");
    ShowAscii(16, 166, line, foreground, background, 16);
    snprintf(line, sizeof(line), "REV: %llu", (unsigned long long)snapshot->desired.revision);
    ShowAscii(16, 186, line, foreground, background, 16);
    snprintf(line, sizeof(line), "WIFI:%s  MQTT:%s",
        snapshot->wifi_connected ? "OK" : "DOWN",
        snapshot->mqtt_connected ? "OK" : "DOWN");
    ShowAscii(16, 214, line, foreground, background, 16);
}
