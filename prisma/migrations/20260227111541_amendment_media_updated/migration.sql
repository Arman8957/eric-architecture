-- CreateTable
CREATE TABLE "amendment_contracts" (
    "id" TEXT NOT NULL,
    "articleKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "amendment_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amendment_contracts_articleKey_key" ON "amendment_contracts"("articleKey");

-- CreateIndex
CREATE INDEX "amendment_contracts_order_idx" ON "amendment_contracts"("order");

-- CreateIndex
CREATE INDEX "amendment_contracts_isActive_idx" ON "amendment_contracts"("isActive");
