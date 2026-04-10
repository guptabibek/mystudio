import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const envPath = '.env'

if (!existsSync(envPath)) {
  console.error('Missing .env file. Production deploy now uses .env directly.')
  process.exit(1)
}

function parseEnv(text) {
  const values = {}

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const separator = line.indexOf('=')
    if (separator === -1) {
      continue
    }

    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

const env = parseEnv(readFileSync(envPath, 'utf8'))

const requiredKeys = [
  'DATABASE_URL',
  'REDIS_URL',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXTAUTH_SECRET',
  'JWT_SECRET',
]

const missing = requiredKeys.filter((key) => !env[key])

if (missing.length > 0) {
  console.error(`Missing required production settings in .env: ${missing.join(', ')}`)
  process.exit(1)
}

const localhostKeys = [
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_APP_URL',
  'CORS_ORIGINS',
  'ESEWA_CALLBACK_BASE_URL',
  'ESEWA_SUCCESS_URL',
  'ESEWA_FAILURE_URL',
]

const localhostWarnings = localhostKeys.filter((key) => env[key]?.includes('localhost'))

if (localhostWarnings.length > 0) {
  console.warn('The following .env settings still point to localhost:')
  for (const key of localhostWarnings) {
    console.warn(`- ${key}=${env[key]}`)
  }
  console.warn('Update those values before deploying to a public VPS if you expect external traffic to work.')
}

const result = spawnSync(
  'docker',
  ['compose', '--env-file', '.env', '-f', 'docker-compose.prod.yml', 'up', '-d', '--build'],
  { stdio: 'inherit' }
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 0)