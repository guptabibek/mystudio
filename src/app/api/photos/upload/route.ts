/**
 * Photo Upload API Route
 * Handles photo uploads with validation, processing, and storage
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { storageService } from '@/lib/services/storage'
import { FileValidator, InputSanitizer } from '@/lib/services/validation'
import { rateLimitService } from '@/lib/services/rate-limit'
import { rateLimits } from '@/lib/config'
import { requireAuth } from '@/lib/utils/api'

// Maximum files per upload batch
const MAX_FILES = 100
const MAX_TOTAL_SIZE = 2 * 1024 * 1024 * 1024 // 2GB total per batch (high-res DSLR)

// Increase body size limit for Next.js route handler
export const maxDuration = 300 // 5 min timeout for large uploads
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request)

    // Only admins can upload photos
    if (user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      )
    }

    // Check rate limit
    const rateResult = await rateLimitService.enforceLimit(
      user.id,
      rateLimits.upload
    )

    if (!rateResult.allowed) {
      return NextResponse.json(
        { success: false, error: rateResult.error },
        { status: 429, headers: rateResult.headers }
      )
    }

    // Parse multipart form data
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const bookingId = formData.get('bookingId') as string

    if (!bookingId) {
      return NextResponse.json(
        { success: false, error: 'Booking ID is required' },
        { status: 400 }
      )
    }

    if (!files || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No files provided' },
        { status: 400 }
      )
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, error: `Maximum ${MAX_FILES} files allowed per upload` },
        { status: 400 }
      )
    }

    // Validate booking exists
    const booking = await db.booking.findUnique({
      where: { id: bookingId },
    })

    if (!booking) {
      return NextResponse.json(
        { success: false, error: 'Booking not found' },
        { status: 404 }
      )
    }

    // Check total size
    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    if (totalSize > MAX_TOTAL_SIZE) {
      return NextResponse.json(
        { success: false, error: `Total upload size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB` },
        { status: 400 }
      )
    }

    // Process each file
    const results: Array<{
      filename: string
      mimeType: string
      key: string
      url: string
      publicId: string
      size: number
      width?: number
      height?: number
    }> = []
    const errors: Array<{
      filename: string
      errors: string[]
    }> = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      try {
        // Validate file
        const validation = FileValidator.validateImage({
          name: file.name,
          size: file.size,
          mimeType: file.type,
        })

        if (!validation.valid) {
          errors.push({
            filename: file.name,
            errors: validation.errors,
          })
          continue
        }

        // Read file content
        const buffer = Buffer.from(await file.arrayBuffer())

        // Upload to storage
        const uploadResult = await storageService.upload(buffer, {
          filename: InputSanitizer.sanitizeFilename(file.name),
          mimeType: file.type,
          prefix: `photos/${bookingId}/original`,
          size: file.size,
          generateThumbnail: true,
          generatePreview: true,
        })

        results.push({
          filename: file.name,
          mimeType: file.type,
          key: uploadResult.key,
          url: uploadResult.url,
          publicId: uploadResult.publicId,
          size: uploadResult.size,
          width: uploadResult.width,
          height: uploadResult.height,
        })
      } catch (error) {
        errors.push({
          filename: file.name,
          errors: [error instanceof Error ? error.message : 'Upload failed'],
        })
      }
    }

    // Create or update photo collection
    if (results.length > 0) {
      const existingCollection = await db.photoCollection.findUnique({
        where: { bookingId },
      })
      let collectionId = existingCollection?.id

      if (existingCollection) {
        // Add photos to existing collection
        await db.photoCollection.update({
          where: { id: existingCollection.id },
          data: {
            totalPhotos: { increment: results.length },
            processedPhotos: { increment: results.length },
            status: 'READY',
          },
        })
      } else {
        // Create new collection
        const collection = await db.photoCollection.create({
          data: {
            bookingId,
            uploadedBy: user.id,
            totalPhotos: results.length,
            processedPhotos: results.length,
            status: 'READY',
          },
        })
        collectionId = collection.id
      }

      // Create photo records in database
      if (!collectionId) {
        throw new Error('Photo collection initialization failed')
      }

      for (const [index, result] of results.entries()) {
        const thumbnailPath = result.key
          .replace('/original/', '/thumbnail/')
          .replace(/\.[^.]+$/, '.webp')
        const previewPath = result.key
          .replace('/original/', '/preview/')
          .replace(/\.[^.]+$/, '.jpg')

        await db.photo.create({
          data: {
            collectionId,
            filename: result.filename,
            originalName: result.filename,
            mimeType: result.mimeType,
            fileSize: result.size,
            originalPath: result.key,
            previewPath,
            thumbnailPath,
            width: result.width,
            height: result.height,
            publicId: result.publicId,
            isProcessed: true,
            sortOrder: index,
          },
        })
      }
    }

    // Log the upload
    await db.auditLog.create({
      data: {
        userId: user.id,
        action: 'ADMIN_PHOTO_UPLOAD',
        entityType: 'PhotoCollection',
        entityId: bookingId,
        description: `Uploaded ${results.length} photos for booking ${booking.bookingNumber}`,
        ipAddress: request.headers.get('x-forwarded-for') || 'unknown',
        userAgent: request.headers.get('user-agent') || 'unknown',
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        uploaded: results.length,
        failed: errors.length,
        results,
        errors: errors.length > 0 ? errors : undefined,
      },
    })
  } catch (error) {
    console.error('Photo upload error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }
    return NextResponse.json(
      { success: false, error: 'Failed to upload photos' },
      { status: 500 }
    )
  }
}
