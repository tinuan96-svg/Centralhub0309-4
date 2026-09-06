export class StockMaskingUtils {
  static calculateDisplayStock(
    realStock: number | null,
    storeMaxDisplayStock: number
  ): number | null {
    if (realStock === null || realStock === undefined) {
      return null;
    }

    if (realStock < 5) {
      return realStock;
    }

    return Math.min(realStock, storeMaxDisplayStock);
  }

  static shouldMaskStock(realStock: number | null): boolean {
    if (realStock === null || realStock === undefined) {
      return false;
    }

    return realStock >= 5;
  }

  static getStockDisplayInfo(
    realStock: number | null,
    storeMaxDisplayStock: number
  ): {
    displayStock: number | null;
    isMasked: boolean;
    centralStock: number | null;
  } {
    const displayStock = this.calculateDisplayStock(realStock, storeMaxDisplayStock);
    const isMasked = this.shouldMaskStock(realStock) && displayStock !== realStock;

    return {
      displayStock,
      isMasked,
      centralStock: realStock,
    };
  }
}
