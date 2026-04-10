/**
 * eSewa Payment Failure Callback
 * Handles failed/cancelled payment redirects from eSewa
 */

import { NextRequest, NextResponse } from 'next/server'
import { esewaService } from '@/lib/services/payments/esewa'
import { config } from '@/lib/config'

type FailurePayload = { transaction_uuid?: string; error?: string; status?: string; data?: string }

function parseBase64Payload(encoded: string | null): { transaction_uuid?: string; error?: string; status?: string } {
  if (!encoded) return {}
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const parsed = JSON.parse(decoded)
    return {
      transaction_uuid: parsed.transaction_uuid,
      error: parsed.error || parsed.status,
      status: parsed.status,
    }
  } catch {
    return {}
  }
}

function valueOrEmpty(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : ''
}

async function parsePostBody(request: NextRequest): Promise<FailurePayload> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    return {
      data: valueOrEmpty(form.get('data')),
      transaction_uuid: valueOrEmpty(form.get('transaction_uuid')),
      error: valueOrEmpty(form.get('error')),
      status: valueOrEmpty(form.get('status')),
    }
  }

  if (contentType.includes('application/json')) {
    const json = (await request.json()) as Record<string, unknown>
    return {
      data: typeof json.data === 'string' ? json.data : undefined,
      transaction_uuid: typeof json.transaction_uuid === 'string' ? json.transaction_uuid : '',
      error: typeof json.error === 'string' ? json.error : '',
      status: typeof json.status === 'string' ? json.status : '',
    }
  }

  return {}
}

function redirectToClient(params: URLSearchParams) {
  const appBase = config.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(new URL(`/?${params.toString()}`, appBase))
}

async function processCallback(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const postBody = request.method === 'POST' ? await parsePostBody(request) : {}

  const decoded = parseBase64Payload(postBody.data || searchParams.get('data'))
  const transactionUuid =
    decoded.transaction_uuid || postBody.transaction_uuid || searchParams.get('transaction_uuid') || ''
  const status = decoded.status || postBody.status || searchParams.get('status') || 'CANCELED'
  const errorMessage =
    decoded.error ||
    postBody.error ||
    searchParams.get('error') ||
    (status.toUpperCase() === 'NOT_FOUND'
      ? 'Payment session expired in eSewa. Please retry payment.'
      : 'Payment was cancelled or failed')

  if (transactionUuid) {
    await esewaService.handleFailureCallback({
      transaction_uuid: transactionUuid,
      status,
      error: errorMessage,
    })
  }

  const query = new URLSearchParams({
    payment: status.toUpperCase() === 'NOT_FOUND' ? 'expired' : 'cancelled',
    provider: 'esewa',
    message: errorMessage,
  })
  return redirectToClient(query)
}

export async function GET(request: NextRequest) {
  try {
    return await processCallback(request)
  } catch (error) {
    console.error('eSewa failure callback error:', error)
    const query = new URLSearchParams({
      payment: 'error',
      provider: 'esewa',
      message: 'An error occurred while handling failed payment',
    })
    return redirectToClient(query)
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
