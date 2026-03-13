import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

interface MissingChurch {
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  denomination: string | null;
  latitude: number;
  longitude: number;
  tags: string[];
}

function parseAddress(address: string | null): { street: string; city: string; state: string; zip: string } {
  if (!address) {
    return { street: '', city: '', state: 'MI', zip: '' };
  }
  // Try to parse address like "2777 Knapp St NE, Grand Rapids, MI 49525, USA"
  const parts = address.split(',').map(p => p.trim());
  
  let street = parts[0] || '';
  let city = parts[1] || '';
  let stateZip = parts[2] || '';
  
  // Parse state and zip
  const stateZipMatch = stateZip.match(/([A-Z]{2})\s*(\d{5})?/);
  let state = stateZipMatch?.[1] || 'MI';
  let zip = stateZipMatch?.[2] || '';
  
  return { street, city, state, zip };
}

async function reimportMissingChurches() {
  console.log('Loading missing churches...');
  const missingPath = path.join(__dirname, 'missing-churches.json');
  
  if (!fs.existsSync(missingPath)) {
    console.error('Missing churches file not found. Run find-missing-churches.ts first.');
    return;
  }
  
  const missingChurches: MissingChurch[] = JSON.parse(fs.readFileSync(missingPath, 'utf-8'));
  console.log(`Found ${missingChurches.length} missing churches to import`);

  let imported = 0;
  let failed = 0;
  const errors: { name: string; error: string }[] = [];

  for (const church of missingChurches) {
    const parsed = parseAddress(church.address);
    
    // Create PostGIS point for location
    const locationWKT = `POINT(${church.longitude} ${church.latitude})`;
    
    try {
      // Insert the church with location in EWKT format (same as OSM ingestion)
      const { data, error } = await supabase
        .from('churches')
        .insert({
          name: church.name,
          address: parsed.street,
          city: parsed.city,
          state: parsed.state,
          zip: parsed.zip,
          phone: church.phone,
          email: church.email,
          website: church.website,
          denomination: church.denomination,
          approved: true,
          source: 'manual',
          location: `SRID=4326;POINT(${church.longitude} ${church.latitude})`,
        })
        .select('id')
        .single();

      if (error) {
        throw error;
      }

      // Setup county_fips and boundary_ids
      const { error: setupError } = await supabase.rpc('fn_setup_church_location', {
        church_id: data.id
      });

      if (setupError) {
        console.warn(`  Warning: Could not setup location data for ${church.name}: ${setupError.message}`);
      }

      imported++;
      console.log(`✅ Imported: ${church.name}`);
    } catch (err: any) {
      failed++;
      errors.push({ name: church.name, error: err.message });
      console.error(`❌ Failed: ${church.name} - ${err.message}`);
    }
  }

  console.log('\n=== IMPORT COMPLETE ===');
  console.log(`Imported: ${imported}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
}

reimportMissingChurches().catch(console.error);
