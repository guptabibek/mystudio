import { db } from '../src/lib/db'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { BookingStatus, DayOfWeek, PaymentMethod, PaymentStatus, PhotoCollectionStatus } from '@prisma/client'

// Open-source portrait/photography images from Unsplash (free license)
// These are used as realistic photo file references in seeded collections
const UNSPLASH_PHOTO_IDS = [
  'photo-1519741497674-611481863552', // wedding couple
  'photo-1606216794074-735e91aa2c92', // wedding ceremony
  'photo-1511285560929-80b456fea0bc', // bride portrait
  'photo-1519125323398-675f0ddb6308', // fashion editorial
  'photo-1509631179647-0177331693ae', // runway fashion
  'photo-1469334031218-e382a71b716b', // fashion portrait
  'photo-1540575467063-178a50c2df87', // conference event
  'photo-1492684223066-81342ee5ff30', // concert event
  'photo-1505236858219-8359eb29e329', // gala event
  'photo-1537633552985-df8429e8048b', // couple candid
  'photo-1583939003579-730e3918a45a', // bridal details
  'photo-1504439904031-93ded9f93e4e', // engagement
  'photo-1558618666-fcd25c85f82e', // fashion studio
  'photo-1529139574466-a303027c1d8b', // fashion outdoor
  'photo-1523438885200-e635ba2c371e', // event celebration
  'photo-1464366400600-7168b8af9bc3', // wedding reception
  'photo-1507003211169-0a1dd7228f2d', // portrait male
  'photo-1494790108377-be9c29b29330', // portrait female
  'photo-1531746020798-e6953c6e8e04', // beauty editorial
  'photo-1515886657613-9f3515b0c78f', // fashion model
]

type SeedConfig = {
  customerCount: number
  bookingCount: number
  photoCollectionCount: number
  maxPhotosPerCollection: number
  auditLogCount: number
}

const FIRST_NAMES = [
  'Aarav', 'Sofia', 'Liam', 'Emma', 'Noah', 'Maya', 'Ethan', 'Ava', 'Lucas', 'Isla',
  'Oliver', 'Amelia', 'Mason', 'Harper', 'Elijah', 'Nora', 'Aria', 'James', 'Leo', 'Mila',
]

const LAST_NAMES = [
  'Sharma', 'Gupta', 'Adhikari', 'Rai', 'Gurung', 'Shrestha', 'Khanal', 'Thapa', 'Maharjan',
  'Carter', 'Turner', 'Wilson', 'Bennett', 'Walker', 'Brooks', 'Diaz', 'Cruz', 'Patel',
]

const DAY_RULES: Array<{ dayOfWeek: DayOfWeek; startTime: string; endTime: string }> = [
  { dayOfWeek: 'MONDAY', startTime: '09:00', endTime: '18:00' },
  { dayOfWeek: 'TUESDAY', startTime: '09:00', endTime: '18:00' },
  { dayOfWeek: 'WEDNESDAY', startTime: '09:00', endTime: '18:00' },
  { dayOfWeek: 'THURSDAY', startTime: '09:00', endTime: '18:00' },
  { dayOfWeek: 'FRIDAY', startTime: '09:00', endTime: '18:00' },
  { dayOfWeek: 'SATURDAY', startTime: '10:00', endTime: '16:00' },
]

const CHUNK_SIZE = 250

function envInt(name: string, defaultValue: number) {
  const value = process.env[name]
  if (!value) return defaultValue
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue
}

function randomItem<T>(values: readonly T[]): T {
  return values[Math.floor(Math.random() * values.length)]
}

function randomPhone() {
  const n = () => Math.floor(Math.random() * 10)
  return `+1 5${n()}${n()}-${n()}${n()}${n()}-${n()}${n()}${n()}${n()}`
}

function randomDate(start: Date, end: Date) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()))
}

function formatTime(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function addMinutes(hhmm: string, minutesToAdd: number) {
  const [h, m] = hhmm.split(':').map(Number)
  const total = h * 60 + m + minutesToAdd
  const hour = Math.floor(total / 60)
  const minute = total % 60
  return formatTime(hour, minute)
}

async function createCustomers(config: SeedConfig, passwordHash: string) {
  const rows = Array.from({ length: config.customerCount }, (_, i) => {
    const first = randomItem(FIRST_NAMES)
    const last = randomItem(LAST_NAMES)
    const name = `${first} ${last}`
    const email = `seed.customer.${String(i + 1).padStart(4, '0')}@example.com`
    return {
      email,
      name,
      passwordHash,
      role: 'CUSTOMER' as const,
      emailVerified: new Date(),
      phone: randomPhone(),
      isActive: true,
    }
  })

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE)
    await db.user.createMany({ data: chunk, skipDuplicates: true })
  }

  return db.user.findMany({
    where: { role: 'CUSTOMER' },
    select: { id: true, name: true, email: true, phone: true },
  })
}

