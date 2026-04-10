'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Search, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils'

type BookingStatus = 'PENDING' | 'CONFIRMED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REFUNDED' | 'CANCELLED' | 'DISPUTED'
type PaymentMethod = 'STRIPE' | 'ESEWA' | 'BANK_TRANSFER'

interface AdminPayment {
  id: string
  method: PaymentMethod
  status: PaymentStatus
  amount: string | number
  currency: string
  transactionId?: string | null
  gatewayReference?: string | null
  createdAt: string
}

interface AdminBooking {
  id: string
  bookingNumber: string
  customerName: string
  customerEmail: string
  sessionDate: string
  sessionStart: string
  sessionEnd: string
  finalPrice: string | number
  status: BookingStatus
  package: { name: string }
  user?: { id: string; email: string; name: string | null }
  payments: AdminPayment[]
}

interface ApiListResponse {
  bookings: AdminBooking[]
  page: number
  limit: number
  total: number
  totalPages: number
}

interface AdminBookingsManagerProps {
  open: boolean
  onClose: () => void
}

const STATUS_OPTIONS: BookingStatus[] = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']

const STATUS_STYLE: Record<BookingStatus, string> = {
  PENDING: 'bg-amber-500/10 border border-amber-500/20 text-amber-300',
  CONFIRMED: 'bg-blue-500/10 border border-blue-500/20 text-blue-300',
  IN_PROGRESS: 'bg-purple-500/10 border border-purple-500/20 text-purple-300',
  COMPLETED: 'bg-green-500/10 border border-green-500/20 text-green-300',
  CANCELLED: 'bg-red-500/10 border border-red-500/20 text-red-300',
}

const PAYMENT_STYLE: Record<PaymentStatus, string> = {
  PENDING: 'text-amber-300',
  PROCESSING: 'text-blue-300',
  COMPLETED: 'text-green-300',
  FAILED: 'text-red-300',
  REFUNDED: 'text-orange-300',
  CANCELLED: 'text-red-300',
  DISPUTED: 'text-pink-300',
}

export function AdminBookingsManager({ open, onClose }: AdminBookingsManagerProps) {
  const [loading, setLoading] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [statusFilter, setStatusFilter] = useState<'ALL' | BookingStatus>('ALL')
  const [search, setSearch] = useState('')
  const [meta, setMeta] = useState({ page: 1, total: 0, totalPages: 1 })

  const hasData = useMemo(() => bookings.length > 0, [bookings])

  async function loadBookings() {
    setLoading(true)
    setError('')
    try {
      const query = new URLSearchParams()
      if (statusFilter !== 'ALL') query.set('status', statusFilter)
      if (search.trim()) query.set('search', search.trim())
      query.set('page', '1')
      query.set('limit', '50')

      const res = await fetch(`/api/bookings/admin?${query.toString()}`, { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch bookings')

      const payload = (data.data || {}) as ApiListResponse
      setBookings(Array.isArray(payload.bookings) ? payload.bookings : [])
      setMeta({
        page: payload.page || 1,
        total: payload.total || 0,
        totalPages: payload.totalPages || 1,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bookings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    void loadBookings()
  }, [open, statusFilter])

  async function updateStatus(bookingId: string, status: BookingStatus) {
    setSavingId(bookingId)
    setError('')
    try {
      const res = await fetch('/api/bookings/admin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, status }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update booking status')
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status } : b)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking status')
    } finally {
      setSavingId(null)
    }
  }

  function exportCsv() {
    const query = new URLSearchParams()
    if (statusFilter !== 'ALL') query.set('status', statusFilter)
    const url = `/api/admin/reports/bookings?${query.toString()}`
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-4xl mx-auto bg-[#111111] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto">
        <div className="px-6 pt-6 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-2xl text-ivory">Manage Bookings & Payments</h2>
              <p className="text-foreground/40 text-sm mt-1">{meta.total} booking(s) found</p>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-full border border-white/[0.12] text-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors touch-manipulation"
            >
              Close
            </button>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-foreground/30 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by booking no, name, email"
                className="w-full pl-9 pr-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/30 focus:border-gold/30 focus:outline-none"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | BookingStatus)}
              className="luxury-select px-4 py-2.5 border border-white/[0.08] rounded-xl text-ivory"
            >
              <option value="ALL">All statuses</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={loadBookings}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl border border-white/[0.12] text-foreground/70 hover:text-foreground hover:bg-white/[0.04] transition-colors inline-flex items-center justify-center gap-2"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
              Refresh
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={exportCsv}
              className="px-4 py-2 rounded-full bg-gold text-[#0D0D0D] text-xs font-semibold hover:bg-gold-light transition-colors"
            >
              Export CSV Report
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">{error}</div>
          )}

          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Loader2 className="w-6 h-6 text-gold animate-spin" />
            </div>
          ) : !hasData ? (
            <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] text-foreground/50 text-sm">
              No bookings found for this filter.
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {bookings.map((booking) => {
                const latestPayment = booking.payments?.[0]
                return (
                  <div key={booking.id} className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-ivory font-medium">{booking.bookingNumber}</p>
                        <p className="text-foreground/40 text-xs mt-0.5">
                          {booking.customerName} • {booking.customerEmail}
                        </p>
                        <p className="text-foreground/40 text-xs mt-1 inline-flex items-center gap-1.5">
                          <CalendarClock className="w-3.5 h-3.5" />
                          {new Date(booking.sessionDate).toLocaleDateString()} • {booking.sessionStart}-{booking.sessionEnd}
                        </p>
                        <p className="text-foreground/50 text-xs mt-1">
                          Package: {booking.package?.name || 'N/A'} • Amount: ${Number(booking.finalPrice || 0).toLocaleString()}
                        </p>
                        {latestPayment ? (
                          <p className="text-xs mt-1">
                            Payment: <span className={cn('font-medium', PAYMENT_STYLE[latestPayment.status])}>{latestPayment.status}</span>
                            <span className="text-foreground/40"> • {latestPayment.method} • {latestPayment.currency} {Number(latestPayment.amount || 0).toFixed(2)}</span>
                          </p>
                        ) : (
                          <p className="text-xs mt-1 text-foreground/40">Payment: Not initiated</p>
                        )}
                      </div>

                      <span className={cn('px-2 py-1 rounded-full text-[10px] uppercase tracking-wider', STATUS_STYLE[booking.status])}>
                        {booking.status}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <select
                        value={booking.status}
                        onChange={(e) => updateStatus(booking.id, e.target.value as BookingStatus)}
                        disabled={savingId === booking.id}
                        className="luxury-select px-3 py-1.5 rounded-full text-xs bg-white/[0.04] border border-white/[0.12] text-foreground/80"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                      {savingId === booking.id && <Loader2 className="w-4 h-4 text-gold animate-spin" />}
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
