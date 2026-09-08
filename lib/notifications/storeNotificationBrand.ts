export type StoreNotificationBrand = {
  slug: string;
  name: string;
  webIcon: string;
  nativeIcon: string;
};

const STORE_NOTIFICATION_BRANDS: Record<string, StoreNotificationBrand> = {
  malluspices: {
    slug: 'malluspices',
    name: 'MalluSpices',
    webIcon: '/notification-logos/malluspices.svg',
    nativeIcon: 'ic_store_malluspices',
  },
  keralagrocery: {
    slug: 'keralagrocery',
    name: 'KeralaGrocery',
    webIcon: '/notification-logos/keralagrocery.svg',
    nativeIcon: 'ic_store_keralagrocery',
  },
  pocketgrocery: {
    slug: 'pocketgrocery',
    name: 'PocketGrocery',
    webIcon: '/notification-logos/pocketgrocery.svg',
    nativeIcon: 'ic_store_pocketgrocery',
  },
  tamilretail: {
    slug: 'tamilretail',
    name: 'TamilRetail',
    webIcon: '/notification-logos/tamilretail.svg',
    nativeIcon: 'ic_store_tamilretail',
  },
};

export function normalizeNotificationStoreSlug(value?: string | null) {
  const slug = String(value || '').trim().toLowerCase();
  if (!slug) return '';
  if (slug === 'keralagroceries' || slug === 'keralagrocery.com') return 'keralagrocery';
  if (slug === 'tamilretail.com') return 'tamilretail';
  return slug;
}

export function getStoreNotificationBrand(
  storeSlug?: string | null,
  storeName?: string | null,
): StoreNotificationBrand {
  const normalizedSlug = normalizeNotificationStoreSlug(storeSlug);
  const knownBrand = STORE_NOTIFICATION_BRANDS[normalizedSlug];

  if (knownBrand) {
    return {
      ...knownBrand,
      name: String(storeName || '').trim() || knownBrand.name,
    };
  }

  return {
    slug: normalizedSlug || 'centralhub',
    name: String(storeName || '').trim() || 'CentralHub',
    webIcon: '/app-icon.svg',
    nativeIcon: 'ic_launcher',
  };
}
