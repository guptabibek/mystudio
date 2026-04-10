/**
 * eSewa Payment Status Check API
 * Allows customer/admin to sync pending eSewa payments with gateway status API.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { esewaService } from '@/lib/services/payments/esewa'
import { apiError, apiResponse, requireAuth } from '@/lib/utils/api'

const bodySchema = z
  .object({
    bookingId: z.string().min(1).optional(),
    paymentId: z.string().min(1).optional(),
  })
  .refine((value) => !!value.bookingId || !!value.paymentId, {
    message: 'bookingId or paymentId is required',
  })

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    const body = bodySchema.parse(await request.json())

    let payment = null as Awaited<ReturnType<typeof db.payment.findFirst>>

    if (body.paymentId) {
      payment = await db.payment.findUnique({
        where: { id: body.paymentId },
        include: { booking: true },
      })
    } else if (body.bookingId) {
      payment = await db.payment.findFirst({
        where: { bookingId: body.bookingId, method: 'ESEWA' },
        include: { booking: true },
        orderBy: { createdAt: 'desc' },
      })
    }

    if (!payment) {
      return apiError('eSewa payment not found', 404)
    }

    const isOwner = payment.userId === user.id
    const isAdmin = user.role === 'ADMIN'
    if (!isOwner && !isAdmin) {
      return apiError('Forbidden', 403)
    }

    const result = await esewaService.syncPaymentStatus(payment.id)
    if (!result.success) {
      return apiError(result.error || 'Failed to sync eSewa status', 400)
    }

    return apiResponse({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      status: result.status,
      paymentStatus: result.paymentStatus,
      gateway: result.rawResponse,
    })
  } catch (error) {
    console.error('eSewa status sync error:', error)
    if (error instanceof z.ZodError) {
      return apiError(error.issues[0]?.message || 'Invalid request payload', 400)
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    return apiError('Failed to sync eSewa payment status', 500)
  }
}
