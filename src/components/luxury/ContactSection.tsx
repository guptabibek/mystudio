'use client'

import { useState } from 'react'
import {
  Phone, MessageCircle, Mail, MapPin, Instagram,
  Send, Clock, ArrowUpRight, CheckCircle2, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { studio } from '@/lib/config/studio'

const QUICK_ACTIONS = [
  {
    icon: Phone, label: 'Call Us', description: 'Speak directly',
    href: studio.telUrl, color: 'text-blue-400', bg: 'bg-blue-500/10',
  },
  {
    icon: MessageCircle, label: 'WhatsApp', description: 'Quick chat',
    href: studio.whatsappUrl, color: 'text-green-400', bg: 'bg-green-500/10',
  },
  {
    icon: Mail, label: 'Email', description: 'Write to us',
    href: studio.mailtoUrl, color: 'text-amber-400', bg: 'bg-amber-500/10',
  },
]

const SOCIAL_LINKS = [
  ...(studio.social.instagram ? [{ label: 'Instagram', icon: Instagram, handle: '@' + studio.social.instagram.split('/').pop(), href: studio.social.instagram }] : []),
  ...(studio.social.pinterest ? [{ label: 'Pinterest', icon: ArrowUpRight, handle: '/' + studio.social.pinterest.split('/').pop(), href: studio.social.pinterest }] : []),
  ...(studio.social.tiktok ? [{ label: 'TikTok', icon: ArrowUpRight, handle: '@' + studio.social.tiktok.split('/').pop()?.replace('@', ''), href: studio.social.tiktok }] : []),
]

export function ContactSection() {
  const [formData, setFormData] = useState({ name: '', email: '', message: '' })
  const [isSent, setIsSent] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSending(true)
    setError('')
    try {
      const res = await fetch('/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'contact', ...formData }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to send message')
      }
      setIsSent(true)
      setFormData({ name: '', email: '', message: '' })
      setTimeout(() => setIsSent(false), 4000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="min-h-screen pt-safe-top">
      {/* Header */}
      <div className="px-6 pt-12 pb-6">
        <p className="text-gold/60 text-xs uppercase tracking-[0.3em] font-sans mb-2">Contact</p>
        <h1 className="font-serif text-3xl text-ivory">Get in Touch</h1>
        <p className="text-foreground/40 text-sm mt-2">We respond within 24 hours</p>
      </div>

      {/* Quick Actions */}
      <div className="px-6 mb-8">
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon
            return (
              <a
                key={action.label}
                href={action.href}
                target={action.href.startsWith('http') ? '_blank' : undefined}
                rel={action.href.startsWith('http') ? 'noopener noreferrer' : undefined}
                className="flex flex-col items-center p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300 touch-manipulation"
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center mb-2', action.bg)}>
                  <Icon className={cn('w-5 h-5', action.color)} />
                </div>
                <span className="text-ivory text-xs font-medium">{action.label}</span>
                <span className="text-foreground/30 text-[10px] mt-0.5">{action.description}</span>
              </a>
            )
          })}
        </div>
      </div>

      {/* Business Hours */}
      <div className="px-6 mb-8">
        <div className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <Clock className="w-5 h-5 text-gold/60 shrink-0" />
          <div>
            <p className="text-ivory text-sm font-medium">Studio Hours</p>
            {studio.hours.map((line, i) => (
              <p key={i} className="text-foreground/40 text-xs">{line}</p>
            ))}
          </div>
        </div>
      </div>

      {/* Contact Form */}
      <div className="px-6 mb-8">
        <h2 className="font-serif text-lg text-ivory mb-4">Send a Message</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="Your name"
            required
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors text-sm"
          />
          <input
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="your@email.com"
            required
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors text-sm"
          />
          <textarea
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="Tell us how we can help..."
            rows={4}
            required
            className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-ivory placeholder:text-foreground/20 focus:border-gold/30 focus:outline-none transition-colors text-sm resize-none"
          />
          <button
            type="submit"
            disabled={isSending}
            className="w-full py-3.5 bg-gold text-[#0D0D0D] font-semibold text-sm rounded-full tracking-wide hover:bg-gold-light transition-all duration-300 touch-manipulation flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSent ? (
              <><CheckCircle2 className="w-4 h-4" /> Message Sent!</>
            ) : isSending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Send className="w-4 h-4" /> Send Message</>
            )}
          </button>
          {error && <p className="text-red-400 text-xs text-center mt-2">{error}</p>}
        </form>
      </div>

      {/* Location */}
      <div className="px-6 mb-8">
        <div className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 text-gold/60 shrink-0 mt-0.5" />
            <div>
              <p className="text-ivory text-sm font-medium">{studio.name}</p>
              <p className="text-foreground/40 text-xs mt-0.5">
                {studio.address}
              </p>
            </div>
          </div>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(studio.address)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 aspect-video rounded-xl bg-gradient-to-br from-stone-900 to-stone-950 border border-white/[0.04] flex items-center justify-center hover:border-gold/20 transition-colors"
          >
            <div className="text-center">
              <MapPin className="w-6 h-6 text-gold/40 mx-auto mb-1" />
              <span className="text-foreground/40 text-xs">View on Google Maps →</span>
            </div>
          </a>
        </div>
      </div>

      {/* Social Media */}
      <div className="px-6 pb-24">
        <h2 className="font-serif text-lg text-ivory mb-4">Follow Us</h2>
        <div className="space-y-2">
          {SOCIAL_LINKS.map((link) => {
            const Icon = link.icon
            return (
              <a
                key={link.label}
                href={link.href}
                className="flex items-center justify-between p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition-colors touch-manipulation"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-gold/60" />
                  <div>
                    <p className="text-ivory text-sm">{link.label}</p>
                    <p className="text-foreground/40 text-xs">{link.handle}</p>
                  </div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-foreground/20" />
              </a>
            )
          })}
        </div>
      </div>
    </div>
  )
}
