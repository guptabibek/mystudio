import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { config } from '@/lib/config'
import { setAuthSessionCookie } from '@/lib/services/auth-session'

export async function GET(req: NextRequest) {
  const appUrl = config.NEXTAUTH_URL || new URL(req.url).origin
  const redirectBase = new URL('/', appUrl)

  const token = req.nextUrl.searchParams.get('token')
  if (!token) {
    redirectBase.searchParams.set('verified', '0')
    redirectBase.searchParams.set('reason', 'missing-token')
    return NextResponse.redirect(redirectBase)
  }

  const verificationToken = await db.verificationToken.findUnique({
    where: { token },
  })

  if (!verificationToken || !verificationToken.identifier.startsWith('email-verify:')) {
    redirectBase.searchParams.set('verified', '0')
    redirectBase.searchParams.set('reason', 'invalid-token')
    return NextResponse.redirect(redirectBase)
  }

  if (verificationToken.expires < new Date()) {
    await db.verificationToken.delete({ where: { token } }).catch(() => {})
    redirectBase.searchParams.set('verified', '0')
    redirectBase.searchParams.set('reason', 'expired-token')
    return NextResponse.redirect(redirectBase)
  }

  const userId = verificationToken.identifier.replace('email-verify:', '')
  const user = await db.user.findUnique({ where: { id: userId } })

  if (!user || !user.isActive) {
    redirectBase.searchParams.set('verified', '0')
    redirectBase.searchParams.set('reason', 'account-unavailable')
    return NextResponse.redirect(redirectBase)
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { emailVerified: new Date() },
    })

    await tx.verificationToken.deleteMany({
      where: { identifier: `email-verify:${user.id}` },
    })

    await tx.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        entityType: 'User',
        entityId: user.id,
        description: 'Email verified and session started',
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

  redirectBase.searchParams.set('verified', '1')
  redirectBase.searchParams.set('section', 'account')
  return NextResponse.redirect(redirectBase)
}
