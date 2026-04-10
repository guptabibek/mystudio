'use client'

import { useEffect, useState } from 'react'
import { Check, Crown, ArrowRight, Camera, Palette, PartyPopper } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ServiceCategory {
  id: string
  label: string
  tagline: string
  icon?: string
  sortOrder?: number
}

const ICON_MAP: Record<string, typeof Camera> = {
  camera: Camera,
  palette: Palette,
  party: PartyPopper,
}

interface ServicePackage {
  id: string
  name: string
  price: string
  description: string
  features: string[]
  sortOrder: number
  popular: boolean
  categoryId: string
}

function formatMoney(value: unknown): string {
  const amount = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(amount)) return '0'
  return amount.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

interface ServicesSectionProps {
  onBook: () => void
}

export function ServicesSection({ onBook }: ServicesSectionProps) {
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [activeCategory, setActiveCategory] = useState<string>('')
  const [packages, setPackages] = useState<ServicePackage[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function loadData() {
      try {
        const [categoryRes, packageRes] = await Promise.all([
          fetch('/api/service-categories', { cache: 'no-store' }),
          fetch('/api/packages', { cache: 'no-store' }),
        ])

        const categoryPayload = await categoryRes.json()
        const packagePayload = await packageRes.json()

        if (!categoryRes.ok || !packageRes.ok || !Array.isArray(categoryPayload?.data) || !Array.isArray(packagePayload?.data)) {
          return
        }

        const tabs: ServiceCategory[] = categoryPayload.data
          .map((c: ServiceCategory, index: number) => ({
            id: c.id,
            label: c.label,
            tagline: c.tagline || '',
            icon: c.icon || 'camera',
            sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : index,
          }))
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))

        const mapped: ServicePackage[] = packagePayload.data.map((pkg: {
          id: string
          name: string
          price: number | string
          description?: string | null
          features?: string[]
          sortOrder?: number
          categoryId?: string
        }) => ({
          id: pkg.id,
          name: pkg.name,
          price: formatMoney(pkg.price),
          description: pkg.description || 'Tailored photography experience.',
          features: Array.isArray(pkg.features) ? pkg.features : [],
          sortOrder: pkg.sortOrder ?? 0,
          categoryId: pkg.categoryId || tabs[0]?.id || 'default',
          popular: false,
        }))

        const byCategory: Record<string, ServicePackage[]> = Object.fromEntries(
          tabs.map((t) => [t.id, [] as ServicePackage[]])
        )

        for (const pkg of mapped) {
          if (!byCategory[pkg.categoryId]) {
            byCategory[pkg.categoryId] = []
          }
          byCategory[pkg.categoryId].push(pkg)
        }

        const finalPackages: ServicePackage[] = tabs
          .map((t) => t.id)
          .flatMap((category) => {
            const sorted = [...byCategory[category]].sort((a, b) => a.sortOrder - b.sortOrder)
            return sorted.map((pkg, index) => ({
              ...pkg,
              popular: sorted.length > 1 ? index === 1 : index === 0,
            }))
          })

        if (isMounted) {
          setCategories(tabs)
          setActiveCategory((prev) => prev || tabs[0]?.id || '')
          setPackages(finalPackages)
        }
      } catch {
        // Keep empty state if API fails.
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadData()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    if (categories.length === 0) return
    if (!categories.some((c) => c.id === activeCategory)) {
      setActiveCategory(categories[0].id)
    }
  }, [categories, activeCategory])

  const categoryPackages = packages.filter((p) => p.categoryId === activeCategory)
  const activeTab = categories.find((t) => t.id === activeCategory)

  return (
    <div className="min-h-screen pt-safe-top">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-2">Services</p>
        <h1 className="font-serif text-3xl text-ivory">Our Packages</h1>
      </div>

      {/* Category tabs */}
      <div className="px-6 pb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
          {categories.map((tab) => {
            const Icon = ICON_MAP[tab.icon || 'camera'] || Camera
            const isActive = activeCategory === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveCategory(tab.id)}
                className={cn(
                  'flex items-center gap-2 px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-300 touch-manipulation',
                  isActive
                    ? 'bg-gold text-[#0D0D0D] font-semibold'
                    : 'bg-white/[0.05] text-foreground/50 hover:bg-white/[0.08]'
                )}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category tagline */}
      <div className="px-6 mb-8">
        <p className="text-foreground/40 text-sm italic">{activeTab?.tagline || 'Tailored photography experiences'}</p>
      </div>

      {/* Package Cards */}
      <div className="px-4 pb-24 space-y-4">
        {!isLoading && categoryPackages.length === 0 && (
          <div className="p-6 rounded-3xl border border-white/[0.06] bg-white/[0.02]">
            <p className="text-foreground/50 text-sm">No packages are available for this category right now.</p>
          </div>
        )}
        {categoryPackages.map((pkg, index) => (
          <div
            key={pkg.id}
            className={cn(
              'relative p-6 rounded-3xl border transition-all duration-500 animate-fade-in-up',
              pkg.popular
                ? 'border-gold/30 bg-gradient-to-br from-gold/[0.06] to-transparent gold-border-glow'
                : 'border-white/[0.06] bg-white/[0.02]'
            )}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            {/* Popular badge */}
            {pkg.popular && (
              <div className="absolute -top-3 left-6 flex items-center gap-1 px-3 py-1 bg-gold rounded-full">
                <Crown className="w-3 h-3 text-[#0D0D0D]" />
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#0D0D0D]">
                  Most Popular
                </span>
              </div>
            )}

            {/* Name & Price */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-serif text-xl text-ivory">{pkg.name}</h3>
                <p className="text-foreground/40 text-xs mt-0.5">{pkg.description}</p>
              </div>
              <div className="text-right shrink-0 ml-4">
                <span className="text-foreground/40 text-xs">from</span>
                <p className="font-serif text-2xl text-ivory">${pkg.price}</p>
              </div>
            </div>

            {/* Features */}
            <div className="space-y-2 mb-6 mt-4">
              {pkg.features.map((feature) => (
                <div key={feature} className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-gold/70 shrink-0" strokeWidth={2} />
                  <span className="text-foreground/60 text-sm">{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <button
              onClick={onBook}
              className={cn(
                'w-full py-3 rounded-full text-sm font-semibold tracking-wide transition-all duration-300',
                'touch-manipulation flex items-center justify-center gap-2',
                pkg.popular
                  ? 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
                  : 'bg-white/[0.06] text-ivory hover:bg-white/[0.1] border border-white/[0.06]'
              )}
            >
              Choose {pkg.name} <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
