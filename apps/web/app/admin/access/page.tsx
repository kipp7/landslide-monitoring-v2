'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Card, Space, Table, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { apiGetJson, type ApiSuccessResponse } from '../../../lib/v2Api'

const { Title, Text } = Typography

type RoleRow = {
  roleId: string
  name: string
  displayName: string
  description: string
}

type RolesResponse = { list: RoleRow[] }

type PermissionRow = { permissionKey: string; description: string }

type PermissionsResponse = { list: PermissionRow[] }

export default function AccessPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])
  const [perms, setPerms] = useState<PermissionRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [rolesJson, permsJson] = await Promise.all([
        apiGetJson<ApiSuccessResponse<RolesResponse>>('/api/v1/roles'),
        apiGetJson<ApiSuccessResponse<PermissionsResponse>>('/api/v1/permissions'),
      ])
      setRoles(rolesJson.data?.list ?? [])
      setPerms(permsJson.data?.list ?? [])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRoles([])
      setPerms([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchAll()
  }, [fetchAll])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            访问控制（RBAC）
          </Title>
          <Text type="secondary">数据源：`/api/v1/roles`、`/api/v1/permissions`</Text>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchAll()} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
          <div className="mt-2">
            <Text type="secondary">如果服务端配置了 `ADMIN_API_TOKEN`，请在“设置”页配置 Bearer Token。</Text>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="角色（roles）" size="small">
          <Table
            rowKey="roleId"
            size="small"
            loading={loading}
            dataSource={roles}
            pagination={{ pageSize: 20 }}
            columns={[
              { title: 'roleId', dataIndex: 'roleId', render: (v: string) => <span className="font-mono">{v}</span> },
              { title: 'name', dataIndex: 'name' },
              { title: 'displayName', dataIndex: 'displayName' },
              { title: 'description', dataIndex: 'description' },
            ]}
          />
        </Card>

        <Card title="权限（permissions）" size="small">
          <Table
            rowKey="permissionKey"
            size="small"
            loading={loading}
            dataSource={perms}
            pagination={{ pageSize: 30 }}
            columns={[
              {
                title: 'permissionKey',
                dataIndex: 'permissionKey',
                render: (v: string) => <span className="font-mono">{v}</span>,
              },
              { title: 'description', dataIndex: 'description' },
            ]}
          />
        </Card>
      </div>
    </div>
  )
}

