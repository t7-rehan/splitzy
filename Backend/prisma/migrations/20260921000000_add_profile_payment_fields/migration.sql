-- Add optional profile completion and UPI settlement fields.
ALTER TABLE "User"
ADD COLUMN "birthdate" TIMESTAMP(3),
ADD COLUMN "upiId" TEXT,
ADD COLUMN "upiQrDataUrl" TEXT;
