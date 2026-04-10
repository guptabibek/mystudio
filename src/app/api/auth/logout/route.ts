import { NextRequest } from 'next/server'
import { apiResponse } from '@/lib/utils/api'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    cookieStore.delete('next-auth.session-token')
    cookieStore.delete('__Secure-next-auth.session-token')
    
    return apiResponse({ message: 'Logged out successfully' })
  } catch (error) {
    console.error('Logout error:', error)
    return apiResponse({ message: 'Logged out' })
  }
}
