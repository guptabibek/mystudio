/**
 * Photo Collections API
 * 
 * GET  — List collections (admin: all, user: only accessible ones)
 * GET  ?id=xxx — Get single collection with photos
 * GET  ?token=xxx — Access via shared link
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/utils/api'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const collectionId = request.nextUrl.searchParams.get('id')
    const token = request.nextUrl.searchParams.get('token')
    const bookingId = request.nextUrl.searchParams.get('bookingId')
    const page = parseInt(request.nextUrl.searchParams.get('page') || '1', 10)
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '20', 10), 100)
    const skip = (page - 1) * limit

    const user = await getAuthenticatedUser(request)

    // ---- Access via shared link token ----
    if (token) {
      const link = await db.photoAccessLink.findUnique({
        where: { token },
        include: {
          collection: {
            include: {
              booking: { select: { bookingNumber: true, customerName: true, sessionDate: true } },
              photos: {
                orderBy: { sortOrder: 'asc' },
                select: {
                  id: true,
                  publicId: true,
                  originalName: true,
                  mimeType: true,
                  fileSize: true,
                  width: true,
                  height: true,
                  thumbnailPath: true,
                  previewPath: true,
                  originalPath: true,
                  sortOrder: true,
                },
              },
              _count: { select: { photos: true } },
            },
          },
        },
      })

      if (!link || !link.isActive) {
        return NextResponse.json({ success: false, error: 'Invalid or deactivated access link' }, { status: 403 })
      }
      if (link.expiresAt && new Date() > link.expiresAt) {
        return NextResponse.json({ success: false, error: 'Access link has expired' }, { status: 403 })
      }
      if (link.maxAccesses && link.accessCount >= link.maxAccesses) {
        return NextResponse.json({ success: false, error: 'Access link limit reached' }, { status: 403 })
      }

      // Bump view count
      await db.photoAccessLink.update({
        where: { id: link.id },
        data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
      })

      const col = link.collection

      return NextResponse.json({
        success: true,
        data: {
          collection: {
            id: col.id,
            status: col.status,
            totalPhotos: col._count.photos,
            booking: {
              bookingNumber: col.booking.bookingNumber,
              customerName: col.booking.customerName,
              bookingDate: col.booking.sessionDate,
            },
            photos: col.photos.map(p => ({
              ...p,
              thumbnailUrl: p.thumbnailPath ? `/api/storage/${p.thumbnailPath}` : undefined,
              previewUrl: p.previewPath ? `/api/storage/${p.previewPath}` : undefined,
              downloadUrl: `/api/photos/download?photoId=${p.id}&token=${token}`,
            })),
          },
          downloadAllUrl: `/api/photos/download-zip?collectionId=${col.id}&token=${token}`,
        },
      })
    }

    // ---- Authenticated routes ----
    if (!user) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }

    // ---- Single collection by ID or bookingId ----
    if (collectionId || bookingId) {
      const where = collectionId ? { id: collectionId } : { bookingId: bookingId! }
      const collection = await db.photoCollection.findUnique({
        where,
        include: {
          booking: {
            select: { id: true, bookingNumber: true, customerName: true, sessionDate: true, userId: true },
          },
          photos: {
            orderBy: { sortOrder: 'asc' },
            select: {
              id: true,
              publicId: true,
              originalName: true,
              mimeType: true,
              fileSize: true,
              width: true,
              height: true,
              thumbnailPath: true,
              previewPath: true,
              originalPath: true,
              sortOrder: true,
              viewCount: true,
              downloadCount: true,
            },
          },
          _count: { select: { photos: true } },
        },
      })

      if (!collection) {
        return NextResponse.json({ success: false, error: 'Collection not found' }, { status: 404 })
      }

      // Access: admin or the booking's customer
      if (user.role !== 'ADMIN' && collection.booking.userId !== user.id) {
        // Check explicit PhotoAccess
        const accessRecord = await db.photoAccess.findUnique({
          where: { userId_collectionId: { userId: user.id, collectionId: collection.id } },
        })
        if (!accessRecord) {
          return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
        }
      }

      return NextResponse.json({
        success: true,
        data: {
          collection: {
            id: collection.id,
            status: collection.status,
            totalPhotos: collection._count.photos,
            totalSize: collection.photos.reduce((s, p) => s + p.fileSize, 0),
            booking: {
              id: collection.booking.id,
              bookingNumber: collection.booking.bookingNumber,
              customerName: collection.booking.customerName,
              bookingDate: collection.booking.sessionDate,
            },
            photos: collection.photos.map(p => ({
              ...p,
              thumbnailUrl: p.thumbnailPath ? `/api/storage/${p.thumbnailPath}` : undefined,
              previewUrl: p.previewPath ? `/api/storage/${p.previewPath}` : undefined,
              originalUrl: user.role === 'ADMIN' ? `/api/storage/${p.originalPath}` : undefined,
              downloadUrl: `/api/photos/download?photoId=${p.id}`,
            })),
          },
          downloadAllUrl: `/api/photos/download-zip?collectionId=${collection.id}`,
        },
      })
    }

    // ---- List collections ----
    if (user.role === 'ADMIN') {
      const status = request.nextUrl.searchParams.get('status') || undefined
      const where: Record<string, unknown> = {}
      if (status) where.status = status

      const [collections, total] = await Promise.all([
        db.photoCollection.findMany({
          where,
          skip,
          take: limit,
          include: {
            booking: {
              select: { bookingNumber: true, customerName: true, sessionDate: true },
            },
            _count: { select: { photos: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        db.photoCollection.count({ where }),
      ])

      return NextResponse.json({
        success: true,
        data: collections.map(c => ({
          id: c.id,
          status: c.status,
          totalPhotos: c._count.photos,
          downloadCount: c.downloadCount,
          booking: {
            bookingNumber: c.booking.bookingNumber,
            customerName: c.booking.customerName,
            bookingDate: c.booking.sessionDate,
          },
          createdAt: c.createdAt,
        })),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      })
    }

    // Regular user — show their accessible collections
    const accesses = await db.photoAccess.findMany({
      where: { userId: user.id },
      include: {
        collection: {
          include: {
            booking: { select: { bookingNumber: true, customerName: true, sessionDate: true } },
            photos: {
              select: { id: true, thumbnailPath: true },
              take: 4,
              orderBy: { sortOrder: 'asc' },
            },
            _count: { select: { photos: true } },
          },
        },
      },
      orderBy: { accessGrantedAt: 'desc' },
      skip,
      take: limit,
    })

    return NextResponse.json({
      success: true,
      data: accesses.map(a => ({
        id: a.collection.id,
        status: a.collection.status,
        totalPhotos: a.collection._count.photos,
        booking: {
          bookingNumber: a.collection.booking.bookingNumber,
          customerName: a.collection.booking.customerName,
          bookingDate: a.collection.booking.sessionDate,
        },
        downloadsUsed: a.downloadsUsed,
        downloadLimit: a.downloadLimit,
        previews: a.collection.photos.map(p => ({
          id: p.id,
          thumbnailUrl: p.thumbnailPath ? `/api/storage/${p.thumbnailPath}` : undefined,
        })),
        createdAt: a.accessGrantedAt,
      })),
    })
  } catch (error) {
    console.error('Collections API error:', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch collections' }, { status: 500 })
  }
}
