import { db } from '@/lib/db'
import { apiResponse, apiError } from '@/lib/utils/api'
import { getOrSetCache } from '@/lib/cache'
import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'

function toPublicAssetUrl(path: string | null | undefined): string | null {
  if (!path) return null

  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path
  }

  if (path.startsWith('/api/storage/')) {
    return path
  }

  const sanitized = path.replace(/^\/+/, '')
  return `/api/storage/${sanitized}`
}

function resolveCategory(packageName: string): 'weddings' | 'fashion' | 'events' {
  const name = packageName.toLowerCase()

  if (name.includes('wedding')) return 'weddings'
  if (name.includes('fashion') || name.includes('editorial') || name.includes('campaign') || name.includes('runway')) {
    return 'fashion'
  }

  return 'events'
}

export async function GET(req: NextRequest) {
  try {
    const data = await getOrSetCache('portfolio:feed:v1', 120, async () => {
      const photos = await db.photo.findMany({
        where: {
          isProcessed: true,
          collection: {
            status: { in: ['READY', 'DELIVERED'] },
            booking: {
              status: 'COMPLETED',
            },
          },
        },
        select: {
          id: true,
          publicId: true,
          originalName: true,
          previewPath: true,
          originalPath: true,
          width: true,
          height: true,
          collection: {
            select: {
              booking: {
                select: {
                  customerName: true,
                  package: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ uploadedAt: 'desc' }, { sortOrder: 'asc' }],
        take: 120,
      })

      return photos
        .map((photo) => {
          const imageUrl = toPublicAssetUrl(photo.previewPath) || toPublicAssetUrl(photo.originalPath)
          if (!imageUrl) return null

          const packageName = photo.collection.booking.package.name
          const category = resolveCategory(packageName)
          const title = packageName
          const subtitle = photo.collection.booking.customerName || 'Client session'

          let aspect: 'portrait' | 'landscape' | 'square' = 'landscape'
          if (photo.width && photo.height) {
            if (photo.width === photo.height) aspect = 'square'
            else if (photo.width < photo.height) aspect = 'portrait'
          }

          return {
            id: photo.id,
            publicId: photo.publicId,
            imageUrl,
            category,
            title,
            subtitle,
            aspect,
          }
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    })

    const etag = `"${createHash('sha1').update(JSON.stringify(data)).digest('hex')}"`
    if (req.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: etag,
          'Cache-Control': 'public, max-age=60, s-maxage=120, stale-while-revalidate=300',
        },
      })
    }

    const response = apiResponse(data)
    response.headers.set('ETag', etag)
    response.headers.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=300')
    return response
  } catch (error) {
    console.error('Portfolio fetch error:', error)
    return apiError('Failed to load portfolio photos', 500)
  }
}
