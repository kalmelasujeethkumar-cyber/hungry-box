-- AlterTable
ALTER TABLE "DeliveryPartnerDocument" ADD COLUMN     "storageProvider" TEXT,
ADD COLUMN     "providerPublicId" TEXT,
ADD COLUMN     "resourceType" TEXT,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "fileSize" INTEGER;