'use client';

import { useEffect, useState } from 'react';
import type { WhatsAppMessage } from '@/lib/types';
import { whatsappService } from '@/lib/services/customer-care/whatsappService';

const MEDIA_TYPES = new Set(['image', 'document', 'audio', 'video', 'sticker']);

function fallbackText(message: WhatsAppMessage) {
  return message.message_text || `[${String(message.message_type).toUpperCase()}]`;
}

export default function WhatsAppMessageContent({ message }: { message: WhatsAppMessage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(message.media_filename || null);
  const [caption, setCaption] = useState<string | null>(message.media_caption || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!MEDIA_TYPES.has(message.message_type) || (!message.media_id && !message.media_url && !message.media_storage_path)) {
      return () => {
        cancelled = true;
      };
    }

    setLoading(true);
    setError(null);
    whatsappService.getMediaUrl(message.id)
      .then((data: any) => {
        if (cancelled) return;
        setUrl(data?.url || null);
        setFilename(data?.filename || message.media_filename || null);
        setCaption(data?.caption || message.media_caption || null);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err?.message || 'Media unavailable');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    message.id,
    message.message_type,
    message.media_id,
    message.media_url,
    message.media_storage_path,
    message.media_filename,
    message.media_caption,
  ]);

  const textCaption = caption || (
    message.message_text && !/^\[[A-Z]+\]$/.test(message.message_text)
      ? message.message_text
      : null
  );

  if (!MEDIA_TYPES.has(message.message_type)) {
    return <div className="text-sm leading-5 whitespace-pre-wrap break-words">{fallbackText(message)}</div>;
  }

  if (message.message_type === 'image' || message.message_type === 'sticker') {
    return (
      <div className="space-y-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img
              src={url}
              alt={textCaption || 'Customer image'}
              loading="lazy"
              className="max-h-80 max-w-full rounded-xl object-contain bg-slate-900"
            />
          </a>
        ) : (
          <div className="rounded-xl border border-slate-700 px-3 py-4 text-xs text-slate-400">
            {loading ? 'Loading image…' : error || 'Image unavailable'}
          </div>
        )}
        {textCaption && <p className="text-sm whitespace-pre-wrap break-words">{textCaption}</p>}
      </div>
    );
  }

  if (message.message_type === 'document') {
    return (
      <div className="space-y-1">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg bg-slate-900/70 px-3 py-2 text-sm underline">
            📎 {filename || 'Open document'}
          </a>
        ) : (
          <span className="text-sm text-slate-400">{loading ? 'Loading document…' : error || 'Document unavailable'}</span>
        )}
        {textCaption && <p className="text-sm whitespace-pre-wrap break-words">{textCaption}</p>}
      </div>
    );
  }

  if (message.message_type === 'audio') {
    return url
      ? <audio controls src={url} className="max-w-full" />
      : <span className="text-sm text-slate-400">{loading ? 'Loading audio…' : error || 'Audio unavailable'}</span>;
  }

  if (message.message_type === 'video') {
    return url
      ? <video controls src={url} className="max-h-80 max-w-full rounded-xl" />
      : <span className="text-sm text-slate-400">{loading ? 'Loading video…' : error || 'Video unavailable'}</span>;
  }

  return <div className="text-sm leading-5 whitespace-pre-wrap break-words">{fallbackText(message)}</div>;
}
