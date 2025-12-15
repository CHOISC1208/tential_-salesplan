-- ======================================
-- Step 1.5: Direct SQL for adding period column
-- ======================================
-- This SQL can be run directly on your database
-- Run these commands in order

-- 1. Add period column (nullable for backward compatibility)
ALTER TABLE "sales_plane"."allocations" ADD COLUMN IF NOT EXISTS "period" TEXT;

-- 2. Drop the old unique constraint if it exists
ALTER TABLE "sales_plane"."allocations"
DROP CONSTRAINT IF EXISTS "allocations_session_id_hierarchy_path_key";

-- 3. Create new unique constraint including period
-- Note: This allows multiple records with same session_id + hierarchy_path but different periods
-- Records with period = NULL are considered distinct from each other in PostgreSQL unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "allocations_session_id_hierarchy_path_period_key"
ON "sales_plane"."allocations"("session_id", "hierarchy_path", "period");

-- 4. Verify the change
-- Run this to check the new column exists:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'sales_plane'
--   AND table_name = 'allocations'
--   AND column_name = 'period';

-- 5. Check existing data (should all have period = NULL)
-- SELECT COUNT(*) as total_allocations,
--        COUNT(period) as allocations_with_period,
--        COUNT(*) - COUNT(period) as allocations_without_period
-- FROM "sales_plane"."allocations";

-- ======================================
-- Rollback SQL (if needed)
-- ======================================
-- To rollback these changes, run:
--
-- -- Remove the new unique constraint
-- DROP INDEX IF EXISTS "sales_plane"."allocations_session_id_hierarchy_path_period_key";
--
-- -- Recreate the old unique constraint
-- CREATE UNIQUE INDEX "allocations_session_id_hierarchy_path_key"
-- ON "sales_plane"."allocations"("session_id", "hierarchy_path");
--
-- -- Remove the period column
-- ALTER TABLE "sales_plane"."allocations" DROP COLUMN IF EXISTS "period";
