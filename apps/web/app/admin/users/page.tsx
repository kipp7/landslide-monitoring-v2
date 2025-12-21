'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd'
import { PlusOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  createUser,
  deleteUser as deleteUserApi,
  getUser,
  listRoles,
  listUsers,
  resetUserPassword,
  updateUser,
} from '../../../lib/api/admin'

const { Title, Text } = Typography

type RoleRow = {
  roleId: string
  name: string
  displayName: string
  description: string
}

type UserRow = {
  userId: string
  username: string
  realName: string
  email: string
  phone: string
  status: 'active' | 'inactive' | 'locked'
  roles: Array<{ roleId: string; name: string; displayName: string }>
  permissions: string[]
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

type CreateUserRequest = {
  username: string
  password: string
  realName?: string
  email?: string
  phone?: string
  roleIds?: string[]
}

type UpdateUserRequest = {
  realName?: string
  email?: string
  phone?: string
  status?: 'active' | 'inactive' | 'locked'
  roleIds?: string[]
}

function statusTag(status: UserRow['status']) {
  if (status === 'active') return <Tag color="green">active</Tag>
  if (status === 'inactive') return <Tag color="orange">inactive</Tag>
  return <Tag color="red">locked</Tag>
}

export default function AdminUsersPage() {
  const [roles, setRoles] = useState<RoleRow[]>([])

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [rows, setRows] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState<'all' | UserRow['status']>('all')
  const [roleId, setRoleId] = useState<string | 'all'>('all')

  const fetchRoles = useCallback(async () => {
    try {
      const json = await listRoles()
      setRoles(json.data?.list ?? [])
    } catch {
      setRoles([])
    }
  }, [])

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const json = await listUsers({
        page,
        pageSize,
        keyword: keyword.trim() ? keyword.trim() : undefined,
        status: status === 'all' ? undefined : status,
        roleId: roleId === 'all' ? undefined : roleId,
      })
      setRows(json.data?.list ?? [])
      setTotal(json.data?.pagination?.total ?? 0)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [keyword, page, pageSize, roleId, status])

  useEffect(() => {
    void fetchRoles()
  }, [fetchRoles])

  useEffect(() => {
    void fetchUsers()
  }, [fetchUsers])

  const [createOpen, setCreateOpen] = useState(false)
  const [createForm] = Form.useForm()
  const [createLoading, setCreateLoading] = useState(false)

  const submitCreate = async () => {
    const values = (await createForm.validateFields()) as CreateUserRequest
    setCreateLoading(true)
    try {
      await createUser(values)
      message.success('用户已创建')
      setCreateOpen(false)
      createForm.resetFields()
      await fetchUsers()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setCreateLoading(false)
    }
  }

  const [editOpen, setEditOpen] = useState(false)
  const [editUserId, setEditUserId] = useState<string>('')
  const [editForm] = Form.useForm()
  const [editLoading, setEditLoading] = useState(false)

  const openEdit = async (userId: string) => {
    try {
      setEditLoading(true)
      const json = await getUser(userId)
      const u = json.data
      setEditUserId(userId)
      editForm.setFieldsValue({
        username: u.username,
        realName: u.realName,
        email: u.email,
        phone: u.phone,
        status: u.status,
        roleIds: (u.roles ?? []).map((r) => r.roleId),
      })
      setEditOpen(true)
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setEditLoading(false)
    }
  }

  const submitEdit = async () => {
    const values = (await editForm.validateFields()) as UpdateUserRequest
    if (!editUserId) return
    setEditLoading(true)
    try {
      await updateUser(editUserId, values)
      message.success('用户已更新')
      setEditOpen(false)
      setEditUserId('')
      await fetchUsers()
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setEditLoading(false)
    }
  }

  const deleteUser = (userId: string) => {
    Modal.confirm({
      title: '删除用户',
      content: '确认删除该用户？（软删除）',
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        await deleteUserApi(userId)
        message.success('用户已删除')
        await fetchUsers()
      },
    })
  }

  const resetPassword = (userId: string) => {
    Modal.confirm({
      title: '重置密码',
      content: '将随机重置密码（不会返回明文）。确认继续？',
      okText: '确认',
      cancelText: '取消',
      onOk: async () => {
        await resetUserPassword(userId)
        message.success('已重置（用户需在下次登录时修改密码）')
      },
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            用户管理
          </Title>
          <Text type="secondary">数据源：`/api/v1/users`（需要时在“设置”配置 Bearer Token）</Text>
        </div>
        <Space>
          <Link href="/admin/access">角色/权限</Link>
          <Button icon={<ReloadOutlined />} onClick={() => void fetchUsers()} loading={loading}>
            刷新
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        </Space>
      </div>

      {error ? (
        <Card>
          <Text type="danger">加载失败：{error}</Text>
          <div className="mt-2">
            <Text type="secondary">
              常见原因：未登录导致 401/403；请先到 <a href="/login">/login</a> 登录（JWT），或在“设置”页配置手动 Bearer Token（ADMIN_API_TOKEN）。
            </Text>
          </div>
        </Card>
      ) : null}

      <Card>
        <Space wrap>
          <Input
            style={{ width: 260 }}
            value={keyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              setPage(1)
            }}
            placeholder="keyword（username/realName/phone）"
            allowClear
          />
          <Select
            style={{ width: 160 }}
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
            options={[
              { value: 'all', label: 'all' },
              { value: 'active', label: 'active' },
              { value: 'inactive', label: 'inactive' },
              { value: 'locked', label: 'locked' },
            ]}
          />
          <Select
            style={{ width: 240 }}
            value={roleId}
            onChange={(v) => {
              setRoleId(v)
              setPage(1)
            }}
            options={[
              { value: 'all', label: 'all roles' },
              ...roles.map((r) => ({ value: r.roleId, label: `${r.displayName} (${r.name})` })),
            ]}
          />
        </Space>
      </Card>

      <Card>
        <Table
          rowKey="userId"
          size="small"
          loading={loading}
          dataSource={rows}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p)
              setPageSize(ps)
            },
          }}
          columns={[
            { title: 'userId', dataIndex: 'userId', width: 240, render: (v: string) => <span className="font-mono">{v}</span> },
            { title: 'username', dataIndex: 'username' },
            { title: 'realName', dataIndex: 'realName', render: (v: string) => v || '-' },
            { title: 'status', dataIndex: 'status', width: 110, render: (v: UserRow['status']) => statusTag(v) },
            {
              title: 'roles',
              render: (_: unknown, r: UserRow) =>
                r.roles && r.roles.length > 0 ? r.roles.map((x) => <Tag key={x.roleId}>{x.name}</Tag>) : '-',
            },
            { title: 'lastLoginAt', dataIndex: 'lastLoginAt', width: 180, render: (v: string | null) => (v ? <span className="font-mono">{v}</span> : '-') },
            {
              title: 'actions',
              width: 220,
              render: (_: unknown, r: UserRow) => (
                <Space>
                  <Button size="small" onClick={() => void openEdit(r.userId)}>
                    编辑
                  </Button>
                  <Button size="small" onClick={() => resetPassword(r.userId)}>
                    重置密码
                  </Button>
                  <Button danger size="small" onClick={() => deleteUser(r.userId)}>
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title="新建用户"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false)
          createForm.resetFields()
        }}
        onOk={() => void submitCreate()}
        okText="创建"
        confirmLoading={createLoading}
      >
        <Form form={createForm} layout="vertical">
          <Form.Item name="username" label="username" rules={[{ required: true, message: '必填' }]}>
            <Input autoComplete="off" />
          </Form.Item>
          <Form.Item name="password" label="password" rules={[{ required: true, message: '必填（>=6）' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="realName" label="realName">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="phone">
            <Input />
          </Form.Item>
          <Form.Item name="roleIds" label="roles">
            <Select
              mode="multiple"
              allowClear
              options={roles.map((r) => ({ value: r.roleId, label: `${r.displayName} (${r.name})` }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="编辑用户"
        open={editOpen}
        onCancel={() => {
          setEditOpen(false)
          setEditUserId('')
        }}
        onOk={() => void submitEdit()}
        okText="保存"
        confirmLoading={editLoading}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item name="username" label="username">
            <Input disabled />
          </Form.Item>
          <Form.Item name="realName" label="realName">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="email">
            <Input />
          </Form.Item>
          <Form.Item name="phone" label="phone">
            <Input />
          </Form.Item>
          <Form.Item name="status" label="status">
            <Select
              options={[
                { value: 'active', label: 'active' },
                { value: 'inactive', label: 'inactive' },
                { value: 'locked', label: 'locked' },
              ]}
            />
          </Form.Item>
          <Form.Item name="roleIds" label="roles">
            <Select
              mode="multiple"
              allowClear
              options={roles.map((r) => ({ value: r.roleId, label: `${r.displayName} (${r.name})` }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}
