#!/usr/bin/env node

/**
 * API连接诊断工具
 * 用于排查前端通过域名访问时无法连接后端的问题
 */

const https = require('https');
const http = require('http');

// 测试配置
const tests = [
  {
    name: '测试Supabase直连（baselines API）',
    url: 'https://sdssoyyjhunltmcjoxtg.supabase.co/rest/v1/gps_baselines?select=*&status=eq.active',
    method: 'GET',
    headers: {
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNkc3NveXlqaHVubHRtY2pveHRnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDE0MzY3NTIsImV4cCI6MjA1NzAxMjc1Mn0.FisL8HivC_g-cnq4o7BNqHQ8vKDUpgfW3lUINfDXMSA'
    }
  },
  {
    name: '测试本地IoT服务（直连）',
    url: 'http://localhost:5100/api/gps-deformation/device_1',
    method: 'POST',
    data: { timeRange: '24h' }
  },
  {
    name: '测试127.0.0.1 IoT服务（直连）',
    url: 'http://127.0.0.1:5100/api/gps-deformation/device_1',
    method: 'POST',
    data: { timeRange: '24h' }
  },
  {
    name: '测试通过nginx代理的IoT服务',
    url: 'http://ylsf.chat:1020/iot/api/gps-deformation/device_1',
    method: 'POST', 
    data: { timeRange: '24h' }
  },
  {
    name: '测试前端API路由（本地）',
    url: 'http://localhost:3000/api/baselines',
    method: 'GET'
  },
  {
    name: '测试前端API路由（域名）',
    url: 'http://ylsf.chat:1020/api/baselines',
    method: 'GET'
  },
  {
    name: '测试前端GPS形变API（本地）',
    url: 'http://localhost:3000/api/gps-deformation/device_1',
    method: 'POST',
    data: { timeRange: '24h' }
  },
  {
    name: '测试前端GPS形变API（域名）',
    url: 'http://ylsf.chat:1020/api/gps-deformation/device_1',
    method: 'POST',
    data: { timeRange: '24h' }
  }
];

// HTTP请求函数
function makeRequest(config) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.url);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'API-Diagnostic-Tool/1.0',
        ...config.headers
      },
      timeout: 10000 // 10秒超时
    };

    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data,
          length: data.length
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    // 发送POST数据
    if (config.data && (config.method === 'POST' || config.method === 'PUT')) {
      req.write(JSON.stringify(config.data));
    }

    req.end();
  });
}

// 运行测试
async function runDiagnostics() {
  console.log('🔍 开始API连接诊断...\n');
  console.log('=' .repeat(80));
  
  for (const test of tests) {
    console.log(`\n📊 ${test.name}`);
    console.log(`🔗 URL: ${test.url}`);
    console.log(`📤 方法: ${test.method}`);
    
    try {
      const startTime = Date.now();
      const result = await makeRequest(test);
      const duration = Date.now() - startTime;
      
      console.log(`✅ 状态: ${result.status}`);
      console.log(`⏱️  响应时间: ${duration}ms`);
      console.log(`📦 数据大小: ${result.length} bytes`);
      
      // 尝试解析JSON响应
      try {
        const jsonData = JSON.parse(result.data);
        console.log(`📋 响应类型: JSON`);
        if (jsonData.success !== undefined) {
          console.log(`🎯 成功状态: ${jsonData.success}`);
        }
        if (jsonData.error) {
          console.log(`❌ 错误信息: ${jsonData.error}`);
        }
        if (jsonData.data && Array.isArray(jsonData.data)) {
          console.log(`📊 数据数量: ${jsonData.data.length}`);
        }
      } catch (e) {
        console.log(`📋 响应类型: 非JSON (${result.data.substring(0, 100)}...)`);
      }
      
    } catch (error) {
      console.log(`❌ 连接失败: ${error.message}`);
      
      // 提供具体的错误分析
      if (error.code === 'ECONNREFUSED') {
        console.log(`💡 分析: 服务未启动或端口不可访问`);
      } else if (error.code === 'ENOTFOUND') {
        console.log(`💡 分析: 域名解析失败或主机不存在`);
      } else if (error.code === 'ETIMEDOUT' || error.message.includes('timeout')) {
        console.log(`💡 分析: 请求超时，可能是网络问题或服务响应慢`);
      }
    }
    
    console.log('-'.repeat(60));
  }
  
  console.log('\n🔧 诊断建议:');
  console.log('1. 检查所有服务是否正常运行：');
  console.log('   - 前端服务 (端口 3000)');
  console.log('   - 后端IoT服务 (端口 5100)');
  console.log('   - nginx代理服务 (端口 1020)');
  console.log('');
  console.log('2. 检查nginx配置是否正确：');
  console.log('   - /iot/ 路径是否正确代理到 127.0.0.1:5100');
  console.log('   - 代理头设置是否正确');
  console.log('');
  console.log('3. 检查防火墙设置：');
  console.log('   - 端口 1020, 3000, 5100 是否开放');
  console.log('   - 域名解析是否正确');
  console.log('');
  console.log('4. 检查服务器网络配置：');
  console.log('   - 服务是否绑定到正确的IP地址');
  console.log('   - 是否允许外部访问');
}

// 如果直接运行脚本
if (require.main === module) {
  runDiagnostics().catch(console.error);
}

module.exports = { runDiagnostics, makeRequest };