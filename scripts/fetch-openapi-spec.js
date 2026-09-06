const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const url = 'https://icnvrpnzjjcbvgcqgiua.supabase.co/rest/v1/';
const key = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY;

async function fetchSpec() {
  try {
    const response = await fetch(url, {
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`
      }
    });
    const spec = await response.json();
    fs.writeFileSync('openapi-spec.json', JSON.stringify(spec, null, 2));
    console.log('Spec saved to openapi-spec.json');
  } catch (error) {
    console.error('Error fetching spec:', error);
  }
}

fetchSpec();
