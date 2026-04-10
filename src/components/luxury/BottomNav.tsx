'use client'

import { cn } from '@/lib/utils'
import { Home, Images, Sparkles, CalendarDays, User } from 'lucide-react'

export type Section = 'home' | 'portfolio' | 'services' | 'book' | 'account'

const NAV_ITEMS: { id: Section; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'portfolio', label: 'Portfolio', icon: Images },
  { id: 'services', label: 'Services', icon: Sparkles },
  { id: 'book', label: 'Book', icon: CalendarDays },
  { id: 'account', label: 'Account', icon: User },
]

interface BottomNavProps {
  active: Section
  onChange: (section: Section) => void
}

export function BottomNav({ active, onChange }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[70] border-t border-white/[0.14] safe-bottom bg-[#090909]/95 supports-[backdrop-filter]:bg-[#090909]/82 backdrop-blur-xl shadow-[0_-12px_30px_rgba(0,0,0,0.55)]"
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = active === item.id
          const Icon = item.icon
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={cn(
                'relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full',
                'transition-all duration-300 touch-manipulation select-none',
                isActive
                  ? 'text-gold'
                  : 'text-ivory/72 active:text-ivory/90'
              )}
              aria-label={item.label}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon
                className={cn(
                  'w-5 h-5 transition-all duration-300',
                  isActive && 'drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]'
                )}
                strokeWidth={isActive ? 2.5 : 1.5}
              />
              <span
                className={cn(
                  'text-[10px] tracking-wider uppercase transition-all duration-300',
                  isActive ? 'font-semibold' : 'font-normal'
                )}
              >
                {item.label}
              </span>
              {isActive && (
                <span className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-[2px] bg-gold rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
