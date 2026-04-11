import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { config } from '@/lib/config'
import { getAuthSessionCookieName, useSecureAuthSessionCookie } from '@/lib/services/auth-session'

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  pagination?: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export function apiResponse<T>(data: T, status = 200): NextResponse<ApiResponse<T>> {
  return NextResponse.json({ success: true, data }, { status })
}

export function apiError(message: string, status = 400): NextResponse<ApiResponse> {
  return NextResponse.json({ success: false, error: message }, { status })
}

export function paginatedResponse<T>(
  data: T[],
  page: number,
  limit: number,
  total: number
): NextResponse<ApiResponse<T[]>> {
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  })
}

export async function getAuthenticatedUser(req: NextRequest) {
  const token = await getToken({
    req,
    secret: config.NEXTAUTH_SECRET,
    secureCookie: useSecureAuthSessionCookie(),
    cookieName: getAuthSessionCookieName(),
  })

  if (!token) {
    return null
  }

  return {
    id: token.id as string,
    email: token.email as string,
    name: token.name as string,
    role: token.role as 'CUSTOMER' | 'ADMIN',
    avatar: token.avatar as string | null,
  }
}

export async function requireAuth(req: NextRequest) {
  const user = await getAuthenticatedUser(req)

  if (!user) {
    throw new Error('Unauthorized')
  }

  return user
}

export async function requireAdmin(req: NextRequest) {
  const user = await requireAuth(req)

  if (user.role !== 'ADMIN') {
    throw new Error('Admin access required')
  }

  return user
}

export function withErrorHandler(
  handler: (req: NextRequest, context?: unknown) => Promise<NextResponse>
) {
  return async (req: NextRequest, context?: unknown) => {
    try {
      return await handler(req, context)
    } catch (error) {
      console.error('API Error:', error)

      if (error instanceof Error) {
        if (error.message === 'Unauthorized') {
          return apiError('Unauthorized', 401)
        }
        if (error.message === 'Admin access required') {
          return apiError('Admin access required', 403)
        }
        return apiError(error.message, 400)
      }

      return apiError('Internal server error', 500)
    }
  }
}

export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  return 'unknown'
}

export function getUserAgent(req: NextRequest): string {
  return req.headers.get('user-agent') || 'unknown'
}

// Rate limiting helper (simple in-memory implementation)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const record = rateLimitStore.get(key)

  if (!record || now > record.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs }
  }

  if (record.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: record.resetAt }
  }

  record.count++
  return { allowed: true, remaining: maxRequests - record.count, resetAt: record.resetAt }
}
