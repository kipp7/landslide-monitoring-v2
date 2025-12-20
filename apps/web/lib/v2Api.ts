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

export function getApiBearerToken(): string | undefined {
  const token = process.env.NEXT_PUBLIC_API_BEARER_TOKEN
  return token && token.trim() ? token.trim() : undefined
}

export function getApiAuthHeaders(): Record<string, string> {
  const token = getApiBearerToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function getApiBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL
  return base ? base.replace(/\/+$/, '') : ''
}

export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl()
  if (!base) return path
  return `${base}${path.startsWith('/') ? '' : '/'}${path}`
}

export async function apiGetJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = buildApiUrl(path)
  const resp = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      ...getApiAuthHeaders(),
      ...(init?.headers || {}),
    },
    cache: 'no-store',
    ...init,
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  }

  return (await resp.json()) as T
}

export async function apiJson<T>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, 'body' | 'method'>
): Promise<T> {
  const url = buildApiUrl(path)
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getApiAuthHeaders(),
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    ...init,
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  }

  return (await resp.json()) as T
}

export async function apiPutJson<T>(
  path: string,
  body: unknown,
  init?: Omit<RequestInit, 'body' | 'method'>
): Promise<T> {
  const url = buildApiUrl(path)
  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...getApiAuthHeaders(),
      ...(init?.headers || {}),
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    ...init,
  })

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}`)
  }

  return (await resp.json()) as T
}

export function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return undefined
}
