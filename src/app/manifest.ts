import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  const studioName = process.env.NEXT_PUBLIC_STUDIO_NAME || 'Lumière Studio'
  const shortName = studioName.split(/\s+(studio|photography|photo)/i)[0] || studioName
  const tagline = process.env.NEXT_PUBLIC_STUDIO_TAGLINE || 'Luxury cinematic photography for life\'s most extraordinary moments'

  return {
    name: `${studioName} — Luxury Photography`,
    short_name: shortName,
    description: tagline,
    start_url: '/',
    display: 'standalone',
    background_color: '#0D0D0D',
    theme_color: '#0D0D0D',
    orientation: 'portrait-primary',
    categories: ['photography', 'lifestyle'],
    icons: [
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/logo.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
    ],
  }
}
