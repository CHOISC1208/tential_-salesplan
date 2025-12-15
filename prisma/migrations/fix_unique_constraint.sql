-- ======================================
-- Fix unique constraint for period support
-- ======================================
-- This SQL fixes the unique constraint to support multiple periods

-- 1. Drop ALL existing constraints and indexes
DROP INDEX IF EXISTS "sales_plane"."allocations_session_id_hierarchy_path_key";
DROP INDEX IF EXISTS "sales_plane"."allocations_session_id_hierarchy_path_period_key";

-- 2. Create the correct unique index with period
CREATE UNIQUE INDEX "allocations_session_id_hierarchy_path_period_key"
ON "sales_plane"."allocations"("session_id", "hierarchy_path", "period");

-- 3. Verify the change
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'sales_plane'
  AND tablename = 'allocations'
  AND indexname LIKE '%allocations%';
