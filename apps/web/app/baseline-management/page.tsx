'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyBaselineManagementRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/device-management/baselines')
  }, [router])

  return null
}

