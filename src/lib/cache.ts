import Redis from 'ioredis'

type Loader<T> = () => Promise<T>

interface CacheEnvelope<T> {
  value: T
  expiresAt: number
}

const memoryStore = new Map<string, CacheEnvelope<unknown>>()
const inflightLoads = new Map<string, Promise<unknown>>()

let redisClient: Redis | null | undefined

function getRedisClient() {
  if (redisClient !== undefined) return redisClient

  const url = process.env.REDIS_URL
  if (!url) {
    redisClient = null
    return redisClient
  }

  redisClient = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableAutoPipelining: true,
  })

  redisClient.on('error', (error) => {
    console.warn('Redis cache error:', error)
  })

  return redisClient
}

function isExpired(expiresAt: number) {
  return Date.now() > expiresAt
}

async function getFromRedis<T>(key: string): Promise<T | null> {
  const client = getRedisClient()
  if (!client) return null

  try {
    if (client.status === 'wait') {
      await client.connect()
    }

    const raw = await client.get(key)
    if (!raw) return null

    const parsed = JSON.parse(raw) as CacheEnvelope<T>
    if (isExpired(parsed.expiresAt)) {
      await client.del(key)
      return null
    }

    return parsed.value
  } catch {
    return null
  }
}

async function setToRedis<T>(key: string, value: T, ttlSeconds: number) {
  const client = getRedisClient()
  if (!client) return

  try {
    if (client.status === 'wait') {
      await client.connect()
    }

    const envelope: CacheEnvelope<T> = {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    }

    await client.set(key, JSON.stringify(envelope), 'EX', ttlSeconds)
  } catch {
    // Best-effort cache write only.
  }
}

export async function getOrSetCache<T>(
  key: string,
  ttlSeconds: number,
  loader: Loader<T>
): Promise<T> {
  const existing = memoryStore.get(key)
  if (existing && !isExpired(existing.expiresAt)) {
    return existing.value as T
  }

  const redisValue = await getFromRedis<T>(key)
  if (redisValue !== null) {
    memoryStore.set(key, {
      value: redisValue,
      expiresAt: Date.now() + ttlSeconds * 1000,
    })
    return redisValue
  }

  const activeLoad = inflightLoads.get(key)
  if (activeLoad) {
    return activeLoad as Promise<T>
  }

  const loadPromise = (async () => {
    const value = await loader()
    const expiresAt = Date.now() + ttlSeconds * 1000
    memoryStore.set(key, { value, expiresAt })
    await setToRedis(key, value, ttlSeconds)
    return value
  })()

  inflightLoads.set(key, loadPromise)

  try {
    return await loadPromise
  } finally {
    inflightLoads.delete(key)
  }
}

export async function invalidateCacheByPrefix(prefix: string) {
  for (const key of memoryStore.keys()) {
    if (key.startsWith(prefix)) {
      memoryStore.delete(key)
    }
  }

  const client = getRedisClient()
  if (!client) return

  try {
    if (client.status === 'wait') {
      await client.connect()
    }

    let cursor = '0'
    do {
      const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 200)
      cursor = nextCursor

      if (keys.length > 0) {
        await client.del(...keys)
      }
    } while (cursor !== '0')

    for (const key of inflightLoads.keys()) {
      if (key.startsWith(prefix)) {
        inflightLoads.delete(key)
      }
    }
  } catch {
    // Best-effort invalidation only.
  }
}

export async function deleteCacheKey(key: string) {
  memoryStore.delete(key)

  const client = getRedisClient()
  if (!client) return

  try {
    if (client.status === 'wait') {
      await client.connect()
    }

    await client.del(key)
  } catch {
    // Best-effort invalidation only.
  }
}