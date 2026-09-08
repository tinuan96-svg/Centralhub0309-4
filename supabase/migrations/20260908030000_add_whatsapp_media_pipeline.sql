-- Persist WhatsApp media in the central private bucket so media remains
-- available after Meta's temporary download URL expires.
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS media_storage_path text,
  ADD COLUMN IF NOT EXISTS media_mime_type text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS media_caption text,
  ADD COLUMN IF NOT EXISTS media_size bigint,
  ADD COLUMN IF NOT EXISTS media_sha256 text,
  ADD COLUMN IF NOT EXISTS media_download_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS media_download_error text,
  ADD COLUMN IF NOT EXISTS media_download_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS media_downloaded_at timestamptz;

ALTER TABLE public.whatsapp_messages
  DROP CONSTRAINT IF EXISTS whatsapp_messages_message_type_check;

ALTER TABLE public.whatsapp_messages
  ADD CONSTRAINT whatsapp_messages_message_type_check
  CHECK (message_type IN ('text', 'image', 'document', 'audio', 'video', 'sticker', 'interactive', 'template'));

UPDATE public.whatsapp_messages
SET media_id = COALESCE(media_id, NULLIF(media_url, '')),
    media_download_status = CASE
      WHEN COALESCE(media_id, NULLIF(media_url, '')) IS NOT NULL
        THEN CASE WHEN media_download_status = 'not_required' THEN 'pending' ELSE media_download_status END
      ELSE media_download_status
    END
WHERE message_type IN ('image', 'document', 'audio', 'video', 'sticker')
  AND media_url IS NOT NULL
  AND media_url NOT LIKE 'http%';

UPDATE public.whatsapp_messages m
SET
  media_id = COALESCE(m.media_id, media.id),
  media_mime_type = COALESCE(m.media_mime_type, media.mime_type),
  media_filename = COALESCE(m.media_filename, media.filename),
  media_caption = COALESCE(m.media_caption, media.caption),
  media_download_status = CASE
    WHEN COALESCE(m.media_id, media.id) IS NOT NULL AND m.media_download_status = 'not_required'
      THEN 'pending'
    ELSE m.media_download_status
  END
FROM public.whatsapp_webhook_events e
CROSS JOIN LATERAL (
  SELECT
    CASE m.message_type
      WHEN 'image' THEN e.payload->'entry'->0->'changes'->0->'value'->'messages'->0->'image'
      WHEN 'document' THEN e.payload->'entry'->0->'changes'->0->'value'->'messages'->0->'document'
      WHEN 'audio' THEN COALESCE(
        e.payload->'entry'->0->'changes'->0->'value'->'messages'->0->'audio',
        e.payload->'entry'->0->'changes'->0->'value'->'messages'->0->'voice'
      )
      WHEN 'video' THEN e.payload->'entry'->0->'changes'->0->'value'->'messages'->0->'video'
      WHEN 'sticker' THEN e.payload->'entry'->0->'changes'->0->'value'->'messages'->0->'sticker'
      ELSE NULL
    END AS media
) media
WHERE e.event_id = m.wa_message_id
  AND media.media IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_media_status
  ON public.whatsapp_messages (media_download_status)
  WHERE media_download_status IN ('pending', 'downloading', 'failed');

CREATE INDEX IF NOT EXISTS idx_wa_messages_media_id
  ON public.whatsapp_messages (media_id)
  WHERE media_id IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('whatsapp-media', 'whatsapp-media', false, 52428800, NULL)
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  public = false,
  file_size_limit = 52428800,
  allowed_mime_types = NULL,
  updated_at = now();
