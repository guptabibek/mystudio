'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, RefreshCw, Trash2, CalendarDays, Save } from 'lucide-react'
import { addMonths, eachDayOfInterval, endOfMonth, format, isSameMonth, startOfMonth, subMonths } from 'date-fns'
import { cn } from '@/lib/utils'

type DayOfWeek =
  | 'SUNDAY'
  | 'MONDAY'
  | 'TUESDAY'
  | 'WEDNESDAY'
  | 'THURSDAY'
  | 'FRIDAY'
  | 'SATURDAY'

interface AvailabilityRule {
  id: string
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  slotDuration: number
  bufferTime: number
  isActive: boolean
}

interface BlackoutDate {
  id: string
  startDate: string
  endDate: string
  reason?: string | null
  isRecurring: boolean
}

interface ServiceCategory {
  id: string
  label: string
}

interface TemplateRule {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  slotDuration: number
  bufferTime: number
}

interface CategoryTemplate {
  categoryId: string
  rules: TemplateRule[]
}

interface AdminAvailabilityManagerProps {
  open: boolean
  onClose: () => void
}

const DAYS: DayOfWeek[] = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']

export function AdminAvailabilityManager({ open, onClose }: AdminAvailabilityManagerProps) {
  const [rules, setRules] = useState<AvailabilityRule[]>([])
  const [blackouts, setBlackouts] = useState<BlackoutDate[]>([])
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [templates, setTemplates] = useState<CategoryTemplate[]>([])

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [calendarMonth, setCalendarMonth] = useState(new Date())

  const [form, setForm] = useState({
    dayOfWeek: 'MONDAY' as DayOfWeek,
    startTime: '09:00',
    endTime: '18:00',
    slotDuration: 60,
    bufferTime: 15,
  })

  const [blackoutForm, setBlackoutForm] = useState({
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    reason: '',
    isRecurring: false,
  })

  const [selectedCategory, setSelectedCategory] = useState('')
  const [templateForm, setTemplateForm] = useState<TemplateRule>({
    dayOfWeek: 'MONDAY',
    startTime: '09:00',
    endTime: '18:00',
    slotDuration: 60,
    bufferTime: 15,
  })

  const monthDays = useMemo(() => {
    const start = startOfMonth(calendarMonth)
    const end = endOfMonth(calendarMonth)
    const days = eachDayOfInterval({ start, end })
    const startOffset = start.getDay()
    return [...Array.from({ length: startOffset }, () => null), ...days]
  }, [calendarMonth])

  const blackoutChecker = useMemo(() => {
    return (date: Date) => {
      return blackouts.some((b) => {
        const start = new Date(b.startDate)
        const end = new Date(b.endDate)
        if (b.isRecurring) {
          const check = new Date(date)
          check.setFullYear(start.getFullYear())
          return check >= start && check <= end
        }
        return date >= start && date <= end
      })
    }
  }, [blackouts])

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.categoryId === selectedCategory),
    [templates, selectedCategory]
  )

  async function loadAll() {
    setLoading(true)
    setError('')
    try {
      const [rulesRes, blackoutsRes, templatesRes] = await Promise.all([
        fetch('/api/admin/availability', { cache: 'no-store' }),
        fetch('/api/admin/availability/blackouts', { cache: 'no-store' }),
        fetch('/api/admin/availability/templates', { cache: 'no-store' }),
      ])

      const [rulesData, blackoutsData, templatesData] = await Promise.all([
        rulesRes.json(),
        blackoutsRes.json(),
        templatesRes.json(),
      ])

      if (!rulesRes.ok) throw new Error(rulesData.error || 'Failed to load availability rules')
      if (!blackoutsRes.ok) throw new Error(blackoutsData.error || 'Failed to load blackout dates')
      if (!templatesRes.ok) throw new Error(templatesData.error || 'Failed to load templates')

      setRules(Array.isArray(rulesData.data) ? rulesData.data : [])
      setBlackouts(Array.isArray(blackoutsData.data) ? blackoutsData.data : [])

      const loadedCategories = Array.isArray(templatesData.data?.categories)
        ? templatesData.data.categories
        : []
      const loadedTemplates = Array.isArray(templatesData.data?.templates)
        ? templatesData.data.templates
        : []

      setCategories(loadedCategories)
      setTemplates(loadedTemplates)

      if (!selectedCategory && loadedCategories.length > 0) {
        setSelectedCategory(loadedCategories[0].id)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load availability settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      void loadAll()
    }
  }, [open])

  async function createRule() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create availability rule')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create availability rule')
    } finally {
      setSaving(false)
    }
  }

  async function removeRule(id: string) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/availability?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete availability rule')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete availability rule')
    } finally {
      setSaving(false)
    }
  }

  async function addBlackout() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/availability/blackouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blackoutForm),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create blackout date')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create blackout date')
    } finally {
      setSaving(false)
    }
  }

  async function removeBlackout(id: string) {
    setSaving(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/availability/blackouts?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete blackout date')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete blackout date')
    } finally {
      setSaving(false)
    }
  }

  function upsertTemplateRule() {
    if (!selectedCategory) return

    setTemplates((prev) => {
      const existing = prev.find((template) => template.categoryId === selectedCategory)
      if (!existing) {
        return [...prev, { categoryId: selectedCategory, rules: [templateForm] }]
      }

      return prev.map((template) => {
        if (template.categoryId !== selectedCategory) return template

        const duplicateIndex = template.rules.findIndex(
          (rule) =>
            rule.dayOfWeek === templateForm.dayOfWeek &&
            rule.startTime === templateForm.startTime &&
            rule.endTime === templateForm.endTime
        )

        if (duplicateIndex >= 0) {
          const copy = [...template.rules]
          copy[duplicateIndex] = templateForm
          return { ...template, rules: copy }
        }

        return { ...template, rules: [...template.rules, templateForm] }
      })
    })
  }

  function removeTemplateRule(index: number) {
    if (!selectedCategory) return

    setTemplates((prev) =>
      prev.map((template) => {
        if (template.categoryId !== selectedCategory) return template
        return { ...template, rules: template.rules.filter((_, i) => i !== index) }
      })
    )
  }

  async function saveTemplates() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/availability/templates', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templates }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save templates')
      await loadAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save templates')
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl mx-auto bg-[#111111] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl text-ivory">Manage Time Slots</h2>
              <p className="text-foreground/40 text-sm mt-1">Global rules, blackout calendar, and category templates.</p>
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
            <h3 className="text-ivory text-sm font-semibold mb-4">Add Global Availability Rule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="global-day-of-week" className="text-xs text-foreground/60">Day of Week</label>
                <select
                  id="global-day-of-week"
                  value={form.dayOfWeek}
                  onChange={(e) => setForm((prev) => ({ ...prev, dayOfWeek: e.target.value as DayOfWeek }))}
                  className="luxury-select w-full px-4 py-3 border border-white/[0.08] rounded-xl text-ivory"
                >
                  {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </div>

              <div className="space-y-1">
                <label htmlFor="global-start-time" className="text-xs text-foreground/60">Start Time</label>
                <input
                  id="global-start-time"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="global-end-time" className="text-xs text-foreground/60">End Time</label>
                <input
                  id="global-end-time"
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="global-slot-duration" className="text-xs text-foreground/60">Slot Duration (minutes)</label>
                <input
                  id="global-slot-duration"
                  type="number"
                  min={15}
                  step={5}
                  value={form.slotDuration}
                  onChange={(e) => setForm((prev) => ({ ...prev, slotDuration: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="global-buffer-time" className="text-xs text-foreground/60">Buffer Between Slots (minutes)</label>
                <input
                  id="global-buffer-time"
                  type="number"
                  min={0}
                  step={5}
                  value={form.bufferTime}
                  onChange={(e) => setForm((prev) => ({ ...prev, bufferTime: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={createRule}
              disabled={saving}
              className={cn(
                'mt-4 px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-2 touch-manipulation transition-colors',
                saving ? 'bg-gold/50 text-[#0D0D0D]/60 cursor-not-allowed' : 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Add Rule
            </button>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-ivory text-sm font-semibold">Blackout Date Calendar</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))} className="text-foreground/50 hover:text-foreground px-2">‹</button>
                <span className="text-sm text-ivory">{format(calendarMonth, 'MMMM yyyy')}</span>
                <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="text-foreground/50 hover:text-foreground px-2">›</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-3 text-[10px] text-foreground/40 uppercase tracking-wider">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <div key={d} className="text-center py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 mb-4">
              {monthDays.map((day, index) => {
                if (!day) return <div key={`empty-${index}`} />
                const isBlackout = blackoutChecker(day)
                return (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      'aspect-square rounded-lg border flex items-center justify-center text-xs',
                      isSameMonth(day, calendarMonth) ? 'text-ivory border-white/[0.06]' : 'text-foreground/25 border-white/[0.03]',
                      isBlackout && 'bg-red-500/15 border-red-500/30 text-red-200'
                    )}
                  >
                    {format(day, 'd')}
                  </div>
                )
              })}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="blackout-start-date" className="text-xs text-foreground/60">Start Date</label>
                <input
                  id="blackout-start-date"
                  type="date"
                  value={blackoutForm.startDate}
                  onChange={(e) => setBlackoutForm((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="blackout-end-date" className="text-xs text-foreground/60">End Date</label>
                <input
                  id="blackout-end-date"
                  type="date"
                  value={blackoutForm.endDate}
                  onChange={(e) => setBlackoutForm((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="blackout-reason" className="text-xs text-foreground/60">Reason</label>
                <input
                  id="blackout-reason"
                  value={blackoutForm.reason}
                  onChange={(e) => setBlackoutForm((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="holiday, maintenance, private event"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30"
                />
              </div>
              <div className="space-y-1">
                <span className="text-xs text-foreground/60">Recurrence</span>
                <label className="flex items-center gap-2 px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-foreground/70 text-sm">
                  <input
                    type="checkbox"
                    checked={blackoutForm.isRecurring}
                    onChange={(e) => setBlackoutForm((prev) => ({ ...prev, isRecurring: e.target.checked }))}
                  />
                  Recurring yearly
                </label>
              </div>
            </div>

            <button
              onClick={addBlackout}
              disabled={saving}
              className="mt-4 px-5 py-2.5 rounded-full font-semibold text-sm inline-flex items-center gap-2 bg-red-500/90 text-white hover:bg-red-500 transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
              Add Blackout Range
            </button>

            <div className="mt-4 space-y-2">
              {blackouts.map((b) => (
                <div key={b.id} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between gap-2">
                  <div>
                    <p className="text-ivory text-sm">
                      {new Date(b.startDate).toLocaleDateString()} - {new Date(b.endDate).toLocaleDateString()}
                    </p>
                    <p className="text-foreground/40 text-xs">
                      {b.reason || 'No reason'} {b.isRecurring ? '• Recurring' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => removeBlackout(b.id)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-full border border-red-500/20 text-red-300 text-xs hover:bg-red-500/[0.08] inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
            <h3 className="text-ivory text-sm font-semibold mb-4">Per-Category Availability Templates</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label htmlFor="template-category" className="text-xs text-foreground/60">Category</label>
                <select
                  id="template-category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="luxury-select w-full px-4 py-3 border border-white/[0.08] rounded-xl text-ivory"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="template-day-of-week" className="text-xs text-foreground/60">Template Day</label>
                <select
                  id="template-day-of-week"
                  value={templateForm.dayOfWeek}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, dayOfWeek: e.target.value as DayOfWeek }))}
                  className="luxury-select w-full px-4 py-3 border border-white/[0.08] rounded-xl text-ivory"
                >
                  {DAYS.map((day) => <option key={day} value={day}>{day}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label htmlFor="template-start-time" className="text-xs text-foreground/60">Template Start Time</label>
                <input
                  id="template-start-time"
                  type="time"
                  value={templateForm.startTime}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, startTime: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="template-end-time" className="text-xs text-foreground/60">Template End Time</label>
                <input
                  id="template-end-time"
                  type="time"
                  value={templateForm.endTime}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, endTime: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="template-slot-duration" className="text-xs text-foreground/60">Template Slot Duration (minutes)</label>
                <input
                  id="template-slot-duration"
                  type="number"
                  min={15}
                  step={5}
                  value={templateForm.slotDuration}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, slotDuration: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="template-buffer-time" className="text-xs text-foreground/60">Template Buffer (minutes)</label>
                <input
                  id="template-buffer-time"
                  type="number"
                  min={0}
                  step={5}
                  value={templateForm.bufferTime}
                  onChange={(e) => setTemplateForm((prev) => ({ ...prev, bufferTime: Number(e.target.value) }))}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={upsertTemplateRule}
                disabled={!selectedCategory}
                className="px-4 py-2 rounded-full bg-gold text-[#0D0D0D] font-semibold text-sm"
              >
                Add Rule to Template
              </button>
              <button
                onClick={saveTemplates}
                disabled={saving}
                className="px-4 py-2 rounded-full border border-white/[0.15] text-foreground/80 hover:bg-white/[0.04] inline-flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Templates
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {(selectedTemplate?.rules || []).map((rule, index) => (
                <div key={`${rule.dayOfWeek}-${rule.startTime}-${rule.endTime}-${index}`} className="p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] flex items-center justify-between">
                  <p className="text-sm text-ivory">
                    {rule.dayOfWeek} • {rule.startTime}-{rule.endTime} • {rule.slotDuration}m / {rule.bufferTime}m buffer
                  </p>
                  <button
                    onClick={() => removeTemplateRule(index)}
                    className="px-3 py-1.5 rounded-full border border-red-500/20 text-red-300 text-xs hover:bg-red-500/[0.08] inline-flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              ))}
              {(selectedTemplate?.rules || []).length === 0 && (
                <p className="text-foreground/40 text-sm">No template rules yet for this category. Global rules will be used.</p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-ivory text-sm font-semibold">Current Global Rules</h3>
            <button
              onClick={loadAll}
              disabled={loading || saving}
              className="px-3 py-1.5 rounded-full border border-white/[0.12] text-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors text-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="py-10 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-gold animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-foreground/50 text-sm">
              No availability rules found.
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {rules.map((rule) => (
                <div key={rule.id} className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] flex items-center justify-between gap-3">
                  <div>
                    <p className="text-ivory font-medium">{rule.dayOfWeek}</p>
                    <p className="text-foreground/40 text-xs mt-0.5">
                      {rule.startTime} - {rule.endTime} • Slot {rule.slotDuration}m • Buffer {rule.bufferTime}m
                    </p>
                  </div>
                  <button
                    onClick={() => removeRule(rule.id)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-full border border-red-500/20 text-red-300 text-xs hover:bg-red-500/[0.08] inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
