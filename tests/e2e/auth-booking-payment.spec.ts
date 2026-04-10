import { expect, test, type APIRequestContext, type Page } from '@playwright/test'

function makeUser() {
  const nonce = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  return {
    email: `e2e-${nonce}@example.com`,
    password: 'E2ePass!23456',
    name: `E2E User ${nonce}`,
  }
}

async function authenticate(page: Page) {
  const user = makeUser()

  const registerRes = await page.request.post('/api/auth/register', {
    data: {
      email: user.email,
      password: user.password,
      name: user.name,
      phone: '+1-555-123-9999',
    },
  })
  const registerPayload = await registerRes.json()
  expect(registerRes.ok(), JSON.stringify(registerPayload)).toBeTruthy()

  const verifyUrl = (registerPayload.data ?? registerPayload).devVerificationUrl as string | undefined
  expect(verifyUrl).toBeTruthy()

  const verifyRes = await page.request.get(verifyUrl!)
  expect(verifyRes.ok()).toBeTruthy()

  let meOk = false
  let mePayload: any = null

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const meRes = await page.request.get('/api/auth/me')
    mePayload = await meRes.json()

    if (meRes.ok()) {
      meOk = true
      break
    }

    await page.waitForTimeout(400)
  }

  expect(meOk, JSON.stringify(mePayload)).toBeTruthy()
  expect((mePayload.data ?? mePayload)?.email).toBe(user.email)
}

async function listBookableSlots(request: APIRequestContext, packageId: string) {
  const start = new Date()
  start.setDate(start.getDate() + 1)

  const end = new Date()
  end.setDate(end.getDate() + 30)

  const startDate = start.toISOString().slice(0, 10)
  const endDate = end.toISOString().slice(0, 10)

  const availabilityRes = await request.get(
    `/api/bookings/availability?startDate=${startDate}&endDate=${endDate}&packageId=${encodeURIComponent(packageId)}`
  )

  if (!availabilityRes.ok()) return []

  const availabilityPayload = await availabilityRes.json()
  const days = availabilityPayload.data ?? availabilityPayload
  if (!Array.isArray(days) || days.length === 0) return []

  const candidates: Array<{ date: string; startTime: string }> = []

  for (const day of days) {
    const slots = Array.isArray(day?.slots) ? day.slots : []
    for (const slot of slots) {
      if ((slot?.isAvailable || slot?.available) && slot?.startTime && day?.date) {
        candidates.push({ date: day.date as string, startTime: slot.startTime as string })
      }

      if (candidates.length >= 12) {
        return candidates
      }
    }
  }

  return candidates
}

async function createPendingBooking(request: APIRequestContext, label: string) {
  const packagesRes = await request.get('/api/packages')
  expect(packagesRes.ok()).toBeTruthy()

  const packagesPayload = await packagesRes.json()
  const packages = packagesPayload.data ?? packagesPayload
  expect(Array.isArray(packages)).toBeTruthy()
  expect(packages.length).toBeGreaterThan(0)

  const selectedPackage = packages[0]
  expect(selectedPackage?.id).toBeTruthy()

  const candidateSlots = await listBookableSlots(request, selectedPackage.id)
  expect(candidateSlots.length).toBeGreaterThan(0)

  for (const slot of candidateSlots) {
    try {
      const bookingRes = await request.post('/api/bookings/create', {
        data: {
          packageId: selectedPackage.id,
          date: slot.date,
          timeSlot: slot.startTime,
          customerName: `E2E ${label}`,
          customerEmail: `e2e-${label}-${Date.now()}@example.com`,
          customerPhone: '+1-555-111-2222',
          customerNotes: 'Playwright end-to-end automated test booking',
        },
        timeout: 12_000,
      })

      const bookingPayload = await bookingRes.json()
      if (!bookingRes.ok()) {
        continue
      }

      return {
        bookingId: (bookingPayload.data ?? bookingPayload).id as string,
        packageId: selectedPackage.id as string,
      }
    } catch {
      // Try the next available slot when current request times out or gets reset.
    }
  }

  throw new Error('Unable to create booking from available slots in e2e run')
}

test.describe('Auth + booking + payment APIs', () => {
  test('can register/login and submit bank transfer payment with proof', async ({ page }) => {
    await authenticate(page)

    const { bookingId } = await createPendingBooking(page.request, 'bank')

    const proofUploadRes = await page.request.post('/api/payments/proof-upload', {
      multipart: {
        file: {
          name: 'proof.png',
          mimeType: 'image/png',
          buffer: Buffer.from('89504e470d0a1a0a', 'hex'),
        },
      },
    })

    const proofPayload = await proofUploadRes.json()
    expect(proofUploadRes.ok(), JSON.stringify(proofPayload)).toBeTruthy()
    const rawProofUrl = (proofPayload.data ?? proofPayload).url as string
    const proofUrl = rawProofUrl.startsWith('http')
      ? rawProofUrl
      : `http://127.0.0.1:3000${rawProofUrl}`
    expect(proofUrl).toBeTruthy()

    const bankPaymentRes = await page.request.post('/api/payments/manual', {
      data: {
        bookingId,
        method: 'bank',
        bankName: 'E2E Test Bank',
        bankAccountNumber: '000111222333',
        bankReferenceNumber: `REF-${Date.now()}`,
        paymentProofUrl: proofUrl,
        notes: 'Automated bank transfer verification',
      },
    })

    const bankPaymentPayload = await bankPaymentRes.json()
    expect(bankPaymentRes.ok(), JSON.stringify(bankPaymentPayload)).toBeTruthy()
  })

  test('can create a second booking and confirm cash payment', async ({ page }) => {
    await authenticate(page)

    const { bookingId } = await createPendingBooking(page.request, 'cash')

    const cashPaymentRes = await page.request.post('/api/payments/manual', {
      data: {
        bookingId,
        method: 'cash',
        notes: 'Automated cash payment verification',
      },
    })

    const cashPaymentPayload = await cashPaymentRes.json()
    expect(cashPaymentRes.ok(), JSON.stringify(cashPaymentPayload)).toBeTruthy()
  })
})
