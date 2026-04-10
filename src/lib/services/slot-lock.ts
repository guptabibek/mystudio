import Redis from 'ioredis'
import { config } from '@/lib/config'

class MemorySlotLock {
  private locks = new Map<string, { token: string; expiresAt: number }>()

  async acquire(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now()
    const current = this.locks.get(key)
    if (current && current.expiresAt > now) return false

    this.locks.set(key, {
      token,
      expiresAt: now + ttlSeconds * 1000,
    })
    return true
  }

  async release(key: string, token: string): Promise<void> {
    const current = this.locks.get(key)
    if (!current) return
    if (current.token !== token) return
    this.locks.delete(key)
  }
}

class RedisSlotLock {
  constructor(private redis: Redis) {}

  async acquire(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    const result = await this.redis.set(key, token, 'EX', ttlSeconds, 'NX')
    return result === 'OK'
  }

  async release(key: string, token: string): Promise<void> {
    const lua = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `
    await this.redis.eval(lua, 1, key, token)
  }
}

class SlotLockService {
  private redisClient: Redis | null = null
  private memory = new MemorySlotLock()
  private redisLock: RedisSlotLock | null = null

  constructor() {
    if (config.REDIS_URL) {
      try {
        this.redisClient = new Redis(config.REDIS_URL, {
          password: config.REDIS_PASSWORD,
          maxRetriesPerRequest: 2,
          lazyConnect: true,
        })
        this.redisLock = new RedisSlotLock(this.redisClient)
      } catch {
        this.redisLock = null
      }
    }
  }

  buildKey(params: { date: string; startTime: string; endTime: string }): string {
    return `slot:lock:${params.date}:${params.startTime}:${params.endTime}`
  }

  async acquire(key: string, token: string, ttlSeconds: number): Promise<boolean> {
    if (this.redisLock) {
      try {
        return await this.redisLock.acquire(key, token, ttlSeconds)
      } catch {
        return this.memory.acquire(key, token, ttlSeconds)
      }
    }
    return this.memory.acquire(key, token, ttlSeconds)
  }

  async release(key: string, token: string): Promise<void> {
    if (this.redisLock) {
      try {
        await this.redisLock.release(key, token)
        return
      } catch {
        // fallback below
      }
    }
    await this.memory.release(key, token)
  }
}

export const slotLockService = new SlotLockService()
