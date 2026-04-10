'use client'

import { FormEvent, Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, LockKeyhole } from 'lucide-react'

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = useMemo(() => searchParams.get('token') || '', [searchParams])

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!token) {
      setError('Reset token is missing from the URL.')
      return
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Unable to reset password.')
        return
      }

      setSuccess('Password reset successful. Redirecting to your account...')
      setTimeout(() => {
        router.push('/account')
      }, 1000)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0D0D0D] text-ivory flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-[#111111] border border-white/[0.08] rounded-3xl p-6 sm:p-8">
        <div className="flex items-center justify-center mb-4">
          <LockKeyhole className="w-8 h-8 text-gold" />
        </div>
        <h1 className="font-serif text-3xl text-center text-ivory">Set New Password</h1>
        <p className="text-sm text-foreground/50 text-center mt-2 mb-6">
          Choose a strong password with at least 8 characters.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm text-center">
              {success}
            </div>
          )}

          <div>
            <label htmlFor="new-password" className="block text-xs uppercase tracking-wider text-foreground/50 mb-1.5">
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="confirm-password" className="block text-xs uppercase tracking-wider text-foreground/50 mb-1.5">
              Confirm Password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              required
              className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 rounded-full font-semibold text-sm bg-gold text-[#0D0D0D] hover:bg-gold-light disabled:bg-gold/40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Resetting...' : 'Reset Password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0D0D0D] text-ivory flex items-center justify-center px-6">
          <Loader2 className="w-5 h-5 animate-spin text-gold" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  )
}
