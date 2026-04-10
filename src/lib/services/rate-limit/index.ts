/**
 * Production Rate Limiting Service
 * Redis-based distributed rate limiting with fallback to in-memory
 */

import Redis from 'ioredis'
import { db } from '@/lib/db'
import { config, isProduction } from '@/lib/config'
import { rateLimits } from '@/lib/config'

// Types
export interface RateLimitResult {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: Date
  retryAfter?: number
}

export interface RateLimitConfig {
  windowMs: number
  max: number
  message?: string
  keyGenerator?: (identifier: string) => string
  skipFailedRequests?: boolean
  skipSuccessfulRequests?: boolean
}

// In-memory store for development/fallback
class MemoryStore {
  private store = new Map<string, { count: number; resetAt: Date }>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor() {
    // Cleanup expired entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000)
  }

  private cleanup() {
    const now = new Date()
    for (const [key, value] of this.store.entries()) {
      if (value.resetAt < now) {
        this.store.delete(key)
      }
    }
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
    const now = new Date()
    const resetAt = new Date(now.getTime() + windowMs)

    const existing = this.store.get(key)

    if (!existing || existing.resetAt < now) {
      this.store.set(key, { count: 1, resetAt })
      return { count: 1, resetAt }
    }

    const newCount = existing.count + 1
    this.store.set(key, { count: newCount, resetAt: existing.resetAt })

    return { count: newCount, resetAt: existing.resetAt }
  }

  async decrement(key: string): Promise<void> {
    const existing = this.store.get(key)
    if (existing && existing.count > 0) {
      this.store.set(key, { ...existing, count: existing.count - 1 })
    }
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key)
  }

  async get(key: string): Promise<{ count: number; resetAt: Date } | null> {
    return this.store.get(key) || null
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
    this.store.clear()
  }
}

// Redis store for production
class RedisStore {
  private redis: Redis

  constructor(redis: Redis) {
    this.redis = redis
  }

  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
    const ttl = Math.ceil(windowMs / 1000)
    const resetAt = new Date(Date.now() + windowMs)

