'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacySystemMonitorRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/ops/system-monitor')
  }, [router])

  return null
}

