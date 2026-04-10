'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ArrowRight, Camera, Star, Users, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from './AuthProvider'
import { AuthModal } from './AuthModal'
import { studio } from '@/lib/config/studio'
import type { Section } from './BottomNav'

type FeaturedCategory = 'Wedding' | 'Fashion' | 'Event'

interface FeaturedItem {
  id: string
  title: string
  gradient: string
  category: FeaturedCategory
  imageUrl?: string
}

const FEATURED_EMPTY: FeaturedItem[] = []

const CATEGORY_GRADIENTS: Record<'weddings' | 'fashion' | 'events', string> = {
  weddings: 'bg-gradient-to-br from-amber-900/40 via-rose-950/30 to-stone-950',
  fashion: 'bg-gradient-to-br from-zinc-800 via-neutral-900 to-black',
  events: 'bg-gradient-to-br from-purple-950/40 via-amber-950/20 to-stone-950',
}

const CATEGORY_LABELS: Record<'weddings' | 'fashion' | 'events', FeaturedCategory> = {
  weddings: 'Wedding',
  fashion: 'Fashion',
  events: 'Event',
}

const CATEGORIES = [
  { id: 'weddings', label: 'Weddings', emoji: '💍', description: 'Romantic & Timeless' },
  { id: 'fashion', label: 'Fashion', emoji: '✨', description: 'Bold & Editorial' },
  { id: 'events', label: 'Events', emoji: '🎉', description: 'Vibrant & Dynamic' },
]

interface StudioStats {
  totalClients: number
  completedBookings: number
}

interface HeroSectionProps {
  onNavigate: (section: Section) => void
}

