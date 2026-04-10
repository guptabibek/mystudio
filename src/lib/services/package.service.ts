import { db } from '@/lib/db'
import { PackageStatus, AuditAction } from '@prisma/client'
import { getOrSetCache, invalidateCacheByPrefix } from '@/lib/cache'

const SERVICE_CATEGORIES_KEY = 'SERVICE_CATEGORIES'
const PACKAGE_CATEGORY_MAP_KEY = 'PACKAGE_CATEGORY_MAP'
const PACKAGE_CACHE_PREFIX = 'packages:'

export interface ServiceCategory {
  id: string
  label: string
  tagline: string
  icon?: string
  sortOrder: number
}

const DEFAULT_SERVICE_CATEGORIES: ServiceCategory[] = [
  { id: 'weddings', label: 'Weddings', tagline: 'Romantic & Timeless', icon: 'camera', sortOrder: 0 },
  { id: 'fashion', label: 'Fashion', tagline: 'Bold & Editorial', icon: 'palette', sortOrder: 1 },
  { id: 'events', label: 'Events', tagline: 'Vibrant & Dynamic', icon: 'party', sortOrder: 2 },
]

export interface CreatePackageData {
  name: string
  description?: string
  duration: number
  price: number
  currency?: string
  maxPhotos?: number
  includesEdit?: boolean
  features?: string[]
  categoryId?: string
}

export interface UpdatePackageData {
  name?: string
  description?: string
  duration?: number
  price?: number
  currency?: string
  maxPhotos?: number
  includesEdit?: boolean
  features?: string[]
  categoryId?: string
  status?: PackageStatus
  sortOrder?: number
}

export class PackageService {
  static async getServiceCategories(): Promise<ServiceCategory[]> {
    return getOrSetCache(`${PACKAGE_CACHE_PREFIX}service-categories:v1`, 180, async () => {
      const config = await db.systemConfig.findUnique({ where: { key: SERVICE_CATEGORIES_KEY } })
      if (!config) return DEFAULT_SERVICE_CATEGORIES

      try {
        const parsed = JSON.parse(config.value)
        if (!Array.isArray(parsed)) return DEFAULT_SERVICE_CATEGORIES

        const categories = parsed
          .filter((item) => item && typeof item.id === 'string' && typeof item.label === 'string')
          .map((item, index) => ({
            id: item.id,
            label: item.label,
            tagline: typeof item.tagline === 'string' ? item.tagline : '',
            icon: typeof item.icon === 'string' ? item.icon : 'camera',
            sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : index,
          })) as ServiceCategory[]

        return categories.length > 0
          ? categories.sort((a, b) => a.sortOrder - b.sortOrder)
          : DEFAULT_SERVICE_CATEGORIES
      } catch {
        return DEFAULT_SERVICE_CATEGORIES
      }
    })
  }

  static async setServiceCategories(categories: ServiceCategory[], updatedBy: string) {
    const normalized = categories
      .filter((c) => c.id.trim() && c.label.trim())
      .map((c, index) => ({
        id: c.id.trim(),
        label: c.label.trim(),
        tagline: c.tagline?.trim() || '',
        icon: c.icon || 'camera',
        sortOrder: Number.isFinite(c.sortOrder) ? c.sortOrder : index,
      }))

    await db.systemConfig.upsert({
      where: { key: SERVICE_CATEGORIES_KEY },
      create: {
        key: SERVICE_CATEGORIES_KEY,
        value: JSON.stringify(normalized),
        description: 'Configurable service categories for tabs and booking types',
        updatedBy,
      },
      update: {
        value: JSON.stringify(normalized),
        updatedBy,
      },
    })

    await invalidateCacheByPrefix(PACKAGE_CACHE_PREFIX)

    return normalized
  }

  private static async getPackageCategoryMap(): Promise<Record<string, string>> {
    return getOrSetCache(`${PACKAGE_CACHE_PREFIX}category-map:v1`, 180, async () => {
      const config = await db.systemConfig.findUnique({ where: { key: PACKAGE_CATEGORY_MAP_KEY } })
      if (!config) return {}

      try {
        const parsed = JSON.parse(config.value)
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {}
      } catch {
        return {}
      }
    })
  }

  private static async setPackageCategoryMap(map: Record<string, string>, updatedBy?: string) {
    await db.systemConfig.upsert({
      where: { key: PACKAGE_CATEGORY_MAP_KEY },
      create: {
        key: PACKAGE_CATEGORY_MAP_KEY,
        value: JSON.stringify(map),
        description: 'Package ID -> service category ID mapping',
        updatedBy,
      },
      update: {
        value: JSON.stringify(map),
        updatedBy,
      },
    })

    await invalidateCacheByPrefix(PACKAGE_CACHE_PREFIX)
  }

