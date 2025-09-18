/**
 * 高仿真山体滑坡数据模拟引擎
 * 
 * 本模块基于一个简化的“降雨诱发型”滑坡模型，用于生成符合科学逻辑的模拟监测数据。
 * 核心逻辑：持续降雨 -> 土壤含水率上升 -> 超过阈值 -> 位移加速 -> 触发预警
 */

/**
 * 生成模拟的山体滑坡监测数据
 * @param {object} options - 模拟参数
 * @param {number} [options.durationHours=72] - 模拟持续的小时数，默认为72小时
 * @param {string} [options.scenario='heavyRain'] - 模拟情景，可选 'normal', 'heavyRain', 'continuousDrizzle'
 * @returns {Array<object>} - 返回一个包含逐小时监测数据的数组
 */
function generateLandslideData({ durationHours = 72, scenario = 'heavyRain' } = {}) {
  const data = [];
  const startTime = new Date();

  // 初始状态
  let displacement_mm = 10.0;
  let soilMoisture_pct = 35.0;

  // 模拟参数配置
  const scenarios = {
    normal: {
      rainfallPattern: () => Math.random() * 2, // 少量随机降雨
      moistureThreshold: 95, // 极高的触发阈值，基本不会触发
    },
    heavyRain: {
      // 模拟一场特大暴雨，在模拟周期的 1/3 处开始，持续 1/3
      rainfallPattern: (hour) => {
        if (hour > durationHours / 3 && hour < (durationHours * 2) / 3) {
          return 10 + Math.random() * 20; // 强降雨
        }
        return Math.random() * 2;
      },
      moistureThreshold: 75, // 较容易触发的阈值
    },
    continuousDrizzle: {
      // 模拟连绵的毛毛雨
      rainfallPattern: () => 3 + Math.random() * 3,
      moistureThreshold: 85, // 阈值较高，需要更长时间的累积
    },
  };

  const config = scenarios[scenario] || scenarios.heavyRain;

  for (let hour = 0; hour < durationHours; hour++) {
    const currentTime = new Date(startTime.getTime() + hour * 60 * 60 * 1000);
    
    // 1. 计算当前小时的降雨量
    const rainfall_mm = config.rainfallPattern(hour);

    // 2. 更新土壤含水率
    // 降雨会增加湿度，无降雨则会缓慢蒸发减少
    const moistureIncrease = rainfall_mm * 0.5;
    const moistureDecrease = 1.0;
    soilMoisture_pct += moistureIncrease - moistureDecrease;
    soilMoisture_pct = Math.max(30, Math.min(100, soilMoisture_pct)); // 保证湿度在合理范围

    // 3. 计算位移变化
    let displacementIncrease = Math.random() * 0.1; // 基础背景噪音
    
    // 核心逻辑：当土壤含水率超过阈值，位移开始加速
    if (soilMoisture_pct > config.moistureThreshold) {
      const excessMoisture = soilMoisture_pct - config.moistureThreshold;
      // 使用指数函数来模拟加速蠕变过程
      displacementIncrease += Math.pow(excessMoisture / 10, 2) + Math.random() * 0.5;
    }
    
    displacement_mm += displacementIncrease;

    data.push({
      timestamp: currentTime.toISOString(),
      sensorId: 'A-01',
      rainfall_mm: parseFloat(rainfall_mm.toFixed(2)),
      soilMoisture_pct: parseFloat(soilMoisture_pct.toFixed(2)),
      displacement_mm: parseFloat(displacement_mm.toFixed(2)),
    });
  }

  return data;
}

// 方便在Node.js环境中直接测试
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { generateLandslideData };
}

// 示例：生成一次暴雨场景的数据并打印
const sampleData = generateLandslideData({ scenario: 'heavyRain', durationHours: 72 });
console.log(JSON.stringify(sampleData, null, 2));