export function HeroSection({ onNavigate }: HeroSectionProps) {
  const [heroLoaded, setHeroLoaded] = useState(false)
  const [featuredItems, setFeaturedItems] = useState<FeaturedItem[]>(FEATURED_EMPTY)
  const { user, loading: authLoading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [stats, setStats] = useState<StudioStats | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 100)
    return () => clearTimeout(t)
  }, [])

  // Fetch public stats
  useEffect(() => {
    fetch('/api/stats').then(r => r.json()).then(d => {
      if (d?.data) setStats(d.data)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let isMounted = true

    async function loadFeatured() {
      try {
        const response = await fetch('/api/portfolio', { cache: 'no-store' })
        const payload = await response.json()

        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
          return
        }

        const mapped = payload.data
          .slice(0, 4)
          .map((item: {
            id: string
            imageUrl: string
            category: 'weddings' | 'fashion' | 'events'
            title: string
          }) => ({
            id: item.id,
            title: item.title,
            imageUrl: item.imageUrl,
            category: CATEGORY_LABELS[item.category],
            gradient: CATEGORY_GRADIENTS[item.category],
          }))

        if (isMounted && mapped.length > 0) {
          setFeaturedItems(mapped)
        }
      } catch {
        // Keep static featured fallback if API is unavailable.
      }
    }

    void loadFeatured()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <div>
      {/* ── Cinematic Hero ── */}
      <section className="relative h-screen flex items-center justify-center overflow-hidden">
        {/* Animated cinematic background */}
        <div className="absolute inset-0 animate-ken-burns pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-stone-950 via-[#1a1410] to-[#0d0d0d]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(212,175,55,0.08)_0%,transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_60%,rgba(139,92,46,0.06)_0%,transparent_60%)]" />
        </div>

        {/* Top bar with login */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 pt-safe-top mt-4">
          <button
            onClick={() => onNavigate('home')}
            className="text-gold/60 text-xs uppercase tracking-[0.2em] font-sans hover:text-gold/80 transition-colors"
          >
            {studio.shortName}
          </button>
          {!authLoading && (
            user ? (
              <button
                onClick={() => onNavigate('account')}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/[0.1] bg-white/[0.04] hover:bg-white/[0.08] transition-colors touch-manipulation"
              >
                <div className="w-6 h-6 rounded-full bg-gold/20 flex items-center justify-center">
                  <span className="text-gold text-xs font-semibold">
                    {user.name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
                  </span>
                </div>
                <span className="text-ivory text-xs">{user.name?.split(' ')[0] || 'Account'}</span>
              </button>
            ) : (
              <button
                onClick={() => setShowAuth(true)}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full border border-gold/20 text-gold text-xs font-medium hover:bg-gold/[0.05] transition-colors touch-manipulation"
              >
                <User className="w-3.5 h-3.5" />
                Sign In
              </button>
            )
          )}
        </div>

        {/* Content */}
        <div
          className={cn(
            'relative z-10 text-center px-6 max-w-2xl mx-auto transition-all duration-1000',
            heroLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
          )}
        >
          {/* Brand mark */}
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="w-px h-8 bg-gold/40" />
            <Camera className="w-5 h-5 text-gold/80" strokeWidth={1.5} />
            <div className="w-px h-8 bg-gold/40" />
          </div>

          {/* Main heading */}
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
            <span className="block text-ivory">Capturing</span>
            <span className="block gold-shimmer mt-1">Moments</span>
            <span className="block text-ivory/80 text-3xl sm:text-4xl md:text-5xl font-light mt-2">
              That Last Forever
            </span>
          </h1>

          {/* Subtitle */}
          <p className="mt-6 text-foreground/50 text-sm sm:text-base font-sans max-w-md mx-auto leading-relaxed">
            {studio.tagline}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
            <button
              onClick={() => onNavigate('portfolio')}
              className="w-full sm:w-auto px-8 py-3.5 bg-gold text-[#0D0D0D] font-semibold text-sm rounded-full tracking-wide hover:bg-gold-light transition-all duration-300 touch-manipulation"
            >
              View Portfolio
            </button>
            <button
              onClick={() => onNavigate('book')}
              className="w-full sm:w-auto px-8 py-3.5 border border-ivory/20 text-ivory font-medium text-sm rounded-full tracking-wide hover:bg-ivory/5 transition-all duration-300 touch-manipulation"
            >
              Book a Session
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 animate-bounce pointer-events-none">
          <span className="text-foreground/30 text-[10px] uppercase tracking-[0.3em] font-sans">Scroll</span>
          <ChevronDown className="w-4 h-4 text-foreground/30" />
        </div>
      </section>

      {/* ── Category Selection ── */}
      <section className="px-6 py-16">
        <div className="max-w-lg mx-auto">
          <p className="text-gold/60 text-xs uppercase tracking-[0.3em] text-center font-sans mb-3">
            Our Specialties
          </p>
          <h2 className="font-serif text-2xl sm:text-3xl text-center text-ivory mb-10">
            Choose Your Experience
          </h2>

          <div className="grid grid-cols-3 gap-3">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onNavigate('services')}
                className="flex flex-col items-center p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-gold/20 transition-all duration-300 touch-manipulation"
              >
                <span className="text-2xl mb-2">{cat.emoji}</span>
                <span className="text-ivory text-sm font-medium">{cat.label}</span>
                <span className="text-foreground/30 text-[10px] mt-0.5">{cat.description}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured Work ── */}
      {featuredItems.length > 0 && (
      <section className="px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-1">Featured</p>
              <h2 className="font-serif text-2xl text-ivory">Recent Work</h2>
            </div>
            <button
              onClick={() => onNavigate('portfolio')}
              className="flex items-center gap-1 text-gold/70 text-sm hover:text-gold transition-colors touch-manipulation"
            >
              View All <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {featuredItems.map((item, i) => (
              <button
                key={item.id}
                onClick={() => onNavigate('portfolio')}
                className={cn(
                  'group relative overflow-hidden rounded-2xl touch-manipulation',
                  i === 0 ? 'row-span-2 aspect-[3/4]' : 'aspect-square'
                )}
              >
                <div className={cn('absolute inset-0 transition-transform duration-700 group-hover:scale-110', item.imageUrl ? '' : item.gradient)}>
                  {item.imageUrl && (
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-3 left-3 right-3">
                  <p className="text-ivory text-sm font-serif">{item.title}</p>
                  <p className="text-gold/50 text-[10px] uppercase tracking-wider">{item.category}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ── Stats ── */}
      {stats && (
        <section className="px-6 py-16">
          <div className="max-w-lg mx-auto">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <Users className="w-5 h-5 text-gold/60 mx-auto mb-2" strokeWidth={1.5} />
                <p className="font-serif text-2xl sm:text-3xl text-ivory">{stats.totalClients.toLocaleString()}+</p>
                <p className="text-foreground/40 text-xs uppercase tracking-wider mt-1">Clients</p>
              </div>
              <div className="text-center">
                <Camera className="w-5 h-5 text-gold/60 mx-auto mb-2" strokeWidth={1.5} />
                <p className="font-serif text-2xl sm:text-3xl text-ivory">{stats.completedBookings.toLocaleString()}+</p>
                <p className="text-foreground/40 text-xs uppercase tracking-wider mt-1">Sessions</p>
              </div>
              <div className="text-center">
                <Star className="w-5 h-5 text-gold/60 mx-auto mb-2" strokeWidth={1.5} />
                <p className="font-serif text-2xl sm:text-3xl text-ivory">5.0</p>
                <p className="text-foreground/40 text-xs uppercase tracking-wider mt-1">Rating</p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── About / Story Teaser ── */}
      <section className="px-6 py-16">
        <div className="max-w-lg mx-auto text-center">
          <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-3">Our Story</p>
          <h2 className="font-serif text-2xl sm:text-3xl text-ivory mb-6">
            Where Light Meets Emotion
          </h2>
          <p className="text-foreground/50 text-sm leading-relaxed mb-8 max-w-md mx-auto">
            Founded on the belief that every moment deserves to be immortalized in its most
            beautiful form. We blend artistry with technique to create images that transcend
            time — photographs that make you feel something every time you look at them.
          </p>

          <div className="flex flex-col items-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-amber-900/40 to-stone-900 border border-gold/20 flex items-center justify-center mb-3">
              <Camera className="w-8 h-8 text-gold/60" strokeWidth={1} />
            </div>
            <p className="text-ivory text-sm font-serif">{studio.name}</p>
            <p className="text-foreground/40 text-xs">Professional Photography Studio</p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="px-6 py-20">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="font-serif text-3xl sm:text-4xl text-ivory mb-4">
            Ready to Create<br />
            <span className="gold-shimmer">Something Beautiful</span>?
          </h2>
          <p className="text-foreground/50 text-sm mb-8">
            Let&apos;s turn your vision into timeless imagery
          </p>
          <button
            onClick={() => onNavigate('book')}
            className="px-10 py-4 bg-gold text-[#0D0D0D] font-semibold text-sm rounded-full tracking-wide hover:bg-gold-light transition-all duration-300 animate-pulse-glow touch-manipulation"
          >
            Book Your Session
          </button>
        </div>
      </section>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
    </div>
  )
}
