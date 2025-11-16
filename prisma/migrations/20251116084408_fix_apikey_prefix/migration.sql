-- DropIndex
DROP INDEX "ApiKey_keyPrefix_key";

-- AlterTable
ALTER TABLE "ApiKey" ALTER COLUMN "keyPrefix" SET DATA TYPE VARCHAR(30);
