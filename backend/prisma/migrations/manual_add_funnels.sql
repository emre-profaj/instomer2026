-- Add funnels table for user-defined pipeline categories
CREATE TABLE IF NOT EXISTS "funnels" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icon" TEXT NOT NULL DEFAULT '📁',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funnels_pkey" PRIMARY KEY ("id")
);

-- Index for workspace lookup
CREATE INDEX IF NOT EXISTS "funnels_workspaceId_idx" ON "funnels"("workspaceId");

-- Foreign key to workspaces
ALTER TABLE "funnels" ADD CONSTRAINT "funnels_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
