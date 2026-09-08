import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const baseUrl = 'https://keralagroceries.uk';
    const now = new Date().toISOString();

    const staticPages = [
      { url: '/', priority: '1.0', changefreq: 'daily' },
      { url: '/shop', priority: '0.9', changefreq: 'daily' },
      { url: '/brands', priority: '0.8', changefreq: 'weekly' },
      { url: '/offers', priority: '0.8', changefreq: 'weekly' },
      { url: '/blog', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-groceries-uk', priority: '0.9', changefreq: 'weekly' },
      { url: '/south-indian-groceries-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-rice-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-spices-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-ready-meals-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-pickles-uk', priority: '0.7', changefreq: 'weekly' },
      { url: '/buy-matta-rice-uk', priority: '0.7', changefreq: 'weekly' },
      { url: '/indian-grocery-online-uk', priority: '0.9', changefreq: 'weekly' },
      { url: '/kerala-snacks-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-spices-online-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-grocery-delivery-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/buy-kerala-rice-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/malayalam-groceries-uk', priority: '0.8', changefreq: 'weekly' },
      { url: '/kerala-dal-uk', priority: '0.7', changefreq: 'weekly' },
      { url: '/kerala-coconut-products-uk', priority: '0.7', changefreq: 'weekly' },
      { url: '/kerala-fish-curry-paste-uk', priority: '0.7', changefreq: 'weekly' },
      { url: '/about', priority: '0.7', changefreq: 'monthly' },
      { url: '/contact', priority: '0.7', changefreq: 'monthly' },
      { url: '/terms', priority: '0.5', changefreq: 'monthly' },
      { url: '/refund-policy', priority: '0.5', changefreq: 'monthly' },
      { url: '/privacy-policy', priority: '0.5', changefreq: 'monthly' },
    ];

    const [categoriesRes, productsRes, brandsRes, blogRes, seoPagesRes] = await Promise.all([
      supabase.from('categories').select('slug, updated_at').order('name'),
      supabase.from('products').select('slug, updated_at').in('status', ['approved', 'active']),
      supabase.from('brands').select('slug, updated_at').order('name'),
      supabase.from('blog_posts').select('slug, updated_at').eq('status', 'published'),
      supabase.from('seo_pages').select('slug, updated_at, page_type').eq('is_active', true).order('sort_order'),
    ]);

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    for (const page of staticPages) {
      xml += `  <url>\n    <loc>${baseUrl}${page.url}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
    }

    for (const cat of (categoriesRes.data || [])) {
      xml += `  <url>\n    <loc>${baseUrl}/category/${cat.slug}</loc>\n    <lastmod>${cat.updated_at || now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    }

    for (const brand of (brandsRes.data || [])) {
      xml += `  <url>\n    <loc>${baseUrl}/brands/${brand.slug}</loc>\n    <lastmod>${brand.updated_at || now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    }

    for (const product of (productsRes.data || [])) {
      xml += `  <url>\n    <loc>${baseUrl}/product/${product.slug}</loc>\n    <lastmod>${product.updated_at || now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    }

    for (const post of (blogRes.data || [])) {
      xml += `  <url>\n    <loc>${baseUrl}/blog/${post.slug}</loc>\n    <lastmod>${post.updated_at || now}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    }

    const locationPriority = '0.8';
    const brandPriority = '0.8';
    const keywordPriority = '0.7';

    for (const seoPage of (seoPagesRes.data || [])) {
      const priority = seoPage.page_type === 'location' ? locationPriority
        : seoPage.page_type === 'brand' ? brandPriority
        : keywordPriority;
      xml += `  <url>\n    <loc>${baseUrl}/${seoPage.slug}</loc>\n    <lastmod>${seoPage.updated_at || now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
    }

    xml += '</urlset>';

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
