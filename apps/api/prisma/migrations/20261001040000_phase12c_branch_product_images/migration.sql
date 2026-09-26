-- CreateTable
CREATE TABLE "BranchProductImage" (
    "id" TEXT NOT NULL,
    "branchProductId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "providerPublicId" TEXT,
    "resourceType" TEXT,
    "altText" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchProductImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BranchProductImage_branchProductId_idx" ON "BranchProductImage"("branchProductId");

-- AddForeignKey
ALTER TABLE "BranchProductImage" ADD CONSTRAINT "BranchProductImage_branchProductId_fkey" FOREIGN KEY ("branchProductId") REFERENCES "BranchProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
