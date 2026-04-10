'use client'

import { AdminAvailabilityManager } from './AdminAvailabilityManager'

interface AdminAvailabilityPanelProps {
  open: boolean
  onClose: () => void
}

export function AdminAvailabilityPanel({ open, onClose }: AdminAvailabilityPanelProps) {
  return <AdminAvailabilityManager open={open} onClose={onClose} />
}
