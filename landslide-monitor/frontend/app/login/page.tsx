'use client';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, Form, Input, Button, Tabs } from 'antd';

export default function LoginPage() {
  const router = useRouter();

  return (
    <div className="flex h-screen w-full items-center justify-center bg-white">
      {/* 背景图片 */}
      <div>
        <Image 
          src="/images/landslide.png"
          alt="Landslide"
          fill
          priority
          quality={100}
          style={{ 
            objectFit: 'cover', // 图片填充容器
            opacity: 1, // 背景图片透明度
            position: 'absolute', // 绝对定位
            filter: 'none' }} // 模糊效果
          unoptimized={true}
        />
      </div>

      {/* 右侧登录卡片区域 */}
      <div className="flex w-full max-w-[900px] gap-6 p-4">
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
            boxShadow: '0 4px 30px rgba(130, 31, 31, 0.2)'
          }}
          styles={{
            header: {
              borderBottom: 'none',
              padding: '16px 24px'
            },
            body: {
              padding: 24
            }
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
        <Form layout="vertical">
          <Form.Item label="账号">
            <Input size="large" placeholder="请输入账号" />
          </Form.Item>
          <Form.Item label="密码">
            <Input.Password size="large" placeholder="请输入密码" />
          </Form.Item>
          <Form.Item>
            <Button 
              type="primary" 
              block 
              size="large"
              onClick={() => router.push('/analysis')}
            >
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

          {/* 其他登录方式和注册链接 */}
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
  );
}