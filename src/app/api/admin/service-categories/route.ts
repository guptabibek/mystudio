import { NextRequest } from 'next/server'
import { apiResponse, apiError, requireAdmin, withErrorHandler } from '@/lib/utils/api'
import { PackageService, type ServiceCategory } from '@/lib/services/package.service'

async function GET(req: NextRequest) {
  await requireAdmin(req)
  const categories = await PackageService.getServiceCategories()
  return apiResponse(categories)
}

async function PUT(req: NextRequest) {
  const user = await requireAdmin(req)
  const body = await req.json()
  const categories = Array.isArray(body?.categories) ? body.categories : null

  if (!categories) {
    return apiError('categories array is required', 400)
  }

  const normalized: ServiceCategory[] = categories
    .map((c: { id?: unknown; label?: unknown; tagline?: unknown; icon?: unknown; sortOrder?: unknown }, index: number) => ({
      id: typeof c.id === 'string' ? c.id.trim() : '',
      label: typeof c.label === 'string' ? c.label.trim() : '',
      tagline: typeof c.tagline === 'string' ? c.tagline.trim() : '',
      icon: typeof c.icon === 'string' ? c.icon : 'camera',
      sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : index,
    }))
    .filter((c) => c.id && c.label)

  if (normalized.length === 0) {
    return apiError('At least one category with id and label is required', 400)
  }

  const saved = await PackageService.setServiceCategories(normalized, user.id)
  return apiResponse(saved)
}

export const GET_HANDLER = withErrorHandler(GET)
export const PUT_HANDLER = withErrorHandler(PUT)
export { GET_HANDLER as GET, PUT_HANDLER as PUT }
