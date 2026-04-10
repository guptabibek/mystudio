import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getOrSetCache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const data = await getOrSetCache('stats:public:v1', 60, async () => {
      const [totalClients, completedBookings] = await Promise.all([
        db.user.count({ where: { role: 'CUSTOMER' } }),
        db.booking.count({ where: { status: 'COMPLETED' } }),
      ])

      return { totalClients, completedBookings }
    })

    return Response.json({
      success: true,
      data,
    }, {
      headers: {
        'Cache-Control': 'public, max-age=30, s-maxage=60, stale-while-revalidate=120',
      },
    })
  } catch {
    return Response.json({
      success: true,
      data: { totalClients: 0, completedBookings: 0 },
    })
  }
}
