'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function GpsMonitoringRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/gps-deformation')
  }, [router])

  return null
}
