import { NextRequest } from 'next/server'
import { apiResponse, apiError, getAuthenticatedUser } from '@/lib/utils/api'

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    
    if (!user) {
      return apiError('Not authenticated', 401)
    }

    return apiResponse({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      avatar: user.avatar,
    })
  } catch (error) {
    console.error('Auth check error:', error)
    return apiError('Authentication failed', 401)
  }
}
