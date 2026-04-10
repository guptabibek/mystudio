import { apiResponse } from '@/lib/utils/api'
import { config } from '@/lib/config'

export async function GET() {
  const hasSecret = !!config.STRIPE_SECRET_KEY
  const publishableKey = config.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
  const enabled = hasSecret && !!publishableKey

  return apiResponse({
    enabled,
    publishableKey: enabled ? publishableKey : '',
    reason: enabled
      ? null
      : !hasSecret
        ? 'Stripe secret key is missing'
        : 'Stripe publishable key is missing',
  })
}
