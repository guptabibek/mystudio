'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ArrowLeft, Camera, Palette, PartyPopper,
  Check, Calendar, ChevronLeft, ChevronRight,
  MessageCircle, Send, CheckCircle2, CreditCard,
  Loader2, Clock, AlertCircle, User,
} from 'lucide-react'
import {
  format, addMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, isToday, isBefore, startOfDay, getDay,
} from 'date-fns'
import { cn } from '@/lib/utils'
import { useAuth } from './AuthProvider'
import { AuthModal } from './AuthModal'
import { PaymentModal } from './PaymentModal'
import { studio } from '@/lib/config/studio'

type BookingStep = 1 | 2 | 3 | 4 | 5 | 6

interface ServiceCategory {
  id: string
  label: string
  tagline: string
  icon?: string
  sortOrder?: number
}

interface ApiPackage {
  id: string
  name: string
  description: string | null
  duration: number
  price: string
  currency: string
  maxPhotos: number
  features: string[] | null
  sortOrder: number
  categoryId?: string
}

interface TimeSlot {
  startTime: string
  endTime: string
  available?: boolean
  isAvailable?: boolean
}

interface BookingResult {
  id: string
  bookingNumber: string
  status: string
  sessionDate: string
  sessionStart: string
  finalPrice: string | number
}

const SHOOT_TYPES: { id: string; label: string; icon: typeof Camera; description: string; gradient: string }[] = [
  { id: 'weddings', label: 'Wedding', icon: Camera, description: 'Ceremonies, receptions & engagements', gradient: 'from-rose-900/30 to-amber-950/20' },
  { id: 'fashion', label: 'Fashion', icon: Palette, description: 'Editorial, campaigns & lookbooks', gradient: 'from-zinc-800/30 to-stone-950/20' },
  { id: 'events', label: 'Event', icon: PartyPopper, description: 'Corporate, social & celebrations', gradient: 'from-purple-950/30 to-indigo-950/20' },
]

const ICON_MAP: Record<string, typeof Camera> = {
  camera: Camera,
  palette: Palette,
  party: PartyPopper,
}

const GRADIENT_MAP: Record<string, string> = {
  weddings: 'from-rose-900/30 to-amber-950/20',
  fashion: 'from-zinc-800/30 to-stone-950/20',
  events: 'from-purple-950/30 to-indigo-950/20',
}

