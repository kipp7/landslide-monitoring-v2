'use client'

import { Button } from 'antd'

export default function TestPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900">测试页面</h1>
        <p className="mt-4 text-gray-600">如果你能看到这个页面，说明基本结构是正常的。</p>
        <Button type="primary" className="mt-4">
          测试按钮
        </Button>
      </div>
    </div>
  )
}

