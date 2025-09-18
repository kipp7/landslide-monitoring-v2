'use client';

import React, { useState, useEffect } from 'react';
import { getApiUrl, API_CONFIG } from '../../lib/config';

export default function DebugApiPage() {
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const addResult = (test: string, success: boolean, data: any, error?: string) => {
    setResults(prev => [...prev, {
      test,
      success,
      data,
      error,
      timestamp: new Date().toLocaleString()
    }]);
  };

  const testApi = async () => {
    setLoading(true);
    setResults([]);

    // 显示当前配置
    addResult('API配置检查', true, {
      hostname: window.location.hostname,
      iotBaseUrl: API_CONFIG.IOT_BASE_URL,
      fullUrl: getApiUrl('/health')
    });

    // 测试健康检查
    try {
      const healthUrl = getApiUrl('/health');
      console.log('测试健康检查:', healthUrl);
      
      const response = await fetch(healthUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        addResult('健康检查', true, data);
      } else {
        addResult('健康检查', false, null, `HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      addResult('健康检查', false, null, error instanceof Error ? error.message : String(error));
    }

    // 测试华为云配置
    try {
      const configUrl = getApiUrl('/huawei/config');
      console.log('测试华为云配置:', configUrl);
      
      const response = await fetch(configUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        addResult('华为云配置', true, data);
      } else {
        addResult('华为云配置', false, null, `HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      addResult('华为云配置', false, null, error instanceof Error ? error.message : String(error));
    }

    // 测试设备影子
    try {
      const shadowUrl = getApiUrl('/huawei/devices/6815a14f9314d118511807c6_rk2206/shadow');
      console.log('测试设备影子:', shadowUrl);
      
      const response = await fetch(shadowUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        addResult('设备影子', true, data);
      } else {
        addResult('设备影子', false, null, `HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      addResult('设备影子', false, null, error instanceof Error ? error.message : String(error));
    }

    // 测试电机控制
    try {
      const motorUrl = getApiUrl('/huawei/devices/6815a14f9314d118511807c6_rk2206/motor');
      console.log('测试电机控制:', motorUrl);
      
      const response = await fetch(motorUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ enable: true, speed: 50, direction: 1, duration: 2 }),
      });
      
      if (response.ok) {
        const data = await response.json();
        addResult('电机控制', true, data);
      } else {
        const errorText = await response.text();
        addResult('电机控制', false, null, `HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      addResult('电机控制', false, null, error instanceof Error ? error.message : String(error));
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6">API连接调试</h1>
        
        <div className="mb-6">
          <button
            onClick={testApi}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '测试中...' : '开始测试'}
          </button>
        </div>

        <div className="space-y-4">
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${
                result.success 
                  ? 'bg-green-900/20 border-green-500' 
                  : 'bg-red-900/20 border-red-500'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">
                  {result.success ? '✅' : '❌'} {result.test}
                </h3>
                <span className="text-sm text-slate-400">{result.timestamp}</span>
              </div>
              
              {result.error && (
                <div className="text-red-400 text-sm mb-2">
                  错误: {result.error}
                </div>
              )}
              
              {result.data && (
                <pre className="text-xs bg-slate-800 p-2 rounded overflow-auto">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>

        <div className="mt-8 p-4 bg-slate-800 rounded-lg">
          <h3 className="font-semibold mb-2">当前环境信息</h3>
          <div className="text-sm space-y-1">
            <div>域名: {typeof window !== 'undefined' ? window.location.hostname : 'N/A'}</div>
            <div>端口: {typeof window !== 'undefined' ? window.location.port : 'N/A'}</div>
            <div>协议: {typeof window !== 'undefined' ? window.location.protocol : 'N/A'}</div>
            <div>完整URL: {typeof window !== 'undefined' ? window.location.href : 'N/A'}</div>
            <div>API基础URL: {API_CONFIG.IOT_BASE_URL}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