async function ensurePackages() {
  const packages = [
    // Wedding packages
    {
      id: 'pkg-wedding-intimate',
      name: 'Intimate Wedding',
      description: 'Perfect for small, intimate ceremonies.',
      duration: 240,
      price: '1500',
      currency: 'USD',
      maxPhotos: 200,
      includesEdit: true,
      features: JSON.stringify(['4-hour coverage', '200+ edited photos', 'Online gallery', 'Digital delivery', 'Engagement mini-session']),
      status: 'ACTIVE' as const,
      sortOrder: 1,
    },
    {
      id: 'pkg-wedding-classic',
      name: 'Classic Wedding',
      description: 'Complete coverage for your special day.',
      duration: 480,
      price: '3000',
      currency: 'USD',
      maxPhotos: 500,
      includesEdit: true,
      features: JSON.stringify(['8-hour coverage', '500+ edited photos', 'Second shooter', 'Engagement session', 'Premium album', 'Same-day preview']),
      status: 'ACTIVE' as const,
      sortOrder: 2,
    },
    {
      id: 'pkg-wedding-luxe',
      name: 'Luxe Wedding',
      description: 'The ultimate luxury wedding experience.',
      duration: 720,
      price: '5500',
      currency: 'USD',
      maxPhotos: 800,
      includesEdit: true,
      features: JSON.stringify(['Full-day coverage', '800+ edited photos', 'Cinematic film', 'Two photographers', 'Fine art album', 'Bridal boudoir session', 'Priority editing']),
      status: 'ACTIVE' as const,
      sortOrder: 3,
    },
    // Fashion packages
    {
      id: 'pkg-fashion-editorial',
      name: 'Editorial Shoot',
      description: 'Magazine-ready fashion photography.',
      duration: 120,
      price: '800',
      currency: 'USD',
      maxPhotos: 25,
      includesEdit: true,
      features: JSON.stringify(['2-hour session', '25 retouched images', 'Studio or location', 'Basic styling assistance', 'Digital delivery']),
      status: 'ACTIVE' as const,
      sortOrder: 4,
    },
    {
      id: 'pkg-fashion-campaign',
      name: 'Campaign Production',
      description: 'Full creative campaign production.',
      duration: 480,
      price: '2500',
      currency: 'USD',
      maxPhotos: 50,
      includesEdit: true,
      features: JSON.stringify(['Full-day shoot', '50 retouched images', 'Creative direction', 'Hair & makeup coordination', 'Multiple looks', 'Commercial license']),
      status: 'ACTIVE' as const,
      sortOrder: 5,
    },
    // Event packages
    {
      id: 'pkg-event-essential',
      name: 'Essential Event',
      description: 'Clean, professional event documentation.',
      duration: 240,
      price: '1200',
      currency: 'USD',
      maxPhotos: 150,
      includesEdit: true,
      features: JSON.stringify(['4-hour coverage', '150+ edited photos', 'Online gallery', 'Quick turnaround', 'Digital delivery']),
      status: 'ACTIVE' as const,
      sortOrder: 6,
    },
    {
      id: 'pkg-event-premium',
      name: 'Premium Event',
      description: 'Elevated event photography experience.',
      duration: 480,
      price: '2800',
      currency: 'USD',
      maxPhotos: 400,
      includesEdit: true,
      features: JSON.stringify(['8-hour coverage', '400+ edited photos', 'Second photographer', 'Same-day sneak peeks', 'Photo booth setup', 'Printed event album']),
      status: 'ACTIVE' as const,
      sortOrder: 7,
    },
  ]

  for (const pkg of packages) {
    await db.package.upsert({
      where: { id: pkg.id },
      update: {
        name: pkg.name,
        description: pkg.description,
        duration: pkg.duration,
        price: pkg.price,
        currency: pkg.currency,
        maxPhotos: pkg.maxPhotos,
        includesEdit: pkg.includesEdit,
        features: pkg.features,
        status: pkg.status,
        sortOrder: pkg.sortOrder,
      },
      create: pkg,
    })
  }

  return db.package.findMany({ where: { status: 'ACTIVE' } })
}

