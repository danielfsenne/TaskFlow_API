-- etiquetas passam do quadro para o projeto

ALTER TABLE "labels" ADD COLUMN "project_id" TEXT;

UPDATE "labels" l
SET "project_id" = b."project_id"
FROM "boards" b
WHERE b."id" = l."board_id";

-- mesmo nome em quadros diferentes do projeto vira uma etiqueta só:
-- fica a mais antiga e as tarefas das outras passam para ela
CREATE TEMP TABLE "label_merge" AS
SELECT l."id" AS "old_id", k."id" AS "keep_id"
FROM "labels" l
JOIN LATERAL (
  SELECT k."id"
  FROM "labels" k
  WHERE k."project_id" = l."project_id" AND k."name" = l."name"
  ORDER BY k."created_at", k."id"
  LIMIT 1
) k ON TRUE
WHERE k."id" <> l."id";

INSERT INTO "task_labels" ("task_id", "label_id")
SELECT tl."task_id", m."keep_id"
FROM "task_labels" tl
JOIN "label_merge" m ON m."old_id" = tl."label_id"
ON CONFLICT DO NOTHING;

DELETE FROM "labels" WHERE "id" IN (SELECT "old_id" FROM "label_merge");

DROP TABLE "label_merge";

ALTER TABLE "labels" ALTER COLUMN "project_id" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "labels" DROP CONSTRAINT "labels_board_id_fkey";

-- DropIndex
DROP INDEX "labels_board_id_name_key";

ALTER TABLE "labels" DROP COLUMN "board_id";

-- CreateIndex
CREATE UNIQUE INDEX "labels_project_id_name_key" ON "labels"("project_id", "name");

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
