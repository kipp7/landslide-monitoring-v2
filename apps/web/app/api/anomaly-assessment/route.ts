import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const timeWindow = parseInt(searchParams.get('timeWindow') || '24');
    
    // 调用后端异常评估服务
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:5100';
    const response = await fetch(`${backendUrl}/api/anomaly-assessment?timeWindow=${timeWindow}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // 如果后端服务不可用，返回fallback数据
      console.warn('后端异常评估服务不可用，使用fallback数据');
      return NextResponse.json({
        success: true,
        data: [],
        stats: { total: 0, red: 0, orange: 0, yellow: 0, blue: 0 },
        time_window: timeWindow,
        processed_at: new Date().toISOString(),
        is_fallback: true,
        source: 'frontend_fallback'
      });
    }

    const result = await response.json();
    return NextResponse.json(result);

  } catch (error: any) {
    console.error('异常评估API调用失败:', error);
    
    // 返回fallback数据确保前端正常工作
    return NextResponse.json({
      success: true,
      data: [],
      stats: { total: 0, red: 0, orange: 0, yellow: 0, blue: 0 },
      time_window: 24,
      processed_at: new Date().toISOString(),
      is_fallback: true,
      source: 'api_error_fallback',
      error: error.message
    });
  }
}
