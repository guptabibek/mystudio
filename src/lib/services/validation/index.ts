/**
 * Production Input Validation & Sanitization Service
 * Comprehensive validation for all user inputs
 */

import { z } from 'zod'
import DOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import mime from 'mime-types'
import { IMAGE_MIME_TYPES, DOCUMENT_MIME_TYPES, MAX_PHOTO_SIZE, MAX_PROOF_SIZE } from '@/lib/config'

// Initialize DOMPurify for server-side use
const window = new JSDOM('').window
const dompurify = DOMPurify(window as unknown as Window)

// Types
export interface FileValidationOptions {
  maxSize?: number
  allowedMimeTypes?: string[]
  allowedExtensions?: string[]
  checkMagicBytes?: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  sanitized?: unknown
}

// Magic bytes for file type verification
const FILE_SIGNATURES: Record<string, Buffer[]> = {
  'image/jpeg': [
    Buffer.from([0xff, 0xd8, 0xff]), // JPEG
  ],
  'image/png': [
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // PNG
  ],
  'image/webp': [
    Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF (WebP container)
  ],
  'image/heic': [
    Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]), // HEIC
  ],
  'application/pdf': [
    Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  ],
}

/**
 * Input Sanitization Class
 */
export class InputSanitizer {
  /**
   * Sanitize HTML content
   */
  static sanitizeHtml(input: string, options: {
    allowedTags?: string[]
    allowedAttributes?: Record<string, string[]>
  } = {}): string {
    const {
      allowedTags = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'a'],
      allowedAttributes = { a: ['href', 'title'] },
    } = options

    return dompurify.sanitize(input, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: Object.values(allowedAttributes).flat(),
      ALLOW_DATA_ATTR: false,
      ADD_ATTR: ['target', 'rel'],
      FORCE_BODY: true,
    })
  }

  /**
   * Sanitize plain text (remove all HTML)
   */
  static sanitizeText(input: string): string {
    // Remove HTML tags
    const withoutTags = input.replace(/<[^>]*>/g, '')
    
    // Remove script injection patterns
    const withoutScripts = withoutTags
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '')
      .replace(/data:/gi, '')
    
    // Normalize whitespace
    return withoutScripts.trim().replace(/\s+/g, ' ')
  }

  /**
   * Sanitize email address
   */
  static sanitizeEmail(input: string): string {
    return input.toLowerCase().trim().replace(/[^a-z0-9@._+-]/g, '')
  }

  /**
   * Sanitize phone number
   */
  static sanitizePhone(input: string): string {
    // Keep only digits, +, and -
    return input.replace(/[^0-9+\-() ]/g, '').trim()
  }

  /**
   * Sanitize filename
   */
  static sanitizeFilename(input: string): string {
    // Remove path traversal attempts
    let sanitized = input.replace(/\.\./g, '')
    
    // Remove invalid characters
    sanitized = sanitized.replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    
    // Limit length
    if (sanitized.length > 255) {
      const ext = sanitized.split('.').pop() || ''
      sanitized = sanitized.substring(0, 255 - ext.length - 1) + '.' + ext
    }
    
    return sanitized || 'unnamed-file'
  }

  /**
   * Sanitize URL
   */
  static sanitizeUrl(input: string): string {
    try {
      const url = new URL(input)
      
      // Only allow http and https
      if (!['http:', 'https:'].includes(url.protocol)) {
        return ''
      }
      
      // Remove javascript: in any part
      if (url.toString().toLowerCase().includes('javascript:')) {
        return ''
      }
      
      return url.toString()
    } catch {
      return ''
    }
  }

  /**
   * Sanitize SQL-like input (additional layer beyond parameterized queries)
   */
  static sanitizeSqlInput(input: string): string {
    // This is an additional safety measure
    // Always use parameterized queries as primary defense
    const dangerous = [
      /DROP\s+TABLE/gi,
      /DELETE\s+FROM/gi,
      /INSERT\s+INTO/gi,
      /UPDATE\s+.*SET/gi,
      /UNION\s+SELECT/gi,
      /OR\s+1\s*=\s*1/gi,
      /;\s*--/g,
    ]

    let sanitized = input
    for (const pattern of dangerous) {
      sanitized = sanitized.replace(pattern, '')
    }

    return sanitized
  }

  /**
   * Escape special characters for JSON
   */
  static escapeJson(input: string): string {
    return input
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')
  }
}

