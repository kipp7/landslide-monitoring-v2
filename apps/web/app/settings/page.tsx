'use client'

import { useEffect, useState } from 'react'
import { Button, Card, Form, Input, Space, Typography, message } from 'antd'

const { Title, Text } = Typography

export default function SettingsPage() {
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const baseUrl = window.localStorage.getItem('LSMV2_API_BASE_URL') || ''
    const token = window.localStorage.getItem('LSMV2_API_BEARER_TOKEN') || ''
    form.setFieldsValue({ baseUrl, token })
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

  const onClear = () => {
    if (typeof window === 'undefined') return
    window.localStorage.removeItem('LSMV2_API_BASE_URL')
    window.localStorage.removeItem('LSMV2_API_BEARER_TOKEN')
    form.setFieldsValue({ baseUrl: '', token: '' })
    message.success('已清除')
  }

  return (
    <div className="space-y-6">
      <div>
        <Title level={3} style={{ margin: 0 }}>
          设置
        </Title>
        <Text type="secondary">配置 v2 API Base URL / Bearer Token（可选）</Text>
      </div>

      <Card>
        <Form form={form} layout="vertical">
          <Form.Item
            label="NEXT_PUBLIC_API_BASE_URL（可选）"
            name="baseUrl"
            tooltip="不填则默认使用当前站点同域路径（/api/v1/*）"
          >
            <Input placeholder="例如：http://localhost:8080" allowClear />
          </Form.Item>
          <Form.Item
            label="Bearer Token（可选）"
            name="token"
            tooltip="当 services/api 配置了 adminApiToken 时需要提供；未配置则可为空"
          >
            <Input.Password placeholder="Bearer token" allowClear />
          </Form.Item>

          <Space>
            <Button type="primary" onClick={() => void onSave()} loading={saving}>
              保存
            </Button>
            <Button onClick={onClear} disabled={saving}>
              清除
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  )
}

