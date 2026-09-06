import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required. Never hardcode Supabase credentials in this script.');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seed() {
  console.log('--- SEEDING MARKETING PROVIDERS ---');

  const providers = [
    { id: 'meta', display_name: 'Meta (Facebook & Instagram)', category: 'social', auth_method: 'oauth2', capabilities: ['advertising', 'analytics', 'catalog', 'social_publishing', 'messaging'], icon: '📸' },
    { id: 'google', display_name: 'Google (Ads, Merchant, GA4)', category: 'search', auth_method: 'oauth2', capabilities: ['advertising', 'analytics', 'catalog', 'search_discovery'], icon: '🔍' },
    { id: 'tiktok', display_name: 'TikTok', category: 'social', auth_method: 'oauth2', capabilities: ['advertising', 'analytics', 'catalog', 'social_publishing'], icon: '🎵' },
    { id: 'youtube', display_name: 'YouTube', category: 'social', auth_method: 'oauth2', capabilities: ['analytics', 'video_publishing'], icon: '🎥' },
    { id: 'spotify', display_name: 'Spotify Ads', category: 'advertising', auth_method: 'oauth2', capabilities: ['advertising', 'analytics'], icon: '🎧' },
    { id: 'pinterest', display_name: 'Pinterest', category: 'social', auth_method: 'oauth2', capabilities: ['advertising', 'analytics', 'catalog', 'social_publishing'], icon: '📌' },
    { id: 'linkedin', display_name: 'LinkedIn', category: 'social', auth_method: 'oauth2', capabilities: ['advertising', 'analytics', 'social_publishing'], icon: '💼' },
    { id: 'microsoft', display_name: 'Microsoft Ads', category: 'search', auth_method: 'oauth2', capabilities: ['advertising', 'analytics'], icon: '💻' },
    { id: 'snapchat', display_name: 'Snapchat', category: 'social', auth_method: 'oauth2', capabilities: ['advertising', 'analytics'], icon: '👻' },
    { id: 'reddit', display_name: 'Reddit Ads', category: 'advertising', auth_method: 'oauth2', capabilities: ['advertising', 'analytics'], icon: '🤖' },
    { id: 'x', display_name: 'X (Twitter)', category: 'social', auth_method: 'oauth2', capabilities: ['advertising', 'analytics', 'social_publishing'], icon: '🐦' },
    { id: 'amazon', display_name: 'Amazon Ads', category: 'advertising', auth_method: 'oauth2', capabilities: ['advertising', 'analytics', 'catalog'], icon: '📦' },
    { id: 'mailchimp', display_name: 'Mailchimp', category: 'email', auth_method: 'oauth2', capabilities: ['email_marketing', 'audiences'], icon: '🐵' },
    { id: 'klaviyo', display_name: 'Klaviyo', category: 'email', auth_method: 'api_key', capabilities: ['email_marketing', 'audiences', 'analytics'], icon: '📧' },
    { id: 'whatsapp', display_name: 'WhatsApp Business', category: 'messaging', auth_method: 'none', capabilities: ['messaging', 'audiences'], icon: '💬' },
    { id: 'google_business', display_name: 'Google Business Profile', category: 'search', auth_method: 'oauth2', capabilities: ['search_discovery', 'local_marketing'], icon: '🏬' }
  ];

  const { error } = await supabase
    .from('marketing_providers')
    .upsert(providers, { onConflict: 'id' });

  if (error) throw error;
  console.log('Marketing Providers seeded successfully!');
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
