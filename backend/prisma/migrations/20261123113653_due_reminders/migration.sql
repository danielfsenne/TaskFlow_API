-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "due_reminder_sent_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "tasks_due_date_idx" ON "tasks"("due_date");
