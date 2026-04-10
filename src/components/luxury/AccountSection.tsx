'use client'

import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { AuthModal } from './AuthModal'
import { AdminPackagesManager } from './AdminPackagesManager'
import { AdminBookingsManager } from './AdminBookingsManager'
import { AdminAvailabilityPanel } from './AdminAvailabilityPanel'
import { AdminPhotoManager } from './AdminPhotoManager'
import { MyPhotosGallery } from './MyPhotosGallery'
import {
  User, LogOut, CalendarDays, CreditCard, Image as ImageIcon,
  ChevronRight, Phone, Mail, MapPin, MessageCircle, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { studio } from '@/lib/config/studio'
import type { Section } from './BottomNav'

interface AccountSectionProps {
  onNavigate: (section: Section) => void
}

export function AccountSection({ onNavigate }: AccountSectionProps) {
  const { user, loading, logout } = useAuth()
  const [showAuth, setShowAuth] = useState(false)
  const [showAdminPackages, setShowAdminPackages] = useState(false)
  const [showAdminBookings, setShowAdminBookings] = useState(false)
  const [showAdminAvailability, setShowAdminAvailability] = useState(false)
  const [showAdminPhotos, setShowAdminPhotos] = useState(false)
  const [showMyPhotos, setShowMyPhotos] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [myBookings, setMyBookings] = useState<Array<{
    id: string
    bookingNumber: string
    status: string
    sessionDate: string
    sessionStart: string
    finalPrice: string | number
    package: { name: string }
    payments?: Array<{ status: string; method: string }>
  }>>([])
  const [loadingBookings, setLoadingBookings] = useState(false)

  async function loadMyBookings() {
    if (!user) return
    setLoadingBookings(true)
    try {
      const res = await fetch('/api/bookings/me?limit=5', { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load bookings')
      const list = data.data?.bookings ?? []
      setMyBookings(Array.isArray(list) ? list : [])
    } catch {
      setMyBookings([])
    } finally {
      setLoadingBookings(false)
    }
  }

  useEffect(() => {
    void loadMyBookings()
  }, [user])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gold animate-spin" />
      </div>
    )
  }

  // Not logged in — show login prompt
  if (!user) {
    return (
      <div className="min-h-screen pt-safe-top">
        <div className="px-6 pt-12 pb-4">
          <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-2">Account</p>
          <h1 className="font-serif text-3xl text-ivory">Sign In</h1>
        </div>

        <div className="px-6 py-8">
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto mb-6">
              <User className="w-8 h-8 text-foreground/30" />
            </div>
            <h2 className="font-serif text-xl text-ivory mb-2">Welcome to {studio.shortName}</h2>
            <p className="text-foreground/50 text-sm max-w-xs mx-auto mb-8">
              Sign in to book sessions, manage your appointments, and track your photo deliveries.
            </p>

            <button
              onClick={() => setShowAuth(true)}
              className="px-10 py-3.5 bg-gold text-[#0D0D0D] font-semibold text-sm rounded-full tracking-wide hover:bg-gold-light transition-all duration-300 touch-manipulation"
            >
              Sign In
            </button>

            <p className="text-foreground/30 text-xs mt-4">
              Don&apos;t have an account?{' '}
              <button onClick={() => setShowAuth(true)} className="text-gold hover:text-gold-light transition-colors">
                Create one
              </button>
            </p>
          </div>

          {/* Contact quick links */}
          <div className="mt-8 space-y-3">
            <p className="text-foreground/50 text-xs uppercase tracking-wider mb-3">Quick Contact</p>
            <a
              href={studio.telUrl}
              className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors touch-manipulation"
            >
              <Phone className="w-5 h-5 text-gold/60" />
              <span className="text-ivory text-sm">{studio.phoneDisplay}</span>
            </a>
            <a
              href={studio.mailtoUrl}
              className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors touch-manipulation"
            >
              <Mail className="w-5 h-5 text-gold/60" />
              <span className="text-ivory text-sm">{studio.email}</span>
            </a>
            <a
              href={studio.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 rounded-2xl border border-green-500/20 bg-green-500/[0.05] hover:bg-green-500/[0.08] transition-colors touch-manipulation"
            >
              <MessageCircle className="w-5 h-5 text-green-400" />
              <span className="text-ivory text-sm">Chat on WhatsApp</span>
            </a>
          </div>
        </div>

        <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
      </div>
    )
  }

  // Logged in — show profile
  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    setLoggingOut(false)
  }

  return (
    <div className="min-h-screen pt-safe-top">
      <div className="px-6 pt-12 pb-4">
        <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-2">Account</p>
        <h1 className="font-serif text-3xl text-ivory">My Profile</h1>
      </div>

      <div className="px-6 py-4">
        {/* User info */}
        <div className="flex items-center gap-4 p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] mb-6">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-900/40 to-stone-900 border border-gold/20 flex items-center justify-center shrink-0">
            <span className="font-serif text-xl text-gold">
              {user.name?.charAt(0)?.toUpperCase() || user.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-ivory font-medium truncate">{user.name || 'Customer'}</p>
            <p className="text-foreground/40 text-sm truncate">{user.email}</p>
            {user.role === 'ADMIN' && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-gold/10 text-gold text-[10px] uppercase tracking-wider rounded-full border border-gold/20">
                Admin
              </span>
            )}
          </div>
        </div>

        {/* Menu items */}
        <div className="space-y-2">
          {user.role === 'ADMIN' && (
            <button
              onClick={() => setShowAdminBookings(true)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-blue-500/25 bg-blue-500/[0.08] hover:bg-blue-500/[0.12] transition-colors touch-manipulation"
            >
              <CalendarDays className="w-5 h-5 text-blue-300" />
              <span className="text-ivory text-sm flex-1 text-left">Manage Bookings & Payments</span>
              <ChevronRight className="w-4 h-4 text-blue-200/70" />
            </button>
          )}

          {user.role === 'ADMIN' && (
            <button
              onClick={() => setShowAdminAvailability(true)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-amber-500/25 bg-amber-500/[0.08] hover:bg-amber-500/[0.12] transition-colors touch-manipulation"
            >
              <CalendarDays className="w-5 h-5 text-amber-300" />
              <span className="text-ivory text-sm flex-1 text-left">Manage Time Slots & Availability</span>
              <ChevronRight className="w-4 h-4 text-amber-200/70" />
            </button>
          )}

          {user.role === 'ADMIN' && (
            <button
              onClick={() => setShowAdminPackages(true)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-gold/25 bg-gold/[0.08] hover:bg-gold/[0.12] transition-colors touch-manipulation"
            >
              <CreditCard className="w-5 h-5 text-gold" />
              <span className="text-ivory text-sm flex-1 text-left">Manage Packages & Services</span>
              <ChevronRight className="w-4 h-4 text-gold/70" />
            </button>
          )}

          {user.role === 'ADMIN' && (
            <button
              onClick={() => setShowAdminPhotos(true)}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border border-purple-500/25 bg-purple-500/[0.08] hover:bg-purple-500/[0.12] transition-colors touch-manipulation"
            >
              <ImageIcon className="w-5 h-5 text-purple-300" />
              <span className="text-ivory text-sm flex-1 text-left">Photo Manager — Upload & Deliver</span>
              <ChevronRight className="w-4 h-4 text-purple-200/70" />
            </button>
          )}

          <button
            onClick={() => setShowMyPhotos(true)}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] hover:bg-emerald-500/[0.12] transition-colors touch-manipulation"
          >
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span className="text-ivory text-sm flex-1 text-left">My Photos</span>
            <ChevronRight className="w-4 h-4 text-emerald-300/70" />
          </button>

          <button
            onClick={() => onNavigate('book')}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors touch-manipulation"
          >
            <CalendarDays className="w-5 h-5 text-gold/60" />
            <span className="text-ivory text-sm flex-1 text-left">Book a Session</span>
            <ChevronRight className="w-4 h-4 text-foreground/20" />
          </button>

          <a
            href={studio.mailtoUrl}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors touch-manipulation"
          >
            <Mail className="w-5 h-5 text-gold/60" />
            <span className="text-ivory text-sm flex-1 text-left">Contact Us</span>
            <ChevronRight className="w-4 h-4 text-foreground/20" />
          </a>

          <a
            href={studio.telUrl}
            className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors touch-manipulation"
          >
            <Phone className="w-5 h-5 text-gold/60" />
            <span className="text-ivory text-sm flex-1 text-left">Call Studio</span>
            <ChevronRight className="w-4 h-4 text-foreground/20" />
          </a>

          <div className="flex items-center gap-4 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
            <MapPin className="w-5 h-5 text-gold/60" />
            <span className="text-foreground/50 text-sm flex-1 text-left">{studio.address}</span>
          </div>
        </div>

        <div className="mt-6 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-center justify-between mb-3">
            <p className="text-foreground/50 text-xs uppercase tracking-wider">Recent Bookings & Payments</p>
            <button
              onClick={loadMyBookings}
              className="text-gold text-xs hover:text-gold-light transition-colors"
            >
              Refresh
            </button>
          </div>

          {loadingBookings ? (
            <div className="py-4 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-gold animate-spin" />
            </div>
          ) : myBookings.length === 0 ? (
            <p className="text-foreground/40 text-sm">No bookings yet.</p>
          ) : (
            <div className="space-y-2">
              {myBookings.map((booking) => (
                <div key={booking.id} className="p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                  <p className="text-ivory text-sm font-medium">{booking.bookingNumber}</p>
                  <p className="text-foreground/40 text-xs mt-0.5">
                    {new Date(booking.sessionDate).toLocaleDateString()} • {booking.sessionStart} • {booking.package?.name}
                  </p>
                  <p className="text-foreground/40 text-xs mt-1">
                    Booking: {booking.status} • Payment: {booking.payments?.[0]?.status || 'NOT_STARTED'}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className={cn(
            'w-full flex items-center justify-center gap-2 mt-8 py-3.5 rounded-full border border-red-500/20 text-red-400 text-sm font-medium',
            'hover:bg-red-500/[0.05] transition-colors touch-manipulation',
            loggingOut && 'opacity-50 cursor-not-allowed'
          )}
        >
          {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
          Sign Out
        </button>
      </div>

      {user.role === 'ADMIN' && (
        <AdminPackagesManager
          open={showAdminPackages}
          onClose={() => setShowAdminPackages(false)}
        />
      )}

      {user.role === 'ADMIN' && (
        <AdminBookingsManager
          open={showAdminBookings}
          onClose={() => setShowAdminBookings(false)}
        />
      )}

      {user.role === 'ADMIN' && (
        <AdminAvailabilityPanel
          open={showAdminAvailability}
          onClose={() => setShowAdminAvailability(false)}
        />
      )}

      {user.role === 'ADMIN' && (
        <AdminPhotoManager
          open={showAdminPhotos}
          onClose={() => setShowAdminPhotos(false)}
        />
      )}

      <MyPhotosGallery
        open={showMyPhotos}
        onClose={() => setShowMyPhotos(false)}
      />
    </div>
  )
}
