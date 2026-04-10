import { NextRequest } from 'next/server'
import { apiResponse, apiError, requireAdmin, withErrorHandler } from '@/lib/utils/api'
import { AvailabilityService } from '@/lib/services/availability.service'

async function GET(req: NextRequest) {
  await requireAdmin(req)
  const rules = await AvailabilityService.getAvailabilityRules()
  return apiResponse(rules)
}

async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  const body = await req.json()

  const { dayOfWeek, startTime, endTime, slotDuration, bufferTime } = body

  if (!dayOfWeek || !startTime || !endTime) {
    return apiError('dayOfWeek, startTime, and endTime are required')
  }

  const rule = await AvailabilityService.createAvailabilityRule(
    { dayOfWeek, startTime, endTime, slotDuration, bufferTime },
    user.id
  )

  return apiResponse(rule, 201)
}

async function PATCH(req: NextRequest) {
  const user = await requireAdmin(req)
  const body = await req.json()
  const { id, dayOfWeek, startTime, endTime, slotDuration, bufferTime } = body

  if (!id) {
    return apiError('id is required')
  }

  const rule = await AvailabilityService.updateAvailabilityRule(
    id,
    { dayOfWeek, startTime, endTime, slotDuration, bufferTime },
    user.id
  )

  return apiResponse(rule)
}

async function DELETE(req: NextRequest) {
  const user = await requireAdmin(req)
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return apiError('id is required')
  }

  const rule = await AvailabilityService.deleteAvailabilityRule(id, user.id)
  return apiResponse(rule)
}

export const GET_HANDLER = withErrorHandler(GET)
export const POST_HANDLER = withErrorHandler(POST)
export const PATCH_HANDLER = withErrorHandler(PATCH)
export const DELETE_HANDLER = withErrorHandler(DELETE)
export { GET_HANDLER as GET, POST_HANDLER as POST, PATCH_HANDLER as PATCH, DELETE_HANDLER as DELETE }
