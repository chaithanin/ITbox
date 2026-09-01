-- DB-004: index foreign-key / report-filter columns that back detail pages and
-- dashboards (Postgres does not auto-index FK columns).
CREATE INDEX "asset_maintenance_org_assetId_idx" ON "asset_maintenance"("organizationId", "assetId");
CREATE INDEX "asset_maintenance_vendorId_idx" ON "asset_maintenance"("vendorId");
CREATE INDEX "approvals_prId_step_idx" ON "approvals"("purchaseRequestId", "step");
CREATE INDEX "vulnerabilities_assetId_idx" ON "vulnerabilities"("assetId");
CREATE INDEX "configuration_items_assetId_idx" ON "configuration_items"("assetId");
CREATE INDEX "endpoint_posture_assetId_idx" ON "endpoint_posture"("assetId");
CREATE INDEX "cctv_recorders_assetId_idx" ON "cctv_recorders"("assetId");
CREATE INDEX "licenses_vendorId_idx" ON "licenses"("vendorId");
CREATE INDEX "subscriptions_vendorId_idx" ON "subscriptions"("vendorId");
CREATE INDEX "contracts_vendorId_idx" ON "contracts"("vendorId");
CREATE INDEX "network_devices_vendorId_idx" ON "network_devices"("vendorId");
CREATE INDEX "ip_addresses_subnetId_idx" ON "ip_addresses"("subnetId");
CREATE INDEX "subnets_vlanRef_idx" ON "subnets"("vlanRef");
