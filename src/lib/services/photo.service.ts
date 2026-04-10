import { db } from '@/lib/db'
import { PhotoCollectionStatus, AuditAction, BookingStatus } from '@prisma/client'
import { v4 as uuidv4 } from 'uuid'
import { randomBytes } from 'crypto'
import { mkdir, writeFile, unlink, access } from 'fs/promises'
import { join } from 'path'
import { invalidateCacheByPrefix } from '@/lib/cache'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'photos')

export interface UploadPhotoData {
  collectionId: string
  filename: string
  originalName: string
  mimeType: string
  fileSize: number
  fileBuffer: Buffer
  width?: number
  height?: number
}

export interface CreatePhotoCollectionData {
  bookingId: string
  uploadedBy: string
}

export class PhotoService {
  // Initialize upload directory
  static async initializeStorage() {
    try {
      await access(UPLOAD_DIR)
    } catch {
      await mkdir(UPLOAD_DIR, { recursive: true })
    }
  }

  // ==================== COLLECTION MANAGEMENT ====================
  static async createPhotoCollection(data: CreatePhotoCollectionData) {
    const booking = await db.booking.findUnique({
      where: { id: data.bookingId },
    })

    if (!booking) {
      throw new Error('Booking not found')
    }

    // Check if collection already exists
    const existing = await db.photoCollection.findUnique({
      where: { bookingId: data.bookingId },
    })

    if (existing) {
      return existing
    }

    const collection = await db.photoCollection.create({
      data: {
        bookingId: data.bookingId,
        uploadedBy: data.uploadedBy,
        status: PhotoCollectionStatus.PENDING,
        totalPhotos: 0,
        processedPhotos: 0,
      },
    })

    await db.auditLog.create({
      data: {
        userId: data.uploadedBy,
        action: AuditAction.ADMIN_PHOTO_UPLOAD,
        entityType: 'PhotoCollection',
        entityId: collection.id,
        description: `Photo collection created for booking ${booking.bookingNumber}`,
      },
    })

    return collection
  }

  static async getCollectionById(id: string) {
    return db.photoCollection.findUnique({
      where: { id },
      include: {
        booking: {
          include: {
            package: true,
            user: { select: { id: true, email: true, name: true } },
          },
        },
        photos: {
          orderBy: { sortOrder: 'asc' },
        },
        accessLinks: { where: { isActive: true } },
      },
    })
  }

  static async getCollectionByBookingId(bookingId: string) {
    return db.photoCollection.findUnique({
      where: { bookingId },
      include: {
        booking: {
          include: { package: true },
        },
        photos: {
          orderBy: { sortOrder: 'asc' },
        },
      },
    })
  }

  static async updateCollectionStatus(
    collectionId: string,
    status: PhotoCollectionStatus,
    updatedBy: string
  ) {
    const collection = await db.photoCollection.update({
      where: { id: collectionId },
      data: { status },
    })

    if (status === PhotoCollectionStatus.READY || status === PhotoCollectionStatus.DELIVERED) {
      await invalidateCacheByPrefix('portfolio:')
    }

    return collection
  }

  // ==================== PHOTO UPLOAD ====================
  static async uploadPhoto(data: UploadPhotoData) {
    await this.initializeStorage()

    const publicId = uuidv4()
    const ext = data.originalName.split('.').pop() || 'jpg'
    const storedFilename = `${publicId}.${ext}`

    // Create collection directory
    const collectionDir = join(UPLOAD_DIR, data.collectionId)
    await mkdir(collectionDir, { recursive: true })

    // Store original file
    const originalPath = join(collectionDir, storedFilename)
    await writeFile(originalPath, data.fileBuffer)

    // For production: generate thumbnails and previews using image processing
    // For now, we'll use the same file
    const previewPath = join(collectionDir, `preview_${storedFilename}`)
    const thumbnailPath = join(collectionDir, `thumb_${storedFilename}`)

    // Copy files for preview and thumbnail (in production, resize appropriately)
    await writeFile(previewPath, data.fileBuffer)
    await writeFile(thumbnailPath, data.fileBuffer)

    const photo = await db.photo.create({
      data: {
        collectionId: data.collectionId,
        filename: storedFilename,
        originalName: data.originalName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        originalPath,
        previewPath,
        thumbnailPath,
        width: data.width,
        height: data.height,
        publicId,
        isProcessed: true,
      },
    })

    // Update collection stats
    await db.photoCollection.update({
      where: { id: data.collectionId },
      data: {
        totalPhotos: { increment: 1 },
        processedPhotos: { increment: 1 },
        status: PhotoCollectionStatus.UPLOADING,
      },
    })

    await invalidateCacheByPrefix('portfolio:')

    return photo
  }

