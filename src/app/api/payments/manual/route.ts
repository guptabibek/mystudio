import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { apiError, apiResponse, requireAuth } from '@/lib/utils/api'
import { BookingService } from '@/lib/services/booking.service'

const schema = z.object({
  bookingId: z.string().min(1),
  method: z.enum(['bank', 'cash']),
  bankName: z.string().optional(),
  bankAccountNumber: z.string().optional(),
  bankReferenceNumber: z.string().optional(),
  paymentProofUrl: z.string().url().optional(),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    await BookingService.releaseExpiredPendingBookings()

    const input = schema.parse(await req.json())

    const booking = await db.booking.findUnique({ where: { id: input.bookingId } })
    if (!booking) return apiError('Booking not found', 404)
    if (booking.userId !== user.id) return apiError('Unauthorized', 403)

    const completed = await db.payment.findFirst({
      where: {
        bookingId: booking.id,
        status: 'COMPLETED',
      },
    })
    if (completed) return apiError('Booking already paid', 400)

    if (input.method === 'bank') {
      if (!input.paymentProofUrl || !input.bankName || !input.bankReferenceNumber) {
        return apiError('Bank transfer requires bankName, bankReferenceNumber, and paymentProofUrl', 400)
      }
    }

    const transactionId = `${input.method.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`

    const payment = await db.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          bookingId: booking.id,
          userId: user.id,
          amount: Number(booking.finalPrice),
          currency: booking.currency,
          method: 'BANK_TRANSFER',
          status: 'PROCESSING',
          transactionId,
          bankName: input.method === 'cash' ? 'CASH' : input.bankName,
          bankAccountNumber: input.bankAccountNumber,
          bankReferenceNumber:
            input.method === 'cash'
              ? `CASH-${booking.bookingNumber}`
              : input.bankReferenceNumber,
          paymentProofUrl: input.paymentProofUrl,
          adminNotes: input.notes,
        },
      })

      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: 'CONFIRMED',
          confirmedAt: booking.confirmedAt || new Date(),
        },
      })

      await tx.timeSlot.updateMany({
        where: { id: booking.timeSlotId || '' },
        data: {
          isAvailable: false,
          isLocked: false,
          lockedUntil: null,
          lockedBy: null,
        },
      })

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: 'PAYMENT_INITIATED',
          entityType: 'Payment',
          entityId: created.id,
          description:
            input.method === 'cash'
              ? `Cash payment selected for booking ${booking.bookingNumber}`
              : `Bank transfer submitted for booking ${booking.bookingNumber}`,
        },
      })

      return created
    })

    return apiResponse({
      paymentId: payment.id,
      status: payment.status,
      method: input.method,
      bookingId: booking.id,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return apiError(error.issues[0]?.message || 'Invalid payload', 400)
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    console.error('Manual payment error:', error)
    return apiError('Failed to submit manual payment', 500)
  }
}