  private static inferCategoryFromName(name: string, availableCategoryIds: string[]): string {
    const normalized = name.toLowerCase()
    const includes = (v: string) => normalized.includes(v)

    if (availableCategoryIds.includes('weddings') && (includes('wedding') || includes('engagement') || includes('intimate'))) {
      return 'weddings'
    }
    if (availableCategoryIds.includes('fashion') && (includes('fashion') || includes('editorial') || includes('campaign') || includes('runway'))) {
      return 'fashion'
    }
    if (availableCategoryIds.includes('events') && (includes('event') || includes('corporate') || includes('party'))) {
      return 'events'
    }
    return availableCategoryIds[0] || 'default'
  }

  static async createPackage(data: CreatePackageData, createdBy: string) {
    const pkg = await db.package.create({
      data: {
        name: data.name,
        description: data.description,
        duration: data.duration,
        price: data.price,
        currency: data.currency || 'USD',
        maxPhotos: data.maxPhotos || 10,
        includesEdit: data.includesEdit || false,
        features: data.features ? JSON.stringify(data.features) : null,
        status: PackageStatus.ACTIVE,
      },
    })

    const categories = await this.getServiceCategories()
    const categoryMap = await this.getPackageCategoryMap()
    categoryMap[pkg.id] = data.categoryId || this.inferCategoryFromName(pkg.name, categories.map((c) => c.id))
    await this.setPackageCategoryMap(categoryMap, createdBy)

    await db.auditLog.create({
      data: {
        userId: createdBy,
        action: AuditAction.ADMIN_PACKAGE_UPDATE,
        entityType: 'Package',
        entityId: pkg.id,
        description: `Package "${pkg.name}" created`,
        newValues: JSON.stringify(data),
      },
    })

    await invalidateCacheByPrefix(PACKAGE_CACHE_PREFIX)

    return pkg
  }

  static async getPackageById(id: string) {
    const pkg = await db.package.findUnique({
      where: { id },
      include: {
        pricingRules: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { bookings: true },
        },
      },
    })

    if (!pkg) return pkg

    const categories = await this.getServiceCategories()
    const categoryMap = await this.getPackageCategoryMap()
    const categoryId = categoryMap[pkg.id] || this.inferCategoryFromName(pkg.name, categories.map((c) => c.id))

