-- AlterTable
ALTER TABLE "proposals" ADD COLUMN     "architectContractSignature" TEXT,
ADD COLUMN     "clientContractSignature" TEXT,
ADD COLUMN     "clientContractSignedAt" TIMESTAMP(3),
ADD COLUMN     "contractSections" JSONB;

-- CreateTable
CREATE TABLE "master_contracts" (
    "id" TEXT NOT NULL,
    "articleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "master_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "master_contracts_articleKey_key" ON "master_contracts"("articleKey");

-- CreateIndex
CREATE INDEX "master_contracts_order_idx" ON "master_contracts"("order");

-- CreateIndex
CREATE INDEX "master_contracts_isActive_idx" ON "master_contracts"("isActive");
