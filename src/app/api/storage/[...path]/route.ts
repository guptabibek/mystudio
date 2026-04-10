/**
 * Storage API Route
 * Serves uploaded files from local storage with streaming for large files
 */

import { NextRequest, NextResponse } from 'next/server'
import { stat, access, open } from 'fs/promises'
import { createReadStream } from 'fs'
import { join } from 'path'
import mime from 'mime-types'
import { config } from '@/lib/config'
import { Readable } from 'stream'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path: pathSegments } = await params
    
    if (!pathSegments || pathSegments.length === 0) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 })
    }

    // Sanitize path to prevent directory traversal
    const sanitizedPath = pathSegments
      .map(segment => segment.replace(/\.\./g, '').replace(/[<>:"|?*]/g, ''))
      .filter(segment => segment.length > 0)
      .join('/')

    const uploadDir = config.UPLOAD_DIR || './uploads'
    let resolvedPath = join(uploadDir, sanitizedPath)

    // Check if file exists
    try {
      await access(resolvedPath)
    } catch {
      // Backward compatibility: older DB rows stored preview/thumbnail with original extension
      // while generated variants are .jpg (preview) and .webp (thumbnail).
      let fallbackPath: string | null = null
      if (sanitizedPath.includes('/thumbnail/')) {
        fallbackPath = join(uploadDir, sanitizedPath.replace(/\.[^.]+$/, '.webp'))
      } else if (sanitizedPath.includes('/preview/')) {
        fallbackPath = join(uploadDir, sanitizedPath.replace(/\.[^.]+$/, '.jpg'))
      }

      if (!fallbackPath) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }

      try {
        await access(fallbackPath)
        resolvedPath = fallbackPath
      } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
    }

    const fileStat = await stat(resolvedPath)
    const contentType = mime.lookup(resolvedPath) || 'application/octet-stream'
    const fileSize = fileStat.size

    // Check for download query param — forces Content-Disposition: attachment
    const forceDownload = request.nextUrl.searchParams.get('download') === '1'

    // Support HTTP Range requests for fast seeking / resumable downloads
    const rangeHeader = request.headers.get('range')

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
        const chunkSize = end - start + 1

        const stream = createReadStream(resolvedPath, { start, end })
        const webStream = Readable.toWeb(stream) as ReadableStream

        const headers: Record<string, string> = {
          'Content-Type': contentType,
          'Content-Length': chunkSize.toString(),
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'X-Content-Type-Options': 'nosniff',
        }
        if (forceDownload) {
          const filename = sanitizedPath.split('/').pop() || 'download'
          headers['Content-Disposition'] = `attachment; filename="${filename}"`
        }

        return new NextResponse(webStream, { status: 206, headers })
      }
    }

    // Full file — stream it to avoid buffering large DSLR images in memory
    const stream = createReadStream(resolvedPath)
    const webStream = Readable.toWeb(stream) as ReadableStream

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Length': fileSize.toString(),
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    }
    if (forceDownload) {
      const filename = sanitizedPath.split('/').pop() || 'download'
      headers['Content-Disposition'] = `attachment; filename="${filename}"`
    }

    return new NextResponse(webStream, { status: 200, headers })
  } catch (error) {
    console.error('Storage error:', error)
    return NextResponse.json({ error: 'Failed to serve file' }, { status: 500 })
  }
}