    return {
      ...pkg,
      features: pkg.features ? JSON.parse(pkg.features) : [],
      categoryId,
    }
  }

  static async getPackageCategoryId(packageId: string): Promise<string | null> {
    const pkg = await db.package.findUnique({
      where: { id: packageId },
      select: { id: true, name: true },
    })

    if (!pkg) return null

    const categories = await this.getServiceCategories()
    const categoryMap = await this.getPackageCategoryMap()
    return categoryMap[pkg.id] || this.inferCategoryFromName(pkg.name, categories.map((c) => c.id))
  }

  static async getPackageDurationAndCategory(
    packageId: string
  ): Promise<{ duration: number; categoryId: string | null } | null> {
    const pkg = await db.package.findUnique({
      where: { id: packageId },
      select: { id: true, name: true, duration: true },
    })

    if (!pkg) return null

    const categories = await this.getServiceCategories()
    const categoryMap = await this.getPackageCategoryMap()

    return {
      duration: pkg.duration,
      categoryId:
        categoryMap[pkg.id] || this.inferCategoryFromName(pkg.name, categories.map((c) => c.id)),
    }
  }

  static async getAllPackages(includeInactive = false) {
    const packages = await db.package.findMany({
      where: includeInactive ? undefined : { status: PackageStatus.ACTIVE },
      include: {
        pricingRules: {
          where: { isActive: true },
        },
        _count: {
          select: { bookings: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    })

    const categories = await this.getServiceCategories()
    const categoryMap = await this.getPackageCategoryMap()

    return packages.map((pkg) => ({
      ...pkg,
      features: pkg.features ? JSON.parse(pkg.features) : [],
      categoryId: categoryMap[pkg.id] || this.inferCategoryFromName(pkg.name, categories.map((c) => c.id)),
    }))
  }

  static async updatePackage(id: string, data: UpdatePackageData, updatedBy: string) {
    const oldPackage = await db.package.findUnique({ where: { id } })

    const updateData: Record<string, unknown> = { ...data }
    if (data.features) {
      updateData.features = JSON.stringify(data.features)
    }

    const pkg = await db.package.update({
      where: { id },
      data: updateData,
    })

    if (data.categoryId) {
      const categoryMap = await this.getPackageCategoryMap()
      categoryMap[id] = data.categoryId
      await this.setPackageCategoryMap(categoryMap, updatedBy)
    }

    await db.auditLog.create({
      data: {
        userId: updatedBy,
        action: AuditAction.ADMIN_PACKAGE_UPDATE,
        entityType: 'Package',
        entityId: id,
        description: `Package "${pkg.name}" updated`,
        oldValues: JSON.stringify(oldPackage),
        newValues: JSON.stringify(data),
      },
    })

    await invalidateCacheByPrefix(PACKAGE_CACHE_PREFIX)

    return pkg
  }

  static async deletePackage(id: string, deletedBy: string) {
    const pkg = await db.package.update({
      where: { id },
      data: { status: PackageStatus.ARCHIVED },
    })

    await db.auditLog.create({
      data: {
        userId: deletedBy,
        action: AuditAction.ADMIN_PACKAGE_UPDATE,
        entityType: 'Package',
        entityId: id,
        description: `Package "${pkg.name}" archived`,
      },
    })

    await invalidateCacheByPrefix(PACKAGE_CACHE_PREFIX)

    return pkg
  }

  static async calculatePrice(
    packageId: string,
    date: Date,
    dayOfWeek: number
  ): Promise<{ basePrice: number; finalPrice: number; discount: number; appliedRules: string[] }> {
    const pkg = await db.package.findUnique({
      where: { id: packageId },
      include: {
        pricingRules: {
          where: { isActive: true },
        },
      },
    })

    if (!pkg) {
      throw new Error('Package not found')
    }

    const basePrice = Number(pkg.price)
    let finalPrice = basePrice
    const appliedRules: string[] = []
    let totalDiscount = 0

    for (const rule of pkg.pricingRules) {
      // Check if rule applies to this day
      if (rule.dayOfWeek !== null && rule.dayOfWeek !== dayOfWeek) continue

      // Check date range
      if (rule.startDate && new Date(date) < new Date(rule.startDate)) continue
      if (rule.endDate && new Date(date) > new Date(rule.endDate)) continue

      // Apply modifier
      const oldPrice = finalPrice
      const modifier = Number(rule.priceModifier)
      switch (rule.modifierType) {
        case 'MULTIPLIER':
          finalPrice = finalPrice * modifier
          break
        case 'FIXED_ADD':
          finalPrice = finalPrice + modifier
          break
        case 'FIXED_SET':
          finalPrice = modifier
          break
      }

      if (finalPrice < oldPrice) {
        totalDiscount += oldPrice - finalPrice
      }

      appliedRules.push(rule.name)
    }

    return {
      basePrice,
      finalPrice: Math.round(finalPrice * 100) / 100,
      discount: Math.round(totalDiscount * 100) / 100,
      appliedRules,
    }
  }

  static async addPricingRule(
    packageId: string,
    data: {
      name: string
      dayOfWeek?: number
      startDate?: Date
      endDate?: Date
      priceModifier: number
      modifierType: 'MULTIPLIER' | 'FIXED_ADD' | 'FIXED_SET'
    },
    createdBy: string
  ) {
    const rule = await db.pricingRule.create({
      data: {
        packageId,
        name: data.name,
        dayOfWeek: data.dayOfWeek ?? null,
        startDate: data.startDate,
        endDate: data.endDate,
        priceModifier: data.priceModifier,
        modifierType: data.modifierType,
      },
    })

    await db.auditLog.create({
      data: {
        userId: createdBy,
        action: AuditAction.ADMIN_PRICING_CHANGE,
        entityType: 'PricingRule',
        entityId: rule.id,
        description: `Pricing rule "${rule.name}" added`,
        newValues: JSON.stringify(data),
      },
    })

    await invalidateCacheByPrefix(PACKAGE_CACHE_PREFIX)

    return rule
  }

  static async removePricingRule(ruleId: string, removedBy: string) {
    const rule = await db.pricingRule.update({
      where: { id: ruleId },
      data: { isActive: false },
    })

    await db.auditLog.create({
      data: {
        userId: removedBy,
        action: AuditAction.ADMIN_PRICING_CHANGE,
        entityType: 'PricingRule',
        entityId: ruleId,
        description: `Pricing rule "${rule.name}" deactivated`,
      },
    })

    await invalidateCacheByPrefix(PACKAGE_CACHE_PREFIX)

    return rule
  }
}
