'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function Analysis2RedirectPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/analysis-v2')
  }, [router])

  return null
}
