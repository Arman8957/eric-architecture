-- CreateEnum
CREATE TYPE "MediaContentType" AS ENUM ('WORLD_PROJECT', 'PORTFOLIO', 'ARTICLE', 'NEWS');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "media_contents" (
    "id" TEXT NOT NULL,
    "contentType" "MediaContentType" NOT NULL,
    "status" "MediaStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "excerpt" VARCHAR(500),
    "content" TEXT NOT NULL,
    "location" TEXT,
    "country" TEXT,
    "city" TEXT,
    "coordinates" JSONB,
    "projectYear" INTEGER,
    "projectArea" DOUBLE PRECISION,
    "projectClient" TEXT,
    "architect" TEXT,
    "photographer" TEXT,
    "category" "ProjectCategory",
    "projectTags" TEXT[],
    "author" TEXT,
    "publishDate" TIMESTAMP(3),
    "readTime" INTEGER,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "metaKeywords" TEXT[],
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "featuredOrder" INTEGER,
    "coverImage" TEXT,
    "thumbnailImage" TEXT,
    "createdById" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "likeCount" INTEGER NOT NULL DEFAULT 0,
    "shareCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_contents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_assets" (
    "id" TEXT NOT NULL,
    "mediaContentId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "type" "AssetType" NOT NULL,
    "title" TEXT,
    "caption" TEXT,
    "altText" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "originalUrl" TEXT NOT NULL,
    "cdnUrl" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT,
    "blurHash" TEXT,
    "sizes" JSONB,
    "streamingUrl" TEXT,
    "duration" INTEGER,
    "resolution" TEXT,
    "posterUrl" TEXT,
    "modelUrl" TEXT,
    "usdzUrl" TEXT,
    "thumbnailUrl" TEXT,
    "isProcessed" BOOLEAN NOT NULL DEFAULT false,
    "processStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media_content_tags" (
    "mediaContentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "media_content_tags_pkey" PRIMARY KEY ("mediaContentId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "media_contents_slug_key" ON "media_contents"("slug");

-- CreateIndex
CREATE INDEX "media_contents_slug_idx" ON "media_contents"("slug");

-- CreateIndex
CREATE INDEX "media_contents_contentType_idx" ON "media_contents"("contentType");

-- CreateIndex
CREATE INDEX "media_contents_status_idx" ON "media_contents"("status");

-- CreateIndex
CREATE INDEX "media_contents_createdById_idx" ON "media_contents"("createdById");

-- CreateIndex
CREATE INDEX "media_contents_isFeatured_idx" ON "media_contents"("isFeatured");

-- CreateIndex
CREATE INDEX "media_contents_publishedAt_idx" ON "media_contents"("publishedAt");

-- CreateIndex
CREATE INDEX "media_contents_country_idx" ON "media_contents"("country");

-- CreateIndex
CREATE INDEX "media_contents_city_idx" ON "media_contents"("city");

-- CreateIndex
CREATE INDEX "media_assets_mediaContentId_idx" ON "media_assets"("mediaContentId");

-- CreateIndex
CREATE INDEX "media_assets_uploadedById_idx" ON "media_assets"("uploadedById");

-- CreateIndex
CREATE INDEX "media_assets_type_idx" ON "media_assets"("type");

-- CreateIndex
CREATE INDEX "media_assets_order_idx" ON "media_assets"("order");

-- CreateIndex
CREATE UNIQUE INDEX "media_tags_name_key" ON "media_tags"("name");

-- CreateIndex
CREATE UNIQUE INDEX "media_tags_slug_key" ON "media_tags"("slug");

-- CreateIndex
CREATE INDEX "media_tags_slug_idx" ON "media_tags"("slug");

-- AddForeignKey
ALTER TABLE "media_contents" ADD CONSTRAINT "media_contents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_content_tags" ADD CONSTRAINT "media_content_tags_mediaContentId_fkey" FOREIGN KEY ("mediaContentId") REFERENCES "media_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media_content_tags" ADD CONSTRAINT "media_content_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "media_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
