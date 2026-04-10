import { NextRequest } from 'next/server'
import { apiError, apiResponse, requireAdmin } from '@/lib/utils/api'
import { AvailabilityService, type CategoryAvailabilityTemplate } from '@/lib/services/availability.service'
import { PackageService } from '@/lib/services/package.service'

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)
    const [categories, templates] = await Promise.all([
      PackageService.getServiceCategories(),
      AvailabilityService.getCategoryAvailabilityTemplates(),
    ])

    return apiResponse({ categories, templates })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return apiError('Admin access required', 403)
    }
    console.error('Get availability templates error:', error)
    return apiError('Failed to fetch availability templates', 500)
  }
}

export async function PUT(req: NextRequest) {
  try {
    const user = await requireAdmin(req)
    const body = await req.json()

    const templates = Array.isArray(body?.templates) ? body.templates : null
    if (!templates) {
      return apiError('templates array is required', 400)
    }

    const normalized: CategoryAvailabilityTemplate[] = templates
      .map((template: { categoryId?: unknown; rules?: unknown[] }) => ({
        categoryId: typeof template.categoryId === 'string' ? template.categoryId.trim() : '',
        rules: Array.isArray(template.rules)
          ? (template.rules as Array<Record<string, unknown>>)
              .map((rule) => ({
                dayOfWeek: String(rule.dayOfWeek || '') as CategoryAvailabilityTemplate['rules'][number]['dayOfWeek'],
                startTime: typeof rule.startTime === 'string' ? rule.startTime : '',
                endTime: typeof rule.endTime === 'string' ? rule.endTime : '',
                slotDuration: typeof rule.slotDuration === 'number' ? rule.slotDuration : 60,
                bufferTime: typeof rule.bufferTime === 'number' ? rule.bufferTime : 15,
              }))
              .filter((rule) => rule.dayOfWeek && rule.startTime && rule.endTime)
          : [],
      }))
      .filter((template: CategoryAvailabilityTemplate) => template.categoryId)

    const saved = await AvailabilityService.setCategoryAvailabilityTemplates(normalized, user.id)
    return apiResponse(saved)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return apiError('Admin access required', 403)
    }
    console.error('Save availability templates error:', error)
    return apiError('Failed to save availability templates', 500)
  }
}
