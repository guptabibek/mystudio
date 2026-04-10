import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { apiResponse, apiError } from '@/lib/utils/api'
import { setAuthSessionCookie } from '@/lib/services/auth-session'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const token = String(body?.token || '').trim()
  const password = String(body?.password || '')

  if (!token || !password) {
    return apiError('Token and password are required', 400)
  }

  if (password.length < 8) {
    return apiError('Password must be at least 8 characters', 400)
  }

  const verificationToken = await db.verificationToken.findUnique({
    where: { token },
  })

  if (!verificationToken || !verificationToken.identifier.startsWith('password-reset:')) {
    return apiError('Invalid or expired reset token', 400)
  }

  if (verificationToken.expires < new Date()) {
    await db.verificationToken.delete({ where: { token } }).catch(() => {})
    return apiError('Invalid or expired reset token', 400)
  }

  const userId = verificationToken.identifier.replace('password-reset:', '')
  const user = await db.user.findUnique({ where: { id: userId } })

  if (!user || !user.isActive) {
    return apiError('Account not available', 400)
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    await tx.verificationToken.deleteMany({
      where: { identifier: `password-reset:${user.id}` },
    })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_PASSWORD_CHANGE',
        entityType: 'User',
        entityId: user.id,
        description: 'Password reset completed',
      },
    })
  })

  await setAuthSessionCookie({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatar: user.avatar,
  })

  return apiResponse({
    ok: true,
    message: 'Password reset successful',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    },
  })
}
