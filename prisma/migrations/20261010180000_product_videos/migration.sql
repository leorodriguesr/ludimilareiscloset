-- CreateTable
CREATE TABLE "ProductVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "productId" TEXT NOT NULL,
    CONSTRAINT "ProductVideo_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ProductVideo_productId_order_idx" ON "ProductVideo"("productId", "order");

-- Copia o vídeo único já cadastrado
INSERT INTO "ProductVideo" ("id", "url", "order", "productId")
SELECT lower(hex(randomblob(16))), "videoUrl", 0, "id"
FROM "Product"
WHERE "videoUrl" IS NOT NULL AND trim("videoUrl") != '';
