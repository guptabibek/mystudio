/**
 * Individual Photo Download API
 * Streams the original high-resolution file for download
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/utils/api'
import { createReadStream } from 'fs'
import { stat, access } from 'fs/promises'
import { join } from 'path'
import { Readable } from 'stream'
import mime from 'mime-types'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const photoId = request.nextUrl.searchParams.get('photoId')
    const token = request.nextUrl.searchParams.get('token')

    if (!photoId) {
      return NextResponse.json({ success: false, error: 'Photo ID required' }, { status: 400 })
    }

    // Authenticate via session or access link token
    let hasAccess = false
    let userId: string | null = null

    const user = await getAuthenticatedUser(request)
    if (user) {
      userId = user.id
      if (user.role === 'ADMIN') {
        hasAccess = true
      }
    }

    const photo = await db.photo.findUnique({
      where: { id: photoId },
      include: {
        collection: {
          include: {
            photoAccesses: userId ? { where: { userId } } : false,
            accessLinks: token ? { where: { token, isActive: true } } : false,
          },
        },
      },
    })

    if (!photo) {
      return NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404 })
    }

    // Check access: admin, user with PhotoAccess, or valid access link token
    if (!hasAccess) {
      if (userId && photo.collection.photoAccesses && photo.collection.photoAccesses.length > 0) {
        const accessRecord = photo.collection.photoAccesses[0]
        if (accessRecord.downloadLimit && accessRecord.downloadsUsed >= accessRecord.downloadLimit) {
          return NextResponse.json({ success: false, error: 'Download limit exceeded' }, { status: 403 })
        }
        hasAccess = true
      }

      if (!hasAccess && token && photo.collection.accessLinks && photo.collection.accessLinks.length > 0) {
        const link = photo.collection.accessLinks[0]
        if (link.expiresAt && new Date() > link.expiresAt) {
          return NextResponse.json({ success: false, error: 'Access link expired' }, { status: 403 })
        }
        if (link.maxAccesses && link.accessCount >= link.maxAccesses) {
          return NextResponse.json({ success: false, error: 'Access link limit reached' }, { status: 403 })
        }
        hasAccess = true

        // Increment access link usage
        await db.photoAccessLink.update({
          where: { id: link.id },
          data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
        })
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    // Resolve the file path
    const originalPath = photo.originalPath
    const isAbsolute = originalPath.startsWith('/') || /^[a-zA-Z]:/.test(originalPath)
    const filePath = isAbsolute ? originalPath : join(config.UPLOAD_DIR || './uploads', originalPath)

    try {
      await access(filePath)
    } catch {
      return NextResponse.json({ success: false, error: 'File not found on disk' }, { status: 404 })
    }

    const fileStat = await stat(filePath)
    const contentType = photo.mimeType || mime.lookup(filePath) || 'application/octet-stream'

    // Track download
    await db.$transaction([
      db.photo.update({
        where: { id: photoId },
        data: { downloadCount: { increment: 1 } },
      }),
      ...(userId
        ? [
            db.photoAccess.updateMany({
              where: { userId, collectionId: photo.collectionId },
              data: { downloadsUsed: { increment: 1 }, lastAccessedAt: new Date() },
            }),
          ]
        : []),
      db.photoAccessLog.create({
        data: {
          photoId,
          action: 'DOWNLOAD',
          ipAddress: request.headers.get('x-forwarded-for') || undefined,
          userAgent: request.headers.get('user-agent') || undefined,
        },
      }),
    ])

    // Stream the file
    const stream = createReadStream(filePath)
    const webStream = Readable.toWeb(stream) as ReadableStream

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': fileStat.size.toString(),
        'Content-Disposition': `attachment; filename="${encodeURIComponent(photo.originalName)}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Photo download error:', error)
    return NextResponse.json({ success: false, error: 'Download failed' }, { status: 500 })
  }
}
