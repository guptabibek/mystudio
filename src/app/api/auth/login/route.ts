import { NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/utils/api'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { setAuthSessionCookie } from '@/lib/services/auth-session'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return apiError('Email and password are required', 400)
    }

    // Find user
    const user = await db.user.findUnique({
      where: { email: email.toLowerCase() },
    })

    if (!user || !user.passwordHash) {
      return apiError('Invalid credentials', 401)
    }

    if (!user.isActive) {
      return apiError('Account is deactivated', 403)
    }

    if (!user.emailVerified) {
      return apiError('Please verify your email before signing in', 403)
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash)
    if (!isValid) {
      return apiError('Invalid credentials', 401)
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        entityType: 'User',
        entityId: user.id,
        description: 'User logged in successfully',
      },
    })

    await setAuthSessionCookie({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    })

    return apiResponse({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        avatar: user.avatar,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return apiError('Login failed', 500)
  }
}
