-- Phase 5 — delivery partners, assignments, location tracking, notifications.
-- Incremental only: adds new tables/enums, never edits Phase 2-4 history.

-- CreateEnum
CREATE TYPE "DeliveryPartnerStatus" AS ENUM ('PENDING_VERIFICATION', 'DOCUMENT_REVIEW', 'VERIFIED', 'ACTIVE', 'INACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DeliveryAvailability" AS ENUM ('OFFLINE', 'ONLINE', 'ON_DELIVERY');

-- CreateEnum
CREATE TYPE "DeliveryPartnerType" AS ENUM ('FULL_TIME', 'PART_TIME', 'GIG');

-- CreateEnum
CREATE TYPE "DeliveryAssignmentStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('AADHAAR', 'PAN', 'ADDRESS_PROOF', 'DRIVING_LICENSE', 'RC', 'INSURANCE', 'BANK_PROOF', 'PROFILE_PHOTO');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('PENDING', 'UPLOADED', 'VERIFIED', 'REJECTED');

-- CreateTable
CREATE TABLE "DeliveryPartnerProfile" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "profilePhotoUrl" TEXT,
    "houseFlat" TEXT,
    "streetArea" TEXT,
    "city" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "identityVerified" BOOLEAN NOT NULL DEFAULT false,
    "addressProofVerified" BOOLEAN NOT NULL DEFAULT false,
    "drivingLicenceNumber" TEXT,
    "licenceType" TEXT,
    "licenceExpiry" TIMESTAMP(3),
    "licenceVerified" BOOLEAN NOT NULL DEFAULT false,
    "vehicleType" TEXT,
    "vehicleNumber" TEXT,
    "vehicleBrand" TEXT,
    "vehicleModel" TEXT,
    "vehicleColour" TEXT,
    "registrationYear" INTEGER,
    "rcReference" TEXT,
    "insuranceReference" TEXT,
    "insuranceExpiry" TIMESTAMP(3),
    "ownVehicle" BOOLEAN,
    "accountHolderName" TEXT,
    "bankName" TEXT,
    "accountNumberMasked" TEXT,
    "ifsc" TEXT,
    "payoutVerified" BOOLEAN NOT NULL DEFAULT false,
    "partnerType" "DeliveryPartnerType",
    "joinedAt" TIMESTAMP(3),
    "status" "DeliveryPartnerStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "availability" "DeliveryAvailability" NOT NULL DEFAULT 'OFFLINE',
    "wentOnlineAt" TIMESTAMP(3),
    "wentOfflineAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryPartnerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPartnerDocument" (
    "id" TEXT NOT NULL,
    "deliveryPartnerId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "documentReference" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "verificationNote" TEXT,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DeliveryPartnerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryAssignment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "deliveryPartnerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "DeliveryAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "pickedUpAt" TIMESTAMP(3),
    "outForDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryPartnerLocation" (
    "id" TEXT NOT NULL,
    "deliveryPartnerId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "latitude" DECIMAL(65,30) NOT NULL,
    "longitude" DECIMAL(65,30) NOT NULL,
    "accuracy" DECIMAL(65,30),
    "heading" DECIMAL(65,30),
    "speed" DECIMAL(65,30),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryPartnerLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "data" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerIdCounter" (
    "id" TEXT NOT NULL,
    "seq" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PartnerIdCounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPartnerProfile_partnerId_key" ON "DeliveryPartnerProfile"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPartnerProfile_userId_key" ON "DeliveryPartnerProfile"("userId");

-- CreateIndex
CREATE INDEX "DeliveryPartnerProfile_branchId_status_idx" ON "DeliveryPartnerProfile"("branchId", "status");

-- CreateIndex
CREATE INDEX "DeliveryPartnerProfile_branchId_availability_idx" ON "DeliveryPartnerProfile"("branchId", "availability");

-- CreateIndex
CREATE INDEX "DeliveryPartnerProfile_status_idx" ON "DeliveryPartnerProfile"("status");

-- CreateIndex
CREATE INDEX "DeliveryPartnerDocument_deliveryPartnerId_status_idx" ON "DeliveryPartnerDocument"("deliveryPartnerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryPartnerDocument_deliveryPartnerId_type_key" ON "DeliveryPartnerDocument"("deliveryPartnerId", "type");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_orderId_status_idx" ON "DeliveryAssignment"("orderId", "status");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_deliveryPartnerId_createdAt_idx" ON "DeliveryAssignment"("deliveryPartnerId", "createdAt");

-- CreateIndex
CREATE INDEX "DeliveryAssignment_branchId_status_idx" ON "DeliveryAssignment"("branchId", "status");

-- CreateIndex
CREATE INDEX "DeliveryPartnerLocation_deliveryPartnerId_recordedAt_idx" ON "DeliveryPartnerLocation"("deliveryPartnerId", "recordedAt");

-- CreateIndex
CREATE INDEX "DeliveryPartnerLocation_assignmentId_recordedAt_idx" ON "DeliveryPartnerLocation"("assignmentId", "recordedAt");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_readAt_idx" ON "Notification"("recipientUserId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_createdAt_idx" ON "Notification"("recipientUserId", "createdAt");

-- Deliveries execute one at a time: a single, non-rejected/non-cancelled
-- assignment is allowed per order. This is the concurrency backstop for
-- double-assignment (two managers) and ensures reassignment stays legal only
-- after REJECTED/CANCELLED.
CREATE UNIQUE INDEX "DeliveryAssignment_single_active_per_order" ON "DeliveryAssignment"("orderId") WHERE "status" NOT IN ('REJECTED', 'CANCELLED');

-- AddForeignKey
ALTER TABLE "DeliveryPartnerProfile" ADD CONSTRAINT "DeliveryPartnerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPartnerProfile" ADD CONSTRAINT "DeliveryPartnerProfile_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPartnerDocument" ADD CONSTRAINT "DeliveryPartnerDocument_deliveryPartnerId_fkey" FOREIGN KEY ("deliveryPartnerId") REFERENCES "DeliveryPartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_deliveryPartnerId_fkey" FOREIGN KEY ("deliveryPartnerId") REFERENCES "DeliveryPartnerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryAssignment" ADD CONSTRAINT "DeliveryAssignment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPartnerLocation" ADD CONSTRAINT "DeliveryPartnerLocation_deliveryPartnerId_fkey" FOREIGN KEY ("deliveryPartnerId") REFERENCES "DeliveryPartnerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryPartnerLocation" ADD CONSTRAINT "DeliveryPartnerLocation_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "DeliveryAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prime the partner-id counter so the first generated id is HB-DP-000001.
INSERT INTO "PartnerIdCounter" ("id", "seq") VALUES ('partner', 0) ON CONFLICT ("id") DO NOTHING;