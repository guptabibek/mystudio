import { NextRequest } from 'next/server'
import { apiResponse, apiError, getAuthenticatedUser } from '@/lib/utils/api'
import { BookingService } from '@/lib/services/booking.service'
import { PaymentService } from '@/lib/services/payment.service'
import { db } from '@/lib/db'
import { getOrSetCache } from '@/lib/cache'

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req)
    if (!user || user.role !== 'ADMIN') {
      return apiError('Admin access required', 403)
    }

    const payload = await getOrSetCache('dashboard:admin-overview:v1', 45, async () => {
      const [bookingStats, paymentStats, totalCustomers, upcomingSessions, pendingPayments, recentBookings] =
        await Promise.all([
          BookingService.getBookingStats(),
          PaymentService.getPaymentStats(),
          db.user.count({
            where: { role: 'CUSTOMER' },
          }),
          db.booking.count({
            where: {
              sessionDate: { gte: new Date() },
              status: { in: ['CONFIRMED', 'PENDING'] },
            },
          }),
          db.payment.count({
            where: {
              status: 'PENDING',
              method: 'BANK_TRANSFER',
            },
          }),
          db.booking.findMany({
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: {
              package: { select: { name: true } },
              payments: {
                select: { status: true, method: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              photoCollection: {
                select: { id: true, status: true, totalPhotos: true },
              },
            },
          }),
        ])

      return {
        stats: {
          totalBookings: bookingStats.totalBookings,
          pendingBookings: bookingStats.pendingBookings,
          completedBookings: bookingStats.completedBookings,
          totalRevenue: paymentStats.totalRevenue,
          monthlyRevenue: paymentStats.thisMonthRevenue,
          totalCustomers,
          upcomingSessions,
          pendingPayments,
        },
        recentBookings: recentBookings.map((b) => ({
          id: b.id,
          bookingNumber: b.bookingNumber,
          customerName: b.customerName,
          customerEmail: b.customerEmail,
          sessionDate: b.sessionDate,
          sessionStart: b.sessionStart,
          status: b.status,
          finalPrice: b.finalPrice,
          package: { name: b.package.name },
          payments: b.payments,
          photoCollection: b.photoCollection,
        })),
      }
    })

    return apiResponse(payload)
  } catch (error) {
    console.error('Dashboard fetch error:', error)
    return apiError('Failed to fetch dashboard data', 500)
  }
}
