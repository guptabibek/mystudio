'use client'

import { useState, useMemo, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Lightbox, type LightboxImage } from './Lightbox'
import { Loader2 } from 'lucide-react'

type Category = 'all' | 'weddings' | 'fashion' | 'events'

const FILTERS: { id: Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'weddings', label: 'Weddings' },
  { id: 'fashion', label: 'Fashion' },
  { id: 'events', label: 'Events' },
]

interface PortfolioItem extends LightboxImage {
  aspect: 'portrait' | 'landscape' | 'square'
}

const CATEGORY_GRADIENTS: Record<Exclude<Category, 'all'>, string> = {
  weddings: 'bg-gradient-to-br from-amber-900/50 via-rose-950/30 to-stone-950',
  fashion: 'bg-gradient-to-b from-zinc-700/50 via-neutral-900 to-black',
  events: 'bg-gradient-to-br from-blue-950/30 via-slate-950/20 to-stone-950',
}

export function PortfolioSection() {
  const [filter, setFilter] = useState<Category>('all')
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [items, setItems] = useState<PortfolioItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadedImageIds, setLoadedImageIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let isMounted = true

    async function loadPortfolio() {
      try {
        const response = await fetch('/api/portfolio', { cache: 'no-store' })
        const payload = await response.json()

        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
          return
        }

        const mapped: PortfolioItem[] = payload.data.map((item: {
          id: string
          imageUrl: string
          category: Exclude<Category, 'all'>
          title: string
          subtitle: string
          aspect: PortfolioItem['aspect']
        }) => ({
          id: item.id,
          category: item.category,
          title: item.title,
          subtitle: item.subtitle,
          aspect: item.aspect,
          imageUrl: item.imageUrl,
          gradient: CATEGORY_GRADIENTS[item.category],
        }))

        if (isMounted && mapped.length > 0) {
          setItems(mapped)
        }
      } catch {
        // API unavailable — items remain empty
      } finally {
        if (isMounted) setIsLoading(false)
      }
    }

    void loadPortfolio()

    return () => {
      isMounted = false
    }
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter((item) => item.category === filter)
  }, [filter, items])

  const openLightbox = (index: number) => {
    setLightboxIndex(index)
    setLightboxOpen(true)
  }

  return (
    <div className="min-h-screen pt-safe-top">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-2">Portfolio</p>
        <h1 className="font-serif text-3xl text-ivory">Our Work</h1>
      </div>

      {/* Filter bar */}
      <div className="px-6 pb-6">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'px-5 py-2 rounded-full text-sm whitespace-nowrap transition-all duration-300 touch-manipulation',
                filter === f.id
                  ? 'bg-gold text-[#0D0D0D] font-semibold'
                  : 'bg-white/[0.05] text-foreground/50 hover:bg-white/[0.08]'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Portfolio Grid */}
      <div className="px-4 pb-24">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-gold animate-spin" />
            <span className="text-foreground/40 text-sm ml-3">Loading portfolio...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-foreground/40 text-sm">No photos in this category yet.</p>
          </div>
        ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filtered.map((item, index) => (
            <button
              key={item.id}
              onClick={() => openLightbox(index)}
              className={cn(
                'block w-full overflow-hidden rounded-2xl relative group touch-manipulation',
                'animate-fade-in-up',
                item.aspect === 'portrait'
                  ? 'aspect-[3/4]'
                  : item.aspect === 'square'
                    ? 'aspect-square'
                    : 'aspect-[4/3]'
              )}
            >
              <div
                className={cn(
                  'absolute inset-0 transition-transform duration-700 group-hover:scale-110',
                  item.imageUrl ? '' : item.gradient
                )}
              >
                {item.imageUrl && (
                  <>
                    {!loadedImageIds.has(item.id) && (
                      <div className="absolute inset-0 skeleton-loading" />
                    )}
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      className={cn(
                        'w-full h-full object-cover transition-opacity duration-500',
                        loadedImageIds.has(item.id) ? 'opacity-100' : 'opacity-0'
                      )}
                      loading={index < 12 ? 'eager' : 'lazy'}
                      fetchPriority={index < 6 ? 'high' : 'auto'}
                      decoding="async"
                      onLoad={() => {
                        setLoadedImageIds((prev) => {
                          if (prev.has(item.id)) return prev
                          const next = new Set(prev)
                          next.add(item.id)
                          return next
                        })
                      }}
                    />
                  </>
                )}
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                <p className="text-ivory text-sm font-serif">{item.title}</p>
                <p className="text-gold/60 text-[10px] uppercase tracking-wider">{item.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
        )}
      </div>

      {/* Lightbox */}
      <Lightbox
        images={filtered}
        initialIndex={lightboxIndex}
        isOpen={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
      />
    </div>
  )
}
