import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import Papa from 'papaparse';

dotenv.config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.CENTRALHUB_SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase URL or Service Role Key missing');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
  const csvPath = 'C:/Users/sruth/Downloads/DashboardSummary.csv';

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    return;
  }

  const csvFile = fs.readFileSync(csvPath, 'utf8');
  const results = Papa.parse(csvFile, {
    header: true,
    skipEmptyLines: true,
  });

  console.log(`Parsed ${results.data.length} rows from CSV.`);

  // Get default sender profile
  const { data: senderProfile } = await supabase
    .from('sender_profiles')
    .select('*')
    .eq('is_default', true)
    .maybeSingle();

  if (!senderProfile) {
    console.error('Default sender profile not found. Please create one first.');
    return;
  }

  const stats = {
    total: results.data.length,
    success: 0,
    failed: 0,
    linkedOrders: 0
  };

  for (const row of results.data as any[]) {
    try {
      const trackingNumber = row['Shipment number'];
      if (!trackingNumber) continue;

      // Try to find matching order
      let orderId = null;
      const customerRef = row['Customer reference'];
      if (customerRef) {
        const { data: order } = await supabase
          .from('orders')
          .select('id')
          .eq('order_number', customerRef)
          .maybeSingle();

        if (order) {
          orderId = order.id;
          stats.linkedOrders++;
        }
      }

      // Map status
      const rawStatus = (row['Status'] || '').toLowerCase();
      let dbStatus = 'label_created';
      if (rawStatus.includes('delivered')) dbStatus = 'delivered';
      else if (rawStatus.includes('transit')) dbStatus = 'in_transit';
      else if (rawStatus.includes('collected')) dbStatus = 'collected';

      // Parse date: 01/06/2026
      const parts = (row['Dispatch date'] || '').split('/');
      let createdAt = new Date().toISOString();
      if (parts.length === 3) {
        createdAt = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString();
      }

      const weightKg = parseFloat(row['Weight'] || '1');

      const shipmentData = {
        order_id: orderId,
        carrier: 'dhl',
        service_type: 'standard',
        tracking_number: trackingNumber,
        shipment_number: `IMP-${trackingNumber}`,
        status: dbStatus,
        shipping_cost: 0, // Not provided in CSV
        weight_grams: Math.round(weightKg * 1000),
        sender_name: senderProfile.company_name,
        sender_address: senderProfile.address_line1,
        sender_city: senderProfile.city,
        sender_postcode: senderProfile.postcode,
        sender_phone: senderProfile.phone,
        recipient_name: row['Business/Recipient name'] || 'Unknown',
        recipient_address: 'Imported from DHL',
        recipient_city: 'Imported',
        recipient_postcode: row['Postal Code'] || '',
        recipient_phone: row['Contact number'] || '',
        created_at: createdAt,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('shipments')
        .upsert(shipmentData, { onConflict: 'tracking_number' });

      if (error) {
        console.error(`Failed to import ${trackingNumber}:`, error.message);
        stats.failed++;
      } else {
        stats.success++;
      }
    } catch (e: any) {
      console.error('Error processing row:', e.message);
      stats.failed++;
    }
  }

  console.log('Import Complete!');
  console.log(`Total: ${stats.total}`);
  console.log(`Success: ${stats.success}`);
  console.log(`Failed: ${stats.failed}`);
  console.log(`Linked to Orders: ${stats.linkedOrders}`);
}

run().catch(console.error);
