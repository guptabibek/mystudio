import { NextRequest } from 'next/server'
import { apiResponse, apiError, requireAuth } from '@/lib/utils/api'
import Stripe from 'stripe'
import { config, features } from '@/lib/config'
import { db } from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import { BookingService } from '@/lib/services/booking.service'

// Lazy Stripe initialization
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    if (!config.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured')
    _stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
  }
  return _stripe
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    await BookingService.releaseExpiredPendingBookings()

    if (!features.stripeEnabled) {
      return apiError('Stripe payments are not configured', 503)
    }

    const body = await req.json()
    const { bookingId } = body

    if (!bookingId) {
      return apiError('Booking ID is required', 400)
    }

    // Get booking
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
      include: { package: true },
    })

    if (!booking) {
      return apiError('Booking not found', 404)
    }

    if (booking.userId !== user.id) {
      return apiError('Unauthorized', 403)
    }

    // Check if already paid
    const existingPayment = await db.payment.findFirst({
      where: {
        bookingId,
        status: 'COMPLETED',
      },
    })

    if (existingPayment) {
      return apiError('Booking is already paid', 400)
    }

    const bookingAmount = Number(booking.finalPrice)

    // Create Payment Intent
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(bookingAmount * 100), // Convert to cents
      currency: booking.currency.toLowerCase(),
      metadata: {
        bookingId: booking.id,
        bookingNumber: booking.bookingNumber,
        userId: user.id,
        customerEmail: booking.customerEmail,
      },
      automatic_payment_methods: {
        enabled: true,
      },
      receipt_email: booking.customerEmail,
    })

    // Create payment record
    const transactionId = `PI-${uuidv4().substring(0, 8).toUpperCase()}`
    const payment = await db.payment.create({
      data: {
        bookingId: booking.id,
        userId: user.id,
        amount: bookingAmount,
        currency: booking.currency,
        method: 'STRIPE',
        status: 'PENDING',
        transactionId,
        stripePaymentIntent: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'PAYMENT_INITIATED',
        entityType: 'Payment',
        entityId: payment.id,
        description: `Stripe payment initiated for booking ${booking.bookingNumber}`,
        newValues: JSON.stringify({
          amount: bookingAmount,
          currency: booking.currency,
          paymentIntentId: paymentIntent.id,
        }),
      },
    })

    return apiResponse({
      clientSecret: paymentIntent.client_secret,
      paymentId: payment.id,
      amount: bookingAmount,
      currency: booking.currency,
    })
  } catch (error) {
    console.error('Stripe payment error:', error)
    if (error instanceof Error) {
      return apiError(error.message, 400)
    }
    return apiError('Failed to create payment', 500)
  }
}
