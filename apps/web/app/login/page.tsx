'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button, Card, Form, Input, Space, Typography, message } from 'antd'
import { useAuth } from '../components/AuthProvider'

const { Title, Text } = Typography

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [form] = Form.useForm()
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    const values = (await form.validateFields()) as { username: string; password: string }
    setLoading(true)
    try {
      await login(values.username, values.password)
      message.success('登录成功')
      router.replace('/analysis')
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Title level={3} style={{ margin: 0 }}>
          登录
        </Title>
        <Text type="secondary">
          使用 `/api/v1/auth/login` 获取 JWT（需要服务端配置 `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`）
        </Text>
      </div>

      <Card>
        <Form form={form} layout="vertical" onFinish={() => void submit()}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '必填' }]}>
            <Input autoComplete="username" placeholder="admin" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '必填' }]}>
            <Input.Password autoComplete="current-password" placeholder="******" />
          </Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={loading}>
              登录
            </Button>
            <Link href="/settings">改用手动 Token（ADMIN_API_TOKEN）</Link>
          </Space>
        </Form>
      </Card>
    </div>
  )
}

