-- Legacy users complete username setup on their next profile update. A
-- nullable unique column allows existing rows to migrate without inventing
-- usernames or duplicating identities.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");