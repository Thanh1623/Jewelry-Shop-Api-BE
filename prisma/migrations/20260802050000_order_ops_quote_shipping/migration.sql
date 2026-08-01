-- AlterEnum
ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'PROCESSING';
ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'READY';
ALTER TYPE "order_status" ADD VALUE IF NOT EXISTS 'DELIVERED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "quote_message_id" UUID;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_name" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_phone" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "shipping_address" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "orders_quote_message_id_key" ON "orders"("quote_message_id");
CREATE INDEX IF NOT EXISTS "orders_status_created_at_idx" ON "orders"("status", "created_at");
