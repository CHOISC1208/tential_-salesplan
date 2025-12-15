-- ======================================
-- 完全な制約削除と再作成
-- ======================================

-- Step 1: すべてのUNIQUE制約を確認（実行して結果を確認してください）
SELECT
    conname AS constraint_name
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
JOIN pg_class cl ON cl.oid = c.conrelid
WHERE n.nspname = 'sales_plane'
  AND cl.relname = 'allocations'
  AND contype = 'u';

-- Step 2: 見つかった制約をすべて削除
-- 上記の結果に応じて、以下のコマンドを実行してください

-- 一般的な制約名で試す
ALTER TABLE "sales_plane"."allocations" DROP CONSTRAINT IF EXISTS "allocations_session_id_hierarchy_path_key";
ALTER TABLE "sales_plane"."allocations" DROP CONSTRAINT IF EXISTS "allocations_session_id_hierarchy_path_period_key";

-- Step 3: インデックスも削除
DROP INDEX IF EXISTS "sales_plane"."allocations_session_id_hierarchy_path_key";
DROP INDEX IF EXISTS "sales_plane"."allocations_session_id_hierarchy_path_period_key";

-- Step 4: 新しい制約を作成（UNIQUE INDEXではなくCONSTRAINTとして）
ALTER TABLE "sales_plane"."allocations"
ADD CONSTRAINT "allocations_session_id_hierarchy_path_period_key"
UNIQUE ("session_id", "hierarchy_path", "period");

-- Step 5: 確認
SELECT
    conname AS constraint_name,
    pg_get_constraintdef(c.oid) AS constraint_definition
FROM pg_constraint c
JOIN pg_namespace n ON n.oid = c.connamespace
JOIN pg_class cl ON cl.oid = c.conrelid
WHERE n.nspname = 'sales_plane'
  AND cl.relname = 'allocations'
  AND contype = 'u';
