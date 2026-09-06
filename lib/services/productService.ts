import { supabase } from '../supabase';
import { Product, ResolvedProduct } from '../types';

/** Central product master service. Store-scoped reads must always receive an explicit store id. */
export class ProductService {
  private static readonly PRODUCT_COLUMNS = new Set([
    'name', 'price', 'product_type', 'brand', 'warehouse_location', 'weight', 'gtin', 'unit', 'centralhub_product_id', 'slug', 'main_category', 'sub_category', 'tax_rate', 'cost_price', 'department', 'category', 'subcategory', 'weight_kg', 'weight_grams', 'sku', 'backorder', 'pack_size', 'pack_unit', 'reorder_frequency', 'expiry_date', 'reorder_level', 'is_active', 'image_url', 'image_main', 'gallery_images', 'description', 'original_price', 'profit_margin_percent', 'is_deal', 'allow_backorder', 'seo_title', 'seo_meta_description', 'source_product_id', 'sync_status', 'approval_status', 'approved_at', 'synced_at', 'sale_price', 'is_published', 'is_archived', 'brand_id', 'tags', 'custom_attributes', 'is_deleted', 'category_id', 'enable_stock_tracking', 'storage_type', 'vat_rate', 'seo_meta_title', 'admin_notes', 'rich_description', 'length_cm', 'width_cm', 'height_cm', 'parent_product_id', 'variant_group_key', 'min_margin', 'target_margin', 'short_description', 'selling_price', 'discount_percentage', 'enhanced_image_url', 'image_medium', 'image_thumbnail', 'source_brand', 'stock_status', 'is_bestseller', 'is_featured', 'is_new_arrival', 'is_hot_product', 'hot_product_expires_at', 'sold_count', 'markup_percentage',
  ]);
  private static sanitize(data: Record<string, any>) { return Object.fromEntries(Object.entries(data).filter(([key]) => this.PRODUCT_COLUMNS.has(key))); }

  static async getAllProducts(): Promise<Product[]> {
    const { data, error } = await supabase.from('products').select('*').order('name');
    if (error) { console.error('Error fetching products:', error); return []; }
    return (data || []) as Product[];
  }

  static async getProductsForStore(storeId: string): Promise<Product[]> {
    const id = String(storeId || '').trim();
    if (!id) return [];
    const { data, error } = await supabase.from('products').select('*').eq('store_id', id).order('name');
    if (error) { console.error('Error fetching store products:', error); return []; }
    return (data || []) as Product[];
  }

  static async getProductById(productId: string): Promise<ResolvedProduct | null> {
    const { data, error } = await supabase.from('products').select('*').eq('id', productId).or('is_deleted.is.null,is_deleted.eq.false').maybeSingle();
    if (error || !data) { if (error) console.error('Error fetching product:', error); return null; }
    return { ...(data as any), id: data.id, product_id: data.id, description: data.description ?? '', is_active: data.is_active ?? true, base_stock: data.stock ?? 0 } as ResolvedProduct;
  }

  static async createProduct(productData: Record<string, any>) {
    if (!productData.name?.trim()) throw new Error('Product name is required');
    if (!Number.isFinite(Number(productData.price)) || Number(productData.price) <= 0) throw new Error('Price must be a valid number greater than 0');
    const payload = this.sanitize({ ...productData, name: productData.name.trim(), description: productData.description ?? null, image_url: productData.image_url || null, gallery_images: productData.gallery_images ?? [], category_id: productData.category_id || null, allow_backorder: productData.allow_backorder ?? false });
    const { data, error } = await supabase.from('products').insert(payload).select().single();
    if (error) { console.error('Error creating product:', error); throw new Error(error.message || 'Failed to create product'); }
    return data as Product;
  }

  static async updateProduct(productId: string, productData: Record<string, any>) {
    if (productData.price !== undefined && (!Number.isFinite(Number(productData.price)) || Number(productData.price) <= 0)) throw new Error('Price must be a valid number greater than 0');
    if (productData.name !== undefined && !String(productData.name).trim()) throw new Error('Product name cannot be empty');
    const payload = this.sanitize(productData); payload.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('products').update(payload).eq('id', productId).select().single();
    if (error) { console.error('Error updating product:', error); throw new Error(error.message || 'Failed to update product'); }
    return data as Product;
  }
}
