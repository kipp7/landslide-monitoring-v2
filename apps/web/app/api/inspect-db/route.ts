import { NextRequest, NextResponse } from 'next/server'

function deprecated() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Deprecated route: apps/web 已迁移到 v2 技术栈；请改用 services/api 的 HTTP API（OpenAPI: docs/integrations/api/openapi.yaml）。',
    },
    { status: 501 }
  )
}

export async function GET(_request: NextRequest) {
  return deprecated()
}

