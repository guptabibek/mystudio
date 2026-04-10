'use client'

import { useState } from 'react'
import { X, Eye, EyeOff, Loader2, Camera } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from './AuthProvider'
import { studio } from '@/lib/config/studio'

type Mode = 'login' | 'register' | 'forgot'

interface AuthModalProps {
  open: boolean
  onClose: () => void
  initialMode?: Mode
}

export function AuthModal({ open, onClose, initialMode = 'login' }: AuthModalProps) {
  const { login, register, forgotPassword } = useAuth()
  const [mode, setMode] = useState<Mode>(initialMode)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)

    const result =
      mode === 'login'
        ? await login(form.email, form.password)
        : mode === 'register'
          ? await register({ email: form.email, password: form.password, name: form.name, phone: form.phone || undefined })
          : await forgotPassword(form.email)

    setLoading(false)
    if (result.ok) {
      if (mode === 'login') {
        onClose()
        setForm({ email: '', password: '', name: '', phone: '' })
      } else if (mode === 'register') {
        setNotice(result.message || 'Account created. Check your email and click the verification link to sign in.')
        setMode('login')
        setForm((prev) => ({ ...prev, password: '', phone: '' }))
      } else {
        setNotice(result.message || 'If this email exists, a reset link has been sent.')
        setMode('login')
      }
    } else {
      setError(result.error || 'Something went wrong')
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-md mx-auto bg-[#111111] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl overflow-hidden animate-fade-in-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="relative px-6 pt-8 pb-4

">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-foreground/40 hover:text-foreground transition-colors touch-manipulation"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="w-px h-6 bg-gold/30" />
            <Camera className="w-4 h-4 text-gold/70" strokeWidth={1.5} />
            <div className="w-px h-6 bg-gold/30" />
          </div>

          <h2 className="font-serif text-2xl text-ivory text-center">
            {mode === 'login' ? 'Welcome Back' : mode === 'register' ? 'Create Account' : 'Reset Password'}
          </h2>
          <p className="text-foreground/40 text-sm text-center mt-1">
            {mode === 'login'
              ? 'Sign in to manage your bookings'
              : mode === 'register'
                ? `Join ${studio.shortName} to start booking sessions`
                : 'Enter your account email and we will send reset instructions'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 pb-8 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {notice && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm text-center">
              {notice}
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label htmlFor="auth-name" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Full Name</label>
                <input
                  id="auth-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Your name"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label htmlFor="auth-phone" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Phone <span className="text-foreground/20">(optional)</span></label>
                <input
                  id="auth-phone"
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors"
                />
              </div>
            </>
          )}

          <div>
            <label htmlFor="auth-email" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Email</label>
            <input
              id="auth-email"
              type="email"
              required
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              placeholder="your@email.com"
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors"
              autoComplete={mode === 'login' ? 'email' : 'off'}
            />
          </div>

          {mode !== 'forgot' && (
            <div>
              <label htmlFor="auth-password" className="block text-foreground/50 text-xs uppercase tracking-wider mb-1.5">Password</label>
              <div className="relative">
                <input
                  id="auth-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder={mode === 'register' ? 'Min 8 characters' : '••••••••'}
                  className="w-full px-4 py-3 pr-12 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-foreground/30 hover:text-foreground/60 transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'login' && (
            <div className="text-right">
              <button
                type="button"
                onClick={() => {
                  setMode('forgot')
                  setError('')
                  setNotice('')
                }}
                className="text-xs text-gold hover:text-gold-light transition-colors"
              >
                Forgot password?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={cn(
              'w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300 touch-manipulation',
              'flex items-center justify-center gap-2',
              loading
                ? 'bg-gold/50 text-[#0D0D0D]/50 cursor-not-allowed'
                : 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
            )}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'login' ? 'Sign In' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
          </button>

          {/* Toggle mode */}
          {mode !== 'forgot' ? (
            <p className="text-center text-foreground/40 text-sm pt-2">
              {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  setError('')
                  setNotice('')
                }}
                className="text-gold hover:text-gold-light transition-colors font-medium"
              >
                {mode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </p>
          ) : (
            <p className="text-center text-foreground/40 text-sm pt-2">
              Remembered your password?{' '}
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError('')
                }}
                className="text-gold hover:text-gold-light transition-colors font-medium"
              >
                Back to Sign In
              </button>
            </p>
          )}
        </form>
      </div>
    </div>
  )
}
