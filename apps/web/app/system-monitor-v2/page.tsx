'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function SystemMonitorV2Redirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/ops/system-monitor')
  }, [router])

  return null
}

