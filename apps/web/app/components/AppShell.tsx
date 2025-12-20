'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Layout, Menu } from 'antd'

const { Header, Content } = Layout

const ITEMS = [
  { key: '/device-management', label: '设备' },
  { key: '/analysis', label: '概览' },
  { key: '/stations', label: '站点' },
  { key: '/alerts', label: '告警' },
  { key: '/settings', label: '设置' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()

  const selectedKey = ITEMS.some((i) => i.key === pathname) ? pathname : '/device-management'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontWeight: 600, marginRight: 16 }}>LSM v2</div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={ITEMS}
          onClick={(e) => router.push(e.key)}
          style={{ flex: 1 }}
        />
      </Header>
      <Content style={{ padding: 24 }}>{children}</Content>
    </Layout>
  )
}

