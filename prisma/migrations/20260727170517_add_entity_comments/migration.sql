-- CreateEnum
CREATE TYPE "CommentEntityType" AS ENUM ('LEAD', 'OPPORTUNITY');

-- CreateTable
CREATE TABLE "entity_comments" (
    "id" TEXT NOT NULL,
    "entityType" "CommentEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isInternalNote" BOOLEAN NOT NULL DEFAULT false,
    "mentionedUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorId" TEXT NOT NULL,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "editedAt" TIMESTAMP(3),
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entity_comments_entityType_entityId_idx" ON "entity_comments"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "entity_comments_authorId_idx" ON "entity_comments"("authorId");

-- AddForeignKey
ALTER TABLE "entity_comments" ADD CONSTRAINT "entity_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
