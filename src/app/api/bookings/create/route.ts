import { NextRequest } from 'next/server'
import { apiResponse, apiError, getAuthenticatedUser, requireAuth } from '@/lib/utils/api'
import { BookingService } from '@/lib/services/booking.service'
import { BookingStatus } from '@prisma/client'
import { db } from '@/lib/db'
import { slotLockService } from '@/lib/services/slot-lock'
import crypto from 'crypto'

// GET - Get user's bookings
export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user) {
      return apiError('Not authenticated', 401)
    }

    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status') as BookingStatus | null
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '10')

    const result = await BookingService.getUserBookings(user.id, {
      status: status || undefined,
      page,
      limit,
    })

    return apiResponse(result.bookings)
  } catch (error) {
    console.error('Get bookings error:', error)
    return apiError('Failed to fetch bookings', 500)
  }
}

// POST - Create a new booking
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    await BookingService.releaseExpiredPendingBookings()

    const body = await req.json()
    const {
      packageId,
      date,
      timeSlot,
      customerName,
      customerEmail,
      customerPhone,
      customerNotes,
    } = body

    if (!packageId || !date || !timeSlot) {
      return apiError('Package, date, and time slot are required', 400)
    }

    if (!customerName || !customerEmail) {
      return apiError('Customer name and email are required', 400)
    }

    const sessionDate = new Date(date)
    if (isNaN(sessionDate.getTime())) {
      return apiError('Invalid date', 400)
    }

    const pkg = await db.package.findUnique({
      where: { id: packageId },
      select: { duration: true },
    })

    if (!pkg) {
      return apiError('Package not found', 404)
    }

    // Calculate end time based on selected package duration.
    const [hours, minutes] = timeSlot.split(':').map(Number)
    const endTime = new Date(sessionDate)
    endTime.setHours(hours, minutes + pkg.duration)
    const sessionEnd = `${endTime.getHours().toString().padStart(2, '0')}:${endTime.getMinutes().toString().padStart(2, '0')}`

    const lockToken = crypto.randomUUID()
    const lockKey = slotLockService.buildKey({
      date: sessionDate.toISOString().split('T')[0],
      startTime: timeSlot,
      endTime: sessionEnd,
    })

    const acquired = await slotLockService.acquire(lockKey, lockToken, 20)
    if (!acquired) {
      return apiError('This time slot is being booked by someone else. Please retry in a moment.', 409)
    }

    let booking
    try {
      booking = await BookingService.createBooking({
        userId: user.id,
        packageId,
        sessionDate,
        sessionStart: timeSlot,
        sessionEnd,
        customerName,
        customerEmail,
        customerPhone,
        customerNotes,
      })
    } finally {
      await slotLockService.release(lockKey, lockToken)
    }

    return apiResponse({
      id: booking.id,
      bookingNumber: booking.bookingNumber,
      status: booking.status,
      sessionDate: booking.sessionDate,
      sessionStart: booking.sessionStart,
      finalPrice: booking.finalPrice,
    }, 201)
  } catch (error) {
    console.error('Create booking error:', error)
    if (error instanceof Error) {
      if (
        error.message.includes('no longer available') ||
        error.message.includes('being booked by someone else')
      ) {
        return apiError(error.message, 409)
      }
      return apiError(error.message, 400)
    }
    return apiError('Failed to create booking', 500)
  }
}
