import { NextRequest } from 'next/server'
import { BookingStatus } from '@prisma/client'
import { apiError, apiResponse, requireAuth } from '@/lib/utils/api'
import { BookingService } from '@/lib/services/booking.service'

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const { searchParams } = new URL(req.url)

    const status = searchParams.get('status') as BookingStatus | null
    const page = parseInt(searchParams.get('page') || '1', 10)
    const limit = parseInt(searchParams.get('limit') || '10', 10)

    const result = await BookingService.getUserBookings(user.id, {
      status: status || undefined,
      page,
      limit,
    })

    return apiResponse(result)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    console.error('Get my bookings error:', error)
    return apiError('Failed to fetch your bookings', 500)
  }
}
