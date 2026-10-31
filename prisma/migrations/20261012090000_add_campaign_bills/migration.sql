CREATE TABLE "CampaignBill" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "imageData" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignBill_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CampaignBill_campaignId_createdAt_idx" ON "CampaignBill"("campaignId", "createdAt");

ALTER TABLE "CampaignBill"
ADD CONSTRAINT "CampaignBill_campaignId_fkey"
FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
