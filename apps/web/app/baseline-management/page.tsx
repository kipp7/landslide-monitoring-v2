'use client';

import React, { useEffect, useState } from 'react';
import { Button, Space } from 'antd';
// 移除不再使用的图标导入
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BaselineManagementV2 from '../components/BaselineManagementV2';
import HoverSidebar from '../components/HoverSidebar';

export default function BaselineManagementPage() {
  const router = useRouter();
  const [referrerPage, setReferrerPage] = useState<string>('');

  useEffect(() => {
    // 检查来源页面，优先默认为gps-monitoring
    const referrer = document.referrer;
    if (referrer.includes('/gps-monitoring')) {
      setReferrerPage('gps-monitoring');
    } else if (referrer.includes('/device-management')) {
      setReferrerPage('device-management');
    } else {
      setReferrerPage('gps-monitoring'); // 默认改为gps-monitoring
    }
  }, []);

  const getBackButton = () => {
    if (referrerPage === 'gps-monitoring') {
      return (
        <Link href="/gps-monitoring">
          <Button 
            type="text" 
            className="text-cyan-200 hover:text-white hover:bg-slate-700/50"
            style={{ 
              color: '#a5f3fc',
              fontWeight: '500'
            }}
          >
            返回地质形变监测
          </Button>
        </Link>
      );
    }
    
    return (
      <Link href="/device-management">
        <Button 
          type="text" 
          className="text-cyan-200 hover:text-white hover:bg-slate-700/50"
          style={{ 
            color: '#a5f3fc',
            fontWeight: '500'
          }}
        >
          返回设备管理
        </Button>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* 侧边栏 */}
      <HoverSidebar />
      
      {/* 主要内容区域 - 适配侧边栏布局 */}
      <div className="ml-0 transition-all duration-300">
        {/* 顶部导航栏 */}
        <div className="bg-slate-800/80 backdrop-blur-sm border-b border-slate-600 sticky top-0 z-40">
          <div className="w-full px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {getBackButton()}
                <div className="h-6 w-px bg-slate-600"></div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-xl font-bold text-cyan-300">
                    地质形变基准点管理 V2.0
                  </h1>
                </div>
              </div>
              
              {/* 右侧快捷导航 */}
              <Space size="middle">
                {referrerPage === 'device-management' && (
                  <Link href="/gps-monitoring">
                    <Button 
                      type="text" 
                      className="text-cyan-200 hover:text-white hover:bg-slate-700/50 text-sm"
                      style={{ 
                        color: '#a5f3fc',
                        fontWeight: '500'
                      }}
                    >
                      地质形变监测
                    </Button>
                  </Link>
                )}
                {referrerPage === 'gps-monitoring' && (
                  <Link href="/device-management">
                    <Button 
                      type="text" 
                      className="text-cyan-200 hover:text-white hover:bg-slate-700/50 text-sm"
                      style={{ 
                        color: '#a5f3fc',
                        fontWeight: '500'
                      }}
                    >
                      设备管理
                    </Button>
                  </Link>
                )}
              </Space>
            </div>
          </div>
        </div>

        {/* 主要内容区域 - 铺满整个宽度 */}
        <div className="w-full px-6 py-8">
          <BaselineManagementV2 />
        </div>
      </div>
    </div>
  );
}