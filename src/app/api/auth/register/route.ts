import { NextRequest } from 'next/server'
import crypto from 'crypto'
import { UserService } from '@/lib/services/user.service'
import { apiResponse, apiError, withErrorHandler } from '@/lib/utils/api'
import { db } from '@/lib/db'
import { config, isProduction } from '@/lib/config'
import { emailService } from '@/lib/services/email'

async function POST(req: NextRequest) {
  const body = await req.json()
  const { email, password, name, phone } = body
  const normalizedEmail = String(email || '').trim().toLowerCase()

  if (!normalizedEmail || !password) {
    return apiError('Email and password are required')
  }

  if (password.length < 8) {
    return apiError('Password must be at least 8 characters')
  }

  const user = await UserService.createUser({
    email: normalizedEmail,
    password,
    name,
    phone,
  })

  const token = crypto.randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await db.verificationToken.deleteMany({
    where: { identifier: `email-verify:${user.id}` },
  })

  await db.verificationToken.create({
    data: {
      identifier: `email-verify:${user.id}`,
      token,
      expires,
    },
  })

  const appUrl = config.NEXTAUTH_URL || new URL(req.url).origin
  const verifyUrl = `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`

  await emailService.send({
    to: user.email,
    subject: 'Verify your email address',
    template: 'email-verify',
    data: {
      customerName: user.name || 'there',
      verifyUrl,
      expiresIn: '24 hours',
    },
  })

  return apiResponse(
    {
      ok: true,
      requiresVerification: true,
      message: 'Account created. Please verify your email before signing in.',
      ...(isProduction ? {} : { devVerificationUrl: verifyUrl }),
    },
    201
  )
}

export const POST_HANDLER = withErrorHandler(POST)
export { POST_HANDLER as POST }
