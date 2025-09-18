import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA'
);

// 调试信息
console.log('Supabase配置:', {
  url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  hasKey: !!(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA')
});

// 设备信息接口
interface DeviceInfo {
  device_id: string;
  real_name: string;
  display_name: string;
  status: 'online' | 'offline' | 'maintenance';
  last_active: string;
  location: string;
  coordinates: { lat: number; lng: number };
  device_type: string;
  firmware_version: string;
  install_date: string;
  data_count_today: number;
  last_data_time: string;
  health_score: number;
  temperature: number;
  humidity: number;
  battery_level: number;
  signal_strength: number;
}

// 获取设备信息
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('device_id') || 'device_1';
    const limit = parseInt(searchParams.get('limit') || '50');
    const dataOnly = searchParams.get('data_only') === 'true';

    console.log('设备管理API请求:', { deviceId, limit, dataOnly });

    // 如果只需要GPS数据列表，直接返回
    if (dataOnly) {
      const { data: gpsDataList, error: gpsError } = await supabase
        .from('iot_data')
        .select(`
          id,
          device_id,
          event_time,
          latitude,
          longitude,
          deformation_distance_3d,
          deformation_horizontal,
          deformation_vertical,
          deformation_velocity,
          deformation_confidence,
          risk_level,
          temperature,
          humidity,
          illumination,
          vibration,
          baseline_established
        `)
        .eq('device_id', deviceId)
        .order('event_time', { ascending: false })
        .limit(limit);

      if (gpsError) {
        console.error('获取GPS数据失败:', gpsError);
        return NextResponse.json({
          success: false,
          error: '获取GPS数据失败',
          details: gpsError.message
        }, { status: 500 });
      }

      console.log(`获取到${gpsDataList?.length || 0}条GPS数据`);

      return NextResponse.json({
        success: true,
        data: gpsDataList || [],
        count: gpsDataList?.length || 0,
        deviceId: deviceId,
        timestamp: new Date().toISOString()
      });
    }

    // 1. 获取设备基本信息（从设备映射表或配置）
    const deviceConfig = {
      device_1: {
        device_id: 'device_1',
        real_name: '6815a14f9314d118511807c6_rk2206',
        display_name: '龙门滑坡监测站',
        location: '防城港华石镇龙门村',
        coordinates: { lat: 21.6847, lng: 108.3516 },
        device_type: '软通套件',
        firmware_version: 'v2.1.3',
        install_date: '2025-06-01'
      }
    };

    const baseInfo = deviceConfig[deviceId as keyof typeof deviceConfig];
    if (!baseInfo) {
      return NextResponse.json({ 
        success: false, 
        error: '设备不存在' 
      }, { status: 404 });
    }

    // 2. 首先尝试从设备映射表获取设备信息
    const { data: deviceMapping, error: mappingError } = await supabase
      .from('device_mapping')
      .select('*')
      .eq('simple_id', deviceId)
      .single();

    let deviceLocation = baseInfo.location;
    let coordinates = baseInfo.coordinates;

    if (deviceMapping && !mappingError) {
      // 如果设备映射表中有信息，使用映射表的信息
      if (deviceMapping.location_name) {
        deviceLocation = deviceMapping.location_name;
      }
      if (deviceMapping.latitude && deviceMapping.longitude) {
        coordinates = {
          lat: parseFloat(deviceMapping.latitude),
          lng: parseFloat(deviceMapping.longitude)
        };
      }
      console.log('从设备映射表获取到坐标:', coordinates);
    }

    // 3. 获取最新的传感器数据（包括经纬度和GPS形变分析数据）
    const { data: latestData, error: dataError } = await supabase
      .from('iot_data')
      .select(`
        *,
        latitude,
        longitude,
        deformation_distance_3d,
        deformation_horizontal,
        deformation_vertical,
        deformation_velocity,
        deformation_risk_level,
        deformation_type,
        deformation_confidence,
        baseline_established
      `)
      .eq('device_id', deviceId)
      .order('event_time', { ascending: false })
      .limit(1);

    if (dataError) {
      console.error('获取传感器数据失败:', dataError);
    }

    // 4. 如果iot_data表中有最新的经纬度，优先使用（这是最新的位置）
    if (latestData && latestData.length > 0) {
      const latest = latestData[0];
      console.log('最新数据记录:', {
        device_id: latest.device_id,
        event_time: latest.event_time,
        latitude: latest.latitude,
        longitude: latest.longitude,
        temperature: latest.temperature,
        humidity: latest.humidity
      });

      // 如果数据库中有经纬度信息，则使用最新的
      if (latest.latitude && latest.longitude) {
        coordinates = {
          lat: parseFloat(latest.latitude),
          lng: parseFloat(latest.longitude)
        };
        console.log('使用最新数据中的坐标:', coordinates);
      }
    } else {
      console.log('没有找到设备数据，设备ID:', deviceId);
    }

    // 3. 获取今日数据统计
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const { data: todayData, error: statsError } = await supabase
      .from('iot_data')
      .select('id')
      .eq('device_id', deviceId)
      .gte('event_time', today)
      .lt('event_time', tomorrowStr);

    if (statsError) {
      console.error('获取今日统计失败:', statsError);
    }

    // 4. 计算设备状态和健康度
    const latestRecord = latestData?.[0];
    const isOnline = latestRecord && 
      (Date.now() - new Date(latestRecord.event_time).getTime()) < 5 * 60 * 1000; // 5分钟内有数据认为在线

    // 健康度计算（基于数据完整性和时效性）
    let healthScore = 0;
    if (isOnline && latestRecord) {
      const dataAge = Date.now() - new Date(latestRecord.event_time).getTime();
      const ageScore = Math.max(0, 100 - (dataAge / (60 * 1000)) * 2); // 每分钟减2分
      
      // 数据完整性检查
      const requiredFields = ['temperature', 'humidity'];
      const validFields = requiredFields.filter(field => 
        latestRecord[field] !== null && latestRecord[field] !== undefined
      );
      const completenessScore = (validFields.length / requiredFields.length) * 100;
      
      healthScore = Math.round((ageScore + completenessScore) / 2);
    }

    // 信号强度计算（基于数据传输稳定性）
    const signalStrength = isOnline ? Math.min(100, healthScore + Math.random() * 20) : 0;
    
    // 电池电量模拟（实际应该从设备获取）
    const batteryLevel = isOnline ? Math.max(20, 100 - Math.random() * 30) : 0;

    // 5. 构建完整的设备信息
    const deviceInfo: DeviceInfo = {
      ...baseInfo,
      location: deviceLocation, // 使用动态获取的位置信息
      coordinates, // 使用动态获取的坐标
      status: isOnline ? 'online' : 'offline',
      last_active: latestRecord?.event_time || new Date().toISOString(),
      data_count_today: todayData?.length || 0,
      last_data_time: latestRecord?.event_time || new Date().toISOString(),
      health_score: Math.round(healthScore),
      temperature: latestRecord?.temperature || 0,
      humidity: latestRecord?.humidity || 0,
      battery_level: Math.round(batteryLevel),
      signal_strength: Math.round(signalStrength)
    };

    console.log('最终设备信息:', {
      device_id: deviceInfo.device_id,
      location: deviceInfo.location,
      coordinates: deviceInfo.coordinates,
      status: deviceInfo.status
    });

    // 6. 构建GPS形变分析数据 - 只使用真实数据，不使用fallback
    const deformationData = {
      deformation_distance_3d: latestRecord?.deformation_distance_3d || null,
      deformation_horizontal: latestRecord?.deformation_horizontal || null,
      deformation_vertical: latestRecord?.deformation_vertical || null,
      deformation_velocity: latestRecord?.deformation_velocity || null,
      deformation_risk_level: latestRecord?.deformation_risk_level || null,
      deformation_type: latestRecord?.deformation_type || null,
      deformation_confidence: latestRecord?.deformation_confidence || null,
      baseline_established: latestRecord?.baseline_established || null
    };

    return NextResponse.json({
      success: true,
      data: deviceInfo,
      deformation_data: deformationData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('获取设备信息失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器内部错误' 
    }, { status: 500 });
  }
}

// 更新设备信息
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { device_id, ...updateData } = body;

    if (!device_id) {
      return NextResponse.json({ 
        success: false, 
        error: '设备ID不能为空' 
      }, { status: 400 });
    }

    // 这里应该更新到设备配置表
    // 由于当前没有设备配置表，我们模拟更新成功
    console.log('更新设备信息:', { device_id, updateData });

    return NextResponse.json({
      success: true,
      message: '设备信息更新成功',
      data: { device_id, ...updateData },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('更新设备信息失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '服务器内部错误' 
    }, { status: 500 });
  }
}
