import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS
        ? [
            ...(process.env.NODE_ENV === 'development' ? (['warn', 'error'] as const) : (['error'] as const)),
            { emit: 'event', level: 'query' },
          ]
        : process.env.NODE_ENV === 'development'
          ? ['warn', 'error']
          : ['error'],
  })

const slowQueryThresholdMs = Number(process.env.PRISMA_SLOW_QUERY_THRESHOLD_MS || 0)
if (slowQueryThresholdMs > 0) {
  db.$on('query', (event) => {
    if (event.duration >= slowQueryThresholdMs) {
      console.warn(
        `[Prisma][SlowQuery] ${event.duration}ms | ${event.target} | ${event.query.replace(/\s+/g, ' ').trim()}`
      )
    }
  })
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db