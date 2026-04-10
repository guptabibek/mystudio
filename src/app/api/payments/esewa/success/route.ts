/**
 * eSewa Payment Success Callback
 * Handles successful payment redirects from eSewa
 */

import { NextRequest, NextResponse } from 'next/server'
import { esewaService, type EsewaPaymentResponse } from '@/lib/services/payments/esewa'
import { config } from '@/lib/config'

type CallbackData = Partial<EsewaPaymentResponse> & { data?: string }

function parseBase64Payload(encoded: string | null): Partial<EsewaPaymentResponse> {
  if (!encoded) return {}
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const parsed = JSON.parse(decoded)
    return {
      transaction_code: parsed.transaction_code,
      status: parsed.status,
      total_amount: String(parsed.total_amount ?? ''),
      transaction_uuid: parsed.transaction_uuid,
      product_code: parsed.product_code,
      signed_field_names: parsed.signed_field_names,
      signature: parsed.signature,
      ref_id: parsed.ref_id,
    }
  } catch {
    return {}
  }
}

function valueOrEmpty(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : ''
}

async function parsePostBody(request: NextRequest): Promise<CallbackData> {
  const contentType = request.headers.get('content-type') || ''

  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const form = await request.formData()
    return {
      data: valueOrEmpty(form.get('data')),
      transaction_uuid: valueOrEmpty(form.get('transaction_uuid')),
      transaction_code: valueOrEmpty(form.get('transaction_code')),
      total_amount: valueOrEmpty(form.get('total_amount')),
      product_code: valueOrEmpty(form.get('product_code')),
      signed_field_names: valueOrEmpty(form.get('signed_field_names')),
      signature: valueOrEmpty(form.get('signature')),
      status: valueOrEmpty(form.get('status')),
      ref_id: valueOrEmpty(form.get('ref_id')) || undefined,
    }
  }

  if (contentType.includes('application/json')) {
    const json = (await request.json()) as Record<string, unknown>
    return {
      data: typeof json.data === 'string' ? json.data : undefined,
      transaction_uuid: typeof json.transaction_uuid === 'string' ? json.transaction_uuid : '',
      transaction_code: typeof json.transaction_code === 'string' ? json.transaction_code : '',
      total_amount: typeof json.total_amount === 'string' || typeof json.total_amount === 'number' ? String(json.total_amount) : '',
      product_code: typeof json.product_code === 'string' ? json.product_code : '',
      signed_field_names: typeof json.signed_field_names === 'string' ? json.signed_field_names : '',
      signature: typeof json.signature === 'string' ? json.signature : '',
      status: typeof json.status === 'string' ? json.status : '',
      ref_id: typeof json.ref_id === 'string' ? json.ref_id : undefined,
    }
  }

  return {}
}

async function getResponseFromRequest(request: NextRequest): Promise<EsewaPaymentResponse> {
  const { searchParams } = new URL(request.url)
  const postBody = request.method === 'POST' ? await parsePostBody(request) : {}

  const encodedData = postBody.data || searchParams.get('data')
  const decoded = parseBase64Payload(encodedData || null)

  return {
    transaction_uuid: decoded.transaction_uuid || postBody.transaction_uuid || searchParams.get('transaction_uuid') || '',
    transaction_code: decoded.transaction_code || postBody.transaction_code || searchParams.get('transaction_code') || '',
    total_amount: decoded.total_amount || postBody.total_amount || searchParams.get('total_amount') || '0',
    product_code: decoded.product_code || postBody.product_code || searchParams.get('product_code') || '',
    signed_field_names: decoded.signed_field_names || postBody.signed_field_names || searchParams.get('signed_field_names') || '',
    signature: decoded.signature || postBody.signature || searchParams.get('signature') || '',
    status: decoded.status || postBody.status || searchParams.get('status') || 'COMPLETE',
    ref_id: decoded.ref_id || postBody.ref_id || searchParams.get('ref_id') || undefined,
  }
}

function redirectWithQuery(params: URLSearchParams) {
  const appBase = config.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(new URL(`/?${params.toString()}`, appBase))
}

async function processCallback(request: NextRequest) {
  const response = await getResponseFromRequest(request)

  if (!response.transaction_uuid || !response.signature) {
    const query = new URLSearchParams({
      payment: 'error',
      provider: 'esewa',
      message: 'Invalid eSewa callback payload',
    })
    return redirectWithQuery(query)
  }

  const result = await esewaService.handleSuccessCallback(response)

  if (result.success) {
    const query = new URLSearchParams({
      payment: 'success',
      provider: 'esewa',
      transaction: response.transaction_code || response.transaction_uuid,
    })
    return redirectWithQuery(query)
  }

  if (result.status === 'PROCESSING') {
    const query = new URLSearchParams({
      payment: 'pending',
      provider: 'esewa',
      message: result.error || 'Payment is pending confirmation',
    })
    return redirectWithQuery(query)
  }

  if (result.status === 'CANCELLED') {
    const query = new URLSearchParams({
      payment: 'cancelled',
      provider: 'esewa',
      message: result.error || 'Payment was cancelled',
    })
    return redirectWithQuery(query)
  }

  if (result.status === 'REFUNDED') {
    const query = new URLSearchParams({
      payment: 'refunded',
      provider: 'esewa',
      message: result.error || 'Payment was refunded',
    })
    return redirectWithQuery(query)
  }

  const query = new URLSearchParams({
    payment: 'failed',
    provider: 'esewa',
    message: result.error || 'Payment verification failed',
  })
  return redirectWithQuery(query)
}

export async function GET(request: NextRequest) {
  try {
    return await processCallback(request)
  } catch (error) {
    console.error('eSewa success callback error:', error)
    const query = new URLSearchParams({
      payment: 'error',
      provider: 'esewa',
      message: 'An error occurred while verifying payment',
    })
    return redirectWithQuery(query)
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
