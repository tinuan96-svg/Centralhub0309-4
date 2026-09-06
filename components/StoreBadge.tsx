import { Store } from '@/lib/types';
import { getStoreColor, getStoreInitials, getStoreColorClasses } from '@/lib/utils/storeColors';

interface StoreBadgeProps {
  store: Store | { slug: string; name: string };
  size?: 'sm' | 'md';
}

export default function StoreBadge({ store, size = 'sm' }: StoreBadgeProps) {
  if (!store) return null;

  const color = getStoreColor(store);
  const colorClasses = getStoreColorClasses(color);

  // Custom display name mapping
  let displayName = store.name || '??';
  const lowerName = (store.name || '').toLowerCase();
  const lowerSlug = (store.slug || '').toLowerCase();

  if (lowerName.includes('malluspices') || lowerSlug.includes('mallu')) {
    displayName = 'MS';
  } else if (lowerName.includes('kerala grocery') || lowerSlug.includes('keralagroceries')) {
    displayName = 'KG';
  } else {
    // If not mapped, use initials for a cleaner look in the table
    displayName = getStoreInitials(store.name);
  }

  const sizeClasses = size === 'sm'
    ? 'px-2 py-0.5 text-[10px]'
    : 'px-3 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-md font-bold ${colorClasses.bg} ${colorClasses.text} ${sizeClasses} border ${colorClasses.border} whitespace-nowrap min-w-[2.5rem]`}
    >
      {displayName}
    </span>
  );
}
