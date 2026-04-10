'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AuthProvider } from '@/components/luxury/AuthProvider'
import { ServicesSection } from '@/components/luxury/ServicesSection'
import { SectionPage } from '@/components/luxury/SectionPage'

export default function ServicesPage() {
  const router = useRouter()

  const onBook = useMemo(() => {
    return () => router.push('/book')
  }, [router])

  return (
    <AuthProvider>
      <SectionPage active="services">
        <ServicesSection onBook={onBook} />
      </SectionPage>
    </AuthProvider>
  )
}
