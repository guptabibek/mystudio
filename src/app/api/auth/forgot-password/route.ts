import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { apiResponse } from '@/lib/utils/api'
import { config, isProduction } from '@/lib/config'
import { emailService } from '@/lib/services/email'

export async function POST(req: NextRequest) {
  const body = await req.json()
  const email = String(body?.email || '').trim().toLowerCase()

  // Always return a neutral response to prevent account enumeration.
  const genericResponse = {
    ok: true,
    message: 'If this email exists, a reset link has been sent.',
  }

  if (!email) {
    return apiResponse(genericResponse)
  }

  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.passwordHash || !user.isActive) {
    return apiResponse(genericResponse)
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 60 * 60 * 1000)

  await db.verificationToken.deleteMany({
    where: { identifier: `password-reset:${user.id}` },
  })

  await db.verificationToken.create({
    data: {
      identifier: `password-reset:${user.id}`,
      token,
      expires,
    },
  })

  const appUrl = config.NEXTAUTH_URL || new URL(req.url).origin
  const resetUrl = `${appUrl}/reset-password?token=${encodeURIComponent(token)}`

  await emailService.send({
    to: user.email,
    subject: 'Reset Your Password',
    template: 'password-reset',
    data: {
      customerName: user.name || 'there',
      resetUrl,
      expiresIn: '1 hour',
    },
  })

  return apiResponse(
    {
      ...genericResponse,
      ...(isProduction ? {} : { devResetUrl: resetUrl }),
    }
  )
}
