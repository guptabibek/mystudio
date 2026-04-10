import type { Metadata, Viewport } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0D0D0D",
};

const studioName = process.env.NEXT_PUBLIC_STUDIO_NAME || 'Lumière Studio'
const studioTagline = process.env.NEXT_PUBLIC_STUDIO_TAGLINE || 'Luxury cinematic photography for life\'s most extraordinary moments'
const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

export const metadata: Metadata = {
  title: `${studioName} — Luxury Photography`,
  description: studioTagline,
  keywords: ["luxury photography", "wedding photographer", "fashion photography", "event photography", "cinematic", "editorial"],
  authors: [{ name: studioName }],
  icons: {
    icon: "/logo.svg",
    apple: "/logo.svg",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: studioName,
  },
  openGraph: {
    title: `${studioName} — Luxury Photography`,
    description: studioTagline,
    url: appUrl,
    siteName: studioName,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `${studioName} — Luxury Photography`,
    description: studioTagline,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${playfair.variable} ${inter.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
