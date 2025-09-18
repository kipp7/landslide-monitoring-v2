const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let cleanupCount = 0;

async function cleanupAnomalies() {
  try {
    // 删除加速度异常记录（低于20000mg的）
    const { error } = await supabase
      .from('iot_anomalies')
      .delete()
      .eq('anomaly_type', 'acceleration_high')
      .lt('value', 20000);

    if (error) {
      console.error('❌ 清理失败:', error);
    } else {
      cleanupCount++;
      console.log(`✅ 清理完成 #${cleanupCount} (${new Date().toLocaleTimeString()})`);
    }
  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
  }
}

async function monitorAnomalies() {
  try {
    const { data, error } = await supabase
      .from('iot_anomalies')
      .select('*')
      .order('event_time', { ascending: false })
      .limit(1);

    if (error) {
      console.error('❌ 查询失败:', error);
    } else if (data.length > 0) {
      const latest = data[0];
      console.log(`⚠️  检测到异常: ${latest.anomaly_type} = ${latest.value} (${new Date(latest.event_time).toLocaleTimeString()})`);
      
      // 如果是低于阈值的加速度异常，立即清理
      if (latest.anomaly_type === 'acceleration_high' && latest.value < 20000) {
        await cleanupAnomalies();
      }
    }
  } catch (error) {
    console.error('❌ 监控过程中发生错误:', error);
  }
}

console.log('🔄 启动异常记录清理监控...');
console.log('⚠️  这是临时解决方案，请在Supabase中修复触发器！');
console.log('📋 需要在Supabase SQL编辑器中执行 fix-triggers.sql');
console.log('');

// 立即清理一次
cleanupAnomalies();

// 每5秒监控一次
const monitorInterval = setInterval(monitorAnomalies, 5000);

// 每30秒清理一次
const cleanupInterval = setInterval(cleanupAnomalies, 30000);

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n🛑 停止监控...');
  clearInterval(monitorInterval);
  clearInterval(cleanupInterval);
  console.log(`📊 总共清理了 ${cleanupCount} 次`);
  process.exit(0);
});

console.log('按 Ctrl+C 停止监控');
