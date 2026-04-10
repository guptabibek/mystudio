import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { config } from '@/lib/config'
import { db } from '@/lib/db'
import { WebhookLock } from '@/lib/services/webhook-security'

// Lazy Stripe initialization
let _stripe: Stripe | null = null
function getStripeInstance(): Stripe {
  if (!_stripe) {
    if (!config.STRIPE_SECRET_KEY) throw new Error('Stripe is not configured')
    _stripe = new Stripe(config.STRIPE_SECRET_KEY, { apiVersion: '2024-11-20.acacia' })
  }
  return _stripe
}

const webhookSecret = config.STRIPE_WEBHOOK_SECRET

export async function POST(req: NextRequest) {
  let locked = false
  let eventId = ''
  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature || !webhookSecret) {
      console.error('Missing Stripe signature or webhook secret')
      return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 })
    }

    // Verify webhook signature
    let event: Stripe.Event
    try {
      event = getStripeInstance().webhooks.constructEvent(body, signature, webhookSecret)
    } catch (err) {
      console.error('Webhook signature verification failed:', err)
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    eventId = event.id
    locked = await WebhookLock.acquire(eventId)
    if (!locked) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    const idempotencyKey = `stripe:webhook:${eventId}`
    const existing = await db.rateLimitEntry.findUnique({
      where: { key: idempotencyKey },
    })

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true })
    }

    await db.rateLimitEntry.create({
      data: {
        key: idempotencyKey,
        count: 1,
        resetAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    })

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        await handlePaymentSuccess(paymentIntent)
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        await handlePaymentFailure(paymentIntent)
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        if (charge.payment_intent) {
          await handleRefund(charge.payment_intent as string)
        }
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        if (dispute.payment_intent) {
          await handleDispute(dispute.payment_intent as string, dispute)
        }
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  } finally {
    if (locked && eventId) {
      WebhookLock.release(eventId)
    }
  }
}

async function handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
  const { bookingId, userId } = paymentIntent.metadata

  if (!bookingId) {
    console.error('No bookingId in paymentIntent metadata')
    return
  }

  // Find payment by stripe payment intent id
  const payment = await db.payment.findFirst({
    where: { stripePaymentIntent: paymentIntent.id },
  })

  if (!payment) {
    console.error('Payment not found for payment intent:', paymentIntent.id)
    return
  }

  // Update payment and booking in transaction
  await db.$transaction(async (tx) => {
    // Update payment status
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'COMPLETED',
        gatewayReference: paymentIntent.id,
        webhookReceived: true,
        webhookData: JSON.stringify(paymentIntent),
        webhookProcessedAt: new Date(),
      },
    })

    // Update booking status
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED',
        confirmedAt: new Date(),
      },
    })

    // Create audit log
    await tx.auditLog.create({
      data: {
        userId: userId || undefined,
        action: 'PAYMENT_COMPLETED',
        entityType: 'Payment',
        entityId: payment.id,
        description: `Stripe payment completed: ${paymentIntent.id}`,
        newValues: JSON.stringify({
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
        }),
      },
    })
  })

  console.log(`Payment completed for booking ${bookingId}`)
}

async function handlePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
  const payment = await db.payment.findFirst({
    where: { stripePaymentIntent: paymentIntent.id },
  })

  if (!payment) return

  const lastPaymentError = paymentIntent.last_payment_error

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'FAILED',
      failureReason: lastPaymentError?.message || 'Payment failed',
      webhookReceived: true,
      webhookData: JSON.stringify(paymentIntent),
    },
  })

  await db.auditLog.create({
    data: {
      userId: payment.userId,
      action: 'PAYMENT_FAILED',
      entityType: 'Payment',
      entityId: payment.id,
      description: `Stripe payment failed: ${lastPaymentError?.message || 'Unknown error'}`,
    },
  })
}

async function handleRefund(paymentIntentId: string) {
  const payment = await db.payment.findFirst({
    where: { stripePaymentIntent: paymentIntentId },
  })

  if (!payment) return

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
      },
    })

    await tx.booking.update({
      where: { id: payment.bookingId },
      data: { status: 'CANCELLED' },
    })

    await tx.auditLog.create({
      data: {
        userId: payment.userId,
        action: 'PAYMENT_REFUNDED',
        entityType: 'Payment',
        entityId: payment.id,
        description: `Payment refunded for booking ${payment.bookingId}`,
      },
    })
  })
}

async function handleDispute(paymentIntentId: string, dispute: Stripe.Dispute) {
  const payment = await db.payment.findFirst({
    where: { stripePaymentIntent: paymentIntentId },
  })

  if (!payment) return

  await db.payment.update({
    where: { id: payment.id },
    data: {
      status: 'DISPUTED',
    },
  })

  await db.auditLog.create({
    data: {
      userId: payment.userId,
      action: 'PAYMENT_REFUNDED',
      entityType: 'Payment',
      entityId: payment.id,
      description: `Dispute created: ${dispute.reason} - ${dispute.status}`,
    },
  })
}
