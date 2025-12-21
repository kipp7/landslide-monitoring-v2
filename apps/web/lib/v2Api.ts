import { clearStoredTokens, getStoredAccessToken, getStoredRefreshToken, setStoredTokens } from './authStorage'

export type ApiSuccessResponse<T> = {
  success: true
  code: number
  message: string
  data: T
  timestamp: string
  traceId: string
}

export type ApiErrorResponse = {
  success: false
  code: number
  message: string
  timestamp: string
  traceId: string
}

function readLocalStorage(key: string): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const value = window.localStorage.getItem(key)
    return value && value.trim() ? value.trim() : undefined
  } catch {
    return undefined
  }
}

export type AuthLoginResponse = {
  token: string
  refreshToken: string
  expiresIn: number
  user: { userId: string; username: string; realName: string; roles: string[]; permissions: string[] }
}

type AuthRefreshResponse = { token: string; refreshToken: string; expiresIn: number }

export function getApiBearerToken(): string | undefined {
  const access = getStoredAccessToken()
  if (access) return access

  const runtime = readLocalStorage('LSMV2_API_BEARER_TOKEN')
  if (runtime) return runtime

  const envToken = process.env.NEXT_PUBLIC_API_BEARER_TOKEN
  return envToken && envToken.trim() ? envToken.trim() : undefined
}

export function getApiAuthHeaders(): Record<string, string> {
  const token = getApiBearerToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function getApiBaseUrl(): string {
  const runtime = readLocalStorage('LSMV2_API_BASE_URL')
  const base = runtime ?? process.env.NEXT_PUBLIC_API_BASE_URL
  return base ? base.replace(/\/+$/, '') : ''
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl()
  if (!base) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

let refreshPromise: Promise<boolean> | null = null

async function refreshTokensOnce(): Promise<boolean> {
  const refreshToken = getStoredRefreshToken()
  if (!refreshToken) return false

  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const url = buildApiUrl('/api/v1/auth/refresh')
      const resp = await fetch(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
        cache: 'no-store',
      })
      if (!resp.ok) return false
      const json = (await resp.json()) as ApiSuccessResponse<AuthRefreshResponse>
      if (!json?.success) return false
      if (!json.data?.token || !json.data?.refreshToken) return false
      setStoredTokens({ accessToken: json.data.token, refreshToken: json.data.refreshToken })
      return true
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

async function requestJson<T>(
  path: string,
  init: RequestInit & { retryOn401?: boolean; authMode?: 'auto' | 'none' }
): Promise<T> {
  const url = buildApiUrl(path)
  const authMode = init.authMode ?? 'auto'
  const retryOn401 = init.retryOn401 ?? true

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(init.headers as Record<string, string> | undefined),
  }
  if (authMode === 'auto') Object.assign(headers, getApiAuthHeaders())

  const resp = await fetch(url, {
    cache: 'no-store',
    ...init,
    headers,
  })

  if (resp.status === 401 && retryOn401 && authMode === 'auto') {
    const refreshed = await refreshTokensOnce()
    if (refreshed) {
      return requestJson<T>(path, { ...init, retryOn401: false, authMode })
    }

    // If access token is invalid/expired and refresh failed, clear stored JWT tokens.
    clearStoredTokens()
  }

  if (!resp.ok) {
    let msg = `HTTP ${resp.status} ${resp.statusText}`
    try {
      const errJson = (await resp.json()) as ApiErrorResponse
      if (errJson && errJson.success === false && typeof errJson.message === 'string' && errJson.message.trim()) {
        msg = errJson.message
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(msg)
  }

  return (await resp.json()) as T
}

export async function apiGetJson<T>(path: string, init?: RequestInit): Promise<T> {
  return requestJson<T>(path, { method: 'GET', ...init })
}

export async function apiJson<T>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, 'body' | 'method'>
): Promise<T> {
  return requestJson<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) },
    body: JSON.stringify(body),
    ...init,
  })
}

export async function apiPutJson<T>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, 'body' | 'method'>
): Promise<T> {
  return requestJson<T>(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(init?.headers as Record<string, string> | undefined) },
    body: JSON.stringify(body),
    ...init,
  })
}

export async function apiDeleteJson<T>(path: string, init?: Omit<RequestInit, 'method'>): Promise<T> {
  return requestJson<T>(path, { method: 'DELETE', ...init })
}

export async function apiLogin(username: string, password: string): Promise<ApiSuccessResponse<AuthLoginResponse>> {
  return requestJson<ApiSuccessResponse<AuthLoginResponse>>('/api/v1/auth/login', {
    method: 'POST',
    authMode: 'none',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export async function apiRefresh(refreshToken: string): Promise<ApiSuccessResponse<AuthRefreshResponse>> {
  return requestJson<ApiSuccessResponse<AuthRefreshResponse>>('/api/v1/auth/refresh', {
    method: 'POST',
    authMode: 'none',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return undefined
}
