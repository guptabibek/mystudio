/**
 * eSewa ePay integration service (v2 form flow)
 * Reference: https://developer.esewa.com.np/pages/Epay#transactionflow
 */

import crypto from 'crypto'
import { db } from '@/lib/db'
import { config, isProduction } from '@/lib/config'

export interface EsewaConfig {
  merchantId: string
  secretKey: string
  successUrl: string
  failureUrl: string
}

type EsewaGatewayStatus =
  | 'COMPLETE'
  | 'PENDING'
  | 'FULL_REFUND'
  | 'PARTIAL_REFUND'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'CANCELED'
  | 'FAILED'
  | 'UNKNOWN'

type InternalPaymentStatus = 'COMPLETED' | 'PROCESSING' | 'FAILED' | 'CANCELLED' | 'REFUNDED'

export interface EsewaPaymentRequest {
  amount: string
  tax_amount: string
  total_amount: string
  transaction_uuid: string
  product_code: string
  product_service_charge: string
  product_delivery_charge: string
  success_url: string
  failure_url: string
  signed_field_names: string
  signature: string
}

export interface EsewaPaymentResponse {
  transaction_code: string
  status: string
  total_amount: string
  transaction_uuid: string
  product_code: string
  signed_field_names: string
  signature: string
  ref_id?: string
}

export interface EsewaVerificationResult {
  verified: boolean
  transactionCode?: string
  transactionUuid?: string
  amount?: number
  status?: EsewaGatewayStatus
  paymentStatus?: InternalPaymentStatus
  error?: string
  rawResponse?: Record<string, unknown>
}

export interface EsewaConfigurationStatus {
  isConfigured: boolean
  missing: string[]
  mode: 'production' | 'development'
  urls: {
    form: string
    status: string
    success: string
    failure: string
  }
}

const ESEWA_URLS = {
  production: {
    form: 'https://epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://esewa.com.np/api/epay/transaction/status/',
  },
  development: {
    form: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    status: 'https://rc.esewa.com.np/api/epay/transaction/status/',
  },
}

class EsewaService {
  private cfg: EsewaConfig | null = null
  private urls = this.resolveUrls()

  private resolveUrls(): { form: string; status: string } {
    const defaults = isProduction ? ESEWA_URLS.production : ESEWA_URLS.development
    return {
      form: config.ESEWA_FORM_URL || config.ESEWA_API_URL || defaults.form,
      status: config.ESEWA_STATUS_CHECK_URL || defaults.status,
    }
  }

  constructor() {
    const appBase =
      config.ESEWA_CALLBACK_BASE_URL ||
      config.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'

    if (config.ESEWA_MERCHANT_ID && config.ESEWA_SECRET_KEY) {
      this.cfg = {
        merchantId: config.ESEWA_MERCHANT_ID,
        secretKey: config.ESEWA_SECRET_KEY,
        successUrl: config.ESEWA_SUCCESS_URL || `${appBase}/api/payments/esewa/success`,
        failureUrl: config.ESEWA_FAILURE_URL || `${appBase}/api/payments/esewa/failure`,
      }
    }
  }

  isConfigured(): boolean {
    return this.getConfigurationStatus().isConfigured
  }

  getConfigurationStatus(): EsewaConfigurationStatus {
    const missing: string[] = []

    if (!config.ESEWA_MERCHANT_ID) missing.push('ESEWA_MERCHANT_ID')
    if (!config.ESEWA_SECRET_KEY) missing.push('ESEWA_SECRET_KEY')
    if (!this.urls.form) missing.push('ESEWA_FORM_URL')
    if (!this.urls.status) missing.push('ESEWA_STATUS_CHECK_URL')

    const appBase =
      config.ESEWA_CALLBACK_BASE_URL ||
      config.NEXTAUTH_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'http://localhost:3000'
    const success = config.ESEWA_SUCCESS_URL || `${appBase}/api/payments/esewa/success`
    const failure = config.ESEWA_FAILURE_URL || `${appBase}/api/payments/esewa/failure`

    return {
      isConfigured: missing.length === 0,
      missing,
      mode: isProduction ? 'production' : 'development',
      urls: {
        form: this.urls.form,
        status: this.urls.status,
        success,
        failure,
      },
    }
  }

