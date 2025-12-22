'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Button, Dropdown, Layout, Menu, Space, Typography } from 'antd'
import { LoginOutlined, LogoutOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons'
import { useAuth } from './AuthProvider'

const { Header, Content } = Layout
const { Text } = Typography

function hasAnyPermission(userPerms: string[] | undefined, required: string[]): boolean {
  if (!userPerms || userPerms.length === 0) return false
  return required.some((p) => userPerms.includes(p))
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, loading, logout } = useAuth()

  const items = (() => {
    const base = [
      { key: '/analysis', label: '概览' },
      { key: '/device-management', label: '设备' },
      { key: '/stations', label: '站点' },
      { key: '/alerts', label: '告警' },
    ]

    const perms = user?.permissions ?? []
    const dataVisible = hasAnyPermission(perms, ['data:view', 'data:analysis', 'data:export'])
    const aiVisible = hasAnyPermission(perms, ['data:analysis'])
    const gpsMonitoringVisible = hasAnyPermission(perms, ['data:view'])
    const gpsDeformationVisible = hasAnyPermission(perms, ['data:analysis'])
    const adminVisible = hasAnyPermission(perms, ['user:view', 'user:create', 'user:update', 'user:delete'])
    const opsVisible = hasAnyPermission(perms, ['system:log', 'system:config'])

    const extra = []
    if (dataVisible) base.splice(1, 0, { key: '/data', label: '数据' })
    if (aiVisible) {
      const dataIndex = base.findIndex((i) => i.key === '/data')
      const insertAt = dataIndex >= 0 ? dataIndex + 1 : 1
      base.splice(insertAt, 0, { key: '/ai/predictions', label: 'AI 预测' })
    }
    if (gpsMonitoringVisible || gpsDeformationVisible) {
      const stationIndex = base.findIndex((i) => i.key === '/stations')
      const insertAt = stationIndex >= 0 ? stationIndex + 1 : base.length
      if (gpsMonitoringVisible) base.splice(insertAt, 0, { key: '/gps-monitoring', label: 'GPS 监测' })
      if (gpsDeformationVisible)
        base.splice(insertAt + (gpsMonitoringVisible ? 1 : 0), 0, { key: '/gps-deformation', label: 'GPS 形变' })
    }
    if (adminVisible) extra.push({ key: '/admin', label: '管理' })
    if (opsVisible) extra.push({ key: '/ops', label: '运维' })
    extra.push({ key: '/settings', label: '设置' })

    return base.concat(extra)
  })()

  const selectedKey = items.find((i) => pathname === i.key || pathname.startsWith(`${i.key}/`))?.key ?? '/analysis'

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center' }}>
        <div style={{ color: '#fff', fontWeight: 600, marginRight: 16 }}>LSM v2</div>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={items}
          onClick={(e) => router.push(e.key)}
          style={{ flex: 1 }}
        />
        <Space>
          {loading ? <Text style={{ color: '#ddd' }}>Loading…</Text> : null}
          {!loading && user ? (
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'me',
                    icon: <UserOutlined />,
                    label: `${user.realName || user.username} (${user.username})`,
                    disabled: true,
                  },
                  { type: 'divider' },
                  {
                    key: 'settings',
                    icon: <SettingOutlined />,
                    label: '设置',
                    onClick: () => router.push('/settings'),
                  },
                  {
                    key: 'logout',
                    icon: <LogoutOutlined />,
                    label: '退出登录',
                    onClick: () => logout(),
                  },
                ],
              }}
              placement="bottomRight"
            >
              <Button>{user.username}</Button>
            </Dropdown>
          ) : null}
          {!loading && !user ? (
            <Button icon={<LoginOutlined />} onClick={() => router.push('/login')}>
              登录
            </Button>
          ) : null}
        </Space>
      </Header>
      <Content style={{ padding: 24 }}>{children}</Content>
    </Layout>
  )
}
