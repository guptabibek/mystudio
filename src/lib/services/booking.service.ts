import { db } from '@/lib/db'
import { BookingStatus, AuditAction } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { format, startOfDay } from 'date-fns'
import { AvailabilityService } from './availability.service'
import { PackageService } from './package.service'
import { getOrSetCache, invalidateCacheByPrefix } from '@/lib/cache'

export interface CreateBookingData {
  userId: string
  packageId: string
  sessionDate: Date
  sessionStart: string
  sessionEnd: string
  customerName: string
  customerEmail: string
  customerPhone?: string
  customerNotes?: string
}

export interface UpdateBookingData {
  status?: BookingStatus
  customerNotes?: string
  cancelledReason?: string
}

export class BookingService {
  static readonly PENDING_HOLD_MINUTES = 5

  static async releaseExpiredPendingBookings() {
    const cutoff = new Date(Date.now() - this.PENDING_HOLD_MINUTES * 60 * 1000)

    const expired = await db.booking.findMany({
      where: {
        status: BookingStatus.PENDING,
        createdAt: { lt: cutoff },
        payments: {
          none: {
            status: { in: ['COMPLETED', 'PROCESSING'] },
          },
        },
      },
      select: {
        id: true,
        userId: true,
        bookingNumber: true,
        timeSlotId: true,
      },
      take: 100,
    })

    if (expired.length === 0) {
      return
    }

    const bookingIds = expired.map((booking) => booking.id)
    const timeSlotIds = expired
      .map((booking) => booking.timeSlotId)
      .filter((id): id is string => Boolean(id))

    await db.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: {
          id: { in: bookingIds },
          status: BookingStatus.PENDING,
          createdAt: { lt: cutoff },
        },
        data: {
          status: BookingStatus.CANCELLED,
          cancelledAt: new Date(),
          cancelledReason: 'Slot hold expired: payment not completed within 5 minutes',
        },
      })

      if (timeSlotIds.length > 0) {
        await tx.timeSlot.updateMany({
          where: { id: { in: timeSlotIds } },
          data: {
            isAvailable: true,
            isLocked: false,
            lockedUntil: null,
            lockedBy: null,
          },
        })
      }

      await tx.payment.updateMany({
        where: {
          bookingId: { in: bookingIds },
          status: { in: ['PENDING', 'PROCESSING'] },
        },
        data: {
          status: 'CANCELLED',
          failureReason: 'Booking hold expired before payment completion',
        },
      })

      await tx.auditLog.createMany({
        data: expired.map((booking) => ({
          userId: booking.userId,
          action: AuditAction.BOOKING_CANCELLED,
          entityType: 'Booking',
          entityId: booking.id,
          description: `Booking ${booking.bookingNumber} auto-cancelled due to payment timeout`,
        })),
      })
    })

    await invalidateCacheByPrefix('stats:booking')
    await invalidateCacheByPrefix('stats:public')
    await invalidateCacheByPrefix('dashboard:')
  }

  static async createBooking(data: CreateBookingData) {
    // Validate package exists
    const pkg = await db.package.findUnique({
      where: { id: data.packageId },
    })

    if (!pkg) {
      throw new Error('Package not found')
    }

    // Calculate price
    const dayOfWeek = new Date(data.sessionDate).getDay()
    const pricing = await PackageService.calculatePrice(
      data.packageId,
      data.sessionDate,
      dayOfWeek
    )

    // Create or get time slot with transaction to prevent double booking
    const result = await db.$transaction(async (tx) => {
      // Check if slot is available
      const existingSlot = await tx.timeSlot.findUnique({
        where: {
          date_startTime_endTime: {
            date: startOfDay(data.sessionDate),
            startTime: data.sessionStart,
            endTime: data.sessionEnd,
          },
        },
        include: {
          bookings: {
            where: {
              status: { notIn: [BookingStatus.CANCELLED] },
            },
          },
        },
      })

      if (existingSlot) {
        const now = new Date()
        const hasActiveBooking = existingSlot.bookings.length > 0
        const lockIsActive = !!existingSlot.isLocked && !!existingSlot.lockedUntil && existingSlot.lockedUntil > now
        const hasStaleUnavailableState = !hasActiveBooking && !existingSlot.isAvailable && !lockIsActive

        // Recover stale slot state (e.g., interrupted request) so one contender can still succeed.
        if (hasStaleUnavailableState) {
          await tx.timeSlot.update({
            where: { id: existingSlot.id },
            data: {
              isAvailable: true,
              isLocked: false,
              lockedUntil: null,
              lockedBy: null,
            },
          })
        } else if (hasActiveBooking || !existingSlot.isAvailable || lockIsActive) {
          throw new Error('This time slot is no longer available')
        }
      }

      // Create or update time slot
      const timeSlot = await tx.timeSlot.upsert({
        where: {
          date_startTime_endTime: {
            date: startOfDay(data.sessionDate),
            startTime: data.sessionStart,
            endTime: data.sessionEnd,
          },
        },
        create: {
          date: startOfDay(data.sessionDate),
          startTime: data.sessionStart,
          endTime: data.sessionEnd,
          isAvailable: false,
          isLocked: true,
          lockedUntil: new Date(Date.now() + this.PENDING_HOLD_MINUTES * 60 * 1000),
          lockedBy: data.userId,
        },
        update: {
          isAvailable: false,
          isLocked: true,
          lockedUntil: new Date(Date.now() + this.PENDING_HOLD_MINUTES * 60 * 1000),
          lockedBy: data.userId,
        },
      })

      // Generate booking number
      const bookingNumber = `BK-${format(new Date(), 'yyyyMMdd')}-${uuidv4().substring(0, 8).toUpperCase()}`

      // Create booking
      const booking = await tx.booking.create({
        data: {
          bookingNumber,
          userId: data.userId,
          packageId: data.packageId,
          timeSlotId: timeSlot.id,
          status: BookingStatus.PENDING,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          customerPhone: data.customerPhone,
          customerNotes: data.customerNotes,
          basePrice: pricing.basePrice,
          finalPrice: pricing.finalPrice,
          discountAmount: pricing.discount,
          discountReason: pricing.appliedRules.join(', ') || null,
          sessionDate: startOfDay(data.sessionDate),
          sessionStart: data.sessionStart,
          sessionEnd: data.sessionEnd,
        },
        include: {
          package: true,
          timeSlot: true,
        },
      })

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: data.userId,
          action: AuditAction.BOOKING_CREATED,
          entityType: 'Booking',
          entityId: booking.id,
          description: `Booking ${bookingNumber} created for ${format(data.sessionDate, 'yyyy-MM-dd')} at ${data.sessionStart}`,
          newValues: JSON.stringify({
            package: pkg.name,
            date: data.sessionDate,
            time: `${data.sessionStart} - ${data.sessionEnd}`,
            price: pricing.finalPrice,
          }),
        },
      })

      return booking
    })

    await invalidateCacheByPrefix('stats:booking')
    await invalidateCacheByPrefix('stats:public')
    await invalidateCacheByPrefix('dashboard:')

    return result
  }

  static async getBookingById(id: string) {
    return db.booking.findUnique({
      where: { id },
      include: {
        package: true,
        timeSlot: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        photoCollection: {
          include: {
            photos: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
        user: {
          select: {
            id: true,
            email: true,
            name: true,
            phone: true,
          },
        },
      },
    })
  }

  static async getBookingByNumber(bookingNumber: string) {
    return db.booking.findUnique({
      where: { bookingNumber },
      include: {
        package: true,
        timeSlot: true,
        payments: {
          orderBy: { createdAt: 'desc' },
        },
        photoCollection: {
          include: {
            photos: {
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    })
  }

  static async getUserBookings(
    userId: string,
    params?: {
      status?: BookingStatus
      page?: number
      limit?: number
    }
  ) {
    const { status, page = 1, limit = 10 } = params || {}
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = { userId }
    if (status) {
      where.status = status
    }

    const [bookings, total] = await Promise.all([
      db.booking.findMany({
        where,
        skip,
        take: limit,
        include: {
          package: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 3,
          },
          photoCollection: {
            select: { id: true, status: true, totalPhotos: true },
          },
        },
        orderBy: { sessionDate: 'desc' },
      }),
      db.booking.count({ where }),
    ])

    return {
      bookings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  static async getAllBookings(params: {
    status?: BookingStatus
    page?: number
    limit?: number
    startDate?: Date
    endDate?: Date
    search?: string
  }) {
    const { status, page = 1, limit = 20, startDate, endDate, search } = params
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}

    if (status) {
      where.status = status
    }

    if (startDate || endDate) {
      where.sessionDate = {}
      if (startDate) where.sessionDate.gte = startOfDay(startDate)
      if (endDate) where.sessionDate.lte = startOfDay(endDate)
    }

    if (search) {
      where.OR = [
        { bookingNumber: { contains: search } },
        { customerName: { contains: search } },
        { customerEmail: { contains: search } },
      ]
    }

    const [bookings, total] = await Promise.all([
      db.booking.findMany({
        where,
        skip,
        take: limit,
        include: {
          package: true,
          payments: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.booking.count({ where }),
    ])

    return {
      bookings,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  static async updateBookingStatus(
    id: string,
    status: BookingStatus,
    updatedBy: string,
    options?: { cancelledReason?: string }
  ) {
    const booking = await db.booking.findUnique({
      where: { id },
      include: { timeSlot: true },
    })

    if (!booking) {
      throw new Error('Booking not found')
    }

    const result = await db.$transaction(async (tx) => {
      const updateData: Record<string, unknown> = { status }

      if (status === BookingStatus.CONFIRMED) {
        updateData.confirmedAt = new Date()
      } else if (status === BookingStatus.CANCELLED) {
        updateData.cancelledAt = new Date()
        updateData.cancelledReason = options?.cancelledReason
      } else if (status === BookingStatus.COMPLETED) {
        updateData.completedAt = new Date()
      }

      const updatedBooking = await tx.booking.update({
        where: { id },
        data: updateData,
      })

      // If cancelled, make time slot available again
      if (status === BookingStatus.CANCELLED && booking.timeSlot) {
        await tx.timeSlot.update({
          where: { id: booking.timeSlot.id },
          data: { isAvailable: true },
        })
      }

      // Create audit log
      await tx.auditLog.create({
        data: {
          userId: updatedBy,
          action:
            status === BookingStatus.CANCELLED
              ? AuditAction.BOOKING_CANCELLED
              : status === BookingStatus.CONFIRMED
                ? AuditAction.BOOKING_CONFIRMED
                : AuditAction.BOOKING_COMPLETED,
          entityType: 'Booking',
          entityId: id,
          description: `Booking ${booking.bookingNumber} status changed to ${status}`,
          oldValues: JSON.stringify({ status: booking.status }),
          newValues: JSON.stringify({ status }),
        },
      })

      return updatedBooking
    })

    await invalidateCacheByPrefix('stats:booking')
    await invalidateCacheByPrefix('stats:public')
    await invalidateCacheByPrefix('dashboard:')

    return result
  }

  static async confirmBooking(id: string, confirmedBy?: string) {
    return this.updateBookingStatus(id, BookingStatus.CONFIRMED, confirmedBy || '')
  }

  static async cancelBooking(id: string, reason: string, cancelledBy: string) {
    return this.updateBookingStatus(id, BookingStatus.CANCELLED, cancelledBy, {
      cancelledReason: reason,
    })
  }

  static async completeBooking(id: string, completedBy: string) {
    return this.updateBookingStatus(id, BookingStatus.COMPLETED, completedBy)
  }

  static async getBookingStats() {
    return getOrSetCache('stats:booking:v1', 60, async () => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0)

      const [
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        thisMonthBookings,
        lastMonthBookings,
        thisMonthRevenue,
        lastMonthRevenue,
      ] = await Promise.all([
        db.booking.count(),
        db.booking.count({ where: { status: BookingStatus.PENDING } }),
        db.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
        db.booking.count({ where: { status: BookingStatus.COMPLETED } }),
        db.booking.count({
          where: {
            createdAt: { gte: startOfMonth },
          },
        }),
        db.booking.count({
          where: {
            createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          },
        }),
        db.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: startOfMonth },
          },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: 'COMPLETED',
            createdAt: { gte: startOfLastMonth, lte: endOfLastMonth },
          },
          _sum: { amount: true },
        }),
      ])

      return {
        totalBookings,
        pendingBookings,
        confirmedBookings,
        completedBookings,
        thisMonthBookings,
        lastMonthBookings,
        thisMonthRevenue: thisMonthRevenue._sum.amount || 0,
        lastMonthRevenue: lastMonthRevenue._sum.amount || 0,
        bookingGrowth:
          lastMonthBookings > 0
            ? ((thisMonthBookings - lastMonthBookings) / lastMonthBookings) * 100
            : 0,
        revenueGrowth:
          (lastMonthRevenue._sum.amount || 0) > 0
            ? (((thisMonthRevenue._sum.amount || 0) - (lastMonthRevenue._sum.amount || 0)) /
                (lastMonthRevenue._sum.amount || 1)) *
              100
            : 0,
      }
    })
  }

  static async getUpcomingBookings(days = 7) {
    const today = startOfDay(new Date())
    const endDate = new Date(today)
    endDate.setDate(endDate.getDate() + days)

    return db.booking.findMany({
      where: {
        sessionDate: {
          gte: today,
          lte: endDate,
        },
        status: {
          in: [BookingStatus.CONFIRMED, BookingStatus.PENDING],
        },
      },
      include: {
        package: true,
        user: {
          select: { id: true, email: true, name: true, phone: true },
        },
      },
      orderBy: [{ sessionDate: 'asc' }, { sessionStart: 'asc' }],
    })
  }
}
