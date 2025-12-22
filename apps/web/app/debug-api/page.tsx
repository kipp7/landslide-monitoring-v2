'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function LegacyDebugApiRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/ops/debug-api')
  }, [router])

  return null
}

