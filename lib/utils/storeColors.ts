import { Store } from '../types';

export type StoreColor = 'green' | 'blue' | 'gray' | 'cyan' | 'amber' | 'purple' | 'rose' | 'indigo';

export function getStoreColor(store: Store | { slug: string; name: string }): StoreColor {
  if (!store || (!store.slug && !store.name)) return 'gray';

  const slug = (store.slug || '').toLowerCase();
  const name = (store.name || '').toLowerCase();

  if (slug.includes('kerala') || name.includes('kerala')) return 'green';
  if (slug.includes('pocket') || name.includes('pocket')) return 'blue';
  if (slug.includes('mallu') || name.includes('mallu')) return 'cyan';
  if (slug.includes('source4') || name.includes('source4')) return 'purple';

  return 'gray';
}

export function getStoreInitials(storeName: string): string {
  const name = storeName.toLowerCase();
  if (name.includes('malluspices')) return 'MS';
  if (name.includes('source3')) return 'KG';

  const words = storeName.split(/(?=[A-Z])|[\s-_]/);
  return words
    .filter(word => word.length > 0)
    .map(word => word[0].toUpperCase())
    .join('')
    .slice(0, 2);
}

export function getStoreColorClasses(color: StoreColor): {
  bg: string;
  text: string;
  border: string;
} {
  switch (color) {
    case 'green':
      return { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' };
    case 'blue':
      return { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' };
    case 'cyan':
      return { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30' };
    case 'amber':
      return { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30' };
    case 'purple':
      return { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30' };
    case 'rose':
      return { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30' };
    case 'indigo':
      return { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30' };
    default:
      return { bg: 'bg-slate-800', text: 'text-slate-300', border: 'border-slate-700' };
  }
}