  getFormUrl(): string {
    return this.urls.form
  }

  private normalizeAmount(value: number): string {
    return Number(value).toFixed(2)
  }

  private normalizeGatewayStatus(status?: string | null): EsewaGatewayStatus {
    const value = String(status || '').trim().toUpperCase()
    if (value === 'COMPLETE') return 'COMPLETE'
    if (value === 'PENDING') return 'PENDING'
    if (value === 'FULL_REFUND') return 'FULL_REFUND'
    if (value === 'PARTIAL_REFUND') return 'PARTIAL_REFUND'
    if (value === 'AMBIGUOUS') return 'AMBIGUOUS'
    if (value === 'NOT_FOUND') return 'NOT_FOUND'
    if (value === 'CANCELED' || value === 'CANCELLED') return 'CANCELED'
    if (value === 'FAILED') return 'FAILED'
    return value ? 'UNKNOWN' : 'FAILED'
  }

  private toInternalPaymentStatus(status: EsewaGatewayStatus): InternalPaymentStatus {
    if (status === 'COMPLETE') return 'COMPLETED'
    if (status === 'PENDING' || status === 'AMBIGUOUS') return 'PROCESSING'
    if (status === 'FULL_REFUND' || status === 'PARTIAL_REFUND') return 'REFUNDED'
    if (status === 'CANCELED' || status === 'NOT_FOUND') return 'CANCELLED'
    return 'FAILED'
  }

  private statusMessage(status: EsewaGatewayStatus): string {
    switch (status) {
      case 'COMPLETE':
        return 'Payment completed'
      case 'PENDING':
        return 'Payment pending confirmation from eSewa'
      case 'AMBIGUOUS':
        return 'Payment is in ambiguous state at eSewa'
      case 'FULL_REFUND':
      case 'PARTIAL_REFUND':
        return 'Payment has been refunded at eSewa'
      case 'NOT_FOUND':
        return 'Payment session expired or not found at eSewa'
      case 'CANCELED':
        return 'Payment was canceled at eSewa'
      default:
        return 'Unable to verify payment with eSewa'
    }
  }

