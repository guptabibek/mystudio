import { NextRequest } from 'next/server'
import { PackageService } from '@/lib/services/package.service'
import { apiResponse, apiError, withErrorHandler, requireAdmin } from '@/lib/utils/api'

async function GET(req: NextRequest) {
  await requireAdmin(req)
  const packages = await PackageService.getAllPackages(true)
  return apiResponse(packages)
}

async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  const body = await req.json()

  const { name, description, duration, price, currency, maxPhotos, includesEdit, features, categoryId } = body

  if (!name || !duration || !price) {
    return apiError('Name, duration, and price are required')
  }

  const pkg = await PackageService.createPackage(
    { name, description, duration, price, currency, maxPhotos, includesEdit, features, categoryId },
    user.id
  )

  return apiResponse(pkg, 201)
}

export const GET_HANDLER = withErrorHandler(GET)
export const POST_HANDLER = withErrorHandler(POST)
export { GET_HANDLER as GET, POST_HANDLER as POST }