/**
 * File Validation Class
 */
export class FileValidator {
  /**
   * Validate file upload
   */
  static validateFile(
    file: {
      name: string
      size: number
      mimeType: string
      buffer?: Buffer
    },
    options: FileValidationOptions = {}
  ): ValidationResult {
    const errors: string[] = []
    const {
      maxSize = MAX_PHOTO_SIZE,
      allowedMimeTypes = IMAGE_MIME_TYPES,
      allowedExtensions,
      checkMagicBytes = true,
    } = options

    // Validate file size
    if (file.size <= 0) {
      errors.push('File is empty')
    } else if (file.size > maxSize) {
      errors.push(`File size exceeds maximum allowed (${formatBytes(maxSize)})`)
    }

    // Validate MIME type
    if (!allowedMimeTypes.includes(file.mimeType)) {
      errors.push(`File type '${file.mimeType}' is not allowed`)
    }

    // Validate extension
    if (allowedExtensions) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (!ext || !allowedExtensions.includes(ext)) {
        errors.push(`File extension is not allowed`)
      }
    }

    // Validate magic bytes if buffer provided
    if (checkMagicBytes && file.buffer) {
      const detectedType = this.detectMimeType(file.buffer)
      if (detectedType && detectedType !== file.mimeType) {
        // MIME type mismatch - potential spoofing
        if (!allowedMimeTypes.includes(detectedType)) {
          errors.push(`File content does not match declared type`)
        }
      }
    }

    // Sanitize filename
    const sanitizedName = InputSanitizer.sanitizeFilename(file.name)

    return {
      valid: errors.length === 0,
      errors,
      sanitized: {
        name: sanitizedName,
        size: file.size,
        mimeType: file.mimeType,
      },
    }
  }

  /**
   * Validate image file
   */
  static validateImage(file: {
    name: string
    size: number
    mimeType: string
    buffer?: Buffer
  }): ValidationResult {
    return this.validateFile(file, {
      maxSize: MAX_PHOTO_SIZE,
      allowedMimeTypes: IMAGE_MIME_TYPES,
      checkMagicBytes: true,
    })
  }

  /**
   * Validate payment proof document
   */
  static validatePaymentProof(file: {
    name: string
    size: number
    mimeType: string
    buffer?: Buffer
  }): ValidationResult {
    return this.validateFile(file, {
      maxSize: MAX_PROOF_SIZE,
      allowedMimeTypes: [...DOCUMENT_MIME_TYPES, ...IMAGE_MIME_TYPES.slice(0, 3)], // PDF, JPEG, PNG
      checkMagicBytes: true,
    })
  }

  /**
   * Detect MIME type from magic bytes
   */
  static detectMimeType(buffer: Buffer): string | null {
    for (const [mimeType, signatures] of Object.entries(FILE_SIGNATURES)) {
      for (const signature of signatures) {
        if (buffer.length >= signature.length) {
          const chunk = buffer.subarray(0, signature.length)
          if (chunk.equals(signature)) {
            return mimeType
          }
        }
      }
    }
    return null
  }

  /**
   * Get file extension from MIME type
   */
  static getExtension(mimeType: string): string {
    return mime.extension(mimeType) || 'bin'
  }
}

/**
 * Schema Validators
 */