  static async bulkUploadPhotos(collectionId: string, photos: UploadPhotoData[]) {
    const results = []

    for (const photoData of photos) {
      try {
        const photo = await this.uploadPhoto({ ...photoData, collectionId })
        results.push({ success: true, photo })
      } catch (error) {
        results.push({
          success: false,
          filename: photoData.originalName,
          error: error instanceof Error ? error.message : 'Upload failed',
        })
      }
    }

    // Update collection status
    await db.photoCollection.update({
      where: { id: collectionId },
      data: { status: PhotoCollectionStatus.READY },
    })

    await invalidateCacheByPrefix('portfolio:')

    return results
  }

  static async deletePhoto(photoId: string, deletedBy: string) {
    const photo = await db.photo.findUnique({
      where: { id: photoId },
    })

    if (!photo) {
      throw new Error('Photo not found')
    }

    // Delete files
    try {
      await unlink(photo.originalPath)
      if (photo.previewPath) await unlink(photo.previewPath)
      if (photo.thumbnailPath) await unlink(photo.thumbnailPath)
    } catch {
      // Ignore file deletion errors
    }

    // Delete database record
    await db.photo.delete({
      where: { id: photoId },
    })

    // Update collection stats
    await db.photoCollection.update({
      where: { id: photo.collectionId },
      data: {
        totalPhotos: { decrement: 1 },
        processedPhotos: { decrement: 1 },
      },
    })

    await db.auditLog.create({
      data: {
        userId: deletedBy,
        action: AuditAction.ADMIN_PHOTO_DELETE,
        entityType: 'Photo',
        entityId: photoId,
        description: `Photo deleted from collection`,
      },
    })

    await invalidateCacheByPrefix('portfolio:')
  }

  // ==================== ACCESS MANAGEMENT ====================
  static async createAccessLink(
    collectionId: string,
    createdBy: string,
    options?: {
      maxAccesses?: number
      expiresInHours?: number
    }
  ) {
    const token = randomBytes(32).toString('hex')
    const appBaseUrl = (
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.NEXTAUTH_URL ||
      'http://localhost:3000'
    ).replace(/\/$/, '')

    const expiresAt = options?.expiresInHours
      ? new Date(Date.now() + options.expiresInHours * 60 * 60 * 1000)
      : undefined

    const link = await db.photoAccessLink.create({
      data: {
        collectionId,
        token,
        createdBy,
        maxAccesses: options?.maxAccesses,
        expiresAt,
      },
    })

    return {
      id: link.id,
      token: link.token,
      accessUrl: `${appBaseUrl}/photos/access/${token}`,
      expiresAt: link.expiresAt,
    }
  }

