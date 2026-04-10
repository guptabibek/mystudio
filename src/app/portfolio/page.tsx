'use client'

import { AuthProvider } from '@/components/luxury/AuthProvider'
import { PortfolioSection } from '@/components/luxury/PortfolioSection'
import { SectionPage } from '@/components/luxury/SectionPage'

export default function PortfolioPage() {
  return (
    <AuthProvider>
      <SectionPage active="portfolio">
        <PortfolioSection />
      </SectionPage>
    </AuthProvider>
  )
}
