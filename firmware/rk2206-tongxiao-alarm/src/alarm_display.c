#include "tongxiao_alarm.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "alarm_config.h"
#include "lcd.h"

static bool g_lcd_ready;
static bool g_has_rendered_snapshot;
static AlarmSnapshot g_rendered_snapshot;

#define STATUS_LABEL_X 40U
#define STATUS_VALUE_X 96U

/* 24x24 Song-style glyphs missing from the board's bundled Chinese font. */
static const uint32_t GLYPH_GU_24[24] = {
    0x1FFFF8U, 0x100018U, 0x101818U, 0x101818U, 0x101818U, 0x17FFD8U,
    0x101818U, 0x101818U, 0x101818U, 0x10FF98U, 0x108118U, 0x108118U,
    0x108118U, 0x108118U, 0x10FF18U, 0x108118U, 0x108118U, 0x100018U,
    0x1FFFF8U, 0x100018U, 0x100010U, 0x000000U, 0x000000U, 0x000000U,
};

static const uint32_t GLYPH_JIAN_24[24] = {
    0x010100U, 0x038180U, 0x030100U, 0x023100U, 0x063100U, 0x042100U,
    0x0E3FF8U, 0x0C2100U, 0x144100U, 0x144100U, 0x248100U, 0x440100U,
    0x04FFFCU, 0x040100U, 0x040100U, 0x040100U, 0x040100U, 0x040100U,
    0x040100U, 0x040100U, 0x040100U, 0x040100U, 0x000000U, 0x000000U,
};

static const uint32_t GLYPH_LING_24[24] = {
    0x001000U, 0x001800U, 0x003800U, 0x002400U, 0x006200U, 0x00C200U,
    0x008100U, 0x01A080U, 0x0318E0U, 0x040C70U, 0x080C1EU, 0x300048U,
    0x07FFE0U, 0x0000C0U, 0x000180U, 0x000100U, 0x000200U, 0x00C400U,
    0x003400U, 0x001C00U, 0x000E00U, 0x000600U, 0x000200U, 0x000000U,
};

static void ShowAscii(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    lcd_show_string(x, y, (const uint8_t *)text, fg, bg, size, 0);
}

static const uint32_t *ExtraGlyph24(const unsigned char *glyph)
{
    if (memcmp(glyph, "固", 3U) == 0) return GLYPH_GU_24;
    if (memcmp(glyph, "件", 3U) == 0) return GLYPH_JIAN_24;
    if (memcmp(glyph, "令", 3U) == 0) return GLYPH_LING_24;
    return NULL;
}

static void DrawExtraGlyph24(uint16_t x, uint16_t y, const uint32_t *rows, uint16_t fg, uint16_t bg)
{
    uint16_t row;
    uint16_t column;

    lcd_fill(x, y, (uint16_t)(x + 24U), (uint16_t)(y + 24U), bg);
    for (row = 0; row < 24U; ++row) {
        for (column = 0; column < 24U; ++column) {
            if ((rows[row] & (1UL << (23U - column))) != 0U) {
                lcd_draw_point((uint16_t)(x + column), (uint16_t)(y + row), fg);
            }
        }
    }
}

