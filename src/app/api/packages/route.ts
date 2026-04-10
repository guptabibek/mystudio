import { NextRequest, NextResponse } from 'next/server'
import { PackageService } from '@/lib/services/package.service'
import { apiResponse, apiError, withErrorHandler, requireAdmin } from '@/lib/utils/api'
import { getOrSetCache } from '@/lib/cache'
import { createHash } from 'crypto'

async function GET(req: NextRequest) {
  const packages = await getOrSetCache('packages:public-list:v1', 120, () =>
    PackageService.getAllPackages()
  )

  const etag = `"${createHash('sha1').update(JSON.stringify(packages)).digest('hex')}"`
  if (req.headers.get('if-none-match') === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
      },
    })
  }

  const response = apiResponse(packages)
  response.headers.set('ETag', etag)
  response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300')
  return response
}

async function POST(req: NextRequest) {
  const user = await requireAdmin(req)
  const body = await req.json()

  const { name, description, duration, price, currency, maxPhotos, includesEdit, features, categoryId } = body

  if (!name || !duration || !price) {
    return apiError('Name, duration, and price are required')
  }

  const pkg = await PackageService.createPackage(
    {
      name,
      description,
      duration,
      price,
      currency,
      maxPhotos,
      includesEdit,
      features,
      categoryId,
    },
    user.id
  )

  return apiResponse(pkg, 201)
}

export const GET_HANDLER = withErrorHandler(GET)
export const POST_HANDLER = withErrorHandler(POST)
export { GET_HANDLER as GET, POST_HANDLER as POST }
