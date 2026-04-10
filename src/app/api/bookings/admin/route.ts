import { NextRequest } from 'next/server'
import { apiResponse, apiError, getAuthenticatedUser } from '@/lib/utils/api'
import { BookingService } from '@/lib/services/booking.service'
import { BookingStatus } from '@prisma/client'

// GET - Get all bookings (admin)
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user || user.role !== 'ADMIN') {
      return apiError('Admin access required', 403)
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') as BookingStatus | null
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || undefined

    const result = await BookingService.getAllBookings({
      status: status || undefined,
      page,
      limit,
      search,
    })

    return apiResponse(result)
  } catch (error) {
    console.error('Get admin bookings error:', error)
    return apiError('Failed to fetch bookings', 500)
  }
}

// PATCH - Update booking status (admin)
export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user || user.role !== 'ADMIN') {
      return apiError('Admin access required', 403)
    }

    const body = await req.json()
    const { bookingId, status } = body

    if (!bookingId || !status) {
      return apiError('Booking ID and status are required', 400)
    }

    const validStatuses = ['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']
    if (!validStatuses.includes(status)) {
      return apiError('Invalid status', 400)
    }

    const booking = await BookingService.updateBookingStatus(
      bookingId,
      status as BookingStatus,
      user.id
    )

    return apiResponse({
      id: booking.id,
      status: booking.status,
    })
  } catch (error) {
    console.error('Update booking error:', error)
    if (error instanceof Error) {
      return apiError(error.message, 400)
    }
    return apiError('Failed to update booking', 500)
  }
}
