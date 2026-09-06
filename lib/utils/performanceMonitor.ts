type PerformanceMetric = {
  name: string;
  duration: number;
  timestamp: number;
};

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timers: Map<string, number> = new Map();

  start(name: string) {
    this.timers.set(name, performance.now());
  }

  end(name: string) {
    const startTime = this.timers.get(name);
    if (!startTime) {
      console.warn(`Performance timer "${name}" was not started`);
      return;
    }

    const duration = performance.now() - startTime;
    this.metrics.push({
      name,
      duration,
      timestamp: Date.now(),
    });

    this.timers.delete(name);

    if (duration > 1000) {
      console.warn(`Slow operation detected: ${name} took ${duration.toFixed(2)}ms`);
    }
  }

  getMetrics() {
    return [...this.metrics];
  }

  getAverageTime(name: string) {
    const filtered = this.metrics.filter(m => m.name === name);
    if (filtered.length === 0) return 0;

    const total = filtered.reduce((sum, m) => sum + m.duration, 0);
    return total / filtered.length;
  }

  getSlowestOperations(limit: number = 10) {
    return [...this.metrics]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  clear() {
    this.metrics = [];
    this.timers.clear();
  }
}

export const performanceMonitor = new PerformanceMonitor();

export function measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
  performanceMonitor.start(name);
  return fn().finally(() => {
    performanceMonitor.end(name);
  });
}

export function measure<T>(name: string, fn: () => T): T {
  performanceMonitor.start(name);
  try {
    return fn();
  } finally {
    performanceMonitor.end(name);
  }
}
