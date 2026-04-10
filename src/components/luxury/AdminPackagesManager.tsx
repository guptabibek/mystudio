'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCw, Package2, Archive, ToggleLeft, ToggleRight } from 'lucide-react'
import { cn } from '@/lib/utils'

type PackageStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

interface AdminPackage {
  id: string
  name: string
  description: string | null
  duration: number
  price: string
  currency: string
  maxPhotos: number
  includesEdit: boolean
  features: string[] | null
  sortOrder: number
  status: PackageStatus
  categoryId?: string
}

interface ServiceCategory {
  id: string
  label: string
  tagline: string
  icon?: string
  sortOrder?: number
}

interface AdminPackagesManagerProps {
  open: boolean
  onClose: () => void
}

const STATUS_STYLES: Record<PackageStatus, string> = {
  ACTIVE: 'bg-green-500/10 border border-green-500/20 text-green-400',
  INACTIVE: 'bg-amber-500/10 border border-amber-500/20 text-amber-400',
  ARCHIVED: 'bg-white/[0.06] border border-white/[0.12] text-foreground/50',
}

export function AdminPackagesManager({ open, onClose }: AdminPackagesManagerProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [packages, setPackages] = useState<AdminPackage[]>([])
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [categoryDraft, setCategoryDraft] = useState({ id: '', label: '', tagline: '', icon: 'camera' })

  const [form, setForm] = useState({
    name: '',
    description: '',
    duration: 60,
    price: 100,
    currency: 'USD',
    maxPhotos: 10,
    includesEdit: false,
    featuresText: '',
    categoryId: '',
  })

  const activeCount = useMemo(() => packages.filter((p) => p.status === 'ACTIVE').length, [packages])

  async function loadPackages() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/packages')
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to load packages')
      }
      const list = data.data ?? []
      setPackages(Array.isArray(list) ? list : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load packages')
    } finally {
      setLoading(false)
    }
  }

  async function loadCategories() {
    try {
      const res = await fetch('/api/admin/service-categories')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load categories')
      setCategories(Array.isArray(data.data) ? data.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories')
    }
  }

  useEffect(() => {
    if (open) {
      void Promise.all([loadPackages(), loadCategories()])
    }
  }, [open])

  useEffect(() => {
    if (!form.categoryId && categories.length > 0) {
      setForm((prev) => ({ ...prev, categoryId: categories[0].id }))
    }
  }, [categories, form.categoryId])

  async function createPackage() {
    if (!form.name.trim() || form.duration <= 0 || form.price <= 0) {
      setError('Name, duration, and price are required')
      return
    }

    setSaving(true)
    setError('')
    try {
      const features = form.featuresText
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)

      const res = await fetch('/api/admin/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          duration: Number(form.duration),
          price: Number(form.price),
          currency: form.currency.trim() || 'USD',
          maxPhotos: Number(form.maxPhotos),
          includesEdit: form.includesEdit,
          features,
          categoryId: form.categoryId || categories[0]?.id,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create package')
      }

      setForm({
        name: '',
        description: '',
        duration: 60,
        price: 100,
        currency: 'USD',
        maxPhotos: 10,
        includesEdit: false,
        featuresText: '',
        categoryId: categories[0]?.id || '',
      })

      await loadPackages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create package')
    } finally {
      setSaving(false)
    }
  }

  async function updateStatus(pkg: AdminPackage, nextStatus: PackageStatus) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/packages/${pkg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update package')
      }
      await loadPackages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update package')
    } finally {
      setSaving(false)
    }
  }

  async function updateCategory(pkg: AdminPackage, categoryId: string) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/packages/${pkg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update package category')
      await loadPackages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update package category')
    } finally {
      setSaving(false)
    }
  }

  async function saveCategories(nextCategories: ServiceCategory[]) {
    setSaving(true)
    setError('')
    try {
      const payload = nextCategories.map((c, index) => ({
        id: c.id.trim(),
        label: c.label.trim(),
        tagline: c.tagline || '',
        icon: c.icon || 'camera',
        sortOrder: index,
      }))

      const res = await fetch('/api/admin/service-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: payload }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save categories')
      setCategories(Array.isArray(data.data) ? data.data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save categories')
    } finally {
      setSaving(false)
    }
  }

  async function addCategory() {
    const id = categoryDraft.id.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    const label = categoryDraft.label.trim()
    if (!id || !label) {
      setError('Category id and label are required')
      return
    }
    if (categories.some((c) => c.id === id)) {
      setError('Category id already exists')
      return
    }

    const next = [...categories, { id, label, tagline: categoryDraft.tagline.trim(), icon: categoryDraft.icon, sortOrder: categories.length }]
    await saveCategories(next)
    setCategoryDraft({ id: '', label: '', tagline: '', icon: 'camera' })
  }

  async function removeCategory(id: string) {
    const next = categories.filter((c) => c.id !== id)
    if (next.length === 0) {
      setError('At least one category is required')
      return
    }
    await saveCategories(next)
  }

  async function archivePackage(pkg: AdminPackage) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/packages/${pkg.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to archive package')
      }
      await loadPackages()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive package')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl mx-auto bg-[#111111] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl text-ivory">Manage Packages & Services</h2>
              <p className="text-foreground/40 text-sm mt-1">{activeCount} active package(s)</p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-white/[0.12] text-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors touch-manipulation"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-6">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <h3 className="text-ivory text-sm font-semibold mb-4">Service Categories (Dynamic Tabs)</h3>
            <div className="space-y-2 mb-4">
              {categories.map((cat) => (
                <div key={cat.id} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-ivory text-sm font-medium">{cat.label} <span className="text-foreground/40 text-xs">({cat.id})</span></p>
                    <p className="text-foreground/40 text-xs truncate">{cat.tagline || 'No tagline'}</p>
                  </div>
                  <button
                    onClick={() => removeCategory(cat.id)}
                    disabled={saving || categories.length <= 1}
                    className="px-3 py-1.5 rounded-full border border-red-500/20 text-red-300 text-xs hover:bg-red-500/[0.08] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="category-id" className="text-xs text-foreground/60">Category ID</label>
                <input
                  id="category-id"
                  value={categoryDraft.id}
                  onChange={(e) => setCategoryDraft((prev) => ({ ...prev, id: e.target.value }))}
                  placeholder="e.g. maternity"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="category-label" className="text-xs text-foreground/60">Category Label</label>
                <input
                  id="category-label"
                  value={categoryDraft.label}
                  onChange={(e) => setCategoryDraft((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder="Display name"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="category-tagline" className="text-xs text-foreground/60">Tagline</label>
                <input
                  id="category-tagline"
                  value={categoryDraft.tagline}
                  onChange={(e) => setCategoryDraft((prev) => ({ ...prev, tagline: e.target.value }))}
                  placeholder="Short one-line subtitle"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="category-icon" className="text-xs text-foreground/60">Tab Icon</label>
                <select
                  id="category-icon"
                  value={categoryDraft.icon}
                  onChange={(e) => setCategoryDraft((prev) => ({ ...prev, icon: e.target.value }))}
                  className="luxury-select w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory focus:border-gold/30 focus:outline-none"
                >
                  <option value="camera">Camera Icon</option>
                  <option value="palette">Palette Icon</option>
                  <option value="party">Party Icon</option>
                </select>
              </div>
            </div>

            <button
              onClick={addCategory}
              disabled={saving}
              className={cn(
                'mt-4 px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-2 touch-manipulation transition-colors',
                saving ? 'bg-gold/50 text-[#0D0D0D]/60 cursor-not-allowed' : 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Category
            </button>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <h3 className="text-ivory text-sm font-semibold mb-4">Create New Package</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="package-name" className="text-xs text-foreground/60">Package Name</label>
                <input
                  id="package-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Golden Hour Family Session"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="package-duration" className="text-xs text-foreground/60">Duration (minutes)</label>
                <input
                  id="package-duration"
                  type="number"
                  min={15}
                  value={form.duration}
                  onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="package-price" className="text-xs text-foreground/60">Price</label>
                <input
                  id="package-price"
                  type="number"
                  min={1}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="package-currency" className="text-xs text-foreground/60">Currency</label>
                <input
                  id="package-currency"
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })}
                  placeholder="USD"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="package-max-photos" className="text-xs text-foreground/60">Max Photos</label>
                <input
                  id="package-max-photos"
                  type="number"
                  min={1}
                  value={form.maxPhotos}
                  onChange={(e) => setForm({ ...form, maxPhotos: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-foreground/60">Includes Edit</span>
                <label className="flex items-center gap-2 px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-foreground/70 text-sm">
                  <input
                    type="checkbox"
                    checked={form.includesEdit}
                    onChange={(e) => setForm({ ...form, includesEdit: e.target.checked })}
                  />
                  Enable professional retouching
                </label>
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <label htmlFor="package-description" className="text-xs text-foreground/60">Description</label>
              <textarea
                id="package-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What the client receives in this package"
                rows={2}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none resize-none"
              />
            </div>
            <div className="mt-3 space-y-1">
              <label htmlFor="package-features" className="text-xs text-foreground/60">Features (comma-separated)</label>
              <input
                id="package-features"
                value={form.featuresText}
                onChange={(e) => setForm({ ...form, featuresText: e.target.value })}
                placeholder="Online gallery, 30 edited photos, outfit guide"
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
              />
            </div>
            <div className="mt-3 space-y-1">
              <label htmlFor="package-category" className="text-xs text-foreground/60">Category</label>
              <select
                id="package-category"
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="luxury-select w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory focus:border-gold/30 focus:outline-none"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={createPackage}
              disabled={saving}
              className={cn(
                'mt-4 px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-2 touch-manipulation transition-colors',
                saving ? 'bg-gold/50 text-[#0D0D0D]/60 cursor-not-allowed' : 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Create Package
            </button>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-ivory text-sm font-semibold">Existing Packages</h3>
            <button
              onClick={loadPackages}
              disabled={loading || saving}
              className="px-3 py-1.5 rounded-full border border-white/[0.12] text-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors touch-manipulation text-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-gold animate-spin" />
            </div>
          ) : packages.length === 0 ? (
            <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-foreground/50 text-sm">
              No packages found.
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {packages.map((pkg) => {
                const isArchived = pkg.status === 'ARCHIVED'
                const canToggle = pkg.status === 'ACTIVE' || pkg.status === 'INACTIVE'
                const nextStatus: PackageStatus = pkg.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE'
                const featureList = Array.isArray(pkg.features) ? pkg.features : []

                return (
                  <div key={pkg.id} className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-ivory font-medium">{pkg.name}</p>
                        <p className="text-foreground/40 text-xs mt-0.5">
                          {pkg.duration} min • {pkg.currency} {Number(pkg.price).toLocaleString()} • max {pkg.maxPhotos} photos
                        </p>
                        {pkg.description && <p className="text-foreground/50 text-xs mt-2">{pkg.description}</p>}
                        {featureList.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {featureList.slice(0, 5).map((f) => (
                              <span key={f} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-foreground/60">{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className={cn('px-2 py-1 rounded-full text-[10px] uppercase tracking-wider', STATUS_STYLES[pkg.status])}>
                        {pkg.status}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={pkg.categoryId || categories[0]?.id || ''}
                        onChange={(e) => updateCategory(pkg, e.target.value)}
                        disabled={saving}
                        className="luxury-select px-3 py-1.5 rounded-full text-xs bg-white/[0.04] border border-white/[0.12] text-foreground/80"
                      >
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.label}</option>
                        ))}
                      </select>

                      <button
                        onClick={() => canToggle && updateStatus(pkg, nextStatus)}
                        disabled={saving || !canToggle}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs border transition-colors touch-manipulation inline-flex items-center gap-1.5',
                          canToggle
                            ? 'border-white/[0.15] text-foreground/70 hover:bg-white/[0.05]'
                            : 'border-white/[0.08] text-foreground/30 cursor-not-allowed'
                        )}
                      >
                        {pkg.status === 'ACTIVE' ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                        {pkg.status === 'ACTIVE' ? 'Set Inactive' : pkg.status === 'INACTIVE' ? 'Set Active' : 'Archived'}
                      </button>

                      <button
                        onClick={() => archivePackage(pkg)}
                        disabled={saving || isArchived}
                        className={cn(
                          'px-3 py-1.5 rounded-full text-xs border transition-colors touch-manipulation inline-flex items-center gap-1.5',
                          isArchived
                            ? 'border-white/[0.08] text-foreground/30 cursor-not-allowed'
                            : 'border-red-500/20 text-red-300 hover:bg-red-500/[0.08]'
                        )}
                      >
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>

                      <span className="ml-auto text-foreground/30 text-[10px] inline-flex items-center gap-1">
                        <Package2 className="w-3 h-3" /> sort #{pkg.sortOrder}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
