'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Download, Image as ImageIcon, X, Eye, FolderOpen, Loader2, Package,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface GalleryPreview {
  id: string
  thumbnailUrl?: string
}

interface GalleryCollection {
  id: string
  status: string
  totalPhotos: number
  booking: { bookingNumber: string; customerName: string; bookingDate: string }
  downloadsUsed: number
  downloadLimit: number | null
  previews?: GalleryPreview[]
  createdAt: string
}

interface GalleryPhoto {
  id: string
  publicId: string
  originalName: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  thumbnailUrl?: string
  previewUrl?: string
  downloadUrl: string
  sortOrder: number
}

interface CollectionDetail {
  id: string
  status: string
  totalPhotos: number
  totalSize: number
  booking: { bookingNumber: string; customerName: string; bookingDate: string }
  photos?: GalleryPhoto[]
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

interface MyPhotosGalleryProps {
  open: boolean
  onClose: () => void
  /** Optional token for shared link access (no login needed) */
  accessToken?: string
}

export function MyPhotosGallery({ open, onClose, accessToken }: MyPhotosGalleryProps) {
  const [collections, setCollections] = useState<GalleryCollection[]>([])
  const [loading, setLoading] = useState(false)
  const [activeDetail, setActiveDetail] = useState<CollectionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<GalleryPhoto | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState(0)
  const [downloadingZip, setDownloadingZip] = useState(false)

  const normalizeCollections = (rows: unknown): GalleryCollection[] => {
    if (!Array.isArray(rows)) return []
    return rows.map((row) => {
      const item = row as GalleryCollection
      return {
        ...item,
        previews: Array.isArray(item.previews) ? item.previews : [],
      }
    })
  }

  const normalizeDetail = (detail: unknown): CollectionDetail | null => {
    if (!detail || typeof detail !== 'object') return null
    const item = detail as CollectionDetail
    return {
      ...item,
      photos: Array.isArray(item.photos) ? item.photos : [],
    }
  }

  const loadCollections = useCallback(async () => {
    setLoading(true)
    try {
      const url = accessToken
        ? `/api/photos/collections?token=${encodeURIComponent(accessToken)}`
        : '/api/photos/collections'
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        // Token-based returns single collection directly
        if (accessToken && data.data?.collection) {
          const normalized = normalizeDetail(data.data.collection)
          setActiveDetail(normalized)
        } else {
          setCollections(normalizeCollections(data.data))
        }
      }
    } catch { /* silent */ }
    finally { setLoading(false) }
  }, [accessToken])

  useEffect(() => {
    if (open) loadCollections()
  }, [open, loadCollections])