async function ensureAvailabilityRules() {
  for (const rule of DAY_RULES) {
    await db.availabilityRule.upsert({
      where: { dayOfWeek_startTime: { dayOfWeek: rule.dayOfWeek, startTime: rule.startTime } },
      update: {
        endTime: rule.endTime,
        slotDuration: 60,
        bufferTime: 15,
        isActive: true,
      },
      create: {
        dayOfWeek: rule.dayOfWeek,
        startTime: rule.startTime,
        endTime: rule.endTime,
        slotDuration: 60,
        bufferTime: 15,
        isActive: true,
      },
    })
  }
}

function pickBookingStatus(sessionDate: Date): BookingStatus {
  const now = new Date()
  const isPast = sessionDate < now
  const r = Math.random()

  if (isPast) {
    if (r < 0.68) return 'COMPLETED'
    if (r < 0.79) return 'CANCELLED'
    if (r < 0.87) return 'NO_SHOW'
    if (r < 0.95) return 'IN_PROGRESS'
    return 'CONFIRMED'
  }

  if (r < 0.58) return 'CONFIRMED'
  if (r < 0.88) return 'PENDING'
  if (r < 0.95) return 'CANCELLED'
  return 'RESCHEDULED'
}

function calcPaymentStatus(bookingStatus: BookingStatus): PaymentStatus {
  if (bookingStatus === 'COMPLETED') return Math.random() < 0.95 ? 'COMPLETED' : 'REFUNDED'
  if (bookingStatus === 'IN_PROGRESS' || bookingStatus === 'CONFIRMED') return Math.random() < 0.8 ? 'COMPLETED' : 'PROCESSING'
  if (bookingStatus === 'PENDING') return Math.random() < 0.75 ? 'PENDING' : 'PROCESSING'
  if (bookingStatus === 'CANCELLED' || bookingStatus === 'NO_SHOW') return Math.random() < 0.55 ? 'FAILED' : 'CANCELLED'
  return 'PENDING'
}

