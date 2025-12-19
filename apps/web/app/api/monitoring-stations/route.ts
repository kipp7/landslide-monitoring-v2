// 监测站管理API接口
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

// 获取所有监测站信息
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const chartType = url.searchParams.get('chartType');
    
    if (chartType) {
      // 获取图表配置
      return getChartConfig(chartType);
    } else {
      // 获取所有监测站信息
      return getAllStations();
    }
  } catch (error) {
    console.error('获取监测站信息失败:', error);
    return NextResponse.json({
      success: false,
      message: '获取监测站信息失败',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 更新监测站信息
export async function PUT(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const deviceId = url.searchParams.get('deviceId');
    
    if (!deviceId) {
      return NextResponse.json({
        success: false,
        message: 'deviceId参数必须提供'
      }, { status: 400 });
    }
    
    const updates = await request.json();
    
    // 记录变更日志
    await logConfigChange(deviceId, updates, 'API_UPDATE');
    
    const { data, error } = await supabase
      .from('devices_new')
      .update(updates)
      .eq('device_id', deviceId)
      .select('*')
      .single();
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      message: '监测站信息更新成功'
    });
  } catch (error) {
    console.error('更新监测站信息失败:', error);
    return NextResponse.json({
      success: false,
      message: '更新监测站信息失败',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 批量更新图例配置
export async function POST(request: NextRequest) {
  try {
    const { chartType, deviceLegends } = await request.json();
    
    if (!chartType || !deviceLegends) {
      return NextResponse.json({
        success: false,
        message: 'chartType和deviceLegends参数必须提供'
      }, { status: 400 });
    }
    
    // 批量更新设备的图例名称
    const updatePromises = Object.entries(deviceLegends).map(([deviceId, legendName]) => {
      return supabase
        .from('devices_new')
        .update({ chart_legend_name: legendName })
        .eq('device_id', deviceId);
    });
    
    await Promise.all(updatePromises);
    
    return NextResponse.json({
      success: true,
      message: '图例配置更新成功'
    });
  } catch (error) {
    console.error('批量更新图例配置失败:', error);
    return NextResponse.json({
      success: false,
      message: '批量更新图例配置失败',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

// 获取所有监测站信息
async function getAllStations() {
  try {
    const { data, error } = await supabase
      .from('monitoring_stations_view')
      .select('*')
      .order('device_id');
    
    if (error) {
      throw error;
    }
    
    return NextResponse.json({
      success: true,
      data: data || [],
      message: '获取监测站信息成功'
    });
  } catch (error) {
    throw error;
  }
}

// 获取图表配置
async function getChartConfig(chartType: string) {
  try {
    // 获取图表基础配置
    const { data: chartConfig, error: chartError } = await supabase
      .from('chart_configurations')
      .select('*')
      .eq('chart_type', chartType)
      .single();
    
    if (chartError) {
      throw chartError;
    }
    
    // 获取设备图例配置
    const { data: deviceLegends, error: legendError } = await supabase
      .from('devices_new')
      .select('device_id, chart_legend_name')
      .in('device_id', ['device_1', 'device_2', 'device_3'])
      .order('device_id');
    
    if (legendError) {
      throw legendError;
    }
    
    // 构造设备图例对象
    const deviceLegendsObj = (deviceLegends || []).reduce((acc: any, item) => {
      acc[item.device_id] = item.chart_legend_name || item.device_id;
      return acc;
    }, {});
    
    return NextResponse.json({
      success: true,
      data: {
        chartType: chartConfig.chart_type,
        title: chartConfig.title,
        unit: chartConfig.unit,
        yAxisName: chartConfig.y_axis_name,
        deviceLegends: deviceLegendsObj
      },
      message: '获取图表配置成功'
    });
  } catch (error) {
    throw error;
  }
}

// 记录配置变更日志
async function logConfigChange(deviceId: string, updates: any, changedBy: string) {
  try {
    // 获取当前配置
    const { data: currentConfig } = await supabase
      .from('devices_new')
      .select('*')
      .eq('device_id', deviceId)
      .single();
    
    if (currentConfig) {
      // 记录每个字段的变更
      const logEntries = Object.entries(updates).map(([fieldName, newValue]) => ({
        device_id: deviceId,
        field_name: fieldName,
        old_value: currentConfig[fieldName]?.toString() || null,
        new_value: newValue?.toString() || null,
        changed_by: changedBy,
        change_reason: 'API配置更新'
      }));
      
      await supabase
        .from('station_config_history')
        .insert(logEntries);
    }
  } catch (error) {
    console.warn('记录配置变更日志失败:', error);
    // 不抛出错误，避免影响主要功能
  }
}
