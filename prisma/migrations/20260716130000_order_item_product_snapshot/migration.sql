-- RedefineTables: OrderItem guarda snapshot do produto; productId opcional (SET NULL)
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "productDescription" TEXT,
    "productImageUrl" TEXT,
    "quantity" INTEGER NOT NULL,
    "catalogListPrice" REAL,
    "catalogPromoPrice" REAL,
    "catalogUnitPrice" REAL,
    "itemDiscountMode" TEXT,
    "itemDiscountValue" REAL,
    "itemDiscountAmount" REAL NOT NULL DEFAULT 0,
    "lineSubtotalOriginal" REAL,
    "lineSubtotalFinal" REAL,
    "price" REAL NOT NULL,
    "pieceSelectionsJson" TEXT,
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "new_OrderItem" (
    "id",
    "orderId",
    "productId",
    "productName",
    "productDescription",
    "productImageUrl",
    "quantity",
    "catalogListPrice",
    "catalogPromoPrice",
    "catalogUnitPrice",
    "itemDiscountMode",
    "itemDiscountValue",
    "itemDiscountAmount",
    "lineSubtotalOriginal",
    "lineSubtotalFinal",
    "price",
    "pieceSelectionsJson"
)
SELECT
    oi."id",
    oi."orderId",
    oi."productId",
    COALESCE(p."name", 'Produto'),
    p."description",
    (
        SELECT pi."url"
        FROM "ProductImage" pi
        WHERE pi."productId" = oi."productId"
        ORDER BY pi."order" ASC
        LIMIT 1
    ),
    oi."quantity",
    oi."catalogListPrice",
    oi."catalogPromoPrice",
    oi."catalogUnitPrice",
    oi."itemDiscountMode",
    oi."itemDiscountValue",
    oi."itemDiscountAmount",
    oi."lineSubtotalOriginal",
    oi."lineSubtotalFinal",
    oi."price",
    oi."pieceSelectionsJson"
FROM "OrderItem" oi
LEFT JOIN "Product" p ON p."id" = oi."productId";

DROP TABLE "OrderItem";
ALTER TABLE "new_OrderItem" RENAME TO "OrderItem";

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
