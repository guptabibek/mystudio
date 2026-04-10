'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { X, ChevronLeft, ChevronRight, Share2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LightboxImage {
  id: string
  gradient: string
  imageUrl?: string
  title: string
  subtitle: string
  category: string
}

interface LightboxProps {
  images: LightboxImage[]
  initialIndex: number
  isOpen: boolean
  onClose: () => void
}

export function Lightbox({ images, initialIndex, isOpen, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex)
  const touchStartX = useRef(0)

  useEffect(() => {
    setIndex(initialIndex)
  }, [initialIndex, isOpen])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  const goNext = useCallback(() => {
    setIndex((prev) => (prev + 1) % images.length)
  }, [images.length])

  const goPrev = useCallback(() => {
    setIndex((prev) => (prev - 1 + images.length) % images.length)
  }, [images.length])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKey)
      return () => window.removeEventListener('keydown', handleKey)
    }
  }, [isOpen, onClose, goNext, goPrev])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStartX.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      diff > 0 ? goNext() : goPrev()
    }
  }

  if (!isOpen || images.length === 0) return null

  const image = images[index]

  return (
    <div
      className="fixed inset-0 z-[100] bg-black animate-fade-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-label="Image viewer"
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 safe-top">
        <span className="text-white/50 text-sm font-sans tabular-nums">
          {index + 1} / {images.length}
        </span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: image.title,
                  text: `Check out "${image.title}" from our portfolio`,
                  url: window.location.href,
                }).catch(() => {})
              }
            }}
            className="p-2 text-white/50 hover:text-white transition-colors touch-manipulation"
            aria-label="Share"
          >
            <Share2 className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-2 text-white/50 hover:text-white transition-colors touch-manipulation" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="w-full h-full flex items-center justify-center px-4 py-20">
        <div
          key={image.id}
          className={cn(
            'w-full max-w-2xl aspect-[3/2] rounded-2xl animate-scale-in overflow-hidden relative',
            image.imageUrl ? '' : image.gradient
          )}
        >
          {image.imageUrl && (
            <img
              src={image.imageUrl}
              alt={image.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>
      </div>

      {/* Desktop navigation arrows */}
      <button
        onClick={goPrev}
        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full glass text-white/60 hover:text-white transition-colors hidden md:flex items-center justify-center touch-manipulation"
        aria-label="Previous image"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      <button
        onClick={goNext}
        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full glass text-white/60 hover:text-white transition-colors hidden md:flex items-center justify-center touch-manipulation"
        aria-label="Next image"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* Dot indicators */}
      <div className="absolute bottom-20 left-0 right-0 flex justify-center gap-1.5 safe-bottom">
        {images.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              i === index ? 'bg-gold w-6' : 'bg-white/30 w-1.5'
            )}
            aria-label={`Go to image ${i + 1}`}
          />
        ))}
      </div>

      {/* Caption */}
      <div className="absolute bottom-8 left-0 right-0 text-center safe-bottom">
        <p className="text-white font-serif text-xl">{image.title}</p>
        <p className="text-gold/70 text-xs uppercase tracking-[0.2em] mt-1">{image.subtitle}</p>
      </div>
    </div>
  )
}