    // Use Lua script for atomic increment with expiry
    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `

    const count = await this.redis.eval(luaScript, 1, key, ttl) as number

    return { count, resetAt }
  }

  async decrement(key: string): Promise<void> {
    await this.redis.decr(key)
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key)
  }

  async get(key: string): Promise<{ count: number; resetAt: Date } | null> {
    const count = await this.redis.get(key)
    if (!count) return null

    const ttl = await this.redis.ttl(key)
    const resetAt = new Date(Date.now() + ttl * 1000)

    return { count: parseInt(count, 10), resetAt }
  }
}

// Database store for persistent rate limiting
class DatabaseStore {
  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: Date }> {
    const now = new Date()
    const resetAt = new Date(now.getTime() + windowMs)

    // Upsert rate limit entry
    const existing = await db.rateLimitEntry.findUnique({
      where: { key },
    })

    if (!existing || existing.resetAt < now) {
      // Create new or reset expired
      await db.rateLimitEntry.upsert({
        where: { key },
        create: { key, count: 1, resetAt },
        update: { count: 1, resetAt },
      })
      return { count: 1, resetAt }
    }

    // Increment existing
    const updated = await db.rateLimitEntry.update({
      where: { key },
      data: { count: { increment: 1 } },
    })

    return { count: updated.count, resetAt: updated.resetAt }
  }

  async decrement(key: string): Promise<void> {
    await db.rateLimitEntry.update({
      where: { key },
      data: { count: { decrement: 1 } },
    }).catch(() => {})
  }

  async reset(key: string): Promise<void> {
    await db.rateLimitEntry.delete({
      where: { key },
    }).catch(() => {})
  }

  async get(key: string): Promise<{ count: number; resetAt: Date } | null> {
    const entry = await db.rateLimitEntry.findUnique({
      where: { key },
    })

    if (!entry || entry.resetAt < new Date()) {
      return null
    }

    return { count: entry.count, resetAt: entry.resetAt }
  }

  async cleanup(): Promise<void> {
    await db.rateLimitEntry.deleteMany({
      where: { resetAt: { lt: new Date() } },
    })
  }
}

// Rate Limit Service
class RateLimitService {
  private store: MemoryStore | RedisStore | DatabaseStore
  private redis: Redis | null = null
  private useRedis: boolean
  private useMemory: boolean

  constructor() {
    this.useRedis = !!config.REDIS_URL && config.RATE_LIMIT_ENABLED
    this.useMemory = !this.useRedis && !isProduction

    if (this.useRedis && config.REDIS_URL) {
      try {
        this.redis = new Redis(config.REDIS_URL, {
          password: config.REDIS_PASSWORD,
          maxRetriesPerRequest: 3,
          retryDelayOnFailover: 100,
          lazyConnect: true,
        })

        this.redis.on('error', (err) => {
          console.error('Redis connection error:', err)
          this.fallbackToMemory()
        })

        this.store = new RedisStore(this.redis)
        console.log('✅ Rate limiting: Using Redis store')
      } catch {
        this.fallbackToMemory()
      }
    } else if (this.useMemory) {
      this.store = new MemoryStore()
      console.log('✅ Rate limiting: Using in-memory store')
    } else {
      this.store = new DatabaseStore()
      console.log('✅ Rate limiting: Using database store')
    }
  }

  private fallbackToMemory() {
    console.warn('⚠️ Falling back to in-memory rate limiting')
    this.useRedis = false
    this.useMemory = true
    this.store = new MemoryStore()
  }

  /**
   * Check rate limit for a given key
   */
  async checkLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const { windowMs, max, keyGenerator } = config
    const key = keyGenerator ? keyGenerator(identifier) : `ratelimit:${identifier}`

    const result = await this.store.increment(key, windowMs)
    const remaining = Math.max(0, max - result.count)
    const allowed = result.count <= max

    return {
      allowed,
      limit: max,
      remaining: allowed ? remaining : 0,
      resetAt: result.resetAt,
      retryAfter: allowed ? undefined : Math.ceil((result.resetAt.getTime() - Date.now()) / 1000),
    }
  }

  /**
   * Check and enforce rate limit
   */
  async enforceLimit(
    identifier: string,
    config: RateLimitConfig
  ): Promise<{ allowed: boolean; headers: Record<string, string>; error?: string }> {
    const result = await this.checkLimit(identifier, config)

    const headers: Record<string, string> = {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(result.remaining),
      'X-RateLimit-Reset': String(Math.ceil(result.resetAt.getTime() / 1000)),
    }

    if (!result.allowed) {
      headers['Retry-After'] = String(result.retryAfter || 60)

      // Log rate limit exceeded
      try {
        await db.auditLog.create({
          data: {
            action: 'RATE_LIMIT_EXCEEDED',
            entityType: 'RateLimit',
            entityId: identifier,
            description: `Rate limit exceeded for ${identifier}`,
          },
        })
      } catch {
        // Ignore logging errors
      }

      return {
        allowed: false,
        headers,
        error: config.message || 'Too many requests, please try again later',
      }
    }

    return { allowed: true, headers }
  }

  /**
   * Reset rate limit for an identifier
   */
  async reset(identifier: string, config: RateLimitConfig): Promise<void> {
    const key = config.keyGenerator
      ? config.keyGenerator(identifier)
      : `ratelimit:${identifier}`

    await this.store.reset(key)
  }

  /**
   * Decrement rate limit (useful for failed requests that shouldn't count)
   */
  async decrement(identifier: string, config: RateLimitConfig): Promise<void> {
    const key = config.keyGenerator
      ? config.keyGenerator(identifier)
      : `ratelimit:${identifier}`

    await this.store.decrement(key)
  }

  /**
   * Get current rate limit status
   */
  async getStatus(
    identifier: string,
    config: RateLimitConfig
  ): Promise<{ count: number; resetAt: Date } | null> {
    const key = config.keyGenerator
      ? config.keyGenerator(identifier)
      : `ratelimit:${identifier}`

    return this.store.get(key)
  }

  /**
   * Create rate limit middleware for Next.js API routes
   */
  createMiddleware(config: RateLimitConfig) {
    return async (
      identifier: string
    ): Promise<{ success: boolean; result?: RateLimitResult; error?: string }> => {
      const result = await this.checkLimit(identifier, config)

      if (!result.allowed) {
        return {
          success: false,
          result,
          error: config.message || 'Too many requests',
        }
      }

      return { success: true, result }
    }
  }

  /**
   * Clean up expired entries (for database store)
   */
  async cleanup(): Promise<void> {
    if (this.store instanceof DatabaseStore) {
      await this.store.cleanup()
    }
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit()
    }
    if (this.store instanceof MemoryStore) {
      this.store.destroy()
    }
  }
}

// Export singleton instance
export const rateLimitService = new RateLimitService()

// Export preset middlewares
export const authLimiter = rateLimitService.createMiddleware(rateLimits.auth)
export const bookingLimiter = rateLimitService.createMiddleware(rateLimits.booking)
export const paymentLimiter = rateLimitService.createMiddleware(rateLimits.payment)
export const uploadLimiter = rateLimitService.createMiddleware(rateLimits.upload)
export const apiLimiter = rateLimitService.createMiddleware(rateLimits.api)

// Export class for testing
export { RateLimitService, MemoryStore, RedisStore, DatabaseStore }
