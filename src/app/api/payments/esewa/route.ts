/**
 * eSewa Payment API Route
 * Handles eSewa payment initialization
 */

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { esewaService } from '@/lib/services/payments/esewa'
import { db } from '@/lib/db'
import { requireAuth } from '@/lib/utils/api'
import { BookingService } from '@/lib/services/booking.service'

const initiateSchema = z.object({
  bookingId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)
    await BookingService.releaseExpiredPendingBookings()

    const body = await request.json()
    const { bookingId } = initiateSchema.parse(body)

    // Get booking details
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
    })

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    if (booking.userId !== user.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 403 }
      )
    }

    // Check if eSewa is configured
    if (!esewaService.isConfigured()) {
      const cfg = esewaService.getConfigurationStatus()
      return NextResponse.json(
        {
          success: false,
          error: `eSewa payment is not available. Missing: ${cfg.missing.join(', ')}`,
          details: cfg,
        },
        { status: 400 }
      )
    }

    // Check for existing completed payment
    const existingPayment = await db.payment.findFirst({
      where: {
        bookingId: booking.id,
        status: 'COMPLETED',
      },
    })

    if (existingPayment) {
      return NextResponse.json(
        { success: false, error: 'Booking already paid' },
        { status: 400 }
      )
    }

    const bookingAmount = Number(booking.finalPrice)

    // Create or get pending payment
    let payment = await db.payment.findFirst({
      where: {
        bookingId: booking.id,
        method: 'ESEWA',
        status: 'PENDING',
      },
    })

    if (!payment) {
      payment = await db.payment.create({
        data: {
          bookingId: booking.id,
          userId: user.id,
          amount: bookingAmount,
          currency: booking.currency,
          method: 'ESEWA',
          status: 'PENDING',
        },
      })
    }

    // Create eSewa payment request
    const paymentRequest = await esewaService.createPaymentRequest({
      bookingId: booking.id,
      amount: bookingAmount,
    })

    // Return HTML form for redirect
    const html = esewaService.generatePaymentFormHtml(
      paymentRequest.formData,
      paymentRequest.paymentUrl
    )

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html',
      },
    })
  } catch (error) {
    console.error('eSewa payment error:', error)
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: error.issues[0]?.message },
        { status: 400 }
      )
    }
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Failed to initiate payment' },
      { status: 500 }
    )
  }
}
