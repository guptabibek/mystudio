/**
 * Client-side studio configuration.
 * All values come from NEXT_PUBLIC_ env vars set at build time.
 */

export const studio = {
  name: process.env.NEXT_PUBLIC_STUDIO_NAME || 'Lumière Studio',
  email: process.env.NEXT_PUBLIC_STUDIO_EMAIL || 'hello@lumierestudio.com',
  phone: process.env.NEXT_PUBLIC_STUDIO_PHONE || '+15551234567',
  phoneDisplay: process.env.NEXT_PUBLIC_STUDIO_PHONE_DISPLAY || '+1 555-123-4567',
  address: process.env.NEXT_PUBLIC_STUDIO_ADDRESS || '123 Artisan Boulevard, Suite 400, New York, NY 10001',
  whatsapp: process.env.NEXT_PUBLIC_STUDIO_WHATSAPP || process.env.NEXT_PUBLIC_STUDIO_PHONE || '+15551234567',
  tagline: process.env.NEXT_PUBLIC_STUDIO_TAGLINE || 'Luxury cinematic photography for life\'s most extraordinary moments',
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',

  // Studio hours (pipe-separated lines)
  get hours(): string[] {
    const raw = process.env.NEXT_PUBLIC_STUDIO_HOURS || 'Mon — Sat: 9:00 AM — 7:00 PM | Sunday: By appointment only'
    return raw.split('|').map(s => s.trim())
  },

  // Social links
  social: {
    instagram: process.env.NEXT_PUBLIC_STUDIO_INSTAGRAM || '',
    pinterest: process.env.NEXT_PUBLIC_STUDIO_PINTEREST || '',
    tiktok: process.env.NEXT_PUBLIC_STUDIO_TIKTOK || '',
  },

  // Derived URLs
  get telUrl() { return `tel:${this.phone}` },
  get mailtoUrl() { return `mailto:${this.email}` },
  get whatsappUrl() { return `https://wa.me/${this.whatsapp.replace(/[^0-9]/g, '')}` },
  get whatsappBookingUrl() {
    const msg = encodeURIComponent(`Hi ${this.name}, I'd like to book a session`)
    return `${this.whatsappUrl}?text=${msg}`
  },

  // Short name for top bar / brand mark
  get shortName(): string {
    return this.name.split(/\s+(studio|photography|photo)/i)[0] || this.name
  },
} as const
