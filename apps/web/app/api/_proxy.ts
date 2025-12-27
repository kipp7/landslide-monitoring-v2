function getProxyBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.API_BASE_URL ?? process.env.BACKEND_URL
  const trimmed = raw?.trim()
  if (trimmed) return trimmed.replace(/\/+$/, '')

  // Local dev fallback: avoid accidental same-origin /api calls to the Next dev server (3000).
  if (process.env.NODE_ENV === 'development') return 'http://localhost:8080'

  return ''
}

function buildForwardHeaders(request: Request): Headers {
  const headers = new Headers()
  for (const [key, value] of request.headers) {
    const k = key.toLowerCase()
    if (k === 'host') continue
    if (k === 'connection') continue
    if (k === 'content-length') continue
    if (k === 'accept-encoding') continue
    headers.set(key, value)
  }
  return headers
}

export async function proxyLegacyApiRequest(request: Request): Promise<Response> {
  const base = getProxyBaseUrl()
  if (!base) {
    return new Response(
      JSON.stringify(
        {
          error:
            'NEXT_PUBLIC_API_BASE_URL / API_BASE_URL / BACKEND_URL is not configured (required for Next API proxy routes)',
        },
        null,
        2
      ),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }
    )
  }

  const incoming = new URL(request.url)
  const targetUrl = `${base}${incoming.pathname}${incoming.search}`

  const headers = buildForwardHeaders(request)
  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
    cache: 'no-store',
    redirect: 'manual',
    signal: request.signal,
  }

  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = request.body
    init.duplex = 'half'
  }

  const resp = await fetch(targetUrl, init)

  const outHeaders = new Headers(resp.headers)
  outHeaders.delete('content-encoding')
  outHeaders.delete('content-length')
  outHeaders.delete('transfer-encoding')
  outHeaders.delete('connection')

  return new Response(resp.body, { status: resp.status, headers: outHeaders })
}
