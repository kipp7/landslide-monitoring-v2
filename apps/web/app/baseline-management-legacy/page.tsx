'use client'

import React, { useEffect, useState } from 'react'
import { Button, Space } from 'antd'
import Link from 'next/link'
import BaselineManagementV2 from '../baseline-management/legacy/components/BaselineManagementV2'
import HoverSidebar from '../analysis/legacy/components/HoverSidebar'

export default function BaselineManagementLegacyPage() {
  const [referrerPage, setReferrerPage] = useState<string>('')

  useEffect(() => {
    const referrer = document.referrer
    if (referrer.includes('/gps-monitoring')) {
      setReferrerPage('gps-monitoring')
    } else if (referrer.includes('/device-management')) {
      setReferrerPage('device-management')
    } else {
      setReferrerPage('gps-monitoring')
    }
  }, [])

  const backButton =
    referrerPage === 'gps-monitoring' ? (
      <Link href="/gps-monitoring">
        <Button type="text" className="text-cyan-200 hover:bg-slate-700/50 hover:text-white" style={{ color: '#a5f3fc', fontWeight: '500' }}>
          返回地质形变监测
        </Button>
      </Link>
    ) : (
      <Link href="/device-management">
        <Button type="text" className="text-cyan-200 hover:bg-slate-700/50 hover:text-white" style={{ color: '#a5f3fc', fontWeight: '500' }}>
          返回设备管理
        </Button>
      </Link>
    )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <HoverSidebar />

      <div className="ml-0 transition-all duration-300">
        <div className="sticky top-0 z-40 border-b border-slate-600 bg-slate-800/80 backdrop-blur-sm">
          <div className="w-full px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {backButton}
                <div className="h-6 w-px bg-slate-600"></div>
                <div className="flex items-center space-x-3">
                  <h1 className="text-xl font-bold text-cyan-300">地质形变基准点管理 V2.0</h1>
                </div>
              </div>

              <Space size="middle">
                {referrerPage === 'device-management' ? (
                  <Link href="/gps-monitoring">
                    <Button type="text" className="text-sm text-cyan-200 hover:bg-slate-700/50 hover:text-white" style={{ color: '#a5f3fc', fontWeight: '500' }}>
                      地质形变监测
                    </Button>
                  </Link>
                ) : null}
                {referrerPage === 'gps-monitoring' ? (
                  <Link href="/device-management">
                    <Button type="text" className="text-sm text-cyan-200 hover:bg-slate-700/50 hover:text-white" style={{ color: '#a5f3fc', fontWeight: '500' }}>
                      设备管理
                    </Button>
                  </Link>
                ) : null}
              </Space>
            </div>
          </div>
        </div>

        <div className="w-full px-6 py-8">
          <BaselineManagementV2 />
        </div>
      </div>
    </div>
  )
}

