-- CreateTable
CREATE TABLE "ShowcaseVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "youtubeId" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "ShowcaseVideo_sortOrder_idx" ON "ShowcaseVideo"("sortOrder");
