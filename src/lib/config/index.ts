/**
 * Production Configuration Module
 * Centralized configuration management with environment validation
 */

import { z } from 'zod'

// Environment schema validation
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('3000'),
  
  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  
  // Authentication
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  NEXTAUTH_SECRET: z.string().min(32, 'NEXTAUTH_SECRET is required'),
  NEXTAUTH_URL: z.string().url('NEXTAUTH_URL must be a valid URL'),
  
  // Stripe
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  
  // eSewa
  ESEWA_MERCHANT_ID: z.string().optional(),
  ESEWA_SECRET_KEY: z.string().optional(),
  ESEWA_FORM_URL: z.string().url().optional(),
  ESEWA_API_URL: z.string().url().optional(),
  ESEWA_STATUS_CHECK_URL: z.string().url().optional(),
  ESEWA_SUCCESS_URL: z.string().url().optional(),
  ESEWA_FAILURE_URL: z.string().url().optional(),
  ESEWA_CALLBACK_BASE_URL: z.string().url().optional(),
  ESEWA_STATUS_TIMEOUT_MS: z.string().transform(Number).default('12000'),
  ESEWA_STATUS_RETRIES: z.string().transform(Number).default('1'),
  
  // Storage (S3-compatible)
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_PUBLIC_URL: z.string().url().optional(),
  STORAGE_USE_LOCAL: z.string().transform(v => v === 'true').default('true'),
  
  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  
  // Redis
  REDIS_URL: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  RATE_LIMIT_ENABLED: z.string().transform(v => v === 'true').default('true'),
  
  // Studio Settings
  STUDIO_NAME: z.string().default('Lumière Studio'),
  STUDIO_EMAIL: z.string().email().optional(),
  STUDIO_PHONE: z.string().optional(),
  STUDIO_ADDRESS: z.string().optional(),
  
  // Security
  CORS_ORIGINS: z.string().default('*'),
  TRUST_PROXY: z.string().transform(v => v === 'true').default('false'),
  
  // Uploads
  MAX_FILE_SIZE: z.string().transform(Number).default('104857600'), // 100MB
  ALLOWED_FILE_TYPES: z.string().default('image/jpeg,image/png,image/webp,image/heic,image/heif'),
  UPLOAD_DIR: z.string().default('./uploads'),
})

// Parse and validate environment
function parseEnv() {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment variables:')
      const issues = error.issues ?? []
      issues.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`)
      })
      if (process.env.NODE_ENV === 'production') {
        process.exit(1)
      }
    }
    // Return partial config for development
    return {
      NODE_ENV: 'development',
      DATABASE_URL: process.env.DATABASE_URL || '',
      JWT_SECRET: process.env.JWT_SECRET || 'development-secret-key-change-in-production',
      JWT_EXPIRES_IN: '7d',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || 'development-secret',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL || 'http://localhost:3000',
      STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
      STRIPE_PUBLISHABLE_KEY: process.env.STRIPE_PUBLISHABLE_KEY || '',
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',
      ESEWA_FORM_URL: process.env.ESEWA_FORM_URL || process.env.ESEWA_API_URL || '',
      ESEWA_API_URL: process.env.ESEWA_API_URL || '',
      ESEWA_STATUS_CHECK_URL: process.env.ESEWA_STATUS_CHECK_URL || '',
      ESEWA_SUCCESS_URL: process.env.ESEWA_SUCCESS_URL || '',
      ESEWA_FAILURE_URL: process.env.ESEWA_FAILURE_URL || '',
      ESEWA_CALLBACK_BASE_URL: process.env.ESEWA_CALLBACK_BASE_URL || process.env.NEXTAUTH_URL || 'http://localhost:3000',
      ESEWA_STATUS_TIMEOUT_MS: Number(process.env.ESEWA_STATUS_TIMEOUT_MS || '12000'),
      ESEWA_STATUS_RETRIES: Number(process.env.ESEWA_STATUS_RETRIES || '1'),
      STORAGE_USE_LOCAL: true,
      RATE_LIMIT_ENABLED: true,
      STUDIO_NAME: 'Lumière Studio',
      MAX_FILE_SIZE: 104857600,
      ALLOWED_FILE_TYPES: 'image/jpeg,image/png,image/webp,image/heic,image/heif',
      UPLOAD_DIR: './uploads',
    } as z.infer<typeof envSchema>
  }
}

export const config = parseEnv()

// Type-safe config access
export type Config = typeof config

// Configuration helpers
export const isProduction = config.NODE_ENV === 'production'
export const isDevelopment = config.NODE_ENV === 'development'
export const isTest = config.NODE_ENV === 'test'

// Feature flags
export const features = {
  stripeEnabled: !!config.STRIPE_SECRET_KEY && !!config.STRIPE_PUBLISHABLE_KEY,
  esewaEnabled: !!config.ESEWA_MERCHANT_ID && !!config.ESEWA_SECRET_KEY,
  storageConfigured: config.STORAGE_USE_LOCAL || (!!config.STORAGE_ACCESS_KEY && !!config.STORAGE_BUCKET),
  emailConfigured: !!config.SMTP_HOST && !!config.SMTP_USER && !!config.SMTP_PASS,
  redisEnabled: !!config.REDIS_URL,
}

// Valid file types
export const ALLOWED_MIME_TYPES = config.ALLOWED_FILE_TYPES.split(',').map(t => t.trim())
export const MAX_FILE_SIZE = config.MAX_FILE_SIZE
export const MAX_PHOTO_SIZE = 200 * 1024 * 1024 // 200MB per DSLR photo
export const MAX_PROOF_SIZE = 10 * 1024 * 1024 // 10MB for payment proofs

// File type validation
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/tiff',
  'image/bmp',
  'image/x-canon-cr2',
  'image/x-nikon-nef',
  'image/x-sony-arw',
  'image/x-adobe-dng',
]

export const DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
]

// Rate limit configurations
export const rateLimits = {
  // Authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per window
    message: 'Too many authentication attempts, please try again later',
  },
  
  // Booking creation
  booking: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 bookings per hour per user
    message: 'Too many booking attempts, please try again later',
  },
  
  // Payment endpoints
  payment: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 payment attempts per hour
    message: 'Too many payment attempts, please try again later',
  },
  
  // File uploads
  upload: {
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // 100 uploads per hour (admin)
    message: 'Upload limit exceeded, please try again later',
  },
  
  // API general
  api: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    message: 'Too many requests, please slow down',
  },
  
  // Webhooks (more lenient)
  webhook: {
    windowMs: 60 * 1000, // 1 minute
    max: 1000, // 1000 requests per minute (Stripe can send many)
  },
}

// Email templates
export const emailTemplates = {
  bookingConfirmed: 'booking-confirmed',
  bookingCancelled: 'booking-cancelled',
  paymentReceived: 'payment-received',
  photosReady: 'photos-ready',
  passwordReset: 'password-reset',
  welcome: 'welcome',
}

export default config
