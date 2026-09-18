/* Task 4: Firebase user identity foundation.
   Adds the stable external identity key (firebaseUid, unique) and the
   identity-provider photo URL to the existing User model.

   Warning: like any required-column addition, this fails if the User table
   already contains rows. The Task 2 migration has never been applied to a
   live database (no PostgreSQL was available), so this is safe here; a
   deployment starting fresh applies 20260918120000_init first anyway. */

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firebaseUid" TEXT NOT NULL,
ADD COLUMN     "photoUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");
