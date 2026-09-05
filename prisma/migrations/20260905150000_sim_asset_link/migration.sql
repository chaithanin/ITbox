-- Link a SIM line to the device (asset: mobile phone/tablet) it is used in.
ALTER TABLE "sim_cards" ADD COLUMN "assetId" UUID;

CREATE INDEX "sim_cards_organizationId_assetId_idx" ON "sim_cards"("organizationId", "assetId");

ALTER TABLE "sim_cards"
  ADD CONSTRAINT "sim_cards_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
