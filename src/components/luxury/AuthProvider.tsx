'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

export interface AuthUser {
  id: string
  email: string
  name: string | null
  role: string
  avatar: string | null
}

interface AuthResult {
  ok: boolean
  error?: string
  message?: string
  requiresVerification?: boolean
}

interface AuthContextValue {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthResult>
  register: (data: { email: string; password: string; name: string; phone?: string }) => Promise<AuthResult>
  forgotPassword: (email: string) => Promise<AuthResult>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      if (res.ok) {
        const data = await res.json()
        setUser(data.data ?? data.user ?? null)
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'Login failed' }
      setUser(data.data?.user ?? data.user ?? null)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Network error' }
    }
  }, [])

  const register = useCallback(async (info: { email: string; password: string; name: string; phone?: string }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(info),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'Registration failed' }
      return {
        ok: true,
        requiresVerification: true,
        message: data.data?.message || data.message || 'Account created. Please verify your email.',
      }
    } catch {
      return { ok: false, error: 'Network error' }
    }
  }, [])

  const forgotPassword = useCallback(async (email: string) => {
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (!res.ok) return { ok: false, error: data.error || 'Unable to process request' }
      return { ok: true, message: data.data?.message || data.message || 'If the account exists, reset email has been sent.' }
    } catch {
      return { ok: false, error: 'Network error' }
    }
  }, [])

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, login, register, forgotPassword, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  )
}
