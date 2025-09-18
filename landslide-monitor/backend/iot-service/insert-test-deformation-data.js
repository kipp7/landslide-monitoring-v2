const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * 插入GPS形变分析测试数据
 */
async function insertTestDeformationData() {
  console.log('🧪 开始插入GPS形变分析测试数据...\n');

  try {
    // 获取最新的一条记录作为基础
    const { data: latestRecord, error: fetchError } = await supabase
      .from('iot_data')
      .select('*')
      .eq('device_id', 'device_1')
      .order('event_time', { ascending: false })
      .limit(1);

    if (fetchError) {
      throw fetchError;
    }

    if (!latestRecord || latestRecord.length === 0) {
      console.log('❌ 没有找到现有数据记录');
      return;
    }

    const baseRecord = latestRecord[0];
    console.log('📋 基础记录:', {
      id: baseRecord.id,
      device_id: baseRecord.device_id,
      event_time: baseRecord.event_time,
      latitude: baseRecord.latitude,
      longitude: baseRecord.longitude
    });

    // 生成模拟的GPS形变分析数据
    const deformationData = {
      deformation_distance_3d: 0.125,      // 3D总位移距离 (m)
      deformation_horizontal: 0.089,       // 水平位移距离 (m)
      deformation_vertical: -0.036,        // 垂直位移距离 (m, 负值表示下降)
      deformation_velocity: 0.0023,        // 形变速度 (m/h)
      deformation_risk_level: 1,           // 形变风险等级 (1=低风险)
      deformation_type: 3,                 // 形变类型 (3=复合)
      deformation_confidence: 0.87,        // 分析置信度
      baseline_established: true           // 基准位置状态
    };

    // 更新最新记录，添加GPS形变分析数据
    const { data: updateResult, error: updateError } = await supabase
      .from('iot_data')
      .update(deformationData)
      .eq('id', baseRecord.id)
      .select();

    if (updateError) {
      throw updateError;
    }

    console.log('✅ 成功更新记录，添加GPS形变分析数据:');
    console.log('   记录ID:', baseRecord.id);
    console.log('   3D总位移:', deformationData.deformation_distance_3d, 'm');
    console.log('   水平位移:', deformationData.deformation_horizontal, 'm');
    console.log('   垂直位移:', deformationData.deformation_vertical, 'm');
    console.log('   形变速度:', deformationData.deformation_velocity, 'm/h');
    console.log('   风险等级:', deformationData.deformation_risk_level);
    console.log('   形变类型:', deformationData.deformation_type);
    console.log('   置信度:', deformationData.deformation_confidence);
    console.log('   基准建立:', deformationData.baseline_established);

    // 验证更新结果
    const { data: verifyData, error: verifyError } = await supabase
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
        deformation_risk_level,
        deformation_type,
        deformation_confidence,
        baseline_established
      `)
      .eq('id', baseRecord.id)
      .single();

    if (verifyError) {
      throw verifyError;
    }

    console.log('\n🔍 验证更新结果:');
    console.log('   记录ID:', verifyData.id);
    console.log('   设备ID:', verifyData.device_id);
    console.log('   时间:', new Date(verifyData.event_time).toLocaleString());
    console.log('   GPS坐标:', `${verifyData.latitude}, ${verifyData.longitude}`);
    console.log('   形变数据:');
    console.log(`     3D总位移: ${verifyData.deformation_distance_3d}m`);
    console.log(`     水平位移: ${verifyData.deformation_horizontal}m`);
    console.log(`     垂直位移: ${verifyData.deformation_vertical}m`);
    console.log(`     形变速度: ${verifyData.deformation_velocity}m/h`);
    console.log(`     风险等级: ${verifyData.deformation_risk_level}`);
    console.log(`     形变类型: ${verifyData.deformation_type}`);
    console.log(`     置信度: ${verifyData.deformation_confidence}`);
    console.log(`     基准建立: ${verifyData.baseline_established}`);

    console.log('\n🎉 GPS形变分析测试数据插入成功！');
    console.log('\n📝 后续步骤:');
    console.log('   1. 刷新前端设备管理页面');
    console.log('   2. 检查GPS形变分析面板是否显示正确数据');
    console.log('   3. 验证API是否正确返回形变分析数据');

  } catch (error) {
    console.error('❌ 插入测试数据失败:', error);
  }
}

// 执行插入
if (require.main === module) {
  insertTestDeformationData()
    .then(() => {
      console.log('\n✨ 测试数据插入脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 测试数据插入脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { insertTestDeformationData };
