'use client'

import { AuthProvider } from '@/components/luxury/AuthProvider'
import { BookingSection } from '@/components/luxury/BookingSection'
import { SectionPage } from '@/components/luxury/SectionPage'

export default function BookPage() {
  return (
    <AuthProvider>
      <SectionPage active="book">
        <BookingSection />
      </SectionPage>
    </AuthProvider>
  )
}
