const MEDIA_BUCKET = 'whatsapp-media'
const MAX_MEDIA_BYTES = 50 * 1024 * 1024

export const SUPPORTED_MEDIA_TYPES = new Set(['image', 'document', 'audio', 'video', 'sticker'])

function normalizeGraphApiVersion(value: string | undefined) {
  const raw = String(value || '').trim()
  const match = raw.match(/^v?(\d+\.\d+)$/i)
  return match ? \`v\${match[1]}\` : 'v23.0'
}

function safeExtension(mimeType: string, messageType: string) {
  const mime = String(mimeType || '').toLowerCase()
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
  }
  if (map[mime]) return map[mime]
  const fromMime = mime.split('/')[1]?.replace(/[^a-z0-9]+/gi, '').slice(0, 8)
  if (fromMime) return fromMime
  return messageType === 'image' || messageType === 'sticker' ? 'bin' : 'bin'
}

function cleanToken(value: unknown) {
  return String(value || '').trim()
}

function cleanMediaId(value: unknown) {
  const id = String(value || '').trim()
  return id && /^[A-Za-z0-9._:-]+$/.test(id) ? id : ''
}

export async function downloadAndStoreWhatsAppMedia(
  db: any,
  params: {
    messageId: string
    storeId: string
    conversationId: string
    messageType: string
    mediaId: string
    filename?: string | null
    accessToken: string
  }
) {
  const mediaId = cleanMediaId(params.mediaId)
  if (!mediaId) throw new Error('WhatsApp media ID is missing')
  if (!SUPPORTED_MEDIA_TYPES.has(params.messageType)) throw new Error(\`Unsupported WhatsApp media type: \${params.messageType}\`)
  const token = cleanToken(params.accessToken)
  if (!token) throw new Error('WhatsApp channel access token is missing')

  const { data: current } = await db
    .from('whatsapp_messages')
    .select('media_storage_path,media_download_attempts')
    .eq('id', params.messageId)
    .maybeSingle()
  if (current?.media_storage_path) return { path: current.media_storage_path, alreadyStored: true }

  const attempt = Number(current?.media_download_attempts || 0) + 1
  await db.from('whatsapp_messages').update({
    media_id: mediaId,
    media_download_status: 'downloading',
    media_download_attempts: attempt,
    media_download_error: null,
  }).eq('id', params.messageId)

  try {
    const graphVersion = normalizeGraphApiVersion(Deno.env.get('WHATSAPP_GRAPH_API_VERSION'))
    const metaUrl = \`https://graph.facebook.com/\${graphVersion}/\${encodeURIComponent(mediaId)}\`
    const metaResponse = await fetch(metaUrl, { headers: { Authorization: \`Bearer \${token}\` } })
    const metaRaw = await metaResponse.text()
    let meta: any = {}
    try { meta = metaRaw ? JSON.parse(metaRaw) : {} } catch { meta = { raw: metaRaw } }
    if (!metaResponse.ok || !meta?.url) {
      throw new Error(meta?.error?.message || \`Meta media lookup failed (\${metaResponse.status})\`)
    }

    const mimeType = String(meta.mime_type || 'application/octet-stream')
    const downloadResponse = await fetch(meta.url, { headers: { Authorization: \`Bearer \${token}\` } })
    if (!downloadResponse.ok) {
      const body = await downloadResponse.text().catch(() => '')
      throw new Error(\`Meta media download failed (\${downloadResponse.status})\${body ? \`: \${body.slice(0, 200)}\` : ''}\`)
    }
    const bytes = new Uint8Array(await downloadResponse.arrayBuffer())
    if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error(\`Media exceeds \${MAX_MEDIA_BYTES} byte limit\`)

    const extension = safeExtension(mimeType, params.messageType)
    const path = \`\${params.storeId}/\${params.conversationId}/\${params.messageId}.\${extension}\`
    const { error: uploadError } = await db.storage.from(MEDIA_BUCKET).upload(path, bytes, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: true,
    })
    if (uploadError) throw new Error(\`Supabase media upload failed: \${uploadError.message}\`)

    const { error: updateError } = await db.from('whatsapp_messages').update({
      media_id: mediaId,
      media_storage_path: path,
      media_mime_type: mimeType,
      media_filename: params.filename || \`whatsapp-\${mediaId}.\${extension}\`,
      media_size: Number(meta.file_size || bytes.byteLength),
      media_sha256: meta.sha256 || null,
      media_download_status: 'downloaded',
      media_download_error: null,
      media_downloaded_at: new Date().toISOString(),
    }).eq('id', params.messageId)
    if (updateError) throw new Error(\`WhatsApp message media update failed: \${updateError.message}\`)
    return { path, mimeType, size: bytes.byteLength, alreadyStored: false }
  } catch (error: any) {
    await db.from('whatsapp_messages').update({
      media_download_status: 'failed',
      media_download_error: String(error?.message || error).slice(0, 1000),
    }).eq('id', params.messageId)
    throw error
  }
}

export async function createSignedWhatsAppMediaUrl(db: any, path: string, expiresIn = 900) {
  const cleanPath = String(path || '').trim()
  if (!cleanPath) throw new Error('WhatsApp media storage path is missing')
  const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(cleanPath, expiresIn)
  if (error || !data?.signedUrl) throw new Error(\`Could not create WhatsApp media URL: \${error?.message || 'signed URL missing'}\`)
  return data.signedUrl
}
