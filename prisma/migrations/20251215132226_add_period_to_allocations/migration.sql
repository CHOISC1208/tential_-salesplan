-- AlterTable: Add period column to allocations table
ALTER TABLE "sales_plane"."allocations" ADD COLUMN "period" TEXT;

-- DropIndex: Drop old unique constraint
DROP INDEX IF EXISTS "sales_plane"."allocations_session_id_hierarchy_path_key";

-- CreateIndex: Create new unique constraint including period
CREATE UNIQUE INDEX "allocations_session_id_hierarchy_path_period_key" ON "sales_plane"."allocations"("session_id", "hierarchy_path", "period");
