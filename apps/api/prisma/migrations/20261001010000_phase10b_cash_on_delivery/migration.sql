-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'COD';

-- AlterTable
ALTER TABLE "AuditEvent" ADD COLUMN     "branchId" TEXT;

-- AlterTable
ALTER TABLE "PartnerIdCounter" ALTER COLUMN "id" SET DEFAULT 'partner';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "collectedById" TEXT,
ADD COLUMN     "collectedByRole" TEXT;

-- CreateIndex
CREATE INDEX "AuditEvent_branchId_createdAt_idx" ON "AuditEvent"("branchId", "createdAt");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
