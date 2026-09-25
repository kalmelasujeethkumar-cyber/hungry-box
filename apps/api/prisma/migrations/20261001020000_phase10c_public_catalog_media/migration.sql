-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "imagePublicId" TEXT,
ADD COLUMN     "imageResourceType" TEXT;

-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "providerPublicId" TEXT,
ADD COLUMN     "resourceType" TEXT;