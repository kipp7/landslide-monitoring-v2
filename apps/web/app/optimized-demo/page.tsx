'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyOptimizedDemoRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/analysis')
  }, [router])

  return null
}

