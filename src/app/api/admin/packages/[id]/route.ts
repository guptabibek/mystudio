import { NextRequest } from 'next/server'
import { PackageStatus } from '@prisma/client'
import { PackageService } from '@/lib/services/package.service'
import { apiResponse, requireAdmin, apiError } from '@/lib/utils/api'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin(req)
    const { id } = await context.params
    const body = await req.json()

    const updateData: {
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
    } = {}

    if (typeof body.name === 'string') updateData.name = body.name
    if (typeof body.description === 'string' || body.description === null) {
      updateData.description = body.description || undefined
    }
    if (typeof body.duration === 'number') updateData.duration = body.duration
    if (typeof body.price === 'number') updateData.price = body.price
    if (typeof body.currency === 'string') updateData.currency = body.currency
    if (typeof body.maxPhotos === 'number') updateData.maxPhotos = body.maxPhotos
    if (typeof body.includesEdit === 'boolean') updateData.includesEdit = body.includesEdit
    if (Array.isArray(body.features)) updateData.features = body.features.filter((f) => typeof f === 'string')
    if (typeof body.categoryId === 'string' && body.categoryId.trim()) updateData.categoryId = body.categoryId.trim()
    if (typeof body.sortOrder === 'number') updateData.sortOrder = body.sortOrder
    if (body.status && Object.values(PackageStatus).includes(body.status)) {
      updateData.status = body.status
    }

    if (Object.keys(updateData).length === 0) {
      return apiError('No valid fields provided for update', 400)
    }

    const pkg = await PackageService.updatePackage(id, updateData, user.id)
    return apiResponse(pkg)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Unauthorized', 401)
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return apiError('Admin access required', 403)
    }
    console.error('Package update error:', error)
    return apiError('Failed to update package', 500)
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await requireAdmin(req)
    const { id } = await context.params

    const pkg = await PackageService.updatePackage(id, { status: PackageStatus.ARCHIVED }, user.id)
    return apiResponse(pkg)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Unauthorized', 401)
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return apiError('Admin access required', 403)
    }
    console.error('Package archive error:', error)
    return apiError('Failed to archive package', 500)
  }
}
