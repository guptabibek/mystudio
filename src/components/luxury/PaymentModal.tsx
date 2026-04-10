'use client'

import { useState, useEffect } from 'react'
import { X, CreditCard, Loader2, CheckCircle2, AlertCircle, Banknote, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { loadStripe, type Stripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

const stripePromises = new Map<string, Promise<Stripe | null>>()
function getStripe(publishableKey: string) {
  if (!publishableKey) return null
  if (!stripePromises.has(publishableKey)) {
    stripePromises.set(publishableKey, loadStripe(publishableKey))
  }
  return stripePromises.get(publishableKey) || null
}

type PaymentMethod = 'stripe' | 'esewa' | 'bank' | 'cash'

interface PaymentModalProps {
  open: boolean
  onClose: () => void
  bookingId: string
  bookingNumber: string
  amount: number
  currency: string
  onSuccess: () => void
}

function StripeCheckoutForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setProcessing(true)
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/?payment=success` },
      redirect: 'if_required',
    })

    if (error) {
      onError(error.message || 'Payment failed')
      setProcessing(false)
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement
        options={{
          layout: 'tabs',
          fields: { billingDetails: { address: 'never' } },
        }}
      />
      <button
        type="submit"
        disabled={!stripe || processing}
        className={cn(
          'w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300',
          'flex items-center justify-center gap-2 touch-manipulation',
          processing
            ? 'bg-gold/50 text-[#0D0D0D]/50 cursor-not-allowed'
            : 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
        )}
      >
        {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
        {processing ? 'Processing...' : 'Pay Now'}
      </button>
    </form>
  )
}

export function PaymentModal({ open, onClose, bookingId, bookingNumber, amount, currency, onSuccess }: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod | null>(null)
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [stripePublishableKey, setStripePublishableKey] = useState(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')
  const [stripeReason, setStripeReason] = useState('Stripe is not configured')
  const [bankForm, setBankForm] = useState({
    bankName: '',
    bankAccountNumber: '',
    bankReferenceNumber: '',
    notes: '',
  })
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [uploadingProof, setUploadingProof] = useState(false)

  const stripeAvailable = !!stripePublishableKey

  useEffect(() => {
    if (open) {
      setMethod(null)
      setClientSecret(null)
      setLoading(false)
      setError('')
      setSuccess(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return

    let cancelled = false
    async function loadStripeConfig() {
      try {
        const res = await fetch('/api/payments/stripe/config', { cache: 'no-store' })
        const data = await res.json()
        if (!cancelled && res.ok) {
          const payload = data.data ?? data
          const key = payload.publishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
          setStripePublishableKey(key)
          setStripeReason(payload.reason || 'Stripe is not configured')
        }
      } catch {
        if (!cancelled) {
          setStripePublishableKey(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '')
          setStripeReason('Unable to verify Stripe configuration')
        }
      }
    }

    void loadStripeConfig()
    return () => {
      cancelled = true
    }
  }, [open])

  const initStripe = async () => {
    setMethod('stripe')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payments/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to initialize payment')
      setClientSecret(data.data?.clientSecret ?? data.clientSecret)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment initialization failed')
      setMethod(null)
    } finally {
      setLoading(false)
    }
  }

  const initEsewa = async () => {
    setMethod('esewa')
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payments/esewa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'eSewa is not available')
      }
      // eSewa returns HTML form that auto-submits to wallet gateway.
      const html = await res.text()
      document.open()
      document.write(html)
      document.close()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'eSewa initialization failed')
      setMethod(null)
    } finally {
      setLoading(false)
    }
  }

  const submitManualPayment = async (manualMethod: 'bank' | 'cash') => {
    setLoading(true)
    setError('')
    try {
      let paymentProofUrl: string | undefined

      if (manualMethod === 'bank') {
        if (!bankForm.bankName || !bankForm.bankReferenceNumber) {
          throw new Error('Bank name and reference number are required')
        }
        if (!proofFile) {
          throw new Error('Please upload transfer proof')
        }

        setUploadingProof(true)
        const formData = new FormData()
        formData.append('file', proofFile)
        const proofRes = await fetch('/api/payments/proof-upload', {
          method: 'POST',
          body: formData,
        })
        const proofData = await proofRes.json()
        if (!proofRes.ok) {
          throw new Error(proofData.error || 'Failed to upload payment proof')
        }
        paymentProofUrl = proofData.data?.url || proofData.url
      }

      const res = await fetch('/api/payments/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId,
          method: manualMethod,
          bankName: bankForm.bankName,
          bankAccountNumber: bankForm.bankAccountNumber,
          bankReferenceNumber: bankForm.bankReferenceNumber,
          paymentProofUrl,
          notes: bankForm.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to submit manual payment')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Manual payment failed')
    } finally {
      setUploadingProof(false)
      setLoading(false)
    }
  }

  if (!open) return null

  const stripe = getStripe(stripePublishableKey)
  const formattedAmount = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount)

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md mx-auto bg-[#111111] border border-white/[0.08] rounded-t-3xl sm:rounded-3xl overflow-hidden animate-fade-in-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-6 pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-foreground/40 hover:text-foreground transition-colors touch-manipulation"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <h2 className="font-serif text-xl text-ivory">Complete Payment</h2>
          <div className="flex items-center justify-between mt-2">
            <span className="text-foreground/40 text-sm">Booking {bookingNumber}</span>
            <span className="font-serif text-xl text-gold">{formattedAmount}</span>
          </div>
        </div>

        <div className="px-6 pb-8">
          {success ? (
            <div className="text-center py-8 animate-fade-in-up">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-400" />
              </div>
              <h3 className="font-serif text-xl text-ivory mb-2">Payment Successful!</h3>
              <p className="text-foreground/50 text-sm">Your booking has been confirmed.</p>
              <button
                onClick={() => { onSuccess(); onClose() }}
                className="mt-6 px-8 py-3 bg-gold text-[#0D0D0D] font-semibold text-sm rounded-full touch-manipulation"
              >
                Done
              </button>
            </div>
          ) : !method ? (
            <div className="space-y-3">
              <p className="text-foreground/50 text-xs uppercase tracking-wider mb-4">Choose Payment Method</p>

              {error && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
              )}

              <button
                onClick={stripeAvailable ? initStripe : undefined}
                disabled={!stripeAvailable}
                className={cn(
                  'w-full p-4 rounded-2xl border transition-all duration-300 touch-manipulation flex items-center gap-4 text-left',
                  stripeAvailable
                    ? 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-gold/20'
                    : 'border-white/[0.05] bg-white/[0.01] opacity-60 cursor-not-allowed'
                )}
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                  <CreditCard className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <p className="text-ivory font-medium">Credit / Debit Card (Stripe)</p>
                  <p className="text-foreground/40 text-xs mt-0.5">
                    {stripeAvailable ? 'Pay securely with Stripe' : stripeReason}
                  </p>
                </div>
              </button>

              <button
                onClick={initEsewa}
                className="w-full p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-gold/20 transition-all duration-300 touch-manipulation flex items-center gap-4 text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-ivory font-medium">eSewa</p>
                  <p className="text-foreground/40 text-xs mt-0.5">Secure redirect to eSewa checkout</p>
                </div>
              </button>

              <button
                onClick={() => setMethod('bank')}
                className="w-full p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-gold/20 transition-all duration-300 touch-manipulation flex items-center gap-4 text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
                  <Upload className="w-5 h-5 text-sky-400" />
                </div>
                <div>
                  <p className="text-ivory font-medium">Bank Transfer (Upload Proof)</p>
                  <p className="text-foreground/40 text-xs mt-0.5">Submit proof and get booking confirmed</p>
                </div>
              </button>

              <button
                onClick={() => setMethod('cash')}
                className="w-full p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-gold/20 transition-all duration-300 touch-manipulation flex items-center gap-4 text-left"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                  <Banknote className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-ivory font-medium">Cash Payment</p>
                  <p className="text-foreground/40 text-xs mt-0.5">Reserve now and pay at studio/session</p>
                </div>
              </button>

              {!stripeAvailable && (
                <p className="text-foreground/30 text-xs text-center pt-2">
                  Set STRIPE_SECRET_KEY and STRIPE_PUBLISHABLE_KEY to enable card payments.
                </p>
              )}
            </div>
          ) : method === 'stripe' && clientSecret && stripe ? (
            <Elements stripe={stripe} options={{ clientSecret, appearance: { theme: 'night', variables: { colorPrimary: '#D4AF37', colorBackground: '#111111', colorText: '#F8F6F2' } } }}>
              <StripeCheckoutForm
                onSuccess={() => setSuccess(true)}
                onError={(msg) => setError(msg)}
              />
              <button
                onClick={() => { setMethod(null); setClientSecret(null); setError('') }}
                className="w-full mt-3 py-2 text-foreground/40 text-sm hover:text-foreground transition-colors touch-manipulation"
              >
                Choose different method
              </button>
            </Elements>
          ) : method === 'bank' ? (
            <div className="space-y-3">
              <p className="text-foreground/50 text-xs uppercase tracking-wider">Bank Transfer Details</p>

              <label htmlFor="bank-name" className="block text-foreground/50 text-xs uppercase tracking-wider">Bank Name</label>
              <input
                id="bank-name"
                value={bankForm.bankName}
                onChange={(e) => setBankForm((prev) => ({ ...prev, bankName: e.target.value }))}
                placeholder="e.g. Global IME Bank"
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none"
              />

              <label htmlFor="bank-account" className="block text-foreground/50 text-xs uppercase tracking-wider">Account Number (optional)</label>
              <input
                id="bank-account"
                value={bankForm.bankAccountNumber}
                onChange={(e) => setBankForm((prev) => ({ ...prev, bankAccountNumber: e.target.value }))}
                placeholder="Your account number"
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none"
              />

              <label htmlFor="bank-reference" className="block text-foreground/50 text-xs uppercase tracking-wider">Transfer Reference Number</label>
              <input
                id="bank-reference"
                value={bankForm.bankReferenceNumber}
                onChange={(e) => setBankForm((prev) => ({ ...prev, bankReferenceNumber: e.target.value }))}
                placeholder="Transaction reference"
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none"
              />

              <label htmlFor="bank-proof" className="block text-foreground/50 text-xs uppercase tracking-wider">Upload Proof (JPG/PNG/PDF)</label>
              <input
                id="bank-proof"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                className="w-full px-4 py-2.5 bg-white/[0.04] border border-white/[0.08] rounded-xl text-foreground/70"
              />

              <button
                onClick={() => submitManualPayment('bank')}
                disabled={loading || uploadingProof}
                className={cn(
                  'w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300',
                  'flex items-center justify-center gap-2 touch-manipulation',
                  loading || uploadingProof
                    ? 'bg-gold/50 text-[#0D0D0D]/50 cursor-not-allowed'
                    : 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
                )}
              >
                {(loading || uploadingProof) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingProof ? 'Uploading proof...' : 'Submit Bank Transfer'}
              </button>

              <button
                onClick={() => { setMethod(null); setError('') }}
                className="w-full py-2 text-foreground/40 text-sm hover:text-foreground transition-colors touch-manipulation"
              >
                Choose different method
              </button>
            </div>
          ) : method === 'cash' ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] text-sm text-foreground/80">
                Cash payment will mark your booking as confirmed. Pay at the studio or during the session.
              </div>
              <button
                onClick={() => submitManualPayment('cash')}
                disabled={loading}
                className={cn(
                  'w-full py-3.5 rounded-full text-sm font-semibold tracking-wide transition-all duration-300',
                  'flex items-center justify-center gap-2 touch-manipulation',
                  loading
                    ? 'bg-gold/50 text-[#0D0D0D]/50 cursor-not-allowed'
                    : 'bg-gold text-[#0D0D0D] hover:bg-gold-light'
                )}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
                Confirm Cash Payment Option
              </button>

              <button
                onClick={() => { setMethod(null); setError('') }}
                className="w-full py-2 text-foreground/40 text-sm hover:text-foreground transition-colors touch-manipulation"
              >
                Choose different method
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-gold animate-spin" />
              <span className="text-foreground/40 text-sm ml-3">Preparing secure payment...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
