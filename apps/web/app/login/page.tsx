'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Button, Card, Form, Input, Tabs, message } from 'antd'
import { useAuth } from '../components/AuthProvider'

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
      router.push('/analysis')
    } catch (caught) {
      message.error(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex h-screen w-full items-center justify-center bg-white overflow-hidden">
      <div className="absolute inset-0">
        <Image
          src="/images/landslide.png"
          alt="Landslide"
          fill
          priority
          quality={100}
          style={{
            objectFit: 'cover',
            opacity: 1,
            position: 'absolute',
            filter: 'none',
          }}
          unoptimized
        />
      </div>

      <div className="relative z-10 flex w-full max-w-[900px] gap-6 p-4">
        <Card
          title={<div className="text-gray-900 text-center text-xl font-semibold">山体滑坡监测系统</div>}
          variant="borderless"
          style={{
            width: '60%',
            margin: 'auto',
            backgroundColor: 'rgba(252, 252, 254, 0.5)',
            borderRadius: 16,
            color: 'white',
            backdropFilter: 'blur(10px)',
            boxShadow: '0 4px 30px rgba(130, 31, 31, 0.2)',
          }}
          styles={{
            header: {
              borderBottom: 'none',
              padding: '16px 24px',
            },
            body: {
              padding: 24,
            },
          }}
        >
          <Tabs
            defaultActiveKey="account"
            centered
            items={[
              {
                key: 'account',
                label: '账号密码登录',
                children: (
                  <Form form={form} layout="vertical">
                    <Form.Item name="username" label="账号" rules={[{ required: true, message: '请输入账号' }]}>
                      <Input size="large" autoComplete="username" placeholder="请输入账号" />
                    </Form.Item>
                    <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                      <Input.Password
                        size="large"
                        autoComplete="current-password"
                        placeholder="请输入密码"
                      />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" block size="large" loading={loading} onClick={() => void submit()}>
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
              {
                key: 'mobile',
                label: '手机号登录',
                children: (
                  <Form layout="vertical">
                    <Form.Item label="手机号">
                      <Input size="large" placeholder="请输入手机号" />
                    </Form.Item>
                    <Form.Item label="验证码">
                      <Input size="large" placeholder="请输入验证码" />
                    </Form.Item>
                    <Form.Item>
                      <Button type="primary" block size="large">
                        登录
                      </Button>
                    </Form.Item>
                  </Form>
                ),
              },
            ]}
          />

          <div className="flex justify-between mt-6 text-white text-xs">
            <div className="flex gap-2">
              <span>其他登录方式：</span>
              <span>🌐</span>
              <span>🔐</span>
              <span>📧</span>
            </div>
            <a className="text-blue-400" href="#">
              注册账号
            </a>
          </div>
        </Card>
      </div>
    </div>
  )
}
