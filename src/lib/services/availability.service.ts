import { db } from '@/lib/db'
import { DayOfWeek, AuditAction } from '@prisma/client'
import { addDays, startOfDay, endOfDay, format, isWithinInterval } from 'date-fns'
import { getOrSetCache, invalidateCacheByPrefix } from '@/lib/cache'

const AVAILABILITY_TEMPLATES_KEY = 'AVAILABILITY_TEMPLATES_BY_CATEGORY'
const AVAILABILITY_TEMPLATE_CACHE_KEY = 'availability:templates:v1'
const AVAILABILITY_RULES_CACHE_KEY = 'availability:rules:v1'

export interface CreateAvailabilityRule {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  slotDuration?: number
  bufferTime?: number
}

export interface CreateBlackoutDate {
  startDate: Date
  endDate: Date
  reason?: string
  isRecurring?: boolean
}

export interface AvailabilityTemplateRule {
  dayOfWeek: DayOfWeek
  startTime: string
  endTime: string
  slotDuration?: number
  bufferTime?: number
}

export interface CategoryAvailabilityTemplate {
  categoryId: string
  rules: AvailabilityTemplateRule[]
}

export class AvailabilityService {
  static async getCategoryAvailabilityTemplates(): Promise<CategoryAvailabilityTemplate[]> {
    return getOrSetCache(AVAILABILITY_TEMPLATE_CACHE_KEY, 180, async () => {
      const config = await db.systemConfig.findUnique({ where: { key: AVAILABILITY_TEMPLATES_KEY } })
      if (!config) return []

      try {
        const parsed = JSON.parse(config.value)
        if (!Array.isArray(parsed)) return []

        return parsed
          .filter((t) => t && typeof t.categoryId === 'string' && Array.isArray(t.rules))
          .map((t) => ({
            categoryId: t.categoryId,
            rules: t.rules
              .filter(
                (r: Record<string, unknown>) =>
                  typeof r.dayOfWeek === 'string' &&
                  typeof r.startTime === 'string' &&
                  typeof r.endTime === 'string'
              )
              .map((r: Record<string, unknown>) => ({
                dayOfWeek: r.dayOfWeek as DayOfWeek,
                startTime: String(r.startTime),
                endTime: String(r.endTime),
                slotDuration:
                  typeof r.slotDuration === 'number' && Number.isFinite(r.slotDuration)
                    ? r.slotDuration
                    : undefined,
                bufferTime:
                  typeof r.bufferTime === 'number' && Number.isFinite(r.bufferTime)
                    ? r.bufferTime
                    : undefined,
              })),
          }))
      } catch {
        return []
      }
    })
  }

  static async setCategoryAvailabilityTemplates(
    templates: CategoryAvailabilityTemplate[],
    updatedBy: string
  ) {
    const normalized = templates
      .filter((t) => t.categoryId.trim())
      .map((t) => ({
        categoryId: t.categoryId.trim(),
        rules: t.rules
          .filter((r) => r.dayOfWeek && r.startTime && r.endTime)
          .map((r) => ({
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            slotDuration: r.slotDuration ?? 60,
            bufferTime: r.bufferTime ?? 15,
          })),
      }))

    await db.systemConfig.upsert({
      where: { key: AVAILABILITY_TEMPLATES_KEY },
      create: {
        key: AVAILABILITY_TEMPLATES_KEY,
        value: JSON.stringify(normalized),
        description: 'Category based availability templates',
        updatedBy,
      },
      update: {
        value: JSON.stringify(normalized),
        updatedBy,
      },
    })

    await db.auditLog.create({
      data: {
        userId: updatedBy,
        action: AuditAction.ADMIN_AVAILABILITY_CHANGE,
        entityType: 'AvailabilityTemplate',
        description: 'Category availability templates updated',
      },
    })

    await invalidateCacheByPrefix('availability:')

    return normalized
  }

  static async getAvailabilityRules() {
    return getOrSetCache(AVAILABILITY_RULES_CACHE_KEY, 60, () =>
      db.availabilityRule.findMany({
        where: { isActive: true },
        orderBy: { dayOfWeek: 'asc' },
      })
    )
  }

  static async createAvailabilityRule(data: CreateAvailabilityRule, createdBy: string) {
    const rule = await db.availabilityRule.create({
      data: {
        dayOfWeek: data.dayOfWeek,
        startTime: data.startTime,
        endTime: data.endTime,
        slotDuration: data.slotDuration || 60,
        bufferTime: data.bufferTime || 15,
      },
    })

    await db.auditLog.create({
      data: {
        userId: createdBy,
        action: AuditAction.ADMIN_AVAILABILITY_CHANGE,
        entityType: 'AvailabilityRule',
        entityId: rule.id,
        description: `Availability rule created for ${data.dayOfWeek}`,
        newValues: JSON.stringify(data),
      },
    })

    await invalidateCacheByPrefix('availability:')

    return rule
  }

