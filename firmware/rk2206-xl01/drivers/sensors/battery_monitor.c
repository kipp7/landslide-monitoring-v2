#include "battery_monitor.h"

#include <stddef.h>
#include <string.h>

#include "iot_adc.h"
#include "iot_errno.h"
#include "los_task.h"

#include "../../app/battery_estimator.h"
#include "../../config/app_config.h"

static uint32_t g_filtered_pack_mv = 0U;

int BatteryMonitor_Init(void)
{
    // IoTAdcInit(0) is the BSP-owned PC0/SARADC path. It configures PC0 as an
    // analog input and never drives the battery divider node.
    return IoTAdcInit(BATTERY_ADC_CHANNEL) == IOT_SUCCESS ? 0 : -1;
}

int BatteryMonitor_Read(BatteryReading *reading)
{
    const BatteryEstimatorConfig config = {
        .adc_reference_mv = BATTERY_ADC_REFERENCE_MV,
        .adc_full_scale_counts = BATTERY_ADC_FULL_SCALE_COUNTS,
        .divider_top_ohms = BATTERY_DIVIDER_TOP_OHMS,
        .divider_bottom_ohms = BATTERY_DIVIDER_BOTTOM_OHMS,
        .calibration_gain_ppm = BATTERY_CALIBRATION_GAIN_PPM,
        .calibration_offset_mv = BATTERY_CALIBRATION_OFFSET_MV
    };
    uint16_t samples[BATTERY_ADC_SAMPLE_COUNT];
    unsigned int raw;
    uint16_t mean_raw;
    uint32_t pack_mv;
    size_t sample_count = 0U;
    size_t attempt;

    if (reading == NULL) {
        return -1;
    }
    memset(reading, 0, sizeof(*reading));

    for (attempt = 0U; attempt < BATTERY_ADC_SAMPLE_COUNT; ++attempt) {
        if (IoTAdcGetVal(BATTERY_ADC_CHANNEL, &raw) == IOT_SUCCESS &&
            raw < BATTERY_ADC_FULL_SCALE_COUNTS) {
            samples[sample_count++] = (uint16_t)raw;
        }
        if (attempt + 1U < BATTERY_ADC_SAMPLE_COUNT) {
            LOS_Msleep(BATTERY_ADC_SAMPLE_DELAY_MS);
        }
    }
    if (sample_count < BATTERY_ADC_MIN_VALID_SAMPLES ||
        BatteryEstimator_TrimmedMeanRaw(
            samples,
            sample_count,
            BATTERY_ADC_TRIM_EACH_SIDE,
            &mean_raw
        ) != 0) {
        return -1;
    }

    pack_mv = BatteryEstimator_RawToPackMv(mean_raw, &config);
    if (pack_mv < BATTERY_VALID_MIN_MV || pack_mv > BATTERY_VALID_MAX_MV) {
        return -1;
    }
    g_filtered_pack_mv = BatteryEstimator_FilterPackMv(
        g_filtered_pack_mv,
        pack_mv,
        BATTERY_FILTER_SHIFT
    );

    reading->raw_adc = mean_raw;
    reading->pack_voltage_mv = g_filtered_pack_mv;
    reading->percentage = BatteryEstimator_PercentFromPackMv(g_filtered_pack_mv);
    reading->estimate_quality = BATTERY_CALIBRATION_VERIFIED ?
        BATTERY_ESTIMATE_QUALITY_FIELD_CALIBRATED :
        BATTERY_ESTIMATE_QUALITY_DEFAULT_CALIBRATION;
    return 0;
}
