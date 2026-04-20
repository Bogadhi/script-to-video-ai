ALTER TABLE "Project" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Project" ADD COLUMN "draftStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Project" ADD COLUMN "manifestPath" TEXT;
ALTER TABLE "Project" ADD COLUMN "draftManifestPath" TEXT;
ALTER TABLE "Project" ADD COLUMN "editorStatePath" TEXT;
ALTER TABLE "Project" ADD COLUMN "renderCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Project" ADD COLUMN "updatedAt" DATETIME;

UPDATE "Project"
SET "updatedAt" = COALESCE("updatedAt", "createdAt");