  static async updateAvailabilityRule(
    id: string,
    data: Partial<CreateAvailabilityRule>,
    updatedBy: string
  ) {
    const rule = await db.availabilityRule.update({
      where: { id },
      data,
    })

    await db.auditLog.create({
      data: {
        userId: updatedBy,
        action: AuditAction.ADMIN_AVAILABILITY_CHANGE,
        entityType: 'AvailabilityRule',
        entityId: id,
        description: `Availability rule updated for ${rule.dayOfWeek}`,
        newValues: JSON.stringify(data),
      },
    })

    await invalidateCacheByPrefix('availability:')

    return rule
  }

  static async deleteAvailabilityRule(id: string, deletedBy: string) {
    const rule = await db.availabilityRule.update({
      where: { id },
      data: { isActive: false },
    })

    await db.auditLog.create({
      data: {
        userId: deletedBy,
        action: AuditAction.ADMIN_AVAILABILITY_CHANGE,
        entityType: 'AvailabilityRule',
        entityId: id,
        description: `Availability rule deleted for ${rule.dayOfWeek}`,
      },
    })

    await invalidateCacheByPrefix('availability:')

    return rule
  }

  static async getBlackoutDates(startDate?: Date, endDate?: Date) {
    return db.blackoutDate.findMany({
      where: {
        OR: [
          {
            startDate: { lte: endDate || new Date() },
            endDate: { gte: startDate || new Date() },
          },
          { isRecurring: true },
        ],
      },
      orderBy: { startDate: 'asc' },
    })
  }

  static async createBlackoutDate(data: CreateBlackoutDate, createdBy: string) {
    const blackout = await db.blackoutDate.create({
      data: {
        startDate: data.startDate,
        endDate: data.endDate,
        reason: data.reason,
        isRecurring: data.isRecurring || false,
      },
    })

    await db.auditLog.create({
      data: {
        userId: createdBy,
        action: AuditAction.ADMIN_AVAILABILITY_CHANGE,
        entityType: 'BlackoutDate',
        entityId: blackout.id,
        description: `Blackout date created: ${format(data.startDate, 'yyyy-MM-dd')} to ${format(data.endDate, 'yyyy-MM-dd')}`,
        newValues: JSON.stringify(data),
      },
    })

    await invalidateCacheByPrefix('availability:')

    return blackout
  }

  static async deleteBlackoutDate(id: string, deletedBy: string) {
    const blackout = await db.blackoutDate.delete({
      where: { id },
    })

    await db.auditLog.create({
      data: {
        userId: deletedBy,
        action: AuditAction.ADMIN_AVAILABILITY_CHANGE,
        entityType: 'BlackoutDate',
        entityId: id,
        description: `Blackout date deleted`,
      },
    })

    await invalidateCacheByPrefix('availability:')

    return blackout
  }

  static async getAvailableSlots(
    startDate: Date,
    endDate: Date,
    packageOptions?: {
      duration?: number
      categoryId?: string
    }
  ): Promise<
    Array<{
      date: Date
      slots: Array<{ startTime: string; endTime: string; available: boolean }>
    }>
  > {
    // Get availability rules
    const rules = await this.getAvailabilityRules()

    const templates = await this.getCategoryAvailabilityTemplates()
    const categoryTemplate =
      packageOptions?.categoryId
        ? templates.find((t) => t.categoryId === packageOptions.categoryId)
        : undefined

    // Get blackout dates
    const blackouts = await this.getBlackoutDates(startDate, endDate)

    // Get existing bookings and locked slots
    const existingSlots = await db.timeSlot.findMany({
      where: {
        date: {
          gte: startOfDay(startDate),
          lte: endOfDay(endDate),
        },
      },
      include: {
        bookings: {
          where: {
            status: { notIn: ['CANCELLED'] },
          },
        },
      },
    })

    const existingSlotLookup = new Map<string, Map<string, (typeof existingSlots)[number]>>()
    for (const slot of existingSlots) {
      const dateKey = format(slot.date, 'yyyy-MM-dd')
      const dateSlots = existingSlotLookup.get(dateKey) || new Map<string, (typeof existingSlots)[number]>()
      dateSlots.set(slot.startTime, slot)
      existingSlotLookup.set(dateKey, dateSlots)
    }

    const result: Array<{
      date: Date
      slots: Array<{ startTime: string; endTime: string; available: boolean }>
    }> = []

    let currentDate = startOfDay(startDate)
    const end = endOfDay(endDate)

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay()
      const dayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'][
        dayOfWeek
      ] as DayOfWeek

