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

export function useSecureAuthSessionCookie() {
  return config.NODE_ENV === 'production'
}

export function getAuthSessionCookieName() {
  return useSecureAuthSessionCookie()
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token'
}

export async function setAuthSessionCookie(user: SessionUser) {
  const sessionCookieName = getAuthSessionCookieName()

  const token = await encode({
    secret: config.NEXTAUTH_SECRET,
    maxAge: 7 * 24 * 60 * 60,
    salt: sessionCookieName,
    token: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    },
  })

  const cookieStore = await cookies()

  cookieStore.set(sessionCookieName, token, {
    httpOnly: true,
    secure: useSecureAuthSessionCookie(),
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/',
  })
}