  private generateTxnUuid(): string {
    const now = new Date()
    const ts = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now
      .getDate()
      .toString()
      .padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}`
    const rand = crypto.randomBytes(3).toString('hex').toUpperCase()
    return `${ts}-${rand}`
  }

  private generateSignature(payload: Record<string, string>, signedFieldNames: string, secretKey: string): string {
    const fieldNames = signedFieldNames
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean)
    const message = fieldNames.map((name) => `${name}=${payload[name] ?? ''}`).join(',')
    return crypto.createHmac('sha256', secretKey).update(message).digest('base64')
  }

  private verifySignature(
    payload: Record<string, string>,
    signedFieldNames: string,
    receivedSignature: string,
    secretKey: string
  ): boolean {
    const expected = this.generateSignature(payload, signedFieldNames, secretKey)
    try {
      return crypto.timingSafeEqual(
        Buffer.from(receivedSignature, 'base64'),
        Buffer.from(expected, 'base64')
      )
    } catch {
      return false
    }
  }

  async createPaymentRequest(params: {
    bookingId: string
    amount: number
    taxAmount?: number
    serviceCharge?: number
    deliveryCharge?: number
    successUrl?: string
    failureUrl?: string
  }): Promise<{ transactionUuid: string; paymentUrl: string; formData: EsewaPaymentRequest }> {
    if (!this.cfg) throw new Error('eSewa is not configured')

    const amount = Number(params.amount) || 0
    const taxAmount = Number(params.taxAmount || 0)
    const serviceCharge = Number(params.serviceCharge || 0)
    const deliveryCharge = Number(params.deliveryCharge || 0)
    const totalAmount = amount + taxAmount + serviceCharge + deliveryCharge

    const transactionUuid = this.generateTxnUuid()
    const signedFieldNames = 'total_amount,transaction_uuid,product_code'

    const payload: EsewaPaymentRequest = {
      amount: this.normalizeAmount(amount),
      tax_amount: this.normalizeAmount(taxAmount),
      total_amount: this.normalizeAmount(totalAmount),
      transaction_uuid: transactionUuid,
      product_code: this.cfg.merchantId,
      product_service_charge: this.normalizeAmount(serviceCharge),
      product_delivery_charge: this.normalizeAmount(deliveryCharge),
      success_url: params.successUrl || this.cfg.successUrl,
      failure_url: params.failureUrl || this.cfg.failureUrl,
      signed_field_names: signedFieldNames,
      signature: '',
    }

    payload.signature = this.generateSignature(
      payload as unknown as Record<string, string>,
      signedFieldNames,
      this.cfg.secretKey
    )

    const pendingPayment = await db.payment.findFirst({
      where: { bookingId: params.bookingId, method: 'ESEWA', status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })

    if (!pendingPayment) {
      throw new Error('Pending eSewa payment record not found')
    }

    await db.payment.update({
      where: { id: pendingPayment.id },
      data: {
        transactionId: transactionUuid,
        esewaProductId: params.bookingId,
        esewaSignature: payload.signature,
      },
    })

    return {
      transactionUuid,
      paymentUrl: this.urls.form,
      formData: payload,
    }
  }

  async lookupTransaction(transactionUuid: string, totalAmount: number) {
    if (!this.cfg) return { status: 'FAILED' as const }

    const timeoutMs = Math.max(1000, config.ESEWA_STATUS_TIMEOUT_MS || 12000)
    const retries = Math.max(0, config.ESEWA_STATUS_RETRIES || 1)

    try {
      const statusUrl = new URL(this.urls.status)
      statusUrl.searchParams.set('product_code', this.cfg.merchantId)
      statusUrl.searchParams.set('total_amount', this.normalizeAmount(totalAmount))
      statusUrl.searchParams.set('transaction_uuid', transactionUuid)

      for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(statusUrl.toString(), {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
          cache: 'no-store',
        })

        if (!res.ok) {
          if (res.status === 404) {
            return { status: 'NOT_FOUND' as const, data: { status: 'NOT_FOUND' } }
          }
          if (attempt < retries && res.status >= 500) {
            continue
          }
          return { status: 'FAILED' as const }
        }

        const data = await res.json()
        const normalized = this.normalizeGatewayStatus(data?.status)
        return { status: normalized, data }
      }

      return { status: 'FAILED' as const }
    } catch {
      return { status: 'FAILED' as const }
    }
  }

  async verifyPayment(response: EsewaPaymentResponse): Promise<EsewaVerificationResult> {
    if (!this.cfg) return { verified: false, error: 'eSewa is not configured' }

    const responsePayload: Record<string, string> = {
      transaction_code: response.transaction_code || '',
      status: response.status || '',
      total_amount: response.total_amount || '',
      transaction_uuid: response.transaction_uuid || '',
      product_code: response.product_code || '',
      signed_field_names: response.signed_field_names || '',
    }

    const signatureOk = this.verifySignature(
      responsePayload,
      response.signed_field_names,
      response.signature,
      this.cfg.secretKey
    )

    if (!signatureOk) {
      return { verified: false, status: 'FAILED', paymentStatus: 'FAILED', error: 'Invalid eSewa callback signature' }
    }

    const totalAmountNum = Number(response.total_amount)
    const callbackStatus = this.normalizeGatewayStatus(response.status)
    const statusCheck = await this.lookupTransaction(response.transaction_uuid, totalAmountNum)
    const resolvedStatus =
      statusCheck.status && statusCheck.status !== 'FAILED'
        ? this.normalizeGatewayStatus(statusCheck.status)
        : callbackStatus
    const paymentStatus = this.toInternalPaymentStatus(resolvedStatus)

    if (resolvedStatus !== 'COMPLETE') {
      return {
        verified: false,
        status: resolvedStatus,
        paymentStatus,
        error: this.statusMessage(resolvedStatus),
        rawResponse: statusCheck.data,
      }
    }

    return {
      verified: true,
      transactionCode:
        response.transaction_code ||
        String((statusCheck.data as { ref_id?: string } | undefined)?.ref_id || ''),
      transactionUuid: response.transaction_uuid,
      amount: totalAmountNum,
      status: resolvedStatus,
      paymentStatus,
      rawResponse: statusCheck.data,
    }
  }

  private async updatePaymentWithGatewayState(params: {
    paymentId: string
    bookingId: string
    userId: string
    gatewayStatus: EsewaGatewayStatus
    gatewayReference?: string
    webhookData: unknown
    reason?: string
  }) {
    const nextStatus = this.toInternalPaymentStatus(params.gatewayStatus)

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: params.paymentId },
        data: {
          status: nextStatus,
          gatewayReference: params.gatewayReference,
          webhookReceived: true,
          webhookData: JSON.stringify(params.webhookData),
          webhookProcessedAt: new Date(),
          failureReason:
            nextStatus === 'COMPLETED'
              ? null
              : params.reason || this.statusMessage(params.gatewayStatus),
        },
      })

      if (nextStatus === 'COMPLETED') {
        await tx.booking.update({
          where: { id: params.bookingId },
          data: { status: 'CONFIRMED', confirmedAt: new Date() },
        })
      }

      await tx.auditLog.create({
        data: {
          userId: params.userId,
          action:
            nextStatus === 'COMPLETED'
              ? 'PAYMENT_COMPLETED'
              : nextStatus === 'REFUNDED'
                ? 'PAYMENT_REFUNDED'
                : nextStatus === 'PROCESSING'
                  ? 'PAYMENT_VERIFIED'
                  : 'PAYMENT_FAILED',
          entityType: 'Payment',
          entityId: params.paymentId,
          description:
            nextStatus === 'COMPLETED'
              ? `eSewa payment completed: ${params.gatewayReference || 'N/A'}`
              : `eSewa payment status ${params.gatewayStatus}: ${
                  params.reason || this.statusMessage(params.gatewayStatus)
                }`,
        },
      })
    })

    return nextStatus
  }

  async handleSuccessCallback(
    response: EsewaPaymentResponse
  ): Promise<{ success: boolean; paymentId?: string; error?: string; status?: InternalPaymentStatus }> {
    const verification = await this.verifyPayment(response)

    const payment = await db.payment.findFirst({
      where: { transactionId: response.transaction_uuid },
      include: { booking: true },
    })

    if (!payment) {
      return { success: false, error: 'Payment record not found' }
    }

    if (payment.status === 'COMPLETED') {
      return { success: true, paymentId: payment.id, status: 'COMPLETED' }
    }

    const gatewayStatus = verification.status || 'FAILED'
    const reference = verification.transactionCode || response.ref_id || response.transaction_code
    const reason = verification.error || this.statusMessage(gatewayStatus)

    const finalStatus = await this.updatePaymentWithGatewayState({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      userId: payment.userId,
      gatewayStatus,
      gatewayReference: reference,
      webhookData: {
        callback: response,
        statusCheck: verification.rawResponse,
      },
      reason,
    })

    if (!verification.verified) {
      return { success: false, error: reason, status: finalStatus }
    }

    return { success: true, paymentId: payment.id, status: finalStatus }
  }

  async handleFailureCallback(input: { transaction_uuid?: string; error?: string; status?: string }) {
    if (!input.transaction_uuid) return { success: true }

    const payment = await db.payment.findFirst({ where: { transactionId: input.transaction_uuid } })
    if (!payment) return { success: true }

    if (payment.status === 'COMPLETED') return { success: true }

    const gatewayStatus = this.normalizeGatewayStatus(input.status)
    const effectiveStatus = gatewayStatus === 'FAILED' ? 'CANCELED' : gatewayStatus
    const reason = input.error || this.statusMessage(effectiveStatus)

    await this.updatePaymentWithGatewayState({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      userId: payment.userId,
      gatewayStatus: effectiveStatus,
      gatewayReference: input.transaction_uuid,
      webhookData: input,
      reason,
    })

    return { success: true }
  }

  async syncPaymentStatus(paymentId: string): Promise<{
    success: boolean
    status?: EsewaGatewayStatus
    paymentStatus?: InternalPaymentStatus
    error?: string
    rawResponse?: Record<string, unknown>
  }> {
    const payment = await db.payment.findUnique({ where: { id: paymentId } })
    if (!payment || payment.method !== 'ESEWA') {
      return { success: false, error: 'eSewa payment record not found' }
    }

    if (!payment.transactionId) {
      return { success: false, error: 'Missing eSewa transaction UUID' }
    }

    const statusCheck = await this.lookupTransaction(payment.transactionId, Number(payment.amount))
    const gatewayStatus = this.normalizeGatewayStatus(statusCheck.status)
    const refId =
      (statusCheck.data as { ref_id?: string; transaction_code?: string } | undefined)?.ref_id ||
      (statusCheck.data as { ref_id?: string; transaction_code?: string } | undefined)
        ?.transaction_code ||
      payment.gatewayReference ||
      undefined

    const updatedStatus = await this.updatePaymentWithGatewayState({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      userId: payment.userId,
      gatewayStatus,
      gatewayReference: refId,
      webhookData: statusCheck.data || { status: gatewayStatus },
      reason: this.statusMessage(gatewayStatus),
    })

    return {
      success: true,
      status: gatewayStatus,
      paymentStatus: updatedStatus,
      rawResponse: statusCheck.data,
    }
  }

  generatePaymentFormHtml(formData: EsewaPaymentRequest, paymentUrl: string): string {
    const fields = Object.entries(formData)
      .map(
        ([key, value]) =>
          `<input type="hidden" name="${key}" value="${String(value).replace(/"/g, '&quot;')}">`
      )
      .join('\n')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Redirecting to eSewa</title>
  <style>
    :root { --bg:#0D0D0D; --panel:#161616; --text:#F8F6F2; --muted:#9a948d; --brand:#60BB46; }
    * { box-sizing:border-box; }
    body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 20% 20%, #1f1a12, #0D0D0D 45%); color:var(--text); font-family: Inter, Segoe UI, Arial, sans-serif; }
    .card { width:min(92vw, 420px); background:var(--panel); border:1px solid rgba(248,246,242,.08); border-radius:20px; padding:28px; text-align:center; box-shadow:0 16px 40px rgba(0,0,0,.35); }
    .dot { width:52px; height:52px; border-radius:999px; border:4px solid rgba(96,187,70,.2); border-top-color:var(--brand); margin:0 auto 16px; animation:spin 1s linear infinite; }
    h1 { margin:0; font-size:1.05rem; }
    p { margin:10px 0 0; color:var(--muted); font-size:.92rem; }
    @keyframes spin { to { transform:rotate(360deg);} }
  </style>
</head>
<body>
  <div class="card">
    <div class="dot"></div>
    <h1>Connecting to eSewa Secure Checkout</h1>
    <p>Please wait while we redirect you to complete payment.</p>
  </div>
  <form id="esewaForm" method="POST" action="${paymentUrl}">${fields}</form>
  <script>document.getElementById('esewaForm').submit();</script>
</body>
</html>`
  }
}

export const esewaService = new EsewaService()
export { EsewaService }
