import { redirect } from 'next/navigation';

function withSearch(path: string, values: Record<string, string | string[] | undefined> | undefined) {
  const query = new URLSearchParams();
  Object.entries(values || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach(item => query.append(key, item));
    else if (value !== undefined) query.set(key, value);
  });
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export default async function Page({ params, searchParams }: { params: any; searchParams: any }) {
  const resolvedParams = await Promise.resolve(params);
  const resolvedSearchParams = await Promise.resolve(searchParams);
  redirect(withSearch(`/inventory/brands/${encodeURIComponent(String(resolvedParams.id))}`, resolvedSearchParams));
}
