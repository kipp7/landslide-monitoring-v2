'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Form, Input, Space, Typography, message } from 'antd'
import { clearStoredTokens, getStoredAccessToken, getStoredRefreshToken } from '../../lib/authStorage'

const { Title, Text } = Typography

export default function SettingsPage() {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [accessPresent, setAccessPresent] = useState(false)
  const [refreshPresent, setRefreshPresent] = useState(false)

  const syncAuthState = () => {
    setAccessPresent(Boolean(getStoredAccessToken()))
    setRefreshPresent(Boolean(getStoredRefreshToken()))
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    const baseUrl = window.localStorage.getItem('LSMV2_API_BASE_URL') || ''
    const token = window.localStorage.getItem('LSMV2_API_BEARER_TOKEN') || ''
    form.setFieldsValue({ baseUrl, token })

    syncAuthState()
    const onChanged = () => syncAuthState()
    window.addEventListener('lsmv2-auth-changed', onChanged)
    return () => window.removeEventListener('lsmv2-auth-changed', onChanged)
  }, [form])

  const onSave = async () => {
    if (typeof window === 'undefined') return
    const values = (await form.validateFields()) as { baseUrl?: string; token?: string }
    setSaving(true)
    try {
      window.localStorage.setItem('LSMV2_API_BASE_URL', (values.baseUrl || '').trim())
      window.localStorage.setItem('LSMV2_API_BEARER_TOKEN', (values.token || '').trim())
      message.success('已保存（刷新页面后生效）')
    } finally {
      setSaving(false)
    }
  }

  const onClearManual = () => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem('LSMV2_API_BASE_URL')
    window.localStorage.removeItem('LSMV2_API_BEARER_TOKEN')
    form.setFieldsValue({ baseUrl: '', token: '' })
    message.success('已清除')
  }

  const authStatusText = useMemo(() => {
    if (accessPresent && refreshPresent) return '已登录（Access+Refresh 存在）'
    if (accessPresent) return 'Access token 存在（Refresh 缺失）'
    if (refreshPresent) return 'Refresh token 存在（Access 缺失）'
    return '未登录'
  }, [accessPresent, refreshPresent])

  const clearAuth = () => {
    clearStoredTokens()
    message.success('已清除登录态')
    syncAuthState()
  }

  return (
    <div className="space-y-6">
      <div>
        <Title level={3} style={{ margin: 0 }}>
          设置
        </Title>
        <Text type="secondary">配置 v2 API Base URL / 手动 Bearer Token（可选）</Text>
      </div>

      <Card title="API 配置" size="small">
        <Form form={form} layout="vertical">
          <Form.Item
            label="NEXT_PUBLIC_API_BASE_URL（可选）"
            name="baseUrl"
            tooltip="不填则默认使用当前站点同域路径（/api/v1/*）"
          >
            <Input placeholder="例如：http://localhost:8080" allowClear />
          </Form.Item>
          <Form.Item
            label="手动 Bearer Token（可选）"
            name="token"
            tooltip="用于 ADMIN_API_TOKEN 等静态 token 场景；如果你使用 JWT 登录，可留空"
          >
            <Input.Password placeholder="Bearer token" allowClear />
          </Form.Item>

          <Space>
            <Button type="primary" onClick={() => void onSave()} loading={saving}>
              保存
            </Button>
            <Button onClick={onClearManual} disabled={saving}>
              清除手动配置
            </Button>
          </Space>
        </Form>
      </Card>

      <Card title="登录态（JWT）" size="small">
        <Space direction="vertical">
          <Text>
            状态：<Text strong>{authStatusText}</Text>
          </Text>
          <Text type="secondary">
            JWT token 存储在浏览器 LocalStorage（`LSMV2_AUTH_ACCESS_TOKEN` / `LSMV2_AUTH_REFRESH_TOKEN`）。
          </Text>
          <Button danger onClick={clearAuth} disabled={!accessPresent && !refreshPresent}>
            清除登录态
          </Button>
        </Space>
      </Card>
    </div>
  )
}

