// Coalesce change bursts and serialize reads. Operational writes never run here.
export function createRefreshQueue(run: () => Promise<void>, options: {
  enabled?: () => boolean;
  delay?: number;
  schedule?: (callback: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
} = {}) {
  const schedule = options.schedule || ((fn, delay) => setTimeout(fn, delay));
  const cancel = options.cancel || (timer => clearTimeout(timer as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let running = false;
  let pending = false;
  let disposed = false;
  const enabled = () => !disposed && (options.enabled?.() ?? true);
  const flush = async () => {
    timer = null;
    if (!enabled() || running || !pending) return;
    pending = false; running = true;
    try { await run(); } finally {
      running = false;
      if (pending && enabled()) request();
    }
  };
  const request = (delay = options.delay ?? 750) => {
    if (disposed) return;
    pending = true;
    if (enabled() && !running && timer === null) timer = schedule(() => { void flush(); }, delay);
  };
  return {
    request,
    dispose() { disposed = true; pending = false; if (timer !== null) cancel(timer); timer = null; },
  };
}

export function metricTileSpan(height: number, row: number, gap: number) {
  return Math.max(1, Math.ceil((height + gap) / (row + gap)));
}
