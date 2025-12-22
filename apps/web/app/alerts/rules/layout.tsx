'use client'

import Link from 'next/link'
import { Card, Typography } from 'antd'
import { useAuth } from '../../components/AuthProvider'

const { Text } = Typography

function hasAnyPermission(perms: string[] | undefined, required: string[]): boolean {
  if (!perms || perms.length === 0) return false
  return required.some((p) => perms.includes(p))
}

export default function AlertRulesLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="p-6">Loading...</div>

  if (!user) {
    return (
      <Card>
        <Text type="secondary">
          Login required: <Link href="/login">Go to login</Link>
        </Text>
      </Card>
    )
  }

  const ok = hasAnyPermission(user.permissions, ['alert:config'])
  if (!ok) {
    return (
      <Card>
        <Text type="danger">Forbidden (requires alert:config)</Text>
      </Card>
    )
  }

  return <>{children}</>
}

