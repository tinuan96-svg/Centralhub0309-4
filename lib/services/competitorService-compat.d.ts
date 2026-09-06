import '@/lib/services/competitorService';
import '@/lib/services/productService';

declare module '@/lib/services/competitorService' {
  interface PriceSuggestion {
    decision_reason?: string | null;
    competitive_target_price?: number | null;
    required_profit_price?: number | null;
    final_price?: number | null;
  }
  interface CompetitorService {
    getAllPrices(...args: any[]): Promise<CompetitorPrice[]>;
    getCatalogItems(...args: any[]): Promise<CatalogItem[]>;
  }
}

declare module '@/lib/services/productService' {
  interface ProductService {
    getAllProducts(...args: any[]): Promise<import('@/lib/types').Product[]>;
  }
}
