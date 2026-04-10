import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/utils/api'
import { db } from '@/lib/db'

function escapeCsv(value: unknown): string {
  const text = String(value ?? '')
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser(req)
  if (!user || user.role !== 'ADMIN') {
    return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (startDate || endDate) {
      where.sessionDate = {}
      if (startDate) {
        ;(where.sessionDate as Record<string, unknown>).gte = new Date(startDate)
      }
      if (endDate) {
        ;(where.sessionDate as Record<string, unknown>).lte = new Date(endDate)
      }
    }

    const bookings = await db.booking.findMany({
      where,
      include: {
        package: { select: { name: true } },
        user: { select: { id: true, email: true, name: true } },
        payments: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const headers = [
      'booking_id',
      'booking_number',
      'booking_status',
      'session_date',
      'session_start',
      'session_end',
      'customer_name',
      'customer_email',
      'customer_phone',
      'package_name',
      'booking_amount',
      'booking_currency',
      'payment_method',
      'payment_status',
      'payment_amount',
      'payment_currency',
      'payment_transaction_id',
      'payment_gateway_reference',
      'payment_created_at',
      'created_at',
    ]

    const rows: string[] = [headers.join(',')]

    for (const booking of bookings) {
      if (!booking.payments.length) {
        const row = [
          booking.id,
          booking.bookingNumber,
          booking.status,
          booking.sessionDate.toISOString(),
          booking.sessionStart,
          booking.sessionEnd,
          booking.customerName,
          booking.customerEmail,
          booking.customerPhone || '',
          booking.package.name,
          Number(booking.finalPrice).toFixed(2),
          booking.currency,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          booking.createdAt.toISOString(),
        ]
        rows.push(row.map(escapeCsv).join(','))
        continue
      }

      for (const payment of booking.payments) {
        const row = [
          booking.id,
          booking.bookingNumber,
          booking.status,
          booking.sessionDate.toISOString(),
          booking.sessionStart,
          booking.sessionEnd,
          booking.customerName,
          booking.customerEmail,
          booking.customerPhone || '',
          booking.package.name,
          Number(booking.finalPrice).toFixed(2),
          booking.currency,
          payment.method,
          payment.status,
          Number(payment.amount).toFixed(2),
          payment.currency,
          payment.transactionId || '',
          payment.gatewayReference || '',
          payment.createdAt.toISOString(),
          booking.createdAt.toISOString(),
        ]
        rows.push(row.map(escapeCsv).join(','))
      }
    }

    const csv = rows.join('\n')
    const filename = `bookings-report-${new Date().toISOString().slice(0, 10)}.csv`

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename=${filename}`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Export bookings report error:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to export bookings report' },
      { status: 500 }
    )
  }
}