static void ShowChinese(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    const unsigned char *cursor = (const unsigned char *)text;

    if (size != 24U) {
        lcd_show_chinese(x, y, (uint8_t *)text, fg, bg, size, 0);
        return;
    }
    while (cursor[0] != '\0' && cursor[1] != '\0' && cursor[2] != '\0') {
        const uint32_t *extra = ExtraGlyph24(cursor);
        if (extra != NULL) {
            DrawExtraGlyph24(x, y, extra, fg, bg);
        } else {
            uint8_t glyph[4] = { cursor[0], cursor[1], cursor[2], '\0' };
            lcd_show_chinese(x, y, glyph, fg, bg, size, 0);
        }
        cursor += 3;
        x = (uint16_t)(x + size);
    }
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

static bool HasAlertContext(const AlarmSnapshot *snapshot)
{
    return snapshot->desired.title[0] != '\0' || snapshot->desired.message[0] != '\0' ||
        snapshot->desired.station_id[0] != '\0' || snapshot->desired.alert_id[0] != '\0';
}

static void ShowProtocolStatus(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    uint16_t wifi_color = bg == LCD_WHITE ? (snapshot->wifi_connected ? LCD_GREEN : LCD_RED) : fg;
    uint16_t mqtt_color = bg == LCD_WHITE ? (snapshot->mqtt_connected ? LCD_GREEN : LCD_RED) : fg;

    ShowAscii(STATUS_LABEL_X, 216, "WIFI", fg, bg, 24);
    ShowChinese(STATUS_VALUE_X, 216, snapshot->wifi_connected ? "正常" : "关闭", wifi_color, bg, 24);
    ShowAscii(176, 216, "MQTT", fg, bg, 24);
    ShowChinese(232, 216, snapshot->mqtt_connected ? "正常" : "关闭", mqtt_color, bg, 24);
}

static void RefreshProtocolValues(const AlarmSnapshot *snapshot, const AlarmSnapshot *previous,
    uint16_t fg, uint16_t bg)
{
    if (snapshot->wifi_connected != previous->wifi_connected) {
        uint16_t color = bg == LCD_WHITE ? (snapshot->wifi_connected ? LCD_GREEN : LCD_RED) : fg;
        ShowChinese(STATUS_VALUE_X, 216, snapshot->wifi_connected ? "正常" : "关闭", color, bg, 24);
    }
    if (snapshot->mqtt_connected != previous->mqtt_connected) {
        uint16_t color = bg == LCD_WHITE ? (snapshot->mqtt_connected ? LCD_GREEN : LCD_RED) : fg;
        ShowChinese(232, 216, snapshot->mqtt_connected ? "正常" : "关闭", color, bg, 24);
    }
}

static void ShowAlertContext(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    char station[24];
    char alert[24];

    SafeShortId(station, sizeof(station), snapshot->desired.station_id);
    SafeShortId(alert, sizeof(alert), snapshot->desired.alert_id);
    ShowChinese(STATUS_LABEL_X, 112, "监测", fg, bg, 24);
    ShowAscii(STATUS_VALUE_X, 116, station[0] ? station : "--", fg, bg, 16);
    ShowChinese(STATUS_LABEL_X, 138, "等级", fg, bg, 24);
    ShowChinese(STATUS_VALUE_X, 138, SeverityChinese(snapshot->desired.severity), fg, bg, 24);
    ShowChinese(STATUS_LABEL_X, 164, "建议", fg, bg, 24);
    ShowChinese(STATUS_VALUE_X, 164,
        snapshot->desired.severity == ALARM_SEVERITY_CRITICAL ? "立即撤离" : "准备撤离",
        fg, bg, 24);
    ShowChinese(STATUS_LABEL_X, 190, "告警", fg, bg, 24);
    ShowAscii(STATUS_VALUE_X, 194, alert[0] ? alert : "--", fg, bg, 16);
}

static void ShowDeviceContext(const AlarmSnapshot *snapshot, uint16_t fg, uint16_t bg)
{
    char device[24];
    char line[48];

    SafeShortId(device, sizeof(device), TONGXIAO_DEVICE_ID);
    ShowChinese(STATUS_LABEL_X, 112, "设备", fg, bg, 24);
    ShowAscii(STATUS_VALUE_X, 116, device, fg, bg, 16);
    ShowChinese(STATUS_LABEL_X, 138, "固件", fg, bg, 24);
    ShowAscii(STATUS_VALUE_X, 138, TONGXIAO_FIRMWARE_VERSION, fg, bg, 24);
    ShowChinese(STATUS_LABEL_X, 164, "指令", fg, bg, 24);
    snprintf(line, sizeof(line), "%llu", (unsigned long long)snapshot->desired.revision);
    ShowAscii(STATUS_VALUE_X, 164, line, fg, bg, 24);
    ShowChinese(STATUS_LABEL_X, 190, "状态", fg, bg, 24);
    ShowChinese(STATUS_VALUE_X, 190, StateChinese(snapshot), fg, bg, 24);
}

void AlarmDisplay_Init(void)
{
    g_lcd_ready = lcd_init() == 0;
    g_has_rendered_snapshot = false;
    memset(&g_rendered_snapshot, 0, sizeof(g_rendered_snapshot));
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

    if (g_has_rendered_snapshot &&
        memcmp(&snapshot->desired, &g_rendered_snapshot.desired, sizeof(snapshot->desired)) == 0 &&
        snapshot->locally_silenced == g_rendered_snapshot.locally_silenced &&
        snapshot->self_test_active == g_rendered_snapshot.self_test_active) {
        RefreshProtocolValues(snapshot, &g_rendered_snapshot, foreground, background);
        g_rendered_snapshot = *snapshot;
        return;
    }

    lcd_fill(0, 0, LCD_W, LCD_H, background);
    ShowChineseCentered(6, "滑坡风险告警", foreground, background, 24);
    lcd_draw_line(12, 38, 307, 38, foreground);

    if (snapshot->self_test_active || snapshot->desired.display == ALARM_DISPLAY_SELF_TEST) {
        ShowChineseCentered(46, "设备自检", foreground, background, 24);
        ShowChineseCentered(76, "振动灯光检测", foreground, background, 24);
    } else if (snapshot->desired.state == ALARM_STATE_ACTIVE) {
        ShowChinese(80, 46, "风险等级", foreground, background, 24);
        ShowChinese(192, 46, SeverityChinese(snapshot->desired.severity), foreground, background, 24);
        if (snapshot->locally_silenced) {
            ShowChineseCentered(76, "告警关闭", foreground, background, 24);
        } else {
            ShowChineseCentered(76,
                snapshot->desired.severity == ALARM_SEVERITY_CRITICAL ? "紧急撤离" : "准备撤离",
                foreground, background, 24);
        }
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED) {
        ShowChineseCentered(46, "告警关闭", foreground, background, 24);
        ShowChineseCentered(76, "风险继续观察", foreground, background, 24);
    } else if (snapshot->desired.display == ALARM_DISPLAY_ALL_CLEAR) {
        ShowChineseCentered(46, "风险正常", LCD_GREEN, background, 24);
        ShowChineseCentered(76, "继续观察", foreground, background, 24);
    } else {
        ShowChinese(STATUS_LABEL_X, 46, "设备", foreground, background, 24);
        ShowChinese(STATUS_VALUE_X, 46, "正常", LCD_GREEN, background, 24);
        ShowChinese(80, 76, "风险等级", foreground, background, 24);
        ShowChinese(192, 76, "正常", LCD_GREEN, background, 24);
    }

    lcd_draw_line(12, 106, 307, 106, foreground);
    if (HasAlertContext(snapshot)) ShowAlertContext(snapshot, foreground, background);
    else ShowDeviceContext(snapshot, foreground, background);
    ShowProtocolStatus(snapshot, foreground, background);
    g_rendered_snapshot = *snapshot;
    g_has_rendered_snapshot = true;
}
