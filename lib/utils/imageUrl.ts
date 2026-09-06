const SUPABASE_URL = 'https://icnvrpnzjjcbvgcqgiua.supabase.co';
const BUCKET_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images/`;
const BUCKET_CLEAN_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images-clean/`;
const BUCKET_PROCESSED_BASE = `${SUPABASE_URL}/storage/v1/object/public/product-images-processed/`;

export function resolveProductImageUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return imageUrl;
  const filename = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
  return `${BUCKET_BASE}${encodeURIComponent(filename)}`;
}

/**
 * Returns ordered candidate URLs to try in sequence.
 * Processed WebP > processed JPEG > clean bucket > original.
 * The caller renders the first and uses onError to try the next.
 */
export function resolveProductImageUrlCandidates(imageUrl: string | null | undefined): string[] {
  if (!imageUrl) return [];
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return [imageUrl];

  const filename = imageUrl.startsWith('/') ? imageUrl.slice(1) : imageUrl;
  const dotIndex = filename.lastIndexOf('.');
  const base = dotIndex !== -1 ? filename.slice(0, dotIndex) : filename;

  const original = `${BUCKET_BASE}${encodeURIComponent(filename)}`;
  const cleanPng = `${BUCKET_CLEAN_BASE}${encodeURIComponent(base + '_clean.png')}`;
  const cleanWebp = `${BUCKET_CLEAN_BASE}${encodeURIComponent(base + '_clean.webp')}`;

  return [original, cleanPng, cleanWebp];
}

export function resolveGalleryImages(urls: string[] | null | undefined): string[] {
  if (!urls || urls.length === 0) return [];
  return urls.map((u) => resolveProductImageUrl(u)).filter(Boolean) as string[];
}

/** Derive WebP and JPEG URLs for a processed image stored in the processed bucket. */
export function resolveProcessedImageUrls(processedWebpUrl: string | null | undefined, fallbackUrl: string | null | undefined): {
  webp: string | null;
  jpeg: string | null;
  fallback: string | null;
} {
  return {
    webp: processedWebpUrl ?? null,
    jpeg: processedWebpUrl
      ? processedWebpUrl.replace(/format=webp/i, 'format=jpeg').replace(/\.webp(\?|$)/, '.jpg$1')
      : null,
    fallback: fallbackUrl ? resolveProductImageUrl(fallbackUrl) : null,
  };
}

/** Build Supabase image transform URL for resizing + format conversion. */
export function buildImageTransformUrl(
  sourceUrl: string,
  width: number,
  height: number,
  format: 'webp' | 'jpeg' = 'webp',
  quality = 85
): string {
  const base = sourceUrl.split('?')[0];
  return `${base}?width=${width}&height=${height}&resize=contain&format=${format}&quality=${quality}`;
}
