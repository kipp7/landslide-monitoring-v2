'use client'

import Link from 'next/link'
import { Card, Typography } from 'antd'
import { getApiBearerToken } from '../../lib/v2Api'
import { useAuth } from '../components/AuthProvider'

const { Text } = Typography

export default function GpsDeformationLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const tokenPresent = Boolean(getApiBearerToken())

  if (loading) return <div className="p-6">Loading…</div>

  if (!tokenPresent) {
    return (
      <Card>
        <Text type="secondary">
          需要配置 Bearer Token 或登录后访问：<Link href="/login">去登录</Link>（或在 <Link href="/settings">设置</Link> 中配置手动
          token）。
        </Text>
      </Card>
    )
  }

  if (user && !user.permissions.includes('data:analysis')) {
    return (
      <Card>
        <Text type="danger">无权限访问（需要 `data:analysis` 权限）</Text>
      </Card>
    )
  }

  return <>{children}</>
}

