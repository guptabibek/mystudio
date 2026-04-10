'use client'

import { ReactNode, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { BottomNav, type Section } from '@/components/luxury/BottomNav'
import { studio } from '@/lib/config/studio'

const SECTION_ROUTES: Record<Section, string> = {
  home: '/',
  portfolio: '/portfolio',
  services: '/services',
  book: '/book',
  account: '/account',
}

interface SectionPageProps {
  active: Section
  children: ReactNode
}

export function SectionPage({ active, children }: SectionPageProps) {
  const router = useRouter()

  const navigate = useMemo(() => {
    return (section: Section) => {
      router.push(SECTION_ROUTES[section])
    }
  }, [router])

  return (
    <div className="min-h-screen bg-background">
      <div className="lg:hidden pb-20">
        {active !== 'home' && (
          <button
            onClick={() => navigate('home')}
            className="fixed top-4 left-6 z-50 text-gold/75 text-xs uppercase tracking-[0.24em]"
            aria-label="Go to Home"
          >
            {studio.shortName}
          </button>
        )}

        <main className="animate-fade-in" key={active}>
          {children}
        </main>

        {active !== 'book' && (
          <button
            onClick={() => navigate('book')}
            className="fixed right-4 bottom-20 z-40 w-14 h-14 rounded-full bg-gold text-[#0D0D0D] flex items-center justify-center shadow-lg shadow-gold/20 animate-pulse-glow touch-manipulation"
            aria-label="Book Now"
          >
            <CalendarDays className="w-6 h-6" />
          </button>
        )}

        <BottomNav active={active} onChange={navigate} />
      </div>

      <div className="hidden lg:block">
        <header className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.08] bg-[#0A0A0A]/85 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
            <button
              onClick={() => navigate('home')}
              className="text-gold/80 text-sm uppercase tracking-[0.28em]"
              aria-label="Go to Home"
            >
              {studio.shortName}
            </button>

            <nav className="flex items-center gap-2">
              {(['home', 'portfolio', 'services', 'book', 'account'] as Section[]).map((section) => (
                <button
                  key={section}
                  onClick={() => navigate(section)}
                  className={`px-4 py-2 rounded-full text-xs uppercase tracking-wider transition-colors ${
                    active === section
                      ? 'text-gold bg-gold/10 border border-gold/20'
                      : 'text-foreground/70 hover:text-foreground hover:bg-white/[0.05]'
                  }`}
                >
                  {section === 'book' ? 'Book' : section.charAt(0).toUpperCase() + section.slice(1)}
                </button>
              ))}
            </nav>

            <button
              onClick={() => navigate('book')}
              className="px-5 py-2.5 rounded-full bg-gold text-[#0D0D0D] text-sm font-semibold hover:bg-gold-light transition-colors"
            >
              Book Now
            </button>
          </div>
        </header>

        <main className="pt-20">{children}</main>
      </div>
    </div>
  )
}
