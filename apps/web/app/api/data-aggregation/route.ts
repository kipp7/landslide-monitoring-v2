import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_JWT'
);

// 数据聚合缓存
const aggregationCache = new Map();
const CACHE_TTL = 3 * 60 * 1000; // 3分钟缓存

interface AggregationRequest {
  type: 'hierarchy_stats' | 'network_stats' | 'device_summary' | 'real_time_dashboard';
  devices?: string[];
  timeRange?: '1h' | '6h' | '24h' | '7d' | '30d';
  includeBaselines?: boolean;
  includeAnomalies?: boolean;
}

// 统一数据聚合API - 替代所有统计视图
export async function POST(request: NextRequest) {
  try {
    const body: AggregationRequest = await request.json();
    const { type, devices = [], timeRange = '24h', includeBaselines = true, includeAnomalies = true } = body;

    console.log('📊 数据聚合请求:', { type, deviceCount: devices.length, timeRange });

    // 缓存检查
    const cacheKey = `aggregation_${type}_${JSON.stringify(body)}`;
    const cached = aggregationCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('💾 使用聚合缓存');
      return NextResponse.json({
        ...cached.data,
        fromCache: true,
        cacheTime: cached.timestamp
      });
    }

    let result: any = {};

    switch (type) {
      case 'hierarchy_stats':
        result = await generateHierarchyStats();
        break;
      
      case 'network_stats':
        result = await generateNetworkStats(devices);
        break;
      
      case 'device_summary':
        result = await generateDeviceSummary(devices, timeRange);
        break;
      
      case 'real_time_dashboard':
        result = await generateRealTimeDashboard(timeRange, includeBaselines, includeAnomalies);
        break;
      
      default:
        return NextResponse.json({
          success: false,
          error: '不支持的聚合类型'
        }, { status: 400 });
    }

    // 缓存结果
    aggregationCache.set(cacheKey, {
      data: result,
      timestamp: Date.now()
    });

    console.log('✅ 数据聚合完成:', { type, dataPoints: Object.keys(result.data || {}).length });

    return NextResponse.json(result);

  } catch (error) {
    console.error('数据聚合API错误:', error);
    return NextResponse.json({
      success: false,
      error: '聚合处理失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}

// 生成层级统计 - 替代 monitoring_hierarchy_stats 视图
async function generateHierarchyStats() {
  console.log('🏗️ 生成层级统计...');

  // 并行查询基础数据
  const [regionsResult, networksResult, devicesResult] = await Promise.all([
    supabase.from('monitoring_regions').select('*'),
    supabase.from('monitoring_networks').select('*'),
    supabase.from('devices_new').select('device_id, region_id, network_id, status, created_at')
  ]);

  if (regionsResult.error || networksResult.error || devicesResult.error) {
    throw new Error('获取层级基础数据失败');
  }

  const regions = regionsResult.data || [];
  const networks = networksResult.data || [];
  const devices = devicesResult.data || [];

  // 应用层统计计算
  const hierarchyStats = {
    regions: regions.map(region => {
      const regionNetworks = networks.filter(n => n.region_id === region.region_id);
      const regionDevices = devices.filter(d => d.region_id === region.region_id);
      
      return {
        region_id: region.region_id,
        region_name: region.region_name,
        network_count: regionNetworks.length,
        device_count: regionDevices.length,
        active_devices: regionDevices.filter(d => d.status === 'online').length,
        creation_date: region.created_at
      };
    }),
    
    networks: networks.map(network => {
      const networkDevices = devices.filter(d => d.network_id === network.network_id);
      
      return {
        network_id: network.network_id,
        network_name: network.network_name,
        region_id: network.region_id,
        device_count: networkDevices.length,
        active_devices: networkDevices.filter(d => d.status === 'online').length,
        coverage_area: network.coverage_area || '未设置'
      };
    }),
    
    summary: {
      total_regions: regions.length,
      total_networks: networks.length,
      total_devices: devices.length,
      active_devices: devices.filter(d => d.status === 'online').length,
      device_density: devices.length / Math.max(regions.length, 1)
    }
  };

  return {
    success: true,
    type: 'hierarchy_stats',
    data: hierarchyStats,
    generatedAt: new Date().toISOString(),
    source: '实时应用层聚合'
  };
}

// 生成网络统计 - 替代 network_management_stats 视图
async function generateNetworkStats(targetDevices: string[]) {
  console.log('🌐 生成网络统计...');

  const deviceFilter = targetDevices.length > 0 ? targetDevices : undefined;
  
  // 获取最近24小时的IoT数据
  const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  
  const [iotDataResult, baselinesResult, anomaliesResult] = await Promise.all([
    supabase
      .from('iot_data')
      .select('device_id, event_time, temperature, humidity, latitude, longitude')
      .gte('event_time', last24h)
      .order('event_time', { ascending: false })
      .then(result => ({
        ...result,
        data: deviceFilter ? result.data?.filter(d => deviceFilter.includes(d.device_id)) : result.data
      })),
    
    supabase
      .from('gps_baselines')
      .select('device_id, status, confidence_level, established_time')
      .eq('status', 'active')
      .then(result => ({
        ...result,
        data: deviceFilter ? result.data?.filter(d => deviceFilter.includes(d.device_id)) : result.data
      })),
    
    supabase
      .from('iot_anomalies')
      .select('device_id, anomaly_type, severity, detected_time')
      .gte('detected_time', last24h)
      .then(result => ({
        ...result,
        data: deviceFilter ? result.data?.filter(d => deviceFilter.includes(d.device_id)) : result.data
      }))
  ]);

  if (iotDataResult.error) {
    throw new Error('获取IoT数据失败');
  }

  const iotData = iotDataResult.data || [];
  const baselines = baselinesResult.data || [];
  const anomalies = anomaliesResult.data || [];

  // 按设备分组统计
  const deviceStats = new Map();
  
  iotData.forEach(record => {
    const deviceId = record.device_id;
    if (!deviceStats.has(deviceId)) {
      deviceStats.set(deviceId, {
        device_id: deviceId,
        data_points: 0,
        latest_time: null,
        avg_temperature: 0,
        avg_humidity: 0,
        gps_points: 0,
        has_baseline: false,
        anomaly_count: 0
      });
    }
    
    const stats = deviceStats.get(deviceId);
    stats.data_points++;
    
    if (!stats.latest_time || record.event_time > stats.latest_time) {
      stats.latest_time = record.event_time;
    }
    
    if (record.temperature !== null) {
      stats.avg_temperature = (stats.avg_temperature * (stats.data_points - 1) + record.temperature) / stats.data_points;
    }
    
    if (record.humidity !== null) {
      stats.avg_humidity = (stats.avg_humidity * (stats.data_points - 1) + record.humidity) / stats.data_points;
    }
    
    if (record.latitude && record.longitude) {
      stats.gps_points++;
    }
  });

  // 添加基准点信息
  baselines.forEach(baseline => {
    if (deviceStats.has(baseline.device_id)) {
      deviceStats.get(baseline.device_id).has_baseline = true;
    }
  });

  // 添加异常统计
  anomalies.forEach(anomaly => {
    if (deviceStats.has(anomaly.device_id)) {
      deviceStats.get(anomaly.device_id).anomaly_count++;
    }
  });

  const networkStats = {
    devices: Array.from(deviceStats.values()),
    network_summary: {
      total_devices: deviceStats.size,
      active_devices: Array.from(deviceStats.values()).filter(d => {
        return d.latest_time && (Date.now() - new Date(d.latest_time).getTime()) < 5 * 60 * 1000;
      }).length,
      devices_with_baseline: Array.from(deviceStats.values()).filter(d => d.has_baseline).length,
      total_data_points: Array.from(deviceStats.values()).reduce((sum, d) => sum + d.data_points, 0),
      total_anomalies: Array.from(deviceStats.values()).reduce((sum, d) => sum + d.anomaly_count, 0),
      avg_temperature: deviceStats.size > 0 
        ? Array.from(deviceStats.values()).reduce((sum, d) => sum + d.avg_temperature, 0) / deviceStats.size 
        : 0,
      avg_humidity: deviceStats.size > 0 
        ? Array.from(deviceStats.values()).reduce((sum, d) => sum + d.avg_humidity, 0) / deviceStats.size 
        : 0
    }
  };

  return {
    success: true,
    type: 'network_stats',
    data: networkStats,
    timeRange: '24h',
    generatedAt: new Date().toISOString(),
    source: '实时网络聚合'
  };
}

// 生成设备摘要
async function generateDeviceSummary(targetDevices: string[], timeRange: string) {
  console.log('📱 生成设备摘要...');

  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }[timeRange] || 24 * 60 * 60 * 1000;

  const startTime = new Date(Date.now() - timeRangeMs).toISOString();
  
  // 查询指定时间范围内的数据
  const { data: recentData, error } = await supabase
    .from('iot_data')
    .select('device_id, event_time, temperature, humidity, latitude, longitude, deformation_distance_3d')
    .gte('event_time', startTime)
    .in('device_id', targetDevices.length > 0 ? targetDevices : ['device_1', 'device_2', 'device_3'])
    .order('event_time', { ascending: false });

  if (error) {
    throw new Error('获取设备数据失败');
  }

  // 按设备聚合
  const deviceSummary = new Map();
  
  (recentData || []).forEach(record => {
    const deviceId = record.device_id;
    if (!deviceSummary.has(deviceId)) {
      deviceSummary.set(deviceId, {
        device_id: deviceId,
        record_count: 0,
        first_time: record.event_time,
        last_time: record.event_time,
        temperature_readings: [],
        humidity_readings: [],
        gps_readings: [],
        deformation_readings: []
      });
    }
    
    const summary = deviceSummary.get(deviceId);
    summary.record_count++;
    
    if (record.event_time < summary.first_time) summary.first_time = record.event_time;
    if (record.event_time > summary.last_time) summary.last_time = record.event_time;
    
    if (record.temperature !== null) summary.temperature_readings.push(record.temperature);
    if (record.humidity !== null) summary.humidity_readings.push(record.humidity);
    if (record.latitude && record.longitude) {
      summary.gps_readings.push({ lat: record.latitude, lng: record.longitude, time: record.event_time });
    }
    if (record.deformation_distance_3d !== null) {
      summary.deformation_readings.push(record.deformation_distance_3d);
    }
  });

  // 计算统计值
  const processedSummary = Array.from(deviceSummary.values()).map(summary => {
    const tempReadings = summary.temperature_readings;
    const humidityReadings = summary.humidity_readings;
    const deformationReadings = summary.deformation_readings;
    
    return {
      device_id: summary.device_id,
      time_range: timeRange,
      record_count: summary.record_count,
      data_span: {
        start: summary.first_time,
        end: summary.last_time,
        duration_hours: (new Date(summary.last_time).getTime() - new Date(summary.first_time).getTime()) / (60 * 60 * 1000)
      },
      temperature_stats: tempReadings.length > 0 ? {
        min: Math.min(...tempReadings),
        max: Math.max(...tempReadings),
        avg: tempReadings.reduce((sum: number, val: number) => sum + val, 0) / tempReadings.length,
        count: tempReadings.length
      } : null,
      humidity_stats: humidityReadings.length > 0 ? {
        min: Math.min(...humidityReadings),
        max: Math.max(...humidityReadings),
        avg: humidityReadings.reduce((sum: number, val: number) => sum + val, 0) / humidityReadings.length,
        count: humidityReadings.length
      } : null,
      gps_stats: {
        total_points: summary.gps_readings.length,
        latest_position: summary.gps_readings.length > 0 ? summary.gps_readings[0] : null
      },
      deformation_stats: deformationReadings.length > 0 ? {
        min: Math.min(...deformationReadings),
        max: Math.max(...deformationReadings),
        avg: deformationReadings.reduce((sum: number, val: number) => sum + val, 0) / deformationReadings.length,
        latest: deformationReadings[0] || 0,
        count: deformationReadings.length
      } : null
    };
  });

  return {
    success: true,
    type: 'device_summary',
    data: {
      devices: processedSummary,
      summary: {
        total_devices: processedSummary.length,
        total_records: processedSummary.reduce((sum, d) => sum + d.record_count, 0),
        time_range: timeRange,
        active_devices: processedSummary.filter(d => 
          (Date.now() - new Date(d.data_span.end).getTime()) < 10 * 60 * 1000
        ).length
      }
    },
    generatedAt: new Date().toISOString(),
    source: '实时设备聚合'
  };
}

// 生成实时仪表板数据
async function generateRealTimeDashboard(timeRange: string, includeBaselines: boolean, includeAnomalies: boolean) {
  console.log('📊 生成实时仪表板...');

  const timeRangeMs = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }[timeRange] || 24 * 60 * 60 * 1000;

  const startTime = new Date(Date.now() - timeRangeMs).toISOString();

  // 分别执行查询以避免复杂的类型推断
  const iotQuery = supabase
    .from('iot_data')
    .select('device_id, event_time, temperature, humidity, latitude, longitude, deformation_distance_3d, risk_level')
    .gte('event_time', startTime)
    .order('event_time', { ascending: false });

  const queries: any[] = [iotQuery];

  if (includeBaselines) {
    const baselineQuery = supabase
      .from('gps_baselines')
      .select('device_id, status, confidence_level, established_time')
      .eq('status', 'active');
    queries.push(baselineQuery);
  }

  if (includeAnomalies) {
    const anomalyQuery = supabase
      .from('iot_anomalies')
      .select('device_id, anomaly_type, severity, detected_time, description')
      .gte('detected_time', startTime)
      .order('detected_time', { ascending: false });
    queries.push(anomalyQuery);
  }

  const results = await Promise.all(queries);
  const iotData = results[0].data || [];
  const baselines = includeBaselines ? (results[1]?.data || []) : [];
  const anomalies = includeAnomalies ? (results[results.length - 1]?.data || []) : [];

  // 实时仪表板数据聚合
  const dashboard = {
    overview: {
      total_data_points: iotData.length,
      active_devices: new Set(iotData.filter((d: any) =>
        (Date.now() - new Date(d.event_time).getTime()) < 5 * 60 * 1000
      ).map((d: any) => d.device_id)).size,
      devices_with_baseline: includeBaselines ? baselines.length : 0,
      total_anomalies: includeAnomalies ? anomalies.length : 0,
      time_range: timeRange
    },
    
    device_status: Array.from(new Set(iotData.map((d: any) => d.device_id))).map(deviceId => {
      const deviceData = iotData.filter((d: any) => d.device_id === deviceId);
      const latestData = deviceData[0];
      const isOnline = latestData && 
        (Date.now() - new Date(latestData.event_time).getTime()) < 5 * 60 * 1000;
      
      return {
        device_id: deviceId,
        status: isOnline ? 'online' : 'offline',
        last_seen: latestData?.event_time || null,
        data_points: deviceData.length,
        latest_temperature: latestData?.temperature || null,
        latest_humidity: latestData?.humidity || null,
        latest_deformation: latestData?.deformation_distance_3d || null,
        risk_level: latestData?.risk_level || 0,
        has_baseline: includeBaselines ? baselines.some((b: any) => b.device_id === deviceId) : false,
        recent_anomalies: includeAnomalies ? anomalies.filter((a: any) => a.device_id === deviceId).length : 0
      };
    }),
    
    recent_data: iotData.slice(0, 50), // 最近50条数据
    
    anomaly_summary: includeAnomalies ? {
      total: anomalies.length,
      by_severity: anomalies.reduce((acc: Record<string, number>, a: any) => {
        acc[a.severity] = (acc[a.severity] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      by_type: anomalies.reduce((acc: Record<string, number>, a: any) => {
        acc[a.anomaly_type] = (acc[a.anomaly_type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      recent: anomalies.slice(0, 10)
    } : null
  };

  return {
    success: true,
    type: 'real_time_dashboard',
    data: dashboard,
    generatedAt: new Date().toISOString(),
    dataRange: {
      start: startTime,
      end: new Date().toISOString(),
      range: timeRange
    },
    source: '实时仪表板聚合'
  };
}

// 缓存管理
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'clear_cache') {
      aggregationCache.clear();
      console.log('🗑️ 聚合缓存已清理');
      
      return NextResponse.json({
        success: true,
        message: '聚合缓存已清理',
        timestamp: new Date().toISOString()
      });
    }

    return NextResponse.json({
      success: false,
      error: '不支持的操作'
    }, { status: 400 });

  } catch (error) {
    console.error('缓存管理错误:', error);
    return NextResponse.json({
      success: false,
      error: '缓存管理失败'
    }, { status: 500 });
  }
}
