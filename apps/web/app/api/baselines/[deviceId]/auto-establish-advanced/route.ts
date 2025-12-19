import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_JWT'
);

/**
 * 专业级基准点自动建立API
 * 基于稳定期检测、异常值过滤和质量评估的智能算法
 * POST /api/baselines/[deviceId]/auto-establish-advanced
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;

  try {
    console.log('🎯 启动专业级基准点自动建立，deviceId:', deviceId);
    
    const body = await request.json();
    const {
      analysisHours = 24,             // 分析时间窗口(小时) - 增加到24小时
      requiredQuality = 'fair',       // 要求的质量等级 - 降低到fair
      maxRetries = 3,                 // 最大重试次数
      establishedBy = '智能系统建立',
      notes = '基于专业算法自动建立的基准点'
    } = body;

    // 配置参数
    const config = {
      stability: {
        maxMovementPerHour: 5.0,      // 每小时最大移动距离(米) - 放宽到5米
        minStableDuration: 1 * 3600,  // 最少稳定持续时间(秒) - 降低到1小时
        stabilityWindow: 1800,        // 稳定性评估窗口(秒) - 降低到30分钟
      },
      dataQuality: {
        minDataPoints: 20,            // 最少数据点数 - 从50降低到20
        maxDataGap: 600,              // 最大数据间隔(秒) - 放宽到10分钟
        minGpsAccuracy: 10.0,         // 最低GPS精度要求(米) - 放宽到10米
        maxOutlierRatio: 0.2,         // 最大异常值比例 - 放宽到20%
      },
      qualityLevels: {
        excellent: { score: 0.90, precision: 1.0 },
        good:      { score: 0.80, precision: 2.0 },
        fair:      { score: 0.65, precision: 5.0 },
        poor:      { score: 0.50, precision: 10.0 }
      }
    };

    // 步骤1: 获取数据库中实际存在的GPS数据（不基于当前时间）
    console.log('🔍 查询数据库中实际的GPS数据...');
    
    // 首先获取该设备的所有GPS数据，了解实际时间范围
    const { data: allGpsData, error: allGpsError } = await supabase
      .from('iot_data')
      .select('latitude, longitude, event_time')
      .eq('device_id', deviceId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('event_time', { ascending: true })
      .limit(1000);
      
    console.log(`📊 找到设备${deviceId}的GPS数据总量:`, allGpsData?.length || 0);
    
    let rawData = null;
    let dataError = allGpsError;
    
    if (allGpsData && allGpsData.length > 0) {
      // 根据数据量选择合适的分析时间段
      if (allGpsData.length >= 100) {
        // 数据充足，取最早的analysisHours小时
        const earliestTime = new Date(allGpsData[0].event_time);
        const analysisEndTime = new Date(earliestTime.getTime() + analysisHours * 60 * 60 * 1000);
        
        console.log(`⏰ 分析时间段: ${earliestTime.toISOString()} 到 ${analysisEndTime.toISOString()}`);
        
        rawData = allGpsData.filter(d => {
          const dataTime = new Date(d.event_time);
          return dataTime >= earliestTime && dataTime <= analysisEndTime;
        });
        
        console.log(`📈 分析时间段内的数据量:`, rawData.length);
      } else {
        // 数据不多，使用所有可用数据
        console.log('📊 数据量较少，使用所有可用数据进行分析');
        rawData = allGpsData;
      }
    } else {
      dataError = allGpsError || { message: '未找到GPS数据', details: '', hint: '', code: '', name: 'NoDataError' };
    }

    if (dataError) {
      throw new Error(`获取GPS数据失败: ${dataError.message}`);
    }

    if (!rawData || rawData.length < config.dataQuality.minDataPoints) {
      return NextResponse.json({
        success: false,
        error: `数据点不足，需要至少${config.dataQuality.minDataPoints}个点，当前只有${rawData?.length || 0}个点`,
        recommendation: `建议等待更多数据或延长分析时间窗口至${analysisHours * 2}小时`
      }, { status: 400 });
    }

    // 步骤2: 稳定期检测
    const stabilityAnalysis = await analyzeStability(rawData, config);
    console.log('📊 稳定性分析结果:', stabilityAnalysis);

    if (stabilityAnalysis.stabilityScore < (config.qualityLevels as any)[requiredQuality].score) {
      return NextResponse.json({
        success: false,
        error: `设备稳定性不足，当前评分: ${stabilityAnalysis.stabilityScore.toFixed(3)}，要求评分: ${(config.qualityLevels as any)[requiredQuality].score}`,
        analysis: stabilityAnalysis,
        recommendation: '设备可能正在移动或GPS信号不稳定，建议等待设备稳定后再试'
      }, { status: 400 });
    }

    // 步骤3: 智能异常值过滤
    const filteredData = await filterOutliersAdvanced(rawData, config);
    console.log(`🔍 异常值过滤: ${rawData.length} → ${filteredData.length} 个点`);

    if (filteredData.length < config.dataQuality.minDataPoints) {
      return NextResponse.json({
        success: false,
        error: `过滤后数据点不足，过滤前${rawData.length}个点，过滤后${filteredData.length}个点`,
        recommendation: '数据质量较差，建议检查GPS设备状态或延长数据采集时间'
      }, { status: 400 });
    }

    // 步骤4: 精确基准点计算
    const baseline = await calculatePreciseBaseline(filteredData, config);
    console.log('📍 精确基准点计算完成:', baseline);

    // 步骤5: 质量评估
    const qualityAssessment = await assessBaselineQuality(baseline, filteredData, config);
    console.log('⭐ 质量评估结果:', qualityAssessment);

    if (qualityAssessment.overallScore < (config.qualityLevels as any)[requiredQuality].score) {
      return NextResponse.json({
        success: false,
        error: `基准点质量不达标，当前评分: ${qualityAssessment.overallScore.toFixed(3)}，要求评分: ${(config.qualityLevels as any)[requiredQuality].score}`,
        qualityAssessment: qualityAssessment,
        recommendation: qualityAssessment.recommendations.join('; ')
      }, { status: 400 });
    }

    // 步骤6: 保存高质量基准点
    const { data: baselineData, error: baselineError } = await supabase
      .from('gps_baselines')
      .upsert({
        device_id: deviceId,
        baseline_latitude: baseline.latitude,
        baseline_longitude: baseline.longitude,
        baseline_altitude: baseline.altitude || null,
        established_by: establishedBy,
        data_points_used: filteredData.length,
        position_accuracy: baseline.precision,
        confidence_level: qualityAssessment.overallScore,
        status: 'active',
        established_time: new Date().toISOString(),
        notes: `${notes}。${qualityAssessment.qualityGrade}级质量(${(qualityAssessment.overallScore * 100).toFixed(1)}%)，精度${baseline.precision.toFixed(2)}米`
      })
      .select()
      .single();

    if (baselineError) {
      throw new Error(`保存基准点失败: ${baselineError.message}`);
    }

    // 步骤7: 保存质量评估记录
    await supabase
      .from('baseline_quality_assessments')
      .insert({
        device_id: deviceId,
        assessment_time: new Date().toISOString(),
        drift_rate: baseline.driftRate || 0,
        stability_score: stabilityAnalysis.stabilityScore,
        data_quality_score: qualityAssessment.dataQualityScore,
        confidence_score: qualityAssessment.overallScore,
        data_points_analyzed: filteredData.length,
        analysis_period_hours: analysisHours,
        outliers_removed: rawData.length - filteredData.length,
        overall_grade: qualityAssessment.qualityGrade,
        recommendations: qualityAssessment.recommendations,
        algorithm_version: '2.0-professional'
      });

    return NextResponse.json({
      success: true,
      data: baselineData,
      message: `专业级基准点建立成功！质量等级: ${qualityAssessment.qualityGrade}`,
      analysis: {
        dataAnalysis: {
          totalDataPoints: rawData.length,
          filteredDataPoints: filteredData.length,
          outliersRemoved: rawData.length - filteredData.length,
          analysisTimeSpan: `${analysisHours}小时`,
          dataTimeRange: {
            start: filteredData[0].event_time,
            end: filteredData[filteredData.length - 1].event_time
          }
        },
        stabilityAnalysis: stabilityAnalysis,
        qualityAssessment: qualityAssessment,
        baseline: {
          coordinates: {
            latitude: baseline.latitude,
            longitude: baseline.longitude,
            altitude: baseline.altitude
          },
          precision: baseline.precision,
          driftRate: baseline.driftRate,
          establishedTime: new Date().toISOString()
        }
      }
    });

  } catch (error) {
    console.error(`专业级基准点建立失败:`, error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '专业级基准点建立失败',
      recommendation: '请检查设备状态和数据质量，或联系技术支持'
    }, { status: 500 });
  }
}

// 稳定性分析函数
async function analyzeStability(data: any[], config: any) {
  if (data.length < 2) {
    return { stabilityScore: 0, movements: [], analysis: '数据点不足' };
  }

  const movements = [];
  let totalMovement = 0;
  
  for (let i = 1; i < data.length; i++) {
    const prev = data[i - 1];
    const curr = data[i];
    
    // 计算移动距离(米)
    const movement = calculateDistance(
      prev.latitude, prev.longitude,
      curr.latitude, curr.longitude
    );
    
    // 计算时间间隔(秒)
    const timeInterval = (new Date(curr.event_time).getTime() - new Date(prev.event_time).getTime()) / 1000;
    
    movements.push({
      distance: movement,
      timeInterval: timeInterval,
      speed: movement / (timeInterval / 3600) // 米/小时
    });
    
    totalMovement += movement;
  }

  const avgMovement = totalMovement / movements.length;
  const maxMovement = Math.max(...movements.map(m => m.distance));
  const avgSpeed = movements.reduce((sum, m) => sum + m.speed, 0) / movements.length;

  // 稳定性评分 (0-1)
  let stabilityScore = 1.0;
  
  // 基于平均移动距离扣分
  if (avgMovement > config.stability.maxMovementPerHour) {
    stabilityScore -= (avgMovement - config.stability.maxMovementPerHour) * 0.1;
  }
  
  // 基于最大移动距离扣分
  if (maxMovement > config.stability.maxMovementPerHour * 2) {
    stabilityScore -= 0.2;
  }
  
  // 基于移动速度扣分
  if (avgSpeed > config.stability.maxMovementPerHour) {
    stabilityScore -= 0.1;
  }

  stabilityScore = Math.max(0, Math.min(1, stabilityScore));

  return {
    stabilityScore,
    avgMovement,
    maxMovement,
    avgSpeed,
    totalDataPoints: data.length,
    movements: movements.length,
    analysis: `平均移动${avgMovement.toFixed(2)}米，最大移动${maxMovement.toFixed(2)}米，平均速度${avgSpeed.toFixed(2)}米/小时`
  };
}

// 高级异常值过滤函数
async function filterOutliersAdvanced(data: any[], config: any) {
  if (data.length < 10) return data;

  // 计算四分位数
  const latitudes = data.map(d => parseFloat(d.latitude)).sort((a, b) => a - b);
  const longitudes = data.map(d => parseFloat(d.longitude)).sort((a, b) => a - b);
  
  const getQuartiles = (arr: number[]) => {
    const q1 = arr[Math.floor(arr.length * 0.25)];
    const q3 = arr[Math.floor(arr.length * 0.75)];
    const iqr = q3 - q1;
    return { q1, q3, iqr };
  };

  const latQuartiles = getQuartiles(latitudes);
  const lonQuartiles = getQuartiles(longitudes);

  // IQR异常值过滤
  const iqrFiltered = data.filter(d => {
    const lat = parseFloat(d.latitude);
    const lon = parseFloat(d.longitude);
    
    const latValid = lat >= (latQuartiles.q1 - 1.5 * latQuartiles.iqr) && 
                     lat <= (latQuartiles.q3 + 1.5 * latQuartiles.iqr);
    const lonValid = lon >= (lonQuartiles.q1 - 1.5 * lonQuartiles.iqr) && 
                     lon <= (lonQuartiles.q3 + 1.5 * lonQuartiles.iqr);
    
    return latValid && lonValid;
  });

  // 基于移动距离的物理过滤
  const physicalFiltered = [];
  if (iqrFiltered.length > 0) {
    physicalFiltered.push(iqrFiltered[0]);
    
    for (let i = 1; i < iqrFiltered.length; i++) {
      const prev = physicalFiltered[physicalFiltered.length - 1];
      const curr = iqrFiltered[i];
      
      const distance = calculateDistance(
        prev.latitude, prev.longitude,
        curr.latitude, curr.longitude
      );
      
      // 排除异常大的移动距离
      if (distance <= 50) { // 50米阈值
        physicalFiltered.push(curr);
      }
    }
  }

  return physicalFiltered;
}

// 精确基准点计算函数
async function calculatePreciseBaseline(data: any[], config: any) {
  const latitudes = data.map(d => parseFloat(d.latitude));
  const longitudes = data.map(d => parseFloat(d.longitude));
  
  // 加权平均(给最近的数据点更高权重)
  let weightedLatSum = 0;
  let weightedLonSum = 0;
  let totalWeight = 0;
  
  data.forEach((point, index) => {
    const weight = Math.exp(-index * 0.01); // 指数衰减权重
    weightedLatSum += parseFloat(point.latitude) * weight;
    weightedLonSum += parseFloat(point.longitude) * weight;
    totalWeight += weight;
  });
  
  const avgLatitude = weightedLatSum / totalWeight;
  const avgLongitude = weightedLonSum / totalWeight;
  
  // 计算精度(标准差)
  const latStd = Math.sqrt(
    latitudes.reduce((sum, lat) => sum + Math.pow(lat - avgLatitude, 2), 0) / latitudes.length
  );
  const lonStd = Math.sqrt(
    longitudes.reduce((sum, lon) => sum + Math.pow(lon - avgLongitude, 2), 0) / longitudes.length
  );
  
  const precision = Math.max(latStd, lonStd) * 111000; // 转换为米
  
  // 计算漂移率(如果有足够数据)
  let driftRate = 0;
  if (data.length > 10) {
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));
    
    const firstAvgLat = firstHalf.reduce((sum, d) => sum + parseFloat(d.latitude), 0) / firstHalf.length;
    const firstAvgLon = firstHalf.reduce((sum, d) => sum + parseFloat(d.longitude), 0) / firstHalf.length;
    const secondAvgLat = secondHalf.reduce((sum, d) => sum + parseFloat(d.latitude), 0) / secondHalf.length;
    const secondAvgLon = secondHalf.reduce((sum, d) => sum + parseFloat(d.longitude), 0) / secondHalf.length;
    
    const drift = calculateDistance(firstAvgLat, firstAvgLon, secondAvgLat, secondAvgLon);
    const timeSpan = (new Date(data[data.length - 1].event_time).getTime() - new Date(data[0].event_time).getTime()) / (1000 * 60 * 60 * 24); // 天数
    
    driftRate = drift / timeSpan; // 米/天
  }
  
  return {
    latitude: avgLatitude,
    longitude: avgLongitude,
    altitude: null, // 可以后续添加高程数据
    precision: precision,
    driftRate: driftRate
  };
}

// 质量评估函数
async function assessBaselineQuality(baseline: any, data: any[], config: any) {
  // 稳定性评分
  const distances = data.map(d => calculateDistance(
    parseFloat(d.latitude), parseFloat(d.longitude),
    baseline.latitude, baseline.longitude
  ));
  
  const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;
  const maxDistance = Math.max(...distances);
  const within2m = distances.filter(d => d <= 2.0).length / distances.length;
  const within5m = distances.filter(d => d <= 5.0).length / distances.length;

  // 各项评分
  const stabilityScore = avgDistance <= 1.0 ? 0.95 : 
                        avgDistance <= 2.0 ? 0.85 :
                        avgDistance <= 5.0 ? 0.70 : 0.50;

  const dataQualityScore = data.length >= 100 && within2m >= 0.8 ? 0.95 :
                          data.length >= 50 && within2m >= 0.6 ? 0.80 :
                          within5m >= 0.7 ? 0.65 : 0.40;

  const precisionScore = baseline.precision <= 1.0 ? 0.95 :
                        baseline.precision <= 2.0 ? 0.85 :
                        baseline.precision <= 5.0 ? 0.70 : 0.50;

  // 综合评分(加权平均)
  const overallScore = (
    stabilityScore * 0.4 +      // 稳定性权重40%
    dataQualityScore * 0.35 +   // 数据质量权重35%
    precisionScore * 0.25       // 精度权重25%
  );

  // 质量等级
  const qualityGrade = overallScore >= 0.90 ? 'excellent' :
                      overallScore >= 0.80 ? 'good' :
                      overallScore >= 0.65 ? 'fair' :
                      overallScore >= 0.50 ? 'poor' : 'critical';

  // 生成建议
  const recommendations = [];
  if (stabilityScore < 0.70) {
    recommendations.push('基准点稳定性不佳，建议重新选择稳定期数据');
  }
  if (dataQualityScore < 0.70) {
    recommendations.push('数据量或质量不足，建议延长采集时间');
  }
  if (precisionScore < 0.70) {
    recommendations.push('GPS精度不足，检查设备位置和信号质量');
  }
  if (recommendations.length === 0) {
    recommendations.push('基准点质量良好，建议定期监控');
  }

  return {
    overallScore,
    qualityGrade,
    stabilityScore,
    dataQualityScore,
    precisionScore,
    avgDistance,
    maxDistance,
    within2mPercent: within2m * 100,
    within5mPercent: within5m * 100,
    recommendations
  };
}

// 计算两点间距离(米)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // 地球半径(米)
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c;
}
