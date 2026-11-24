-- CreateTable
CREATE TABLE "pending_notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor_id" TEXT,
    "recipient_ids" TEXT[],
    "data" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_notifications_created_at_idx" ON "pending_notifications"("created_at");
