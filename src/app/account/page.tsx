'use client'

import { useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { AuthProvider } from '@/components/luxury/AuthProvider'
import { AccountSection } from '@/components/luxury/AccountSection'
import { SectionPage } from '@/components/luxury/SectionPage'
import type { Section } from '@/components/luxury/BottomNav'

const SECTION_ROUTES: Record<Section, string> = {
  home: '/',
  portfolio: '/portfolio',
  services: '/services',
  book: '/book',
  account: '/account',
}

export default function AccountPage() {
  const router = useRouter()

  const navigate = useMemo(() => {
    return (section: Section) => {
      router.push(SECTION_ROUTES[section])
    }
  }, [router])

  return (
    <AuthProvider>
      <SectionPage active="account">
        <AccountSection onNavigate={navigate} />
      </SectionPage>
    </AuthProvider>
  )
}
