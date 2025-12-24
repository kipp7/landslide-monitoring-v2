'use client'

import { Layout, Menu } from 'antd'
import { BarChartOutlined, DesktopOutlined, EnvironmentOutlined, HomeOutlined, MenuUnfoldOutlined, SettingOutlined } from '@ant-design/icons'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

const { Sider } = Layout

export default function HoverSidebar() {
  const [hovering, setHovering] = useState(false)
  const router = useRouter()

  return (
    <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} className="fixed left-0 top-0 z-[1000] h-full">
      <Sider
        theme="dark"
        collapsible
        collapsed={!hovering}
        trigger={null}
        width={200}
        collapsedWidth={0}
        className="h-full transition-all duration-300 ease-in-out"
        style={{
          backgroundColor: '#001529',
          borderRight: '4px solid rgba(0, 255, 255, 0.1)',
        }}
      >
        <div
          className="flex h-16 items-center justify-center text-xl font-bold text-cyan-400"
          style={{ borderBottom: '4px solid rgba(0, 255, 255, 0.1)' }}
        >
          {hovering ? '菜单导航' : <MenuUnfoldOutlined />}
        </div>

        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['analysis']}
          onClick={({ key }) => {
            if (key === 'home') router.push('/')
            if (key === 'analysis') router.push('/analysis')
            if (key === 'device-management') router.push('/device-management')
            if (key === 'gps-monitoring') router.push('/gps-monitoring')
            if (key === 'settings') router.push('/settings')
          }}
          items={[
            { key: 'home', icon: <HomeOutlined />, label: '首页' },
            { key: 'analysis', icon: <BarChartOutlined />, label: '数据分析' },
            { key: 'device-management', icon: <DesktopOutlined />, label: '设备管理' },
            { key: 'gps-monitoring', icon: <EnvironmentOutlined />, label: '地质形变监测' },
            { key: 'settings', icon: <SettingOutlined />, label: '系统设置' },
          ]}
        />
      </Sider>
    </div>
  )
}

