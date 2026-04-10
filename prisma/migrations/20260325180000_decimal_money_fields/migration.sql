-- Convert money-like fields from floating point to exact decimal.
ALTER TABLE "Package"
  ALTER COLUMN "price" TYPE DECIMAL(65,30) USING "price"::DECIMAL(65,30);

ALTER TABLE "PricingRule"
  ALTER COLUMN "priceModifier" TYPE DECIMAL(65,30) USING "priceModifier"::DECIMAL(65,30);

ALTER TABLE "Booking"
  ALTER COLUMN "basePrice" TYPE DECIMAL(65,30) USING "basePrice"::DECIMAL(65,30),
  ALTER COLUMN "finalPrice" TYPE DECIMAL(65,30) USING "finalPrice"::DECIMAL(65,30),
  ALTER COLUMN "discountAmount" TYPE DECIMAL(65,30) USING "discountAmount"::DECIMAL(65,30),
  ALTER COLUMN "discountAmount" SET DEFAULT 0;

ALTER TABLE "Payment"
  ALTER COLUMN "amount" TYPE DECIMAL(65,30) USING "amount"::DECIMAL(65,30),
  ALTER COLUMN "refundAmount" TYPE DECIMAL(65,30) USING "refundAmount"::DECIMAL(65,30);
