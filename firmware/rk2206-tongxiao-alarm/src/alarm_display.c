#include "tongxiao_alarm.h"

#include <ctype.h>
#include <stdio.h>
#include <string.h>

#include "lcd.h"

static bool g_lcd_ready;

static void Show(uint16_t x, uint16_t y, const char *text, uint16_t fg, uint16_t bg, uint8_t size)
{
    lcd_show_string(x, y, (const uint8_t *)text, fg, bg, size, 0);
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
    if (snapshot->desired.state == ALARM_STATE_ACTIVE) {
        background = LCD_RED;
        foreground = LCD_WHITE;
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED) {
        background = LCD_YELLOW;
        foreground = LCD_BLACK;
    } else {
        background = LCD_WHITE;
        foreground = LCD_DARKBLUE;
    }

    lcd_fill(0, 0, LCD_W, LCD_H, background);
    Show(16, 12, "LANDSLIDE ALARM TERMINAL", foreground, background, 24);
    lcd_draw_line(12, 44, 307, 44, foreground);

    if (snapshot->desired.state == ALARM_STATE_ACTIVE) {
        snprintf(line, sizeof(line), "RISK: %s", AlarmSeverity_Name(snapshot->desired.severity));
        Show(16, 62, line, foreground, background, 32);
        Show(16, 104,
            snapshot->desired.severity == ALARM_SEVERITY_CRITICAL ? "EVACUATE NOW" : "LEAVE SLOPE AREA",
            foreground, background, 24);
    } else if (snapshot->desired.state == ALARM_STATE_SILENCED) {
        Show(16, 62, "ALARM SILENCED", foreground, background, 32);
        Show(16, 104, "WAIT FOR REVIEW", foreground, background, 24);
    } else if (snapshot->desired.display == ALARM_DISPLAY_ALL_CLEAR) {
        Show(16, 62, "ALL CLEAR", LCD_GREEN, background, 32);
        Show(16, 104, "FOLLOW STAFF INSTRUCTIONS", foreground, background, 16);
    } else {
        Show(16, 62, "STANDBY", LCD_GREEN, background, 32);
        Show(16, 104, "SERVER CONTROLS RISK STATE", foreground, background, 16);
    }

    SafeAscii(station, sizeof(station), snapshot->desired.station_id);
    SafeAscii(alert, sizeof(alert), snapshot->desired.alert_id);
    snprintf(line, sizeof(line), "SITE: %s", station[0] ? station : "--");
    Show(16, 146, line, foreground, background, 16);
    snprintf(line, sizeof(line), "ALERT: %s", alert[0] ? alert : "--");
    Show(16, 166, line, foreground, background, 16);
    snprintf(line, sizeof(line), "REV: %llu", (unsigned long long)snapshot->desired.revision);
    Show(16, 186, line, foreground, background, 16);
    snprintf(line, sizeof(line), "WIFI:%s  MQTT:%s",
        snapshot->wifi_connected ? "OK" : "DOWN",
        snapshot->mqtt_connected ? "OK" : "DOWN");
    Show(16, 214, line, foreground, background, 16);
}
