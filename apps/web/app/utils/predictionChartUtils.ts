/**
 * 预测图表数据处理工具 - 专业时间序列可视化解决方案
 * 
 * 基于时间序列分析最佳实践和IEEE标准
 * 解决历史数据与预测数据的可视化衔接问题
 * 
 * @author 系统架构师
 * @version 2.0.0 - 企业级优化版本
 * @date 2025-01-XX
 */

export interface ChartDataPoint {
  timestamp: string;
  value: number;
  displacement?: number;
  time?: string;
}

export interface PredictionData {
  values: number[];
  horizon: string;
  confidence: number;
  method: string;
  shortTerm?: {
    values: number[];
    horizon: string;
    confidence: number;
    method: string;
  };
  longTerm?: {
    values: number[];
    horizon: string;
    confidence: number;
    method: string;
  };
  confidenceIntervals?: any;
  normalizationParams?: any;
}

export interface ConfidenceIntervalData {
  upperBounds: number[];
  lowerBounds: number[];
  confidence: number;
  uncertainty: number[];
  metadata: {
    calculationMethod: string;
    errorStd: number;
    totalUncertainty: number;
  };
}

export interface ProcessedChartData {
  historical: {
    times: string[];
    values: number[];
    count: number;
  };
  shortTerm: {
    times: string[];
    values: number[];
    count: number;
    confidence: ConfidenceIntervalData | null;
  };
  longTerm: {
    times: string[];
    values: number[];
    count: number;
    confidence: ConfidenceIntervalData | null;
  };
  metadata: {
    processingOptions: ChartProcessingOptions;
    dataQuality: {
      historicalValid: boolean;
      shortTermValid: boolean;
      longTermValid: boolean;
      confidenceValid: boolean;
    };
  };
}

export interface ChartProcessingOptions {
  historicalWindow?: 'adaptive' | 'fixed' | 'smart';
  historicalWindowSize?: number;
  smoothTransition?: boolean;
  confidenceInterval?: boolean; // 重新启用置信区间
  adaptiveScaling?: boolean;
  trendContinuity?: boolean;
}

/**
 * 计算最优历史数据窗口
 */
export function calculateOptimalHistoricalWindow(
  historicalData: ChartDataPoint[],
  options: ChartProcessingOptions = {}
): ChartDataPoint[] {
  const { historicalWindow = 'adaptive', historicalWindowSize = 100 } = options;
  
  if (historicalData.length <= historicalWindowSize) {
    return historicalData;
  }
  
  // 自适应窗口：选择最近的数据点
  if (historicalWindow === 'adaptive') {
    return historicalData.slice(-historicalWindowSize);
  }
  
  // 固定窗口：选择指定大小的窗口
  if (historicalWindow === 'fixed') {
    const startIndex = Math.max(0, historicalData.length - historicalWindowSize);
    return historicalData.slice(startIndex);
  }
  
  // 智能窗口：基于数据变化选择窗口
  if (historicalWindow === 'smart') {
    return calculateSmartWindow(historicalData, historicalWindowSize);
  }
  
  return historicalData.slice(-historicalWindowSize);
}

/**
 * 智能窗口计算
 */
function calculateSmartWindow(data: ChartDataPoint[], targetSize: number): ChartDataPoint[] {
  if (data.length <= targetSize) {
    return data;
  }
  
  // 计算数据变化率
  const changes = [];
  for (let i = 1; i < data.length; i++) {
    const change = Math.abs(data[i].value - data[i-1].value);
    changes.push(change);
  }
  
  // 找到变化最大的区域
  const windowSize = Math.min(targetSize, data.length);
  let maxVariation = 0;
  let bestStartIndex = 0;
  
  for (let i = 0; i <= data.length - windowSize; i++) {
    const windowChanges = changes.slice(i, i + windowSize - 1);
    const variation = windowChanges.reduce((sum, val) => sum + val, 0);
    
    if (variation > maxVariation) {
      maxVariation = variation;
      bestStartIndex = i;
    }
  }
  
  return data.slice(bestStartIndex, bestStartIndex + windowSize);
}

/**
 * 生成预测时间轴
 */
export function generatePredictionTimes(
  lastHistoricalTime: string,
  predictionLength: number,
  unit: 'hour' | 'day' = 'hour'
): string[] {
  const times = [];
  const lastTime = new Date(lastHistoricalTime);
  
  for (let i = 1; i <= predictionLength; i++) {
    const predictionTime = new Date(lastTime);
    if (unit === 'hour') {
      predictionTime.setHours(lastTime.getHours() + i);
    } else {
      predictionTime.setDate(lastTime.getDate() + i);
    }
    times.push(predictionTime.toISOString());
  }
  
  return times;
}

/**
 * 高级预测数据标准化处理
 * 基于统计学原理和连续性优化的反标准化算法
 */
