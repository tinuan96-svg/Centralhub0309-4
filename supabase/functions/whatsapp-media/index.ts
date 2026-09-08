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

  const appMetadata = user.app_metadata || {}
  let isAdmin = ['admin', 'superadmin', 'administrator'].includes(
    String(appMetadata.role || appMetadata.profile_role || '').toLowerCase()
  )

  if (!isAdmin) {
    const { data: profile } = await db
      .from('user_profiles')
      .select('profile_role,is_active')
      .eq('id', user.id)
      .maybeSingle()
    isAdmin = profile?.profile_role === 'admin' && profile?.is_active !== false
  }

  if (!isAdmin) {
    try {
      isAdmin = !!(await db.rpc('is_admin', { user_id: user.id })).data
    } catch {
      isAdmin = false
    }
  }
  if (!isAdmin) throw new Error('Forbidden: admin access required')
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
    const status = /^Unauthorized/i.test(errorMessage) ? 401 : /^Forbidden/i.test(errorMessage) ? 403 : 500
    return json({ error: errorMessage }, status)
  }
})