      // Check if date is in blackout period
      const isBlackout = blackouts.some((b) => {
        if (b.isRecurring) {
          // Check if same month/day matches (ignoring year)
          const bStart = new Date(b.startDate)
          const bEnd = new Date(b.endDate)
          const checkDate = new Date(currentDate)
          checkDate.setFullYear(bStart.getFullYear())
          return checkDate >= bStart && checkDate <= bEnd
        }
        return isWithinInterval(currentDate, { start: b.startDate, end: b.endDate })
      })

      if (!isBlackout) {
        const dateKey = format(currentDate, 'yyyy-MM-dd')

        // Find applicable rules for this day
        const applicableTemplateRules =
          categoryTemplate?.rules.filter((r) => r.dayOfWeek === dayName) || []

        const applicableRules =
          applicableTemplateRules.length > 0
            ? applicableTemplateRules.map((r) => ({
                startTime: r.startTime,
                endTime: r.endTime,
                slotDuration: r.slotDuration ?? 60,
                bufferTime: r.bufferTime ?? 15,
              }))
            : rules
                .filter((r) => r.dayOfWeek === dayName)
                .map((r) => ({
                  startTime: r.startTime,
                  endTime: r.endTime,
                  slotDuration: r.slotDuration,
                  bufferTime: r.bufferTime,
                }))

        const slots: Array<{ startTime: string; endTime: string; available: boolean }> = []

        for (const rule of applicableRules) {
          const slotDuration = packageOptions?.duration || rule.slotDuration
          const slotsData = this.generateTimeSlots(
            rule.startTime,
            rule.endTime,
            slotDuration,
            rule.bufferTime
          )

          for (const slot of slotsData) {
            const existingSlot = existingSlotLookup.get(dateKey)?.get(slot.startTime)

            const isAvailable =
              !existingSlot ||
              (existingSlot.isAvailable &&
                !existingSlot.isLocked &&
                existingSlot.bookings.length === 0)

            slots.push({
              startTime: slot.startTime,
              endTime: slot.endTime,
              available: isAvailable,
            })
          }
        }

        result.push({
          date: new Date(currentDate),
          slots: slots.sort((a, b) => a.startTime.localeCompare(b.startTime)),
        })
      }

      currentDate = addDays(currentDate, 1)
    }

    return result
  }

  private static generateTimeSlots(
    startTime: string,
    endTime: string,
    duration: number,
    buffer: number
  ): Array<{ startTime: string; endTime: string }> {
    const slots: Array<{ startTime: string; endTime: string }> = []

    const [startHour, startMin] = startTime.split(':').map(Number)
    const [endHour, endMin] = endTime.split(':').map(Number)

    let currentMinutes = startHour * 60 + startMin
    const endMinutes = endHour * 60 + endMin

    while (currentMinutes + duration <= endMinutes) {
      const slotStart = this.formatTime(currentMinutes)
      const slotEnd = this.formatTime(currentMinutes + duration)

      slots.push({
        startTime: slotStart,
        endTime: slotEnd,
      })

      currentMinutes += duration + buffer
    }

    return slots
  }

  private static formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`
  }

  static async lockSlot(
    date: Date,
    startTime: string,
    endTime: string,
    userId: string,
    lockDurationMinutes = 15
  ): Promise<string> {
    const lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000)

    const slot = await db.timeSlot.upsert({
      where: {
        date_startTime_endTime: {
          date: startOfDay(date),
          startTime,
          endTime,
        },
      },
      create: {
        date: startOfDay(date),
        startTime,
        endTime,
        isAvailable: true,
        isLocked: true,
        lockedUntil,
        lockedBy: userId,
      },
      update: {
        isLocked: true,
        lockedUntil,
        lockedBy: userId,
      },
    })

    return slot.id
  }

  static async unlockSlot(date: Date, startTime: string, endTime: string) {
    await db.timeSlot.updateMany({
      where: {
        date: startOfDay(date),
        startTime,
        endTime,
        lockedUntil: { lt: new Date() },
      },
      data: {
        isLocked: false,
        lockedUntil: null,
        lockedBy: null,
      },
    })
  }

  static async cleanupExpiredLocks() {
    await db.timeSlot.updateMany({
      where: {
        lockedUntil: { lt: new Date() },
      },
      data: {
        isLocked: false,
        lockedUntil: null,
        lockedBy: null,
      },
    })
  }
}
