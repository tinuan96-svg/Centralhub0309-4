type OptimisticUpdate<T> = {
  tempId: string;
  data: T;
  timestamp: number;
  rollback?: () => void;
};

export class OptimisticUIManager<T = any> {
  private pendingUpdates: Map<string, OptimisticUpdate<T>> = new Map();
  private updateTimeout = 5000;

  add(tempId: string, data: T, rollback?: () => void): void {
    this.pendingUpdates.set(tempId, {
      tempId,
      data,
      timestamp: Date.now(),
      rollback,
    });

    setTimeout(() => {
      if (this.pendingUpdates.has(tempId)) {
        console.warn(`Optimistic update ${tempId} timed out, rolling back`);
        this.rollback(tempId);
      }
    }, this.updateTimeout);
  }

  confirm(tempId: string): void {
    this.pendingUpdates.delete(tempId);
  }

  rollback(tempId: string): void {
    const update = this.pendingUpdates.get(tempId);
    if (update?.rollback) {
      update.rollback();
    }
    this.pendingUpdates.delete(tempId);
  }

  rollbackAll(): void {
    this.pendingUpdates.forEach((update) => {
      update.rollback?.();
    });
    this.pendingUpdates.clear();
  }

  isPending(tempId: string): boolean {
    return this.pendingUpdates.has(tempId);
  }

  getPending(): T[] {
    return Array.from(this.pendingUpdates.values()).map((u) => u.data);
  }
}

export function createOptimisticUpdate<T>(
  currentData: T[],
  optimisticItem: T,
  idKey: keyof T = 'id' as keyof T
): T[] {
  return [...currentData, optimisticItem];
}

export function updateOptimisticItem<T>(
  currentData: T[],
  updatedItem: Partial<T>,
  idKey: keyof T = 'id' as keyof T
): T[] {
  return currentData.map((item) =>
    item[idKey] === updatedItem[idKey] ? { ...item, ...updatedItem } : item
  );
}

export function removeOptimisticItem<T>(
  currentData: T[],
  itemId: any,
  idKey: keyof T = 'id' as keyof T
): T[] {
  return currentData.filter((item) => item[idKey] !== itemId);
}

export function generateTempId(prefix: string = 'temp'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
