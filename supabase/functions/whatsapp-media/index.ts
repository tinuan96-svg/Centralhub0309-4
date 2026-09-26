import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { createSignedWhatsAppMediaUrl, downloadAndStoreWhatsAppMedia, SUPPORTED_MEDIA_TYPES } from "../_shared/whatsapp-media.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
})

async function requireAdmin(req: Request, db: any) {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  if (!bearer) throw new Error('Unauthorized: Supabase session is required')

  const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY') || ''
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  if (!publishableKey || !supabaseUrl) throw new Error('Supabase auth is not configured')

  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  })
  const { data: { user }, error } = await userClient.auth.getUser(bearer)
  if (error || !user) throw new Error('Unauthorized: Supabase session is invalid or expired')

  // Match CentralHub's canonical public.is_admin() contract: an active admin
  // profile AND the server-managed Auth admin role, without a staff identity.
  // A profile label alone must not grant access to private customer media.
  if (String(user.app_metadata?.role || '').toLowerCase() !== 'admin') {
    throw new Error('Forbidden: admin access required')
  }
  const { data: profile, error: profileError } = await db
    .from('user_profiles')
    .select('profile_role,is_active')
    .eq('id', user.id)
    .maybeSingle()
  if (profileError || profile?.profile_role !== 'admin' || profile?.is_active !== true) {
    throw new Error('Forbidden: active admin profile required')
  }
  const { data: staffIdentity, error: staffError } = await db
    .from('ch_staff_accounts')
    .select('user_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (staffError || staffIdentity) {
    throw new Error('Forbidden: staff identities cannot access admin media')
  }
  return user
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    if (!supabaseUrl || !serviceKey) return json({ error: 'Media service is not configured' }, 500)

    const db = createClient(supabaseUrl, serviceKey)
    await requireAdmin(req, db)

    const url = new URL(req.url)
    let body: any = {}
    if (req.method === 'POST') body = await req.json().catch(() => ({}))
    const messageId = String(url.searchParams.get('message_id') || body?.message_id || '').trim()
    if (!messageId) return json({ error: 'message_id is required' }, 400)

    const { data: message, error: messageError } = await db
      .from('whatsapp_messages')
      .select('id,conversation_id,message_type,media_id,media_url,media_storage_path,media_mime_type,media_filename,media_caption')
      .eq('id', messageId)
      .maybeSingle()
    if (messageError) return json({ error: `Message lookup failed: ${messageError.message}` }, 500)
    if (!message) return json({ error: 'Message not found' }, 404)
    if (!SUPPORTED_MEDIA_TYPES.has(message.message_type)) {
      return json({ error: 'This message does not contain downloadable WhatsApp media' }, 400)
    }

    const { data: conversation, error: conversationError } = await db
      .from('whatsapp_conversations')
      .select('store_id')
      .eq('id', message.conversation_id)
      .maybeSingle()
    if (conversationError) return json({ error: `Conversation lookup failed: ${conversationError.message}` }, 500)
    const storeId = conversation?.store_id
    if (!storeId) return json({ error: 'Conversation is not linked to a store' }, 400)

    let storagePath = message.media_storage_path
    if (!storagePath) {
      const { data: channel, error: channelError } = await db
        .from('whatsapp_channels')
        .select('access_token')
        .eq('store_id', storeId)
        .maybeSingle()
      if (channelError) return json({ error: `WhatsApp channel lookup failed: ${channelError.message}` }, 500)
      if (!channel?.access_token) return json({ error: 'WhatsApp access token is not configured for this store' }, 424)

      const mediaId = message.media_id || message.media_url
      const stored = await downloadAndStoreWhatsAppMedia(db, {
        messageId: message.id,
        storeId,
        conversationId: message.conversation_id,
        messageType: message.message_type,
        mediaId,
        filename: message.media_filename,
        accessToken: channel.access_token,
      })
      storagePath = stored.path
    }

    const signedUrl = await createSignedWhatsAppMediaUrl(db, storagePath, 900)
    return json({
      url: signedUrl,
      message_id: message.id,
      message_type: message.message_type,
      mime_type: message.media_mime_type || null,
      filename: message.media_filename || null,
      caption: message.media_caption || null,
      download_status: 'downloaded',
    })
  } catch (error: any) {
    const errorMessage = String(error?.message || error)
    // A missing/expired Meta media object cannot be fixed by retrying the rendering request.
    // Keep the original message and persisted download error for subsequent recovery.
    const sourceUnavailable = /Unsupported get request|Object with ID.*does not exist|Meta media (lookup|download) failed [(]40[34][)]/i.test(errorMessage)
    const status = /^Unauthorized/i.test(errorMessage) ? 401 : /^Forbidden/i.test(errorMessage) ? 403 : sourceUnavailable ? 424 : 500
    if (sourceUnavailable) return json({
      code: 'SOURCE_MEDIA_UNAVAILABLE',
      error: 'The original WhatsApp attachment is not currently retrievable from Meta. The message is preserved; ask the sender to resend it or retry after restoring media access.',
      retryable: true,
    }, 424)
    return json({ error: errorMessage }, status)
  }
})