export function smartDenormalizePrediction(
  normalizedValues: number[],
  historicalData: ChartDataPoint[],
  predictionMeta?: {
    normalizationParams?: { mean?: number; std?: number };
    method?: string;
  }
): number[] {
  
  if (!normalizedValues || normalizedValues.length === 0) return [];
  if (!historicalData || historicalData.length === 0) return normalizedValues;
  
  const displacements = historicalData.map(d => d.displacement).filter(v => v != null);
  if (displacements.length === 0) return normalizedValues;
  
  // 1. 检测是否需要反标准化
  const predictionRange = Math.max(...normalizedValues) - Math.min(...normalizedValues);
  const isNormalized = predictionRange < 2.0 && Math.abs(normalizedValues[0]) < 5.0;
  
  if (!isNormalized) {
    // 数据已经是原始单位，直接返回
    console.log('🔍 预测数据已为原始单位，无需反标准化');
    return normalizedValues;
  }
  
  // 2. 使用多种方法计算标准化参数
  const lastHistoricalValue = displacements[displacements.length - 1];
  
  // 方法A：使用元数据中的标准化参数
  if (predictionMeta?.normalizationParams) {
    const { mean = 0, std = 1 } = predictionMeta.normalizationParams;
    if (std > 0.001) {
      const denormalized = normalizedValues.map(val => val * std + mean);
      console.log('📊 使用元数据标准化参数:', { mean, std });
      return denormalized;
    }
  }
  
  // 方法B：基于最近数据的自适应标准化参数
  const recentSize = Math.min(50, displacements.length);
  const recentData = displacements.slice(-recentSize);
  const recentMean = recentData.reduce((sum, val) => sum + val, 0) / recentData.length;
  const recentVariance = recentData.reduce((sum, val) => sum + Math.pow(val - recentMean, 2), 0) / recentData.length;
  const recentStd = Math.sqrt(recentVariance);
  
  // 方法C：连续性约束优化
  // 确保第一个预测值与最后一个历史值平滑连接
  const firstNormalizedValue = normalizedValues[0];
  const targetContinuity = lastHistoricalValue;
  
  // 使用连续性约束求解标准化参数
  // 目标：firstNormalizedValue * std + mean = targetContinuity
  const continuityMean = targetContinuity - firstNormalizedValue * recentStd;
  
  // 选择最优的标准化参数
  let finalMean = continuityMean;
  let finalStd = recentStd;
  
  // 验证参数合理性
  const testDenormalized = normalizedValues.map(val => val * finalStd + finalMean);
  const testRange = Math.max(...testDenormalized) - Math.min(...testDenormalized);
  const historicalRange = Math.max(...recentData) - Math.min(...recentData);
  
  // 如果预测范围过大或过小，调整标准差
  if (testRange > historicalRange * 3) {
    finalStd = recentStd * 0.5;
    finalMean = targetContinuity - firstNormalizedValue * finalStd;
  } else if (testRange < historicalRange * 0.1) {
    finalStd = recentStd * 2;
    finalMean = targetContinuity - firstNormalizedValue * finalStd;
  }
  
  const denormalized = normalizedValues.map(val => val * finalStd + finalMean);
  
  console.log('🎯 智能反标准化结果:', {
    原始范围: `${Math.min(...normalizedValues).toFixed(3)} ~ ${Math.max(...normalizedValues).toFixed(3)}`,
    反标准化范围: `${Math.min(...denormalized).toFixed(3)} ~ ${Math.max(...denormalized).toFixed(3)}`,
    连续性误差: Math.abs(denormalized[0] - lastHistoricalValue).toFixed(3),
    使用参数: { mean: finalMean.toFixed(3), std: finalStd.toFixed(3) },
    历史上下文: `最近${recentSize}个点`
  });
  
  return denormalized;
}

/**
 * 优化趋势连续性
 */
export function optimizeTrendContinuity(
  historicalData: ChartDataPoint[],
  predictionValues: number[],
  options: ChartProcessingOptions = {}
): number[] {
  if (!options.trendContinuity || historicalData.length === 0 || predictionValues.length === 0) {
    return predictionValues;
  }
  
  const lastHistoricalValue = historicalData[historicalData.length - 1].value;
  const firstPredictionValue = predictionValues[0];
  
  // 计算趋势调整因子
  const trendAdjustment = (lastHistoricalValue - firstPredictionValue) * 0.1;
  
  // 应用平滑过渡
  return predictionValues.map((value, index) => {
    const decayFactor = Math.exp(-index * 0.1);
    return value + trendAdjustment * decayFactor;
  });
}

/**
 * 处理置信区间数据
 */
