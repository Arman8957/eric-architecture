-- AlterTable
ALTER TABLE "media_contents" ADD COLUMN     "commentCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "media_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaContentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_likes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mediaContentId" TEXT NOT NULL,
    "parentId" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT true,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_comment_likes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_comment_likes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "media_likes_mediaContentId_idx" ON "media_likes"("mediaContentId");

-- CreateIndex
CREATE INDEX "media_likes_userId_idx" ON "media_likes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "media_likes_userId_mediaContentId_key" ON "media_likes"("userId", "mediaContentId");

-- CreateIndex
CREATE INDEX "media_comments_mediaContentId_idx" ON "media_comments"("mediaContentId");

-- CreateIndex
CREATE INDEX "media_comments_userId_idx" ON "media_comments"("userId");

-- CreateIndex
CREATE INDEX "media_comments_parentId_idx" ON "media_comments"("parentId");

-- CreateIndex
CREATE INDEX "media_comments_createdAt_idx" ON "media_comments"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "media_comment_likes_commentId_idx" ON "media_comment_likes"("commentId");

-- CreateIndex
CREATE UNIQUE INDEX "media_comment_likes_userId_commentId_key" ON "media_comment_likes"("userId", "commentId");

-- AddForeignKey
ALTER TABLE "media_likes" ADD CONSTRAINT "media_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_likes" ADD CONSTRAINT "media_likes_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_comments" ADD CONSTRAINT "media_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "media_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_comment_likes" ADD CONSTRAINT "media_comment_likes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_comment_likes" ADD CONSTRAINT "media_comment_likes_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "media_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