  const viewCollection = async (collectionId: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/photos/collections?id=${collectionId}`)
      const data = await res.json()
      if (data.success) {
        const normalized = normalizeDetail(data.data.collection)
        setActiveDetail(normalized)
      }
    } catch { /* silent */ }
    finally { setLoadingDetail(false) }
  }

  const openLightbox = (photo: GalleryPhoto, index: number) => {
    setLightboxPhoto(photo)
    setLightboxIdx(index)
  }

  const navigateLightbox = (dir: -1 | 1) => {
    if (!activeDetail) return
    const photos = activeDetail.photos || []
    if (photos.length === 0) return
    const newIdx = (lightboxIdx + dir + photos.length) % photos.length
    setLightboxIdx(newIdx)
    setLightboxPhoto(photos[newIdx])
  }

  const handleDownloadZip = async () => {
    if (!activeDetail) return
    setDownloadingZip(true)
    try {
      const tokenParam = accessToken ? `&token=${encodeURIComponent(accessToken)}` : ''
      const url = `/api/photos/download-zip?collectionId=${activeDetail.id}${tokenParam}`
      // Use an anchor-based approach to allow the browser to handle the download
      const a = document.createElement('a')
      a.href = url
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } finally {
      // Give the browser a moment to start the download
      setTimeout(() => setDownloadingZip(false), 2000)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            {activeDetail && !accessToken && (
              <button onClick={() => setActiveDetail(null)} className="text-zinc-400 hover:text-white transition">
                ← Back
              </button>
            )}
            <ImageIcon className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">
              {activeDetail
                ? `${activeDetail.booking.customerName} — ${activeDetail.booking.bookingNumber}`
                : 'My Photos'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeDetail ? (
            <>
              {/* Summary Bar */}
              <div className="flex items-center justify-between mb-5">
                <div>
                  <p className="text-sm text-zinc-400">
                    {activeDetail.totalPhotos} photo{activeDetail.totalPhotos !== 1 ? 's' : ''} ·{' '}
                    {formatBytes(activeDetail.totalSize)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Full original quality · {new Date(activeDetail.booking.bookingDate).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={handleDownloadZip}
                  disabled={downloadingZip}
                  className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 transition flex items-center gap-2 disabled:opacity-50"
                >
                  {downloadingZip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Download All (ZIP)
                </button>
              </div>

              {/* Photo Grid */}
              {loadingDetail ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {(activeDetail.photos || []).map((photo, idx) => (
                    <div
                      key={photo.id}
                      className="group relative aspect-square bg-zinc-800 rounded-lg overflow-hidden cursor-pointer"
                      onClick={() => openLightbox(photo, idx)}
                    >
                      {photo.thumbnailUrl ? (
                        <img
                          src={photo.thumbnailUrl}
                          alt={photo.originalName}
                          className="w-full h-full object-cover transition group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="w-8 h-8 text-zinc-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition">
                        <div className="absolute bottom-0 left-0 right-0 p-2 flex items-center justify-between">
                          <span className="text-xs text-zinc-300 truncate max-w-[70%]">{photo.originalName}</span>
                          <a
                            href={photo.downloadUrl}
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 bg-amber-500/90 rounded-md text-black hover:bg-amber-400 transition"
                            title="Download original"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : loading ? (
            <div className="flex items-center justify-center py-20 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <FolderOpen className="w-12 h-12 mb-3" />
              <p className="text-sm">No photos available yet</p>
              <p className="text-xs mt-1">Your photographer will share photos here after your session</p>
            </div>
          ) : (
            <div className="space-y-3">
              {collections.map(c => (
                <div
                  key={c.id}
                  onClick={() => viewCollection(c.id)}
                  className="flex items-center justify-between p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl hover:border-amber-500/30 cursor-pointer transition"
                >
                  <div className="flex items-center gap-4">
                    {/* Preview thumbnails */}
                    <div className="w-14 h-14 rounded-lg bg-zinc-800 overflow-hidden relative flex-shrink-0">
                      {c.previews?.[0]?.thumbnailUrl ? (
                        <img src={c.previews[0].thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="w-6 h-6 text-zinc-600" />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{c.booking.bookingNumber}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {c.totalPhotos} photo{c.totalPhotos !== 1 ? 's' : ''} ·{' '}
                        {new Date(c.booking.bookingDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded-full border',
                      c.status === 'DELIVERED'
                        ? 'bg-green-500/10 border-green-500/20 text-green-400'
                        : 'bg-zinc-700/50 border-zinc-600/30 text-zinc-400'
                    )}
                  >
                    {c.status === 'DELIVERED' ? 'Ready' : c.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lightbox */}
        {lightboxPhoto && activeDetail && (
          <div
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
            onClick={() => setLightboxPhoto(null)}
          >
            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxPhoto(null) }}
              className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Prev/Next */}
            {(activeDetail.photos?.length || 0) > 1 && (
              <>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateLightbox(-1) }}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 rounded-full text-white/70 hover:text-white z-10"
                >
                  ‹
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); navigateLightbox(1) }}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 rounded-full text-white/70 hover:text-white z-10"
                >
                  ›
                </button>
              </>
            )}

            {/* Image */}
            <img
              src={lightboxPhoto.previewUrl || lightboxPhoto.thumbnailUrl}
              alt={lightboxPhoto.originalName}
              className="max-w-[90vw] max-h-[80vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />

            {/* Bottom Bar */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-6 flex items-end justify-between z-10">
              <div>
                <p className="text-sm text-white font-medium">{lightboxPhoto.originalName}</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  {lightboxPhoto.width && lightboxPhoto.height
                    ? `${lightboxPhoto.width} × ${lightboxPhoto.height} · `
                    : ''}
                  {formatBytes(lightboxPhoto.fileSize)}
                </p>
                <p className="text-xs text-zinc-500 mt-0.5">
                  {lightboxIdx + 1} of {activeDetail.photos?.length || 0}
                </p>
              </div>
              <a
                href={lightboxPhoto.downloadUrl}
                onClick={(e) => e.stopPropagation()}
                className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Download Original
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
