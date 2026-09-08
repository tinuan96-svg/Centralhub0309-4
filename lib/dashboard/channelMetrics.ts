// Display-only summaries of imported rows. Missing fields never become a measured zero.
export type ImportedMetric = Record<string, unknown>;
export function metricTotal(rows: ImportedMetric[], field: string): number | null {
  if (!rows.length) return null;
  let total = 0;
  for (const row of rows) {
    if (row[field] == null || row[field] === '' || !Number.isFinite(Number(row[field]))) return null;
    total += Number(row[field]);
  }
  return Number.isFinite(total) ? total : null;
}
export function metricRate(numerator: number | null, denominator: number | null, scale = 100): number | null {
  return numerator !== null && denominator !== null && denominator > 0 && Number.isFinite(numerator) && Number.isFinite(denominator) ? numerator / denominator * scale : null;
}
export function metricGroups(rows: ImportedMetric[], group: string, field: string) {
  const groups = new Map<string, number | null>();
  for (const row of rows) {
    const label = String(row[group] || 'Unknown');
    const previous = groups.has(label) ? groups.get(label)! : 0;
    const next = metricTotal([row], field);
    groups.set(label, previous === null || next === null || !Number.isFinite(previous + next) ? null : previous + next);
  }
  return [...groups].map(([label, value]) => ({ label, value }));
}
