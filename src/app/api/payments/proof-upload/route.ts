import { NextRequest } from 'next/server'
import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { apiError, apiResponse, requireAuth } from '@/lib/utils/api'
import { config } from '@/lib/config'

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
])

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth(req)
    const form = await req.formData()
    const file = form.get('file')

    if (!(file instanceof File)) {
      return apiError('file is required', 400)
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return apiError('Only JPG, PNG, WEBP, and PDF proof files are allowed', 400)
    }

    const maxBytes = 10 * 1024 * 1024
    if (file.size > maxBytes) {
      return apiError('Proof file must be <= 10MB', 400)
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const safeExt = (ext || 'bin').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin'
    const filename = `${user.id}-${Date.now()}-${randomUUID().slice(0, 8)}.${safeExt}`

    const relativeDir = join('proofs', 'temp')
    const absoluteDir = join(config.UPLOAD_DIR || './uploads', relativeDir)
    await mkdir(absoluteDir, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    const absolutePath = join(absoluteDir, filename)
    await writeFile(absolutePath, buffer)

    const publicPath = `/api/storage/proofs/temp/${filename}`
    return apiResponse({
      url: publicPath,
      filename,
      mimeType: file.type,
      size: file.size,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return apiError('Authentication required', 401)
    }
    console.error('Proof upload error:', error)
    return apiError('Failed to upload payment proof', 500)
  }
}
