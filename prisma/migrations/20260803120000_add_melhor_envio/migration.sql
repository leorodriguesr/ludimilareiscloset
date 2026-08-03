-- AlterTable
ALTER TABLE "Order" ADD COLUMN "shippingProvider" TEXT;
ALTER TABLE "Order" ADD COLUMN "shippingQuotePackagesJson" TEXT;

-- CreateTable
CREATE TABLE "MelhorEnvioAuth" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "MelhorEnvioOAuthState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "state" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "MelhorEnvioOAuthState_state_key" ON "MelhorEnvioOAuthState"("state");

-- CreateIndex
CREATE INDEX "MelhorEnvioOAuthState_expiresAt_idx" ON "MelhorEnvioOAuthState"("expiresAt");
