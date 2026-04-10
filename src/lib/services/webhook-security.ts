/**
 * Webhook Security Service
 * Provides idempotency, signature verification, and replay protection
 */

import crypto from 'crypto'
import { db } from '@/lib/db'
import { AuditAction } from '@prisma/client'

// Types
export interface WebhookHeaders {
  signature?: string
  timestamp?: string
  idempotencyKey?: string
}

export interface WebhookVerificationResult {
  valid: boolean
  error?: string
  isDuplicate?: boolean
}

/**
 * Stripe Webhook Verification
 */
export async function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<WebhookVerificationResult> {
  try {
    // Parse the signature header
    const elements = signature.split(',')
    const timestamp = elements.find(e => e.startsWith('t='))?.substring(2)
    const signatures = elements
      .filter(e => e.startsWith('v1='))
      .map(e => e.substring(3))

    if (!timestamp || signatures.length === 0) {
      return { valid: false, error: 'Invalid signature header format' }
    }

    // Check timestamp to prevent replay attacks (5 minutes tolerance)
    const timestampInt = parseInt(timestamp, 10)
    const currentTime = Math.floor(Date.now() / 1000)
    const tolerance = 300 // 5 minutes

    if (currentTime - timestampInt > tolerance) {
      return { valid: false, error: 'Webhook timestamp too old' }
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload)
      .digest('hex')

    // Compare signatures (timing-safe comparison)
    const isValid = signatures.some(sig => {
      try {
        return crypto.timingSafeEqual(
          Buffer.from(sig, 'hex'),
          Buffer.from(expectedSignature, 'hex')
        )
      } catch {
        return false
      }
    })

    return { valid: isValid, error: isValid ? undefined : 'Signature mismatch' }
  } catch (error) {
    return { valid: false, error: 'Verification failed' }
  }
}

/**
 * Check webhook idempotency
 * Prevents duplicate processing of the same webhook
 */
export async function checkWebhookIdempotency(
  webhookId: string,
  source: string
): Promise<{ isDuplicate: boolean; previousResult?: string }> {
  try {
    // Check if we've already processed this webhook
    const existingLog = await db.auditLog.findFirst({
      where: {
        action: AuditAction.SUSPICIOUS_ACTIVITY,
        entityId: webhookId,
        entityType: source,
      },
      orderBy: { createdAt: 'desc' },
    })

    if (existingLog) {
      return {
        isDuplicate: true,
        previousResult: existingLog.newValues || undefined,
      }
    }

    return { isDuplicate: false }
  } catch {
    return { isDuplicate: false }
  }
}

/**
 * Record webhook processing
 */
export async function recordWebhookProcessing(params: {
  webhookId: string
  source: string
  result: 'SUCCESS' | 'FAILED'
  data?: Record<string, unknown>
  error?: string
}): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: AuditAction.SUSPICIOUS_ACTIVITY,
        entityType: params.source,
        entityId: params.webhookId,
        description: `WEBHOOK_PROCESSED:${params.result}`,
        newValues: params.data ? JSON.stringify(params.data) : null,
      },
    })
  } catch {
    // Ignore logging errors
  }
}

/**
 * Generate webhook signature for outgoing webhooks
 */
export function generateWebhookSignature(
  payload: string,
  secret: string,
  timestamp?: number
): string {
  const ts = timestamp || Math.floor(Date.now() / 1000)
  const signedPayload = `${ts}.${payload}`
  const signature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')

  return `t=${ts},v1=${signature}`
}

/**
 * Verify generic webhook signature
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string,
  toleranceSeconds: number = 300
): WebhookVerificationResult {
  const parts = signature.split(',')

  let timestamp: number | null = null
  let receivedSignature: string | null = null

  for (const part of parts) {
    const [key, value] = part.split('=')
    if (key === 't') {
      timestamp = parseInt(value, 10)
    } else if (key === 'v1') {
      receivedSignature = value
    }
  }

  if (!timestamp || !receivedSignature) {
    return { valid: false, error: 'Invalid signature format' }
  }

  // Check timestamp
  const currentTime = Math.floor(Date.now() / 1000)
  if (currentTime - timestamp > toleranceSeconds) {
    return { valid: false, error: 'Webhook expired' }
  }

  // Compute expected signature
  const signedPayload = `${timestamp}.${payload}`
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex')

  // Compare
  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(receivedSignature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )

    return { valid: isValid, error: isValid ? undefined : 'Signature mismatch' }
  } catch {
    return { valid: false, error: 'Signature comparison failed' }
  }
}

/**
 * Webhook Processing Lock
 * Prevents concurrent processing of the same webhook
 */
export class WebhookLock {
  private static locks = new Map<string, { acquired: boolean; timestamp: number }>()
  private static readonly LOCK_TTL = 30000 // 30 seconds

  static async acquire(webhookId: string): Promise<boolean> {
    const existing = this.locks.get(webhookId)

    if (existing) {
      const now = Date.now()
      if (existing.acquired && now - existing.timestamp < this.LOCK_TTL) {
        return false // Already locked
      }
    }

    this.locks.set(webhookId, { acquired: true, timestamp: Date.now() })
    return true
  }

  static release(webhookId: string): void {
    this.locks.delete(webhookId)
  }

  static cleanup(): void {
    const now = Date.now()
    for (const [id, lock] of this.locks.entries()) {
      if (now - lock.timestamp > this.LOCK_TTL) {
        this.locks.delete(id)
      }
    }
  }
}

// Cleanup locks periodically
setInterval(() => WebhookLock.cleanup(), 60000)
