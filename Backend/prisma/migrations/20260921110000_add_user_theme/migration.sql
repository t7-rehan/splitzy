-- Persist the user's preferred Splitzy application theme.
ALTER TABLE "User"
ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'light';