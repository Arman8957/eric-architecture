-- AlterTable
ALTER TABLE "media_contents" ADD COLUMN     "publisher" TEXT,
ADD COLUMN     "source" TEXT,
ADD COLUMN     "uploadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
