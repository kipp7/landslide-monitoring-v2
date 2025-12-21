export type AuthTokens = {
  accessToken: string
  refreshToken: string
}

const ACCESS_KEY = 'LSMV2_AUTH_ACCESS_TOKEN'
const REFRESH_KEY = 'LSMV2_AUTH_REFRESH_TOKEN'

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

export function getStoredAccessToken(): string | undefined {
  if (!canUseStorage()) return undefined
  const raw = window.localStorage.getItem(ACCESS_KEY)
  const v = raw ? raw.trim() : ''
  return v ? v : undefined
}

export function getStoredRefreshToken(): string | undefined {
  if (!canUseStorage()) return undefined
  const raw = window.localStorage.getItem(REFRESH_KEY)
  const v = raw ? raw.trim() : ''
  return v ? v : undefined
}

export function setStoredTokens(tokens: Partial<AuthTokens>): void {
  if (!canUseStorage()) return
  if (tokens.accessToken !== undefined) {
    const v = tokens.accessToken.trim()
    if (v) window.localStorage.setItem(ACCESS_KEY, v)
    else window.localStorage.removeItem(ACCESS_KEY)
  }
  if (tokens.refreshToken !== undefined) {
    const v = tokens.refreshToken.trim()
    if (v) window.localStorage.setItem(REFRESH_KEY, v)
    else window.localStorage.removeItem(REFRESH_KEY)
  }
  window.dispatchEvent(new Event('lsmv2-auth-changed'))
}

export function clearStoredTokens(): void {
  if (!canUseStorage()) return
  window.localStorage.removeItem(ACCESS_KEY)
  window.localStorage.removeItem(REFRESH_KEY)
  window.dispatchEvent(new Event('lsmv2-auth-changed'))
}

