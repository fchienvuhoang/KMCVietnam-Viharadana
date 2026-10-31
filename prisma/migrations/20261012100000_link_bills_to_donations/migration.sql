ALTER TABLE "CampaignBill" ADD COLUMN "transactionId" TEXT, ADD COLUMN "title" TEXT;
CREATE INDEX "CampaignBill_transactionId_idx" ON "CampaignBill"("transactionId");
ALTER TABLE "CampaignBill" ADD CONSTRAINT "CampaignBill_transactionId_fkey"
FOREIGN KEY ("transactionId") REFERENCES "BankTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
