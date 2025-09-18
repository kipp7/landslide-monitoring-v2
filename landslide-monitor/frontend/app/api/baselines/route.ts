import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://sdssoyyjhunltmcjoxtg.supabase.co',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA'
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
      .order('established_time', { ascending: false });
    
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
