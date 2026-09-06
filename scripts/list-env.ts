import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const keys = Object.keys(process.env).filter(k =>
  k.includes('SUPABASE') || k.includes('MALLU') || k.includes('POCKET') || k.includes('KERALA')
);

console.log('Available Env Keys:');
keys.forEach(k => {
  const val = process.env[k];
  console.log(`${k}: ${val ? (val.substring(0, 10) + '...') : 'EMPTY'}`);
});
