#include "battery_estimator.h"

#include <limits.h>

#define BATTERY_ESTIMATOR_MAX_SAMPLES 32U
#define BATTERY_CALIBRATION_PPM_BASE 1000000ULL

typedef struct {
    uint16_t millivolts;
    uint8_t percent;
} BatterySocPoint;

// Resting-voltage approximation for a 3S lithium-ion pack. Runtime load,
// temperature and cell aging remain observable error sources; field calibration
// corrects divider/reference gain but cannot turn voltage-only SOC into coulomb counting.
static const BatterySocPoint g_soc_curve[] = {
    {9810U, 0U},
    {10830U, 5U},
    {11070U, 10U},
    {11130U, 15U},
    {11190U, 20U},
    {11250U, 25U},
    {11310U, 30U},
    {11370U, 35U},
    {11400U, 40U},
    {11460U, 45U},
    {11520U, 50U},
    {11550U, 55U},
    {11610U, 60U},
    {11730U, 65U},
    {11850U, 70U},
    {11940U, 75U},
    {12060U, 80U},
    {12240U, 85U},
    {12330U, 90U},
    {12450U, 95U},
    {12600U, 100U}
};

int BatteryEstimator_TrimmedMeanRaw(
    const uint16_t *samples,
    size_t sample_count,
    size_t trim_each_side,
    uint16_t *result
)
{
    uint16_t sorted[BATTERY_ESTIMATOR_MAX_SAMPLES];
    uint32_t sum = 0U;
    size_t kept;
    size_t index;
    size_t inner;

    if (samples == NULL || result == NULL || sample_count == 0U ||
        sample_count > BATTERY_ESTIMATOR_MAX_SAMPLES ||
        trim_each_side * 2U >= sample_count) {
        return -1;
    }

    for (index = 0U; index < sample_count; ++index) {
        sorted[index] = samples[index];
    }
    for (index = 1U; index < sample_count; ++index) {
        uint16_t value = sorted[index];
        inner = index;
        while (inner > 0U && sorted[inner - 1U] > value) {
            sorted[inner] = sorted[inner - 1U];
            --inner;
        }
        sorted[inner] = value;
    }

    kept = sample_count - trim_each_side * 2U;
    for (index = trim_each_side; index < sample_count - trim_each_side; ++index) {
        sum += sorted[index];
    }
    *result = (uint16_t)((sum + (uint32_t)(kept / 2U)) / (uint32_t)kept);
    return 0;
}

uint32_t BatteryEstimator_RawToPackMv(
    uint16_t raw_adc,
    const BatteryEstimatorConfig *config
)
{
    uint64_t numerator;
    uint64_t denominator;
    uint64_t uncalibrated_mv;
    int64_t calibrated_mv;

    if (config == NULL || config->adc_reference_mv == 0U ||
        config->adc_full_scale_counts == 0U || config->divider_bottom_ohms == 0U ||
        config->calibration_gain_ppm == 0U) {
        return 0U;
    }

    numerator = (uint64_t)raw_adc * (uint64_t)config->adc_reference_mv *
                ((uint64_t)config->divider_top_ohms + (uint64_t)config->divider_bottom_ohms);
    denominator = (uint64_t)config->adc_full_scale_counts *
                  (uint64_t)config->divider_bottom_ohms;
    uncalibrated_mv = (numerator + denominator / 2ULL) / denominator;

    calibrated_mv = (int64_t)((uncalibrated_mv * config->calibration_gain_ppm +
                               BATTERY_CALIBRATION_PPM_BASE / 2ULL) /
                              BATTERY_CALIBRATION_PPM_BASE) +
                    config->calibration_offset_mv;
    if (calibrated_mv <= 0) {
        return 0U;
    }
    if ((uint64_t)calibrated_mv > UINT_MAX) {
        return UINT_MAX;
    }
    return (uint32_t)calibrated_mv;
}

uint8_t BatteryEstimator_PercentFromPackMv(uint32_t pack_mv)
{
    size_t index;

    if (pack_mv <= g_soc_curve[0].millivolts) {
        return g_soc_curve[0].percent;
    }
    for (index = 1U; index < sizeof(g_soc_curve) / sizeof(g_soc_curve[0]); ++index) {
        const BatterySocPoint *low = &g_soc_curve[index - 1U];
        const BatterySocPoint *high = &g_soc_curve[index];
        if (pack_mv <= high->millivolts) {
            uint32_t voltage_span = (uint32_t)high->millivolts - (uint32_t)low->millivolts;
            uint32_t percent_span = (uint32_t)high->percent - (uint32_t)low->percent;
            uint32_t offset = pack_mv - (uint32_t)low->millivolts;
            return (uint8_t)((uint32_t)low->percent +
                             (offset * percent_span + voltage_span / 2U) / voltage_span);
        }
    }
    return 100U;
}

uint32_t BatteryEstimator_FilterPackMv(
    uint32_t previous_mv,
    uint32_t sample_mv,
    uint8_t shift
)
{
    int64_t delta;
    int64_t filtered;

    if (previous_mv == 0U || shift == 0U) {
        return sample_mv;
    }
    if (shift > 15U) {
        shift = 15U;
    }
    delta = (int64_t)sample_mv - (int64_t)previous_mv;
    filtered = (int64_t)previous_mv + delta / (int64_t)(1U << shift);
    if (filtered < 0) {
        return 0U;
    }
    return (uint32_t)filtered;
}
