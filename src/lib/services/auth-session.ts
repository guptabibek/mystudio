import { cookies } from 'next/headers'
import { encode } from 'next-auth/jwt'
import { config } from '@/lib/config'
import { UserRole } from '@prisma/client'

interface SessionUser {
  id: string
  email: string
  name: string | null
  role: UserRole
  avatar: string | null
}

export async function setAuthSessionCookie(user: SessionUser) {
  const token = await encode({
    secret: config.NEXTAUTH_SECRET,
    maxAge: 7 * 24 * 60 * 60,
    token: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    },
  })

  const cookieStore = await cookies()
  const sessionCookieName =
    config.NODE_ENV === 'production'
      ? '__Secure-next-auth.session-token'
      : 'next-auth.session-token'

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: config.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
}
