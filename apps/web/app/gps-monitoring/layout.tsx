'use client'

import Link from 'next/link'
import { Card, Typography } from 'antd'
import { getApiBearerToken } from '../../lib/v2Api'
import { useAuth } from '../components/AuthProvider'

const { Text } = Typography

export default function GpsMonitoringLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const tokenPresent = Boolean(getApiBearerToken())

  // Don't block rendering on `AuthProvider` loading for this page.
  // In local-dev "static bearer" mode, `/api/v1/auth/me` can be 401 and toggling `loading`
  // would cause a visible "Loading…" flash loop.

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

  // If the user is logged-in via JWT, enforce permission check.
  // In "static bearer" mode, `user` can be null; allow access as long as token is present.
  if (!loading && user && !user.permissions.includes('data:analysis')) {
    return (
      <Card>
        <Text type="danger">无权限访问（需要 `data:analysis` 权限）</Text>
      </Card>
    )
  }

  return <>{children}</>
}
