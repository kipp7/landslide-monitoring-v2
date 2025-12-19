import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_JWT'
);

/**
 * 简易基准点自动建立API
 * 降低要求，快速建立基准点用于测试
 * POST /api/baselines/[deviceId]/auto-establish-simple
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ deviceId: string }> }
) {
  const { deviceId } = await params;

  try {
    console.log('🚀 启动简易基准点自动建立，deviceId:', deviceId);
    
    // 查询数据库中实际存在的GPS数据（不基于当前时间）
    console.log('🔍 查询数据库中实际的GPS数据...');
    
    // 第一步：获取该设备的所有GPS数据，找到实际的时间范围
    const { data: allGpsData, error: allGpsError } = await supabase
      .from('iot_data')
      .select('latitude, longitude, event_time')
      .eq('device_id', deviceId)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('event_time', { ascending: false })
      .limit(500); // 获取足够多的数据
      
    console.log(`📊 找到设备${deviceId}的GPS数据总量:`, allGpsData?.length || 0);
    
    let gpsData = allGpsData;
    const gpsError = allGpsError;
    
    // 如果数据量很大，取最早的24小时作为稳定期基准
    if (allGpsData && allGpsData.length > 50) {
      // 按时间排序，取最早的时间段（通常更稳定）
      const sortedData = [...allGpsData].sort((a, b) => 
        new Date(a.event_time).getTime() - new Date(b.event_time).getTime()
      );
      
      const earliestTime = new Date(sortedData[0].event_time);
      const next24Hours = new Date(earliestTime.getTime() + 24 * 60 * 60 * 1000);
      
      console.log(`⏰ 使用最早24小时数据: ${earliestTime.toISOString()} 到 ${next24Hours.toISOString()}`);
      
      gpsData = sortedData.filter(d => {
        const dataTime = new Date(d.event_time);
        return dataTime >= earliestTime && dataTime <= next24Hours;
      });
      
      console.log(`📈 最早24小时内的数据量:`, gpsData.length);
    }

    if (gpsError) {
      console.error('GPS数据查询失败:', gpsError);
      return NextResponse.json({
        success: false,
        error: `GPS数据查询失败: ${gpsError.message}`
      }, { status: 500 });
    }

    console.log(`📊 找到GPS数据: ${gpsData?.length || 0} 条`);

    if (!gpsData || gpsData.length < 5) {
      return NextResponse.json({
        success: false,
        error: `GPS数据不足，需要至少5个数据点，当前找到${gpsData?.length || 0}个`,
        recommendation: allGpsData?.length > 0 ? 
          `数据库中共有${allGpsData.length}个GPS点，但可用于建立基准点的数据不足` :
          '请检查设备是否上报了GPS数据到iot_data表',
        debug: {
          totalGpsData: allGpsData?.length || 0,
          filteredData: gpsData?.length || 0,
          deviceId: deviceId
        }
      }, { status: 400 });
    }

    // 简单算法：取最近20个数据点的平均值
    const recentData = gpsData.slice(0, Math.min(20, gpsData.length));
    
    let sumLat = 0;
    let sumLng = 0;
    let validCount = 0;

    recentData.forEach(point => {
      const lat = parseFloat(point.latitude);
      const lng = parseFloat(point.longitude);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        sumLat += lat;
        sumLng += lng;
        validCount++;
      }
    });

    if (validCount < 3) {
      return NextResponse.json({
        success: false,
        error: '有效GPS坐标不足，无法建立基准点',
        debug: { validCount, totalCount: recentData.length }
      }, { status: 400 });
    }

    const avgLat = sumLat / validCount;
    const avgLng = sumLng / validCount;

    // 计算数据分散度作为置信度参考
    let variance = 0;
    recentData.forEach(point => {
      const lat = parseFloat(point.latitude);
      const lng = parseFloat(point.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        const distance = calculateDistance(lat, lng, avgLat, avgLng);
        variance += distance * distance;
      }
    });
    
    const stdDev = Math.sqrt(variance / validCount);
    const confidenceLevel = stdDev < 1 ? 0.9 : stdDev < 2 ? 0.8 : stdDev < 5 ? 0.7 : 0.6;

    console.log(`📍 计算得到基准点: (${avgLat}, ${avgLng}), 置信度: ${confidenceLevel}`);

    // 保存基准点
    const { data: baselineData, error: saveError } = await supabase
      .from('gps_baselines')
      .upsert({
        device_id: deviceId,
        baseline_latitude: avgLat,
        baseline_longitude: avgLng,
        baseline_altitude: null,
        established_by: '简易系统建立',
        data_points_used: validCount,
        position_accuracy: stdDev,
        confidence_level: confidenceLevel,
        status: 'active',
        established_time: new Date().toISOString(),
        notes: `简易算法建立，使用${validCount}个数据点，标准差${stdDev.toFixed(2)}米`
      })
      .select()
      .single();

    if (saveError) {
      console.error('保存基准点失败:', saveError);
      return NextResponse.json({
        success: false,
        error: `保存基准点失败: ${saveError.message}`
      }, { status: 500 });
    }

    console.log('✅ 基准点建立成功！');

    return NextResponse.json({
      success: true,
      data: baselineData,
      message: `简易基准点建立成功！使用${validCount}个数据点`,
      analysis: {
        dataPoints: validCount,
        timeRange: gpsData.length > 0 ? 
          `${gpsData[gpsData.length - 1].event_time} 至 ${gpsData[0].event_time}` : 
          '数据时间范围',
        coordinates: { latitude: avgLat, longitude: avgLng },
        accuracy: `${stdDev.toFixed(2)}米`,
        confidence: `${(confidenceLevel * 100).toFixed(1)}%`,
        dataSpread: `标准差${stdDev.toFixed(2)}米`
      }
    });

  } catch (error) {
    console.error('简易基准点建立失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '简易基准点建立失败',
      recommendation: '请检查设备状态和网络连接'
    }, { status: 500 });
  }
}

// 计算两点间距离(米) - Haversine公式
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
