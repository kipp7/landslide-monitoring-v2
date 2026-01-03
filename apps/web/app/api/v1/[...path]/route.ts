import { proxyLegacyApiRequest } from '../../_proxy'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  return proxyLegacyApiRequest(request)
}

export async function POST(request: Request) {
  return proxyLegacyApiRequest(request)
}

export async function PUT(request: Request) {
  return proxyLegacyApiRequest(request)
}

export async function PATCH(request: Request) {
  return proxyLegacyApiRequest(request)
}

export async function DELETE(request: Request) {
  return proxyLegacyApiRequest(request)
}

export async function OPTIONS(request: Request) {
  return proxyLegacyApiRequest(request)
}

