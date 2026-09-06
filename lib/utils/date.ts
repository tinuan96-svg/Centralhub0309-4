import { TimeRange, ComparisonType } from '../store/dashboardFilterStore';

export function getDateRange(range: TimeRange, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start = new Date();
  switch (range) {
    case 'today':  start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0); break;
    case '7days':  start = new Date(now.getTime() - 7 * 86400000); start.setHours(0,0,0,0); break;
    case '30days': start = new Date(now.getTime() - 30 * 86400000); start.setHours(0,0,0,0); break;
    case 'month':  start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0); break;
    case 'year':   start = new Date(now.getFullYear(), 0, 1, 0, 0, 0); break;
    case 'custom':
      if (customStart && customEnd) {
        const s = new Date(customStart); s.setHours(0,0,0,0);
        const e = new Date(customEnd); e.setHours(23,59,59,999);
        return { start: s, end: e };
      }
      start = new Date(now.getTime() - 30 * 86400000);
  }
  return { start, end };
}

export function getComparisonDateRange(s: Date, e: Date, cType: ComparisonType) {
  if (cType === 'none') return { start: s, end: e };
  const dur = e.getTime() - s.getTime();
  if (cType === 'previous') {
    const end = new Date(s.getTime() - 1);
    return { start: new Date(end.getTime() - dur), end };
  }
  const cs = new Date(s); cs.setFullYear(cs.getFullYear() - 1);
  const ce = new Date(e); ce.setFullYear(ce.getFullYear() - 1);
  return { start: cs, end: ce };
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString();
}