export function processConfidenceInterval(
  confidenceData: any,
  predictionType: 'shortTerm' | 'longTerm'
): ConfidenceIntervalData | null {
  try {
    if (!confidenceData || !confidenceData[predictionType]) {
      console.warn(`置信区间数据缺失: ${predictionType}`);
      return null;
    }

    const intervals = confidenceData[predictionType];
    if (!Array.isArray(intervals) || intervals.length === 0) {
      console.warn(`置信区间数据格式错误: ${predictionType}`);
      return null;
    }

    // 提取上下限数据
    const upperBounds = intervals.map((item: any) => {
      const upper = item.upper || item.prediction || 0;
      return Math.max(0, upper); // 确保不为负值
    });

    const lowerBounds = intervals.map((item: any) => {
      const lower = item.lower || item.prediction || 0;
      return Math.max(0, lower); // 确保不为负值
    });

    // 验证数据有效性
    const isValid = upperBounds.every((upper, index) => {
      const lower = lowerBounds[index];
      return upper >= lower && upper > 0 && lower >= 0;
    });

    if (!isValid) {
      console.warn(`置信区间数据无效: ${predictionType}`);
      return null;
    }

    const metadata = confidenceData.metadata || {};
    
    return {
      upperBounds,
      lowerBounds,
      confidence: metadata.confidenceLevel?.[predictionType] || 0.95,
      uncertainty: intervals.map((item: any) => item.uncertainty || 0),
      metadata: {
        calculationMethod: metadata.calculationMethod || 'unknown',
        errorStd: metadata.errorStd || 0,
        totalUncertainty: metadata.totalUncertainty || 0
      }
    };

  } catch (error) {
    console.error(`置信区间处理失败 (${predictionType}):`, error);
    return null;
  }
}

/**
 * 智能处理预测图表数据（包含置信区间）
 */
export function processChartDataForPrediction(
  historicalData: ChartDataPoint[],
  predictionData: PredictionData,
  options: ChartProcessingOptions = {}
): ProcessedChartData {
  try {
    console.log('开始处理预测图表数据...', {
      historicalCount: historicalData.length,
      shortTermCount: predictionData.shortTerm?.values?.length || 0,
      longTermCount: predictionData.longTerm?.values?.length || 0,
      options
    });

    // 1. 计算最优历史数据窗口
    const optimalWindow = calculateOptimalHistoricalWindow(historicalData, options);
    
    // 2. 智能反归一化预测数据
    const denormalizedShortTerm = smartDenormalizePrediction(
      predictionData.shortTerm?.values || [],
      historicalData,
      predictionData.normalizationParams
    );
    
    const denormalizedLongTerm = smartDenormalizePrediction(
      predictionData.longTerm?.values || [],
      historicalData,
      predictionData.normalizationParams
    );

    // 3. 处理置信区间数据
    let shortTermConfidence: ConfidenceIntervalData | null = null;
    let longTermConfidence: ConfidenceIntervalData | null = null;
    
    if (options.confidenceInterval && predictionData.confidenceIntervals) {
      shortTermConfidence = processConfidenceInterval(
        predictionData.confidenceIntervals,
        'shortTerm'
      );
      longTermConfidence = processConfidenceInterval(
        predictionData.confidenceIntervals,
        'longTerm'
      );
      
      console.log('置信区间处理结果:', {
        shortTerm: shortTermConfidence ? '成功' : '失败',
        longTerm: longTermConfidence ? '成功' : '失败'
      });
    }

    // 4. 优化趋势连续性
    const optimizedShortTerm = optimizeTrendContinuity(
      optimalWindow,
      denormalizedShortTerm,
      options
    );
    
    const optimizedLongTerm = optimizeTrendContinuity(
      optimalWindow,
      denormalizedLongTerm,
      options
    );

    // 5. 生成时间轴
    const historicalTimes = optimalWindow.map(point => point.timestamp);
    const shortTermTimes = generatePredictionTimes(
      historicalTimes[historicalTimes.length - 1],
      denormalizedShortTerm.length,
      'hour'
    );
    const longTermTimes = generatePredictionTimes(
      historicalTimes[historicalTimes.length - 1],
      denormalizedLongTerm.length,
      'hour'
    );

    const result = {
      historical: {
        times: historicalTimes,
        values: optimalWindow.map(point => point.value),
        count: optimalWindow.length
      },
      shortTerm: {
        times: shortTermTimes,
        values: optimizedShortTerm,
        count: optimizedShortTerm.length,
        confidence: shortTermConfidence
      },
      longTerm: {
        times: longTermTimes,
        values: optimizedLongTerm,
        count: optimizedLongTerm.length,
        confidence: longTermConfidence
      },
      metadata: {
        processingOptions: options,
        dataQuality: {
          historicalValid: optimalWindow.length > 0,
          shortTermValid: optimizedShortTerm.length > 0,
          longTermValid: optimizedLongTerm.length > 0,
          confidenceValid: !!(shortTermConfidence && longTermConfidence)
        }
      }
    };

    console.log('预测图表数据处理完成:', {
      historical: result.historical.count,
      shortTerm: result.shortTerm.count,
      longTerm: result.longTerm.count,
      confidenceAvailable: !!(shortTermConfidence && longTermConfidence)
    });

    return result;

  } catch (error) {
    console.error('预测图表数据处理失败:', error);
    throw error;
  }
}

// 移除置信区间计算函数