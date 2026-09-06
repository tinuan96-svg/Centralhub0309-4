'use client';

import { useState } from 'react';
import { resolveProductImageUrlCandidates, buildImageTransformUrl } from '@/lib/utils/imageUrl';

interface ProductImageProps {
  imageUrl: string | null | undefined;
  galleryImages?: string[] | null;
  // Pre-processed outputs from the pipeline (preferred when available)
  processedWebpUrl?: string | null;
  processedJpegUrl?: string | null;
  processedThumbUrl?: string | null;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  /** Use 'thumb' for small cards, 'listing' for search results, 'main' for PDP */
  size?: 'thumb' | 'listing' | 'main';
  loading?: 'lazy' | 'eager';
}

/**
 * Renders a product image using <picture> for WebP/JPEG format selection.
 * Priority: pipeline-processed WebP > pipeline JPEG > original candidates.
 * Falls back through the candidate list on error.
 */
export default function ProductImage({
  imageUrl,
  galleryImages,
  processedWebpUrl,
  processedJpegUrl,
  processedThumbUrl,
  alt,
  className = 'w-full h-full object-cover',
  fallback,
  size = 'main',
  loading = 'lazy',
}: ProductImageProps) {
  // Resolve best WebP and JPEG sources based on size
  const webpSrc = size === 'thumb' ? (processedThumbUrl ?? processedWebpUrl ?? null)
    : size === 'listing' ? (processedWebpUrl ? buildImageTransformUrl(processedWebpUrl.split('?')[0], 800, 800, 'webp') : null)
    : processedWebpUrl ?? null;

  const jpegSrc = processedJpegUrl ?? null;

  // Build fallback candidate chain from original URL + gallery
  const buildCandidates = (): string[] => {
    const candidates: string[] = [];
    if (imageUrl) candidates.push(...resolveProductImageUrlCandidates(imageUrl));
    if (galleryImages) {
      for (const g of galleryImages) {
        if (g) candidates.push(...resolveProductImageUrlCandidates(g));
      }
    }
    return [...new Set(candidates)];
  };

  const [candidates] = useState<string[]>(buildCandidates);
  const [fallbackIndex, setFallbackIndex] = useState(0);
  const [usePipeline, setUsePipeline] = useState(!!(webpSrc || jpegSrc));
  const [allFailed, setAllFailed] = useState(false);

  const handleError = () => {
    if (usePipeline) {
      // Pipeline images failed — drop to original candidates
      setUsePipeline(false);
      return;
    }
    const next = fallbackIndex + 1;
    if (next < candidates.length) {
      setFallbackIndex(next);
    } else {
      setAllFailed(true);
    }
  };

  if (allFailed || (candidates.length === 0 && !webpSrc && !jpegSrc)) {
    return <>{fallback ?? null}</>;
  }

  // Use pipeline processed images via <picture>
  if (usePipeline && (webpSrc || jpegSrc)) {
    return (
      <picture>
        {webpSrc && <source srcSet={webpSrc} type="image/webp" />}
        {jpegSrc && <source srcSet={jpegSrc} type="image/jpeg" />}
        <img
          src={jpegSrc ?? webpSrc ?? ''}
          alt={alt}
          className={className}
          loading={loading}
          decoding="async"
          onError={handleError}
        />
      </picture>
    );
  }

  // Fallback to original candidate chain
  const currentSrc = candidates[fallbackIndex];
  if (!currentSrc) return <>{fallback ?? null}</>;

  // If source looks like it could have a WebP transform, offer it
  const isSupabaseStorage = currentSrc.includes('/storage/v1/object/public/');
  const webpTransform = isSupabaseStorage
    ? buildImageTransformUrl(currentSrc.split('?')[0], 800, 800, 'webp')
    : null;

  return (
    <picture>
      {webpTransform && <source srcSet={webpTransform} type="image/webp" />}
      <img
        src={currentSrc}
        alt={alt}
        className={className}
        loading={loading}
        decoding="async"
        onError={handleError}
      />
    </picture>
  );
}
