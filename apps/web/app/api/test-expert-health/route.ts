import { NextRequest, NextResponse } from 'next/server';

/**
 * 专家级健康算法测试接口
 * GET /api/test-expert-health?device_id=device_1
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('device_id') || 'device_1';

    console.log(`🧪 开始测试专家级健康算法: 设备=${deviceId}`);

    // 测试各项指标
    const testResults: any = {
      deviceId,
      timestamp: new Date().toISOString(),
      tests: {}
    };

    // 1. 测试电池电量计算
    try {
      const batteryResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000'}/api/device-health-expert?device_id=${deviceId}&metric=battery`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (batteryResponse.ok) {
        const batteryResult = await batteryResponse.json();
        testResults.tests.battery = {
          status: 'success',
          data: batteryResult.data,
          responseTime: Date.now()
        };
        console.log(`✅ 电池测试成功: ${batteryResult.data?.battery?.soc}%`);
      } else {
        throw new Error(`Battery API failed: ${batteryResponse.status}`);
      }
    } catch (error) {
      testResults.tests.battery = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
      console.error(`❌ 电池测试失败:`, error);
    }

    // 2. 测试信号质量
    try {
      const signalResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000'}/api/device-health-expert?device_id=${deviceId}&metric=signal`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (signalResponse.ok) {
        const signalResult = await signalResponse.json();
        testResults.tests.signal = {
          status: 'success',
          data: signalResult.data,
          responseTime: Date.now()
        };
        console.log(`✅ 信号测试成功: ${signalResult.data?.signal?.signalStrength}%`);
      } else {
        throw new Error(`Signal API failed: ${signalResponse.status}`);
      }
    } catch (error) {
      testResults.tests.signal = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
      console.error(`❌ 信号测试失败:`, error);
    }

    // 3. 测试综合健康度
    try {
      const healthResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000'}/api/device-health-expert?device_id=${deviceId}&metric=all`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (healthResponse.ok) {
        const healthResult = await healthResponse.json();
        testResults.tests.comprehensive = {
          status: 'success',
          data: healthResult.data,
          responseTime: Date.now()
        };
        console.log(`✅ 综合健康测试成功: ${healthResult.data?.health?.overallScore}%`);
      } else {
        throw new Error(`Health API failed: ${healthResponse.status}`);
      }
    } catch (error) {
      testResults.tests.comprehensive = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
      console.error(`❌ 综合健康测试失败:`, error);
    }

    // 4. 测试设备管理API集成
    try {
      const deviceResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://127.0.0.1:3000'}/api/device-management?device_id=${deviceId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (deviceResponse.ok) {
        const deviceResult = await deviceResponse.json();
        testResults.tests.deviceManagement = {
          status: 'success',
          data: {
            health_score: deviceResult.data?.health_score,
            battery_level: deviceResult.data?.battery_level,
            signal_strength: deviceResult.data?.signal_strength,
            computation_method: deviceResult.computation_method,
            expert_analysis_available: !!deviceResult.expert_analysis
          },
          responseTime: Date.now()
        };
        console.log(`✅ 设备管理集成测试成功`);
      } else {
        throw new Error(`Device Management API failed: ${deviceResponse.status}`);
      }
    } catch (error) {
      testResults.tests.deviceManagement = {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error)
      };
      console.error(`❌ 设备管理集成测试失败:`, error);
    }

    // 计算测试结果摘要
    const totalTests = Object.keys(testResults.tests).length;
    const successfulTests = Object.values(testResults.tests).filter((test: any) => test.status === 'success').length;
    const successRate = (successfulTests / totalTests) * 100;

    const summary = {
      totalTests,
      successfulTests,
      failedTests: totalTests - successfulTests,
      successRate: Math.round(successRate * 10) / 10,
      overallStatus: successRate >= 75 ? 'good' : successRate >= 50 ? 'partial' : 'poor'
    };

    console.log(`🎯 测试摘要: ${successfulTests}/${totalTests} 通过 (${summary.successRate}%)`);

    return NextResponse.json({
      success: true,
      data: testResults,
      summary,
      recommendations: generateRecommendations(testResults.tests, summary),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ 专家级健康算法测试失败:', error);
    return NextResponse.json({
      success: false,
      error: '测试执行失败',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

/**
 * 生成测试建议
 */
function generateRecommendations(tests: any, summary: any): string[] {
  const recommendations: string[] = [];

  if (summary.successRate < 100) {
    recommendations.push('部分测试失败，建议检查服务依赖和配置');
  }

  if (tests.battery?.status === 'failed') {
    recommendations.push('电池算法服务异常，检查ExpertDeviceAlgorithms类初始化');
  }

  if (tests.signal?.status === 'failed') {
    recommendations.push('信号质量算法服务异常，检查通信指标数据源');
  }

  if (tests.comprehensive?.status === 'failed') {
    recommendations.push('综合健康算法服务异常，检查数据库连接和数据完整性');
  }

  if (tests.deviceManagement?.status === 'failed') {
    recommendations.push('设备管理API集成失败，检查API调用链路');
  }

  if (recommendations.length === 0) {
    recommendations.push('所有测试通过，专家级算法运行正常');
  }

  return recommendations;
}
