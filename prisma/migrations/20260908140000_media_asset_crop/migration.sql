-- Per-image crop for photos that do not match the shape of the frame.
--
-- A hero fills the screen, so a photo whose proportions differ from the
-- viewport's is either cropped or shrunk. Until now the client guessed, which
-- turned a portrait upload on a desktop hero into a magnified detail of
-- itself. This lets an editor choose the portion that is shown instead.
--
-- Two rectangles, not one: the same hero is wide on a desktop and taller than
-- it is wide on a phone, so a single choice cannot serve both.
--   {"wide": {"x": 0.1, "y": 0, "width": 0.8, "height": 0.42}, "tall": {...}}
-- Each value is a fraction of the original image, 0..1.
--
-- Nullable, and either side may be absent: every existing row starts empty and
-- keeps the automatic behaviour, so this is additive for published content.

ALTER TABLE "media_assets" ADD COLUMN "crop" JSONB;
