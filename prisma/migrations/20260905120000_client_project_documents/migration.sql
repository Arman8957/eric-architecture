-- Client-uploaded project documents.
--
-- The New Project form asks for a property boundary/survey map, a geotechnical
-- report and project photos, but a client who skipped them at submission had no
-- way back — the fields were read-only placeholders on their Documents tab.
-- These rows let them upload at any time, and give the studio somewhere to read
-- them from.
--
-- Distinct from project_attachments: those are external links the architect
-- shares, these are files the client owns.

CREATE TYPE "ProjectDocumentKind" AS ENUM (
  'PROPERTY_BOUNDARY',
  'GEOTECHNICAL_REPORT',
  'PROJECT_PHOTO'
);

CREATE TABLE "project_documents" (
  "id"               TEXT NOT NULL,
  "projectRequestId" TEXT NOT NULL,
  "kind"             "ProjectDocumentKind" NOT NULL,
  "fileName"         TEXT NOT NULL,
  "url"              TEXT NOT NULL,
  "publicId"         TEXT,
  "mimeType"         TEXT,
  "size"             INTEGER,
  "uploadedById"     TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,

  CONSTRAINT "project_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "project_documents_projectRequestId_idx" ON "project_documents"("projectRequestId");
CREATE INDEX "project_documents_kind_idx" ON "project_documents"("kind");

ALTER TABLE "project_documents"
  ADD CONSTRAINT "project_documents_projectRequestId_fkey"
  FOREIGN KEY ("projectRequestId") REFERENCES "project_requests"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_documents"
  ADD CONSTRAINT "project_documents_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
