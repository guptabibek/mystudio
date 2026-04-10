import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { UserRole } from '@prisma/client'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string | null
      role: UserRole
      avatar: string | null
    }
  }
  interface User {
    id: string
    email: string
    name: string | null
    role: UserRole
    avatar: string | null
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    email: string
    name: string | null
    role: UserRole
    avatar: string | null
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Invalid credentials')
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.passwordHash) {
          throw new Error('Invalid credentials')
        }

        if (!user.isActive) {
          throw new Error('Account is deactivated')
        }

        if (!user.emailVerified) {
          throw new Error('Please verify your email before signing in')
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)

        if (!isValid) {
          throw new Error('Invalid credentials')
        }

        // Update last login
        await db.user.update({
          where: { id: user.id },
          data: { updatedAt: new Date() },
        })

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

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
        token.role = user.role
        token.avatar = user.avatar
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user = {
          id: token.id,
          email: token.email,
          name: token.name,
          role: token.role,
          avatar: token.avatar,
        }
      }
      return session
    },
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/error',
  },
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  secret: process.env.NEXTAUTH_SECRET,
}
