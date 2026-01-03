'use client'

import Link from 'next/link'
import { Card, Typography } from 'antd'
import { getApiBearerToken } from '../../lib/v2Api'
import { useAuth } from '../components/AuthProvider'

const { Text } = Typography

function hasAnyPermission(perms: string[] | undefined, required: string[]): boolean {
  if (!perms || perms.length === 0) return false
  return required.some((p) => perms.includes(p))
}

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const tokenPresent = Boolean(getApiBearerToken())

  if (!tokenPresent) {
    return (
      <Card>
        <Text type="secondary">
          需要登录后访问运维页面：<Link href="/login">去登录</Link>（或在 <Link href="/settings">设置</Link> 中配置手动 token）
        </Text>
      </Card>
    )
  }

  if (!loading && user) {
    const ok = hasAnyPermission(user.permissions, ['system:log', 'system:config'])
    if (!ok) {
      return (
        <Card>
          <Text type="danger">无权限访问（需要 system:log / system:config 权限）</Text>
        </Card>
      )
    }
  }

  return <>{children}</>
}
