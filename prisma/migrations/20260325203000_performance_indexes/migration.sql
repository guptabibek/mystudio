-- Performance indexes for high-traffic booking, payment, availability, and portfolio queries.
CREATE INDEX IF NOT EXISTS "AvailabilityRule_isActive_dayOfWeek_idx"
  ON "AvailabilityRule"("isActive", "dayOfWeek");

CREATE INDEX IF NOT EXISTS "Booking_status_createdAt_idx"
  ON "Booking"("status", "createdAt");

CREATE INDEX IF NOT EXISTS "Booking_sessionDate_status_idx"
  ON "Booking"("sessionDate", "status");

CREATE INDEX IF NOT EXISTS "Payment_bookingId_status_idx"
  ON "Payment"("bookingId", "status");

CREATE INDEX IF NOT EXISTS "Payment_method_status_createdAt_idx"
  ON "Payment"("method", "status", "createdAt");

CREATE INDEX IF NOT EXISTS "Payment_stripePaymentIntent_idx"
  ON "Payment"("stripePaymentIntent");

CREATE INDEX IF NOT EXISTS "Payment_esewaProductId_idx"
  ON "Payment"("esewaProductId");

CREATE INDEX IF NOT EXISTS "Photo_isProcessed_uploadedAt_idx"
  ON "Photo"("isProcessed", "uploadedAt");

CREATE INDEX IF NOT EXISTS "Photo_collectionId_sortOrder_idx"
  ON "Photo"("collectionId", "sortOrder");
