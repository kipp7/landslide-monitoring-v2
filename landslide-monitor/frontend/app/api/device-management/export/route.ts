import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// 数据导出API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      device_id = 'device_1', 
      export_type = 'today', // today, history, custom
      start_date,
      end_date,
      format = 'json' // json, csv, excel
    } = body;

    let query = supabase
      .from('iot_data')
      .select('*')
      .eq('device_id', device_id)
      .order('event_time', { ascending: false });

    // 根据导出类型设置时间范围
    if (export_type === 'today') {
      const today = new Date().toISOString().split('T')[0];
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      
      query = query.gte('event_time', today).lt('event_time', tomorrowStr);
    } else if (export_type === 'history') {
      // 导出最近30天的数据
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query = query.gte('event_time', thirtyDaysAgo.toISOString());
    } else if (export_type === 'custom' && start_date && end_date) {
      query = query.gte('event_time', start_date).lte('event_time', end_date);
    }

    const { data, error } = await query.limit(10000); // 限制最大导出数量

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return NextResponse.json({
        success: false,
        error: '没有找到数据'
      }, { status: 404 });
    }

    // 数据处理和格式化
    const processedData = data.map(record => ({
      时间: new Date(record.event_time).toLocaleString('zh-CN'),
      设备ID: record.device_id,
      温度: record.temperature ? `${record.temperature}°C` : 'N/A',
      湿度: record.humidity ? `${record.humidity}%` : 'N/A',
      照度: record.illumination || 'N/A',
      加速度X: record.acceleration_x || 'N/A',
      加速度Y: record.acceleration_y || 'N/A',
      加速度Z: record.acceleration_z || 'N/A',
      陀螺仪X: record.gyroscope_x || 'N/A',
      陀螺仪Y: record.gyroscope_y || 'N/A',
      陀螺仪Z: record.gyroscope_z || 'N/A'
    }));

    if (format === 'csv') {
      // 生成CSV格式
      const headers = Object.keys(processedData[0]);
      const csvContent = [
        headers.join(','),
        ...processedData.map(row => 
          headers.map(header => `"${row[header as keyof typeof row]}"`).join(',')
        )
      ].join('\n');

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="device_${device_id}_${export_type}_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    // 默认返回JSON格式
    return NextResponse.json({
      success: true,
      data: processedData,
      meta: {
        device_id,
        export_type,
        total_records: processedData.length,
        export_time: new Date().toISOString(),
        time_range: {
          start: data[data.length - 1]?.event_time,
          end: data[0]?.event_time
        }
      }
    });

  } catch (error) {
    console.error('数据导出失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '数据导出失败' 
    }, { status: 500 });
  }
}

// 获取可导出的数据统计
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('device_id') || 'device_1';

    // 获取数据统计
    const { data: allData, error } = await supabase
      .from('iot_data')
      .select('event_time')
      .eq('device_id', deviceId)
      .order('event_time', { ascending: false });

    if (error) {
      throw error;
    }

    if (!allData || allData.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          total_records: 0,
          date_range: null,
          today_records: 0,
          this_week_records: 0,
          this_month_records: 0
        }
      });
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const thisWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const todayRecords = allData.filter(record => 
      new Date(record.event_time) >= today
    ).length;

    const thisWeekRecords = allData.filter(record => 
      new Date(record.event_time) >= thisWeek
    ).length;

    const thisMonthRecords = allData.filter(record => 
      new Date(record.event_time) >= thisMonth
    ).length;

    return NextResponse.json({
      success: true,
      data: {
        total_records: allData.length,
        date_range: {
          earliest: allData[allData.length - 1]?.event_time,
          latest: allData[0]?.event_time
        },
        today_records: todayRecords,
        this_week_records: thisWeekRecords,
        this_month_records: thisMonthRecords
      }
    });

  } catch (error) {
    console.error('获取导出统计失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: '获取统计信息失败' 
    }, { status: 500 });
  }
}
