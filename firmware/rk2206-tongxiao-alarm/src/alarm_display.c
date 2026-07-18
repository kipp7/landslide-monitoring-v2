#include "tongxiao_alarm.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "alarm_config.h"
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

static const char *StateChinese(const AlarmSnapshot *snapshot)
{
    if (snapshot->self_test_active) return "自检";
    if (snapshot->locally_silenced || snapshot->desired.state == ALARM_STATE_SILENCED) return "关闭";
    if (snapshot->desired.state == ALARM_STATE_ACTIVE) return "告警";
    return "正常";
}

static void SafeShortId(char *target, size_t target_size, const char *source)
{
    size_t length;
    size_t i;

    if (target_size == 0) return;
    target[0] = '\0';
    if (source == NULL || source[0] == '\0') return;
    length = strlen(source);
    if (length <= 20U) {
        for (i = 0; i + 1 < target_size && i < length; ++i) {
            unsigned char ch = (unsigned char)source[i];
            target[i] = isprint(ch) && ch < 0x80 ? (char)ch : '?';
        }
        target[i] = '\0';
        return;
    }
    if (target_size < 20U) return;
    snprintf(target, target_size, "%.8s...%.8s", source, source + length - 8U);
}

static void ShowMixedText(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg,
    uint8_t size, uint16_t max_width)
{
    const unsigned char *cursor = (const unsigned char *)text;
    uint16_t used = 0;

    if (text == NULL || text[0] == '\0') {
        ShowAscii(x, y, "--", fg, bg, size);
        return;
    }
    while (*cursor != '\0') {
        if (*cursor < 0x80U) {
            char ascii[2] = { (char)*cursor, '\0' };
            uint16_t width = (uint16_t)(size / 2U);
            if (used + width > max_width) break;
            if (isprint(*cursor)) ShowAscii((uint16_t)(x + used), y, ascii, fg, bg, size);
            used = (uint16_t)(used + width);
            ++cursor;
        } else if ((cursor[0] & 0xF0U) == 0xE0U && cursor[1] != '\0' && cursor[2] != '\0') {
            char glyph[4] = { (char)cursor[0], (char)cursor[1], (char)cursor[2], '\0' };
            if (used + size > max_width) break;
            ShowChinese((uint16_t)(x + used), y, glyph, fg, bg, size);
            used = (uint16_t)(used + size);
            cursor += 3;
        } else {
            ++cursor;
        }
    }
}

static bool HasAlertContext(const AlarmSnapshot *snapshot)
{
    return snapshot->desired.title[0] != '\0' || snapshot->desired.message[0] != '\0' ||
        snapshot->desired.station_id[0] != '\0' || snapshot->desired.alert_id[0] != '\0';
}

static void ShowProtocolStatus(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    uint16_t wifi_color = bg == LCD_WHITE ? (snapshot->wifi_connected ? LCD_GREEN : LCD_RED) : fg;
    uint16_t mqtt_color = bg == LCD_WHITE ? (snapshot->mqtt_connected ? LCD_GREEN : LCD_RED) : fg;

    ShowAscii(12, 220, "Wi-Fi", fg, bg, 16);
    ShowChinese(58, 220, snapshot->wifi_connected ? "正常" : "关闭", wifi_color, bg, 16);
    ShowAscii(170, 220, "MQTT", fg, bg, 16);
    ShowChinese(210, 220, snapshot->mqtt_connected ? "正常" : "关闭", mqtt_color, bg, 16);
}

static void ShowAlertContext(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    char station[24];
    char alert[24];

    SafeShortId(station, sizeof(station), snapshot->desired.station_id);
    SafeShortId(alert, sizeof(alert), snapshot->desired.alert_id);
    ShowChinese(12, 136, "告警", fg, bg, 16);
    ShowMixedText(58, 136, snapshot->desired.title, fg, bg, 16, 250);
    ShowChinese(12, 158, "建议", fg, bg, 16);
    ShowMixedText(58, 158, snapshot->desired.message, fg, bg, 16, 250);
    ShowChinese(12, 180, "监测", fg, bg, 16);
    ShowAscii(58, 180, station[0] ? station : "--", fg, bg, 16);
    ShowAscii(12, 202, "ID", fg, bg, 16);
    ShowAscii(58, 202, alert[0] ? alert : "--", fg, bg, 16);
}

static void ShowDeviceContext(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    char device[24];
    char line[48];

    SafeShortId(device, sizeof(device), TONGXIAO_DEVICE_ID);
    ShowChinese(12, 136, "设备", fg, bg, 16);
    ShowAscii(58, 136, device, fg, bg, 16);
    ShowAscii(12, 158, "FW", fg, bg, 16);
    ShowAscii(58, 158, TONGXIAO_FIRMWARE_VERSION, fg, bg, 16);
    ShowAscii(12, 180, "REV", fg, bg, 16);
    snprintf(line, sizeof(line), "%llu", (unsigned long long)snapshot->desired.revision);
    ShowAscii(58, 180, line, fg, bg, 16);
    ShowChinese(12, 202, "设备状态", fg, bg, 16);
    ShowChinese(90, 202, StateChinese(snapshot), fg, bg, 16);
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
        ShowChineseCentered(58, "设备自检", foreground, background, 24);
        ShowChineseCentered(90, "振动灯光检测", foreground, background, 24);
    } else if (snapshot->desired.state == ALARM_STATE_ACTIVE) {
        ShowChinese(44, 54, "风险等级", foreground, background, 16);
        ShowChinese(124, 50, SeverityChinese(snapshot->desired.severity), foreground, background, 24);
        ShowChinese(184, 50, "风险", foreground, background, 24);
        if (snapshot->locally_silenced) {
            ShowChineseCentered(88, "告警关闭", foreground, background, 24);
            ShowChineseCentered(112, "风险继续观察", foreground, background, 16);
        } else {
            ShowChineseCentered(88,
                snapshot->desired.severity == ALARM_SEVERITY_CRITICAL ? "紧急撤离" : "准备撤离",
                foreground, background, 24);
        }
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED) {
        ShowChineseCentered(58, "告警关闭", foreground, background, 24);
        ShowChineseCentered(92, "风险继续观察", foreground, background, 24);
    } else if (snapshot->desired.display == ALARM_DISPLAY_ALL_CLEAR) {
        ShowChineseCentered(58, "风险正常", LCD_GREEN, background, 24);
        ShowChineseCentered(92, "继续观察", foreground, background, 24);
    } else {
        ShowChineseCentered(58, "设备正常", LCD_GREEN, background, 24);
        ShowChinese(68, 94, "风险等级", foreground, background, 16);
        ShowChinese(148, 90, "正常", LCD_GREEN, background, 24);
    }

    lcd_draw_line(12, 126, 307, 126, foreground);
    if (HasAlertContext(snapshot)) ShowAlertContext(snapshot, foreground, background);
    else ShowDeviceContext(snapshot, foreground, background);
    ShowProtocolStatus(snapshot, foreground, background);
}
