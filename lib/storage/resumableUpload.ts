'use client';

import { supabase } from '@/lib/supabase';

const TUS_VERSION = '1.0.0';
const CHUNK_SIZE = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];
const RESUME_TTL_MS = 23 * 60 * 60 * 1000;

type ResumeRecord = {
  uploadUrl: string;
  expiresAt: number;
};

export type ResumableUploadProgress = {
  bytesUploaded: number;
  bytesTotal: number;
  percent: number;
  resumed: boolean;
};

export type ResumableUploadOptions = {
  bucket: string;
  objectPath: string;
  file: File;
  contentType?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ResumableUploadProgress) => void;
};

function encodeMetadata(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function storageEndpoint() {
  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!configuredUrl) throw new Error('CentralHub Supabase URL is not configured.');
  const url = new URL(configuredUrl);
  const projectRef = url.hostname.split('.')[0];
  if (!projectRef) throw new Error('CentralHub Supabase project reference could not be resolved.');
  return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
}

function resumeKey(bucket: string, objectPath: string, file: File) {
  return `centralhub:tus:${bucket}:${objectPath}:${file.size}:${file.lastModified}`;
}

function readResumeRecord(key: string): ResumeRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResumeRecord;
    if (!parsed.uploadUrl || !parsed.expiresAt || parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
}

function writeResumeRecord(key: string, uploadUrl: string) {
  if (typeof window === 'undefined') return;
  const record: ResumeRecord = { uploadUrl, expiresAt: Date.now() + RESUME_TTL_MS };
  window.localStorage.setItem(key, JSON.stringify(record));
}

function clearResumeRecord(key: string) {
  if (typeof window !== 'undefined') window.localStorage.removeItem(key);
}

async function sessionToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message || 'Could not read the current CentralHub session.');
  const token = data.session?.access_token;
  if (!token) throw new Error('Your CentralHub session has expired. Sign in again before uploading an app release.');
  return token;
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    'Tus-Resumable': TUS_VERSION,
  };
}

async function createUpload(options: ResumableUploadOptions, token: string) {
  const { bucket, objectPath, file } = options;
  const metadata = [
    `bucketName ${encodeMetadata(bucket)}`,
    `objectName ${encodeMetadata(objectPath)}`,
    `contentType ${encodeMetadata(options.contentType || file.type || 'application/octet-stream')}`,
    `cacheControl ${encodeMetadata('3600')}`,
  ].join(',');

  const response = await fetch(storageEndpoint(), {
    method: 'POST',
    headers: {
      ...authHeaders(token),
      'Upload-Length': String(file.size),
      'Upload-Metadata': metadata,
    },
    signal: options.signal,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Could not start the resumable upload (${response.status})${detail ? `: ${detail.slice(0, 240)}` : ''}`);
  }

  const location = response.headers.get('Location');
  if (!location) throw new Error('Supabase Storage did not return a resumable upload URL.');
  return new URL(location, storageEndpoint()).toString();
}

async function readOffset(uploadUrl: string, token: string, signal?: AbortSignal) {
  const response = await fetch(uploadUrl, {
    method: 'HEAD',
    headers: authHeaders(token),
    signal,
  });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`Could not resume the release upload (${response.status}).`);
  const offset = Number(response.headers.get('Upload-Offset') || '0');
  if (!Number.isFinite(offset) || offset < 0) throw new Error('Supabase Storage returned an invalid resumable upload offset.');
  return offset;
}

function wait(ms: number, signal?: AbortSignal) {
  if (!ms) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer);
      reject(new DOMException('Upload aborted', 'AbortError'));
    }, { once: true });
  });
}

export async function uploadReleaseArtifactResumable(options: ResumableUploadOptions) {
  const { bucket, objectPath, file, signal, onProgress } = options;
  if (!file.size) throw new Error('The selected release file is empty.');

  const token = await sessionToken();
  const key = resumeKey(bucket, objectPath, file);
  let uploadUrl = readResumeRecord(key)?.uploadUrl || '';
  let offset = 0;
  let resumed = false;

  if (uploadUrl) {
    try {
      const remoteOffset = await readOffset(uploadUrl, token, signal);
      if (remoteOffset == null || remoteOffset > file.size) {
        clearResumeRecord(key);
        uploadUrl = '';
      } else {
        offset = remoteOffset;
        resumed = offset > 0;
      }
    } catch {
      clearResumeRecord(key);
      uploadUrl = '';
      offset = 0;
    }
  }

  if (!uploadUrl) {
    uploadUrl = await createUpload(options, token);
    writeResumeRecord(key, uploadUrl);
  }

  const report = () => onProgress?.({
    bytesUploaded: offset,
    bytesTotal: file.size,
    percent: Math.min(100, Math.round((offset / file.size) * 1000) / 10),
    resumed,
  });
  report();

  let retries = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);

    try {
      const response = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          ...authHeaders(token),
          'Content-Type': 'application/offset+octet-stream',
          'Upload-Offset': String(offset),
        },
        body: chunk,
        signal,
      });

      if (response.status === 404 || response.status === 410) {
        clearResumeRecord(key);
        uploadUrl = await createUpload(options, token);
        writeResumeRecord(key, uploadUrl);
        offset = 0;
        resumed = false;
        retries = 0;
        report();
        continue;
      }
      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        throw new Error(`Chunk upload failed (${response.status})${detail ? `: ${detail.slice(0, 180)}` : ''}`);
      }

      const nextOffset = Number(response.headers.get('Upload-Offset') || end);
      offset = Number.isFinite(nextOffset) && nextOffset >= offset ? nextOffset : end;
      retries = 0;
      report();
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) throw error;
      if (retries >= RETRY_DELAYS.length) {
        throw new Error(`Release upload was interrupted after automatic retries. Select the same file and press Upload & Stage Release again to resume. ${error instanceof Error ? error.message : ''}`.trim());
      }

      await wait(RETRY_DELAYS[retries], signal);
      retries += 1;
      const remoteOffset = await readOffset(uploadUrl, token, signal).catch(() => null);
      if (remoteOffset == null) {
        clearResumeRecord(key);
        uploadUrl = await createUpload(options, token);
        writeResumeRecord(key, uploadUrl);
        offset = 0;
        resumed = false;
      } else {
        offset = Math.min(remoteOffset, file.size);
        resumed = resumed || offset > 0;
      }
      report();
    }
  }

  clearResumeRecord(key);
  report();
  return { uploadUrl, bytesUploaded: offset, resumed };
}