  static async validateAccessLink(token: string) {
    const link = await db.photoAccessLink.findUnique({
      where: { token },
      include: {
        collection: {
          include: {
            photos: {
              orderBy: { sortOrder: 'asc' },
              select: {
                id: true,
                publicId: true,
                originalName: true,
                thumbnailPath: true,
                previewPath: true,
                width: true,
                height: true,
                mimeType: true,
              },
            },
            booking: {
              include: { package: true },
            },
          },
        },
      },
    })

    if (!link) {
      throw new Error('Invalid access link')
    }

    if (!link.isActive) {
      throw new Error('This access link has been deactivated')
    }

    if (link.expiresAt && new Date() > link.expiresAt) {
      throw new Error('This access link has expired')
    }

    if (link.maxAccesses && link.accessCount >= link.maxAccesses) {
      throw new Error('This access link has reached its maximum access limit')
    }

    // Update access count
    await db.photoAccessLink.update({
      where: { id: link.id },
      data: {
        accessCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    })

    return link
  }

  static async grantUserAccess(collectionId: string, userId: string, downloadLimit?: number) {
    return db.photoAccess.upsert({
      where: {
        userId_collectionId: {
          userId,
          collectionId,
        },
      },
      create: {
        userId,
        collectionId,
        downloadLimit,
      },
      update: {
        downloadLimit,
        lastAccessedAt: new Date(),
      },
    })
  }

  static async getPhotoForDownload(photoId: string, userId: string) {
    const photo = await db.photo.findUnique({
      where: { id: photoId },
      include: {
        collection: {
          include: {
            photoAccesses: { where: { userId } },
          },
        },
      },
    })

    if (!photo) {
      throw new Error('Photo not found')
    }

    const access = photo.collection.photoAccesses[0]
    if (!access) {
      throw new Error('You do not have access to this photo')
    }

    if (access.downloadLimit && access.downloadsUsed >= access.downloadLimit) {
      throw new Error('Download limit exceeded')
    }

    // Update download count
    await db.$transaction([
      db.photo.update({
        where: { id: photoId },
        data: { downloadCount: { increment: 1 } },
      }),
      db.photoAccess.update({
        where: { id: access.id },
        data: {
          downloadsUsed: { increment: 1 },
          lastAccessedAt: new Date(),
        },
      }),
      db.photoAccessLog.create({
        data: {
          photoId,
          action: 'DOWNLOAD',
        },
      }),
    ])

    return {
      path: photo.originalPath,
      filename: photo.originalName,
      mimeType: photo.mimeType,
    }
  }

  // ==================== DELIVERY ====================
  static async deliverCollection(collectionId: string, userId: string) {
    const collection = await db.photoCollection.findUnique({
      where: { id: collectionId },
      include: { booking: { include: { user: true } } },
    })

    if (!collection) {
      throw new Error('Collection not found')
    }

    // Grant user access
    await this.grantUserAccess(collectionId, collection.booking.userId)

    // Update collection status
    await db.photoCollection.update({
      where: { id: collectionId },
      data: {
        status: PhotoCollectionStatus.DELIVERED,
        customerNotified: true,
        notifiedAt: new Date(),
      },
    })

    await invalidateCacheByPrefix('portfolio:')

    // Create access link
    const accessLink = await this.createAccessLink(collectionId, userId, {
      expiresInHours: 24 * 30, // 30 days
    })

    return accessLink
  }

  // ==================== QUERY ====================
  static async getAllCollections(params?: {
    status?: PhotoCollectionStatus
    page?: number
    limit?: number
  }) {
    const { status, page = 1, limit = 20 } = params || {}
    const skip = (page - 1) * limit

    const where: Record<string, unknown> = {}
    if (status) {
      where.status = status
    }

    const [collections, total] = await Promise.all([
      db.photoCollection.findMany({
        where,
        skip,
        take: limit,
        include: {
          booking: {
            include: {
              package: true,
              user: { select: { id: true, email: true, name: true } },
            },
          },
          _count: { select: { photos: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.photoCollection.count({ where }),
    ])

    return {
      collections,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  static async getUserAccessibleCollections(userId: string) {
    return db.photoAccess.findMany({
      where: { userId },
      include: {
        collection: {
          include: {
            booking: {
              include: { package: true },
            },
            photos: {
              select: {
                id: true,
                publicId: true,
                originalName: true,
                thumbnailPath: true,
              },
              take: 4,
            },
            _count: { select: { photos: true } },
          },
        },
      },
      orderBy: { accessGrantedAt: 'desc' },
    })
  }

  static async reorderPhotos(collectionId: string, photoIds: string[]) {
    const updates = photoIds.map((id, index) =>
      db.photo.update({
        where: { id },
        data: { sortOrder: index },
      })
    )

    await Promise.all(updates)
    return { success: true }
  }
}