async function main() {
  console.log('Seeding high-volume production-like dataset...')

  const config: SeedConfig = {
    customerCount: envInt('SEED_CUSTOMER_COUNT', 400),
    bookingCount: envInt('SEED_BOOKING_COUNT', 3000),
    photoCollectionCount: envInt('SEED_PHOTO_COLLECTION_COUNT', 450),
    maxPhotosPerCollection: envInt('SEED_MAX_PHOTOS_PER_COLLECTION', 30),
    auditLogCount: envInt('SEED_AUDIT_LOG_COUNT', 5000),
  }

  const runTag = `seed-run-${Date.now()}`
  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@lumierestudio.com'
  const adminPasswordPlain = process.env.SEED_ADMIN_PASSWORD || randomBytes(12).toString('base64url')
  const customerPasswordPlain =
    process.env.SEED_CUSTOMER_PASSWORD || randomBytes(12).toString('base64url')

  const [adminPasswordHash, customerPasswordHash] = await Promise.all([
    bcrypt.hash(adminPasswordPlain, 12),
    bcrypt.hash(customerPasswordPlain, 12),
  ])

  // Enforce exactly one admin for production-like setup.
  await db.user.updateMany({ where: { role: 'ADMIN' }, data: { role: 'CUSTOMER' } })

  const admin = await db.user.upsert({
    where: { email: adminEmail },
    update: {
      role: 'ADMIN',
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
      isActive: true,
      name: 'Alexandra Chen',
      phone: '+1 555-123-4567',
    },
    create: {
      email: adminEmail,
      name: 'Alexandra Chen',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      emailVerified: new Date(),
      phone: '+1 555-123-4567',
      isActive: true,
    },
  })

  const packages = await ensurePackages()
  await ensureAvailabilityRules()

  await db.systemConfig.upsert({
    where: { key: 'studio_name' },
    update: { value: 'Lumière Studio' },
    create: { key: 'studio_name', value: 'Lumière Studio', description: 'Studio display name' },
  })
  await db.systemConfig.upsert({
    where: { key: 'stripe_enabled' },
    update: { value: 'true' },
    create: { key: 'stripe_enabled', value: 'true', description: 'Enable Stripe payments' },
  })
  await db.systemConfig.upsert({
    where: { key: 'bank_transfer_enabled' },
    update: { value: 'true' },
    create: { key: 'bank_transfer_enabled', value: 'true', description: 'Enable bank transfer payments' },
  })

  const customers = await createCustomers(config, customerPasswordHash)
  if (customers.length === 0) {
    throw new Error('No customers available after seeding customers.')
  }

  console.log(`Users ready: 1 admin + ${customers.length} customers`)

  const bookingRows = Array.from({ length: config.bookingCount }, (_, i) => {
    const customer = randomItem(customers)
    const pkg = randomItem(packages)
    const sessionDate = randomDate(
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 120),
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 90)
    )
    const startHour = 9 + Math.floor(Math.random() * 8)
    const startMinute = Math.random() < 0.5 ? 0 : 30
    const sessionStart = formatTime(startHour, startMinute)
    const sessionEnd = addMinutes(sessionStart, pkg.duration)
    const status = pickBookingStatus(sessionDate)
    const discountAmount = Math.random() < 0.2 ? Number((Math.random() * 25).toFixed(2)) : 0
    const finalPrice = Math.max(Number(pkg.price) - discountAmount, 0)

    return {
      bookingNumber: `BK${Date.now()}${String(i + 1).padStart(6, '0')}`,
      userId: customer.id,
      packageId: pkg.id,
      status,
      customerName: customer.name || 'Customer',
      customerEmail: customer.email,
      customerPhone: customer.phone,
      customerNotes: `${runTag}-note-${i + 1}`,
      basePrice: Number(pkg.price),
      finalPrice,
      discountAmount,
      discountReason: discountAmount > 0 ? 'Promotional discount' : null,
      currency: pkg.currency,
      sessionDate,
      sessionStart,
      sessionEnd,
      confirmedAt: status === 'CONFIRMED' || status === 'IN_PROGRESS' || status === 'COMPLETED' ? sessionDate : null,
      completedAt: status === 'COMPLETED' ? new Date(sessionDate.getTime() + 1000 * 60 * pkg.duration) : null,
      cancelledAt: status === 'CANCELLED' ? new Date(sessionDate.getTime() - 1000 * 60 * 60 * 24) : null,
      cancelledReason: status === 'CANCELLED' ? 'Customer requested cancellation' : null,
      reminderSent: Math.random() < 0.7,
    }
  })

  for (let i = 0; i < bookingRows.length; i += CHUNK_SIZE) {
    const chunk = bookingRows.slice(i, i + CHUNK_SIZE)
    await db.booking.createMany({ data: chunk, skipDuplicates: true })
  }

  const seededBookings = await db.booking.findMany({
    where: { customerNotes: { startsWith: runTag } },
    select: {
      id: true,
      userId: true,
      status: true,
      finalPrice: true,
      currency: true,
      bookingNumber: true,
      createdAt: true,
    },
  })

  console.log(`Bookings created: ${seededBookings.length}`)

  const paymentRows = seededBookings
    .filter(() => Math.random() < 0.88)
    .map((booking, i) => {
      const method = randomItem<PaymentMethod>(['STRIPE', 'ESEWA', 'BANK_TRANSFER'])
      const status = calcPaymentStatus(booking.status)
      const amount = Number(booking.finalPrice)
      const gatewayRef = `GW-${booking.bookingNumber}-${i}`

      return {
        bookingId: booking.id,
        userId: booking.userId,
        amount,
        currency: booking.currency,
        method,
        status,
        transactionId: status === 'COMPLETED' || status === 'REFUNDED' ? `TX-${booking.bookingNumber}` : null,
        gatewayReference: gatewayRef,
        webhookReceived: method !== 'BANK_TRANSFER' && Math.random() < 0.9,
        webhookData: method !== 'BANK_TRANSFER' ? JSON.stringify({ ref: gatewayRef, status }) : null,
        webhookProcessedAt: method !== 'BANK_TRANSFER' && status !== 'PENDING' ? new Date() : null,
        bankName: method === 'BANK_TRANSFER' ? randomItem(['Bank of America', 'Chase', 'Wells Fargo']) : null,
        bankReferenceNumber: method === 'BANK_TRANSFER' ? `BNK-${booking.bookingNumber}` : null,
        adminVerifiedAt: method === 'BANK_TRANSFER' && (status === 'COMPLETED' || status === 'PROCESSING') ? new Date() : null,
      }
    })

  for (let i = 0; i < paymentRows.length; i += CHUNK_SIZE) {
    const chunk = paymentRows.slice(i, i + CHUNK_SIZE)
    await db.payment.createMany({ data: chunk, skipDuplicates: true })
  }

  const completedBookings = seededBookings.filter((b) => b.status === 'COMPLETED')
  const eligibleForCollections = completedBookings.slice(0, config.photoCollectionCount)

  for (const booking of eligibleForCollections) {
    await db.photoCollection.upsert({
      where: { bookingId: booking.id },
      update: {
        uploadedBy: admin.id,
        status: randomItem<PhotoCollectionStatus>(['READY', 'DELIVERED', 'PROCESSING']),
      },
      create: {
        bookingId: booking.id,
        uploadedBy: admin.id,
        totalPhotos: 0,
        processedPhotos: 0,
        status: randomItem<PhotoCollectionStatus>(['READY', 'DELIVERED', 'PROCESSING']),
      },
    })
  }

  const collections = await db.photoCollection.findMany({
    where: { bookingId: { in: eligibleForCollections.map((b) => b.id) } },
    select: { id: true },
  })

  for (const collection of collections) {
    const photoCount = 6 + Math.floor(Math.random() * Math.max(1, config.maxPhotosPerCollection - 5))
    const photoRows = Array.from({ length: photoCount }, (_, idx) => {
      const publicId = `${collection.id}-photo-${idx + 1}`
      // Use Unsplash open-source image IDs as realistic references
      const unsplashId = UNSPLASH_PHOTO_IDS[idx % UNSPLASH_PHOTO_IDS.length]
      return {
        collectionId: collection.id,
        filename: `${publicId}.jpg`,
        originalName: `IMG_${String(idx + 1).padStart(4, '0')}.jpg`,
        mimeType: 'image/jpeg',
        fileSize: 350000 + Math.floor(Math.random() * 2400000),
        originalPath: `https://images.unsplash.com/${unsplashId}?w=3000&q=80`,
        previewPath: `https://images.unsplash.com/${unsplashId}?w=1200&q=75`,
        thumbnailPath: `https://images.unsplash.com/${unsplashId}?w=400&q=60`,
        width: 3000,
        height: 2000,
        publicId,
        isProcessed: true,
        sortOrder: idx,
      }
    })

    await db.photo.createMany({ data: photoRows, skipDuplicates: true })

    await db.photoCollection.update({
      where: { id: collection.id },
      data: {
        totalPhotos: photoCount,
        processedPhotos: photoCount,
        accessExpiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
        downloadLimit: 50,
      },
    })
  }

  const auditActions = [
    'USER_LOGIN',
    'BOOKING_CREATED',
    'PAYMENT_INITIATED',
    'PAYMENT_COMPLETED',
    'BOOKING_CONFIRMED',
    'BOOKING_CANCELLED',
    'ADMIN_PHOTO_UPLOAD',
  ] as const

  const auditRows = Array.from({ length: config.auditLogCount }, (_, i) => {
    const actor = Math.random() < 0.08 ? admin : randomItem(customers)
    const action = randomItem(auditActions)
    return {
      userId: actor.id,
      action,
      entityType: randomItem(['User', 'Booking', 'Payment', 'PhotoCollection']),
      entityId: null,
      description: `${action} generated by ${runTag}`,
      ipAddress: `10.10.${Math.floor(Math.random() * 100)}.${Math.floor(Math.random() * 255)}`,
      userAgent: randomItem([
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        'Mozilla/5.0 (Linux; Android 14)',
      ]),
    }
  })

  for (let i = 0; i < auditRows.length; i += CHUNK_SIZE) {
    await db.auditLog.createMany({ data: auditRows.slice(i, i + CHUNK_SIZE) })
  }

  const adminCount = await db.user.count({ where: { role: 'ADMIN' } })
  if (adminCount !== 1) {
    throw new Error(`Expected exactly 1 admin after seeding, found ${adminCount}`)
  }

  console.log('\n✅ High-volume seed completed')
  console.log(`- Admin users: ${adminCount}`)
  console.log(`- Customers available: ${customers.length}`)
  console.log(`- Bookings created in this run: ${seededBookings.length}`)
  console.log(`- Payments attempted in this run: ${paymentRows.length}`)
  console.log(`- Photo collections touched: ${collections.length}`)
  console.log(`- Audit logs inserted in this run: ${auditRows.length}`)

  if (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_CUSTOMER_PASSWORD) {
    console.log('\nSeed users were created with generated passwords.')
    console.log('Set SEED_ADMIN_PASSWORD and SEED_CUSTOMER_PASSWORD for deterministic credentials.')
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
