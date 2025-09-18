const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkStatus() {
  console.log('🔍 检查当前状态...\n');
  
  try {
    // 检查最新数据记录
    const { data: latestData, error: dataError } = await supabase
      .from('iot_data')
      .select('acceleration_total, event_time, device_id')
      .order('event_time', { ascending: false })
      .limit(3);

    if (dataError) {
      console.error('❌ 查询数据失败:', dataError);
    } else {
      console.log('📊 最新数据记录:');
      latestData.forEach((d, i) => {
        console.log(`  ${i+1}. 设备:${d.device_id} 加速度:${d.acceleration_total}mg 时间:${new Date(d.event_time).toLocaleString()}`);
      });
    }

    // 检查最新异常记录
    const { data: latestAnomalies, error: anomalyError } = await supabase
      .from('iot_anomalies')
      .select('*')
      .order('event_time', { ascending: false })
      .limit(5);

    if (anomalyError) {
      console.error('❌ 查询异常失败:', anomalyError);
    } else {
      console.log('\n⚠️  最新异常记录:');
      if (latestAnomalies.length === 0) {
        console.log('  ✅ 无异常记录');
      } else {
        latestAnomalies.forEach((a, i) => {
          console.log(`  ${i+1}. 类型:${a.anomaly_type} 值:${a.value}mg 设备:${a.device_id} 时间:${new Date(a.event_time).toLocaleString()}`);
        });
      }
    }

    // 分析问题
    if (latestAnomalies.length > 0 && latestData.length > 0) {
      const latestDataTime = new Date(latestData[0].event_time);
      const latestAnomalyTime = new Date(latestAnomalies[0].event_time);
      
      console.log('\n🔍 分析:');
      console.log(`  数据记录中的加速度: ${latestData[0].acceleration_total}mg (正常)`);
      console.log(`  异常记录中的加速度: ${latestAnomalies[0].value}mg (异常)`);
      console.log(`  数据时间: ${latestDataTime.toLocaleString()}`);
      console.log(`  异常时间: ${latestAnomalyTime.toLocaleString()}`);
      
      if (latestAnomalyTime > latestDataTime) {
        console.log('  ❌ 异常记录比数据记录更新，说明触发器还在工作');
      } else {
        console.log('  ✅ 异常记录比数据记录旧，可能是历史记录');
      }
    }

  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error);
  }
}

checkStatus();
