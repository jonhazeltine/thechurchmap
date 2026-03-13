import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';

const router = Router();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ChurchImportData {
  name: string;
  address: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  denomination: string | null;
  latitude: number;
  longitude: number;
  tags: string[];
}

// Parse address string into components (reused from Google Places logic)
function parseAddress(formattedAddress: string | undefined): { city: string; state: string; zip: string } {
  if (!formattedAddress) {
    return { city: '', state: '', zip: '' };
  }
  
  const parts = formattedAddress.split(',').map(p => p.trim());
  let city = '';
  let state = '';
  let zip = '';
  
  if (parts.length >= 2) {
    // For US addresses: "123 Main St, City, ST 12345, USA"
    city = parts[parts.length - 3] || parts[0] || '';
    const stateZip = parts[parts.length - 2] || '';
    const stateZipMatch = stateZip.match(/([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/);
    if (stateZipMatch) {
      state = stateZipMatch[1] || '';
      zip = stateZipMatch[2] || '';
    } else {
      state = stateZip;
    }
  }
  
  return { city, state, zip };
}

// Validate that city/state don't look like street addresses
function validateAddressFields(city: string | null | undefined, state: string | null | undefined): boolean {
  const streetPatterns = /\b(road|street|avenue|ave|drive|dr|lane|ln|way|court|ct|boulevard|blvd|circle|cir|place|pl|highway|hwy)\b/i;
  if (city && streetPatterns.test(city)) return false;
  if (state && (streetPatterns.test(state) || (state.length > 2 && !/^[A-Za-z\s]+$/.test(state)))) return false;
  return true;
}

router.post('/api/churches/bulk-import', async (req, res) => {
  try {
    const churches: ChurchImportData[] = req.body.churches;
    
    if (!Array.isArray(churches)) {
      return res.status(400).json({ error: 'Expected array of churches' });
    }
    
    console.log(`Starting bulk import of ${churches.length} churches...`);
    
    // Step 1: Delete all existing churches (cascade will delete areas too)
    console.log('Deleting existing churches and areas...');
    const { error: deleteError } = await supabase
      .from('churches')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
    
    if (deleteError) {
      console.error('Delete error:', deleteError);
      return res.status(500).json({ error: 'Failed to delete existing churches', details: deleteError });
    }
    
    // Step 2: Prepare church data for insert with address parsing
    console.log('Preparing church data...');
    const churchRecords = churches.map(c => {
      // Use provided city/state/zip if valid, otherwise parse from address
      let city = c.city || '';
      let state = c.state || '';
      let zip = c.zip || '';
      
      // If city/state look like street addresses, re-parse from address
      if (!validateAddressFields(city, state)) {
        console.log(`[Import] Invalid city/state for "${c.name}", parsing from address`);
        const parsed = parseAddress(c.address || undefined);
        city = parsed.city;
        state = parsed.state;
        zip = parsed.zip || zip;
      }
      
      // If still no city/state, try to parse from address
      if (!city && !state && c.address) {
        const parsed = parseAddress(c.address);
        city = parsed.city;
        state = parsed.state;
        zip = parsed.zip || zip;
      }
      
      return {
        name: c.name,
        address: c.address,
        city: city || null,
        state: state || null,
        zip: zip || null,
        phone: c.phone,
        email: c.email,
        website: c.website,
        denomination: c.denomination,
        location: `POINT(${c.longitude} ${c.latitude})`, // PostGIS point
        collab_have: c.tags || [],
        collab_need: [],
        calling_ids: []
      };
    });
    
    // Step 3: Insert churches in batches (Supabase has 1000 row limit)
    console.log('Inserting churches in batches...');
    const batchSize = 500;
    const inserted: any[] = [];
    
    for (let i = 0; i < churchRecords.length; i += batchSize) {
      const batch = churchRecords.slice(i, i + batchSize);
      console.log(`Inserting batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(churchRecords.length/batchSize)}...`);
      
      const { data, error } = await supabase
        .from('churches')
        .insert(batch)
        .select('id, name, location');
      
      if (error) {
        console.error('Insert error:', error);
        return res.status(500).json({ error: 'Failed to insert churches', details: error });
      }
      
      inserted.push(...(data || []));
    }
    
    console.log(`Inserted ${inserted.length} churches`);
    
    // Step 4: Attach boundaries using PostGIS spatial join
    console.log('Attaching boundaries via spatial join...');
    
    // Use a SQL query to update churches with matching boundary IDs
    const { data: matchData, error: matchError } = await supabase.rpc('attach_boundaries_to_churches');
    
    if (matchError) {
      console.warn('Boundary attachment warning:', matchError);
      // Don't fail the whole import if boundary matching fails
    } else {
      console.log('Boundaries attached successfully');
    }
    
    res.json({
      success: true,
      imported: inserted.length,
      deleted: 'all existing churches and areas',
      boundaries_attached: matchData || 'unknown'
    });
    
  } catch (error) {
    console.error('Bulk import error:', error);
    res.status(500).json({ error: 'Internal server error', details: String(error) });
  }
});

export default router;
