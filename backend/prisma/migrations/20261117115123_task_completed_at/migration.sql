-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- Tarefas que já estão na última coluna de quadros com 2+ colunas contam como
-- concluídas desde a última alteração.
UPDATE "tasks" t
SET "completed_at" = t."updated_at"
FROM (
  SELECT DISTINCT ON ("board_id") "board_id", "id"
  FROM "board_columns"
  ORDER BY "board_id", "position" DESC
) last
WHERE t."column_id" = last."id"
  AND (SELECT COUNT(*) FROM "board_columns" c WHERE c."board_id" = t."board_id") >= 2;
