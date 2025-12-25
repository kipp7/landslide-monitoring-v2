'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function BaselineManagementV2Redirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/device-management/baselines')
  }, [router])

  return null
}

