'use client'

import { Alert } from 'antd'

export default function PlaceholderChart({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Alert type="info" showIcon message={`${title}（待在 WS-N.6/WS-N.7 中 1:1 还原）`} />
    </div>
  )
}

