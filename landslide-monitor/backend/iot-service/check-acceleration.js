const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function checkAccelerationData() {
  console.log('🔍 检查加速度数据...\n');

  try {
    // 获取最新的加速度数据
    const { data, error } = await supabase
      .from('iot_data')
      .select('event_time, acceleration_x, acceleration_y, acceleration_z, acceleration_total')
      .order('event_time', { ascending: false })
      .limit(10);

    if (error) {
      console.error('❌ 查询数据失败:', error);
      return;
    }

    console.log('📊 最新10条加速度数据:');
    data.forEach((record, index) => {
      const x = record.acceleration_x || 0;
      const y = record.acceleration_y || 0;
      const z = record.acceleration_z || 0;
      const total = record.acceleration_total;
      
      // 手动计算总加速度
      const calculatedTotal = Math.sqrt(x*x + y*y + z*z);
      
      console.log(`${index + 1}. 时间: ${new Date(record.event_time).toLocaleString()}`);
      console.log(`   X: ${x}mg, Y: ${y}mg, Z: ${z}mg`);
      console.log(`   存储的总值: ${total}mg`);
      console.log(`   计算的总值: ${calculatedTotal.toFixed(2)}mg`);
      console.log(`   是否异常: ${total > 20000 ? '是' : '否'} (阈值: 20000mg)`);
      console.log('');
    });

    // 分析数据
    const totalValues = data.map(d => d.acceleration_total).filter(v => v !== null);
    if (totalValues.length > 0) {
      const avg = totalValues.reduce((a, b) => a + b, 0) / totalValues.length;
      const min = Math.min(...totalValues);
      const max = Math.max(...totalValues);
      
      console.log('📈 统计信息:');
      console.log(`   平均值: ${avg.toFixed(2)}mg`);
      console.log(`   最小值: ${min}mg`);
      console.log(`   最大值: ${max}mg`);
      console.log(`   超过阈值的数量: ${totalValues.filter(v => v > 20000).length}/${totalValues.length}`);
    }

    // 检查原始华为数据
    console.log('\n🔍 检查原始华为IoT数据格式...');
    const { data: rawData, error: rawError } = await supabase
      .from('iot_data')
      .select('*')
      .order('event_time', { ascending: false })
      .limit(1);

    if (rawError) {
      console.error('❌ 查询原始数据失败:', rawError);
    } else if (rawData && rawData.length > 0) {
      console.log('📋 最新一条完整数据:');
      console.log(JSON.stringify(rawData[0], null, 2));
    }

  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error);
  }
}

// 运行检查
if (require.main === module) {
  checkAccelerationData();
}

module.exports = { checkAccelerationData };
