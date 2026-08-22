-- "Other" on the media category needs somewhere to record what it actually is.
ALTER TABLE "media_contents" ADD COLUMN IF NOT EXISTS "categoryOther" TEXT;
