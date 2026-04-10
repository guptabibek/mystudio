import { NextRequest } from 'next/server'
import { apiError, apiResponse, requireAdmin } from '@/lib/utils/api'
import { AvailabilityService } from '@/lib/services/availability.service'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)
    const { searchParams } = new URL(req.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const list = await AvailabilityService.getBlackoutDates(
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )

    return apiResponse(list)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return apiError('Admin access required', 403)
    }
    console.error('Get blackout dates error:', error)
    return apiError('Failed to fetch blackout dates', 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin(req)
    const body = await req.json()

    const startDate = new Date(body.startDate)
    const endDate = new Date(body.endDate)

    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      return apiError('Valid startDate and endDate are required', 400)
    }

    if (startDate > endDate) {
      return apiError('startDate must be before or equal to endDate', 400)
    }

    const blackout = await AvailabilityService.createBlackoutDate(
      {
        startDate,
        endDate,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        isRecurring: Boolean(body.isRecurring),
      },
      user.id
    )

    return apiResponse(blackout, 201)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return apiError('Admin access required', 403)
    }
    console.error('Create blackout date error:', error)
    return apiError('Failed to create blackout date', 500)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAdmin(req)
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return apiError('id is required', 400)
    }

    const blackout = await AvailabilityService.deleteBlackoutDate(id, user.id)
    return apiResponse(blackout)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return apiError('Admin access required', 403)
    }
    console.error('Delete blackout date error:', error)
    return apiError('Failed to delete blackout date', 500)
  }
}