export const schemas = {
  // User schemas
  register: z.object({
    name: z.string()
      .min(2, 'Name must be at least 2 characters')
      .max(100, 'Name is too long')
      .transform(InputSanitizer.sanitizeText),
    email: z.string()
      .email('Invalid email address')
      .transform(InputSanitizer.sanitizeEmail),
    password: z.string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password is too long')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    phone: z.string()
      .optional()
      .transform(val => val ? InputSanitizer.sanitizePhone(val) : undefined),
  }),

  login: z.object({
    email: z.string()
      .email('Invalid email address')
      .transform(InputSanitizer.sanitizeEmail),
    password: z.string().min(1, 'Password is required'),
  }),

  // Booking schemas
  createBooking: z.object({
    packageId: z.string().min(1, 'Package is required'),
    date: z.string().refine(val => !isNaN(Date.parse(val)), 'Invalid date'),
    timeSlot: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format'),
    customerName: z.string()
      .min(2, 'Name is required')
      .max(100, 'Name is too long')
      .transform(InputSanitizer.sanitizeText),
    customerEmail: z.string()
      .email('Invalid email')
      .transform(InputSanitizer.sanitizeEmail),
    customerPhone: z.string()
      .optional()
      .transform(val => val ? InputSanitizer.sanitizePhone(val) : undefined),
    customerNotes: z.string()
      .max(1000, 'Notes are too long')
      .optional()
      .transform(val => val ? InputSanitizer.sanitizeText(val) : undefined),
  }),

  // Package schemas
  createPackage: z.object({
    name: z.string()
      .min(2, 'Name is required')
      .max(100, 'Name is too long')
      .transform(InputSanitizer.sanitizeText),
    description: z.string()
      .max(500, 'Description is too long')
      .optional()
      .transform(val => val ? InputSanitizer.sanitizeHtml(val, { allowedTags: [] }) : undefined),
    duration: z.number().int().min(15).max(480),
    price: z.number().min(0).max(10000),
    maxPhotos: z.number().int().min(1).max(500).default(10),
    includesEdit: z.boolean().default(false),
    features: z.array(z.string().transform(InputSanitizer.sanitizeText)).optional(),
  }),

  // Payment schemas
  bankTransfer: z.object({
    bookingId: z.string().min(1),
    bankName: z.string()
      .min(2, 'Bank name is required')
      .max(100)
      .transform(InputSanitizer.sanitizeText),
    accountNumber: z.string()
      .min(4, 'Account number is required')
      .max(50)
      .transform(InputSanitizer.sanitizeText),
    referenceNumber: z.string()
      .min(4, 'Reference number is required')
      .max(50)
      .transform(InputSanitizer.sanitizeText),
  }),

  // Availability schemas
  availabilityRule: z.object({
    dayOfWeek: z.enum(['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']),
    startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid start time'),
    endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid end time'),
    slotDuration: z.number().int().min(15).max(240).default(60),
    bufferTime: z.number().int().min(0).max(60).default(15),
  }),

  // Blackout date schemas
  blackoutDate: z.object({
    startDate: z.string().refine(val => !isNaN(Date.parse(val)), 'Invalid start date'),
    endDate: z.string().refine(val => !isNaN(Date.parse(val)), 'Invalid end date'),
    reason: z.string()
      .max(200, 'Reason is too long')
      .optional()
      .transform(val => val ? InputSanitizer.sanitizeText(val) : undefined),
    isRecurring: z.boolean().default(false),
  }),

  // Pagination schemas
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20),
    status: z.string().optional(),
    search: z.string()
      .max(100, 'Search query is too long')
      .optional()
      .transform(val => val ? InputSanitizer.sanitizeText(val) : undefined),
  }),
}

/**
 * Helper function to format bytes
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

/**
 * Validation helper function
 */
export function validate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  try {
    const result = schema.parse(data)
    return { success: true, data: result }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
      }
    }
    return { success: false, errors: ['Validation failed'] }
  }
}

// Export all
export { InputSanitizer, FileValidator, schemas, formatBytes }
