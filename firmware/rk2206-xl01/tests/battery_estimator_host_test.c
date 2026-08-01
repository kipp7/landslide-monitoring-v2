#include <assert.h>
#include <stdio.h>

#include "../app/battery_estimator.h"

int main(void)
{
    const BatteryEstimatorConfig config = {
        .adc_reference_mv = 3300U,
        .adc_full_scale_counts = 1024U,
        .divider_top_ohms = 100000U,
        .divider_bottom_ohms = 27000U,
        .calibration_gain_ppm = 1000000U,
        .calibration_offset_mv = 0
    };
    const uint16_t noisy_samples[] = {
        800U, 801U, 802U, 799U, 120U, 803U, 800U, 801U,
        1023U, 800U, 799U, 802U, 801U, 800U, 798U, 802U
    };
    uint16_t mean = 0U;
    uint32_t pack_mv;
    BatteryEstimatorConfig calibrated_config = config;

    assert(BatteryEstimator_TrimmedMeanRaw(noisy_samples, 16U, 2U, &mean) == 0);
    assert(mean >= 799U && mean <= 802U);
    assert(BatteryEstimator_TrimmedMeanRaw(noisy_samples, 2U, 1U, &mean) != 0);

    pack_mv = BatteryEstimator_RawToPackMv(830U, &config);
    assert(pack_mv == 12581U);
    calibrated_config.calibration_gain_ppm = 1005000U;
    calibrated_config.calibration_offset_mv = -10;
    assert(BatteryEstimator_RawToPackMv(830U, &calibrated_config) == 12634U);
    assert(BatteryEstimator_PercentFromPackMv(9000U) == 0U);
    assert(BatteryEstimator_PercentFromPackMv(11100U) == 13U);
    assert(BatteryEstimator_PercentFromPackMv(11520U) == 50U);
    assert(BatteryEstimator_PercentFromPackMv(12060U) == 80U);
    assert(BatteryEstimator_PercentFromPackMv(12600U) == 100U);
    assert(BatteryEstimator_PercentFromPackMv(12700U) == 100U);
    assert(BatteryEstimator_FilterPackMv(12000U, 11200U, 3U) == 11900U);
    assert(BatteryEstimator_FilterPackMv(0U, 11200U, 3U) == 11200U);

    printf("battery_estimator mean_raw=%u pack_mv=%u soc=%u\n",
           mean,
           pack_mv,
           BatteryEstimator_PercentFromPackMv(pack_mv));
    return 0;
}
