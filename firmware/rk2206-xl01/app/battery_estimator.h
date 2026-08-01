#ifndef APP_BATTERY_ESTIMATOR_H
#define APP_BATTERY_ESTIMATOR_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint32_t adc_reference_mv;
    uint32_t adc_full_scale_counts;
    uint32_t divider_top_ohms;
    uint32_t divider_bottom_ohms;
    uint32_t calibration_gain_ppm;
    int32_t calibration_offset_mv;
} BatteryEstimatorConfig;

int BatteryEstimator_TrimmedMeanRaw(
    const uint16_t *samples,
    size_t sample_count,
    size_t trim_each_side,
    uint16_t *result
);

uint32_t BatteryEstimator_RawToPackMv(
    uint16_t raw_adc,
    const BatteryEstimatorConfig *config
);

uint8_t BatteryEstimator_PercentFromPackMv(uint32_t pack_mv);

uint32_t BatteryEstimator_FilterPackMv(
    uint32_t previous_mv,
    uint32_t sample_mv,
    uint8_t shift
);

#ifdef __cplusplus
}
#endif

#endif // APP_BATTERY_ESTIMATOR_H
