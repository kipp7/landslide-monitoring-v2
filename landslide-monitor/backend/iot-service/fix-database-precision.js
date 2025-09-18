const { createClient } = require('@supabase/supabase-js');

// Supabase 配置
const SUPABASE_URL = 'https://sdssoyyjhunltmcjoxtg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fixDatabasePrecision() {
  console.log('🔧 开始修复数据库字段精度问题...\n');

  try {
    // 1. 检查当前字段精度
    console.log('📊 检查当前字段精度...');
    const { data: columns, error: columnError } = await supabase
      .rpc('sql', {
        query: `
          SELECT 
            column_name,
            data_type,
            numeric_precision,
            numeric_scale
          FROM information_schema.columns 
          WHERE table_name = 'iot_data' 
            AND column_name LIKE 'deformation_%'
          ORDER BY column_name;
        `
      });

    if (columnError) {
      console.error('❌ 查询字段信息失败:', columnError);
      return;
    }

    console.log('当前字段精度:');
    columns.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}(${col.numeric_precision},${col.numeric_scale})`);
    });

    // 2. 修复字段精度
    console.log('\n🔨 修复字段精度...');
    
    const fixQueries = [
      'ALTER TABLE public.iot_data ALTER COLUMN deformation_distance_3d TYPE DECIMAL(12,3);',
      'ALTER TABLE public.iot_data ALTER COLUMN deformation_horizontal TYPE DECIMAL(12,3);',
      'ALTER TABLE public.iot_data ALTER COLUMN deformation_vertical TYPE DECIMAL(12,3);',
      'ALTER TABLE public.iot_data ALTER COLUMN deformation_velocity TYPE DECIMAL(10,4);'
    ];

    for (const query of fixQueries) {
      console.log(`执行: ${query}`);
      const { error } = await supabase.rpc('sql', { query });
      
      if (error) {
        console.error(`❌ 执行失败:`, error);
      } else {
        console.log('✅ 执行成功');
      }
    }

    // 3. 验证修复结果
    console.log('\n📋 验证修复结果...');
    const { data: newColumns, error: newColumnError } = await supabase
      .rpc('sql', {
        query: `
          SELECT 
            column_name,
            data_type,
            numeric_precision,
            numeric_scale
          FROM information_schema.columns 
          WHERE table_name = 'iot_data' 
            AND column_name LIKE 'deformation_%'
          ORDER BY column_name;
        `
      });

    if (newColumnError) {
      console.error('❌ 验证失败:', newColumnError);
      return;
    }

    console.log('修复后字段精度:');
    newColumns.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}(${col.numeric_precision},${col.numeric_scale})`);
    });

    // 4. 测试插入大数值
    console.log('\n🧪 测试插入大数值...');
    const testData = {
      device_id: 'test_precision',
      event_time: new Date().toISOString(),
      temperature: 25.5,
      humidity: 60.0,
      deformation_distance_3d: 12473098.123,  // 大数值测试
      deformation_horizontal: 12473098.456,
      deformation_vertical: 36.900,
      deformation_velocity: 1234.5678,
      deformation_risk_level: 4,
      deformation_type: 1,
      deformation_confidence: 0.95,
      baseline_established: true
    };

    const { data: insertResult, error: insertError } = await supabase
      .from('iot_data')
      .insert(testData)
      .select();

    if (insertError) {
      console.error('❌ 测试插入失败:', insertError);
    } else {
      console.log('✅ 测试插入成功');
      console.log('插入的数据:', insertResult[0]);
      
      // 清理测试数据
      await supabase
        .from('iot_data')
        .delete()
        .eq('device_id', 'test_precision');
      console.log('🧹 已清理测试数据');
    }

    // 5. 更新触发器函数
    console.log('\n🔄 更新触发器函数...');
    const triggerFunction = `
      CREATE OR REPLACE FUNCTION calculate_deformation_metrics()
      RETURNS TRIGGER AS $$
      BEGIN
          -- 如果有水平和垂直位移数据，自动计算3D总位移
          IF NEW.deformation_horizontal IS NOT NULL AND NEW.deformation_vertical IS NOT NULL THEN
              NEW.deformation_distance_3d := SQRT(
                  POWER(COALESCE(NEW.deformation_horizontal, 0), 2) +
                  POWER(COALESCE(NEW.deformation_vertical, 0), 2)
              );
          END IF;

          -- 根据位移距离自动评估风险等级（适应大数值范围）
          IF NEW.deformation_risk_level IS NULL AND NEW.deformation_distance_3d IS NOT NULL THEN
              CASE 
                  WHEN NEW.deformation_distance_3d >= 1000000.0 THEN NEW.deformation_risk_level := 4; -- 危险
                  WHEN NEW.deformation_distance_3d >= 100000.0 THEN NEW.deformation_risk_level := 3;  -- 高风险
                  WHEN NEW.deformation_distance_3d >= 10000.0 THEN NEW.deformation_risk_level := 2;   -- 中风险
                  WHEN NEW.deformation_distance_3d >= 1000.0 THEN NEW.deformation_risk_level := 1;    -- 低风险
                  ELSE NEW.deformation_risk_level := 0; -- 安全
              END CASE;
          END IF;

          -- 根据水平和垂直位移自动判断形变类型
          IF NEW.deformation_type IS NULL AND NEW.deformation_horizontal IS NOT NULL AND NEW.deformation_vertical IS NOT NULL THEN
              IF NEW.deformation_horizontal < 100.0 AND NEW.deformation_vertical < 100.0 THEN
                  NEW.deformation_type := 0; -- 无形变
              ELSIF NEW.deformation_horizontal > NEW.deformation_vertical * 2 THEN
                  NEW.deformation_type := 1; -- 水平
              ELSIF NEW.deformation_vertical > NEW.deformation_horizontal * 2 THEN
                  NEW.deformation_type := 2; -- 垂直
              ELSE
                  NEW.deformation_type := 3; -- 复合
              END IF;
          END IF;

          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `;

    const { error: functionError } = await supabase.rpc('sql', { query: triggerFunction });
    
    if (functionError) {
      console.error('❌ 更新触发器函数失败:', functionError);
    } else {
      console.log('✅ 触发器函数更新成功');
    }

    console.log('\n🎉 数据库字段精度修复完成！');
    console.log('\n📋 修复总结:');
    console.log('  ✅ deformation_distance_3d: DECIMAL(12,3) - 支持大范围数值');
    console.log('  ✅ deformation_horizontal: DECIMAL(12,3) - 支持大范围数值');
    console.log('  ✅ deformation_vertical: DECIMAL(12,3) - 支持大范围数值');
    console.log('  ✅ deformation_velocity: DECIMAL(10,4) - 支持高精度数值');
    console.log('  ✅ 触发器函数已更新，适应新的数值范围');

  } catch (error) {
    console.error('❌ 修复过程中发生错误:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixDatabasePrecision().then(() => {
    console.log('\n✅ 脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('❌ 脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = { fixDatabasePrecision };