export function BookingSection() {
  const { user, loading: authLoading } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [step, setStep] = useState<BookingStep>(1)
  const [categories, setCategories] = useState<ServiceCategory[]>([])
  const [shootType, setShootType] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null)
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', notes: '' })

  // API state
  const [packages, setPackages] = useState<ApiPackage[]>([])
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])
  const [loadingPackages, setLoadingPackages] = useState(true)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Booking result & payment
  const [bookingResult, setBookingResult] = useState<BookingResult | null>(null)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentDone, setPaymentDone] = useState(false)

  const today = startOfDay(new Date())

  // Fetch packages from API
  const loadPackages = useCallback(async () => {
    setLoadingPackages(true)
    try {
      const [categoryRes, packageRes] = await Promise.all([
        fetch('/api/service-categories'),
        fetch('/api/packages'),
      ])
      const categoryData = await categoryRes.json()
      const packageData = await packageRes.json()
      const list = packageData.data ?? packageData ?? []

      if (Array.isArray(categoryData?.data)) {
        setCategories([...categoryData.data].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
      }
      setPackages(Array.isArray(list) ? list : [])
    } catch {
      /* keep empty */
    } finally {
      setLoadingPackages(false)
    }
  }, [])

  useEffect(() => {
    loadPackages()
  }, [loadPackages])

  // Pre-fill form with user data
  useEffect(() => {
    if (user && !formData.name && !formData.email) {
      setFormData(prev => ({
        ...prev,
        name: user.name || prev.name,
        email: user.email || prev.email,
      }))
    }
  }, [user, formData.name, formData.email])

  const packagesByType = useMemo(() => {
    const grouped: Record<string, ApiPackage[]> = {}
    for (const category of categories) {
      grouped[category.id] = []
    }
    for (const pkg of packages) {
      const key = pkg.categoryId || categories[0]?.id || 'default'
      if (!grouped[key]) grouped[key] = []
      grouped[key].push(pkg)
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort((a, b) => a.sortOrder - b.sortOrder)
    }
    return grouped
  }, [packages, categories])

  const shootTypes = useMemo(() => {
    if (categories.length > 0) {
      return categories.map((c) => ({
        id: c.id,
        label: c.label,
        icon: ICON_MAP[c.icon || 'camera'] || Camera,
        description: c.tagline || 'Tailored photography sessions',
        gradient: GRADIENT_MAP[c.id] || 'from-zinc-800/30 to-stone-950/20',
      }))
    }
    return SHOOT_TYPES
  }, [categories])

  const fetchTimeSlots = useCallback(async (date: Date, packageId: string) => {
    setLoadingSlots(true)
    setTimeSlots([])
    try {
      const dateStr = format(date, 'yyyy-MM-dd')
      const res = await fetch(`/api/bookings/availability?startDate=${dateStr}&endDate=${dateStr}&packageId=${encodeURIComponent(packageId)}`)
      const data = await res.json()
      const availability = data.data ?? data ?? []
      if (Array.isArray(availability) && availability.length > 0) {
        setTimeSlots(availability[0]?.slots ?? [])
      }
    } catch {
      /* keep empty */
    } finally {
      setLoadingSlots(false)
    }
  }, [])

  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarMonth)
    const end = endOfMonth(calendarMonth)
    const days = eachDayOfInterval({ start, end })
    const startDow = getDay(start)
    const padded: (Date | null)[] = Array.from({ length: startDow }, () => null)
    return [...padded, ...days]
  }, [calendarMonth])

  const nextStep = () => { if (step < 6) setStep((step + 1) as BookingStep) }
  const prevStep = () => { if (step > 1) setStep((step - 1) as BookingStep) }

  const handleSubmit = async () => {
    if (!user) { setShowAuth(true); return }
    if (!selectedPackage || !selectedDate || !selectedTimeSlot) {
      setError('Please complete all booking steps'); return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: selectedPackage,
          date: format(selectedDate, 'yyyy-MM-dd'),
          timeSlot: selectedTimeSlot,
          customerName: formData.name,
          customerEmail: formData.email,
          customerPhone: formData.phone,
          customerNotes: formData.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to create booking')
      setBookingResult(data.data ?? data)
      setStep(6)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  const resetBooking = () => {
    setStep(1)
    setShootType(null)
    setSelectedDate(null)
    setSelectedTimeSlot(null)
    setSelectedPackage(null)
    setFormData({ name: user?.name || '', email: user?.email || '', phone: '', notes: '' })
    setBookingResult(null)
    setPaymentDone(false)
    setError('')
  }

  const currentPkg = packages.find(p => p.id === selectedPackage)

  return (
    <div className="min-h-screen pt-safe-top">
      {/* Header */}
      <div className="px-6 pt-12 pb-4">
        <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-2">Booking</p>
        <h1 className="font-serif text-3xl text-ivory">Book a Session</h1>
        {!authLoading && !user && (
          <button onClick={() => setShowAuth(true)}
            className="mt-2 flex items-center gap-1.5 text-gold text-sm hover:text-gold-light transition-colors touch-manipulation">
            <User className="w-3.5 h-3.5" /> Sign in to book faster
          </button>
        )}
      </div>

      {/* Progress bar */}
      {step < 6 && (
        <div className="px-6 pb-6">
          <div className="flex items-center justify-between text-xs text-foreground/40 mb-2">
            <span>Step {step} of 5</span>
            <span>{Math.round((step / 5) * 100)}%</span>
          </div>
          <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full transition-all duration-500 ease-out" style={{ width: `${(step / 5) * 100}%` }} />
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto text-red-400/60 hover:text-red-400">×</button>
        </div>
      )}

      <div className="px-6 pb-24">
        {/* ── Step 1: Shoot Type ── */}
        {step === 1 && (
          <div className="animate-fade-in-up space-y-4">
            <h2 className="font-serif text-xl text-ivory mb-6">What are we capturing?</h2>
            {shootTypes.map((type) => {
              const Icon = type.icon
              const isSelected = shootType === type.id
              const hasPackages = (packagesByType[type.id] || []).length > 0
              return (
                <button key={type.id}
                  onClick={() => { if (hasPackages) { setShootType(type.id); setTimeout(nextStep, 300) } }}
                  disabled={!hasPackages && !loadingPackages}
                  className={cn(
                    'w-full p-5 rounded-2xl border text-left transition-all duration-300 touch-manipulation flex items-center gap-4',
                    isSelected ? 'border-gold/40 bg-gold/[0.08]'
                      : hasPackages ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                        : 'border-white/[0.04] bg-white/[0.01] opacity-40 cursor-not-allowed'
                  )}>
                  <div className={cn('w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center shrink-0', type.gradient)}>
                    <Icon className="w-5 h-5 text-gold" strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <p className="text-ivory font-medium">{type.label}</p>
                    <p className="text-foreground/40 text-xs mt-0.5">{hasPackages ? type.description : 'No packages available'}</p>
                  </div>
                  {isSelected && <Check className="w-5 h-5 text-gold shrink-0" />}
                </button>
              )
            })}
            {loadingPackages && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 text-gold animate-spin" />
                <span className="text-foreground/40 text-sm ml-2">Loading packages...</span>
              </div>
            )}
            {!loadingPackages && packages.length === 0 && (
              <div className="text-center py-8">
                <AlertCircle className="w-6 h-6 text-foreground/20 mx-auto mb-3" />
                <p className="text-foreground/40 text-sm mb-4">Could not load packages. Please try again.</p>
                <button onClick={loadPackages} className="px-6 py-2 bg-gold text-[#0D0D0D] text-sm font-semibold rounded-full hover:bg-gold-light transition-colors touch-manipulation">
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2: Package ── */}
        {step === 2 && shootType && (
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={prevStep} className="p-2 text-foreground/40 hover:text-foreground transition-colors touch-manipulation" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></button>
              <h2 className="font-serif text-xl text-ivory">Select a package</h2>
            </div>
            <div className="space-y-3">
              {(packagesByType[shootType] || []).map((pkg) => {
                const isSelected = selectedPackage === pkg.id
                return (
                  <button key={pkg.id}
                    onClick={() => { setSelectedPackage(pkg.id); setTimeout(nextStep, 300) }}
                    className={cn(
                      'relative w-full p-5 rounded-2xl border text-left transition-all duration-300 touch-manipulation',
                      isSelected ? 'border-gold/40 bg-gold/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                    )}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <span className="text-ivory font-medium">{pkg.name}</span>
                        {pkg.description && <p className="text-foreground/40 text-xs mt-0.5">{pkg.description}</p>}
                      </div>
                      <span className="font-serif text-xl text-ivory">${Number(pkg.price).toLocaleString()}</span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {(Array.isArray(pkg.features) ? pkg.features : []).slice(0, 4).map((f) => (
                        <span key={f} className="text-foreground/40 text-xs bg-white/[0.04] px-2 py-0.5 rounded-full">{f}</span>
                      ))}
                      {(Array.isArray(pkg.features) ? pkg.features : []).length > 4 && <span className="text-gold/40 text-xs">+{(Array.isArray(pkg.features) ? pkg.features : []).length - 4} more</span>}
                    </div>
                    {isSelected && <Check className="w-5 h-5 text-gold absolute top-5 right-5" />}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── Step 3: Date ── */}
        {step === 3 && (
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={prevStep} className="p-2 text-foreground/40 hover:text-foreground transition-colors touch-manipulation" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></button>
              <h2 className="font-serif text-xl text-ivory">Choose a date</h2>
            </div>
            <div className="bg-white/[0.02] rounded-3xl border border-white/[0.06] p-4">
              <div className="flex items-center justify-between mb-4">
                <button onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))} className="p-2 text-foreground/40 hover:text-foreground touch-manipulation" aria-label="Previous month"><ChevronLeft className="w-5 h-5" /></button>
                <span className="font-serif text-ivory">{format(calendarMonth, 'MMMM yyyy')}</span>
                <button onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))} className="p-2 text-foreground/40 hover:text-foreground touch-manipulation" aria-label="Next month"><ChevronRight className="w-5 h-5" /></button>
              </div>
              <div className="grid grid-cols-7 mb-2">
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                  <div key={d} className="text-center text-foreground/30 text-xs py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, i) => {
                  if (!day) return <div key={`empty-${i}`} />
                  const isPast = isBefore(day, today)
                  const isSelected = selectedDate && day.getTime() === selectedDate.getTime()
                  return (
                    <button key={day.toISOString()} disabled={isPast}
                      onClick={() => {
                        setSelectedDate(day)
                        setSelectedTimeSlot(null)
                        if (selectedPackage) fetchTimeSlots(day, selectedPackage)
                        setTimeout(nextStep, 300)
                      }}
                      className={cn(
                        'aspect-square rounded-xl flex items-center justify-center text-sm transition-all duration-200 touch-manipulation',
                        isPast && 'text-foreground/15 cursor-not-allowed',
                        !isPast && !isSelected && 'text-foreground/60 hover:bg-white/[0.05]',
                        isSelected && 'bg-gold text-[#0D0D0D] font-semibold',
                        isToday(day) && !isSelected && 'ring-1 ring-gold/30',
                        !isSameMonth(day, calendarMonth) && 'opacity-30'
                      )}>
                      {format(day, 'd')}
                    </button>
                  )
                })}
              </div>
            </div>
            {selectedDate && (
              <p className="text-center text-gold/70 text-sm mt-4">
                <Calendar className="w-4 h-4 inline mr-1" />{format(selectedDate, 'EEEE, MMMM d, yyyy')}
              </p>
            )}
          </div>
        )}

        {/* ── Step 4: Time Slot ── */}
        {step === 4 && (
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={prevStep} className="p-2 text-foreground/40 hover:text-foreground transition-colors touch-manipulation" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></button>
              <h2 className="font-serif text-xl text-ivory">Choose a time</h2>
            </div>
            {loadingSlots ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-gold animate-spin" />
                <span className="text-foreground/40 text-sm ml-2">Checking availability...</span>
              </div>
            ) : timeSlots.length > 0 ? (
              <div className="grid grid-cols-2 gap-3">
                {timeSlots.map((slot) => {
                  const slotAvailable = slot.available ?? slot.isAvailable ?? false
                  const isSelected = selectedTimeSlot === slot.startTime
                  return (
                    <button key={slot.startTime} disabled={!slotAvailable}
                      onClick={() => { setSelectedTimeSlot(slot.startTime); setTimeout(nextStep, 300) }}
                      className={cn(
                        'p-4 rounded-2xl border text-center transition-all duration-300 touch-manipulation',
                        !slotAvailable && 'opacity-30 cursor-not-allowed border-white/[0.04]',
                        slotAvailable && !isSelected && 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]',
                        isSelected && 'border-gold/40 bg-gold/[0.08]'
                      )}>
                      <Clock className={cn('w-4 h-4 mx-auto mb-1', isSelected ? 'text-gold' : 'text-foreground/30')} />
                      <p className={cn('text-sm font-medium', isSelected ? 'text-gold' : 'text-ivory')}>{slot.startTime}</p>
                      <p className="text-foreground/30 text-[10px] mt-0.5">{slotAvailable ? 'Available' : 'Booked'}</p>
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Clock className="w-8 h-8 text-foreground/20 mx-auto mb-3" />
                <p className="text-foreground/40 text-sm">No time slots available for this date.</p>
                <button onClick={prevStep} className="mt-4 text-gold text-sm hover:text-gold-light transition-colors touch-manipulation">
                  Choose a different date
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 5: Contact Details ── */}
        {step === 5 && (
          <div className="animate-fade-in-up">
            <div className="flex items-center gap-3 mb-6">
              <button onClick={prevStep} className="p-2 text-foreground/40 hover:text-foreground transition-colors touch-manipulation" aria-label="Go back"><ArrowLeft className="w-5 h-5" /></button>
              <h2 className="font-serif text-xl text-ivory">Your details</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label htmlFor="booking-name" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Full Name</label>
                <input id="booking-name" type="text" required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Your name"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors" />
              </div>
              <div>
                <label htmlFor="booking-email" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Email</label>
                <input id="booking-email" type="email" required value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="your@email.com"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors" />
              </div>
              <div>
                <label htmlFor="booking-phone" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Phone</label>
                <input id="booking-phone" type="tel" value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+1 (555) 000-0000"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors" />
              </div>
              <div>
                <label htmlFor="booking-notes" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Special Requests</label>
                <textarea id="booking-notes" value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Tell us about your vision..." rows={3}
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors resize-none" />
              </div>

              <a href={studio.whatsappBookingUrl}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-3 w-full p-4 rounded-2xl border border-green-500/20 bg-green-500/[0.05] hover:bg-green-500/[0.08] transition-colors touch-manipulation">
                <MessageCircle className="w-5 h-5 text-green-400" />
                <div className="text-left">
                  <p className="text-ivory text-sm font-medium">Quick Contact via WhatsApp</p>
                  <p className="text-foreground/40 text-xs">Get an instant response</p>
                </div>
              </a>

              {/* Booking summary */}
              {currentPkg && selectedDate && selectedTimeSlot && (
                <div className="p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <p className="text-foreground/50 text-xs uppercase tracking-wider mb-3">Booking Summary</p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-foreground/40">Package</span><span className="text-ivory">{currentPkg.name}</span></div>
                    <div className="flex justify-between"><span className="text-foreground/40">Date</span><span className="text-ivory">{format(selectedDate, 'MMM d, yyyy')}</span></div>
                    <div className="flex justify-between"><span className="text-foreground/40">Time</span><span className="text-ivory">{selectedTimeSlot}</span></div>
                    <div className="flex justify-between pt-2 border-t border-white/[0.06]">
                      <span className="text-ivory font-medium">Total</span>
                      <span className="font-serif text-lg text-gold">${Number(currentPkg.price).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              <button onClick={handleSubmit} disabled={!formData.name || !formData.email || submitting}
                className={cn(
                  'w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 touch-manipulation flex items-center justify-center gap-2',
                  formData.name && formData.email && !submitting
                    ? 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
                    : 'bg-white/[0.06] text-foreground/20 cursor-not-allowed'
                )}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating Booking...</>
                  : !user ? <><User className="w-4 h-4" /> Sign In &amp; Book</>
                    : <><Send className="w-4 h-4" /> Confirm Booking</>}
              </button>
            </div>
          </div>
        )}

        {/* ── Step 6: Confirmation + Payment ── */}
        {step === 6 && bookingResult && (
          <div className="animate-fade-in-up text-center py-12">
            <div className="w-20 h-20 rounded-full bg-gold/10 flex items-center justify-center mx-auto mb-6">
              <CheckCircle2 className="w-10 h-10 text-gold" />
            </div>
            <h2 className="font-serif text-2xl text-ivory mb-3">
              {paymentDone ? 'Booking Confirmed!' : 'Booking Created!'}
            </h2>
            <p className="text-foreground/50 text-sm max-w-sm mx-auto leading-relaxed">
              {paymentDone
                ? `Thank you, ${formData.name || 'dear client'}! Your booking and payment are confirmed.`
                : `Your booking #${bookingResult.bookingNumber} is pending payment.`}
            </p>

            <div className="mt-8 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-left max-w-sm mx-auto">
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-foreground/40">Booking #</span>
                  <span className="text-ivory font-mono text-xs">{bookingResult.bookingNumber}</span>
                </div>
                {currentPkg && (
                  <div className="flex justify-between">
                    <span className="text-foreground/40">Package</span>
                    <span className="text-ivory">{currentPkg.name}</span>
                  </div>
                )}
                {selectedDate && (
                  <div className="flex justify-between">
                    <span className="text-foreground/40">Date</span>
                    <span className="text-ivory">{format(selectedDate, 'MMM d, yyyy')}</span>
                  </div>
                )}
                {selectedTimeSlot && (
                  <div className="flex justify-between">
                    <span className="text-foreground/40">Time</span>
                    <span className="text-ivory">{selectedTimeSlot}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-foreground/40">Status</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full',
                    paymentDone ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20')}>
                    {paymentDone ? 'Confirmed' : 'Pending Payment'}
                  </span>
                </div>
              </div>
            </div>

            {!paymentDone && (
              <button onClick={() => setShowPayment(true)}
                className="mt-6 px-10 py-3.5 bg-gold text-[#0D0D0D] font-semibold text-sm rounded-full tracking-wide hover:bg-gold-light transition-all duration-300 animate-pulse-glow touch-manipulation inline-flex items-center gap-2">
                <CreditCard className="w-4 h-4" /> Pay Now
              </button>
            )}

            <button onClick={resetBooking}
              className="mt-4 block mx-auto px-8 py-3 border border-white/[0.1] text-ivory text-sm rounded-full hover:bg-white/[0.05] transition-colors touch-manipulation">
              Book Another Session
            </button>
          </div>
        )}
      </div>

      <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />

      {bookingResult && (
        <PaymentModal open={showPayment} onClose={() => setShowPayment(false)}
          bookingId={bookingResult.id} bookingNumber={bookingResult.bookingNumber}
          amount={Number(bookingResult.finalPrice)} currency={currentPkg?.currency || 'USD'}
          onSuccess={() => setPaymentDone(true)} />
      )}
    </div>
  )
}