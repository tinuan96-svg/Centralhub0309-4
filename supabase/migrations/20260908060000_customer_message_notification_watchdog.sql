-- Customer-care notification watchdog state.
-- Additive only: the existing conversation/message/ticket flow remains unchanged.

ALTER TABLE public.whatsapp_conversations
  ADD COLUMN IF NOT EXISTS ai_processing_started_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_unanswered_watchdog
  ON public.whatsapp_conversations(status, last_message_at)
  WHERE status IN ('open', 'waiting');
