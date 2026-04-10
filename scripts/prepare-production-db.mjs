import { spawnSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit' })

  if (result.error) {
    throw result.error
  }

  if ((result.status ?? 0) !== 0) {
    process.exit(result.status ?? 1)
  }
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT to_regclass('public."${tableName}"') AS value`
  )

  return rows[0]?.value !== null
}

async function getFailedMigrations() {
  const hasMigrationsTable = await tableExists('_prisma_migrations')

  if (!hasMigrationsTable) {
    return []
  }

  const rows = await prisma.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL ORDER BY started_at ASC'
  )

  return rows.map((row) => row.migration_name)
}

async function main() {
  const hasPackageTable = await tableExists('Package')
  const failedMigrations = await getFailedMigrations()

  if (!hasPackageTable) {
    if (failedMigrations.length > 0) {
      console.log('Resolving failed Prisma migrations before bootstrap...')
      for (const migrationName of failedMigrations) {
        run('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', migrationName])
      }
    }

    console.log('Bootstrapping schema with prisma db push...')
    run('npx', ['prisma', 'db', 'push', '--skip-generate'])
  }

  console.log('Applying Prisma migrations...')
  run('npx', ['prisma', 'migrate', 'deploy'])
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}