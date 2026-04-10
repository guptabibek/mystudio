/**
 * Bulk Photo Download as ZIP
 * Streams a ZIP archive of all original high-resolution photos in a collection
 * Uses archiver for streaming — never buffers entire archive in memory
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/utils/api'
import { createReadStream } from 'fs'
import { access } from 'fs/promises'
import { join } from 'path'
import archiver from 'archiver'
import { PassThrough, Readable } from 'stream'
import { config } from '@/lib/config'

export const dynamic = 'force-dynamic'
export const maxDuration = 600 // 10 min for large archives

export async function GET(request: NextRequest) {
  try {
    const collectionId = request.nextUrl.searchParams.get('collectionId')
    const token = request.nextUrl.searchParams.get('token')

    if (!collectionId) {
      return NextResponse.json({ success: false, error: 'Collection ID required' }, { status: 400 })
    }

    // Authenticate
    let hasAccess = false
    let userId: string | null = null

    const user = await getAuthenticatedUser(request)
    if (user) {
      userId = user.id
      if (user.role === 'ADMIN') hasAccess = true
    }

    const collection = await db.photoCollection.findUnique({
      where: { id: collectionId },
      include: {
        booking: { select: { bookingNumber: true, customerName: true } },
        photos: { orderBy: { sortOrder: 'asc' } },
        photoAccesses: userId ? { where: { userId } } : false,
        accessLinks: token ? { where: { token, isActive: true } } : false,
      },
    })

    if (!collection) {
      return NextResponse.json({ success: false, error: 'Collection not found' }, { status: 404 })
    }

    // Check access
    if (!hasAccess) {
      if (userId && collection.photoAccesses && collection.photoAccesses.length > 0) {
        hasAccess = true
      }
      if (!hasAccess && token && collection.accessLinks && collection.accessLinks.length > 0) {
        const link = collection.accessLinks[0]
        if (link.expiresAt && new Date() > link.expiresAt) {
          return NextResponse.json({ success: false, error: 'Access link expired' }, { status: 403 })
        }
        if (link.maxAccesses && link.accessCount >= link.maxAccesses) {
          return NextResponse.json({ success: false, error: 'Access link limit reached' }, { status: 403 })
        }
        hasAccess = true

        await db.photoAccessLink.update({
          where: { id: link.id },
          data: { accessCount: { increment: 1 }, lastAccessedAt: new Date() },
        })
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 })
    }

    if (collection.photos.length === 0) {
      return NextResponse.json({ success: false, error: 'No photos in this collection' }, { status: 404 })
    }

    // Verify all files exist before starting the archive
    const validPhotos: typeof collection.photos = []
    for (const photo of collection.photos) {
      const isAbsolute = photo.originalPath.startsWith('/') || /^[a-zA-Z]:/.test(photo.originalPath)
      const filePath = isAbsolute ? photo.originalPath : join(config.UPLOAD_DIR || './uploads', photo.originalPath)
      try {
        await access(filePath)
        validPhotos.push(photo)
      } catch {
        // Skip missing files
        console.warn(`ZIP: skipping missing file ${photo.originalPath}`)
      }
    }

    if (validPhotos.length === 0) {
      return NextResponse.json({ success: false, error: 'No photo files available' }, { status: 404 })
    }

    // Track the bulk download
    await db.photoCollection.update({
      where: { id: collectionId },
      data: { downloadCount: { increment: 1 } },
    })

    // Log downloads for each photo
    await db.photoAccessLog.createMany({
      data: validPhotos.map(p => ({
        photoId: p.id,
        action: 'DOWNLOAD',
        ipAddress: request.headers.get('x-forwarded-for') || undefined,
        userAgent: request.headers.get('user-agent') || undefined,
      })),
    })

    // Build a streaming ZIP
    const passThrough = new PassThrough()
    const archive = archiver('zip', {
      zlib: { level: 1 }, // Minimal compression — JPEGs are already compressed; speed > size
    })

    archive.on('error', (err) => {
      console.error('Archive error:', err)
      passThrough.destroy(err)
    })

    archive.pipe(passThrough)

    // Add each original file to the archive, preserving original filenames
    const usedNames = new Set<string>()
    for (const photo of validPhotos) {
      const isAbsolute = photo.originalPath.startsWith('/') || /^[a-zA-Z]:/.test(photo.originalPath)
      const filePath = isAbsolute ? photo.originalPath : join(config.UPLOAD_DIR || './uploads', photo.originalPath)

      // Deduplicate filenames within the archive
      let archiveName = photo.originalName
      if (usedNames.has(archiveName.toLowerCase())) {
        const ext = archiveName.includes('.') ? '.' + archiveName.split('.').pop() : ''
        const base = archiveName.replace(/\.[^.]+$/, '')
        let counter = 1
        while (usedNames.has(`${base}_${counter}${ext}`.toLowerCase())) counter++
        archiveName = `${base}_${counter}${ext}`
      }
      usedNames.add(archiveName.toLowerCase())

      archive.append(createReadStream(filePath), { name: archiveName })
    }

    // Finalize the archive (starts streaming)
    archive.finalize()

    const webStream = Readable.toWeb(passThrough) as ReadableStream

    const zipName = `${collection.booking.bookingNumber || 'photos'}-originals.zip`

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(zipName)}"`,
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'private, no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('ZIP download error:', error)
    return NextResponse.json({ success: false, error: 'ZIP download failed' }, { status: 500 })
  }
}
