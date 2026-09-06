export class StockSyncService {
  /**
   * @deprecated Legacy app-level sync. Propagation is now handled by database store webhook triggers.
   */
  static async syncStockToAllWebsites(productId: string, _availableStock: number): Promise<void> {
    // Propagation handled by DB triggers
  }

  /**
   * @deprecated Legacy app-level sync. Propagation is now handled by database store webhook triggers.
   */
  static async syncProductToAllWebsites(product: any): Promise<void> {
    // Propagation handled by DB triggers
  }
}
