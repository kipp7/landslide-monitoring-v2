'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getApiBearerToken } from '../../lib/v2Api'
import { clearStoredTokens, setStoredTokens } from '../../lib/authStorage'
import { getMe, login as apiLogin, type CurrentUser } from '../../lib/api/auth'

export type AuthUser = {
  userId: string
  username: string
  realName: string
  roles: string[]
  permissions: string[]
}

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  hasPermission: (permissionCode: string) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

function normalizeUserFromMe(me: CurrentUser): AuthUser {
  return {
    userId: me.userId,
    username: me.username,
    realName: me.realName || '',
    roles: (me.roles ?? []).map((r) => r.name),
    permissions: me.permissions ?? [],
  }
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMe = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // Avoid spamming /auth/me when user hasn't configured any token yet.
      if (!getApiBearerToken()) {
        setUser(null)
        return
      }

      const json = await getMe()
      if (!json?.success || !json.data) {
        setUser(null)
        return
      }
      setUser(normalizeUserFromMe(json.data))
    } catch (caught) {
      setUser(null)
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadMe()
    const onChanged = () => void loadMe()
    window.addEventListener('lsmv2-auth-changed', onChanged)
    return () => window.removeEventListener('lsmv2-auth-changed', onChanged)
  }, [loadMe])

  const login = useCallback(async (username: string, password: string) => {
    setError(null)
    const json = await apiLogin(username, password)
    if (!json?.success) throw new Error('登录失败')
    setStoredTokens({ accessToken: json.data.token, refreshToken: json.data.refreshToken })
    setUser(json.data.user)
  }, [])

  const logout = useCallback(() => {
    clearStoredTokens()
    setUser(null)
  }, [])

  const hasPermission = useCallback(
    (permissionCode: string) => {
      if (!permissionCode) return false
      return Boolean(user?.permissions?.includes(permissionCode))
    },
    [user]
  )

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, login, logout, hasPermission }),
    [user, loading, error, login, logout, hasPermission]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
