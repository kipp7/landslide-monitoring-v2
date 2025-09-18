const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkTriggers() {
  console.log('🔍 检查数据库触发器...\n');
  
  try {
    // 检查触发器
    const { data: triggers, error: triggerError } = await supabase
      .rpc('sql', {
        query: `
          SELECT 
            schemaname,
            tablename,
            triggername,
            definition
          FROM pg_trigger t
          JOIN pg_class c ON t.tgrelid = c.oid
          JOIN pg_namespace n ON c.relnamespace = n.oid
          WHERE n.nspname = 'public' 
          AND c.relname IN ('iot_data', 'iot_anomalies', 'iot_devices')
          AND NOT t.tgisinternal;
        `
      });

    if (triggerError) {
      console.error('❌ 查询触发器失败:', triggerError);
      
      // 尝试另一种方式查询
      console.log('尝试查询函数...');
      const { data: functions, error: funcError } = await supabase
        .rpc('sql', {
          query: `
            SELECT 
              proname as function_name,
              prosrc as function_body
            FROM pg_proc 
            WHERE proname LIKE '%anomal%' 
            OR proname LIKE '%trigger%'
            OR proname LIKE '%calculate%';
          `
        });
      
      if (funcError) {
        console.error('❌ 查询函数也失败:', funcError);
      } else {
        console.log('📋 相关函数:', functions);
      }
    } else {
      console.log('📋 当前触发器:', triggers);
    }

    // 检查最新的异常记录
    const { data: recentAnomalies, error: anomalyError } = await supabase
      .from('iot_anomalies')
      .select('*')
      .order('event_time', { ascending: false })
      .limit(5);

    if (anomalyError) {
      console.error('❌ 查询异常记录失败:', anomalyError);
    } else {
      console.log('\n⚠️  最新异常记录:');
      recentAnomalies.forEach((anomaly, index) => {
        console.log(`${index + 1}. ${anomaly.anomaly_type}: ${anomaly.value} (${new Date(anomaly.event_time).toLocaleString()})`);
      });
    }

    // 检查最新的数据记录
    const { data: recentData, error: dataError } = await supabase
      .from('iot_data')
      .select('acceleration_total, event_time')
      .order('event_time', { ascending: false })
      .limit(3);

    if (dataError) {
      console.error('❌ 查询数据记录失败:', dataError);
    } else {
      console.log('\n📊 最新数据记录:');
      recentData.forEach((data, index) => {
        console.log(`${index + 1}. 加速度: ${data.acceleration_total}mg (${new Date(data.event_time).toLocaleString()})`);
      });
    }

  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error);
  }
}

async function clearRecentAnomalies() {
  console.log('\n🧹 清理最近的加速度异常记录...');
  
  try {
    const { error } = await supabase
      .from('iot_anomalies')
      .delete()
      .eq('anomaly_type', 'acceleration_high')
      .lt('value', 20000);  // 删除低于新阈值的记录

    if (error) {
      console.error('❌ 清理失败:', error);
    } else {
      console.log('✅ 清理完成');
    }
  } catch (error) {
    console.error('❌ 清理过程中发生错误:', error);
  }
}

// 运行检查
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--clean')) {
    clearRecentAnomalies().then(() => checkTriggers());
  } else {
    checkTriggers();
  }
}

module.exports = { checkTriggers, clearRecentAnomalies };
