'use client';

import React, { useState } from 'react';
import { Layout, Menu } from 'antd';
import {
  MenuUnfoldOutlined,
  HomeOutlined,
  SettingOutlined,
  BarChartOutlined,
  DesktopOutlined,
  EnvironmentOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Sider } = Layout;

const HoverSidebar = () => {
  const [hovering, setHovering] = useState(false);
  const router = useRouter();

  return (
    <div
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      className="fixed top-0 left-0 h-full z-[1000]"
    >
      <Sider
        theme="dark"
        collapsible
        collapsed={!hovering}
        trigger={null}
        width={200}
        collapsedWidth={0}
        className="h-full transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: '#001529', // 深色背景
          borderRight: '4px solid rgba(0, 255, 255, 0.1)', // 科技蓝色边框
        }}
      >
        <div
          className="h-16 flex items-center justify-center text-cyan-400 font-bold text-xl"
          style={{
            borderBottom: '4px solid rgba(0, 255, 255, 0.1)', // 修改横线颜色为科技蓝
          }}
        >
          {hovering ? '菜单导航' : <MenuUnfoldOutlined />}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['1']}
          onClick={({ key }) => {
            if (key === 'home') router.push('/');
            if (key === 'analysis') router.push('/analysis');
            if (key === 'device-management') router.push('/device-management');
            if (key === 'gps-monitoring') router.push('/gps-monitoring');
            if (key === 'settings') router.push('/settings');
          }}
          items={[
            {
              key: 'home',
              icon: <HomeOutlined />,
              label: '首页',
            },
            {
              key: 'analysis',
              icon: <BarChartOutlined />,
              label: '数据分析',
            },
            {
              key: 'device-management',
              icon: <DesktopOutlined />,
              label: '设备管理',
            },
            {
              key: 'gps-monitoring',
              icon: <EnvironmentOutlined />,
              label: '地质形变监测',
            },
            {
              key: 'settings',
              icon: <SettingOutlined />,
              label: '系统设置',
            },
          ]}
        />
      </Sider>
    </div>
  );
};

export default HoverSidebar;
