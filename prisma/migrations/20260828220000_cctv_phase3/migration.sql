-- CCTV Phase 3: snapshot image storage + on-demand recheck
ALTER TABLE "cctv_cameras" ADD COLUMN "snapshotObjectKey" TEXT;
ALTER TABLE "cctv_recorders" ADD COLUMN "recheckRequestedAt" TIMESTAMP(3);
