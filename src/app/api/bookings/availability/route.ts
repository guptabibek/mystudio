import { NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/utils/api'
import { AvailabilityService } from '@/lib/services/availability.service'
import { PackageService } from '@/lib/services/package.service'
import { BookingService } from '@/lib/services/booking.service'
import { getOrSetCache } from '@/lib/cache'

const EXPIRED_BOOKING_SWEEP_INTERVAL_MS = 60_000
let lastExpiredSweepAt = 0
let expiredSweepInFlight: Promise<void> | null = null

function triggerExpiredBookingSweep() {
  const now = Date.now()
  if (now - lastExpiredSweepAt < EXPIRED_BOOKING_SWEEP_INTERVAL_MS) {
    return
  }

  if (expiredSweepInFlight) {
    return
  }

  lastExpiredSweepAt = now
  expiredSweepInFlight = BookingService.releaseExpiredPendingBookings()
    .catch((error) => {
      console.error('Expired booking sweep failed:', error)
    })
    .finally(() => {
      expiredSweepInFlight = null
    })
}

export async function GET(req: NextRequest) {
  try {
    triggerExpiredBookingSweep()
    const { searchParams } = new URL(req.url)
    const startDateStr = searchParams.get('startDate')
    const endDateStr = searchParams.get('endDate')
    const packageId = searchParams.get('packageId')

    if (!startDateStr || !endDateStr) {
      return apiError('startDate and endDate are required', 400)
    }

    const startDate = new Date(startDateStr)
    const endDate = new Date(endDateStr)

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return apiError('Invalid date format', 400)
    }

    let packageDuration: number | undefined
    let packageCategoryId: string | undefined
    if (packageId) {
      const packageMeta = await PackageService.getPackageDurationAndCategory(packageId)
      if (!packageMeta) {
        return apiError('Package not found', 404)
      }
      packageDuration = packageMeta.duration
      packageCategoryId = packageMeta.categoryId || undefined
    }

    const cacheKey = [
      'availability:v1',
      startDate.toISOString().slice(0, 10),
      endDate.toISOString().slice(0, 10),
      packageId || 'none',
      packageDuration || 'default',
      packageCategoryId || 'none',
    ].join(':')

    const result = await getOrSetCache(cacheKey, 30, async () => {
      const availability = await AvailabilityService.getAvailableSlots(startDate, endDate, {
        duration: packageDuration,
        categoryId: packageCategoryId,
      })

      return availability.map((day) => ({
        date: day.date.toISOString().split('T')[0],
        dayOfWeek: day.date.getDay(),
        isBlackout: false,
        slots: day.slots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
          available: slot.available,
          isAvailable: slot.available,
        })),
      }))
    })

    const response = apiResponse(result)
    response.headers.set('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=60')
    return response
  } catch (error) {
    console.error('Availability fetch error:', error)
    return apiError('Failed to fetch availability', 500)
  }
}
