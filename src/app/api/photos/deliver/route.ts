/**
 * Photo Collection Delivery API
 * Admin delivers a collection to the customer — grants access + creates shareable link
 */

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/utils/api'
import { PhotoService } from '@/lib/services/photo.service'

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin(request)
    const body = await request.json()
    const { collectionId } = body

    if (!collectionId) {
      return NextResponse.json({ success: false, error: 'collectionId is required' }, { status: 400 })
    }

    const collection = await db.photoCollection.findUnique({
      where: { id: collectionId },
      include: { booking: { include: { user: true } } },
    })

    if (!collection) {
      return NextResponse.json({ success: false, error: 'Collection not found' }, { status: 404 })
    }

    const accessLink = await PhotoService.deliverCollection(collectionId, admin.id)

    return NextResponse.json({
      success: true,
      data: {
        status: 'DELIVERED',
        accessLink,
      },
    })
  } catch (error) {
    console.error('Deliver error:', error)
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
    }
    if (error instanceof Error && error.message === 'Admin access required') {
      return NextResponse.json({ success: false, error: 'Admin access required' }, { status: 403 })
    }
    return NextResponse.json({ success: false, error: 'Delivery failed' }, { status: 500 })
  }
}
