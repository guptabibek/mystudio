import { db } from '@/lib/db'
import { PaymentMethod, PaymentStatus, AuditAction, BookingStatus } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import Stripe from 'stripe'
import { getOrSetCache, invalidateCacheByPrefix } from '@/lib/cache'

// Lazy Stripe initialization (avoids crash when key is empty)
let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('Stripe is not configured')
    _stripe = new Stripe(key, { apiVersion: '2024-06-20' })
  }
  return _stripe
}

export interface CreateStripePaymentData {
  bookingId: string
  userId: string
  amount: number
  currency: string
  customerEmail: string
  description?: string
}

export interface CreateEsewaPaymentData {
  bookingId: string
  userId: string
  amount: number
  currency: string
}

export interface CreateBankTransferData {
  bookingId: string
  userId: string
  amount: number
  currency: string
  bankName: string
  bankAccountNumber: string
  bankReferenceNumber: string
  paymentProofUrl: string
  paymentProofPublicId?: string
}

export class PaymentService {
  // ==================== STRIPE ====================
  static async createStripePaymentIntent(data: CreateStripePaymentData) {
    const booking = await db.booking.findUnique({
      where: { id: data.bookingId },
      include: { payments: true },
    })

    if (!booking) {
      throw new Error('Booking not found')
    }

    // Check if payment already exists
    const existingPayment = await db.payment.findFirst({
      where: {
        bookingId: data.bookingId,
        method: PaymentMethod.STRIPE,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING, PaymentStatus.COMPLETED] },
      },
    })

    if (existingPayment && existingPayment.status === PaymentStatus.COMPLETED) {
      throw new Error('Payment already completed for this booking')
    }

    // Create Stripe payment intent
    const paymentIntent = await getStripe().paymentIntents.create({
      amount: Math.round(data.amount * 100), // Stripe expects cents
      currency: data.currency.toLowerCase(),
      metadata: {
        bookingId: data.bookingId,
        userId: data.userId,
        bookingNumber: booking.bookingNumber,
      },
      receipt_email: data.customerEmail,
      description: data.description || `Photo Session - ${booking.bookingNumber}`,
      automatic_payment_methods: {
        enabled: true,
      },
    })

    // Create or update payment record
    const payment = await db.payment.create({
      data: {
        bookingId: data.bookingId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        method: PaymentMethod.STRIPE,
        status: PaymentStatus.PENDING,
        stripePaymentIntent: paymentIntent.id,
        stripeClientSecret: paymentIntent.client_secret,
        gatewayReference: paymentIntent.id,
        transactionId: `STRIPE-${uuidv4().substring(0, 8).toUpperCase()}`,
      },
    })

    // Create audit log
    await db.auditLog.create({
      data: {
        userId: data.userId,
        action: AuditAction.PAYMENT_INITIATED,
        entityType: 'Payment',
        entityId: payment.id,
        description: `Stripe payment initiated for booking ${booking.bookingNumber}`,
        newValues: JSON.stringify({
          method: 'STRIPE',
          amount: data.amount,
          currency: data.currency,
        }),
      },
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('stats:booking')
    await invalidateCacheByPrefix('dashboard:')

    return {
      paymentId: payment.id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    }
  }

  static async handleStripeWebhook(event: Stripe.Event) {
    // Handle idempotency
    const eventId = event.id
    const existingWebhook = await db.payment.findFirst({
      where: { webhookData: { contains: eventId } },
    })

    if (existingWebhook) {
      console.log(`Webhook ${eventId} already processed`)
      return { received: true, duplicate: true }
    }

    switch (event.type) {
      case 'payment_intent.succeeded':
        return this.handleStripePaymentSuccess(event.data.object as Stripe.PaymentIntent)

      case 'payment_intent.payment_failed':
        return this.handleStripePaymentFailure(event.data.object as Stripe.PaymentIntent)

      case 'charge.refunded':
        return this.handleStripeRefund(event.data.object as Stripe.Charge)

      default:
        console.log(`Unhandled event type: ${event.type}`)
        return { received: true }
    }
  }

  private static async handleStripePaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
    const bookingId = paymentIntent.metadata.bookingId

    const payment = await db.payment.findFirst({
      where: {
        stripePaymentIntent: paymentIntent.id,
      },
    })

    if (!payment) {
      console.error(`Payment not found for PaymentIntent: ${paymentIntent.id}`)
      return { received: false, error: 'Payment not found' }
    }

    // Update payment and booking in transaction
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.COMPLETED,
          webhookReceived: true,
          webhookData: JSON.stringify(paymentIntent),
          webhookProcessedAt: new Date(),
        },
      })

      await tx.booking.update({
        where: { id: bookingId },
        data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          userId: payment.userId,
          action: AuditAction.PAYMENT_COMPLETED,
          entityType: 'Payment',
          entityId: payment.id,
          description: `Stripe payment completed for booking`,
          newValues: JSON.stringify({
            amount: payment.amount,
            currency: payment.currency,
          }),
        },
      })
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('stats:booking')
    await invalidateCacheByPrefix('dashboard:')

    return { received: true, paymentId: payment.id }
  }

  private static async handleStripePaymentFailure(paymentIntent: Stripe.PaymentIntent) {
    const payment = await db.payment.findFirst({
      where: { stripePaymentIntent: paymentIntent.id },
    })

    if (!payment) {
      return { received: false, error: 'Payment not found' }
    }

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          webhookReceived: true,
          webhookData: JSON.stringify(paymentIntent),
          webhookProcessedAt: new Date(),
          failureReason: paymentIntent.last_payment_error?.message || 'Payment failed',
        },
      })

      await tx.auditLog.create({
        data: {
          userId: payment.userId,
          action: AuditAction.PAYMENT_FAILED,
          entityType: 'Payment',
          entityId: payment.id,
          description: `Stripe payment failed`,
          newValues: JSON.stringify({
            error: paymentIntent.last_payment_error?.message,
          }),
        },
      })
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('dashboard:')

    return { received: true }
  }

  private static async handleStripeRefund(charge: Stripe.Charge) {
    const paymentIntentId = charge.payment_intent as string
    const payment = await db.payment.findFirst({
      where: { stripePaymentIntent: paymentIntentId },
    })

    if (!payment) {
      return { received: false, error: 'Payment not found' }
    }

    const refundAmount = (charge.amount_refunded / 100).toFixed(2)

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.REFUNDED,
          refundAmount: parseFloat(refundAmount),
          refundedAt: new Date(),
        },
      })

      await tx.auditLog.create({
        data: {
          userId: payment.userId,
          action: AuditAction.PAYMENT_REFUNDED,
          entityType: 'Payment',
          entityId: payment.id,
          description: `Stripe payment refunded`,
          newValues: JSON.stringify({ refundAmount }),
        },
      })
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('stats:booking')
    await invalidateCacheByPrefix('dashboard:')

    return { received: true }
  }

  // ==================== ESEWA ====================
  static async createEsewaPayment(data: CreateEsewaPaymentData) {
    const booking = await db.booking.findUnique({
      where: { id: data.bookingId },
    })

    if (!booking) {
      throw new Error('Booking not found')
    }

    // Generate unique product ID for eSewa
    const productId = `ESEWA-${booking.bookingNumber}-${uuidv4().substring(0, 8)}`

    const payment = await db.payment.create({
      data: {
        bookingId: data.bookingId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        method: PaymentMethod.ESEWA,
        status: PaymentStatus.PENDING,
        esewaProductId: productId,
        transactionId: productId,
      },
    })

    await db.auditLog.create({
      data: {
        userId: data.userId,
        action: AuditAction.PAYMENT_INITIATED,
        entityType: 'Payment',
        entityId: payment.id,
        description: `eSewa payment initiated for booking ${booking.bookingNumber}`,
        newValues: JSON.stringify({
          method: 'ESEWA',
          amount: data.amount,
          productId,
        }),
      },
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('dashboard:')

    // Return eSewa payment configuration
    const appBaseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '')

    return {
      paymentId: payment.id,
      productId,
      amount: data.amount,
      // In production, these would come from environment variables
      merchantId: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
      successUrl: `${appBaseUrl}/api/payments/esewa/success`,
      failureUrl: `${appBaseUrl}/api/payments/esewa/failure`,
    }
  }

  static async verifyEsewaPayment(params: {
    pid: string
    rid: string
    totalAmount: string
  }) {
    const payment = await db.payment.findFirst({
      where: {
        esewaProductId: params.pid,
        status: PaymentStatus.PENDING,
      },
    })

    if (!payment) {
      throw new Error('Payment not found or already processed')
    }

    try {
      const expectedAmount = Number(params.totalAmount)
      if (Number.isNaN(expectedAmount) || expectedAmount <= 0) {
        throw new Error('Invalid payment amount from eSewa callback')
      }

      if (Math.abs(expectedAmount - payment.amount) > 0.01) {
        throw new Error('Amount mismatch during eSewa verification')
      }

      const verifyUrl = new URL(
        process.env.ESEWA_TRANSSTATUS_URL || 'https://rc.esewa.com.np/epay/transstatus'
      )
      verifyUrl.searchParams.set('amt', expectedAmount.toString())
      verifyUrl.searchParams.set('rid', params.rid)
      verifyUrl.searchParams.set('pid', params.pid)
      verifyUrl.searchParams.set('scd', process.env.ESEWA_MERCHANT_ID || 'EPAYTEST')

      const verificationResponse = await fetch(verifyUrl.toString(), {
        method: 'GET',
        headers: { Accept: 'text/plain,application/xml,text/xml' },
      })

      if (!verificationResponse.ok) {
        throw new Error(`eSewa verification request failed with status ${verificationResponse.status}`)
      }

      const verificationText = await verificationResponse.text()
      const normalized = verificationText.toLowerCase()
      const verified =
        normalized.includes('success') ||
        normalized.includes('<status>complete</status>') ||
        normalized.includes('complete')

      if (verified) {
        await db.$transaction(async (tx) => {
          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.COMPLETED,
              gatewayReference: params.rid,
              webhookReceived: true,
              webhookData: verificationText,
              webhookProcessedAt: new Date(),
            },
          })

          await tx.booking.update({
            where: { id: payment.bookingId },
            data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
          })

          await tx.auditLog.create({
            data: {
              userId: payment.userId,
              action: AuditAction.PAYMENT_COMPLETED,
              entityType: 'Payment',
              entityId: payment.id,
              description: `eSewa payment verified and completed`,
              newValues: JSON.stringify({
                rid: params.rid,
                amount: params.totalAmount,
              }),
            },
          })
        })

        await invalidateCacheByPrefix('stats:payment')
        await invalidateCacheByPrefix('stats:booking')
        await invalidateCacheByPrefix('dashboard:')

        return { success: true, paymentId: payment.id }
      } else {
        throw new Error('eSewa verification failed')
      }
    } catch (error) {
      await db.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.FAILED,
          failureReason: error instanceof Error ? error.message : 'Verification failed',
        },
      })

      throw error
    }
  }

  // ==================== BANK TRANSFER ====================
  static async createBankTransferPayment(data: CreateBankTransferData) {
    const booking = await db.booking.findUnique({
      where: { id: data.bookingId },
    })

    if (!booking) {
      throw new Error('Booking not found')
    }

    const payment = await db.payment.create({
      data: {
        bookingId: data.bookingId,
        userId: data.userId,
        amount: data.amount,
        currency: data.currency,
        method: PaymentMethod.BANK_TRANSFER,
        status: PaymentStatus.PENDING,
        bankName: data.bankName,
        bankAccountNumber: data.bankAccountNumber,
        bankReferenceNumber: data.bankReferenceNumber,
        paymentProofUrl: data.paymentProofUrl,
        paymentProofPublicId: data.paymentProofPublicId,
        transactionId: `BANK-${uuidv4().substring(0, 8).toUpperCase()}`,
      },
    })

    await db.auditLog.create({
      data: {
        userId: data.userId,
        action: AuditAction.PAYMENT_INITIATED,
        entityType: 'Payment',
        entityId: payment.id,
        description: `Bank transfer payment submitted for booking ${booking.bookingNumber}`,
        newValues: JSON.stringify({
          method: 'BANK_TRANSFER',
          amount: data.amount,
          bankName: data.bankName,
          referenceNumber: data.bankReferenceNumber,
        }),
      },
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('dashboard:')

    return payment
  }

  static async verifyBankTransfer(paymentId: string, adminId: string, approved: boolean, notes?: string) {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    })

    if (!payment) {
      throw new Error('Payment not found')
    }

    if (payment.method !== PaymentMethod.BANK_TRANSFER) {
      throw new Error('Invalid payment method')
    }

    const newStatus = approved ? PaymentStatus.COMPLETED : PaymentStatus.FAILED

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: newStatus,
          adminVerifiedAt: new Date(),
          adminVerifiedBy: adminId,
          adminNotes: notes,
        },
      })

      if (approved) {
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date() },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: AuditAction.PAYMENT_VERIFIED,
          entityType: 'Payment',
          entityId: paymentId,
          description: `Bank transfer ${approved ? 'approved' : 'rejected'}`,
          newValues: JSON.stringify({ approved, notes }),
        },
      })
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('stats:booking')
    await invalidateCacheByPrefix('dashboard:')

    return { success: true, status: newStatus }
  }

  // ==================== COMMON ====================
  static async getPaymentById(id: string) {
    return db.payment.findUnique({
      where: { id },
      include: {
        booking: {
          include: { package: true },
        },
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    })
  }

  static async getPaymentsByBooking(bookingId: string) {
    return db.payment.findMany({
      where: { bookingId },
      orderBy: { createdAt: 'desc' },
    })
  }

  static async getPendingBankTransfers(params?: { page?: number; limit?: number }) {
    const { page = 1, limit = 20 } = params || {}
    const skip = (page - 1) * limit

    const [payments, total] = await Promise.all([
      db.payment.findMany({
        where: {
          method: PaymentMethod.BANK_TRANSFER,
          status: PaymentStatus.PENDING,
        },
        skip,
        take: limit,
        include: {
          booking: {
            include: { package: true },
          },
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      db.payment.count({
        where: {
          method: PaymentMethod.BANK_TRANSFER,
          status: PaymentStatus.PENDING,
        },
      }),
    ])

    return {
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  static async getPaymentStats() {
    return getOrSetCache('stats:payment:v1', 60, async () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

      const [
        totalRevenue,
        thisMonthRevenue,
        lastMonthRevenue,
        pendingPayments,
        completedPayments,
        refundedPayments,
      ] = await Promise.all([
        db.payment.aggregate({
          where: { status: PaymentStatus.COMPLETED },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: PaymentStatus.COMPLETED,
            createdAt: { gte: startOfMonth },
          },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: PaymentStatus.COMPLETED,
            createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          },
          _sum: { amount: true },
        }),
        db.payment.count({
          where: { status: PaymentStatus.PENDING },
        }),
        db.payment.count({
          where: { status: PaymentStatus.COMPLETED },
        }),
        db.payment.count({
          where: { status: PaymentStatus.REFUNDED },
        }),
      ])

      return {
        totalRevenue: totalRevenue._sum.amount || 0,
        thisMonthRevenue: thisMonthRevenue._sum.amount || 0,
        lastMonthRevenue: lastMonthRevenue._sum.amount || 0,
        pendingPayments,
        completedPayments,
        refundedPayments,
      }
    })
  }

  static async processRefund(paymentId: string, reason: string, adminId: string) {
    const payment = await db.payment.findUnique({
      where: { id: paymentId },
    })

    if (!payment) {
      throw new Error('Payment not found')
    }

    if (payment.method === PaymentMethod.STRIPE && payment.stripePaymentIntent) {
      // Process Stripe refund
      const refund = await getStripe().refunds.create({
        payment_intent: payment.stripePaymentIntent,
        reason: 'requested_by_customer',
      })

      await db.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: PaymentStatus.REFUNDED,
            refundAmount: payment.amount,
            refundReason: reason,
            refundedAt: new Date(),
            gatewayReference: refund.id,
          },
        })

        await tx.auditLog.create({
          data: {
            userId: adminId,
            action: AuditAction.PAYMENT_REFUNDED,
            entityType: 'Payment',
            entityId: paymentId,
            description: `Payment refunded via Stripe`,
            newValues: JSON.stringify({
              refundId: refund.id,
              amount: payment.amount,
              reason,
            }),
          },
        })
      })

      await invalidateCacheByPrefix('stats:payment')
      await invalidateCacheByPrefix('dashboard:')

      return { success: true, refundId: refund.id }
    }

    // For other payment methods, just mark as refunded
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.REFUNDED,
          refundAmount: payment.amount,
          refundReason: reason,
          refundedAt: new Date(),
        },
      })

      await tx.auditLog.create({
        data: {
          userId: adminId,
          action: AuditAction.PAYMENT_REFUNDED,
          entityType: 'Payment',
          entityId: paymentId,
          description: `Payment refunded`,
          newValues: JSON.stringify({
            amount: payment.amount,
            reason,
          }),
        },
      })
    })

    await invalidateCacheByPrefix('stats:payment')
    await invalidateCacheByPrefix('dashboard:')

    return { success: true }
  }
}
