import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'REDACTED_JWT'
);

/**
 * 获取所有基准点列表
 * GET /api/baselines
 */
export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabase
      .from('gps_baselines')
      .select('*')
      .eq('status', 'active')
      .order('device_id', { ascending: true });
    
    if (error) {
      throw new Error(error.message);
    }
    
    return NextResponse.json({
      success: true,
      data: data,
      count: data.length
    });
    
  } catch (error) {
    console.error('获取基准点列表失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '获取基准点列表失败'
    }, { status: 500 });
  }
}
