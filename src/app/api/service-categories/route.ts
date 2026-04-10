import { apiResponse, apiError } from '@/lib/utils/api'
import { PackageService } from '@/lib/services/package.service'
import { NextRequest, NextResponse } from 'next/server'
import { getOrSetCache } from '@/lib/cache'
import { createHash } from 'crypto'

export async function GET(req: NextRequest) {
  try {
    const categories = await getOrSetCache('packages:service-categories:public:v1', 180, () =>
      PackageService.getServiceCategories()
    )

    const etag = `"${createHash('sha1').update(JSON.stringify(categories)).digest('hex')}"`
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=120, s-maxage=180, stale-while-revalidate=300',
        },
      })
    }

    const response = apiResponse(categories)
    response.headers.set('ETag', etag)
    response.headers.set('Cache-Control', 'public, max-age=120, s-maxage=180, stale-while-revalidate=300')
    return response
  } catch (error) {
    console.error('Service categories fetch error:', error)
    return apiError('Failed to fetch service categories', 500)
  }
}
