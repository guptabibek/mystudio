'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload, X, Loader2, CheckCircle2, AlertCircle, Image as ImageIcon,
  FolderOpen, Send, Eye, Download, Search, RefreshCw,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PhotoCollection {
  id: string
  status: string
  totalPhotos: number
  downloadCount: number
  booking: { bookingNumber: string; customerName: string; bookingDate: string }
  createdAt: string
}

interface PhotoItem {
  id: string
  publicId: string
  originalName: string
  mimeType: string
  fileSize: number
  width: number | null
  height: number | null
  thumbnailUrl?: string
  previewUrl?: string
  originalUrl?: string
  downloadUrl: string
  sortOrder: number
  viewCount: number
  downloadCount: number
}

interface CollectionDetail {
  id: string
  status: string
  totalPhotos: number
  totalSize: number
  booking: { id: string; bookingNumber: string; customerName: string; bookingDate: string }
  photos: PhotoItem[]
}

interface AdminBooking {
  id: string
  bookingNumber: string
  customerName: string
  status: string
}

interface AdminPhotoManagerProps {
  open: boolean
  onClose: () => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function AdminPhotoManager({ open, onClose }: AdminPhotoManagerProps) {
  // Collections list state
  const [collections, setCollections] = useState<PhotoCollection[]>([])
  const [loadingCollections, setLoadingCollections] = useState(false)

  // Upload state
  const [showUpload, setShowUpload] = useState(false)
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [bookingFilter, setBookingFilter] = useState('')
  const [selectedBookingId, setSelectedBookingId] = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<{ uploaded: number; failed: number } | null>(null)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Collection detail state
  const [activeCollection, setActiveCollection] = useState<CollectionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoItem | null>(null)

  // Delivering state
  const [deliveringId, setDeliveringId] = useState<string | null>(null)

  // Load collections
  const loadCollections = useCallback(async () => {
    setLoadingCollections(true)
    try {
      const res = await fetch('/api/photos/collections?limit=50')
      const data = await res.json()
      if (data.success) setCollections(data.data || [])
    } catch {
      setError('Failed to load collections')
    } finally {
      setLoadingCollections(false)
    }
  }, [])

  // Load bookings for upload dropdown
  const loadBookings = useCallback(async () => {
    try {
      const res = await fetch('/api/bookings/admin?limit=100&status=CONFIRMED')
      const data = await res.json()
      if (data.success) {
        const list = data.data?.bookings ?? data.data ?? []
        setBookings(Array.isArray(list) ? list : [])
      }
    } catch { /* silent */ }
  }, [])

  useEffect(() => {
    if (open) {
      loadCollections()
      loadBookings()
    }
  }, [open, loadCollections, loadBookings])

  // File selection
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setSelectedFiles(prev => [...prev, ...files])
    setUploadResult(null)
    setError('')
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  // Upload handler with XHR for progress
  const handleUpload = async () => {
    if (!selectedBookingId || selectedFiles.length === 0) return
    setUploading(true)
    setError('')
    setUploadProgress(0)
    setUploadResult(null)

    try {
      const formData = new FormData()
      formData.append('bookingId', selectedBookingId)
      selectedFiles.forEach(f => formData.append('files', f))

      // Use XMLHttpRequest for upload progress
      const result = await new Promise<{ uploaded: number; failed: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/photos/upload')

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100))
          }
        }

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText)
            if (xhr.status >= 200 && xhr.status < 300 && data.success) {
              resolve({ uploaded: data.data.uploaded, failed: data.data.failed })
            } else {
              reject(new Error(data.error || 'Upload failed'))
            }
          } catch {
            reject(new Error('Upload failed'))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload'))
        xhr.send(formData)
      })

      setUploadResult(result)
      setSelectedFiles([])
      if (fileInputRef.current) fileInputRef.current.value = ''
      loadCollections()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // View collection detail
  const viewCollection = async (collectionId: string) => {
    setLoadingDetail(true)
    try {
      const res = await fetch(`/api/photos/collections?id=${collectionId}`)
      const data = await res.json()
      if (data.success) setActiveCollection(data.data.collection)
    } catch {
      setError('Failed to load collection')
    } finally {
      setLoadingDetail(false)
    }
  }

  // Deliver collection to customer
  const deliverCollection = async (collectionId: string) => {
    setDeliveringId(collectionId)
    try {
      const res = await fetch('/api/photos/deliver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectionId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delivery failed')
      loadCollections()
      if (activeCollection?.id === collectionId) {
        viewCollection(collectionId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delivery failed')
    } finally {
      setDeliveringId(null)
    }
  }

  if (!open) return null

  const totalSelectedSize = selectedFiles.reduce((s, f) => s + f.size, 0)
  const filteredBookings = bookings.filter((b) => {
    const q = bookingFilter.trim().toLowerCase()
    if (!q) return true
    return (
      b.bookingNumber.toLowerCase().includes(q) ||
      b.customerName.toLowerCase().includes(q)
    )
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            {activeCollection ? (
              <button onClick={() => setActiveCollection(null)} className="text-zinc-400 hover:text-white transition">
                ← Back
              </button>
            ) : null}
            <ImageIcon className="w-5 h-5 text-amber-400" />
            <h2 className="text-lg font-semibold text-white">
              {activeCollection
                ? `${activeCollection.booking.bookingNumber} — ${activeCollection.booking.customerName}`
                : 'Photo Manager'}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {!activeCollection && (
              <>
                <button
                  onClick={() => setShowUpload(!showUpload)}
                  className="px-3 py-1.5 text-sm bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-lg hover:bg-amber-500/20 transition"
                >
                  <Upload className="w-4 h-4 inline mr-1" />
                  Upload Photos
                </button>
                <button onClick={loadCollections} className="p-2 text-zinc-400 hover:text-white transition">
                  <RefreshCw className={cn('w-4 h-4', loadingCollections && 'animate-spin')} />
                </button>
              </>
            )}
            <button onClick={() => { onClose(); setActiveCollection(null); setShowUpload(false) }} className="p-2 text-zinc-400 hover:text-white transition">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-200">✕</button>
          </div>
        )}

        {/* Upload Panel */}
        {showUpload && !activeCollection && (
          <div className="mx-6 mt-4 p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl space-y-4">
            <h3 className="text-sm font-medium text-zinc-300">Upload High-Resolution Photos</h3>

            {/* Select Booking (Filterable) */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={bookingFilter}
                  onChange={(e) => setBookingFilter(e.target.value)}
                  placeholder="Filter events by booking no. or customer"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-zinc-500 focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <select
                value={selectedBookingId}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">Select an event / booking…</option>
                {filteredBookings.map(b => (
                  <option key={b.id} value={b.id}>
                    {b.bookingNumber} — {b.customerName}
                  </option>
                ))}
              </select>

              <p className="text-[11px] text-zinc-500">
                Showing {filteredBookings.length} of {bookings.length} events
              </p>
            </div>

            {/* File Input */}
            <div className="space-y-2">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-zinc-700 rounded-xl p-8 text-center cursor-pointer hover:border-amber-500/40 transition group"
              >
                <Upload className="w-8 h-8 mx-auto text-zinc-500 group-hover:text-amber-400 transition" />
                <p className="mt-2 text-sm text-zinc-400 group-hover:text-zinc-300">
                  Click to select DSLR photos · JPEG, PNG, TIFF, HEIC, RAW
                </p>
                <p className="mt-1 text-xs text-zinc-500">Up to 100 files · 200MB each · Originals preserved at full quality</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.cr2,.nef,.arw,.dng,.tiff,.heic,.heif"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {/* Selected Files */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-zinc-400">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} · {formatBytes(totalSelectedSize)}
                </p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {selectedFiles.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-xs px-2 py-1 bg-zinc-800 rounded">
                      <span className="text-zinc-300 truncate flex-1">{f.name}</span>
                      <span className="text-zinc-500 mx-2">{formatBytes(f.size)}</span>
                      <button onClick={() => removeFile(i)} className="text-zinc-500 hover:text-red-400">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-amber-400 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Uploading…
                  </span>
                  <span className="text-zinc-400">{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-amber-400 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Upload Result */}
            {uploadResult && (
              <div className="flex items-center gap-2 text-sm text-green-400">
                <CheckCircle2 className="w-4 h-4" />
                {uploadResult.uploaded} photo{uploadResult.uploaded !== 1 ? 's' : ''} uploaded
                {uploadResult.failed > 0 && (
                  <span className="text-red-400"> · {uploadResult.failed} failed</span>
                )}
              </div>
            )}

            {/* Upload Button */}
            <button
              onClick={handleUpload}
              disabled={uploading || !selectedBookingId || selectedFiles.length === 0}
              className={cn(
                'w-full py-2.5 rounded-lg text-sm font-medium transition',
                uploading || !selectedBookingId || selectedFiles.length === 0
                  ? 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                  : 'bg-amber-500 text-black hover:bg-amber-400'
              )}
            >
              {uploading ? 'Uploading…' : `Upload ${selectedFiles.length} Photo${selectedFiles.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeCollection ? (
            /* ---- Collection Detail View ---- */
            <div>
              {/* Summary */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-sm text-zinc-400">
                    {activeCollection.totalPhotos} photos · {formatBytes(activeCollection.totalSize)}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    Status: <span className="text-amber-400">{activeCollection.status}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  {activeCollection.status !== 'DELIVERED' && (
                    <button
                      onClick={() => deliverCollection(activeCollection.id)}
                      disabled={deliveringId === activeCollection.id}
                      className="px-3 py-1.5 text-sm bg-green-500/10 text-green-400 border border-green-500/20 rounded-lg hover:bg-green-500/20 transition flex items-center gap-1"
                    >
                      {deliveringId === activeCollection.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      Deliver to Customer
                    </button>
                  )}
                  <a
                    href={`/api/photos/download-zip?collectionId=${activeCollection.id}`}
                    className="px-3 py-1.5 text-sm bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" /> Download ZIP
                  </a>
                </div>
              </div>

              {/* Photo Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {activeCollection.photos.map((photo) => (
                  <div
                    key={photo.id}
                    className="group relative aspect-square bg-zinc-800 rounded-lg overflow-hidden cursor-pointer"
                    onClick={() => setLightboxPhoto(photo)}
                  >
                    {photo.thumbnailUrl ? (
                      <img
                        src={photo.thumbnailUrl}
                        alt={photo.originalName}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon className="w-8 h-8 text-zinc-600" />
                      </div>
                    )}
                    {/* Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition flex flex-col items-center justify-center gap-1">
                      <Eye className="w-5 h-5 text-white" />
                      <span className="text-xs text-zinc-300 truncate max-w-[90%]">{photo.originalName}</span>
                      <span className="text-xs text-zinc-500">{formatBytes(photo.fileSize)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : loadingCollections ? (
            <div className="flex items-center justify-center py-20 text-zinc-500">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : collections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
              <FolderOpen className="w-12 h-12 mb-3" />
              <p className="text-sm">No photo collections yet</p>
              <p className="text-xs mt-1">Upload photos for a booking to get started</p>
            </div>
          ) : (
            /* ---- Collections List ---- */
            <div className="space-y-3">
              {collections.map(c => (
                <div
                  key={c.id}
                  onClick={() => viewCollection(c.id)}
                  className="flex items-center justify-between p-4 bg-zinc-800/50 border border-zinc-700/50 rounded-xl hover:border-amber-500/30 cursor-pointer transition"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {c.booking.bookingNumber} — {c.booking.customerName}
                      </p>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {c.totalPhotos} photo{c.totalPhotos !== 1 ? 's' : ''} ·{' '}
                        {new Date(c.booking.bookingDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded-full border',
                        c.status === 'DELIVERED'
                          ? 'bg-green-500/10 border-green-500/20 text-green-400'
                          : c.status === 'READY'
                            ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                            : 'bg-zinc-700/50 border-zinc-600/30 text-zinc-400'
                      )}
                    >
                      {c.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Lightbox */}
        {lightboxPhoto && (
          <div
            className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center"
            onClick={() => setLightboxPhoto(null)}
          >
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxPhoto(null) }}
              className="absolute top-4 right-4 text-white/70 hover:text-white z-10"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-3 z-10">
              <a
                href={lightboxPhoto.downloadUrl}
                onClick={(e) => e.stopPropagation()}
                className="px-4 py-2 bg-amber-500 text-black rounded-lg text-sm font-medium hover:bg-amber-400 transition flex items-center gap-2"
              >
                <Download className="w-4 h-4" /> Download Original
              </a>
            </div>
            <img
              src={lightboxPhoto.previewUrl || lightboxPhoto.thumbnailUrl || lightboxPhoto.originalUrl}
              alt={lightboxPhoto.originalName}
              className="max-w-[90vw] max-h-[85vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="absolute bottom-4 right-4 text-xs text-zinc-500 z-10">
              {lightboxPhoto.width && lightboxPhoto.height
                ? `${lightboxPhoto.width}×${lightboxPhoto.height} · `
                : ''}
              {formatBytes(lightboxPhoto.fileSize)}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
