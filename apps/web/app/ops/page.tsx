'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function OpsHome() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/ops/configs')
  }, [router])

  return null
}

