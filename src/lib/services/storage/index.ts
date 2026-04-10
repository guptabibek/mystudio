/**
 * Production Storage Service
 * S3-compatible object storage with local fallback
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  type PutObjectCommandInput,
  type DeleteObjectCommandInput,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { createHash, randomBytes } from 'crypto'
import { mkdir, writeFile, readFile, unlink, access, stat, readdir, rm } from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import { join, extname, basename, dirname } from 'path'
import { pipeline } from 'stream/promises'
import { createGzip, createGunzip } from 'zlib'
import sharp from 'sharp'
import mime from 'mime-types'
import { config, isProduction, MAX_PHOTO_SIZE, IMAGE_MIME_TYPES } from '@/lib/config'

// Types
export interface UploadResult {
  key: string
  url: string
  publicId: string
  size: number
  mimeType: string
  width?: number
  height?: number
  etag?: string
}

export interface ImageVariants {
  original: string
  thumbnail: string
  preview: string
  watermark?: string
}

export interface StorageOptions {
  bucket?: string
  acl?: 'private' | 'public-read'
  contentType?: string
  cacheControl?: string
  metadata?: Record<string, string>
  expiresIn?: number // URL expiration in seconds
}

// Error classes
export class StorageError extends Error {
  constructor(message: string, public code: string, public statusCode: number = 500) {
    super(message)
    this.name = 'StorageError'
  }
}

export class FileValidationError extends StorageError {
  constructor(message: string) {
    super(message, 'FILE_VALIDATION_ERROR', 400)
  }
}

export class FileTooLargeError extends StorageError {
  constructor(size: number, maxSize: number) {
    super(
      `File size ${formatBytes(size)} exceeds maximum allowed ${formatBytes(maxSize)}`,
      'FILE_TOO_LARGE',
      413
    )
  }
}

export class InvalidFileTypeError extends StorageError {
  constructor(mimeType: string, allowed: string[]) {
    super(
      `File type '${mimeType}' is not allowed. Allowed types: ${allowed.join(', ')}`,
      'INVALID_FILE_TYPE',
      415
    )
  }
}

// Utility functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

function generateKey(prefix: string, extension: string): string {
  const timestamp = Date.now()
  const random = randomBytes(8).toString('hex')
  const hash = createHash('md5').update(`${timestamp}-${random}`).digest('hex').substring(0, 8)
  return `${prefix}/${timestamp}-${hash}${extension}`
}

function generatePublicId(): string {
  return `${Date.now()}-${randomBytes(16).toString('hex')}`
}

// Image processing
async function processImage(
  buffer: Buffer,
  options: {
    maxWidth?: number
    maxHeight?: number
    quality?: number
    format?: 'jpeg' | 'png' | 'webp'
    watermark?: Buffer
  } = {}
): Promise<{ buffer: Buffer; width: number; height: number; format: string }> {
  const {
    maxWidth = 2048,
    maxHeight = 2048,
    quality = 85,
    format = 'jpeg',
  } = options

  let image = sharp(buffer)
  
  // Get metadata
  const metadata = await image.metadata()
  
  // Resize if needed
  if (metadata.width && metadata.width > maxWidth) {
    image = image.resize(maxWidth, maxHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    })
  }
  
  // Convert format
  if (format === 'jpeg') {
    image = image.jpeg({ quality, mozjpeg: true })
  } else if (format === 'png') {
    image = image.png({ compressionLevel: 9 })
  } else if (format === 'webp') {
    image = image.webp({ quality })
  }
  
  const processedBuffer = await image.toBuffer()
  const processedMetadata = await sharp(processedBuffer).metadata()
  
  return {
    buffer: processedBuffer,
    width: processedMetadata.width || 0,
    height: processedMetadata.height || 0,
    format: processedMetadata.format || format,
  }
}

// Storage Service Class
class StorageService {
  private s3Client: S3Client | null = null
  private bucket: string
  private publicUrl: string
  private useLocal: boolean
  private uploadDir: string

  constructor() {
    this.useLocal = config.STORAGE_USE_LOCAL || !config.STORAGE_ACCESS_KEY
    this.bucket = config.STORAGE_BUCKET || 'photostudio-uploads'
    this.publicUrl = config.STORAGE_PUBLIC_URL || '/uploads'
    this.uploadDir = config.UPLOAD_DIR || './uploads'

    if (!this.useLocal && config.STORAGE_ACCESS_KEY) {
      this.s3Client = new S3Client({
        endpoint: config.STORAGE_ENDPOINT,
        region: config.STORAGE_REGION || 'auto',
        credentials: {
          accessKeyId: config.STORAGE_ACCESS_KEY,
          secretAccessKey: config.STORAGE_SECRET_KEY || '',
        },
        forcePathStyle: true, // Required for Cloudflare R2 and MinIO
      })
    }

    this.ensureUploadDir()
  }

  private async ensureUploadDir() {
    const dirs = [
      this.uploadDir,
      join(this.uploadDir, 'photos'),
      join(this.uploadDir, 'photos', 'original'),
      join(this.uploadDir, 'photos', 'thumbnail'),
      join(this.uploadDir, 'photos', 'preview'),
      join(this.uploadDir, 'proofs'),
      join(this.uploadDir, 'temp'),
    ]

    for (const dir of dirs) {
      try {
        await access(dir)
      } catch {
        await mkdir(dir, { recursive: true })
      }
    }
  }

  /**
   * Validate file before upload
   */
  validateFile(
    file: { size: number; mimeType: string },
    options: { maxSize?: number; allowedTypes?: string[] } = {}
  ): void {
    const maxSize = options.maxSize || MAX_PHOTO_SIZE
    const allowedTypes = options.allowedTypes || IMAGE_MIME_TYPES

    if (file.size > maxSize) {
      throw new FileTooLargeError(file.size, maxSize)
    }

    if (!allowedTypes.includes(file.mimeType)) {
      throw new InvalidFileTypeError(file.mimeType, allowedTypes)
    }
  }

  /**
   * Upload a file to storage
   */
  async upload(
    file: Buffer | NodeJS.ReadableStream,
    options: {
      filename: string
      mimeType: string
      prefix?: string
      size?: number
      generateThumbnail?: boolean
      generatePreview?: boolean
      addWatermark?: boolean
    }
  ): Promise<UploadResult> {
    const {
      filename,
      mimeType,
      prefix = 'photos',
      size,
      generateThumbnail = true,
      generatePreview = true,
    } = options

    // Validate
    if (size) {
      this.validateFile({ size, mimeType })
    }

    const extension = extname(filename) || `.${mime.extension(mimeType) || 'bin'}`
    const key = generateKey(prefix, extension)
    const publicId = generatePublicId()

    let buffer: Buffer
    if (Buffer.isBuffer(file)) {
      buffer = file
    } else {
      const chunks: Buffer[] = []
      for await (const chunk of file as NodeJS.ReadableStream) {
        chunks.push(Buffer.from(chunk))
      }
      buffer = Buffer.concat(chunks)
    }

    // Process image if it's an image file
    let width: number | undefined
    let height: number | undefined
    const processedBuffer = buffer // Always preserve original untouched for DSLR quality

    if (IMAGE_MIME_TYPES.includes(mimeType)) {
      try {
        // Only read metadata — never re-encode the original
        const metadata = await sharp(buffer).metadata()
        width = metadata.width
        height = metadata.height
      } catch (error) {
        console.error('Image metadata read error:', error)
      }
    }

    // Upload original
    const uploadResult = await this.uploadToStorage(key, processedBuffer, mimeType)

    // Generate and upload variants for images
    if (IMAGE_MIME_TYPES.includes(mimeType) && (generateThumbnail || generatePreview)) {
      await this.generateVariants(buffer, key, { generateThumbnail, generatePreview })
    }

    return {
      key,
      url: uploadResult.url,
      publicId,
      size: processedBuffer.length,
      mimeType,
      width,
      height,
      etag: uploadResult.etag,
    }
  }

  /**
   * Generate thumbnail and preview variants
   */
  private async generateVariants(
    buffer: Buffer,
    originalKey: string,
    options: { generateThumbnail: boolean; generatePreview: boolean }
  ): Promise<void> {
    const { generateThumbnail, generatePreview } = options

    try {
      // Generate thumbnail (300x300)
      if (generateThumbnail) {
        const thumbnail = await processImage(buffer, {
          maxWidth: 300,
          maxHeight: 300,
          quality: 75,
          format: 'webp',
        })
        const thumbnailKey = originalKey.replace('/original/', '/thumbnail/').replace(/\.[^.]+$/, '.webp')
        await this.uploadToStorage(thumbnailKey, thumbnail.buffer, 'image/webp')
      }

      // Generate preview (1200x1200)
      if (generatePreview) {
        const preview = await processImage(buffer, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 85,
          format: 'jpeg',
        })
        const previewKey = originalKey.replace('/original/', '/preview/').replace(/\.[^.]+$/, '.jpg')
        await this.uploadToStorage(previewKey, preview.buffer, 'image/jpeg')
      }
    } catch (error) {
      console.error('Error generating image variants:', error)
      // Don't throw - original is already uploaded
    }
  }

  /**
   * Internal upload to storage (S3 or local)
   */
  private async uploadToStorage(
    key: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<{ url: string; etag?: string }> {
    if (this.useLocal || !this.s3Client) {
      return this.uploadToLocal(key, buffer)
    }

    const input: PutObjectCommandInput = {
      Bucket: this.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
      Metadata: {
        uploadedAt: new Date().toISOString(),
      },
    }

    const command = new PutObjectCommand(input)
    const result = await this.s3Client.send(command)

    return {
      url: `${this.publicUrl}/${key}`,
      etag: result.ETag,
    }
  }

  /**
   * Upload to local filesystem (development fallback)
   */
  private async uploadToLocal(key: string, buffer: Buffer): Promise<{ url: string }> {
    const filepath = join(this.uploadDir, key)
    
    // Ensure directory exists
    await mkdir(dirname(filepath), { recursive: true })
    
    // Write file
    await writeFile(filepath, buffer)
    
    return {
      url: `/api/storage/${key}`,
    }
  }

  /**
   * Get a signed URL for direct upload (client-side uploads)
   */
  async getSignedUploadUrl(
    key: string,
    mimeType: string,
    expiresIn: number = 3600
  ): Promise<{ url: string; key: string }> {
    if (this.useLocal || !this.s3Client) {
      // For local development, return a regular upload endpoint
      return {
        url: `/api/storage/upload?key=${encodeURIComponent(key)}`,
        key,
      }
    }

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    })

    const url = await getSignedUrl(this.s3Client, command, { expiresIn })

    return { url, key }
  }

  /**
   * Get a signed URL for download
   */
  async getSignedDownloadUrl(
    key: string,
    expiresIn: number = 3600,
    options: { responseContentType?: string; responseContentDisposition?: string } = {}
  ): Promise<string> {
    if (this.useLocal || !this.s3Client) {
      // For local development, return direct URL
      return `/api/storage/${key}`
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: options.responseContentType,
      ResponseContentDisposition: options.responseContentDisposition,
    })

    return getSignedUrl(this.s3Client, command, { expiresIn })
  }

  /**
   * Get a file from storage
   */
  async get(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    if (this.useLocal || !this.s3Client) {
      return this.getFromLocal(key)
    }

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    const result = await this.s3Client.send(command)
    const chunks: Buffer[] = []

    if (result.Body) {
      for await (const chunk of result.Body as NodeJS.ReadableStream) {
        chunks.push(Buffer.from(chunk))
      }
    }

    return {
      buffer: Buffer.concat(chunks),
      mimeType: result.ContentType || 'application/octet-stream',
      size: result.ContentLength || 0,
    }
  }

  /**
   * Get file from local storage
   */
  private async getFromLocal(key: string): Promise<{ buffer: Buffer; mimeType: string; size: number }> {
    const filepath = join(this.uploadDir, key)
    const buffer = await readFile(filepath)
    const mimeType = mime.lookup(filepath) || 'application/octet-stream'
    const stats = await stat(filepath)

    return {
      buffer,
      mimeType,
      size: stats.size,
    }
  }

  /**
   * Delete a file from storage
   */
  async delete(key: string): Promise<void> {
    if (this.useLocal || !this.s3Client) {
      const filepath = join(this.uploadDir, key)
      try {
        await unlink(filepath)
      } catch {
        // File doesn't exist, ignore
      }
      return
    }

    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    await this.s3Client.send(command)
  }

  /**
   * Delete multiple files
   */
  async deleteMany(keys: string[]): Promise<void> {
    if (this.useLocal || !this.s3Client) {
      for (const key of keys) {
        await this.delete(key)
      }
      return
    }

    if (keys.length === 0) return

    const command = new DeleteObjectsCommand({
      Bucket: this.bucket,
      Delete: {
        Objects: keys.map(key => ({ Key: key })),
      },
    })

    await this.s3Client.send(command)
  }

  /**
   * Check if a file exists
   */
  async exists(key: string): Promise<boolean> {
    if (this.useLocal || !this.s3Client) {
      try {
        await access(join(this.uploadDir, key))
        return true
      } catch {
        return false
      }
    }

    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      })
      await this.s3Client.send(command)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get file metadata
   */
  async getMetadata(key: string): Promise<{
    size: number
    mimeType: string
    lastModified: Date
    etag?: string
  }> {
    if (this.useLocal || !this.s3Client) {
      const filepath = join(this.uploadDir, key)
      const stats = await stat(filepath)
      return {
        size: stats.size,
        mimeType: mime.lookup(filepath) || 'application/octet-stream',
        lastModified: stats.mtime,
      }
    }

    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    })

    const result = await this.s3Client.send(command)

    return {
      size: result.ContentLength || 0,
      mimeType: result.ContentType || 'application/octet-stream',
      lastModified: result.LastModified || new Date(),
      etag: result.ETag,
    }
  }

  /**
   * Copy a file
   */
  async copy(sourceKey: string, destKey: string): Promise<{ url: string }> {
    if (this.useLocal || !this.s3Client) {
      const sourcePath = join(this.uploadDir, sourceKey)
      const destPath = join(this.uploadDir, destKey)
      await mkdir(dirname(destPath), { recursive: true })
      const buffer = await readFile(sourcePath)
      await writeFile(destPath, buffer)
      return { url: `/api/storage/${destKey}` }
    }

    const command = new CopyObjectCommand({
      Bucket: this.bucket,
      CopySource: `${this.bucket}/${sourceKey}`,
      Key: destKey,
    })

    await this.s3Client.send(command)

    return { url: `${this.publicUrl}/${destKey}` }
  }

  /**
   * List files with a prefix
   */
  async list(prefix: string, options: { limit?: number; continuationToken?: string } = {}): Promise<{
    keys: string[]
    continuationToken?: string
    hasMore: boolean
  }> {
    if (this.useLocal || !this.s3Client) {
      const dir = join(this.uploadDir, prefix)
      const keys: string[] = []
      
      try {
        const files = await readdir(dir, { recursive: true })
        for (const file of files) {
          const fullPath = join(prefix, file.toString())
          keys.push(fullPath)
          if (keys.length >= (options.limit || 1000)) break
        }
      } catch {
        // Directory doesn't exist
      }

      return { keys, hasMore: false }
    }

    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: options.limit || 1000,
      ContinuationToken: options.continuationToken,
    })

    const result = await this.s3Client.send(command)

    return {
      keys: (result.Contents || []).map(obj => obj.Key).filter(Boolean) as string[],
      continuationToken: result.NextContinuationToken,
      hasMore: !!result.IsTruncated,
    }
  }

  /**
   * Clean up temporary files older than specified age
   */
  async cleanupTemp(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    const tempDir = join(this.uploadDir, 'temp')
    const cutoff = new Date(Date.now() - maxAgeMs)
    let deleted = 0

    try {
      const files = await readdir(tempDir)
      for (const file of files) {
        const filepath = join(tempDir, file)
        const stats = await stat(filepath)
        if (stats.mtime < cutoff) {
          await unlink(filepath)
          deleted++
        }
      }
    } catch {
      // Directory doesn't exist or other error
    }

    return deleted
  }
}

// Export singleton instance
export const storageService = new StorageService()

// Export class for testing
export { StorageService }
