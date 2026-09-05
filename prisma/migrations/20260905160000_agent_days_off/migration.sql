-- Per-agent day off / leave: on that date auto-assignment skips the agent.
CREATE TABLE "agent_days_off" (
  "id"             UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId"         UUID NOT NULL,
  "date"           DATE NOT NULL,
  "reason"         TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agent_days_off_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_days_off_organizationId_userId_date_key"
  ON "agent_days_off"("organizationId", "userId", "date");
CREATE INDEX "agent_days_off_organizationId_date_idx"
  ON "agent_days_off"("organizationId", "date");

ALTER TABLE "agent_days_off"
  ADD CONSTRAINT "agent_days_off_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_days_off"
  ADD CONSTRAINT "agent_days_off_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
